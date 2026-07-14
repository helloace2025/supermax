# ROBIN NFT Radar — 开发日志

> **文档用途**：记录 Robinhood Chain「NFT 铸造监控面板」从原型到当前可部署版本的产品定位、功能清单、技术实现、提交时间线与运维注意。  
> **可迁移**：新建独立项目时，把本文件 + 代码结构对照即可重建。  
> **状态**：已上线验证（Railway 部署）；仓库 `helloace2025/supermax`。  
> **文档更新**：2026-07-15（对齐当前仓库 **全部已交付** 开发更改）。

---

## 1. 产品是什么

### 1.1 一句话

**Robinhood Chain 上的实时 NFT 铸造雷达**：看当前哪些集合正在被大量 mint，跟踪已铸完项目及其 OpenSea 二级成交额，并附带社区白名单抽奖 / 钱包 NFT 等会员向能力。

### 1.2 要解决的问题

- 新链（Robinhood Chain, chainId **4663**）上 NFT 公售 / free mint 活跃，缺少垂直监控工具。
- Blockscout 能查单笔交易，但不聚合「谁在猛铸」。
- 铸完后需继续观察二级市场热度（成交额），而非只剩死链接。
- 目标用户：链上交易者、mint 猎人；社区侧扩展官方 NFT + 白名单抽奖；后续可扩展发射台 / AI 画图等（**未做**）。

### 1.3 明确不做 / 未做

| 项 | 状态 |
|----|------|
| 站内 mint / 发射台 | 未做（讨论过架构） |
| AI 画 NFT | 未做 |
| Alpha List 内容系统 | 文案预告，未做 |
| 卖热榜排名 | 不做；若广告应独立 Sponsored 位 |
| 多链 | 当前仅 Robinhood Chain |

### 1.4 仓库形态（当前）

已收敛为 **单一产品**：

| 入口 | 作用 |
|------|------|
| `GET /` → `public/mint.html` | 铸造雷达主站 |
| `GET /api/mints` | 热榜 + 实时流 + 已铸完快照（含交易额字段） |
| `GET /api/wallet/nfts` | 连接钱包地址的 Robinhood 链 NFT 持仓 |
| `GET /api/raffles` | 社区白名单抽奖期数（读 `data/raffles.json`） |
| `POST /api/minted-out/refresh-volumes` | 强制刷新已铸完 OpenSea 交易额 |
| `GET /api/health` | Railway 健康检查（纯 `ok`） |
| `GET /api/status` | 调试用富状态 |

旧「钱包交叉买入监控」相关代码已不在本仓库主路径中。

---

## 2. 链与关键地址

| 项 | 值 |
|----|-----|
| 网络名 | Robinhood Chain |
| Chain ID | `4663` |
| 原生币 | ETH |
| 浏览器 | https://robinhoodchain.blockscout.com |
| 公开 RPC | https://rpc.mainnet.chain.robinhood.com |
| OpenSea chain slug | `robinhood` |
| SeaDrop（常见） | `0x00005EA00Ac477B1030CE78506496e8C2dE24bf5` |
| 官方社区 NFT | Supermax Mech（OpenSea 合集）`https://opensea.io/collection/supermax-mech` |

### OpenSea 链接

- 合约：`https://opensea.io/contract/robinhood/{contract}`
- Token：`https://opensea.io/item/robinhood/{contract}/{tokenId}`
- 合集 stats（服务端）：`https://api.opensea.io/api/v2/collections/{slug}/stats`（先经 chain/contract 解析 slug）

### Mint 判定

- ERC-721 `Transfer`，**from = `0x0…0`** → 铸造  
- 噪音需过滤：UNI Position NFT、gift/airdrop 钓鱼、**veNFT / 投票锁仓类**

---

## 3. 数据架构

```
链上出块
  → Blockscout 索引
  → 后端轮询 REST（默认 5s）
  → 内存滑动窗口聚合 + 已铸完文件归档
  → 已铸完合集：OpenSea API 拉 total.volume（默认每 15 分钟，需 OPENSEA_API_KEY）
  → 前端轮询 GET /api/mints（默认 4s）
```

