/**
 * ROBIN NFT Radar (Robinhood Chain)
 * Polls Blockscout advanced-filters, keeps sliding-window aggregates.
 *
 * HTTP: Node 20+ built-in fetch only (undici@8 crashes on Node 20.19 —
 * `webidl.util.markAsUncloneable is not a function`).
 * For local Clash, use TUN/system proxy — do not rely on HTTPS_PROXY+undici.
 *
 * Minted-out archive: once a collection is detected as sold out it is kept in
 * memory + JSON file (DATA_DIR) so it does not disappear when mint events age out.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
/** @deprecated alias — keep internal code readable */
const BLOCKSCOUT = BLOCKSCOUT_API;

if (typeof globalThis.fetch !== "function") {
  throw new Error("Node 18+ required (global fetch missing)");
}

if (BLOCKSCOUT_API_KEY) {
  console.log(`[mint-radar] Blockscout API key enabled`);
}
const _proxyHint =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy ||
  "";
if (_proxyHint && /127\.0\.0\.1|localhost/i.test(_proxyHint)) {
  console.log(
    `[mint-radar] note: HTTPS_PROXY=${_proxyHint} is ignored (using Node fetch; use Clash TUN for local proxy)`
  );
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

const MAX_EVENTS = 4000;
/** Sticky minted-out history (survives event eviction; file survives restarts if volume set) */
const __radarDir = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__radarDir, "..", "data");
const MINTED_OUT_FILE = path.join(DATA_DIR, "minted-out.json");
/** @type {Map<string, object>} contract -> archived sold-out row */
const mintedOutArchive = new Map();
let mintedOutSaveTimer = null;

/** Main mint poll interval — leave headroom under Blockscout rate limits */
const POLL_MS = 5000;
const FETCH_TIMEOUT_MS = 12000;
/** Tx price lookups share the same Blockscout quota as poll — keep low. */
const TX_PRICE_CONCURRENCY = 1;
const TX_PRICE_GAP_MS = 350;
const TX_PRICE_CACHE_MAX = 8000;
const TX_PRICE_ERROR_COOLDOWN_MS = 30_000;
/** Global pause after HTTP 429 so poll + price workers back off together */
const RATE_LIMIT_BACKOFF_MS = 8_000;
let rateLimitUntil = 0;

/** @type {Map<string, object>} eventKey -> mint event */
const eventMap = new Map();
/** ordered keys (oldest first) for eviction */
const eventOrder = [];

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
/** @type {Set<string>} */
const metaQueued = new Set();
/** @type {string[]} */
const metaQueue = [];
let metaBusy = false;

let polling = false;
let pollTimer = null;
let lastPollAt = null;
let lastError = null;
let pollCount = 0;
let latestBlock = null;

const META_OK_TTL_MS = 30 * 60 * 1000;
const META_MISS_TTL_MS = 5 * 60 * 1000;
const META_GAP_MS = 350;

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

