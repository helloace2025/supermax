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
const PORT = Number(process.env.PORT) || 3789;
/** Railway / Docker / VPS need 0.0.0.0; localhost-only binds break public deploy */
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
// HTML always revalidated; CSS/JS use query ?v= on links for cache bust while iterating UI
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

app.get("/api/health", (_req, res) => {
  const snap = getMintSnapshot({ windowMin: 5, feedLimit: 1, hotLimit: 1 });
  res.json({
    ok: true,
    product: "robin-nft-radar",
    chain: snap.chain,
    status: snap.status,
  });
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

// Default page = mint radar
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "mint.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`\n  ROBIN NFT Radar`);
  console.log(`  → http://${HOST}:${PORT}`);
  console.log(`  → http://localhost:${PORT}/mint.html`);
  console.log(`  Chain: Robinhood (4663)\n`);
  startMintRadar();
});