- **近实时**（秒级），非 mempool / 非 `eth_subscribe`。  
- 后端：`POLL_MS = 5000`  
- 前端：`setInterval(refresh, 4000)`  
- 交易额：`TRADE_VOLUME_TTL_MS = 15 * 60 * 1000`；请求间隔约 `450ms` 防打爆 OpenSea  
- 每轮 advanced-filters 最多翻 **3 页**（有足够新 mint 时提前停）

### 主数据源

| 用途 | 接口 |
|------|------|
| ERC-721 动态 | Blockscout `…/api/v2/advanced-filters?transaction_types=ERC-721` |
| 交易 value / 单价 | 交易详情 + 同 tx mint 数量均分 |
| 合集 meta / 社交 | OpenSea API + Blockscout 兜底 |
| maxSupply | 合约 eth_call：`maxSupply()` / `MAX_SUPPLY()` |
| 已铸完二级成交额 | OpenSea collection stats `total.volume`（ETH） |
| 钱包 NFT | Blockscout 地址 token 列表（经 `/api/wallet/nfts`） |
| 白名单抽奖 | 本地/Volume 文件 `data/raffles.json` |

### 本机代理（开发必看）

- Windows 上 Node **全局 fetch 不走** `HTTPS_PROXY`。  
- 当前实现：存在 `HTTP(S)_PROXY` 时用 **`undici` `ProxyAgent`** 出站（Clash `127.0.0.1:7897` 等）。  
- Railway 无代理时走普通 fetch。  
- 本地可放根目录 `.env`（`server/index.js` 启动时 `loadDotEnv()`，不覆盖已有 `process.env`）。

---

## 4. 当前功能清单（截止 2026-07-15）

### 4.1 铸造热榜

| 列 | 说明 |
|----|------|
| # / 集合 | 头像、进度条、名称、符号、社交、Explorer、收藏/屏蔽 |
| 5 分钟 / 30 分钟 / 1 小时 | 窗口内 mint 次数；排序主维度为 **1h** |
| 价格 | 参考单价；**免费** / 付费 ETH；支持筛选全部/免费/付费 |
| Holders | 持有人数 |
| 已铸造 | 可信 NFT 件数；异常 totalSupply 已消毒 |
| 最近 | 相对时间 |

- 表格 **列宽均分** 撑满热榜面板（集合固定左栏，指标区均分剩余宽度）。  
- **铸完项目不进热榜**（服务端过滤 + 前端兜底）。  
- **高风险角标**：已铸造 ÷ Holders > 10 时显示警示。  
- **铸造进度条**：`minted / maxSupply`；未知上限显示 `—`；铸满可显示 MINT OUT。

### 4.2 实时铸造流

- 最近 ERC-721 从 0x0 的 mint 事件。  
- 展示 tokenId、方法、价格、minter、tx 链接。  
- 过滤：屏蔽列表、LP NFT、ve/gov NFT。

### 4.3 已铸完

- 条件：读到 **maxSupply** 且 **minted ≥ maxSupply**。  
- **粘性归档**：内存 Map + `DATA_DIR/minted-out.json`（进程重启可恢复，若挂载了 volume）。  
- 进入列表后前端 **不按 4s 整表重绘**（仅合约集合 **或交易额字段** 变化时更新 DOM）。  
- 空状态文案：`暂无已铸完项目`（无技术说明括号）。  
- **UI 行展示**：不再在每行放 Explorer 文字链；主展示为 **OpenSea 二级交易额**。  
- **不重复**「OpenSea」文字链占位（交易额本身即二级市场信号）。

### 4.3.1 已铸完 · OpenSea 交易额（2026-07-15）

