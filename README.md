# RH NFT Mint Radar

Real-time NFT mint leaderboard for **Robinhood Chain** (chainId `4663`).

- Hot list ranked by **1h mint volume** (plus 5m / 30m columns)
- Live mint feed · OpenSea / Blockscout links · ZH / EN · local block list

## Local

```bash
npm install
npm start
# http://localhost:3789
```

Optional proxy (dev only): see `.env.example`.

## Deploy on Railway

1. Push this repo to **GitHub** (do not commit `node_modules` or `.env`).
2. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub**.
3. Select this repository → Deploy.
4. Open the generated `*.up.railway.app` URL.

Railway will:

- install with `npm ci` (Nixpacks)
- run `npm start`
- health-check `GET /api/health`

### Variables (optional)

| Name | Required | Notes |
|------|----------|--------|
| `PORT` | No | Set by Railway |
| `HOST` | No | Defaults to `0.0.0.0` |
| `BLOCKSCOUT_API_KEY` | No | If you use Blockscout PRO |
| `HTTPS_PROXY` | No | **Leave unset** on Railway |

No credit card steps are covered here — use Railway’s free trial / Hobby as you prefer.

## API

- `GET /api/health` — liveness + poll status  
- `GET /api/mints?window=60&feed=100&hot=30` — snapshot JSON  

## Stack

Node 18+ · Express · undici · Blockscout REST · OpenSea metadata (best-effort)
