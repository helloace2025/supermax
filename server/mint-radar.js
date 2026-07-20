/**
 * ROBIN NFT Radar (Robinhood Chain)
 * Polls Blockscout advanced-filters, keeps sliding-window aggregates.
 *
 * HTTP: prefer undici ProxyAgent when HTTPS_PROXY/HTTP_PROXY is set (local Clash
 * without TUN). Falls back to global fetch on Railway/public networks.
 *
 * Minted-out archive: once a collection is detected as sold out it is kept in
 * memory + JSON file (DATA_DIR) so it does not disappear when mint events age out.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ProxyAgent, fetch as undiciFetch } from "undici";

/** API base (public explorer or PRO gateway e.g. https://api.blockscout.com/4663) */
const BLOCKSCOUT_API = (
  process.env.BLOCKSCOUT_BASE || "https://robinhoodchain.blockscout.com"
).replace(/\/$/, "");
/** Human-facing explorer links always point at the public UI */
const EXPLORER =
  process.env.EXPLORER_BASE || "https://robinhoodchain.blockscout.com";
const BLOCKSCOUT_API_KEY = process.env.BLOCKSCOUT_API_KEY || "";
const ZERO = "0x0000000000000000000000000000000000000000";
/** OpenSea chain slug for Robinhood Chain (chainId 4663) */
const OPENSEA_CHAIN = process.env.OPENSEA_CHAIN || "robinhood";
const CHAIN_ID = Number(process.env.CHAIN_ID) || 4663;

function openSeaApiKey() {
  // Prefer OPENSEA_API_KEY; accept OPENSEA_KEY alias (common misconfig on Railway)
  return (
    process.env.OPENSEA_API_KEY ||
    process.env.OPENSEA_KEY ||
    ""
  ).trim();
}

/** Public: whether OpenSea REST (meta + trade volume) can run */
export function hasOpenSeaApiKey() {
  return Boolean(openSeaApiKey());
}

/** @deprecated alias — keep internal code readable */
const BLOCKSCOUT = BLOCKSCOUT_API;

if (typeof globalThis.fetch !== "function") {
  throw new Error("Node 18+ required (global fetch missing)");
}

if (BLOCKSCOUT_API_KEY) {
  console.log(`[mint-radar] Blockscout API key enabled`);
}

/** Local Clash etc. — Node global fetch ignores proxy env; undici does not. */
function proxyUrl() {
  return (
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy ||
    ""
  ).trim();
}

/** @type {import("undici").ProxyAgent | null | undefined} */
let proxyAgent = undefined;
/** @type {string} */
let proxyAgentUrl = "";

function getProxyAgent() {
  const url = proxyUrl();
  if (!url) {
    proxyAgent = null;
    proxyAgentUrl = "";
    return null;
  }
  if (proxyAgent !== undefined && proxyAgentUrl === url) return proxyAgent;
  try {
    proxyAgent = new ProxyAgent(url);
    proxyAgentUrl = url;
    console.log(`[mint-radar] outbound HTTP via proxy ${url}`);
  } catch (e) {
    console.warn(
      `[mint-radar] proxy init failed (${url}):`,
      e?.message || e
    );
    proxyAgent = null;
    proxyAgentUrl = url;
  }
  return proxyAgent;
}

/** Fetch Blockscout / OpenSea with optional proxy (lazy so .env proxy works) */
function bsFetch(url, init = {}) {
  const agent = getProxyAgent();
  if (agent) {
    return undiciFetch(url, { ...init, dispatcher: agent });
  }
  return globalThis.fetch(url, init);
}

function formatFetchError(err) {
  const msg = err?.message || String(err);
  const cause = err?.cause;
  if (!cause) return msg;
  const cMsg = cause.code || cause.message || String(cause);
  return cMsg && !msg.includes(cMsg) ? `${msg} (${cMsg})` : msg;
}

/** LP / non-collection NFT contracts to ignore */
const BLACKLIST = new Set(
  [
    "0x58daec3116aae6D93017bAAea7749052E8a04fA7", // Uniswap v4 Positions
    "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3", // Uniswap V3 Positions
  ].map((a) => a.toLowerCase())
);

/** Name/symbol heuristics for junk airdrops */
const JUNK_RE =
  /gift|claim|airdrop|alert|reward|free\s*nft|scan\s*link|important/i;

/**
 * Vote-escrow / governance / lock-position "NFTs" — not collectible mints.
 * There is no ERC standard flag; name/symbol/method heuristics + absurd supply.
 * Examples: veNFT, VotingEscrow, ve-TOKEN locks (Velodrome-style).
 */
const VE_OR_GOV_NFT_RE =
  /\bve[\s_-]?nft\b|\bvoting[\s_-]?escrow\b|\bvote[\s_-]?escrow\b|\bvote[\s_-]?lock\b|\bescrow[\s_-]?nft\b|\blocked[\s_-]?nft\b|\bgovernance[\s_-]?(lock|nft|position)\b|\bve-token\b|\bvelodrome\b|\baerodrome\b|\bsolidly\b|\bcurve[\s_-]?lock\b/i;

/** Method names typical of ve / lock position mints (not public collection mint) */
const VE_OR_GOV_METHOD_RE =
  /create_?lock|increase_?(amount|unlock_?time)|merge(_?nft)?|split(_?nft)?|deposit_?for|withdraw(_?nft)?|checkpoint/i;

/** Sliding store: 1h windows only need ~1k–1.5k events; lower cap = lower RSS */
const MAX_EVENTS = Math.max(
  400,
  Math.min(3000, Number(process.env.MAX_EVENTS) || 1500)
);
/** Sticky minted-out history (survives event eviction; file survives restarts if volume set) */
const __radarDir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__radarDir, "..", "data");
const MINTED_OUT_FILE = path.join(DATA_DIR, "minted-out.json");
/** Cap sticky archive so overnight growth cannot OOM Railway hobby RAM */
const MINTED_OUT_MAX = 200;
/** @type {Map<string, object>} contract -> archived sold-out row */
const mintedOutArchive = new Map();
let mintedOutSaveTimer = null;

/** Main mint poll interval — leave headroom under Blockscout rate limits */
const POLL_MS = 5000;
const FETCH_TIMEOUT_MS = 12000;
/** Tx price lookups share Blockscout quota with poll — keep modest under load. */
const TX_PRICE_CONCURRENCY = Math.max(
  1,
  Math.min(4, Number(process.env.TX_PRICE_CONCURRENCY) || 2)
);
const TX_PRICE_GAP_MS = Math.max(
  100,
  Number(process.env.TX_PRICE_GAP_MS) || 220
);
const TX_PRICE_CACHE_MAX = 2500;
const TX_PRICE_QUEUE_MAX = Math.max(
  200,
  Math.min(800, Number(process.env.TX_PRICE_QUEUE_MAX) || 400)
);
const TX_PRICE_ERROR_COOLDOWN_MS = 30_000;
/** Re-queue hot-window txs missing unit price (queue drops used to leave them forever). */
const PRICE_REQUEUE_MAX_PER_PASS = 40;
let lastPriceRequeueAt = 0;
const PRICE_REQUEUE_INTERVAL_MS = 8_000;
/** Global pause after HTTP 429 so poll + price workers back off together */
const RATE_LIMIT_BACKOFF_MS = 8_000;
let rateLimitUntil = 0;

/**
 * OpenSea public HTML pages are multi‑MB and were the main Railway OOM vector.
 * Default OFF — REST + Blockscout cover icons; enable only with OPENSEA_HTML_ENABLED=1.
 */
const OPENSEA_HTML_ENABLED =
  process.env.OPENSEA_HTML_ENABLED === "1" ||
  process.env.OPENSEA_HTML_ENABLED === "true";
const OPENSEA_HTML_MAX_BYTES = Math.max(
  64 * 1024,
  Math.min(
    2 * 1024 * 1024,
    Number(process.env.OPENSEA_HTML_MAX_BYTES) || 512 * 1024
  )
);
/** Only one OpenSea HTML scrape at a time (meta worker + twitter fill share this) */
let openSeaHtmlInFlight = 0;
const OPENSEA_HTML_MAX_CONCURRENT = 1;
/** @type {Array<() => void>} */
const openSeaHtmlWaiters = [];

/** RSS soft ceiling (MB) — enter degrade: drop HTML jobs, skip non-essential enrich */
const RSS_DEGRADE_MB = Math.max(
  200,
  Number(process.env.RSS_DEGRADE_MB) || 380
);
const RSS_RECOVER_MB = Math.max(150, RSS_DEGRADE_MB - 80);
let memoryDegraded = false;

/** @type {Map<string, object>} eventKey -> mint event */
const eventMap = new Map();
/** ordered keys (oldest first) for eviction */
const eventOrder = [];
/** txHash -> Set(eventKey) for O(1) mint counts + price stamping (no full-store scans) */
const eventsByTx = new Map();

/**
 * Tx value cache: hash -> { valueWei, unitWei, nftMints, status, updatedAt }
 * unitWei = floor(valueWei / nftMints in that tx) when known
 * @type {Map<string, object>}
 */
const txPriceCache = new Map();
/** @type {Set<string>} */
const txPriceQueued = new Set();
/** @type {string[]} */
const txPriceQueue = [];
/** Active parallel price workers */
let txPriceInFlight = 0;
let txPriceResolvedOk = 0;
let txPriceResolvedErr = 0;

/**
 * Collection meta: icon + socials
 * @type {Map<string, object>}
 */
const metaCache = new Map();
/** Bound meta entries (each may hold description/urls); trim cold contracts */
const META_CACHE_MAX = 350;
const META_QUEUE_MAX = 80;
/** @type {Set<string>} */
const metaQueued = new Set();
/** @type {string[]} */
const metaQueue = [];
let metaBusy = false;
/** Serialize background Twitter HTML fills (never fan-out multi-MB pages) */
const TWITTER_HTML_QUEUE_MAX = 20;
/** @type {Array<{contract: string, slug: string|null}>} */
const twitterHtmlJobs = [];
let twitterHtmlWorkerBusy = false;

let polling = false;
let pollTimer = null;
let lastPollAt = null;
/** Last successful poll that returned HTTP 200 (may add 0 new mints) */
let lastPollOkAt = null;
/** Last time ingestItems actually added ≥1 mint */
let lastIngestAt = null;
/** Mints added in the most recent successful poll */
let lastPollAdded = 0;
/** Consecutive failed pollOnce attempts */
let consecutivePollFailures = 0;
let lastError = null;
let pollCount = 0;
let latestBlock = null;
/** Throttle repeated stale warnings in logs */
let lastStaleLogAt = 0;

const META_OK_TTL_MS = 30 * 60 * 1000;
const META_MISS_TTL_MS = 5 * 60 * 1000;
const META_GAP_MS = 350;

/** Minted-out secondary sales volume (OpenSea collection stats) */
const TRADE_VOLUME_TTL_MS = 15 * 60 * 1000;
const TRADE_VOLUME_GAP_MS = 450;
let tradeVolumeTimer = null;
let tradeVolumeBusy = false;

/** Health thresholds (ms) */
const POLL_STALE_MS = 90_000; // no successful poll for this long → poller problem
const POLL_WARN_MS = 45_000;
/** If any mint lands in 5m or 10m window → treat as healthy (never fault UI) */
const HEALTH_RECENT_5M_MS = 5 * 60_000;
const HEALTH_RECENT_10M_MS = 10 * 60_000;
/** No 5m/30m activity + newest mint older than this → data fault */
const HEALTH_STALE_FAULT_MS = 20 * 60_000;
const HEALTH_STALE_HARD_MS = 30 * 60_000;
const MINT_30M_MS = 30 * 60_000;