| 项 | 说明 |
|----|------|
| 展示 | `交易额：X ETH` / EN `Volume: X ETH` |
| 数据 | OpenSea `total.volume`（合集累计成交额，ETH 计价展示） |
| 刷新 | 默认 **15 分钟** TTL；归档首次命中时排队拉取；定时器周期刷新 |
| 限流 | 合集间约 `450ms` gap；busy 锁防并发重入 |
| 无 key | 需 `OPENSEA_API_KEY`；未配置时无法拉到真实量（运维：Railway Variables 配置） |
| 手动 | `POST /api/minted-out/refresh-volumes` → `{ ok, count, items }` |
| 字段 | `tradeVolumeEth` / `tradeVolumeDisplay` / `tradeVolumeAt` / `tradeVolumeStatus`（`ok` \| `miss` \| `error`） |
| 前端 | 本地 sticky archive 合并 volume 变更；`formatTradeVolumeCell` 统一「0 ETH」展示 |

### 4.4 交互与账户向

| 功能 | 说明 |
|------|------|
| 收藏 | localStorage；顶栏按钮 + 浮层 |
| 屏蔽 | localStorage；热榜/流/已铸完均隐藏 |
| 连接钱包 | 浏览器钱包；断开菜单 |
| **钱包 NFT** | 连接后菜单内请求 `/api/wallet/nfts?address=`，展示 Robinhood 链持仓（可滚动/截断提示） |
| 主题 | Light / Dark |
| 语言 | 中文 / EN |
| 立即刷新 | 手动拉 `/api/mints` |

### 4.5 顶栏与更新日志

- 链接：`Twitter · Whitelist · Updates · OpenSea` 等（Telegram 已去掉）。  
- Twitter 指向 `InstantSta53355`。  
- **OpenSea 导航文案**：加粗品牌蓝（`mint.css` 独立样式，与普通 nav 区分）。  
- **更新** 浮层：静态数组 `UPDATES`（`public/mint.js` 顶部）。  
- 约定：只记用户可感知的改动；**细枝末节不写**；推送 GitHub 前可先过文案。  
- **数据新鲜度文案**（刷新旁「updated ago」类标签）：已移除，避免与「立即刷新」重复。

### 4.5.1 Blockscout 状态警示（2026-07-13）

数据源依赖 Blockscout；浏览器宕机时热榜会「假死」（如 5m/30m 全 0、最近 mint 停更），需与「链本身正常」区分。

| UI | 行为 |
|----|------|
| 顶栏状态胶囊 | **正常**：绿色 `Blockscout live`；**故障**：红色文案（如「Blockscout 故障」） |
| 故障横幅 | 说明原因 + 最近 mint / 轮询指标 + 打开 Blockscout 链接；**可关闭**（红标仍保留至恢复） |
| 判定（摘要） | 5m/10m 窗口有数据 → 强制正常；长时间无 5m/30m 且最新 mint ≥20–30m，或轮询失败/限流 → 故障 |

实现：`server/mint-radar.js` → `computeHealth()`；`public/mint.js` 渲染芯片与横幅；样式 `mint.css`。

### 4.5.2 官方 NFT / OpenSea 会员弹窗（2026-07-14）

- 顶栏 OpenSea 打开说明弹窗（非直接跳转）。  
- 文案：官方会员通行证、持仓参与白名单抽奖、Alpha List 预告。  
- **官方 mint 链接**：`https://opensea.io/collection/supermax-mech`（`OFFICIAL_NFT.mintUrl` + HTML）。  
- 中英 i18n 同步。

### 4.5.3 社区白名单抽奖 Whitelist（2026-07-14）

| 项 | 说明 |
|----|------|
| 入口 | 顶栏 `Whitelist` |
| 数据 | `GET /api/raffles` ← `DATA_DIR/raffles.json`（缺省用内置 rules + 空 rounds） |
| UI | 期数、名额、项目方、白名单类型、Twitter、中奖地址、已开奖/待开奖 |
| 规则 | 持有官方 NFT 参与；按 token 编号抽；持有越多概率越高；同地址单期最多中 1 次 |
| 红点 | 连接钱包后，若地址在某期 winners 中且未读，Whitelist 旁红点；点开后写入 localStorage `mint-radar-raffle-read-v1` |
| 发布方式 | 运维编辑 `data/raffles.json`（或挂载 Volume 路径）后由 API 读出；无后台管理 UI |

