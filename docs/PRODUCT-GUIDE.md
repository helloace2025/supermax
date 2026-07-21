# ROBIN NFT Radar — Product Guide

**ROBIN NFT Radar** is a real-time mint dashboard for **Robinhood Chain** (chainId `4663`).  
It watches on-chain ERC-721 mints, ranks which collections are heating up, and helps you follow sold-out collections after mint ends.

This guide explains **each section of the website** and what it is for.

---

## At a glance

| Area | Purpose |
|------|---------|
| Header | Brand, tools, links, theme/language, wallet |
| King of the Hill | #1 collection by 1-hour mint count |
| Mint Heat (hot list) | Ranked leaderboard of active mints |
| Live Feed | Chronological stream of individual mint events |
| Minted Out | Collections that finished minting (still trackable) |
| Favorites / Blocked | Personal pin & hide lists (saved in your browser) |
| Whitelist | Community raffle rounds and winners |
| OpenSea | Official ROBIN membership NFT |
| Updates | Recent product changelog |
| Health banner | Alerts when Blockscout / data pipeline has issues |

**Data source:** public Blockscout explorer APIs (no self-hosted node required).  
**Optional:** OpenSea API powers collection meta and minted-out trade volume / floor.

---

## 1. Header (top bar)

### Brand

- **Logo + title** — ROBIN NFT Radar product identity.
- **Subtitle** — chain context (“Robinhood Chain · Live mint heat”).
- **Blockscout status chip** (when shown) — quick signal that the explorer feed is live; opens the public Blockscout site.

### Favorites · Blocked · Refresh

| Control | What it does |
|---------|----------------|
| **Favorites** | Opens your starred collections list. Count shows how many you saved. |
| **Blocked** | Opens collections you hid from the board. Count shows how many you blocked. |
| **Refresh** | Forces an immediate UI refresh from the latest server snapshot (does not re-mine the chain yourself). |

Favorites and blocked lists are stored **locally in your browser** (not on the server).

### King of the Hill (center)

A highlight card for the current **#1 collection by 1-hour mint count**.

Typical fields:

- Collection name / icon  
- 1h mint total (and supporting 5m / 30m context)  
- Holders, mint progress, reference mint price when known  

If no clear leader yet, it shows a “contest in progress” empty state.

### Top links (right)

| Link | Purpose |
|------|---------|
| **Twitter** | Official product / community account on X. |
| **OpenSea** | Explains and links the **official ROBIN membership NFT** (community pass). |
| **Whitelist** | Community whitelist raffles (rounds, partners, winners, win alerts). |
| **Updates** | Short product changelog (what shipped recently). |

### Theme & language

- **Dark / Light** — visual theme (remembered in the browser).  
- **中文 / EN** — UI language (remembered in the browser).

### Connect Wallet

Connect a wallet on Robinhood Chain to:

- Browse **NFTs held by that address** (menu list).  
- Enable **whitelist win alerts** (red dot next to Whitelist when your address wins a drawn round).  
- Unlock member-only features as they ship (e.g. Alpha List), when you hold the official NFT.

---

## 2. Data health banner

Appears under the header when the pipeline is unhealthy, for example:

- Blockscout API errors or timeouts  
- Rate limiting  
- Stale polls (no fresh mints for a long period)  
- Empty cache after cold start problems  

You can open Blockscout to verify the explorer, or dismiss the banner.  
When **5m / 10m windows still show mints**, the product treats the board as healthy even if a single poll blipped.

---

## 3. Mint Heat (left panel) — “Hot list”

The main **leaderboard of collections that are actively minting**.

### Ranking idea

Collections are ranked primarily by **mint activity in the last hour**, with supporting windows:

| Column | Meaning |
|--------|---------|
| **#** | Rank position |
| **Collection** | Name, icon, social shortcuts (X / Discord / site when detected), OpenSea / explorer links, favorite & block actions |
| **5 min** | Mints in the last 5 minutes |
| **30 min** | Mints in the last 30 minutes |
| **1 hour** | Mints in the last hour (primary heat signal) |
| **Price** | Reference **unit mint price** for recent activity (native ETH on-chain value ÷ NFTs in that tx). Shows **Free** for zero-value mints, or **…** while the price is still resolving |
| **Holders** | Holder count from the indexer (when available) |
| **Minted** | Approximate items minted / progress vs max supply when known |
| **Recent** | How long ago the last mint was seen |

### Price filter

On the **Price** column header:

- **All** — no filter  
- **Free** — free / dust mints  
- **Paid** — non-zero unit price  

### Extra signals on rows

- **Mint progress** — bar or ratio when `maxSupply` is known.  
- **High-risk hint** — when minted ÷ holders is extremely high (possible concentration / wash-style patterns; heuristic only).  
- **Social icons** — open project Twitter / Discord / website when metadata was found.  
- **Google Lens-style reverse image** (when available) — investigate logos that look suspicious.  
- Sold-out collections **leave this list** and move to **Minted Out**.

