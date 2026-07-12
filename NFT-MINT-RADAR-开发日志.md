# Robinhood NFT Mint Radar — 原型开发日志

> **文档用途**：记录 2026-07-12 前后「NFT 铸造监控面板」原型的完整开发过程、产品定位、技术实现与后续重构参考。  
> **可迁移**：新建独立项目文件夹时，把本文件拷过去即可作为重建蓝本。  
> **状态**：原型验证（Prototype），非生产最终版。

---

## 1. 产品是什么

### 1.1 一句话

**Robinhood Chain 上的实时 NFT 铸造雷达**：看当前哪些集合正在被大量 mint，辅助发现链上 alpha。

### 1.2 要解决的问题

- 新链（Robinhood Chain, chainId **4663**）上 NFT 公售 / free mint 活跃，缺少好用的垂直监控工具。
- 通用浏览器（Blockscout）能查单笔交易，但不聚合「谁在猛铸」。
- 目标用户：链上交易者、mint 猎人、项目方（后期可能买推广）。

### 1.3 明确不做（原型阶段）

- 不托管用户资产、不连接钱包铸造（讨论过，未实现）。
- 不保证 mint 收益、不构成投资建议。
- 自然热榜不卖排名（若做广告，应单独「推广位」并标注 Sponsored）。

### 1.4 与同仓库其它产品的关系

当前仓库 `监控面板` 里其实有两套东西：

| 模块 | 入口 | 作用 |
|------|------|------|
| **钱包交叉买入监控**（原有） | `http://localhost:3789/` → `public/index.html` | 多钱包同时买过的 ERC-20 代币 |
| **NFT Mint Radar**（本次新建） | `http://localhost:3789/mint.html` | ERC-721 铸造热榜 + 实时流 |

重构时建议：**拆成独立 repo / 独立文件夹**，本日志只服务 Mint Radar。

---

## 2. 链与关键地址

| 项 | 值 |
|----|-----|
| 网络名 | Robinhood Chain |
| Chain ID | `4663` |
| 原生币 | ETH |
| 浏览器 | https://robinhoodchain.blockscout.com |
| 公开 RPC | https://rpc.mainnet.chain.robinhood.com |
| 平均出块 | ~100ms 量级（以 explorer stats 为准） |
| OpenSea chain slug | `robinhood` |
| SeaDrop（常见 mint 入口） | `0x00005EA00Ac477B1030CE78506496e8C2dE24bf5` |
| OpenSea 平台费收款（常见） | `0x0000a26b00c1F0DF003000390027140000fAa719` |

### OpenSea 链接规则

- 集合/合约页：`https://opensea.io/contract/robinhood/{contract}`
- 单 token：`https://opensea.io/item/robinhood/{contract}/{tokenId}`
- 有 slug 时也可用：`https://opensea.io/collection/{slug}`

### Mint 判定（链上语义）

- ERC-721 `Transfer`，**from = `0x000…000`** → 铸造  
- Blockscout 常标 `type: token_minting`  
- 注意噪音：Uniswap V3/V4 Position NFT、钓鱼 Gift/Airdrop 等

### SeaDrop 付费 mint 分账（实测结论）

公开 `mintPublic` 时，用户支付的 **value** 一般拆成：

1. **feeBps** 部分 → `feeRecipient`（多为 OpenSea `0x0000a26b…`）  
2. 剩余 → SeaDrop 上该 NFT 配置的 **`getCreatorPayoutAddress(nft)`**（项目方收款地址）

Explorer 上 internal txs 可能为空，但事件 `SeaDropMint` + 链上 `getCreatorPayoutAddress` 可还原。  
示例交易：`0xeb4fbb62c87e2701646487cf09bf8b718cd7a5e285bde5194ceb3a9d571ab4a3`（Hood Pudgy，5 个，单价 0.00001 ETH，feeBps=1000）。

---

## 3. 数据从哪来（重要）