### 4.6 去噪与数据消毒

| 规则 | 作用 |
|------|------|
| 合约黑名单 | Uniswap V3/V4 Positions 等 |
| 名称垃圾正则 | gift / claim / airdrop… |
| **veNFT / 投票锁仓** | 名称、符号 `ve*`、方法 create_lock 等；离谱 totalSupply+少 holders |
| **已铸造 sanitize** | 拒绝天文数字 / 类 ERC-20 供应量（避免 ve 权重当件数） |
| **免费展示** | `0` / `0 ETH` / Free → UI「免费」 |

### 4.7 部署与运维

| 项 | 说明 |
|----|------|
| 托管 | **Railway**（GitHub 推送自动部署） |
| 健康检查 | `/api/health` → `ok`（不跑重快照） |
| 监听 | `0.0.0.0:$PORT`（默认 3789） |
| 依赖 | `express`、`undici`；Node ≥ 20 |
| **必配（交易额/完整 OpenSea meta）** | Railway Variables：`OPENSEA_API_KEY` |
| 可选 | `DATA_DIR` + Volume → `minted-out.json` / `raffles.json` 持久化 |
| 资源尖峰 | 链上 mint 突增时 poll 翻页 + 价格/meta 队列 → **CPU 与 egress 同步升高**（正常） |
| 本地 env | 根目录 `.env`（见 `.env.example`）；含 `OPENSEA_API_KEY` 注释说明 |

---

## 5. 代码结构（当前）

```
项目根/
├── package.json              # express + undici；start / dev
├── railway.toml / nixpacks.toml
├── .env.example              # 含 OPENSEA_API_KEY 等
├── server/
│   ├── index.js              # Express：static、health、mints、wallet/nfts、raffles、refresh-volumes、loadDotEnv
│   └── mint-radar.js         # 轮询、聚合、meta、价格、已铸完归档、交易额、钱包 NFT、代理
├── public/
│   ├── mint.html             # 主 UI + 白名单/OpenSea 弹窗结构
│   ├── mint.css              # 含 OpenSea 品牌蓝 nav、交易额、抽奖/钱包样式
│   ├── mint.js               # 渲染、i18n、收藏/屏蔽、UPDATES、钱包 NFT、抽奖红点、交易额
│   ├── favicon.svg
│   ├── opensea-icon.jpg
│   └── brand/                # logo 等
├── data/
│   ├── minted-out.json       # 已铸完粘性归档（可选挂载）
│   └── raffles.json          # 白名单抽奖期数
└── NFT-MINT-RADAR-开发日志.md
```

### 5.1 API

```http
GET /api/mints?window=60&feed=100&hot=30&out=50
GET /api/wallet/nfts?address=0x…
GET /api/raffles
POST /api/minted-out/refresh-volumes
GET /api/health
GET /api/status
```

| 参数 / 路由 | 含义 |
|-------------|------|
| window | 热榜窗口（分钟） |
| feed | 实时流条数 |
| hot | 热榜条数 |
| out | 已铸完条数；`0` 可省略 payload（前端可粘性缓存） |
| wallet/nfts | 按地址拉链上 NFT 列表 |
| raffles | 抽奖规则 + 期数（period 降序） |
| refresh-volumes | 强制刷新全部已铸完 OpenSea 成交额 |

响应关键字段（`/api/mints`）：`status`、`stats`、`hot`、`feed`、`mintedOut`（含 `tradeVolume*`）、`blacklist`。

### 5.2 本地运行

```bash
cd <项目目录>
npm install
# 复制 .env.example → .env，填入 OPENSEA_API_KEY（交易额与 OpenSea meta）
# 需要代理访问外网时（Windows Clash 等）：
#   HTTPS_PROXY=http://127.0.0.1:7897
npm start
# → http://localhost:3789/
```

开发热重载：`npm run dev`（`node --watch`）。

### 5.3 协作约定（本仓库）

