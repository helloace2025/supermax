/**
 * ROBIN NFT Radar — standalone Express entry
 * Only serves mint radar API + static UI.
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getMintSnapshot, startMintRadar } from "./mint-radar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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
    const snap = getMintSnapshot({
      windowMin: req.query.window,
      feedLimit: req.query.feed,
      hotLimit: req.query.hot,
    });
    res.json(snap);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
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
