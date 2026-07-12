/**
 * Robinhood Chain NFT Mint Radar
 * Polls Blockscout advanced-filters, keeps sliding-window aggregates.
 */

import { fetch as undiciFetch, ProxyAgent } from "undici";

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

/** Prefer system HTTP(S)_PROXY (common on Windows with Clash/V2Ray) */
const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.https_proxy ||
  process.env.http_proxy ||
  "";
const proxyAgent = PROXY_URL ? new ProxyAgent(PROXY_URL) : undefined;
if (proxyAgent) {
  console.log(`[mint-radar] using proxy ${PROXY_URL}`);
}
if (BLOCKSCOUT_API_KEY) {
  console.log(`[mint-radar] Blockscout API key enabled`);
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
const POLL_MS = 2000;
const FETCH_TIMEOUT_MS = 12000;

/** @type {Map<string, object>} eventKey -> mint event */
const eventMap = new Map();
/** ordered keys (oldest first) for eviction */
const eventOrder = [];

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
  };
}

function getMeta(contract) {
  const key = String(contract || "").toLowerCase();
  if (!key) return emptyMeta("");
  if (!metaCache.has(key)) metaCache.set(key, emptyMeta(key));
  return metaCache.get(key);
}

function needsEnrich(meta) {
  if (!meta || meta.status === "pending") return true;
  const age = Date.now() - (meta.updatedAt || 0);
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
      meta.updatedAt = Date.now();
      return meta;
    }

    // Blockscout image fallback
    const bs = await enrichFromBlockscout(contract);
    if (bs?.icon || hintIcon) {
      meta.icon = bs?.icon || hintIcon;
      meta.source = bs?.source || "stream";
      meta.status = "ok";
      meta.updatedAt = Date.now();
      return meta;
    }

    meta.status = "miss";
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
  };
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
  return {
    key: eventKey(item),
    txHash: item.hash,
    blockNumber: item.block_number ?? null,
    timestamp: item.timestamp,
    ts,
    method: item.method || null,
    tokenId: item.total?.token_id ?? null,
    contract,
    name: item.token?.name || "Unknown",
    symbol: item.token?.symbol || "?",
    holders: item.token?.holders_count != null ? Number(item.token.holders_count) : null,
    totalSupply:
      item.token?.total_supply != null ? Number(item.token.total_supply) : null,
    minter,
    minterShort: short(minter),
    icon: streamIcon || getMeta(contract).icon || null,
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
  for (const raw of items) {
    if (!isMintItem(raw)) continue;
    const m = normalizeMint(raw);
    if (eventMap.has(m.key)) continue;
    eventMap.set(m.key, m);
    eventOrder.push(m.key);
    added += 1;
    if (m.blockNumber != null) {
      latestBlock =
        latestBlock == null ? m.blockNumber : Math.max(latestBlock, m.blockNumber);
    }
  }
  trimEvents();
  return added;
}

function withApiKey(url) {
  if (!BLOCKSCOUT_API_KEY) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}apikey=${encodeURIComponent(BLOCKSCOUT_API_KEY)}`;
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await undiciFetch(withApiKey(url), {
      signal: ctrl.signal,
      dispatcher: proxyAgent,
      headers: {
        Accept: "application/json",
        "User-Agent": "rh-nft-mint-radar/1.0",
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
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
  } catch (e) {
    lastError = e.message || String(e);
    console.error("[mint-radar] poll failed:", lastError);
  } finally {
    polling = false;
  }
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

  for (const e of allEvents()) {
    if (e.ts < from) continue;
    let row = by.get(e.contract);
    if (!row) {
      row = {
        contract: e.contract,
        name: e.name,
        symbol: e.symbol,
        holders: e.holders,
        totalSupply: e.totalSupply,
        mints: 0,
        minters: new Set(),
        methods: new Map(),
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
    // refresh metadata from newest
    if (e.ts >= row.lastTs) {
      row.lastTs = e.ts;
      row.lastMintAt = e.timestamp;
      row.lastTx = e.txHash;
      row.lastBlock = e.blockNumber;
      row.name = e.name || row.name;
      row.symbol = e.symbol || row.symbol;
      if (e.holders != null) row.holders = e.holders;
      if (e.totalSupply != null) row.totalSupply = e.totalSupply;
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

    return attachMetaFields({
      contract: r.contract,
      name: r.name,
      symbol: r.symbol,
      holders: r.holders,
      totalSupply: r.totalSupply,
      mints: r.mints,
      uniqueMinters,
      topMethod,
      mints5m,
      mints30m,
      mints1h,
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

export function getMintSnapshot(opts = {}) {
  const windowMin = Math.max(1, Math.min(60, Number(opts.windowMin) || 60));
  const feedLimit = Math.max(10, Math.min(200, Number(opts.feedLimit) || 80));
  const hotLimit = Math.max(5, Math.min(50, Number(opts.hotLimit) || 25));

  const windowMs = windowMin * 60 * 1000;
  const hot = aggregate(windowMs).slice(0, hotLimit);
  const hot1 = aggregate(60 * 1000).slice(0, 10);
  const hot15 = aggregate(15 * 60 * 1000).slice(0, 10);

  const events = allEvents()
    .slice()
    .reverse()
    .slice(0, feedLimit)
    .map((e) => attachMetaFields(e));

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
    blacklist: [...BLACKLIST],
  };
}

export function startMintRadar() {
  if (pollTimer) return;
  console.log("[mint-radar] starting (Blockscout poll)");
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_MS);
}

export function stopMintRadar() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
