# ROBIN NFT Radar — 开发日志

> **文档用途**：记录 Robinhood Chain「NFT 铸造监控面板」从原型到当前可部署版本的产品定位、功能清单、技术实现与运维注意。  
> **可迁移**：新建独立项目时，把本文件 + 代码结构对照即可重建。  
> **状态**：已上线验证（Railway 部署）；仓库 `helloace2025/supermax`。  
> **文档更新**：2026-07-13（对齐当前全部已交付功能）。

---

## 1. 产品是什么

### 1.1 一句话

**Robinhood Chain 上的实时 NFT 铸造雷达**：看当前哪些集合正在被大量 mint，并跟踪已铸完项目。

### 1.2 要解决的问题

- 新链（Robinhood Chain, chainId **4663**）上 NFT 公售 / free mint 活跃，缺少垂直监控工具。
- Blockscout 能查单笔交易，但不聚合「谁在猛铸」。
- 目标用户：链上交易者、mint 猎人；后续可扩展发射台 / AI 画图等（**未做**）。

### 1.3 明确不做 / 未做

| 项 | 状态 |
|----|------|
| 站内 mint / 发射台 | 未做（讨论过架构） |
| AI 画 NFT | 未做 |
| 卖热榜排名 | 不做；若广告应独立 Sponsored 位 |
| 多链 | 当前仅 Robinhood Chain |

### 1.4 仓库形态（当前）

已收敛为 **单一产品**：

| 入口 | 作用 |
|------|------|
| `GET /` → `public/mint.html` | 铸造雷达主站 |
| `GET /api/mints` | 热榜 + 实时流 + 已铸完快照 |
| `GET /api/health` | Railway 健康检查（纯 `ok`） |

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

### OpenSea 链接

- 合约：`https://opensea.io/contract/robinhood/{contract}`
- Token：`https://opensea.io/item/robinhood/{contract}/{tokenId}`

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
  → 前端轮询 GET /api/mints（默认 4s）