Noise (e.g. some LP / position NFTs and junk patterns) is filtered server-side so the board stays closer to real collectible drops.

---

## 4. Live Feed (right column, top)

A **chronological stream of individual mint events** (ERC-721 transfers from the zero address).

Each row is roughly one mint (or one token in a batch), and typically shows:

- Collection icon & name  
- Token id / method (e.g. `mintPublic`) when available  
- Unit price (Free / ETH / pending)  
- Minter address (shortened) with explorer link  
- Transaction link  
- Relative time  

**Use this panel when you want the raw pulse of the chain** — who is minting what right now — rather than aggregated rankings.

You can **collapse** the feed into a slim rail to give more space to Minted Out (or the opposite).

---

## 5. Minted Out (right column, bottom)

Collections that have **finished minting** (sold out / mint complete) but are still worth tracking for secondary market interest.

Typical info:

- Collection identity & links  
- Last mint time  
- **Trade volume** (OpenSea, when API key is configured server-side)  
- **Floor price** (OpenSea, when available; may be in ETH or other quote assets such as eUSDG)

### Sort modes

| Sort | Purpose |
|------|---------|
| **Recent** | Most recently minted-out first |
| **Volume** | Higher secondary volume first |
| **Floor** | Rank by floor (cross-currency floors are normalized roughly to ETH terms for sorting only; display stays in the original unit) |

Collapse works the same way as the Live Feed rail.

---

## 6. Favorites panel

Personal **watchlist**.

- Star collections from the hot list (or related actions).  
- Open **Favorites** to jump back to them quickly.  
- **Clear all** removes every favorite.  

Stored only in **localStorage** on your device.

---

## 7. Blocked panel

Personal **hide list**.

- Block noisy or unwanted collections so they disappear from the board.  
- Review or unblock anytime from this panel.  
- **Clear all** restores everything.  

Also browser-local only.

---

## 8. Whitelist (raffle modal)

Community **whitelist raffles** for members who hold the official ROBIN NFT.

Per round you typically see:

- Period / status (**Pending** vs **Drawn**)  
- Number of spots  
- Partner project  
- WL type (e.g. guaranteed / FCFS)  
- Project Twitter  
- **Winner addresses** after the draw  
- Your own **“You won”** badge when the connected wallet is among winners  

**Red unread dot** on the Whitelist nav item: you have a new win notification (clears after you open the panel).

Rules (short version): holding more official NFTs means more token IDs in the draw pool (higher odds). One wallet usually wins at most once per round if multiple of its IDs hit.

---

## 9. OpenSea (official NFT modal)

Explains the **official community membership NFT**:

- Mint on OpenSea (Robinhood Chain) → you are a member (no separate signup).  
- Benefits overview: WL raffles, win alerts, future Alpha List, etc.  
- CTA button to the official collection page.

This is **product / community membership**, not a random mint on the heat board.

---

## 10. Updates panel

A compact **changelog** of product improvements (dates + short notes).  
Useful to see what changed after deploys without reading the full engineering log.

---

## How the data fits together (mental model)

```text
Blockscout (Robinhood)          OpenSea (optional)
        │                              │
        │  ERC-721 mint stream         │  icons, socials,
        │  tx value → unit price       │  volume, floor
        ▼                              ▼
   ROBIN NFT Radar (server)
        │
        ▼
   Browser UI
   ├─ Hot list (aggregated heat)
   ├─ Live feed (raw events)
   ├─ Minted out (post-mint tracking)
   └─ Tools (favorites, wallet, raffles, …)
```

1. The server **polls** Blockscout for new ERC-721 mints.  
2. It **aggregates** by collection into the heat table and King of the Hill.  
3. It **resolves mint price** from transaction native value (list endpoints often omit `value`).  
4. When a collection hits mint-out, it is **archived** into Minted Out and enriched with OpenSea stats when possible.  
5. The browser **polls the snapshot API** and keeps a smooth local UI (filters, theme, language, favorites).

---

## Tips for readers

- **… under Price** means the unit price for that mint is still being fetched; free mints should settle to **Free**.  
- **Heat ≠ quality** — high mint rate can be organic or spam; use holders, progress, risk hints, and social links together.  
- **Minted Out volume/floor** need a server-side OpenSea API key; without it, those fields may stay empty.  
- After a **cold deploy** without durable disk cache, the board can look empty for a short warm-up period while polls refill.  
- Prefer **Favorites** for projects you care about; use **Blocked** to keep the board readable.

---

## Related docs

| Doc | Content |
|-----|---------|
| [README.md](../README.md) | Local run, Railway deploy, env vars, API endpoints |
| [NFT-MINT-RADAR-开发日志.md](../NFT-MINT-RADAR-开发日志.md) | Engineering / product diary (Chinese) |

---

*ROBIN NFT Radar — live mint heat on Robinhood Chain.*
