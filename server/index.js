/**
 * ROBIN NFT Radar — standalone Express entry
 * Only serves mint radar API + static UI.
 */

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getMintSnapshot,
  startMintRadar,
  fetchWalletNfts,
  refreshMintedOutTradeVolumes,
} from "./mint-radar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/** Load .env into process.env (local dev; Railway uses dashboard vars). */
function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] == null) process.env[key] = val;
  }
}
loadDotEnv();
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, "data");
const RAFFLES_PATH = path.join(DATA_DIR, "raffles.json");

/** Default seed when data/raffles.json is missing */
const DEFAULT_RAFFLES = {
  version: 1,
  updatedAt: null,
  rules: {
    zh: "持有社区 NFT 即可参与。按 token 编号随机抽取（持有越多，号码越多，中签概率越高）；同一地址单期最多中 1 次，若多个号落在同一地址只计 1 个名额并重抽。若希望有机会获得多个名额，可将 NFT 分至不同钱包。开奖后即时公示。",
    en: "Hold our community NFT to enter. We draw random token IDs (more NFTs = more tickets = higher odds). Max 1 win per wallet per round — if several of your IDs hit, only one counts and we redraw. To pursue multiple spots, split NFTs across wallets. Results are published immediately.",
  },
  rounds: [],
};

function loadRaffles() {
  try {
    if (fs.existsSync(RAFFLES_PATH)) {
      const raw = fs.readFileSync(RAFFLES_PATH, "utf8");
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.rounds)) return data;
    }
  } catch (e) {
    console.error("[raffles] load failed:", e?.message || e);
  }
  return { ...DEFAULT_RAFFLES, rounds: [] };
}

// Railway injects PORT; bind all interfaces for container networking
const PORT = Number(process.env.PORT) || 3789;
const HOST = process.env.HOST || "0.0.0.0";

// Railway: unhandled async errors must NOT kill the web process
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err?.message || err);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err?.message || err);
  // keep process alive for HTTP; only exit on listen failures below
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

app.use(
  express.static(path.join(ROOT, "public"), {
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  })
);

// Railway network healthcheck — keep it trivial (no heavy snapshot work)
app.get("/api/health", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

app.get("/health", (_req, res) => {
  res.status(200).type("text/plain").send("ok");
});

// Richer status for debugging (not used by Railway healthcheck)
app.get("/api/status", (_req, res) => {
  try {
    const snap = getMintSnapshot({ windowMin: 5, feedLimit: 1, hotLimit: 1 });
    res.status(200).json({
      ok: true,
      product: "robin-nft-radar",
      chain: snap.chain,
      status: snap.status,
    });
  } catch (e) {
    res.status(200).json({
      ok: true,
      product: "robin-nft-radar",
      degraded: true,
      error: e.message || String(e),
    });
  }
});

app.get("/api/mints", (req, res) => {
  try {
    // out=0 → omit mintedOut array (client keeps sticky local list; still harvested server-side for hot filter)
    const outRaw = req.query.out;
    const outLimit =
      outRaw === "0" || outRaw === 0 ? 0 : outRaw != null ? outRaw : 50;
    const snap = getMintSnapshot({
      windowMin: req.query.window,
      feedLimit: req.query.feed,
      hotLimit: req.query.hot,
      outLimit,
      includeMintedOut: outLimit !== 0,
    });
    res.json(snap);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

// Connected wallet NFT inventory (Blockscout)
app.get("/api/wallet/nfts", async (req, res) => {
  try {
    const address = String(req.query.address || "").trim();
    const data = await fetchWalletNfts(address);
    res.json(data);
  } catch (e) {
    const code = e?.code;
    if (code === "BAD_ADDRESS") {
      res.status(400).json({ ok: false, error: "invalid address" });
      return;
    }
    console.error("[wallet/nfts]", e?.message || e);
    res.status(502).json({
      ok: false,
      error: e?.message || String(e),
    });
  }
});

// One-shot / manual refresh of minted-out OpenSea trade volumes
app.post("/api/minted-out/refresh-volumes", async (_req, res) => {
  try {
    const items = await refreshMintedOutTradeVolumes({ force: true });
    res.json({ ok: true, count: items.length, items });
  } catch (e) {
    console.error("[minted-out/refresh-volumes]", e?.message || e);
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// Whitelist raffle rounds (public read — edit data/raffles.json to publish)
app.get("/api/raffles", (_req, res) => {
  try {
    const data = loadRaffles();
    const rounds = [...(data.rounds || [])].sort(
      (a, b) => Number(b.period || 0) - Number(a.period || 0)
    );
    res.json({
      ok: true,
      version: data.version || 1,
      updatedAt: data.updatedAt || null,
      rules: data.rules || DEFAULT_RAFFLES.rules,
      rounds,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "mint.html"));
});

const server = app.listen(PORT, HOST, () => {
  console.log(`\n  ROBIN NFT Radar`);
  console.log(`  listening ${HOST}:${PORT}`);
  console.log(`  health → /api/health`);
  console.log(`  Chain: Robinhood (4663)\n`);

  // Start poller after HTTP is up so healthcheck can pass during deploy
  setImmediate(() => {
    try {
      startMintRadar();
    } catch (e) {
      console.error("[mint-radar] failed to start poller:", e);
    }
  });
});

server.on("error", (err) => {
  console.error("[server] listen error:", err);
  process.exit(1);
});