```

- **近实时**（秒级），非 mempool / 非 `eth_subscribe`。  
- 后端：`POLL_MS = 5000`  
- 前端：`setInterval(refresh, 4000)`  
- 每轮 advanced-filters 最多翻 **3 页**（有足够新 mint 时提前停）

### 主数据源

| 用途 | 接口 |
|------|------|
| ERC-721 动态 | `…/api/v2/advanced-filters?transaction_types=ERC-721` |
| 交易 value / 单价 | 交易详情 + 同 tx mint 数量均分 |
| 合集 meta / 社交 | OpenSea API + Blockscout 兜底 |
| maxSupply | 合约 eth_call：`maxSupply()` / `MAX_SUPPLY()` |

### 本机代理（开发必看）

- Windows 上 Node **全局 fetch 不走** `HTTPS_PROXY`。  
- 当前实现：存在 `HTTP(S)_PROXY` 时用 **`undici` `ProxyAgent`** 出站（Clash `127.0.0.1:7897` 等）。  
- Railway 无代理时走普通 fetch。

---

## 4. 当前功能清单（截止 2026-07-13）

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
- 进入列表后前端 **不按 4s 整表重绘**（仅合约集合变化时更新 DOM）。  
- 空状态文案：`暂无已铸完项目`（无技术说明括号）。

### 4.4 交互与账户向

| 功能 | 说明 |
|------|------|
| 收藏 | localStorage；顶栏按钮 + 浮层 |
| 屏蔽 | localStorage；热榜/流/已铸完均隐藏 |
| 连接钱包 | 浏览器钱包；断开菜单 |
| 主题 | Light / Dark |
| 语言 | 中文 / EN |
| 立即刷新 | 手动拉 `/api/mints` |

### 4.5 顶栏与更新日志

- 链接：`Twitter · 更新`（已去掉空 Telegram）。  
- **更新** 浮层：静态数组 `UPDATES`（`public/mint.js` 顶部）。  
- 约定：只记用户可感知的改动；**细枝末节不写**；推送 GitHub 前可先过文案。

### 4.5.1 Blockscout 状态警示（2026-07-13）

数据源依赖 Blockscout；浏览器宕机时热榜会「假死」（如 5m/30m 全 0、最近 mint 停更），需与「链本身正常」区分。

| UI | 行为 |
|----|------|
| 顶栏状态胶囊 | **正常**：绿色 `Blockscout live`；**故障**：红色文案（如「Blockscout 故障」） |
| 故障横幅 | 说明原因 + 最近 mint / 轮询指标 + 打开 Blockscout 链接；**可关闭**（红标仍保留至恢复） |
| 判定（摘要） | 5m/10m 窗口有数据 → 强制正常；长时间无 5m/30m 且最新 mint ≥20–30m，或轮询失败/限流 → 故障 |

实现：`server/mint-radar.js` → `computeHealth()`；`public/mint.js` 渲染芯片与横幅；样式 `mint.css`。

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
| 健康检查 | `/api/health` → `ok` |
| 监听 | `0.0.0.0:$PORT`（默认 3789） |
| 依赖 | `express`、`undici`；Node ≥ 20 |
| 资源尖峰 | 链上 mint 突增时 poll 翻页 + 价格/meta 队列 → **CPU 与 egress 同步升高**（正常） |

---

## 5. 代码结构（当前）

```
项目根/
├── package.json              # express + undici；start / dev
├── railway.toml / nixpacks.toml
├── server/
│   ├── index.js              # Express：static、health、/api/mints、/
│   └── mint-radar.js         # 轮询、聚合、meta、价格、已铸完归档、代理
├── public/
│   ├── mint.html             # 主 UI
│   ├── mint.css
│   ├── mint.js               # 渲染、i18n、收藏/屏蔽、更新日志、钱包
│   ├── favicon.svg
│   ├── opensea-icon.jpg
│   └── brand/                # logo 等
├── data/                     # 本地/容器：minted-out.json（可选挂载）
└── NFT-MINT-RADAR-开发日志.md
```

### 5.1 API

```http
GET /api/mints?window=60&feed=100&hot=30&out=50
```

| 参数 | 含义 |
|------|------|
| window | 热榜窗口（分钟） |
| feed | 实时流条数 |
| hot | 热榜条数 |
| out | 已铸完条数；`0` 可省略 payload（前端可粘性缓存） |

响应关键字段：`status`、`stats`、`hot`、`feed`、`mintedOut`、`blacklist`。

### 5.2 本地运行

```bash
cd <项目目录>
npm install
# 需要代理访问外网时（Windows Clash 等）：
#   系统/终端已设 HTTPS_PROXY=http://127.0.0.1:7897 即可（代码会用 undici）
npm start
# → http://localhost:3789/
```

开发热重载：`npm run dev`（`node --watch`）。

### 5.3 协作约定（本仓库）

1. 功能改完 **先本地预览**，确认后再 `git push`。  
2. 用户可见改动才写入 `UPDATES`；推送前可过一遍文案。  
3. 日志（本 md）与站内「更新」浮层分工：本文件偏工程全貌，浮层偏用户短句。

---

## 6. 开发时间线（摘要）

### 阶段 A — 原型（约 2026-07-12）

- Blockscout 轮询 + 热榜/实时流  
- OpenSea 元数据与社交图标  
- 去 LP / 垃圾名  
- SeaDrop 分账调研（文档级）

### 阶段 B — 产品化 UI

- 5m / 30m / 1h 列；价格筛选  
- 亮暗色、中英、收藏、屏蔽  
- 钱包连接  
- maxSupply 进度条、高风险角标  
- 已铸完面板 + 文件粘性归档  
- 热榜列宽布局迭代（最终：集合固定 + 指标均分）

### 阶段 C — 质量与上线（约 2026-07-13）

- Railway 部署与健康检查加固  
- 轮询降频（后端 5s / 前端 4s）以控 egress  
- 铸完离热榜 + 前端已铸完少重绘  
- 免费价展示、minted 消毒、veNFT 过滤  
- 顶栏「更新」浮层；精简更新文案  
- 本地 `HTTPS_PROXY` + undici 出站修复  
- **Blockscout 状态警示**（live 绿标 / 故障红标 + 可关闭原因条；窗口数据与轮询健康诊断） 

---

## 7. 商业与后续方向（讨论，未实现）

| 方向 | 备注 |
|------|------|
| 推广位 Sponsored | 与自然榜隔离 |
| 发射台 Launch | 可同站路径 `/launch`；索引适合轻量 DB；图走 IPFS |
| AI 画 NFT | 后端代理模型 API；密钥放环境变量 |
| 全站单 Railway | 现阶段推荐；静态页几乎不增成本 |
| 子域名拆 Vercel | 可选；跨站跳转，非必须 |

原则建议：**中立监控热榜** 与 **发行/广告** 叙事隔离。

---

## 8. 已知限制与技术债

- [ ] 依赖 Blockscout 索引延迟与限流（已加前端故障警示；未做 RPC `eth_getLogs` 备份主路径）  
- [x] Blockscout 宕机时面板状态可见（绿 live / 红故障）  
- [ ] OpenSea 未收录则 logo/社交缺失  
- [ ] ve/钓鱼启发式无法 100% 覆盖  
- [ ] 已铸完归档默认容器磁盘可能随部署丢失（需 Railway Volume 才稳）  
- [ ] 无用户账号体系、无服务端收藏同步  
- [ ] 未强制 Blockscout PRO apikey  
- [ ] 非 RPC `eth_getLogs` 主路径（可升级）  

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
```

环境变量（常用）：

```text
PORT / HOST
HTTPS_PROXY / HTTP_PROXY
BLOCKSCOUT_BASE / BLOCKSCOUT_API_KEY
EXPLORER_BASE / OPENSEA_CHAIN / CHAIN_ID
DATA_DIR
```

---

## 10. 一句话总结

> 在 Robinhood Chain 上，用 **Blockscout 索引 + Node 聚合 + 静态前端**，已做成可 **Railway 部署** 的 NFT 铸造雷达：热榜、实时流、已铸完归档、价格/风险/进度、收藏屏蔽、钱包与中英主题，并处理 ve 噪声与供应量误读。  
> 当前是 **可用的垂直监控站**；发射台 / AI 等为后续扩展，建议仍同站分路由、先本地后推送。

---

*文档随 2026-07-13 功能冻结点更新，覆盖截至当前仓库已交付能力。*
