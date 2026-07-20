# ROBIN NFT Radar

Real-time NFT mint leaderboard for **Robinhood Chain** (chainId `4663`).

- Hot list ranked by **1h mint volume** (5m / 30m columns)
- Live mint feed · **Minted Out** panel · price filter · favorites · risk siren
- OpenSea / Blockscout / Google Lens · ZH / EN · light / dark

## Local

```bash
npm install
npm start
# http://localhost:3789
# or http://localhost:3789/mint.html
```

Optional local proxy / keys: copy `.env.example` → `.env` (not used by default; process env only).

## Deploy on Railway

This repo is already wired for Railway:

| File | Role |
|------|------|
| `railway.toml` | Nixpacks build, `npm start`, healthcheck `/api/health` |
| `nixpacks.toml` | Node 20 + `npm ci` |
| `package.json` | `"start": "node server/index.js"` |
| `server/index.js` | listens on `PORT` + `0.0.0.0` |

### Steps

1. Push this repo to **GitHub** (never commit `node_modules` or `.env`).
2. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select the repo → Deploy (default is fine).
4. **Settings → Networking → Generate Domain** if no public URL yet.
5. Open `https://*.up.railway.app` (serves `mint.html` at `/`).

### Variables (optional)

| Name | Required | Notes |
|------|----------|--------|
| `PORT` | No | Railway injects automatically |
| `HOST` | No | Defaults to `0.0.0.0` |
| `BLOCKSCOUT_BASE` | No | Default public Robinhood Blockscout |
| `BLOCKSCOUT_API_KEY` | No | If you use Blockscout PRO |
| `OPENSEA_CHAIN` | No | Default `robinhood` |
| `OPENSEA_API_KEY` | **Yes for 交易额** | OpenSea free API key — required for minted-out trade volumes + collection meta. Without it, volumes stay empty. |
| `DATA_DIR` | **Yes for 缓存** | e.g. `/data` on a Railway Volume — keeps ~24h mint events + minted-out + prices across redeploys. Without Volume, redeploy wipes data. |
| `HTTPS_PROXY` / `HTTP_PROXY` | No | **Leave unset** on Railway (local Clash only) |

### Ops notes

- **Always-on web service** — mint radar polls Blockscout every few seconds; do not use a “serverless / sleep when idle” plan if you want live data.
- **No database** — rankings / minted-out live in process memory; restart = cold cache (warms up after first polls).
- Health: `GET /api/health` must return 200 for Railway to keep the deploy healthy.

## API

- `GET /api/health` — liveness + poll status  
- `GET /api/mints?window=60&feed=100&hot=30` — full snapshot JSON  

## Stack

Node 18+ · Express · undici · Blockscout REST · OpenSea metadata (best-effort)