1. 功能改完 **先本地预览**，确认后再 `git push`。  
2. 用户可见改动才写入 `UPDATES`；推送前可过一遍文案。  
3. 日志（本 md）与站内「更新」浮层分工：本文件偏工程全貌与全量变更，浮层偏用户短句。  
4. 内容策略锚点：**ship projects, not tutorials** — 本站作为可公开演示的上线产品。

---

## 6. 开发时间线（完整变更摘要）

### 阶段 A — 原型（约 2026-07-12）

| 提交 / 主题 | 内容 |
|-------------|------|
| 准备 Railway 部署 | 独立 mint radar 服务入口、静态页、基础配置 |
| Blockscout 轮询 | 热榜 + 实时铸造流 |
| OpenSea 元数据 | logo / 社交链接 |
| 去噪 | LP Position、垃圾名 gift/claim/airdrop |
| SeaDrop | 分账调研（文档级，非产品功能） |

### 阶段 B — 产品化与上线（约 2026-07-13 上午～中）

| 提交 | 内容 |
|------|------|
| `7774cb9` Ship ROBIN NFT Radar | 收藏、已铸完面板、maxSupply 进度条、Railway-ready |
| `8e8b967` Railway deploy | npmjs.org lockfile、健康检查加固、Node 20 |
| `cfd6ec3` network healthcheck | 轻量 `/api/health`、跳过 deploy 重门禁 |
| `124dba5` CRASHED 修复 | 吞掉 poll rejection；忽略 loopback 代理误配 |
| `8e002cb` undici8 崩溃 | 移除 undici 8 依赖路径，改用 Node fetch + 可控 ProxyAgent |
| `5fd61e5` Twitter | 顶栏链到 InstantSta53355 |
| `c68a8a5` 2s 轮询 | 后端/前端 2s（后被降频） |
| `4d6329b` 已铸完持久化 | `minted-out.json` 粘性归档，售罄不丢 |
| `ba7bd5c` 降频控 egress | 后端 **5s** / 前端 **4s** |
| 热榜列宽迭代 | `630ba78` → `2cd5bcd` → `8e17058` → `6a9f795`：集合固定 + 指标均分、消除死白/压扁列 |

### 阶段 C — 质量与体验（2026-07-13）

| 提交 | 内容 |
|------|------|
| `3f0f5bb` | 免费/尘埃价显示「免费」而非 `0 ETH` |
| `f91fb18` | 铸完剔除热榜；已铸完面板粘性、避免 4s 整表重绘 |
| `3f5f2a1` | 消毒已铸造数量；丢掉 ve 类 totalSupply 垃圾 |
| `7901740` | 过滤 veNFT / vote-escrow 锁仓 NFT |
| `c3681e1` | 顶栏轻量 **Updates** 浮层，替换空 Telegram |
| `119b601` | Updates 文案前置条目 |
| `7546366` | 本机 Blockscout 代理；Updates UI / 空状态文案打磨 |
| `134ee10` | **Blockscout 状态警示**（绿 live / 红故障 + 可关闭原因条） |

### 阶段 D — 会员与社区能力（2026-07-14）

| 提交 | 内容 |
|------|------|
| `efc006d` 大功能包 | **钱包 NFT**（Blockscout 经 `/api/wallet/nfts`）；**Whitelist 白名单抽奖**（`/api/raffles` + 红点）；**官方 Supermax Mech mint** OpenSea 弹窗与权益文案；顶栏精简；导航 Whitelist/Updates 英文化；产品 UPDATES 条目 |
| `ac1fbc6` UI | 去掉刷新旁冗余 **data freshness / updated ago** 文案（与刷新按钮重复） |
| `8783940` UI | **OpenSea 导航标签**加粗品牌蓝 |

### 阶段 E — 已铸完二级成交额（2026-07-15）

| 提交 | 内容 |
|------|------|
| `b0a5836` | 已铸完 **OpenSea 交易额**：`交易额：X ETH`；15 分钟刷新；`tradeVolume*` 字段写入归档；`POST /api/minted-out/refresh-volumes`；`.env.example` 增加 `OPENSEA_API_KEY`；已铸完行去掉 Explorer 链、避免重复 OpenSea 文字链；前端 sticky 合并 volume 变更 |