### 3.1 当前架构：近实时，不是直连节点扫 logs

```
链上出块
  → Blockscout 索引
  → 本机后端轮询 REST（约 2s）
  → 内存滑动窗口聚合
  → 前端轮询 /api/mints（约 2.5s）
```

**结论**：是 **索引层近实时**，延迟通常数秒级；**没有** mempool、**没有** `eth_subscribe` logs。

### 3.2 主数据源

| 用途 | 接口 |
|------|------|
| 全链 ERC-721 动态 | `GET {blockscout}/api/v2/advanced-filters?transaction_types=ERC-721` |
| 单笔 token transfers | `GET …/api/v2/transactions/{hash}/token-transfers` |
| 集合元数据 | `GET …/api/v2/tokens/{address}` |
| 实例图兜底 | `GET …/api/v2/tokens/{address}/instances` |
| Logo + 社交 | OpenSea API（见下） |

### 3.3 OpenSea 元数据 enrichment

1. `GET https://api.opensea.io/api/v2/chain/robinhood/contract/{addr}` → `collection` slug  
2. `GET https://api.opensea.io/api/v2/collections/{slug}` →  
   - `image_url`（logo）  
   - `twitter_username`  
   - `discord_url` / `telegram_url` / `project_url`  
   - `opensea_url` / description  

未上架或未填社交 → icon 用 Blockscout 实例图或占位字母；社交图标 **仍显示但不可点**。

### 3.4 Blockscout PRO API（用户已注册 DevPortal，原型未强制接入）

- 网关：`https://api.blockscout.com/{chainId}/api/v2/...?apikey=`  
- Robinhood **已支持** chainId `4663`  
- Free：约 100k credits / 周期，5 rps  
- 可作后续更稳数据源；注意 advanced-filters 等 endpoint 耗 credit  

### 3.5 本机网络注意

- Windows 上 Node 原生 `fetch` **不一定走系统代理**。  
- 开发环境使用了 `HTTP(S)_PROXY=http://127.0.0.1:7897`（Clash 等）。  
- 解决：依赖 **`undici`** 的 `ProxyAgent` + `fetch`（见 `server/mint-radar.js`）。

---

## 4. 今天做了什么（按时间线）

1. **调研**  
   - 确认 Blockscout 可解析 NFT mint（from=0、token_minting、SeaDrop mintPublic）。  
   - 评估做实时面板的可行性与瓶颈（索引 vs 节点）。

2. **新建 Mint Radar 后端**  
   - `server/mint-radar.js`：轮询、去噪、聚合、元数据队列。  
   - `server/index.js`：注册 `GET /api/mints`，启动时 `startMintRadar()`。

3. **新建前端页**  
   - `public/mint.html` / `mint.css` / `mint.js`  
   - 热榜（1/5/15 分钟）、实时流、过滤 LP、OpenSea/Explorer 链接。

4. **产品迭代**  
   - 集合 OpenSea 链接。  
   - Logo + 社交 enrichment（OpenSea + Blockscout 兜底）。  
   - 社交改为固定三图标：X / Website / OpenSea（无链接则灰显不可点）。  
   - OpenSea 图标换成品牌图 `public/opensea-icon.jpg`。  
   - 站点 favicon：`public/favicon.svg`。  
   - 顶部 KPI 从「1/5/15 分钟铸造总数」改为关键小指标（最热、速度、独立 minter、新盘、最近一笔、区块）。

5. **产品/商业讨论（未写代码）**  
   - 连钱包站内 mint 难度（public 易、allowlist proof 难）。  
   - 变现：推广位广告 vs 会员 vs Launchpad vs 官方代币。  
   - 原则建议：工具中立热榜与发行/广告品牌隔离。

6. **链上拆账验证**  
   - 解析 SeaDrop mint 交易 value 去向（OS fee + creator payout）。

---

## 5. 代码结构（Mint Radar 相关）