/** Single reference price only (no ranges). 0 / dust-rounds-to-0 → Free. */
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
  let n = 0;
  for (const e of allEvents()) {
    if (String(e.txHash || "").toLowerCase() === h) n += 1;
  }
  return n;
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
  for (const e of allEvents()) {
    if (String(e.txHash || "").toLowerCase() !== h) continue;
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

function eventKey(item) {
  return [
    item.hash || "",
    item.token_transfer_index ?? "",
    item.token?.address_hash || "",
    item.total?.token_id ?? "",
  ].join(":");
}

function isJunkToken(token) {
  if (!token) return true;
  const addr = String(token.address_hash || "").toLowerCase();
  if (BLACKLIST.has(addr)) return true;
  const name = token.name || "";
  const symbol = token.symbol || "";
  if (JUNK_RE.test(name) || JUNK_RE.test(symbol)) return true;
  return false;
}

function isMintItem(item) {
  if (!item || item.type !== "ERC-721") return false;
  const from = String(item.from?.hash || "").toLowerCase();
  if (from !== ZERO) return false;
  if (isJunkToken(item.token)) return false;
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
  };
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
    const res = await fetch(`${BLOCKSCOUT}/api/eth-rpc`, {
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
  if (!metaCache.has(key)) metaCache.set(key, emptyMeta(key));
  return metaCache.get(key);
}

function needsEnrich(meta) {
  if (!meta || meta.status === "pending") return true;
  // Never tried maxSupply (or process started before eth-rpc fix)
  if (meta.maxSupplyStatus == null) return true;

  const age = Date.now() - (meta.updatedAt || 0);
  const supplyAge = Date.now() - (meta.maxSupplyCheckedAt || meta.updatedAt || 0);

  // maxSupply miss must NOT wait for full 30m social meta TTL — retry often
  if (meta.maxSupplyStatus !== "ok" && supplyAge > 60_000) return true;

  if (meta.status === "ok") return age > META_OK_TTL_MS;
  if (meta.status === "miss" || meta.status === "error") return age > META_MISS_TTL_MS;
  return true;
}

function queueMeta(contract, hintIcon = null) {
  const key = String(contract || "").toLowerCase();
  if (!key || key.length < 10) return;
  const meta = getMeta(key);
  if (hintIcon && !meta.icon) meta.icon = hintIcon;
  if (!needsEnrich(meta)) return;
  if (metaQueued.has(key)) return;
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

async function enrichFromOpenSea(contract) {
  const c = String(contract).toLowerCase();
  const contractUrl = `https://api.opensea.io/api/v2/chain/${OPENSEA_CHAIN}/contract/${c}`;
  const info = await fetchJson(contractUrl);
  const slug = info?.collection;
  if (!slug) return null;

  const col = await fetchJson(`https://api.opensea.io/api/v2/collections/${encodeURIComponent(slug)}`);
  return {
    icon: resolveMediaUrl(col?.image_url) || null,
    twitter: twitterUrl(col?.twitter_username),
    discord: col?.discord_url || null,
    telegram: col?.telegram_url || null,
    website: col?.project_url || null,
    description: col?.description || null,
    slug,
    opensea:
      col?.opensea_url ||
      `https://opensea.io/collection/${encodeURIComponent(slug)}`,
    source: "opensea",
  };
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
      // OpenSea miss / rate limit — fall through
      if (!String(e.message || "").includes("HTTP 404")) {
        console.warn(`[mint-radar] opensea meta ${short(contract)}:`, e.message || e);
      }
    }

    if (got) {
      meta.icon = got.icon || hintIcon || null;
      meta.twitter = got.twitter || null;
      meta.discord = got.discord || null;
      meta.telegram = got.telegram || null;
      meta.website = got.website || null;
      meta.description = got.description || null;
      meta.slug = got.slug || null;
      meta.opensea = got.opensea || meta.opensea;
      meta.source = got.source;
      meta.status = meta.icon || meta.twitter || meta.discord ? "ok" : "miss";
      await enrichMaxSupply(meta, contract);
      meta.updatedAt = Date.now();
      return meta;
    }

    // Blockscout image fallback
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
    eventMap.delete(old);
  }
  // keep ≥1h so hot table can show 5m / 30m / 1h mint counts
  const cutoff = Date.now() - 65 * 60 * 1000;
  while (eventOrder.length) {
    const k = eventOrder[0];
    const e = eventMap.get(k);
    if (!e || e.ts >= cutoff) break;
    eventOrder.shift();
    eventMap.delete(k);
  }
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
    const res = await fetch(withApiKey(url), {
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
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
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
        lastPollAt = new Date().toISOString();
        lastError = null;
        pollCount += 1;
        if (totalAdded > 0) {
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
      console.error("[mint-radar] poll failed:", lastError);
    } else {
      // Archive any newly sold-out collections after a successful poll
      harvestMintedOut();
    }
  } catch (e) {
    // Never let poll crash the process (Railway marks CRASHED on unhandled rejections)
    lastError = e?.message || String(e);
    console.error("[mint-radar] pollOnce fatal (swallowed):", lastError);
  } finally {
    polling = false;
  }
}

/** Fire-and-forget poll that never becomes an unhandled rejection */
function safePollOnce() {
  pollOnce().catch((e) => {
    console.error("[mint-radar] safePollOnce:", e?.message || e);
  });
}

function allEvents() {
  const out = [];
  for (const k of eventOrder) {
    const e = eventMap.get(k);
    if (e) out.push(e);
  }
  return out;
}

/** Count mints per contract within a sliding window (integers only). */
function mintCountsByContract(windowMs, now = Date.now()) {
  const from = now - windowMs;
  /** @type {Map<string, number>} */
  const map = new Map();
  for (const e of allEvents()) {
    if (e.ts < from) continue;
    map.set(e.contract, (map.get(e.contract) || 0) + 1);
  }
  return map;
}

function aggregate(windowMs) {
  const now = Date.now();
  const from = now - windowMs;
  const counts5m = mintCountsByContract(5 * 60 * 1000, now);
  const counts30m = mintCountsByContract(30 * 60 * 1000, now);
  const counts1h = mintCountsByContract(60 * 60 * 1000, now);
  /** @type {Map<string, any>} */
  const by = new Map();

  /** @type {Set<string>} */
  const priceRecomputed = new Set();
  for (const e of allEvents()) {
    if (e.ts < from) continue;
    // Ensure unit price is stamped before aggregation (cache may have resolved later)
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
        mints: 0,
        minters: new Set(),
        methods: new Map(),
        /**
         * Reference unit price = unit from the most recent mint with a known price.
         * (unit = tx.value / # NFTs in that tx — e.g. 0.000025/5 → 0.000005)
         * Prefer "current" over sticky first — first was often wrong when batch qty
         * arrived late, and free→paid projects need the paid unit.
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
    row.mints += 1;
    if (e.minter) row.minters.add(e.minter);
    if (e.method) {
      row.methods.set(e.method, (row.methods.get(e.method) || 0) + 1);
    }

    const unit = toWei(e.unitPriceWei);
    if (unit == null) {
      row.priceUnknown += 1;
    } else if (row.priceRefTs == null || e.ts >= row.priceRefTs) {
      // Latest known unit (recomputed after batch qty fix)
      row.priceRefWei = unit;
      row.priceRefTs = e.ts;
    }

    // refresh metadata from newest
    if (e.ts >= row.lastTs) {
      row.lastTs = e.ts;
      row.lastMintAt = e.timestamp;
      row.lastTx = e.txHash;
      row.lastBlock = e.blockNumber;
      row.name = e.name || row.name;
      row.symbol = e.symbol || row.symbol;
      if (e.holders != null) row.holders = e.holders;
      // Newest event wins — including null after sanitize (clears veNFT garbage)
      const m = sanitizeNftMintedCount(
        e.minted ?? e.totalSupply,
        e.holders ?? row.holders
      );
      row.minted = m;
      row.totalSupply = m;
    } else {
      const m = sanitizeNftMintedCount(
        e.minted ?? e.totalSupply,
        e.holders ?? row.holders
      );
      if (row.minted == null && m != null) {
        row.minted = m;
        row.totalSupply = m;
      }
    }
    if (e.ts < row.firstTs) row.firstTs = e.ts;
  }

  const list = [...by.values()].map((r) => {
    const uniqueMinters = r.minters.size;
    const topMethod =
      [...r.methods.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const mints5m = counts5m.get(r.contract) || 0;
    const mints30m = counts30m.get(r.contract) || 0;
    const mints1h = counts1h.get(r.contract) || 0;
    // Rank by 1h mint volume only (higher total = hotter)
    const score = mints1h;
    const priceWei =
      r.priceRefWei != null ? r.priceRefWei.toString() : null;
    const priceEth = weiToEthString(r.priceRefWei);
    const priceDisplay = formatPriceLabel(r.priceRefWei);
    // Final guard: drop absurd minted left over from older process versions
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
      mints: r.mints,
      uniqueMinters,
      topMethod,
      mints5m,
      mints30m,
      mints1h,
      // single reference = latest known unit price (tx.value / mint count)
      priceWei,
      priceEth,
      priceDisplay,
      // legacy aliases (same single value; no ranges)
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
  });

  // Primary: 1h total mints; ties → 30m → 5m → recency
  list.sort(
    (a, b) =>
      b.mints1h - a.mints1h ||
      b.mints30m - a.mints30m ||
      b.mints5m - a.mints5m ||
      b.lastTs - a.lastTs
  );
  return list;
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
    mintedOut: true,
    archivedAt: prev.archivedAt || Date.now(),
    updatedAt: Date.now(),
  });
  scheduleSaveMintedOutArchive();
}

/** Pull live sold-out detections into the sticky archive. */
function harvestMintedOut() {
  try {
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    for (const r of aggregate(windowMs)) {
      if (r?.mintedOut) rememberMintedOut(r);
    }
  } catch (e) {
    console.warn("[mint-radar] harvestMintedOut:", e.message || e);
  }
}

/**
 * Sold-out list = sticky archive (history) ∪ live detections.
 * Entries are not deleted when mint events age out of the rolling store.
 */
function collectMintedOut(limit = 50) {
  harvestMintedOut();
  const n = Math.max(5, Math.min(100, Number(limit) || 50));
  const list = [...mintedOutArchive.values()].map((r) => {
    const m = getMeta(r.contract);
    return {
      ...r,
      icon: m.icon || r.icon || null,
      twitter: m.twitter || null,
      discord: m.discord || null,
      telegram: m.telegram || null,
      website: m.website || null,
      opensea: m.opensea || r.opensea,
      mintedOut: true,
    };
  });
  list.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
  return list.slice(0, n);
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
  const windowMin = Math.max(1, Math.min(60, Number(opts.windowMin) || 60));
  const feedLimit = Math.max(10, Math.min(200, Number(opts.feedLimit) || 80));
  const hotLimit = Math.max(5, Math.min(50, Number(opts.hotLimit) || 25));
  const outLimit = Math.max(5, Math.min(100, Number(opts.outLimit) || 50));
  // out=0 → skip building minted-out payload (client already cached); still harvest for hot filter
  const wantMintedOutPayload = opts.includeMintedOut !== false && Number(opts.outLimit) !== 0;

  const windowMs = windowMin * 60 * 1000;
  // Archive any live sold-outs first so hot filter + payload stay consistent
  harvestMintedOut();
  const hot = excludeMintedOutRows(aggregate(windowMs)).slice(0, hotLimit);
  const hot1 = excludeMintedOutRows(aggregate(60 * 1000)).slice(0, 10);
  const hot15 = excludeMintedOutRows(aggregate(15 * 60 * 1000)).slice(0, 10);
  const mintedOut = wantMintedOutPayload ? collectMintedOut(outLimit) : [];

  /** @type {Set<string>} */
  const feedPriceDone = new Set();
  const events = allEvents()
    .slice()
    .reverse()
    .slice(0, feedLimit)
    .map((e) => {
      hydrateEventPrice(e, feedPriceDone);
      return attachMetaFields(e);
    });

  const now = Date.now();
  const mints1m = allEvents().filter((e) => e.ts >= now - 60_000).length;
  const mints5m = allEvents().filter((e) => e.ts >= now - 5 * 60_000).length;
  const mints15m = allEvents().filter((e) => e.ts >= now - 15 * 60_000).length;
  const collections5m = new Set(
    allEvents()
      .filter((e) => e.ts >= now - 5 * 60_000)
      .map((e) => e.contract)
  ).size;

  const metaOk = [...metaCache.values()].filter((m) => m.status === "ok").length;
  let priceKnownEvents = 0;
  for (const e of allEvents()) {
    if (e.unitPriceWei != null) priceKnownEvents += 1;
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
      lastError,
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
      priceKnownEvents,
    },
    stats: {
      mints1m,
      mints5m,
      mints15m,
      collections5m,
      windowMin,
    },
    hot,
    hot1m: hot1,
    hot15m: hot15,
    feed: events,
    /** Sticky sold-out history (file-backed; not cleared when events age out) */
    mintedOut,
    mintedOutArchiveSize: mintedOutArchive.size,
    blacklist: [...BLACKLIST],
  };
}

export function startMintRadar() {
  if (pollTimer) return;
  loadMintedOutArchive();
  console.log("[mint-radar] starting (Blockscout poll)");
  console.log(`[mint-radar] DATA_DIR=${DATA_DIR}`);
  safePollOnce();
  pollTimer = setInterval(safePollOnce, POLL_MS);
}

export function stopMintRadar() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