**运维备注（交易额上线后）**：Railway 必须配置 `OPENSEA_API_KEY`，否则 meta/成交额接口无法带 `x-api-key` 正常工作。

### 站内 UPDATES 浮层当前用户可见条目（摘要）

| 日期 | 中文摘要 |
|------|----------|
| 2026-07-14 | 已铸完交易额（15 分钟，`交易额：X ETH`） |
| 2026-07-14 | 官方 NFT：OpenSea 弹窗直达 Supermax Mech |
| 2026-07-14 | 社区白名单：期数 / 中奖地址 / 钱包红点 |
| 2026-07-14 | 钱包 NFT 持仓列表 |
| 2026-07-13 | Blockscout 状态警示 |
| 2026-07-13 | 过滤 veNFT |
| 2026-07-13 | 已铸造数量异常修复 |
| 2026-07-13 | 铸完离热榜进已铸完 |
| 2026-07-13 | 免费铸造显示「免费」 |

---

## 7. 商业与后续方向（讨论，未实现）

| 方向 | 备注 |
|------|------|
| 推广位 Sponsored | 与自然榜隔离 |
| 发射台 Launch | 可同站路径 `/launch`；索引适合轻量 DB；图走 IPFS |
| AI 画 NFT | 后端代理模型 API；密钥放环境变量 |
| Alpha List | 会员专享情报；需钱包 + 官方 NFT；内容系统未建 |
| 全站单 Railway | 现阶段推荐；静态页几乎不增成本 |
| 子域名拆 Vercel | 可选；跨站跳转，非必须 |

原则建议：**中立监控热榜** 与 **发行/广告** 叙事隔离。  
内容策略：以 **真实上线产品** 作为对外叙事锚点（ship projects, not tutorials）。

---

## 8. 已知限制与技术债

- [ ] 依赖 Blockscout 索引延迟与限流（已加前端故障警示；未做 RPC `eth_getLogs` 备份主路径）  
- [x] Blockscout 宕机时面板状态可见（绿 live / 红故障）  
- [x] 已铸完二级成交额（OpenSea，15m）  
- [ ] OpenSea 未收录则 logo/社交/交易额可能缺失（`tradeVolumeStatus=miss`）  
- [ ] Railway 未配 `OPENSEA_API_KEY` 时交易额与部分 meta 不可用  
- [ ] ve/钓鱼启发式无法 100% 覆盖  
- [ ] 已铸完归档默认容器磁盘可能随部署丢失（需 Railway Volume 才稳）  
- [ ] 抽奖数据无管理后台，靠改 `raffles.json`  
- [ ] 无用户账号体系、无服务端收藏同步  
- [ ] 未强制 Blockscout PRO apikey  
- [ ] 非 RPC `eth_getLogs` 主路径（可升级）  
- [ ] Alpha List 内容系统未实现  

---

## 9. 关键常量速查

```text
BLOCKSCOUT = https://robinhoodchain.blockscout.com
OPENSEA_CHAIN = robinhood
ZERO = 0x0000000000000000000000000000000000000000
CHAIN_ID = 4663
DEFAULT_PORT = 3789
POLL_MS (backend) = 5000
REFRESH_MS (frontend) = 4000
TRADE_VOLUME_TTL_MS = 900000   # 15 minutes
TRADE_VOLUME_GAP_MS = 450
OFFICIAL_NFT = https://opensea.io/collection/supermax-mech
```

环境变量（常用）：

```text
PORT / HOST
HTTPS_PROXY / HTTP_PROXY
BLOCKSCOUT_BASE / BLOCKSCOUT_API_KEY
EXPLORER_BASE / OPENSEA_CHAIN / CHAIN_ID
OPENSEA_API_KEY          # OpenSea v2 meta + 已铸完交易额（Railway 需配置）
DATA_DIR                 # minted-out.json / raffles.json 持久化目录
```

---

## 10. 外部调研与对照（会话记录，非代码依赖）

开发过程中对照过的外部对象（用于产品/技术判断，**未**合入为硬依赖）：