function short(addr) {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** @returns {bigint|null} */
function toWei(v) {
  if (v == null || v === "") return null;
  try {
    return BigInt(String(v));
  } catch {
    return null;
  }
}

/** Compact ETH string from wei (no float noise). */
function weiToEthString(wei) {
  if (wei == null) return null;
  const w = typeof wei === "bigint" ? wei : toWei(wei);
  if (w == null) return null;
  if (w === 0n) return "0";
  const neg = w < 0n;
  const abs = neg ? -w : w;
  const whole = abs / 10n ** 18n;
  let frac = (abs % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  if (frac.length > 6) frac = frac.slice(0, 6).replace(/0+$/, "");
  const s = frac ? `${whole}.${frac}` : `${whole}`;
  return neg ? `-${s}` : s;
}

/**
 * Hot-board price label from the latest mint only (not a history average).
 * 0 / dust → Free; null → still resolving that mint's tx.
 */
function formatPriceLabel(wei) {
  if (wei == null) return null;
  const w = typeof wei === "bigint" ? wei : toWei(wei);
  if (w == null) return null;
  if (w === 0n) return "Free";
  const eth = weiToEthString(w);
  // Sub-display-precision wei (e.g. 1 wei) stringifies as "0" — treat as Free
  if (eth == null || eth === "0" || eth === "-0") return "Free";
  return `${eth} ETH`;
}

/** How many ERC-721 mint events we already stored for this tx hash. */
function countNftMintsInStore(hash) {
  const h = String(hash || "").toLowerCase();
  return eventsByTx.get(h)?.size || 0;
}

/** Count ERC-721 mints (from 0x0) in a token-transfer list. */
function countErc721MintsFromTransfers(transfers) {
  let n = 0;
  if (!Array.isArray(transfers)) return 0;
  for (const t of transfers) {
    const is721 =
      t.token_type === "ERC-721" ||
      t.token?.type === "ERC-721" ||
      t.token?.token_type === "ERC-721";
    if (!is721) continue;
    const from = String(t.from?.hash || "").toLowerCase();
    const mintType = t.type === "token_minting" || from === ZERO;
    if (mintType) n += 1;
  }
  return n;
}

/**
 * Best-effort mint quantity from decoded calldata
 * e.g. mint(uint256) / mintPublic(..., quantity, ...)
 */
function quantityFromDecodedInput(decoded) {
  if (!decoded || !Array.isArray(decoded.parameters)) return 0;
  const params = decoded.parameters;
  const method = String(decoded.method_call || decoded.method_id || "").toLowerCase();

  // mint(uint256 amount) / mintTo(..., amount)
  for (const p of params) {
    const name = String(p.name || "").toLowerCase();
    if (
      name === "quantity" ||
      name === "amount" ||
      name === "num" ||
      name === "count" ||
      name === "n" ||
      name === "arg0"
    ) {
      const v = Number(p.value);
      if (Number.isFinite(v) && v >= 1 && v <= 10000) return Math.floor(v);
    }
  }

  // mintPublic(nft, feeRecipient, minterIfNotPayer, quantity, ...)
  if (method.includes("mintpublic") || method.includes("mintsigned")) {
    for (const p of params) {
      if (String(p.type || "").includes("uint") && p.name) {
        const name = String(p.name).toLowerCase();
        if (name.includes("quant") || name.includes("amount")) {
          const v = Number(p.value);
          if (Number.isFinite(v) && v >= 1 && v <= 10000) return Math.floor(v);
        }
      }
    }
    // SeaDrop mintPublic: quantity is often the 4th param (index 3)
    if (params.length >= 4) {
      const v = Number(params[3]?.value);
      if (Number.isFinite(v) && v >= 1 && v <= 10000) return Math.floor(v);
    }
  }

  return 0;
}

/**
 * Unit price = tx.value / NFT count in that tx (never show total as unit).
 * n = max(store events, explorer transfers, decoded quantity, 1)
 */
function resolveMintQty(meta, hash) {
  const stored = countNftMintsInStore(hash);
  const fromMeta = Number(meta?.nftMints) || 0;
  const fromDecoded = Number(meta?.decodedQty) || 0;
  const n = Math.max(stored, fromMeta, fromDecoded, 1);
  return n;
}

function applyTxPriceToEvents(hash) {
  const h = String(hash || "").toLowerCase();
  const meta = txPriceCache.get(h);
  if (!meta || meta.valueWei == null) return false;
  const valueWei = toWei(meta.valueWei);
  if (valueWei == null) return false;

  // Always re-count from store so late-arriving mints recalculate unit price
  const n = resolveMintQty(meta, h);
  meta.nftMints = n;
  // integer division: 3e14 wei / 3 = 1e14 wei (0.0001 ETH if total was 0.0003)
  const unitWei = valueWei / BigInt(n);
  meta.unitWei = unitWei.toString();
  meta.unitEth = weiToEthString(unitWei);
  meta.txValueEth = weiToEthString(valueWei);
  meta.updatedAt = Date.now();

  let hit = 0;
  const keys = eventsByTx.get(h);
  if (!keys) return false;
  for (const key of keys) {
    const e = eventMap.get(key);
    if (!e) continue;
    e.txValueWei = valueWei.toString();
    e.txValueEth = meta.txValueEth;
    e.mintQtyInTx = n;
    e.unitPriceWei = unitWei.toString();
    e.unitPriceEth = meta.unitEth;
    e.priceKnown = true;
    hit += 1;
  }
  return hit > 0;
}

/**
 * Stamp unit price onto one event from cache (used when aggregating).
 * Recomputes unit once per tx hash so batch qty corrections (n: 1→5) overwrite bad unit.
 * @param {Set<string>} [recomputed] — hashes already applyTxPriceToEvents'd this pass
 */
function hydrateEventPrice(e, recomputed = null) {
  if (!e) return;
  const h = String(e.txHash || "").toLowerCase();
  if (!h) return;
  const meta = txPriceCache.get(h);
  if (meta?.valueWei != null) {
    if (!recomputed || !recomputed.has(h)) {
      // Recompute unit from latest store count (batch mints arrive across polls)
      applyTxPriceToEvents(h);
      if (recomputed) recomputed.add(h);
    } else if (meta.unitWei != null) {
      e.txValueWei = String(meta.valueWei);
      e.txValueEth = meta.txValueEth ?? weiToEthString(meta.valueWei);
      e.mintQtyInTx = meta.nftMints || 1;
      e.unitPriceWei = String(meta.unitWei);
      e.unitPriceEth = meta.unitEth ?? weiToEthString(meta.unitWei);
      e.priceKnown = true;
    }
    return;
  }
  if (meta?.unitWei != null) {
    e.unitPriceWei = String(meta.unitWei);
    e.unitPriceEth = meta.unitEth ?? weiToEthString(meta.unitWei);
    e.priceKnown = true;
  }
}

function queueTxPrice(hash, hintValueWei = null) {
  const h = String(hash || "").toLowerCase();
  if (!h || h.length < 10) return;
  if (hintValueWei != null) {
    const existing = txPriceCache.get(h) || {};
    existing.valueWei = String(toWei(hintValueWei) ?? hintValueWei);
    if (!existing.status || existing.status === "hint") existing.status = "hint";
    txPriceCache.set(h, existing);
    // Free mint (0) or known value — apply immediately as unit estimate
    applyTxPriceToEvents(h);
  }
  const cached = txPriceCache.get(h);
  // Re-apply when store count grew (batch mint discovered later)
  if (cached?.status === "ok" && cached.valueWei != null) {
    applyTxPriceToEvents(h);
    return;
  }
  // Avoid hammering Blockscout after a hard failure
  if (cached?.status === "error") {
    const age = Date.now() - (cached.updatedAt || 0);
    if (age < TX_PRICE_ERROR_COOLDOWN_MS) return;
  }
  if (txPriceQueued.has(h)) return;
  // Hard cap queue so overnight price backlog cannot balloon
  if (txPriceQueue.length >= TX_PRICE_QUEUE_MAX) {
    const dropped = txPriceQueue.pop();
    if (dropped) txPriceQueued.delete(dropped);
  }
  txPriceQueued.add(h);
  // Newest first so the live board gets prices sooner under load
  txPriceQueue.unshift(h);
  while (txPriceCache.size > TX_PRICE_CACHE_MAX) {
    const first = txPriceCache.keys().next().value;
    if (!first) break;
    txPriceCache.delete(first);
  }
  kickTxPriceWorker();
}

async function resolveTxPrice(hash) {
  const h = String(hash || "").toLowerCase();
  try {
    // One call is enough: tx payload includes value + token_transfers + decoded_input
    const tx = await fetchJson(`${BLOCKSCOUT}/api/v2/transactions/${h}`);
    const valueWei = toWei(tx?.value ?? 0) ?? 0n;

    let nftMints = countErc721MintsFromTransfers(tx?.token_transfers);
    const decodedQty = quantityFromDecodedInput(tx?.decoded_input);
    let stored = countNftMintsInStore(h);

    // Prefer decoded quantity early (SeaDrop mintPublic quantity) — don't wait for all rows
    // Extra transfers endpoint only when still ambiguous (batch not in payload)
    if (Math.max(nftMints, decodedQty, stored) < 2) {
      try {
        const tr = await fetchJson(
          `${BLOCKSCOUT}/api/v2/transactions/${h}/token-transfers`
        );
        const items = Array.isArray(tr?.items) ? tr.items : [];
        nftMints = Math.max(nftMints, countErc721MintsFromTransfers(items));
      } catch {
        /* optional */
      }
      stored = countNftMintsInStore(h);
    }

    // True NFT count for unit price: max of transfer rows, decoded qty, store rows
    // (must divide total tx.value by this — never show total as unit when n>1)
    const qty = Math.max(nftMints, decodedQty, stored, 1);

    txPriceCache.set(h, {
      valueWei: valueWei.toString(),
      nftMints: qty,
      decodedQty,
      transferMints: nftMints,
      storedMints: stored,
      status: "ok",
      updatedAt: Date.now(),
    });
    applyTxPriceToEvents(h);
    txPriceResolvedOk += 1;
  } catch (e) {
    const prev = txPriceCache.get(h) || {};
    txPriceCache.set(h, {
      ...prev,
      status: "error",
      updatedAt: Date.now(),
      error: e.message || String(e),
    });
    txPriceResolvedErr += 1;
    if (txPriceResolvedErr <= 5 || txPriceResolvedErr % 50 === 0) {
      console.warn(
        `[mint-radar] tx-price fail #${txPriceResolvedErr} ${short(h)}:`,
        e.message || e
      );
    }
  }
}

function kickTxPriceWorker() {
  while (txPriceInFlight < TX_PRICE_CONCURRENCY && txPriceQueue.length) {
    // Yield entirely while rate-limited so the main poll can recover first
    if (Date.now() < rateLimitUntil) {
      const delay = Math.max(200, rateLimitUntil - Date.now());
      setTimeout(() => kickTxPriceWorker(), delay);
      return;
    }
    const hash = txPriceQueue.shift();
    if (!hash) break;
    txPriceQueued.delete(hash);
    const cached = txPriceCache.get(hash);
    if (cached?.status === "ok" && cached.valueWei != null) {
      applyTxPriceToEvents(hash);
      continue;
    }
    if (cached?.status === "error") {
      const age = Date.now() - (cached.updatedAt || 0);
      if (age < TX_PRICE_ERROR_COOLDOWN_MS) continue;
    }
    txPriceInFlight += 1;
    (async () => {
      try {
        await resolveTxPrice(hash);
        if (TX_PRICE_GAP_MS > 0) await sleep(TX_PRICE_GAP_MS);
      } finally {
        txPriceInFlight -= 1;
        if (txPriceQueue.length) kickTxPriceWorker();
      }
    })();
  }
}

/**
 * Re-queue recent mint txs that never got a unit price (queue was full / dropped).
 * Prioritize newest so the hot board fills first.
 */
function requeueMissingTxPrices({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastPriceRequeueAt < PRICE_REQUEUE_INTERVAL_MS) return 0;
  lastPriceRequeueAt = now;
  if (Date.now() < rateLimitUntil) return 0;

  const from60 = now - 60 * 60_000;
  /** @type {string[]} */
  const missing = [];
  // Newest-first walk of the store
  for (let i = eventOrder.length - 1; i >= 0; i -= 1) {
    const e = eventMap.get(eventOrder[i]);
    if (!e?.txHash) continue;
    if (e.ts != null && e.ts < from60) break;
    if (e.unitPriceWei != null || e.priceKnown) continue;
    const h = String(e.txHash).toLowerCase();
    const cached = txPriceCache.get(h);
    if (cached?.status === "ok" && cached.valueWei != null) {
      applyTxPriceToEvents(h);
      continue;
    }
    if (cached?.status === "error") {
      const age = now - (cached.updatedAt || 0);
      if (age < TX_PRICE_ERROR_COOLDOWN_MS) continue;
    }
    if (txPriceQueued.has(h)) continue;
    missing.push(h);
    if (missing.length >= PRICE_REQUEUE_MAX_PER_PASS * 3) break;
  }
  // Unique preserve order
  const seen = new Set();
  let n = 0;
  for (const h of missing) {
    if (seen.has(h)) continue;
    seen.add(h);
    queueTxPrice(h, null);
    n += 1;
    if (n >= PRICE_REQUEUE_MAX_PER_PASS) break;
  }
  if (n > 0) {
    console.log(
      `[mint-radar] re-queued ${n} txs missing unit price (queue=${txPriceQueue.length})`
    );
  }
  return n;
}

function eventKey(item) {
  return [
    item.hash || "",
    item.token_transfer_index ?? "",
    item.token?.address_hash || "",
    item.total?.token_id ?? "",
  ].join(":");
}

/**
 * Vote-escrow / lock-position NFT (not a normal collectible drop).
 * Heuristic only — chain has no reliable "isCollectible" bit.
 */
function isVeOrGovNft(token, method) {
  if (!token && !method) return false;
  const name = String(token?.name || "");
  const symbol = String(token?.symbol || "").trim();
  if (VE_OR_GOV_NFT_RE.test(name) || VE_OR_GOV_NFT_RE.test(symbol)) return true;
  // Symbols like veNFT, veAERO, veSOLID (short ve-prefix governance tokens)
  if (/^ve[A-Za-z0-9]{1,16}$/i.test(symbol)) return true;
  if (method && VE_OR_GOV_METHOD_RE.test(String(method))) return true;
  // total_supply that looks like locked amount / voting power, not # of items
  const supply = token?.total_supply;
  if (supply != null && supply !== "") {
    const n = Number(supply);
    const holders =
      token?.holders_count != null ? Number(token.holders_count) : null;
    // Huge "supply" + tiny holder set → almost certainly not collection size
    if (
      Number.isFinite(n) &&
      n > 100_000 &&
      Number.isFinite(holders) &&
      holders > 0 &&
      holders < 500 &&
      n / holders > 5_000
    ) {
      return true;
    }
    // 9+ digit or multi-million "supply" on an ERC-721 mint stream → noise
    if (Number.isFinite(n) && n > 2_000_000) return true;
  }
  return false;
}

function isJunkToken(token, method) {
  if (!token) return true;
  const addr = String(token.address_hash || "").toLowerCase();
  if (BLACKLIST.has(addr)) return true;
  const name = token.name || "";
  const symbol = token.symbol || "";
  if (JUNK_RE.test(name) || JUNK_RE.test(symbol)) return true;
  if (isVeOrGovNft(token, method)) return true;
  return false;
}

function isMintItem(item) {
  if (!item || item.type !== "ERC-721") return false;
  const from = String(item.from?.hash || "").toLowerCase();
  if (from !== ZERO) return false;
  if (isJunkToken(item.token, item.method)) return false;
  return true;
}

function resolveMediaUrl(uri) {
  if (!uri || typeof uri !== "string") return null;
  const u = uri.trim();
  if (!u) return null;
  if (u.startsWith("ipfs://")) {
    return "https://dweb.link/ipfs/" + u.slice("ipfs://".length).replace(/^ipfs\//, "");
  }
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (/^bafy|Qm[a-zA-Z0-9]{20,}/.test(u)) return "https://dweb.link/ipfs/" + u;
  return null;
}

function extractImageFromItem(item) {
  const inst = item?.total?.token_instance;
  if (!inst) return null;
  return (
    resolveMediaUrl(inst.image_url) ||
    resolveMediaUrl(inst.media_url) ||
    resolveMediaUrl(inst.metadata?.image) ||
    null
  );
}

function emptyMeta(contract) {
  return {
    contract,
    icon: null,
    twitter: null,
    discord: null,
    telegram: null,
    website: null,
    description: null,
    slug: null,
    opensea: `https://opensea.io/contract/${OPENSEA_CHAIN}/${contract}`,
    source: null,
    status: "pending",
    updatedAt: 0,
    /** Collection hard cap from contract maxSupply()/MAX_SUPPLY() — NOT totalSupply/minted */
    maxSupply: null,
    /** ok | miss | error | null(not tried) */
    maxSupplyStatus: null,
    /** last time we attempted eth_call for maxSupply */
    maxSupplyCheckedAt: 0,
    /** last OpenSea HTML scrape for Twitter (backoff — avoid 90s re-fetch OOM loop) */
    twitterHtmlTriedAt: 0,
    /** true after a successful HTML parse that still had no twitter handle */
    twitterHtmlMiss: false,
  };
}

/** Truncate free-text fields so OpenSea blurbs cannot bloat heap */
function clipText(s, max = 280) {
  if (s == null) return null;
  const t = String(s);
  if (t.length <= max) return t;
  return t.slice(0, max);
}

/**
 * Drop cold meta entries not referenced by live events or minted-out archive.
 * Prefer deleting unreferenced keys; if still over cap, drop oldest by updatedAt.
 */
function trimMetaCache() {
  if (metaCache.size <= META_CACHE_MAX) return;
  /** @type {Set<string>} */
  const keep = new Set();
  for (const e of eventMap.values()) {
    if (e?.contract) keep.add(String(e.contract).toLowerCase());
  }
  for (const c of mintedOutArchive.keys()) keep.add(c);
  for (const k of metaQueued) keep.add(k);
  for (const k of metaQueue) keep.add(k);

  for (const key of [...metaCache.keys()]) {
    if (metaCache.size <= META_CACHE_MAX) return;
    if (!keep.has(key)) metaCache.delete(key);
  }
  if (metaCache.size <= META_CACHE_MAX) return;

  const ranked = [...metaCache.entries()].sort(
    (a, b) => (Number(a[1]?.updatedAt) || 0) - (Number(b[1]?.updatedAt) || 0)
  );
  while (metaCache.size > META_CACHE_MAX && ranked.length) {
    const [key] = ranked.shift();
    // Prefer dropping non-keep; if all kept, drop oldest anyway
    if (!keep.has(key) || metaCache.size > META_CACHE_MAX) {
      metaCache.delete(key);
    }
  }
}

function trimMintedOutArchive() {
  if (mintedOutArchive.size <= MINTED_OUT_MAX) return;
  const ranked = [...mintedOutArchive.entries()].sort(
    (a, b) => (Number(a[1]?.lastTs) || 0) - (Number(b[1]?.lastTs) || 0)
  );
  while (ranked.length > MINTED_OUT_MAX) {
    const [k] = ranked.shift();
    mintedOutArchive.delete(k);
  }
}

function processMemoryStats() {
  const m = process.memoryUsage();
  const mb = (n) => Math.round((n / 1024 / 1024) * 10) / 10;
  return {
    rssMb: mb(m.rss),
    heapUsedMb: mb(m.heapUsed),
    heapTotalMb: mb(m.heapTotal),
    externalMb: mb(m.external),
    arrayBuffersMb: mb(m.arrayBuffers || 0),
    degraded: memoryDegraded,
    htmlEnabled: OPENSEA_HTML_ENABLED && !memoryDegraded,
  };
}

/** Update soft memory mode; drop expensive work when RSS is high. */
function refreshMemoryMode() {
  const rssMb = process.memoryUsage().rss / (1024 * 1024);
  if (!memoryDegraded && rssMb >= RSS_DEGRADE_MB) {
    memoryDegraded = true;
    // Drop pending HTML / meta backlog so peak can fall
    while (twitterHtmlJobs.length) twitterHtmlJobs.pop();
    twitterHtmlQueued.clear();
    if (metaQueue.length > 20) {
      const keep = metaQueue.splice(-20);
      metaQueued.clear();
      metaQueue.length = 0;
      for (const c of keep) {
        metaQueue.push(c);
        metaQueued.add(c);
      }
    }
    console.warn(
      `[mint-radar] memory degrade ON rss=${Math.round(rssMb)}MB (drop html/meta backlog)`
    );
  } else if (memoryDegraded && rssMb <= RSS_RECOVER_MB) {
    memoryDegraded = false;
    console.log(
      `[mint-radar] memory degrade OFF rss=${Math.round(rssMb)}MB`
    );
  }
  return memoryDegraded;
}

function allowOpenSeaHtml() {
  if (!OPENSEA_HTML_ENABLED) return false;
  refreshMemoryMode();
  return !memoryDegraded;
}

/** Walk live events without allocating a full array copy. */
function forEachEvent(fn) {
  for (const k of eventOrder) {
    const e = eventMap.get(k);
    if (e) fn(e);
  }
}

function indexEventByTx(m) {
  if (!m?.txHash || !m?.key) return;
  const h = String(m.txHash).toLowerCase();
  let set = eventsByTx.get(h);
  if (!set) {
    set = new Set();
    eventsByTx.set(h, set);
  }
  set.add(m.key);
}

function unindexEventByTx(m) {
  if (!m?.txHash || !m?.key) return;
  const h = String(m.txHash).toLowerCase();
  const set = eventsByTx.get(h);
  if (!set) return;
  set.delete(m.key);
  if (set.size === 0) eventsByTx.delete(h);
}

function removeEventKey(key) {
  const e = eventMap.get(key);
  if (e) unindexEventByTx(e);
  eventMap.delete(key);
}

async function withOpenSeaHtmlSlot(fn) {
  while (openSeaHtmlInFlight >= OPENSEA_HTML_MAX_CONCURRENT) {
    await new Promise((resolve) => openSeaHtmlWaiters.push(resolve));
  }
  openSeaHtmlInFlight += 1;
  try {
    return await fn();
  } finally {
    openSeaHtmlInFlight -= 1;
    const next = openSeaHtmlWaiters.shift();
    if (next) next();
  }
}

/** Read response body with a hard byte cap (prevents multi-MB OpenSea pages on heap). */
async function readResponseTextCapped(res, maxBytes) {
  const limit = Math.max(64 * 1024, maxBytes | 0);
  // undici / fetch: prefer streaming when available
  const body = res.body;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        total += value.byteLength;
        if (total <= limit) {
          chunks.push(Buffer.from(value));
        } else {
          const overflow = total - limit;
          const keep = value.byteLength - overflow;
          if (keep > 0) chunks.push(Buffer.from(value.slice(0, keep)));
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          break;
        }
      }
    } catch (e) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw e;
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  const text = await res.text();
  return text.length > limit ? text.slice(0, limit) : text;
}

/**
 * eth_call → uint256 via Blockscout JSON-RPC.
 * Note: Robinhood Blockscout does NOT support Etherscan `module=proxy`
 * (returns "Unknown module"). Use POST /api/eth-rpc instead.
 * @returns {number|null}
 */
async function ethCallUint256(contract, data) {
  const c = String(contract || "").toLowerCase();
  if (!c || c.length < 10) return null;

  // Honor global 429 backoff (same as fetchJson)
  const wait = rateLimitUntil - Date.now();
  if (wait > 0) await sleep(wait);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await bsFetch(`${BLOCKSCOUT}/api/eth-rpc`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "robin-nft-radar/1.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: c, data }, "latest"],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) {
        rateLimitUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      }
      return null;
    }
    const j = await res.json();
    // Revert / missing method → no maxSupply
    if (j?.error) return null;
    const hex = j?.result;
    if (!hex || typeof hex !== "string" || hex === "0x") return null;
    if (!/^0x[0-9a-fA-F]+$/.test(hex)) return null;
    try {
      const n = BigInt(hex);
      // Sanity: 0 / absurd caps are not useful maxSupply
      if (n <= 0n || n > 50_000_000n) return null;
      if (n > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      return Number(n);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Best-effort collection size for mint progress bar.
 * Tries common ERC-721 mint contract getters.
 * @returns {number|null}
 */
async function fetchMaxSupply(contract) {
  // maxSupply() → 0xd5abeb01 · MAX_SUPPLY() → 0x32cb6b0c
  const selectors = ["0xd5abeb01", "0x32cb6b0c"];
  for (const data of selectors) {
    try {
      const n = await ethCallUint256(contract, data);
      if (n != null) return n;
    } catch {
      /* try next selector */
    }
  }
  return null;
}

function getMeta(contract) {
  const key = String(contract || "").toLowerCase();
  if (!key) return emptyMeta("");
  if (!metaCache.has(key)) {
    metaCache.set(key, emptyMeta(key));
    if (metaCache.size > META_CACHE_MAX) trimMetaCache();
  }
  return metaCache.get(key);
}

/** How long to wait before re-scraping OpenSea HTML for a missing Twitter handle */
const TWITTER_HTML_RETRY_MS = 45 * 60 * 1000;

function needsEnrich(meta) {
  if (!meta || meta.status === "pending") return true;
  // Never tried maxSupply (or process started before eth-rpc fix)
  if (meta.maxSupplyStatus == null) return true;

  const age = Date.now() - (meta.updatedAt || 0);
  const supplyAge = Date.now() - (meta.maxSupplyCheckedAt || meta.updatedAt || 0);

  // maxSupply miss must NOT wait for full 30m social meta TTL — retry often
  if (meta.maxSupplyStatus !== "ok" && supplyAge > 60_000) return true;

  // No Twitter yet — only re-queue when HTML is allowed (otherwise REST already tried)
  if (meta.status === "ok" && !meta.twitter && allowOpenSeaHtml()) {
    const sinceHtml = Date.now() - (meta.twitterHtmlTriedAt || 0);
    if (!meta.twitterHtmlTriedAt || sinceHtml > TWITTER_HTML_RETRY_MS) {
      return age > 5 * 60_000;
    }
  }

  if (meta.status === "ok") return age > META_OK_TTL_MS;
  if (meta.status === "miss" || meta.status === "error") return age > META_MISS_TTL_MS;
  return true;
}

function queueMeta(contract, hintIcon = null) {
  const key = String(contract || "").toLowerCase();
  if (!key || key.length < 10) return;
  const meta = getMeta(key);
  if (hintIcon && !meta.icon) meta.icon = hintIcon;
  // Under memory pressure only keep icon hints — skip re-enrich churn
  if (memoryDegraded && meta.status === "ok" && meta.icon) return;
  if (!needsEnrich(meta)) return;
  if (metaQueued.has(key)) return;
  if (metaQueue.length >= META_QUEUE_MAX) {
    // Drop oldest cold job so hot contracts still get a slot
    const dropped = metaQueue.shift();
    if (dropped) metaQueued.delete(dropped);
  }
  metaQueued.add(key);
  metaQueue.push(key);
  kickMetaWorker();
}

function twitterUrl(username) {
  if (!username || typeof username !== "string") return null;
  const u = username.trim().replace(/^@/, "");
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) {
    return u.replace("://twitter.com", "://x.com").replace("://www.twitter.com", "://x.com");
  }
  return `https://x.com/${u}`;
}

/** OpenSea / site chrome handles — not the collection's own X */
const OPENSEA_X_NOISE = new Set([
  "opensea",
  "opensea_support",
  "openseasupport",
  "opensea_offers",
  "intent",
  "share",
  "home",
  "search",
  "i",
  "hashtag",
]);

/** Serialize OpenSea REST calls — free tier returns 401 "Invalid API key" when bursted. */
let openSeaRestChain = Promise.resolve();
let lastOpenSeaRestAt = 0;
const OPENSEA_REST_MIN_GAP_MS = 350;

/**
 * OpenSea REST JSON.
 * Prefer x-api-key when set (needed for stats/volume; also more reliable for meta).
 * Serialized + min-gap + retries. Free-tier rate limits often look like HTTP 401.
 */
async function openSeaFetchJson(url, { retries = 2 } = {}) {
  const run = async () => {
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const gap = Date.now() - lastOpenSeaRestAt;
      if (gap < OPENSEA_REST_MIN_GAP_MS) {
        await sleep(OPENSEA_REST_MIN_GAP_MS - gap);
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      try {
        const headers = {
          Accept: "application/json",
          "User-Agent": "robin-nft-radar/1.0",
        };
        const key = openSeaApiKey();
        if (key) headers["x-api-key"] = key;
        lastOpenSeaRestAt = Date.now();
        const res = await bsFetch(url, {
          signal: ctrl.signal,
          headers,
        });
        // Free tier: burst traffic may surface as 401 or 429
        if (res.status === 429 || res.status >= 500 || res.status === 401) {
          const text = await res.text().catch(() => "");
          lastErr = new Error(
            text
              ? `HTTP ${res.status}: ${text.slice(0, 120)}`
              : `HTTP ${res.status}`
          );
          if (attempt < retries) {
            const backoff =
              res.status === 401 || res.status === 429
                ? 1500 * (attempt + 1)
                : 400 * (attempt + 1);
            await sleep(backoff);
            continue;
          }
          throw lastErr;
        }
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            text
              ? `HTTP ${res.status}: ${text.slice(0, 120)}`
              : `HTTP ${res.status}`
          );
        }
        return await res.json();
      } catch (e) {
        lastErr = e;
        const msg = formatFetchError(e);
        const retryable =
          /fetch failed|timeout|aborted|ECONN|ENOTFOUND|EAI_AGAIN|UND_ERR|socket|HTTP 401|HTTP 429/i.test(
            msg
          );
        if (attempt < retries && retryable) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        throw new Error(msg);
      } finally {
        clearTimeout(t);
      }
    }
    throw lastErr || new Error("OpenSea fetch failed");
  };

  const next = openSeaRestChain.then(run, run);
  // Keep chain alive even if this request fails
  openSeaRestChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/**
 * Public OpenSea HTML — opt-in only (OPENSEA_HTML_ENABLED=1).
 * Body is hard-capped and globally serialized so Railway hobby RAM stays safe.
 */
async function openSeaFetchHtml(url) {
  if (!allowOpenSeaHtml()) {
    throw new Error("OpenSea HTML disabled (set OPENSEA_HTML_ENABLED=1 to allow)");
  }
  return withOpenSeaHtmlSlot(async () => {
    const ctrl = new AbortController();
    // HTML pages are heavy; allow a bit longer than REST
    const t = setTimeout(() => ctrl.abort(), Math.max(FETCH_TIMEOUT_MS, 18_000));
    try {
      const res = await bsFetch(url, {
        signal: ctrl.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await readResponseTextCapped(res, OPENSEA_HTML_MAX_BYTES);
    } finally {
      clearTimeout(t);
    }
  });
}

/** Parse collection slug + project X handle from OpenSea public HTML. */
function parseOpenSeaCollectionHtml(html) {
  if (!html || typeof html !== "string") return null;
  const slugMatch = html.match(/opensea\.io\/collection\/([a-zA-Z0-9_-]+)/i);
  const slug = slugMatch ? slugMatch[1] : null;

  let twitterUser = null;
  // OpenSea page JSON uses camelCase twitterUsername; REST API uses twitter_username
  const jsonTw =
    html.match(/"twitterUsername"\s*:\s*"(@?[A-Za-z0-9_]{1,30})"/i) ||
    html.match(/"twitter_username"\s*:\s*"(@?[A-Za-z0-9_]{1,30})"/i);
  if (jsonTw?.[1]) {
    const h = jsonTw[1].replace(/^@/, "");
    if (h && !OPENSEA_X_NOISE.has(h.toLowerCase())) twitterUser = h;
  }
  if (!twitterUser) {
    const sameAs = html.match(
      /https?:\/\/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,30})/i
    );
    if (sameAs?.[1] && !OPENSEA_X_NOISE.has(sameAs[1].toLowerCase())) {
      twitterUser = sameAs[1];
    }
  }
  if (!twitterUser) {
    const re = /(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,30})/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const h = m[1];
      if (!h || OPENSEA_X_NOISE.has(h.toLowerCase())) continue;
      twitterUser = h;
      break;
    }
  }

  let icon = null;
  const og =
    html.match(
      /property=["']og:image["']\s+content=["']([^"']+)["']/i
    ) ||
    html.match(
      /content=["']([^"']+)["']\s+property=["']og:image["']/i
    );
  if (og?.[1]) icon = resolveMediaUrl(og[1]);

  const twitter = twitterUrl(twitterUser);
  if (!slug && !twitter && !icon) return null;
  return {
    slug,
    twitter,
    icon,
    discord: null,
    telegram: null,
    website: null,
    description: null,
    opensea: slug
      ? `https://opensea.io/collection/${encodeURIComponent(slug)}`
      : null,
    source: "opensea",
  };
}

/**
 * HTML scrape for Twitter. Prefer collection slug page (stable); else contract page.
 */
async function enrichFromOpenSeaHtml(contract, slugHint = null) {
  const c = String(contract || "").toLowerCase();
  if (!c && !slugHint) return null;
  if (!allowOpenSeaHtml()) {
    if (c) {
      const meta = getMeta(c);
      meta.twitterHtmlTriedAt = Date.now();
      meta.twitterHtmlMiss = true;
    }
    return null;
  }
  if (c) {
    const meta = getMeta(c);
    meta.twitterHtmlTriedAt = Date.now();
  }
  const urls = [];
  if (slugHint) {
    urls.push(
      `https://opensea.io/collection/${encodeURIComponent(String(slugHint))}`
    );
  }
  if (c) {
    urls.push(`https://opensea.io/contract/${OPENSEA_CHAIN}/${c}`);
  }
  let lastErr = null;
  for (const url of urls) {
    try {
      const html = await openSeaFetchHtml(url);
      const parsed = parseOpenSeaCollectionHtml(html);
      if (parsed?.twitter || parsed?.slug || parsed?.icon) return parsed;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

/** Background: fill Twitter after API returned icon/meta without twitter_username */
const twitterHtmlQueued = new Set();
function scheduleTwitterHtmlFill(contract, slug) {
  if (!allowOpenSeaHtml()) return;
  const c = String(contract || "").toLowerCase();
  if (!c || twitterHtmlQueued.has(c)) return;
  const meta = getMeta(c);
  if (meta.twitter) return;
  // Honor long backoff so overnight meta TTL does not re-download HTML every few minutes
  if (
    meta.twitterHtmlTriedAt &&
    Date.now() - meta.twitterHtmlTriedAt < TWITTER_HTML_RETRY_MS
  ) {
    return;
  }
  if (twitterHtmlJobs.length >= TWITTER_HTML_QUEUE_MAX) return;
  twitterHtmlQueued.add(c);
  twitterHtmlJobs.push({ contract: c, slug: slug || null });
  kickTwitterHtmlWorker();
}

function kickTwitterHtmlWorker() {
  if (twitterHtmlWorkerBusy) return;
  if (!allowOpenSeaHtml()) {
    while (twitterHtmlJobs.length) {
      const job = twitterHtmlJobs.pop();
      if (job) twitterHtmlQueued.delete(job.contract);
    }
    return;
  }
  twitterHtmlWorkerBusy = true;
  (async () => {
    try {
      while (twitterHtmlJobs.length) {
        if (!allowOpenSeaHtml()) {
          while (twitterHtmlJobs.length) {
            const drop = twitterHtmlJobs.pop();
            if (drop) twitterHtmlQueued.delete(drop.contract);
          }
          break;
        }
        const job = twitterHtmlJobs.shift();
        if (!job) continue;
        try {
          await fillTwitterFromHtml(job.contract, job.slug);
        } catch {
          /* logged inside */
        } finally {
          twitterHtmlQueued.delete(job.contract);
        }
        // Small gap so RSS can settle after multi-MB scrape
        await sleep(400);
      }
    } finally {
      twitterHtmlWorkerBusy = false;
      if (twitterHtmlJobs.length) kickTwitterHtmlWorker();
    }
  })().catch((e) => {
    twitterHtmlWorkerBusy = false;
    console.warn("[mint-radar] twitter html worker:", e?.message || e);
  });
}

async function fillTwitterFromHtml(contract, slugHint) {
  const c = String(contract || "").toLowerCase();
  const meta = getMeta(c);
  if (meta.twitter) return;
  meta.twitterHtmlTriedAt = Date.now();
  try {
    const scraped = await enrichFromOpenSeaHtml(c, slugHint || meta.slug);
    if (!scraped?.twitter) {
      meta.twitterHtmlMiss = true;
      return;
    }
    meta.twitter = scraped.twitter;
    meta.twitterHtmlMiss = false;
    if (scraped.slug) meta.slug = scraped.slug;
    if (scraped.opensea) meta.opensea = scraped.opensea;
    if (scraped.icon && !meta.icon) meta.icon = scraped.icon;
    if (!meta.source) meta.source = "opensea";
    meta.updatedAt = Date.now();
    if (meta.status !== "ok" && (meta.icon || meta.twitter)) {
      meta.status = "ok";
    }
  } catch (e) {
    meta.twitterHtmlMiss = true;
    if (!String(e?.message || "").includes("HTTP 404")) {
      console.warn(
        `[mint-radar] twitter html ${short(c)}:`,
        e?.message || e
      );
    }
  }
}

/** Dust below 0.0001 ETH → display as 0 (avoid 3.4e-12 style junk). */
const ETH_DISPLAY_MIN = 0.0001;

/** Human label for OpenSea total.volume / floor (ETH-like). 0 → "0 ETH". */
function formatTradeVolumeDisplay(volumeEth) {
  if (volumeEth == null || !Number.isFinite(volumeEth)) return null;
  // < 万分之一 ETH：按 0 展示，不要科学计数法
  if (volumeEth === 0 || Math.abs(volumeEth) < ETH_DISPLAY_MIN) return "0 ETH";
  const trim = (s) => s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (volumeEth >= 100) return `${trim(volumeEth.toFixed(2))} ETH`;
  if (volumeEth >= 1) return `${trim(volumeEth.toFixed(4))} ETH`;
  return `${trim(volumeEth.toFixed(6))} ETH`;
}

/** Floor price label — uses OpenSea floor_price_symbol when not ETH. */
function formatFloorPriceDisplay(floorEth, symbol = "ETH") {
  if (floorEth == null || !Number.isFinite(floorEth)) return null;
  const sym = String(symbol || "ETH").trim() || "ETH";
  // ETH floor: dust under 0.0001 → 0; non-ETH keep more precision for stablecoins etc.
  const isEth = /^eth$/i.test(sym);
  if (floorEth === 0 || (isEth && Math.abs(floorEth) < ETH_DISPLAY_MIN)) {
    return `0 ${sym}`;
  }
  const trim = (s) => s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  let num;
  if (floorEth >= 100) num = trim(floorEth.toFixed(2));
  else if (floorEth >= 1) num = trim(floorEth.toFixed(4));
  else if (floorEth >= ETH_DISPLAY_MIN || !isEth) {
    num = trim(floorEth.toFixed(isEth ? 6 : Math.min(6, floorEth < 0.01 ? 4 : 2)));
    if (!isEth && floorEth < 1) num = trim(floorEth.toFixed(4));
  } else {
    num = "0";
  }
  return `${num} ${sym}`;
}

function slugFromOpenseaUrl(url) {
  if (!url) return null;
  const m = String(url).match(/opensea\.io\/collection\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

async function resolveCollectionSlug(contract) {
  const c = String(contract || "").toLowerCase();
  if (!c) return null;
  const meta = getMeta(c);
  if (meta.slug) return meta.slug;
  const row = mintedOutArchive.get(c);
  const fromUrl = slugFromOpenseaUrl(row?.opensea || meta.opensea);
  if (fromUrl) {
    meta.slug = fromUrl;
    return fromUrl;
  }
  if (!openSeaApiKey()) return null;
  try {
    const info = await openSeaFetchJson(
      `https://api.opensea.io/api/v2/chain/${OPENSEA_CHAIN}/contract/${c}`
    );
    const slug = info?.collection;
    if (slug) {
      meta.slug = slug;
      return slug;
    }
  } catch {
    /* miss */
  }
  return null;
}

/**
 * OpenSea collection stats — total volume + floor in one request.
 * @returns {{ volumeEth: number, volumeDisplay: string, floorEth: number|null, floorDisplay: string|null, floorSymbol: string|null }}
 */
async function fetchCollectionMarketStats(slug) {
  const data = await openSeaFetchJson(
    `https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}/stats`
  );
  // OpenSea returns total.volume as ETH (float). Also accept legacy shapes.
  const rawVol =
    data?.total?.volume ??
    data?.total_volume ??
    data?.stats?.total_volume ??
    data?.volume;
  const volumeEth =
    rawVol == null || rawVol === "" || !Number.isFinite(Number(rawVol))
      ? 0
      : Number(rawVol);

  const rawFloor =
    data?.total?.floor_price ??
    data?.total?.floor ??
    data?.stats?.floor_price ??
    data?.floor_price;
  const floorSymRaw =
    data?.total?.floor_price_symbol ??
    data?.stats?.floor_price_symbol ??
    data?.floor_price_symbol ??
    "ETH";
  const floorSymbol =
    rawFloor == null || rawFloor === ""
      ? null
      : String(floorSymRaw || "ETH").trim() || "ETH";
  const floorEth =
    rawFloor == null || rawFloor === "" || !Number.isFinite(Number(rawFloor))
      ? null
      : Number(rawFloor);

  return {
    volumeEth,
    volumeDisplay: formatTradeVolumeDisplay(volumeEth),
    floorEth,
    floorDisplay:
      floorEth != null
        ? formatFloorPriceDisplay(floorEth, floorSymbol || "ETH")
        : null,
    floorSymbol,
  };
}

/** @deprecated alias — volume-only callers */
async function fetchCollectionTradeVolume(slug) {
  const s = await fetchCollectionMarketStats(slug);
  return { volumeEth: s.volumeEth, volumeDisplay: s.volumeDisplay };
}

async function refreshTradeVolumeForContract(contract) {
  const c = String(contract || "").toLowerCase();
  const row = mintedOutArchive.get(c);
  if (!row) return { status: "skip" };
  if (!openSeaApiKey()) {
    row.tradeVolumeStatus = "no_key";
    row.tradeVolumeAt = Date.now();
    scheduleSaveMintedOutArchive();
    return { status: "no_key" };
  }
  try {
    const slug = await resolveCollectionSlug(c);
    if (!slug) {
      row.tradeVolumeStatus = "miss";
      row.tradeVolumeAt = Date.now();
      // Keep prior real volume/floor if any; do not invent "0 ETH"
      scheduleSaveMintedOutArchive();
      return { status: "miss" };
    }
    // Persist slug on archive for faster next refresh / better OpenSea links
    if (!row.opensea || /\/contract\//i.test(row.opensea)) {
      row.opensea = `https://opensea.io/collection/${encodeURIComponent(slug)}`;
    }
    const stats = await fetchCollectionMarketStats(slug);
    row.tradeVolumeEth = stats.volumeEth;
    row.tradeVolumeDisplay = stats.volumeDisplay;
    row.floorPriceEth = stats.floorEth;
    row.floorPriceDisplay = stats.floorDisplay;
    row.floorPriceSymbol = stats.floorSymbol;
    row.tradeVolumeAt = Date.now();
    row.tradeVolumeStatus = "ok";
    scheduleSaveMintedOutArchive();
    return {
      status: "ok",
      volumeEth: stats.volumeEth,
      floorEth: stats.floorEth,
    };
  } catch (e) {
    const msg = formatFetchError(e);
    row.tradeVolumeStatus = /401|403|unauthorized/i.test(msg)
      ? "auth"
      : "error";
    row.tradeVolumeAt = Date.now();
    console.warn(`[mint-radar] trade volume ${short(c)}:`, msg);
    scheduleSaveMintedOutArchive();
    return { status: row.tradeVolumeStatus, error: msg };
  }
}

/**
 * Refresh OpenSea trade volumes for minted-out archive.
 * @returns {{ refreshed: number, ok: number, miss: number, error: number, skipped: number, noKey: boolean }}
 */
async function refreshAllTradeVolumes({ force = false } = {}) {
  const summary = {
    refreshed: 0,
    ok: 0,
    miss: 0,
    error: 0,
    skipped: 0,
    noKey: !openSeaApiKey(),
  };
  if (!openSeaApiKey() || !mintedOutArchive.size) {
    if (!openSeaApiKey()) {
      console.warn(
        "[mint-radar] trade volume skipped — OPENSEA_API_KEY unset"
      );
    }
    return summary;
  }
  while (tradeVolumeBusy) await sleep(200);
  tradeVolumeBusy = true;
  let consecutiveAuthFails = 0;
  try {
    // Newest sold-outs first (Map insertion order is roughly oldest-first)
    const contracts = [...mintedOutArchive.keys()].reverse();
    for (const c of contracts) {
      const row = mintedOutArchive.get(c);
      const age = Date.now() - (row?.tradeVolumeAt || 0);
      const missingFloor =
        row?.floorPriceEth == null && row?.floorPriceDisplay == null;
      const freshOk =
        row?.tradeVolumeStatus === "ok" &&
        age < TRADE_VOLUME_TTL_MS &&
        !missingFloor;
      // Back off hard failures briefly so a bad key does not hammer OpenSea
      const recentFail =
        (row?.tradeVolumeStatus === "error" ||
          row?.tradeVolumeStatus === "auth" ||
          row?.tradeVolumeStatus === "miss") &&
        age < 60_000;
      if (!force && (freshOk || recentFail)) {
        summary.skipped += 1;
        continue;
      }
      const result = await refreshTradeVolumeForContract(c);
      summary.refreshed += 1;
      if (result?.status === "ok") {
        summary.ok += 1;
        consecutiveAuthFails = 0;
      } else if (result?.status === "miss") {
        summary.miss += 1;
        consecutiveAuthFails = 0;
      } else if (result?.status === "error" || result?.status === "auth") {
        summary.error += 1;
        if (result?.status === "auth") {
          consecutiveAuthFails += 1;
          // OpenSea occasionally returns 401 spuriously; only abort after a streak
          if (consecutiveAuthFails >= 3) {
            console.warn(
              "[mint-radar] OpenSea auth failed repeatedly — check OPENSEA_API_KEY; aborting volume pass"
            );
            break;
          }
        } else {
          consecutiveAuthFails = 0;
        }
      }
      await sleep(TRADE_VOLUME_GAP_MS);
    }
  } finally {
    tradeVolumeBusy = false;
  }
  if (summary.refreshed) {
    console.log(
      `[mint-radar] trade volume pass: ok=${summary.ok} miss=${summary.miss} err=${summary.error} skipped=${summary.skipped}`
    );
  }
  return summary;
}

function kickTradeVolumeRefresh() {
  refreshAllTradeVolumes().catch((e) => {
    console.warn(
      "[mint-radar] trade volume refresh:",
      formatFetchError(e)
    );
  });
}

async function enrichFromOpenSea(contract) {
  const c = String(contract).toLowerCase();

  // 1) REST API first (fast). Do NOT await multi‑MB HTML here — it starved the meta queue.
  try {
    const contractUrl = `https://api.opensea.io/api/v2/chain/${OPENSEA_CHAIN}/contract/${c}`;
    const info = await openSeaFetchJson(contractUrl);
    const slug = info?.collection;
    if (slug) {
      const col = await openSeaFetchJson(
        `https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}`
      );
      const twitter = twitterUrl(col?.twitter_username);
      // Empty twitter_username is common — fill in background without blocking others
      if (!twitter) {
        scheduleTwitterHtmlFill(c, slug);
      }
      return {
        icon: resolveMediaUrl(col?.image_url) || null,
        twitter,
        discord: col?.discord_url || null,
        telegram: col?.telegram_url || null,
        website: col?.project_url || null,
        description: clipText(col?.description, 280),
        slug,
        opensea:
          col?.opensea_url ||
          `https://opensea.io/collection/${encodeURIComponent(slug)}`,
        source: "opensea",
      };
    }
  } catch {
    /* fall through to HTML only if explicitly enabled */
  }

  // 2) Public HTML fallback when REST fails — opt-in (OOM-prone)
  if (!allowOpenSeaHtml()) return null;
  return enrichFromOpenSeaHtml(c);
}

async function enrichFromBlockscout(contract) {
  const c = String(contract).toLowerCase();
  // token icon (rare for ERC-721)
  try {
    const tok = await fetchJson(`${BLOCKSCOUT}/api/v2/tokens/${c}`);
    const icon = resolveMediaUrl(tok?.icon_url);
    if (icon) {
      return { icon, source: "blockscout-token" };
    }
  } catch {
    /* ignore */
  }
  // first NFT instance image as collection avatar fallback
  try {
    const inst = await fetchJson(`${BLOCKSCOUT}/api/v2/tokens/${c}/instances`);
    const first = Array.isArray(inst?.items) ? inst.items[0] : null;
    const icon =
      resolveMediaUrl(first?.image_url) ||
      resolveMediaUrl(first?.media_url) ||
      resolveMediaUrl(first?.metadata?.image) ||
      null;
    if (icon) return { icon, source: "blockscout-instance" };
  } catch {
    /* ignore */
  }
  return null;
}

async function enrichMaxSupply(meta, contract) {
  // Keep a known good maxSupply across meta refreshes
  if (meta.maxSupplyStatus === "ok" && meta.maxSupply != null) return;
  meta.maxSupplyCheckedAt = Date.now();
  try {
    const ms = await fetchMaxSupply(contract);
    // IMPORTANT: never fall back to totalSupply/minted as "max" —
    // that always looks like 100% and confuses progress with inventory.
    if (ms != null) {
      meta.maxSupply = ms;
      meta.maxSupplyStatus = "ok";
      console.log(`[mint-radar] maxSupply ${short(contract)} = ${ms}`);
    } else {
      meta.maxSupply = null;
      meta.maxSupplyStatus = "miss";
    }
  } catch (e) {
    meta.maxSupplyStatus = "error";
    if (!String(e.message || "").includes("HTTP 429")) {
      console.warn(
        `[mint-radar] maxSupply fail ${short(contract)}:`,
        e.message || e
      );
    }
  }
}

async function enrichOne(contract) {
  const meta = getMeta(contract);
  meta.status = "pending";

  // Prefer any image already seen from mint stream
  let hintIcon = meta.icon;

  try {
    let got = null;
    try {
      got = await enrichFromOpenSea(contract);
    } catch (e) {
      if (!String(e.message || "").includes("HTTP 404")) {
        console.warn(
          `[mint-radar] opensea meta ${short(contract)}:`,
          e.message || e
        );
      }
    }

    if (got) {
      meta.icon = got.icon || hintIcon || null;
      meta.twitter = got.twitter || meta.twitter || null;
      meta.discord = got.discord || meta.discord || null;
      meta.telegram = got.telegram || meta.telegram || null;
      meta.website = got.website || meta.website || null;
      meta.description =
        clipText(got.description, 280) || clipText(meta.description, 280);
      meta.slug = got.slug || meta.slug || null;
      meta.opensea = got.opensea || meta.opensea;
      meta.source = got.source || meta.source;
      // Fill avatar from Blockscout if OpenSea HTML/API had Twitter but no image
      if (!meta.icon) {
        try {
          const bsIcon = await enrichFromBlockscout(contract);
          if (bsIcon?.icon) meta.icon = bsIcon.icon;
        } catch {
          /* optional */
        }
      }
      meta.status = meta.icon || meta.twitter || meta.discord ? "ok" : "miss";
      await enrichMaxSupply(meta, contract);
      meta.updatedAt = Date.now();
      trimMetaCache();
      return meta;
    }

    // Blockscout image fallback (no socials)
    const bs = await enrichFromBlockscout(contract);
    if (bs?.icon || hintIcon) {
      meta.icon = bs?.icon || hintIcon;
      meta.source = bs?.source || "stream";
      meta.status = "ok";
      await enrichMaxSupply(meta, contract);
      meta.updatedAt = Date.now();
      return meta;
    }

    meta.status = "miss";
    await enrichMaxSupply(meta, contract);
    meta.updatedAt = Date.now();
    return meta;
  } catch (e) {
    meta.status = "error";
    meta.updatedAt = Date.now();
    console.warn(`[mint-radar] meta fail ${short(contract)}:`, e.message || e);
    return meta;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function kickMetaWorker() {
  if (metaBusy) return;
  metaBusy = true;
  try {
    while (metaQueue.length) {
      const contract = metaQueue.shift();
      metaQueued.delete(contract);
      if (!needsEnrich(getMeta(contract))) continue;
      await enrichOne(contract);
      await sleep(META_GAP_MS);
    }
  } finally {
    metaBusy = false;
    if (metaQueue.length) kickMetaWorker();
  }
}

function attachMetaFields(row) {
  const m = getMeta(row.contract);
  // keep refreshing hot collections in background
  queueMeta(row.contract, row.icon || m.icon);
  const maxSupply =
    m.maxSupply != null
      ? m.maxSupply
      : row.maxSupply != null
        ? row.maxSupply
        : null;
  const minted = row.minted ?? row.totalSupply ?? null;
  const mintedOut =
    maxSupply != null &&
    minted != null &&
    Number.isFinite(Number(maxSupply)) &&
    Number.isFinite(Number(minted)) &&
    Number(maxSupply) > 0 &&
    Number(minted) >= Number(maxSupply);
  return {
    ...row,
    icon: m.icon || row.icon || null,
    twitter: m.twitter || null,
    discord: m.discord || null,
    telegram: m.telegram || null,
    website: m.website || null,
    description: m.description || null,
    opensea: m.opensea || row.opensea,
    metaSource: m.source || null,
    metaStatus: m.status || "pending",
    maxSupply,
    maxSupplyStatus: m.maxSupplyStatus || null,
    mintedOut: !!mintedOut,
  };
}

/**
 * Blockscout `token.total_supply` is *usually* ERC-721 minted count, but often NOT:
 * - veNFT / vote-escrow: totalSupply = locked amount or voting power (hundreds of millions)
 * - ERC-20 mistaken as NFT stream
 * - raw wei-scale integers
 * OpenSea "16 items" vs UI "437,507,642" is exactly this class of bug.
 */
const MAX_PLAUSIBLE_NFT_MINTED = 2_000_000; // hobby / RH-chain collections stay far below this

function sanitizeNftMintedCount(raw, holders) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Decimal amounts are almost never "how many NFTs"
  if (/[eE.]/.test(s) && !/^\d+$/.test(s)) {
    const f = Number(s);
    if (!Number.isFinite(f) || f < 0 || f > MAX_PLAUSIBLE_NFT_MINTED) return null;
    return Math.floor(f);
  }

  // >10 digits → not a collection size (e.g. 437507642 is 9 digits but still absurd)
  if (/^\d+$/.test(s) && s.length >= 10) return null;

  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > MAX_PLAUSIBLE_NFT_MINTED) return null;

  // e.g. 437M minted / 11 holders → totalSupply is not NFT count
  const h = holders != null ? Number(holders) : null;
  if (
    Number.isFinite(h) &&
    h > 0 &&
    n >= 10_000 &&
    n / h > 5_000
  ) {
    return null;
  }

  return Math.floor(n);
}

function normalizeMint(item) {
  const contract = String(item.token?.address_hash || "").toLowerCase();
  const minter = String(item.to?.hash || "").toLowerCase();
  const ts = item.timestamp ? new Date(item.timestamp).getTime() : Date.now();
  const streamIcon = extractImageFromItem(item);
  if (streamIcon) {
    const m = getMeta(contract);
    if (!m.icon) m.icon = streamIcon;
  }
  queueMeta(contract, streamIcon);
  const hintValue = toWei(item.value);
  const txHash = item.hash;
  const cached = txHash ? txPriceCache.get(String(txHash).toLowerCase()) : null;
  const unitFromCache = cached?.unitWei != null ? toWei(cached.unitWei) : null;
  const valueFromCache = cached?.valueWei != null ? toWei(cached.valueWei) : null;
  const txValueWei = valueFromCache ?? hintValue;

  const holders =
    item.token?.holders_count != null ? Number(item.token.holders_count) : null;
  // Prefer real NFT count; drop ve-power / ERC-20 style total_supply garbage
  const minted = sanitizeNftMintedCount(item.token?.total_supply, holders);

  return {
    key: eventKey(item),
    txHash,
    blockNumber: item.block_number ?? null,
    timestamp: item.timestamp,
    ts,
    method: item.method || null,
    tokenId: item.total?.token_id ?? null,
    contract,
    name: item.token?.name || "Unknown",
    symbol: item.token?.symbol || "?",
    holders: Number.isFinite(holders) ? holders : null,
    // Sanitized: ERC-721 minted count when trustworthy; else null (UI shows —)
    minted,
    /** @deprecated use minted — kept for older clients */
    totalSupply: minted,
    minter,
    minterShort: short(minter),
    icon: streamIcon || getMeta(contract).icon || null,
    // price: tx native value / # of NFT mints in that tx (unit price)
    txValueWei: txValueWei != null ? txValueWei.toString() : null,
    txValueEth: txValueWei != null ? weiToEthString(txValueWei) : null,
    unitPriceWei: unitFromCache != null ? unitFromCache.toString() : null,
    unitPriceEth: unitFromCache != null ? weiToEthString(unitFromCache) : null,
    priceKnown: unitFromCache != null,
    explorerTx: `${EXPLORER}/tx/${item.hash}`,
    explorerToken: `${EXPLORER}/token/${contract}`,
    explorerMinter: `${EXPLORER}/address/${minter}`,
    opensea: getMeta(contract).opensea,
    openseaItem:
      item.total?.token_id != null
        ? `https://opensea.io/item/${OPENSEA_CHAIN}/${contract}/${item.total.token_id}`
        : null,
  };
}

function trimEvents() {
  while (eventOrder.length > MAX_EVENTS) {
    const old = eventOrder.shift();
    if (old) removeEventKey(old);
  }
  // keep ≥1h so hot table can show 5m / 30m / 1h mint counts
  const cutoff = Date.now() - 65 * 60 * 1000;
  while (eventOrder.length) {
    const k = eventOrder[0];
    const e = eventMap.get(k);
    if (!e || e.ts >= cutoff) break;
    eventOrder.shift();
    removeEventKey(k);
  }
  // After event eviction, drop cold collection meta so heap does not grow overnight
  if (metaCache.size > META_CACHE_MAX) trimMetaCache();
}

function ingestItems(items) {
  let added = 0;
  /** @type {Set<string>} */
  const touchedTx = new Set();
  for (const raw of items) {
    if (!isMintItem(raw)) continue;
    const m = normalizeMint(raw);
    if (eventMap.has(m.key)) continue;
    eventMap.set(m.key, m);
    eventOrder.push(m.key);
    indexEventByTx(m);
    added += 1;
    if (m.txHash) touchedTx.add(String(m.txHash).toLowerCase());
    if (m.blockNumber != null) {
      latestBlock =
        latestBlock == null ? m.blockNumber : Math.max(latestBlock, m.blockNumber);
    }
    // Prefer tx-level value (filter often has value=null)
    queueTxPrice(m.txHash, raw.value != null ? raw.value : null);
  }
  // Re-apply unit price after batch counts are known
  for (const h of touchedTx) applyTxPriceToEvents(h);
  trimEvents();
  return added;
}

function withApiKey(url) {
  if (!BLOCKSCOUT_API_KEY) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}apikey=${encodeURIComponent(BLOCKSCOUT_API_KEY)}`;
}

async function fetchJson(url) {
  // Honor global 429 backoff before hitting Blockscout again
  const wait = rateLimitUntil - Date.now();
  if (wait > 0) await sleep(wait);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await bsFetch(withApiKey(url), {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "robin-nft-radar/1.0",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) {
        rateLimitUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
        console.warn(
          `[mint-radar] Blockscout 429 — pause ${RATE_LIMIT_BACKOFF_MS}ms`
        );
      }
      // Collapse HTML error pages (nginx 502/503) into a short readable reason
      const plain = String(text || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
      throw new Error(
        plain
          ? `HTTP ${res.status}: ${plain}`
          : `HTTP ${res.status}`
      );
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    let lastErr = null;
    // One retry — transient proxy / Blockscout blips are common
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        // Page 1 is newest; grab a few pages for denser coverage
        let url = `${BLOCKSCOUT}/api/v2/advanced-filters?transaction_types=ERC-721`;
        let totalAdded = 0;
        for (let page = 0; page < 3; page += 1) {
          const data = await fetchJson(url);
          const items = Array.isArray(data?.items) ? data.items : [];
          totalAdded += ingestItems(items);
          const np = data?.next_page_params;
          if (!np || !items.length) break;
          // only dig deeper on first few polls or when we got few mints
          if (page > 0 && totalAdded > 15) break;
          const qs = new URLSearchParams();
          for (const [k, v] of Object.entries(np)) {
            if (v != null) qs.set(k, String(v));
          }
          qs.set("transaction_types", "ERC-721");
          url = `${BLOCKSCOUT}/api/v2/advanced-filters?${qs.toString()}`;
        }
        const nowIso = new Date().toISOString();
        lastPollAt = nowIso;
        lastPollOkAt = nowIso;
        lastPollAdded = totalAdded;
        lastError = null;
        consecutivePollFailures = 0;
        pollCount += 1;
        if (totalAdded > 0) {
          lastIngestAt = nowIso;
          console.log(`[mint-radar] +${totalAdded} mints (store=${eventMap.size})`);
        }
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt === 0) await sleep(400);
      }
    }
    if (lastErr) {
      lastError = lastErr.message || String(lastErr);
      consecutivePollFailures += 1;
      console.error(
        `[mint-radar] poll failed (x${consecutivePollFailures}):`,
        lastError
      );
    } else {
      // Archive any newly sold-out collections after a successful poll
      harvestMintedOut();
      // After mint ingest, retry any hot-window txs that never got a price
      requeueMissingTxPrices({ force: true });
    }
  } catch (e) {
    // Never let poll crash the process (Railway marks CRASHED on unhandled rejections)
    lastError = e?.message || String(e);
    consecutivePollFailures += 1;
    console.error("[mint-radar] pollOnce fatal (swallowed):", lastError);
  } finally {
    polling = false;
  }
}

/** Newest mint event timestamp in the in-memory store (ms), or null. */
function newestEventTs() {
  // eventOrder is oldest→newest; walk from the end
  for (let i = eventOrder.length - 1; i >= 0; i -= 1) {
    const e = eventMap.get(eventOrder[i]);
    if (e?.ts != null && Number.isFinite(e.ts)) return e.ts;
  }
  return null;
}

/** Count mint events in the last `windowMs` (from now). */
function countMintsInWindow(windowMs, now = Date.now()) {
  const from = now - windowMs;
  let n = 0;
  forEachEvent((e) => {
    if (e?.ts != null && e.ts >= from) n += 1;
  });
  return n;
}

/**
 * Classify pipeline health for the UI status chip + fault banner.
 *
 * Rules (product):
 * 1) If 5m or 10m windows have mint data → healthy (never fault).
 * 2) If 5m & 30m are empty AND newest mint is ≥20–30m old → fault
 *    (stale windows / explorer lag / poll broken).
 * Hard poll failures still fault when there is no recent window data.
 */
function computeHealth() {
  const now = Date.now();
  const rateLimited = rateLimitUntil > now;
  const rateLimitRemainMs = rateLimited ? rateLimitUntil - now : 0;
  const pollOkAgeMs = lastPollOkAt
    ? now - new Date(lastPollOkAt).getTime()
    : null;
  const pollAgeMs = lastPollAt ? now - new Date(lastPollAt).getTime() : null;
  const newestTs = newestEventTs();
  const newestEventAgeMs = newestTs != null ? Math.max(0, now - newestTs) : null;
  const ingestAgeMs = lastIngestAt
    ? now - new Date(lastIngestAt).getTime()
    : null;

  const mints5m = countMintsInWindow(HEALTH_RECENT_5M_MS, now);
  const mints10m = countMintsInWindow(HEALTH_RECENT_10M_MS, now);
  const mints30m = countMintsInWindow(MINT_30M_MS, now);

  /** Recent short windows have data → product rule: not a fault */
  const hasRecentWindowData =
    mints5m > 0 ||
    mints10m > 0 ||
    (newestEventAgeMs != null && newestEventAgeMs < HEALTH_RECENT_10M_MS);

  /**
   * Long gap: no 5m / 30m counts and latest mint older than threshold
   * (or store completely empty after we already warmed up)
   */
  const windowsEmpty = mints5m === 0 && mints30m === 0;
  const newestTooOld =
    newestEventAgeMs == null || newestEventAgeMs >= HEALTH_STALE_FAULT_MS;
  const newestVeryOld =
    newestEventAgeMs == null || newestEventAgeMs >= HEALTH_STALE_HARD_MS;
  const dataStaleFault = windowsEmpty && newestTooOld && lastPollOkAt != null;

  /** @type {"ok"|"warn"|"error"|"warm"} */
  let level = "ok";
  /** @type {string} */
  let code = "ok";
  /** @type {string} */
  let reason = "Data pipeline healthy — 5m/10m windows have recent mints or feed is fresh";
  /** @type {string} */
  let reasonZh = "数据管道正常 — 5 分钟/10 分钟窗口有数据或最新 mint 较新";

  if (!lastPollOkAt && !lastError && consecutivePollFailures === 0) {
    level = "warm";
    code = "warming";
    reason = "First Blockscout fetch in progress…";
    reasonZh = "首次拉取 Blockscout…";
  } else if (hasRecentWindowData) {
    // Rule 1: can read 5m / 10m data → never report fault
    level = "ok";
    code = "ok";
    reason = `Healthy: mints5m=${mints5m}, mints10m=${mints10m}`;
    reasonZh = `正常：5 分钟 ${mints5m} 笔 · 10 分钟 ${mints10m} 笔铸造`;
  } else if (rateLimited && consecutivePollFailures > 0 && !hasRecentWindowData) {
    level = "error";
    code = "rate_limited";
    reason = `Blockscout rate-limited (HTTP 429). Backing off ~${Math.ceil(rateLimitRemainMs / 1000)}s. No recent 5m/10m mints.`;
    reasonZh = `Blockscout 限流 (HTTP 429)，约 ${Math.ceil(rateLimitRemainMs / 1000)}s 后重试。5/10 分钟窗口无数据。`;
  } else if (
    lastError &&
    !hasRecentWindowData &&
    (consecutivePollFailures >= 1 ||
      pollOkAgeMs == null ||
      pollOkAgeMs > POLL_WARN_MS)
  ) {
    level = "error";
    code = "poll_error";
    reason = `Blockscout poll failing: ${lastError}`;
    reasonZh = `Blockscout 轮询失败：${lastError}`;
  } else if (pollOkAgeMs != null && pollOkAgeMs > POLL_STALE_MS && !hasRecentWindowData) {
    level = "error";
    code = "poller_stale";
    reason = `No successful poll for ${Math.round(pollOkAgeMs / 1000)}s — process may be stuck.`;
    reasonZh = `已 ${Math.round(pollOkAgeMs / 1000)}s 无成功轮询，进程可能卡住。`;
  } else if (eventMap.size === 0 && lastPollOkAt) {
    level = "error";
    code = "empty_store";
    reason = "Mint store empty — cannot read 5m/30m windows.";
    reasonZh = "mint 缓存为空，读不到 5 分钟/30 分钟窗口数据。";
  } else if (dataStaleFault) {
    // Rule 2: long time without 5m/30m data + newest mint ≥20m (hard at 30m)
    level = "error";
    code = "data_stale";
    const mins =
      newestEventAgeMs != null ? Math.round(newestEventAgeMs / 60_000) : null;
    reason = newestVeryOld
      ? `No 5m/30m mint data; newest mint ${mins != null ? `~${mins}m` : "unknown"} ago (≥30m). Treat as Blockscout/data fault.`
      : `No 5m/30m mint data; newest mint ${mins != null ? `~${mins}m` : "unknown"} ago (≥20m). Treat as data fault.`;
    reasonZh = newestVeryOld
      ? `长时间读不到 5 分钟/30 分钟数据；最新 mint 约 ${mins != null ? mins : "?"} 分钟前（≥30 分钟），判定为数据故障。`
      : `长时间读不到 5 分钟/30 分钟数据；最新 mint 约 ${mins != null ? mins : "?"} 分钟前（≥20 分钟），判定为数据故障。`;
  } else if (pollOkAgeMs != null && pollOkAgeMs > POLL_WARN_MS && !hasRecentWindowData) {
    level = "warn";
    code = "poll_slow";
    reason = `Last successful poll ${Math.round(pollOkAgeMs / 1000)}s ago; short windows empty.`;
    reasonZh = `上次成功轮询在 ${Math.round(pollOkAgeMs / 1000)}s 前；短窗口暂无数据。`;
  } else {
    // Between 10m and 20m gap: still live (not fault yet)
    level = "ok";
    code = "ok";
    const mins =
      newestEventAgeMs != null ? Math.round(newestEventAgeMs / 60_000) : null;
    reason = `OK (short quiet): newest ~${mins ?? "?"}m, mints5m=${mints5m}, mints30m=${mints30m}`;
    reasonZh = `正常（短暂变冷）：最新约 ${mins ?? "?"} 分钟 · 5 分钟 ${mints5m} · 30 分钟 ${mints30m}`;
  }

  // Server-side log when fault (throttled)
  if (level === "error") {
    if (now - lastStaleLogAt > 5 * 60_000) {
      lastStaleLogAt = now;
      console.warn(
        `[mint-radar] health ${level}/${code}: ${reason} | 5m=${mints5m} 10m=${mints10m} 30m=${mints30m} store=${eventMap.size} poll#=${pollCount} failx=${consecutivePollFailures}`
      );
    }
  }

  return {
    level,
    code,
    reason,
    reasonZh,
    pollAgeMs,
    pollOkAgeMs,
    newestEventAt:
      newestTs != null ? new Date(newestTs).toISOString() : null,
    newestEventAgeMs,
    lastIngestAt,
    ingestAgeMs,
    lastPollAdded,
    consecutivePollFailures,
    rateLimited,
    rateLimitRemainMs,
    storeSize: eventMap.size,
    mints5m,
    mints10m,
    mints30m,
    hasRecentWindowData,
    windowsEmpty,
  };
}

/** Fire-and-forget poll that never becomes an unhandled rejection */
function safePollOnce() {
  pollOnce().catch((e) => {
    console.error("[mint-radar] safePollOnce:", e?.message || e);
  });
}

/** Materialize event list only when a true array is required (prefer forEachEvent). */
function allEvents() {
  const out = [];
  forEachEvent((e) => out.push(e));
  return out;
}

/**
 * Finalize a raw per-contract aggregate row into an API row.
 * @param {any} r
 * @param {number} mintsInWindow — mints counted inside the caller's activity window
 */
function finalizeAggregateRow(r, mintsInWindow) {
  const uniqueMinters = r.minters.size;
  let topMethod = null;
  let topMethodN = -1;
  for (const [method, n] of r.methods) {
    if (n > topMethodN) {
      topMethodN = n;
      topMethod = method;
    }
  }
  const mints5m = r.mints5m || 0;
  const mints30m = r.mints30m || 0;
  const mints1h = r.mints1h || 0;
  const score = mints1h;
  const priceWei = r.priceRefWei != null ? r.priceRefWei.toString() : null;
  const priceEth = weiToEthString(r.priceRefWei);
  const priceDisplay = formatPriceLabel(r.priceRefWei);
  const mintedSafe = sanitizeNftMintedCount(
    r.minted ?? r.totalSupply,
    r.holders
  );

  return attachMetaFields({
    contract: r.contract,
    name: r.name,
    symbol: r.symbol,
    holders: r.holders,
    minted: mintedSafe,
    totalSupply: mintedSafe,
    mints: mintsInWindow,
    uniqueMinters,
    topMethod,
    mints5m,
    mints30m,
    mints1h,
    mints1m: r.mints1m || 0,
    mints15m: r.mints15m || 0,
    priceWei,
    priceEth,
    priceDisplay,
    priceMinWei: priceWei,
    priceMaxWei: priceWei,
    priceLastWei: priceWei,
    priceMinEth: priceEth,
    priceMaxEth: priceEth,
    priceLastEth: priceEth,
    priceMixed: false,
    priceUnknown: r.priceUnknown,
    lastMintAt: r.lastMintAt,
    lastTs: r.lastTs,
    lastTx: r.lastTx,
    lastBlock: r.lastBlock,
    explorerToken: r.explorerToken,
    explorerTx: `${EXPLORER}/tx/${r.lastTx}`,
    opensea:
      r.opensea ||
      `https://opensea.io/contract/${OPENSEA_CHAIN}/${r.contract}`,
    score,
    short: short(r.contract),
  });
}

function sortHotRows(list) {
  list.sort(
    (a, b) =>
      b.mints1h - a.mints1h ||
      b.mints30m - a.mints30m ||
      b.mints5m - a.mints5m ||
      b.lastTs - a.lastTs
  );
  return list;
}

/**
 * Single pass over the event store: multi-window mint counts + 1h aggregate state.
 * Avoids N× allEvents() copies that previously OOMed Railway on every /api/mints.
 */
function scanAggregateState(now = Date.now()) {
  const from1 = now - 60_000;
  const from5 = now - 5 * 60_000;
  const from15 = now - 15 * 60_000;
  const from30 = now - 30 * 60_000;
  const from60 = now - 60 * 60_000;

  /** @type {Map<string, any>} */
  const by = new Map();
  /** @type {Set<string>} */
  const priceRecomputed = new Set();

  let mints1m = 0;
  let mints5m = 0;
  let mints10m = 0;
  let mints15m = 0;
  let mints30m = 0;
  let priceKnownEvents = 0;
  /** @type {Set<string>} */
  const collections5mSet = new Set();
  const from10 = now - 10 * 60_000;

  forEachEvent((e) => {
    if (!e) return;
    const ts = e.ts;
    if (e.unitPriceWei != null) priceKnownEvents += 1;

    if (ts != null && Number.isFinite(ts)) {
      if (ts >= from1) mints1m += 1;
      if (ts >= from5) {
        mints5m += 1;
        if (e.contract) collections5mSet.add(e.contract);
      }
      if (ts >= from10) mints10m += 1;
      if (ts >= from15) mints15m += 1;
      if (ts >= from30) mints30m += 1;
    }

    // Hot aggregation only needs ≤1h of activity
    if (ts == null || ts < from60) return;

    hydrateEventPrice(e, priceRecomputed);
    let row = by.get(e.contract);
    if (!row) {
      row = {
        contract: e.contract,
        name: e.name,
        symbol: e.symbol,
        holders: e.holders,
        minted: e.minted ?? e.totalSupply,
        totalSupply: e.minted ?? e.totalSupply,
        mints1m: 0,
        mints5m: 0,
        mints15m: 0,
        mints30m: 0,
        mints1h: 0,
        minters: new Set(),
        methods: new Map(),
        /**
         * Latest mint only — unit wei of that mint's tx (tx.value / mints in tx).
         * Not an average across history; free↔paid follows the newest mint.
         */
        priceRefWei: null,
        priceRefTs: null,
        priceUnknown: 0,
        lastMintAt: e.timestamp,
        lastTs: e.ts,
        lastTx: e.txHash,
        lastBlock: e.blockNumber,
        firstTs: e.ts,
        explorerToken: e.explorerToken,
        opensea: e.opensea,
      };
      by.set(e.contract, row);
    }

    row.mints1h += 1;
    if (ts >= from1) row.mints1m += 1;
    if (ts >= from5) row.mints5m += 1;
    if (ts >= from15) row.mints15m += 1;
    if (ts >= from30) row.mints30m += 1;

    if (e.minter) row.minters.add(e.minter);
    if (e.method) {
      row.methods.set(e.method, (row.methods.get(e.method) || 0) + 1);
    }

    if (e.ts >= row.lastTs) {
      // Newest mint wins (eventOrder is oldest→newest so later events overwrite).
      row.lastTs = e.ts;
      row.lastMintAt = e.timestamp;
      row.lastTx = e.txHash;
      row.lastBlock = e.blockNumber;
      row.name = e.name || row.name;
      row.symbol = e.symbol || row.symbol;
      if (e.holders != null) row.holders = e.holders;
      const m = sanitizeNftMintedCount(
        e.minted ?? e.totalSupply,
        e.holders ?? row.holders
      );
      row.minted = m;
      row.totalSupply = m;
      // Price always from THIS mint only — clear stale free/paid from older mints.
      const unit = toWei(e.unitPriceWei);
      row.priceRefWei = unit; // null → "…"; 0n → Free
      row.priceRefTs = e.ts;
      if (unit == null) row.priceUnknown = (row.priceUnknown || 0) + 1;
    } else {
      const m = sanitizeNftMintedCount(
        e.minted ?? e.totalSupply,
        e.holders ?? row.holders
      );
      if (row.minted == null && m != null) {
        row.minted = m;
        row.totalSupply = m;
      }
      if (toWei(e.unitPriceWei) == null) {
        row.priceUnknown = (row.priceUnknown || 0) + 1;
      }
    }
    if (e.ts < row.firstTs) row.firstTs = e.ts;
  });

  return {
    by,
    stats: {
      mints1m,
      mints5m,
      mints10m,
      mints15m,
      mints30m,
      collections5m: collections5mSet.size,
      priceKnownEvents,
    },
  };
}

/**
 * Build hot list for a window: contracts with activity in that window.
 * mints field = count inside window; ranking still uses mints1h.
 */
function hotFromScan(by, windowMs, limit, now = Date.now()) {
  const from = now - windowMs;
  const list = [];
  for (const r of by.values()) {
    if ((r.lastTs || 0) < from) continue;
    let mintsInWindow = r.mints1h;
    if (windowMs <= 60_000) mintsInWindow = r.mints1m;
    else if (windowMs <= 5 * 60_000) mintsInWindow = r.mints5m;
    else if (windowMs <= 15 * 60_000) mintsInWindow = r.mints15m;
    else if (windowMs <= 30 * 60_000) mintsInWindow = r.mints30m;
    if (mintsInWindow <= 0) continue;
    list.push(finalizeAggregateRow(r, mintsInWindow));
  }
  sortHotRows(list);
  return list.slice(0, Math.max(1, limit));
}

/** @deprecated prefer scanAggregateState — kept for any external callers */
function aggregate(windowMs) {
  const now = Date.now();
  const { by } = scanAggregateState(now);
  return hotFromScan(by, windowMs, 10_000, now);
}

function loadMintedOutArchive() {
  try {
    if (!fs.existsSync(MINTED_OUT_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(MINTED_OUT_FILE, "utf8"));
    const list = Array.isArray(raw) ? raw : raw?.items;
    if (!Array.isArray(list)) return;
    for (const row of list) {
      const c = String(row?.contract || "").toLowerCase();
      if (!c || c.length < 10) continue;
      mintedOutArchive.set(c, { ...row, contract: c, mintedOut: true });
    }
    console.log(
      `[mint-radar] loaded ${mintedOutArchive.size} minted-out archive from ${MINTED_OUT_FILE}`
    );
  } catch (e) {
    console.warn("[mint-radar] load minted-out archive failed:", e.message || e);
  }
}

function saveMintedOutArchive() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const items = [...mintedOutArchive.values()].sort(
      (a, b) => (b.lastTs || 0) - (a.lastTs || 0)
    );
    fs.writeFileSync(
      MINTED_OUT_FILE,
      JSON.stringify({ version: 1, updatedAt: Date.now(), items }, null, 0),
      "utf8"
    );
  } catch (e) {
    console.warn("[mint-radar] save minted-out archive failed:", e.message || e);
  }
}

function scheduleSaveMintedOutArchive() {
  if (mintedOutSaveTimer) return;
  mintedOutSaveTimer = setTimeout(() => {
    mintedOutSaveTimer = null;
    saveMintedOutArchive();
  }, 1500);
}

/**
 * Persist a sold-out collection permanently (until process+disk wiped).
 * Does not remove entries when they fall off the live mint window.
 */
function rememberMintedOut(row) {
  if (!row?.mintedOut) return;
  const c = String(row.contract || "").toLowerCase();
  if (!c || c.length < 10) return;
  const prev = mintedOutArchive.get(c) || {};
  const rowTs = Number(row.lastTs) || 0;
  const prevTs = Number(prev.lastTs) || 0;
  const lastTs = Math.max(rowTs, prevTs, Date.now());
  // Merge fields; prefer non-null newer values — never delete the archive key
  mintedOutArchive.set(c, {
    contract: c,
    name: row.name || prev.name || null,
    symbol: row.symbol || prev.symbol || null,
    icon: row.icon || prev.icon || null,
    maxSupply: row.maxSupply ?? prev.maxSupply ?? null,
    minted: row.minted ?? row.totalSupply ?? prev.minted ?? null,
    totalSupply: row.totalSupply ?? row.minted ?? prev.totalSupply ?? null,
    holders: row.holders ?? prev.holders ?? null,
    lastMintAt:
      rowTs >= prevTs
        ? row.lastMintAt || prev.lastMintAt || null
        : prev.lastMintAt || row.lastMintAt || null,
    lastTs,
    lastTx:
      rowTs >= prevTs
        ? row.lastTx || prev.lastTx || null
        : prev.lastTx || row.lastTx || null,
    explorerToken:
      row.explorerToken || prev.explorerToken || `${EXPLORER}/token/${c}`,
    explorerTx: row.explorerTx || prev.explorerTx || null,
    opensea:
      row.opensea ||
      prev.opensea ||
      `https://opensea.io/contract/${OPENSEA_CHAIN}/${c}`,
    priceDisplay: row.priceDisplay || prev.priceDisplay || null,
    priceEth: row.priceEth ?? prev.priceEth ?? null,
    priceWei: row.priceWei ?? prev.priceWei ?? null,
    tradeVolumeEth: row.tradeVolumeEth ?? prev.tradeVolumeEth ?? null,
    tradeVolumeDisplay:
      row.tradeVolumeDisplay ?? prev.tradeVolumeDisplay ?? null,
    tradeVolumeAt: row.tradeVolumeAt ?? prev.tradeVolumeAt ?? null,
    tradeVolumeStatus:
      row.tradeVolumeStatus ?? prev.tradeVolumeStatus ?? null,
    floorPriceEth: row.floorPriceEth ?? prev.floorPriceEth ?? null,
    floorPriceDisplay:
      row.floorPriceDisplay ?? prev.floorPriceDisplay ?? null,
    floorPriceSymbol:
      row.floorPriceSymbol ?? prev.floorPriceSymbol ?? null,
    mintedOut: true,
    archivedAt: prev.archivedAt || Date.now(),
    updatedAt: Date.now(),
  });
  // First time sold-out hits archive — queue OpenSea volume + floor
  if (
    openSeaApiKey() &&
    (prev.tradeVolumeAt == null || prev.tradeVolumeStatus == null)
  ) {
    setTimeout(() => refreshTradeVolumeForContract(c).catch(() => {}), 0);
  }
  trimMintedOutArchive();
  scheduleSaveMintedOutArchive();
}

/**
 * Pull live sold-out detections into the sticky archive.
 * Uses latest event per contract + meta maxSupply (store only keeps ~1h anyway).
 */
function harvestMintedOutFromBy(by) {
  try {
    for (const r of by.values()) {
      const row = finalizeAggregateRow(r, r.mints1h || 0);
      if (row?.mintedOut) rememberMintedOut(row);
    }
  } catch (e) {
    console.warn("[mint-radar] harvestMintedOut:", e.message || e);
  }
}

function harvestMintedOut() {
  try {
    const { by } = scanAggregateState();
    harvestMintedOutFromBy(by);
  } catch (e) {
    console.warn("[mint-radar] harvestMintedOut:", e.message || e);
  }
}

/**
 * Sold-out list = sticky archive (history) ∪ live detections.
 * Entries are not deleted when mint events age out of the rolling store.
 */
function collectMintedOut(limit = 50, opts = {}) {
  if (!opts.skipHarvest) harvestMintedOut();
  const n = Math.max(5, Math.min(100, Number(limit) || 50));
  const list = [...mintedOutArchive.values()].map((r) => {
    const m = getMeta(r.contract);
    // Only format a display string when we actually have a measured volume.
    // Never invent "0 ETH" for never-fetched rows (UI treats null as pending).
    let tradeVolumeEth =
      r.tradeVolumeEth != null && Number.isFinite(Number(r.tradeVolumeEth))
        ? Number(r.tradeVolumeEth)
        : null;
    // Always re-format from numeric eth when known — avoids stale sci-notation
    // strings left in minted-out.json from older builds.
    let tradeVolumeDisplay =
      tradeVolumeEth != null
        ? formatTradeVolumeDisplay(tradeVolumeEth)
        : r.tradeVolumeDisplay ?? null;
    // If status is ok but display missing, coerce 0
    if (r.tradeVolumeStatus === "ok" && tradeVolumeEth == null) {
      tradeVolumeEth = 0;
      tradeVolumeDisplay = formatTradeVolumeDisplay(0);
    }
    let floorPriceEth =
      r.floorPriceEth != null && Number.isFinite(Number(r.floorPriceEth))
        ? Number(r.floorPriceEth)
        : null;
    let floorPriceDisplay =
      r.floorPriceDisplay ??
      (floorPriceEth != null
        ? formatFloorPriceDisplay(
            floorPriceEth,
            r.floorPriceSymbol || "ETH"
          )
        : null);
    // Do NOT invent floor=0 just because volume was ok historically — wait for a
    // stats pass that wrote floorPrice* (refreshTradeVolumeForContract sets both).
    return {
      ...r,
      icon: m.icon || r.icon || null,
      twitter: m.twitter || null,
      discord: m.discord || null,
      telegram: m.telegram || null,
      website: m.website || null,
      opensea: m.opensea || r.opensea,
      tradeVolumeDisplay,
      tradeVolumeEth,
      tradeVolumeStatus: r.tradeVolumeStatus ?? null,
      tradeVolumeAt: r.tradeVolumeAt ?? null,
      floorPriceEth,
      floorPriceDisplay,
      floorPriceSymbol: r.floorPriceSymbol ?? null,
      mintedOut: true,
    };
  });
  list.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
  const slice = list.slice(0, n);
  if (openSeaApiKey()) {
    const stale = slice.some((r) => {
      const age = Date.now() - (r.tradeVolumeAt || 0);
      return (
        r.tradeVolumeAt == null ||
        r.tradeVolumeStatus == null ||
        r.tradeVolumeStatus === "no_key" ||
        age >= TRADE_VOLUME_TTL_MS
      );
    });
    if (stale) kickTradeVolumeRefresh();
  }
  return slice;
}

/** Hot leaderboard must not show sold-out collections (they live in mintedOut). */
function excludeMintedOutRows(list) {
  if (!Array.isArray(list) || !list.length) return [];
  return list.filter((r) => {
    if (!r) return false;
    if (r.mintedOut) return false;
    const c = String(r.contract || "").toLowerCase();
    if (c && mintedOutArchive.has(c)) return false;
    return true;
  });
}

export function getMintSnapshot(opts = {}) {
  refreshMemoryMode();
  // Keep hot-board prices catching up even when the queue was previously full
  requeueMissingTxPrices();
  const windowMin = Math.max(1, Math.min(60, Number(opts.windowMin) || 60));
  const feedLimit = Math.max(10, Math.min(200, Number(opts.feedLimit) || 80));
  const hotLimit = Math.max(5, Math.min(50, Number(opts.hotLimit) || 25));
  const outLimit = Math.max(5, Math.min(100, Number(opts.outLimit) || 50));
  // out=0 → skip building minted-out payload (client already cached); still harvest for hot filter
  const wantMintedOutPayload =
    opts.includeMintedOut !== false && Number(opts.outLimit) !== 0;

  const windowMs = windowMin * 60 * 1000;
  const now = Date.now();

  // ONE scan: multi-window counts + hot aggregate state (was 4× aggregate + full copies)
  const { by, stats: windowStats } = scanAggregateState(now);
  harvestMintedOutFromBy(by);

  const hot = excludeMintedOutRows(
    hotFromScan(by, windowMs, hotLimit, now)
  );
  const hot1 = excludeMintedOutRows(hotFromScan(by, 60_000, 10, now));
  const hot15 = excludeMintedOutRows(
    hotFromScan(by, 15 * 60_000, 10, now)
  );

  /**
   * King of the Hill — #1 by 1h mint count (same ranking window as hot board).
   * Always from the 1h leaderboard regardless of ?window= for feed/hot size.
   */
  const kingPool = excludeMintedOutRows(
    hotFromScan(by, 60 * 60_000, Math.max(hotLimit, 5), now)
  );
  const king =
    kingPool[0] && Number(kingPool[0].mints1h || kingPool[0].mints || 0) > 0
      ? {
          ...kingPool[0],
          rule: "mints_1h",
          ruleLabel: "1h mint count",
        }
      : null;

  // collectMintedOut would re-harvest; pass archive only (already harvested above)
  const mintedOut = wantMintedOutPayload
    ? collectMintedOut(outLimit, { skipHarvest: true })
    : [];

  /** @type {Set<string>} */
  const feedPriceDone = new Set();
  const events = [];
  // Newest-first feed without materializing the entire store
  for (
    let i = eventOrder.length - 1;
    i >= 0 && events.length < feedLimit;
    i -= 1
  ) {
    const e = eventMap.get(eventOrder[i]);
    if (!e) continue;
    hydrateEventPrice(e, feedPriceDone);
    events.push(attachMetaFields(e));
  }

  let metaOk = 0;
  for (const m of metaCache.values()) {
    if (m.status === "ok") metaOk += 1;
  }

  return {
    ok: true,
    chain: {
      name: "Robinhood Chain",
      chainId: CHAIN_ID,
      explorer: EXPLORER,
    },
    status: {
      lastPollAt,
      lastPollOkAt,
      lastIngestAt,
      lastPollAdded,
      lastError,
      consecutivePollFailures,
      pollCount,
      polling,
      storeSize: eventMap.size,
      latestBlock,
      metaCached: metaCache.size,
      metaOk,
      metaQueue: metaQueue.length,
      priceQueue: txPriceQueue.length,
      priceInFlight: txPriceInFlight,
      priceCache: txPriceCache.size,
      priceOk: txPriceResolvedOk,
      priceErr: txPriceResolvedErr,
      priceKnownEvents: windowStats.priceKnownEvents,
      rateLimited: rateLimitUntil > Date.now(),
      rateLimitRemainMs: Math.max(0, rateLimitUntil - Date.now()),
      memory: processMemoryStats(),
      openSeaHtmlInFlight,
      twitterHtmlQueue: twitterHtmlJobs.length,
      openSeaHtmlEnabled: OPENSEA_HTML_ENABLED,
      memoryDegraded,
      /** OpenSea REST key present (required for minted-out trade volumes) */
      openSeaApiKey: hasOpenSeaApiKey(),
      mintedOutArchiveSize: mintedOutArchive.size,
      tradeVolumeBusy,
      /** Structured diagnosis for UI alert banner */
      health: computeHealth(),
    },
    stats: {
      mints1m: windowStats.mints1m,
      mints5m: windowStats.mints5m,
      mints10m: windowStats.mints10m,
      mints15m: windowStats.mints15m,
      mints30m: windowStats.mints30m,
      collections5m: windowStats.collections5m,
      windowMin,
    },
    hot,
    hot1m: hot1,
    hot15m: hot15,
    /** Current 1h mint-count champion (King of the Hill) */
    king,
    feed: events,
    /** Sticky sold-out history (file-backed; not cleared when events age out) */
    mintedOut,
    mintedOutArchiveSize: mintedOutArchive.size,
    blacklist: [...BLACKLIST],
  };
}

/**
 * Wallet NFT inventory via Blockscout (ERC-721 + ERC-1155).
 * Caps pages so a heavy bag does not stall the UI.
 */
export async function fetchWalletNfts(address, opts = {}) {
  const addr = String(address || "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) {
    const err = new Error("invalid address");
    err.code = "BAD_ADDRESS";
    throw err;
  }
  const maxItems = Math.max(1, Math.min(200, Number(opts.maxItems) || 120));
  const maxPages = Math.max(1, Math.min(6, Number(opts.maxPages) || 3));

  const items = [];
  let nextParams = null;
  let pages = 0;
  let truncated = false;

  while (pages < maxPages && items.length < maxItems) {
    pages += 1;
    const url = new URL(`${BLOCKSCOUT}/api/v2/addresses/${addr}/nft`);
    url.searchParams.set("type", "ERC-721,ERC-1155");
    if (nextParams && typeof nextParams === "object") {
      for (const [k, v] of Object.entries(nextParams)) {
        if (v != null && v !== "") url.searchParams.set(k, String(v));
      }
    }
    // Reuse fetchJson — honors api key, timeout, and global 429 backoff
    let data;
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        data = await fetchJson(url.toString());
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt === 0) await sleep(400);
      }
    }
    if (lastErr) {
      const err = new Error(lastErr?.message || String(lastErr));
      err.code = "UPSTREAM";
      throw err;
    }
    const batch = Array.isArray(data?.items) ? data.items : [];
    for (const raw of batch) {
      if (items.length >= maxItems) {
        truncated = true;
        break;
      }
      const token = raw?.token || {};
      const contract = String(token.address_hash || "").toLowerCase();
      if (contract && BLACKLIST.has(contract)) continue;
      if (isVeOrGovNft(token, null) || isJunkToken(token, null)) continue;
      const tokenId = String(raw?.id ?? raw?.token_id ?? "");
      const metaName = raw?.metadata?.name;
      const collection = String(token.name || token.symbol || "NFT").trim();
      const name =
        (metaName && String(metaName).trim()) ||
        (collection && tokenId ? `${collection} #${tokenId}` : collection) ||
        (tokenId ? `#${tokenId}` : "NFT");
      const image =
        raw?.image_url ||
        raw?.media_url ||
        raw?.metadata?.image ||
        token.icon_url ||
        null;
      items.push({
        contract: contract || null,
        tokenId: tokenId || null,
        name,
        collection,
        symbol: token.symbol || null,
        image,
        tokenType: raw?.token_type || token.type || null,
        explorerToken: contract
          ? `${EXPLORER}/token/${contract}${tokenId ? `/instance/${tokenId}` : ""}`
          : null,
        opensea: contract
          ? `https://opensea.io/item/${OPENSEA_CHAIN}/${contract}/${tokenId || ""}`
          : null,
      });
    }
    nextParams = data?.next_page_params || null;
    if (!nextParams || !batch.length) break;
    if (items.length >= maxItems) {
      truncated = true;
      break;
    }
  }
  if (nextParams) truncated = true;

  return {
    ok: true,
    address: addr,
    count: items.length,
    truncated,
    items,
  };
}