```
监控面板/
├── package.json                 # express, undici；scripts: start / dev
├── server/
│   ├── index.js                 # Express 入口；/api/mints；静态 public
│   ├── mint-radar.js            # ★ 铸造雷达核心
│   ├── scanner.js               # （原有）钱包交叉扫描，与 mint 无关
│   ├── gmgn.js / noxa.js        # （原有）代币社交/行情
│   └── ...
├── public/
│   ├── mint.html                # ★ 铸造雷达页面
│   ├── mint.css
│   ├── mint.js
│   ├── favicon.svg              # 站点图标
│   ├── opensea-icon.jpg         # OpenSea 船标
│   ├── index.html               # 原交叉买入面板
│   └── ...
└── NFT-MINT-RADAR-开发日志.md   # 本文件
```

### 5.1 后端要点 `mint-radar.js`

- 轮询间隔：`POLL_MS ≈ 2000`  
- 事件缓存：最多约 4000 条，丢弃 30 分钟前  
- 过滤：  
  - 仅 ERC-721 且 from=0  
  - 黑名单 LP：UNI-V3/V4 Positions 合约  
  - 名称启发式垃圾：gift/claim/airdrop/alert…  
- 聚合窗口：1m / 5m / 15m  
- 热度 score（简化）：mints、unique minters、mintsPerMin、低 supply 加权  
- 元数据：队列 + 限速（约 350ms）、TTL（成功 30m / 失败 5m）  
- 代理：读 `HTTPS_PROXY` / `HTTP_PROXY`

### 5.2 API

```http
GET /api/mints?window=5&feed=100&hot=30
```

响应大致结构：

```json
{
  "ok": true,
  "chain": { "name": "Robinhood Chain", "explorer": "..." },
  "status": {
    "lastPollAt": "...",
    "lastError": null,
    "pollCount": 0,
    "storeSize": 0,
    "latestBlock": null,
    "metaCached": 0,
    "metaOk": 0,
    "metaQueue": 0
  },
  "stats": { "mints1m": 0, "mints5m": 0, "mints15m": 0, "collections5m": 0 },
  "hot": [ /* 当前 window 热榜，含 icon/twitter/website/opensea */ ],
  "hot1m": [],
  "hot15m": [],
  "feed": [ /* 最近 mint 流水 */ ]
}
```

### 5.3 前端要点

- 无框架：原生 HTML/CSS/JS  
- 2.5s 拉一次 `/api/mints`  
- 时间窗按钮切换 1/5/15 分钟（用 hot1m / hot / hot15m）  
- KPI 条：当前最热、铸造速度、独立 minter、活跃集合、新盘、最近一笔、区块  
- 图标行：始终渲染 X / Web / OpenSea  

### 5.4 本地运行

```bash
cd <项目目录>
npm install
# 若需代理访问 Blockscout/OpenSea：
# set HTTPS_PROXY=http://127.0.0.1:7897
# set HTTP_PROXY=http://127.0.0.1:7897
npm start
# → http://localhost:3789/mint.html
```

默认端口：`3789`（`process.env.PORT` 可改）。

---

## 6. 产品设计结论（讨论沉淀）

### 6.1 为什么市面上类似产品少（MintFun 等）

- MVP 容易，**全周期运维 + 信任 + 变现 + 扛淡季** 难。  
- 赛道潮汐强，景气一过产品难养。  
- 护城河在心智与分发，不在「会画热榜」。

### 6.2 变现方向（仅讨论，未实现）

| 路径 | 评价 |
|------|------|
| 付费推广位（如 $200/天） | 最贴工具；必须与自然榜隔离并标 Sponsored |
| 会员 | 需先有强钩子（告警等），否则随缘 |
| 严选发行 / Launchpad | 需与雷达品牌隔离；可自营高标准项目 |
| 官方代币 + 交易费 | 冷启动常见；市值≠公允估值；勿污染中立热榜 |