| 对象 | 用途 |
|------|------|
| Bitcoin Battlefield 等外部工具 | UI/产品形态参考 |
| Reservoir 等 router 合约 | 铸造路由/分账理解 |
| OpenSea API v2 | 合集 meta + stats.volume |

---

## 11. 一句话总结

> 在 Robinhood Chain 上，用 **Blockscout 索引 + Node 聚合 + 静态前端**，已做成可 **Railway 部署** 的 NFT 铸造雷达：热榜、实时流、已铸完归档与 **OpenSea 交易额**、价格/风险/进度、收藏屏蔽、钱包 NFT、社区白名单抽奖、官方 Supermax Mech 入口与中英主题，并处理 ve 噪声与供应量误读。  
> 当前是 **可用的垂直监控站 + 轻量社区会员能力**；发射台 / AI / Alpha List 为后续扩展。运维上请保证 Railway 配置 **`OPENSEA_API_KEY`**，成交额才会有真数据。

---

## 附录 A — Git 提交全表（本仓库主线，新→旧）

| Hash | 日期 | 说明 |
|------|------|------|
| `b0a5836` | 2026-07-15 | feat: minted-out OpenSea trade volume tracking (15m refresh) |
| `8783940` | 2026-07-14 | ui: OpenSea nav label bold brand blue |
| `ac1fbc6` | 2026-07-14 | ui: remove redundant data freshness label beside refresh |
| `efc006d` | 2026-07-14 | feat: wallet NFTs, whitelist raffle, official NFT mint link, UI polish |
| `134ee10` | 2026-07-13 | feat: Blockscout status alert (live green / fault red) |
| `7546366` | 2026-07-13 | Local proxy for Blockscout; polish Updates UI and empty states |
| `119b601` | 2026-07-13 | Prepend changelog entry for Updates panel |
| `c3681e1` | 2026-07-13 | Add lightweight Updates panel in header replacing Telegram |
| `7901740` | 2026-07-13 | Filter out veNFT and vote-escrow lock NFTs from mint radar |
| `3f5f2a1` | 2026-07-13 | Sanitize NFT minted count; drop veNFT totalSupply garbage |
| `f91fb18` | 2026-07-13 | Exclude mint-out from hot list; sticky minted-out panel without 4s re-render |
| `3f0f5bb` | 2026-07-13 | Show 免费 instead of 0 ETH for free/dust mint prices |
| `6a9f795` | 2026-07-13 | Spread hot metrics evenly across panel width after collection |
| `8e17058` | 2026-07-13 | Pull mint metrics left: cap collection width, table content-sized |
| `2cd5bcd` | 2026-07-13 | Fix hot table: stop crushing metric columns with width 0 |
| `630ba78` | 2026-07-13 | Tighten mint hot-table columns so metrics pack without a dead gap |
| `ba7bd5c` | 2026-07-13 | Slow polls to cut egress: backend 5s, frontend 4s |
| `4d6329b` | 2026-07-13 | Persist minted-out archive so sold-out collections never drop off |
| `c68a8a5` | 2026-07-13 | Poll every 2s on backend and frontend |
| `5fd61e5` | 2026-07-13 | Link header Twitter to InstantSta53355 |
| `8e002cb` | 2026-07-13 | Fix Railway crash: remove undici8 use Node fetch |
| `124dba5` | 2026-07-13 | Fix Railway CRASHED: swallow poll rejections, ignore loopback proxy |
| `cfd6ec3` | 2026-07-13 | Fix Railway network healthcheck: trivial health route, skip deploy health gate |
| `8e8b967` | 2026-07-13 | Fix Railway deploy: use npmjs.org lockfile, harden healthcheck and Node 20 |
| `7774cb9` | 2026-07-13 | Ship ROBIN NFT Radar: favorites, minted-out panel, maxSupply progress, Railway-ready |
| `7e1b798` | 2026-07-12 | Prepare RH NFT Mint Radar for Railway deploy |

---

*文档随 2026-07-15 功能点更新，覆盖截至当前仓库全部已交付开发更改（含 Git 主线提交与产品/运维约定）。*