/** Force-refresh OpenSea trade volumes for all minted-out archive entries. */
export async function refreshMintedOutTradeVolumes({ force = true } = {}) {
  const summary = await refreshAllTradeVolumes({ force });
  const items = collectMintedOut(100, { skipHarvest: true }).map((r) => ({
    contract: r.contract,
    name: r.name,
    tradeVolumeEth: r.tradeVolumeEth,
    tradeVolumeDisplay: r.tradeVolumeDisplay,
    tradeVolumeStatus: r.tradeVolumeStatus,
    tradeVolumeAt: r.tradeVolumeAt,
    floorPriceEth: r.floorPriceEth,
    floorPriceDisplay: r.floorPriceDisplay,
    floorPriceSymbol: r.floorPriceSymbol,
  }));
  return {
    count: items.length,
    summary,
    items,
  };
}

export function startMintRadar() {
  if (pollTimer) return;
  // Init proxy once logs are about to start (env already loaded via load-env.js)
  getProxyAgent();
  loadMintedOutArchive();
  trimMintedOutArchive();
  console.log("[mint-radar] starting (Blockscout poll)");
  console.log(`[mint-radar] DATA_DIR=${DATA_DIR}`);
  console.log(
    `[mint-radar] memory guards: events≤${MAX_EVENTS} meta≤${META_CACHE_MAX} txPrice≤${TX_PRICE_CACHE_MAX} queues meta/tx/html=${META_QUEUE_MAX}/${TX_PRICE_QUEUE_MAX}/${TWITTER_HTML_QUEUE_MAX} priceWorkers=${TX_PRICE_CONCURRENCY} gap=${TX_PRICE_GAP_MS}ms html=${OPENSEA_HTML_ENABLED ? "on" : "OFF"}≤${Math.round(OPENSEA_HTML_MAX_BYTES / 1024)}KB degrade≥${RSS_DEGRADE_MB}MB`
  );
  if (openSeaApiKey()) {
    console.log(
      "[mint-radar] OpenSea API key enabled (meta + minted-out 交易额)"
    );
    // First pass shortly after boot (archive already loaded)
    setTimeout(() => kickTradeVolumeRefresh(), 5000);
    tradeVolumeTimer = setInterval(() => {
      refreshAllTradeVolumes({ force: true }).catch((e) => {
        console.warn(
          "[mint-radar] trade volume interval:",
          formatFetchError(e)
        );
      });
    }, TRADE_VOLUME_TTL_MS);
    tradeVolumeTimer.unref?.();
  } else {
    console.warn(
      "[mint-radar] OPENSEA_API_KEY unset — minted-out 交易额 disabled. Set Railway Variable OPENSEA_API_KEY (OpenSea free API key)."
    );
  }
  if (!OPENSEA_HTML_ENABLED) {
    console.log(
      "[mint-radar] OpenSea HTML scrape disabled (default). Set OPENSEA_HTML_ENABLED=1 only if needed"
    );
  }
  // Periodic RSS check — auto-degrade + warn before Railway OOM
  setInterval(() => {
    refreshMemoryMode();
    const mem = processMemoryStats();
    if (mem.rssMb >= 300 || mem.heapUsedMb >= 200 || memoryDegraded) {
      console.warn(
        `[mint-radar] memory rss=${mem.rssMb}MB heap=${mem.heapUsedMb}MB degraded=${memoryDegraded} store=${eventMap.size} meta=${metaCache.size} price=${txPriceCache.size} mintedOut=${mintedOutArchive.size} txIdx=${eventsByTx.size}`
      );
    }
  }, 3 * 60_000).unref?.();
  safePollOnce();
  pollTimer = setInterval(safePollOnce, POLL_MS);
}

export function stopMintRadar() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (tradeVolumeTimer) {
    clearInterval(tradeVolumeTimer);
    tradeVolumeTimer = null;
  }
}