### 6.3 站内 mint（未来）

- SeaDrop **`mintPublic`**：参数简单，前端可直调。  
- Allowlist / `mintSigned`：依赖 proof/签名，难替代 OpenSea 网页。  
- 策略建议：能直铸则直铸，否则跳 OpenSea。

### 6.4 性能升级路径

1. 现状：Blockscout 轮询（够原型）  
2. 中期：Robinhood RPC + `eth_getLogs`（from=0 的 Transfer）  
3. 进阶：websocket 订阅、mempool、多链  

瓶颈排序：**数据源类型 > 索引延迟 > 轮询/限流 > 前端**。

---

## 7. 已知限制与技术债

- [ ] 依赖第三方索引，漏块/延迟不可完全控  
- [ ] 公开 API 限流；高频轮询可能被掐  
- [ ] OpenSea 未收录集合无 logo/社交  
- [ ] 去噪规则较粗，钓鱼盘仍可能进榜  
- [ ] 无持久化 DB，重启丢内存缓存  
- [ ] 无用户系统、无推广后台、无钱包  
- [ ] 与「交叉买入监控」耦合在同一 Express 进程  
- [ ] `ethereum-cryptography` 曾为临时算 selector 安装，非 mint 运行时必需（可清理）  
- [ ] 未正式接入 Blockscout PRO apikey  

---

## 8. 重建项目时的建议清单（Checklist）

独立新文件夹时建议：

1. **只带 Mint Radar**：`mint-radar` 后端 + `mint` 前端，去掉钱包交叉逻辑（或 submodule）。  
2. **环境变量**：`PORT`、`HTTPS_PROXY`、`BLOCKSCOUT_BASE`、`BLOCKSCOUT_API_KEY`、`RPC_URL`。  
3. **配置化**：黑名单、垃圾名正则、SeaDrop 地址、OpenSea chain slug。  
4. **双源采集**：REST 保底 + RPC logs 提速。  
5. **推广位**：独立配置/表，UI 与热榜分离。  
6. **告警**：TG/Discord webhook（会员钩子）。  
7. **可 mint 探测**：识别 SeaDrop public 并展示价格/是否可站内铸。  
8. **品牌**：favicon、域名、与「发行/代币」叙事隔离说明页。

### 最小文件拷贝清单（从本原型）

```
server/mint-radar.js
server/index.js          # 需裁剪，只留 mint + static
public/mint.html
public/mint.css
public/mint.js
public/favicon.svg
public/opensea-icon.jpg
package.json             # express + undici
NFT-MINT-RADAR-开发日志.md
```

---

## 9. 关键常量速查

```text
BLOCKSCOUT = https://robinhoodchain.blockscout.com
OPENSEA_CHAIN = robinhood
ZERO = 0x0000000000000000000000000000000000000000
SEADROP = 0x00005EA00Ac477B1030CE78506496e8C2dE24bf5
OS_FEE = 0x0000a26b00c1F0DF003000390027140000fAa719
CHAIN_ID = 4663
DEFAULT_PORT = 3789
```

SeaDrop 常用读法（RPC eth_call）：

- `getCreatorPayoutAddress(address)` selector：`0x5cb3c4d3`  
- `getPublicDrop(address)` selector：`0xbc6a629c`  

---

## 10. 一句话总结

> 我们在 Robinhood Chain 上验证了：**用 Blockscout 索引 + 轻量 Node 聚合 + 静态前端，可以快速做出「NFT 铸造热度雷达」原型**；并补齐了 OpenSea 元数据、KPI、品牌资源。  
> 这是 **产品与数据管线的原型验证**，不是最终形态。下一步宜独立成项目，按需升级 RPC、推广位与（可选）官方发行/代币叙事，并保持 **中立监控与商业发行分离**。

---

*文档生成于原型开发会话结束时，供后续「重新做一遍」时对照使用。*
