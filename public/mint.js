(() => {
  const $ = (id) => document.getElementById(id);
  const LANG_KEY = "mint-radar-lang";
  const THEME_KEY = "mint-radar-theme";
  const BLOCK_KEY = "mint-radar-blocked";
  const BLOCK_META_KEY = "mint-radar-blocked-meta";
  const FAV_KEY = "mint-radar-favorites";
  const FAV_META_KEY = "mint-radar-favorites-meta";
  const PRICE_FILTER_KEY = "mint-radar-price-filter";
  /** address -> { [roundKey]: true } — which win notices were opened */
  const RAFFLE_READ_KEY = "mint-radar-raffle-read-v1";

  /** ROBIN 官方社区 NFT — 更新为实际上线后的 OpenSea 铸造/合集页 */
  const OFFICIAL_NFT = {
    mintUrl: "https://opensea.io/collection/supermax-mech",
  };

  const EYE_SLASH_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2.1 3.51 3.51 2.1l18.38 18.39-1.41 1.41-3.1-3.1A11.4 11.4 0 0 1 12 19c-5 0-9.27-3.11-11-7.5a12.3 12.3 0 0 1 4.18-5.09L2.1 3.51zM12 7a5 5 0 0 1 5 5c0 .7-.14 1.36-.4 1.97l-1.57-1.57A2.99 2.99 0 0 0 12 9c-.4 0-.78.08-1.13.23L9.3 7.66A4.96 4.96 0 0 1 12 7zm0-5c5 0 9.27 3.11 11 7.5a12.48 12.48 0 0 1-4.05 5.04l-1.45-1.45A10.4 10.4 0 0 0 21.17 9.5 10.46 10.46 0 0 0 12 4c-1.08 0-2.12.16-3.1.46L7.35 2.9A12.3 12.3 0 0 1 12 2zM8.12 9.54 9.6 11A3 3 0 0 0 12 15c.36 0 .7-.06 1.02-.18l1.48 1.48A5 5 0 0 1 8.12 9.54z"/></svg>`;
  /* Outline star — stroke follows currentColor so light/dark themes flip black↔white */
  const STAR_SVG = `<svg class="star-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M12 3.1l2.45 5.55 6 .55-4.55 3.95 1.4 5.85L12 15.85 6.7 19l1.4-5.85-4.55-3.95 6-.55L12 3.1z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round" fill="none"/></svg>`;
  const SEARCH_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;

  /**
   * Product updates — newest first. Short, user-facing only (no eng jargon fluff).
   * Before any GitHub push: review new lines with the user first.
   */
  const UPDATES = [
    {
      date: "2026-07-14",
      zh: "官方 NFT 上线：OpenSea 弹窗可直达 Supermax Mech 合集 mint",
      en: "Official NFT live — OpenSea modal links to Supermax Mech collection mint",
    },
    {
      date: "2026-07-14",
      zh: "社区白名单模块：顶部 Whitelist 查看抽奖期数、中奖地址与钱包红点提醒",
      en: "Community whitelist raffle — Whitelist tab, draw rounds, winners, wallet win alerts",
    },
    {
      date: "2026-07-14",
      zh: "钱包 NFT：连接钱包后可在菜单中读取 Robinhood 链持仓列表",
      en: "Wallet NFTs — connected wallet menu shows your Robinhood chain holdings",
    },
    {
      date: "2026-07-13",
      zh: "Blockscout 状态警示：正常显示绿色 Blockscout live；浏览器故障时红标提醒，并说明原因（可关闭）",
      en: "Blockscout status: green “Blockscout live” when healthy; red alert with reason when the explorer fails (dismissible)",
    },
    {
      date: "2026-07-13",
      zh: "过滤投票锁仓类 NFT（veNFT 等），不再进入热榜",
      en: "Hide vote-escrow NFTs (veNFT, etc.) from the hot list",
    },
    {
      date: "2026-07-13",
      zh: "修正部分项目「已铸造」数量异常偏大的问题",
      en: "Fix incorrect oversized Minted counts on some collections",
    },
    {
      date: "2026-07-13",
      zh: "铸完项目自动离开热榜，并归入已铸完",
      en: "Sold-out collections leave the hot list and move to Minted Out",
    },
    {
      date: "2026-07-13",
      zh: "免费铸造统一显示为「免费」",
      en: "Free mints always display as Free",
    },
  ];

  const I18N = {
    zh: {
      htmlLang: "zh-CN",
      title: "ROBIN NFT Radar · Robinhood Chain",
      brandTitle: "ROBIN NFT Radar",
      brandSub: "Robinhood Chain · 实时铸造热度",
      updatesLink: "Updates",
      updatesTitle: "最近更新",
      updatesClose: "关闭",
      openseaLink: "OpenSea",
      openseaTitle: "铸造 ROBIN 官方 NFT",
      openseaP1:
        "这是我们发行的社区会员凭证。在 Robinhood 链上通过 OpenSea 铸造后，即成为会员——无需额外登记。",
      openseaP2: "会员权益：",
      openseaLi1:
        "白名单抽奖：持有官方 NFT 即可参与；按 token 编号抽取，持有越多中签概率越高，可赢取链上项目 guaranteed / FCFS 等白名单名额",
      openseaLi2:
        "中奖提醒：连接钱包后，若你的地址中奖，顶部「白名单」旁会出现红点通知",
      openseaLi3:
        "Alpha List：我们整理的优质项目情报源，仅对会员开放（需连接钱包且持有官方 NFT；内容系统筹备中）",
      openseaNote:
        "开奖规则详见顶部「白名单」。Alpha List 功能即将上线，届时会员可在站内查看。",
      openseaCta: "去 OpenSea mint ↗",
      openseaCloseAria: "关闭说明",
      raffleLink: "Whitelist",
      raffleTitle: "社区白名单抽奖",
      raffleCloseAria: "关闭白名单抽奖",
      raffleEmpty: "暂无抽奖期数",
      rafflePeriod: (n) => `抽奖第 ${n} 期`,
      raffleStatusDrawn: "已开奖",
      raffleStatusPending: "待开奖",
      raffleSpots: (n) => `${n} 个名额`,
      raffleProjectLabel: "项目方",
      raffleWlTypeLabel: "白名单类型",
      raffleTwitterLabel: "Twitter",
      raffleWinnersLabel: "中奖钱包地址",
      rafflePendingHint: "尚未开奖 · 开奖后将在此公示地址",
      raffleCopy: "复制",
      raffleCopied: "已复制",
      raffleLoadError: "抽奖数据加载失败，请稍后重试",
      raffleLoading: "加载中…",
      raffleDrawnAt: (s) => `开奖时间 ${s}`,
      raffleWinHint:
        "连接钱包后，若你的地址在某一期中奖，顶部「白名单」旁会出现红点提醒（点开后消失）。示例期会用你的地址演示中奖效果。",
      raffleYouWon: "你中奖了",
      raffleDemoBadge: "示例预览",
      raffleUnreadAria: "有未读中奖通知",
      refresh: "立即刷新",
      dataFreshness: (rel) => `更新于 ${rel}`,
      dataFreshnessWaiting: "等待数据…",
      toggleGroupLabel: "主题与语言",
      themeLight: "浅色",
      themeDark: "深色",
      themeToggleTitle: "切换主题",
      langToggleTitle: "切换语言",
      hotTitle: "🔥 铸造热榜",
      thCollection: "集合",
      th5m: "5 分钟",
      th30m: "30 分钟",
      th1h: "1 小时",
      thPrice: "价格",
      thHolders: "Holders",
      thMinted: "已铸造",
      thRecent: "最近",
      priceFree: "免费",
      pricePending: "…",
      priceFilterAll: "全部",
      priceFilterFree: "免费",
      priceFilterPaid: "付费",
      priceFilterTitle: "按价格筛选",
      mintOut: "MINT OUT",
      mintProgressTitle: (minted, max, pct) =>
        `进度 ${minted} / ${max}（${pct}%）`,
      mintProgressUnknown: "上限未知（开放铸造或合约未读到 maxSupply）",
      hotLoading: "正在拉取链上 mint…",
      hotEmpty: "暂无铸造数据（或仍在预热缓存）…",
      feedTitle: "⚡ 实时铸造流",
      feedHint: "from 0x0 · ERC-721",
      feedEmpty: "暂无铸造事件",
      outTitle: "🏁 已铸完",
      outHint: "MINT OUT · 仍可跟进",
      outEmpty: "暂无已铸完项目",
      statusWaiting: "等待数据…",
      footerNote: "数据源：Blockscout REST · 无需自建节点（后续可升级 RPC eth_getLogs）",
      justNow: "刚刚",
      secAgo: (s) => `${s}s 前`,
      minAgo: (m) => `${m}m 前`,
      hourAgo: (h) => `${h}h 前`,
      statusError: (err, n) => `错误: ${err} · 轮询 #${n}`,
      statusWarm: "首次拉取 Blockscout…",
      statusOk: (pollRel, store, metaOk, metaCached, n) =>
        `上次轮询 ${pollRel} · mint ${store} · meta ${metaOk}/${metaCached} · poll #${n}`,
      healthTitle: {
        ok: "数据正常",
        warm: "正在预热",
        warming: "正在预热",
        rate_limited: "Blockscout 限流",
        poll_error: "Blockscout 故障",
        poller_stale: "Blockscout 无响应",
        poll_slow: "Blockscout 偏慢",
        empty_store: "无铸造缓存",
        data_stale: "数据长时间未更新",
      },
      /** Healthy pill — always English product copy */
      healthChipLive: "Blockscout live",
      healthChipLiveTitle: "区块浏览器运行正常（5/10 分钟窗口有数据）",
      healthChip: {
        poll_error: "Blockscout 故障",
        poller_stale: "Blockscout 无响应",
        rate_limited: "Blockscout 限流",
        poll_slow: "Blockscout 偏慢",
        empty_store: "数据异常",
        data_stale: "数据过期",
      },
      healthHint: {
        poll_error:
          "区块浏览器 API 异常，面板暂时无法拉取新 mint。链本身可能仍正常。",
        poller_stale:
          "长时间连不上 Blockscout，铸造热榜/实时流已暂停更新。",
        rate_limited: "Blockscout 触发限流，正在自动退避重试。",
        poll_slow: "Blockscout 响应偏慢，数据可能短暂滞后。",
        data_stale:
          "长时间读不到 5 分钟/30 分钟窗口数据，且最近 mint 已超过 20～30 分钟未更新，判定为故障。",
        empty_store: "mint 缓存为空，读不到 5/30 分钟窗口数据。",
        warming: "正在首次连接 Blockscout…",
      },
      healthLink: "打开 Blockscout 检查 ↗",
      healthDismiss: "关闭提示",
      healthMeta: (newestRel, pollRel, store, fails) =>
        `最新 mint ${newestRel || "—"} · 上次成功轮询 ${pollRel || "—"} · 缓存 ${store ?? "—"} · 连续失败 ${fails ?? 0}`,
      socialOff: (title) => `${title}（未检测到）`,
      minter: "minter",
      explorer: "Explorer",
      blockTitle: "屏蔽此项目",
      googleSearchTitle: "Google 搜图",
      walletDisconnect: "退出钱包",
      walletMenuTitle: "已连接",
      walletNftsLabel: "钱包 NFT",
      walletNftsLoading: "正在读取 NFT…",
      walletNftsEmpty: "该地址暂无 NFT",
      walletNftsError: "读取失败，请稍后重试",
      walletNftsErrorDetail: (msg) => `读取失败：${msg}`,
      walletNftsTruncated: (n) => `已显示 ${n} 个 · 可滚动查看`,
      walletNftsCount: (n) => `${n} 个`,
      blockedBtn: (n) => `已屏蔽 · ${n}`,
      blockedTitle: "屏蔽列表",
      blockedClear: "全部取消",
      blockedEmpty: "暂无屏蔽",
      unblock: "取消屏蔽",
      favoriteTitle: "收藏此项目",
      unfavoriteTitle: "取消收藏",
      favBtn: (n) => `已收藏 · ${n}`,
      favTitle: "收藏列表",
      favClear: "全部取消",
      favEmpty: "暂无收藏",
      unfavorite: "取消收藏",
      highRisk: "高风险",
      highRiskTitle: (ratio) =>
        `高风险：已铸造 ÷ Holders ≈ ${ratio}（>10，人均持仓偏多，疑似控盘）`,
    },
    en: {
      htmlLang: "en",
      title: "ROBIN NFT Radar · Robinhood Chain",
      brandTitle: "ROBIN NFT Radar",
      brandSub: "Robinhood Chain · Live mint heat",
      updatesLink: "Updates",
      updatesTitle: "Recent updates",
      updatesClose: "Close",
      openseaLink: "OpenSea",
      openseaTitle: "Mint the ROBIN Official NFT",
      openseaP1:
        "Our official membership pass. Mint on Robinhood Chain via OpenSea to become a member — no extra signup.",
      openseaP2: "Member benefits:",
      openseaLi1:
        "WL raffles — hold the official NFT to enter; random token IDs each round, more NFTs = better odds, win guaranteed / FCFS spots from on-chain projects",
      openseaLi2:
        "Win alerts — connect your wallet; a red dot appears next to Whitelist when you win",
      openseaLi3:
        "Alpha List — curated project intel for members only (wallet + official NFT required; content system coming soon)",
      openseaNote:
        "See Whitelist for draw rules. Alpha List launches soon for members on-site.",
      openseaCta: "Mint on OpenSea ↗",
      openseaCloseAria: "Close",
      raffleLink: "Whitelist",
      raffleTitle: "Community WL Raffle",
      raffleCloseAria: "Close whitelist raffle",
      raffleEmpty: "No raffle rounds yet",
      rafflePeriod: (n) => `Round ${n}`,
      raffleStatusDrawn: "Drawn",
      raffleStatusPending: "Pending",
      raffleSpots: (n) => `${n} spots`,
      raffleProjectLabel: "Partner",
      raffleWlTypeLabel: "WL type",
      raffleTwitterLabel: "Twitter",
      raffleWinnersLabel: "Winning wallets",
      rafflePendingHint: "Not drawn yet — winners will be listed here",
      raffleCopy: "Copy",
      raffleCopied: "Copied",
      raffleLoadError: "Failed to load raffle data",
      raffleLoading: "Loading…",
      raffleDrawnAt: (s) => `Drawn ${s}`,
      raffleWinHint:
        "Connect your wallet — a red dot appears on Whitelist when you win (clears after you open it). Demo rounds preview the win UI with your address.",
      raffleYouWon: "You won",
      raffleDemoBadge: "Demo",
      raffleUnreadAria: "Unread win notification",
      refresh: "Refresh",
      dataFreshness: (rel) => `Updated ${rel}`,
      dataFreshnessWaiting: "Waiting for data…",
      toggleGroupLabel: "Theme and language",
      themeLight: "Light",
      themeDark: "Dark",
      themeToggleTitle: "Switch theme",
      langToggleTitle: "Switch language",
      hotTitle: "🔥 Mint Leaderboard",
      thCollection: "Collection",
      th5m: "5 min",
      th30m: "30 min",
      th1h: "1 hour",
      thPrice: "Price",
      thHolders: "Holders",
      thMinted: "Minted",
      thRecent: "Latest",
      priceFree: "Free",
      pricePending: "…",
      priceFilterAll: "All",
      priceFilterFree: "Free",
      priceFilterPaid: "Paid",
      priceFilterTitle: "Filter by price",
      mintOut: "MINT OUT",
      mintProgressTitle: (minted, max, pct) =>
        `Progress ${minted} / ${max} (${pct}%)`,
      mintProgressUnknown: "Max supply unknown (open edition or unread maxSupply)",
      hotLoading: "Loading on-chain mints…",
      hotEmpty: "No mint data yet (or still warming cache)…",
      feedTitle: "⚡ Live mint feed",
      feedHint: "from 0x0 · ERC-721",
      feedEmpty: "No mint events yet",
      outTitle: "🏁 Minted Out",
      outHint: "MINT OUT · still trackable",
      outEmpty: "No sold-out collections yet",
      statusWaiting: "Waiting for data…",
      footerNote:
        "Source: Blockscout REST · No self-hosted node (RPC eth_getLogs later)",
      justNow: "just now",
      secAgo: (s) => `${s}s ago`,
      minAgo: (m) => `${m}m ago`,
      hourAgo: (h) => `${h}h ago`,
      statusError: (err, n) => `Error: ${err} · poll #${n}`,
      statusWarm: "First Blockscout fetch…",
      statusOk: (pollRel, store, metaOk, metaCached, n) =>
        `Last poll ${pollRel} · mint ${store} · meta ${metaOk}/${metaCached} · poll #${n}`,
      healthTitle: {
        ok: "Healthy",
        warm: "Warming up",
        warming: "Warming up",
        rate_limited: "Blockscout rate limit",
        poll_error: "Blockscout outage",
        poller_stale: "Blockscout unreachable",
        poll_slow: "Blockscout slow",
        empty_store: "Empty mint store",
        data_stale: "Data stale",
      },
      healthChipLive: "Blockscout live",
      healthChipLiveTitle: "Block explorer healthy (5m/10m windows have data)",
      healthChip: {
        poll_error: "Blockscout down",
        poller_stale: "Blockscout down",
        rate_limited: "Rate limited",
        poll_slow: "Blockscout slow",
        empty_store: "Data issue",
        data_stale: "Data stale",
      },
      healthHint: {
        poll_error:
          "Blockscout API is failing — the panel cannot ingest new mints. The chain itself may still be fine.",
        poller_stale:
          "No successful Blockscout poll for a while — leaderboard/feed updates are paused.",
        rate_limited: "Blockscout rate-limited us; backing off automatically.",
        poll_slow: "Blockscout is slower than usual; data may lag briefly.",
        data_stale:
          "No 5m/30m window data for a long time, and the newest mint is over 20–30 minutes old — treating as a data fault.",
        empty_store: "Mint store empty — cannot read 5m/30m windows.",
        warming: "Connecting to Blockscout for the first time…",
      },
      healthLink: "Open Blockscout ↗",
      healthDismiss: "Dismiss",
      healthMeta: (newestRel, pollRel, store, fails) =>
        `Newest mint ${newestRel || "—"} · last OK poll ${pollRel || "—"} · store ${store ?? "—"} · fails ${fails ?? 0}`,
      socialOff: (title) => `${title} (not found)`,
      minter: "minter",
      explorer: "Explorer",
      blockTitle: "Block this collection",
      googleSearchTitle: "Google image search",
      walletDisconnect: "Disconnect",
      walletMenuTitle: "Connected",
      walletNftsLabel: "Wallet NFTs",
      walletNftsLoading: "Loading NFTs…",
      walletNftsEmpty: "No NFTs in this wallet",
      walletNftsError: "Failed to load NFTs",
      walletNftsErrorDetail: (msg) => `Failed: ${msg}`,
      walletNftsTruncated: (n) => `Showing ${n} · scroll for more`,
      walletNftsCount: (n) => `${n}`,
      blockedBtn: (n) => `Blocked · ${n}`,
      blockedTitle: "Blocked list",
      blockedClear: "Unblock all",
      blockedEmpty: "Nothing blocked",
      unblock: "Unblock",
      favoriteTitle: "Favorite this collection",
      unfavoriteTitle: "Remove favorite",
      favBtn: (n) => `Favorites · ${n}`,
      favTitle: "Favorites",
      favClear: "Clear all",
      favEmpty: "No favorites yet",
      unfavorite: "Unfavorite",
      highRisk: "High Risk",
      highRiskTitle: (ratio) =>
        `High Risk: Minted ÷ Holders ≈ ${ratio} (>10 — few holders, heavy mint, possible wash/control)`,
    },
  };

  function detectLang() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "zh" || saved === "en") return saved;
    } catch {
      /* ignore */
    }
    const nav = (navigator.language || "").toLowerCase();
    return nav.startsWith("zh") ? "zh" : "en";
  }

  function detectTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      /* ignore */
    }
    // Prefer explicit attribute from FOUC script; else dark product default
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return "dark";
  }

  /** Fixed ranking window: who appears on the board (5m/30m/1h columns carry the volume detail). */
  const RANK_WINDOW_MIN = 60;

  let lang = detectLang();
  let theme = detectTheme();
  /** @type {"all"|"free"|"paid"} */
  let priceFilter = loadPriceFilter();
  let timer = null;
  let lastFeedKeys = new Set();
  /** last successful API payload — re-render on language switch */
  let lastData = null;
  /**
   * Sticky client-side minted-out archive (contract → row).
   * Once listed, panel is NOT re-polled/re-rendered every few seconds — only when
   * a new sold-out collection is detected (from hot scan or first server bootstrap).
   */
  /** @type {Map<string, object>} */
  const localMintedOut = new Map();
  /** Signature of contracts currently painted in #mintedOut */
  let mintedOutPaintSig = "";
  /** After first successful bootstrap of mintedOut from API, later polls use out=0 */
  let mintedOutBootstrapped = false;
  let blockedPanelOpen = false;
  let favoritesPanelOpen = false;
  /** Ignore document-level close for the same click that opened the panel */
  let blockedIgnoreOutsideUntil = 0;
  let favoritesIgnoreOutsideUntil = 0;
  /** @type {Set<string>} */
  let blocked = loadBlocked();
  /** @type {Map<string, {name?: string, symbol?: string}>} */
  let blockedMeta = loadBlockedMeta();
  /** @type {Set<string>} */
  let favorites = loadFavorites();
  /** @type {Map<string, {name?: string, symbol?: string, icon?: string, opensea?: string}>} */
  let favoritesMeta = loadFavoritesMeta();
  /** Broken icon URLs — never retry (stops letter/img flicker on poll re-render) */
  /** @type {Set<string>} */
  const brokenIconUrls = new Set();
  /** contract → last failed icon URL (sticky until URL changes) */
  /** @type {Map<string, string>} */
  const brokenIconByContract = new Map();

  const els = {
    btnWallet: $("btnWallet"),
    hotBody: $("hotBody"),
    feed: $("feed"),
    mintedOut: $("mintedOut"),
    statusLine: $("statusLine"),
    btnRefresh: $("btnRefresh"),
    btnBlocked: $("btnBlocked"),
    blockedPanel: $("blockedPanel"),
    blockedList: $("blockedList"),
    blockedEmpty: $("blockedEmpty"),
    btnClearBlocked: $("btnClearBlocked"),
    btnFavorites: $("btnFavorites"),
    favoritesPanel: $("favoritesPanel"),
    favoritesList: $("favoritesList"),
    favoritesEmpty: $("favoritesEmpty"),
    btnClearFavorites: $("btnClearFavorites"),
    dataHealthBanner: $("dataHealthBanner"),
    dataHealthTitle: $("dataHealthTitle"),
    dataHealthDetail: $("dataHealthDetail"),
    dataHealthDismiss: $("dataHealthDismiss"),
    dataHealthLink: $("dataHealthLink"),
    blockscoutStatusChip: $("blockscoutStatusChip"),
    dataFreshness: $("dataFreshness"),
  };

  /** Last successful client poll (UI refresh) timestamp */
  let lastDataRefreshAt = null;
  let freshnessTicker = null;

  /** User dismissed the current health code — re-show if code changes */
  let healthDismissedCode = null;

  /**
   * Real faults only → red chip + banner.
   * poll_slow is warn-ish and must NOT force red error UI.
   * data_stale only when server marks level=error (long empty windows).
   */
  const BLOCKSCOUT_FAULT_CODES = new Set([
    "poll_error",
    "poller_stale",
    "rate_limited",
    "empty_store",
    "data_stale",
  ]);

  function isBlockscoutFault(code, level) {
    if (!code || code === "ok" || code === "warming" || code === "warm") {
      return false;
    }
    // Never treat healthy / non-error levels as fault
    if (level && level !== "error") return false;
    return BLOCKSCOUT_FAULT_CODES.has(code);
  }

  /** Injected wallet (MetaMask etc.) — UI only for now, no trades */
  const RH_CHAIN_HEX = "0x1237"; // 4663

  const TOGGLE_ICON_SUN =
    '<svg class="toggle-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><g class="sun-rays" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.93 19.07 1.41-1.41"/><path d="m17.66 6.34 1.41-1.41"/></g></svg>';
  const TOGGLE_ICON_MOON =
    '<svg class="toggle-icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 6.5 6.5 0 0 0 21 12.79z"/></svg>';
  /** @type {string|null} */
  let walletAddress = null;
  let walletBusy = false;

  function loadBlocked() {
    try {
      const raw = JSON.parse(localStorage.getItem(BLOCK_KEY) || "[]");
      if (!Array.isArray(raw)) return new Set();
      return new Set(raw.map((a) => String(a || "").toLowerCase()).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function loadBlockedMeta() {
    try {
      const raw = JSON.parse(localStorage.getItem(BLOCK_META_KEY) || "{}");
      const map = new Map();
      if (raw && typeof raw === "object") {
        for (const [k, v] of Object.entries(raw)) {
          map.set(String(k).toLowerCase(), v || {});
        }
      }
      return map;
    } catch {
      return new Map();
    }
  }

  function persistBlocked() {
    try {
      localStorage.setItem(BLOCK_KEY, JSON.stringify([...blocked]));
      const obj = {};
      for (const [k, v] of blockedMeta.entries()) {
        if (blocked.has(k)) obj[k] = v;
      }
      localStorage.setItem(BLOCK_META_KEY, JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  }

  function isBlocked(contract) {
    return blocked.has(String(contract || "").toLowerCase());
  }

  function blockContract(row) {
    const c = String(row?.contract || "").toLowerCase();
    if (!c || c.length < 10) return;
    blocked.add(c);
    blockedMeta.set(c, {
      name: row.name || null,
      symbol: row.symbol || null,
    });
    persistBlocked();
    if (lastData) renderAll(lastData, { forceMintedOut: true });
    else updateBlockedUi();
  }

  function unblockContract(contract) {
    const c = String(contract || "").toLowerCase();
    blocked.delete(c);
    blockedMeta.delete(c);
    persistBlocked();
    if (lastData) renderAll(lastData, { forceMintedOut: true });
    else updateBlockedUi();
  }

  function clearBlocked() {
    blocked.clear();
    blockedMeta.clear();
    persistBlocked();
    if (lastData) renderAll(lastData, { forceMintedOut: true });
    else updateBlockedUi();
  }

  function loadFavorites() {
    try {
      const raw = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      if (!Array.isArray(raw)) return new Set();
      return new Set(raw.map((a) => String(a || "").toLowerCase()).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function loadFavoritesMeta() {
    try {
      const raw = JSON.parse(localStorage.getItem(FAV_META_KEY) || "{}");
      const map = new Map();
      if (raw && typeof raw === "object") {
        for (const [k, v] of Object.entries(raw)) {
          map.set(String(k).toLowerCase(), v || {});
        }
      }
      return map;
    } catch {
      return new Map();
    }
  }

  function persistFavorites() {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
      const obj = {};
      for (const [k, v] of favoritesMeta.entries()) {
        if (favorites.has(k)) obj[k] = v;
      }
      localStorage.setItem(FAV_META_KEY, JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  }

  function isFavorite(contract) {
    return favorites.has(String(contract || "").toLowerCase());
  }

  function openseaUrl(contract, row) {
    const c = String(contract || row?.contract || "").trim();
    if (row?.opensea) return String(row.opensea);
    if (!c) return null;
    return `https://opensea.io/contract/robinhood/${c}`;
  }

  function favoriteMetaFromRow(row) {
    const icon = iconUrlOf(row);
    const c = String(row?.contract || "").toLowerCase();
    return {
      name: row?.name || null,
      symbol: row?.symbol || null,
      icon: icon || null,
      opensea: openseaUrl(c, row),
    };
  }

  function favoriteContract(row) {
    const c = String(row?.contract || "").toLowerCase();
    if (!c || c.length < 10) return;
    favorites.add(c);
    const prev = favoritesMeta.get(c) || {};
    const next = favoriteMetaFromRow(row);
    favoritesMeta.set(c, {
      name: next.name || prev.name || null,
      symbol: next.symbol || prev.symbol || null,
      icon: next.icon || prev.icon || null,
      opensea: next.opensea || prev.opensea || openseaUrl(c),
    });
    persistFavorites();
    if (lastData) renderAll(lastData, { forceMintedOut: true });
    else updateFavoritesUi();
  }

  function unfavoriteContract(contract) {
    const c = String(contract || "").toLowerCase();
    favorites.delete(c);
    favoritesMeta.delete(c);
    persistFavorites();
    if (lastData) renderAll(lastData, { forceMintedOut: true });
    else updateFavoritesUi();
  }

  function toggleFavorite(row) {
    const c = String(row?.contract || "").toLowerCase();
    if (!c) return;
    if (isFavorite(c)) unfavoriteContract(c);
    else favoriteContract(row);
  }

  function clearFavorites() {
    favorites.clear();
    favoritesMeta.clear();
    persistFavorites();
    if (lastData) renderAll(lastData, { forceMintedOut: true });
    else updateFavoritesUi();
  }

  function resolveFavoriteMeta(addr) {
    const base = favoritesMeta.get(addr) || {};
    if (lastData) {
      const all = [...(lastData.hot || []), ...(lastData.feed || [])];
      const hit = all.find((x) => String(x.contract || "").toLowerCase() === addr);
      if (hit) {
        return {
          name: hit.name || base.name || null,
          symbol: hit.symbol || base.symbol || null,
          icon: iconUrlOf(hit) || base.icon || null,
          opensea: openseaUrl(addr, hit) || base.opensea || null,
        };
      }
    }
    return {
      ...base,
      opensea: base.opensea || openseaUrl(addr),
    };
  }

  function updateBlockedUi() {
    const n = blocked.size;
    if (els.btnBlocked) {
      els.btnBlocked.textContent = t("blockedBtn", n);
    }
    // Re-bind list nodes if panel was moved
    if (els.blockedPanel) {
      els.blockedList = els.blockedPanel.querySelector("#blockedList") || $("blockedList");
      els.blockedEmpty =
        els.blockedPanel.querySelector("#blockedEmpty") || $("blockedEmpty");
    }
    if (!els.blockedList || !els.blockedEmpty) return;

    const items = [...blocked];
    if (!items.length) {
      els.blockedList.innerHTML = "";
      els.blockedEmpty.hidden = false;
      return;
    }
    els.blockedEmpty.hidden = true;
    els.blockedList.innerHTML = items
      .map((addr) => {
        const meta = blockedMeta.get(addr) || {};
        const name = meta.name || meta.symbol || short(addr);
        return `<li>
          <div class="b-meta">
            <span class="b-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            <span class="b-addr">${escapeHtml(short(addr))}</span>
          </div>
          <button type="button" class="b-un" data-unblock="${escapeHtml(addr)}">${escapeHtml(t("unblock"))}</button>
        </li>`;
      })
      .join("");
    if (blockedPanelOpen) {
      try {
        positionBlockedPanel();
      } catch {
        /* ignore if not bound yet */
      }
    }
  }

  function updateFavoritesUi() {
    const n = favorites.size;
    if (els.btnFavorites) {
      els.btnFavorites.textContent = t("favBtn", n);
    }
    if (els.favoritesPanel) {
      els.favoritesList =
        els.favoritesPanel.querySelector("#favoritesList") || $("favoritesList");
      els.favoritesEmpty =
        els.favoritesPanel.querySelector("#favoritesEmpty") || $("favoritesEmpty");
    }
    if (!els.favoritesList || !els.favoritesEmpty) return;

    const items = [...favorites];
    if (!items.length) {
      els.favoritesList.innerHTML = "";
      els.favoritesEmpty.hidden = false;
      return;
    }
    els.favoritesEmpty.hidden = true;
    els.favoritesList.innerHTML = items
      .map((addr) => {
        const meta = resolveFavoriteMeta(addr);
        const name = meta.name || meta.symbol || short(addr);
        const href = meta.opensea || openseaUrl(addr);
        return `<li>
          <div class="b-meta">
            <a class="b-name" href="${escapeHtml(href)}" target="_blank" rel="noopener" title="OpenSea · ${escapeHtml(name)}">${escapeHtml(name)}</a>
            <span class="b-addr">${escapeHtml(short(addr))}</span>
          </div>
          <button type="button" class="b-un" data-unfav="${escapeHtml(addr)}">${escapeHtml(t("unfavorite"))}</button>
        </li>`;
      })
      .join("");
    if (favoritesPanelOpen) {
      try {
        positionFavoritesPanel();
      } catch {
        /* ignore if not bound yet */
      }
    }
  }

  function t(key, ...args) {
    const pack = I18N[lang] || I18N.zh;
    const v = pack[key];
    if (typeof v === "function") return v(...args);
    return v != null ? v : key;
  }

  function applyStaticI18n() {
    const pack = I18N[lang] || I18N.zh;
    document.documentElement.lang = pack.htmlLang;
    document.title = pack.title;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      // dynamic keys (functions) skipped here; handled by updateBlockedUi etc.
      if (typeof pack[key] !== "string") return;
      el.textContent = pack[key];
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      if (!key || typeof pack[key] !== "string") return;
      el.setAttribute("aria-label", pack[key]);
    });

    syncLangToggle();
    applyThemeUi();
    syncWalletBtn(); // after i18n — keep address label if connected
    updateBlockedUi();
    updateFavoritesUi();
    renderUpdatesList();
    syncPriceFilterUi();
    if (typeof window.__renderRaffleModal === "function") {
      window.__renderRaffleModal();
    }
    if (isWalletMenuOpen()) renderWalletNfts();
    updateDataFreshnessUi();
  }

  function updateDataFreshnessUi() {
    const el = els.dataFreshness;
    if (!el) return;
    el.classList.remove("is-stale");
    if (!lastDataRefreshAt) {
      el.textContent = t("dataFreshnessWaiting");
      return;
    }
    const rel = relTime(new Date(lastDataRefreshAt).toISOString());
    el.textContent = t("dataFreshness", rel);
    const ageSec = (Date.now() - lastDataRefreshAt) / 1000;
    if (ageSec > 20) el.classList.add("is-stale");
  }

  function renderUpdatesList() {
    const list = document.getElementById("updatesList");
    if (!list) return;
    list.innerHTML = UPDATES.map((u) => {
      const text = lang === "en" ? u.en : u.zh;
      return `<li>
        <span class="upd-date">${escapeHtml(u.date)}</span>
        <span class="upd-text">${escapeHtml(text)}</span>
      </li>`;
    }).join("");
  }

  function syncThemeToggle() {
    const btn = document.getElementById("themeToggle");
    const label = document.getElementById("themeToggleLabel");
    const icon = document.getElementById("themeToggleIcon");
    if (!btn) return;
    const isLight = theme === "light";
    const name = t(isLight ? "themeLight" : "themeDark");
    if (label) label.textContent = name;
    if (icon) icon.innerHTML = isLight ? TOGGLE_ICON_SUN : TOGGLE_ICON_MOON;
    btn.classList.add("is-active");
    const hint = t("themeToggleTitle");
    btn.setAttribute("aria-label", hint);
    btn.title = `${hint} · ${name}`;
  }

  function syncLangToggle() {
    const btn = document.getElementById("langToggle");
    const label = document.getElementById("langToggleLabel");
    if (!btn) return;
    const name = lang === "en" ? "EN" : "中文";
    if (label) label.textContent = name;
    btn.classList.add("is-active");
    const hint = t("langToggleTitle");
    btn.setAttribute("aria-label", hint);
    btn.title = `${hint} · ${name}`;
  }

  function applyThemeUi() {
    document.documentElement.setAttribute("data-theme", theme);
    syncThemeToggle();
    const meta = document.getElementById("metaThemeColor");
    if (meta) {
      meta.setAttribute(
        "content",
        theme === "light" ? "#f4f6fb" : "#0B1220"
      );
    }
  }

  function setTheme(next) {
    if (next !== "light" && next !== "dark") return;
    if (next === theme) return;
    theme = next;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    applyThemeUi();
  }

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  function setLang(next) {
    if (next !== "zh" && next !== "en") return;
    if (next === lang) return;
    lang = next;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* ignore */
    }
    applyStaticI18n();
    if (lastData) {
      renderAll(lastData, { forceMintedOut: true });
    } else {
      els.statusLine.textContent = t("statusWaiting");
    }
  }

  function getEthereum() {
    return typeof window !== "undefined" ? window.ethereum || null : null;
  }

  let walletMenuOpen = false;
  let walletMenuIgnoreOutsideUntil = 0;
  /** @type {{ address: string, items: any[], truncated: boolean, error: string|null } | null} */
  let walletNftCache = null;
  let walletNftLoading = false;
  let walletNftReqId = 0;

  /** Connect label English-only; disconnect follows UI language. */
  function syncWalletBtn() {
    const btn = els.btnWallet;
    if (!btn) return;
    btn.classList.toggle("is-busy", walletBusy);
    btn.classList.toggle("is-connected", !!walletAddress && !walletBusy);
    if (walletBusy) {
      btn.textContent = "Connecting…";
      btn.title = "Connecting…";
      closeWalletMenu();
      return;
    }
    if (walletAddress) {
      btn.textContent = short(walletAddress);
      btn.title = `${walletAddress} · ${t("walletDisconnect")}`;
      return;
    }
    btn.textContent = "Connect Wallet";
    btn.title = "Connect Wallet";
    closeWalletMenu();
  }

  function isWalletMenuOpen() {
    const menu = $("walletMenu");
    return walletMenuOpen && menu && !menu.hidden;
  }

  function setWalletNftStatus(text, show) {
    const el = $("walletNftStatus");
    if (!el) return;
    if (!show || !text) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  /** Skip huge inline data URLs — they stall innerHTML for large wallets */
  function walletNftThumbSrc(image) {
    if (!image) return null;
    const s = String(image);
    if (s.startsWith("data:") && s.length > 400) return null;
    return s;
  }

  function renderWalletNfts() {
    const list = $("walletNftList");
    const countEl = $("walletNftCount");
    const addrEl = $("walletMenuAddr");
    if (addrEl) {
      addrEl.textContent = walletAddress || "—";
      addrEl.title = walletAddress || "";
    }
    if (!list) return;

    if (!walletAddress) {
      list.innerHTML = "";
      if (countEl) countEl.textContent = "";
      setWalletNftStatus("", false);
      return;
    }

    if (walletNftLoading) {
      list.innerHTML = "";
      if (countEl) countEl.textContent = "";
      setWalletNftStatus(t("walletNftsLoading"), true);
      return;
    }

    if (walletNftCache?.error && walletNftCache.address === walletAddress) {
      list.innerHTML = "";
      if (countEl) countEl.textContent = "";
      const errMsg = String(walletNftCache.error || "").trim();
      setWalletNftStatus(
        errMsg ? t("walletNftsErrorDetail", errMsg) : t("walletNftsError"),
        true
      );
      return;
    }

    const items =
      walletNftCache && walletNftCache.address === walletAddress
        ? walletNftCache.items || []
        : [];
    if (countEl) {
      countEl.textContent = items.length ? t("walletNftsCount", items.length) : "";
    }
    if (!items.length) {
      list.innerHTML = "";
      setWalletNftStatus(
        walletNftLoading ? t("walletNftsLoading") : t("walletNftsEmpty"),
        true
      );
      return;
    }

    list.innerHTML = items
      .map((nft) => {
        // Always open OpenSea (item page), not Blockscout
        const href =
          nft.opensea ||
          (nft.contract && nft.tokenId != null && nft.tokenId !== ""
            ? `https://opensea.io/item/robinhood/${nft.contract}/${nft.tokenId}`
            : nft.contract
              ? `https://opensea.io/contract/robinhood/${nft.contract}`
              : "#");
        const name = ellipsize(String(nft.name || "NFT"), 28);
        const subParts = [];
        if (nft.collection) subParts.push(ellipsize(String(nft.collection), 18));
        if (nft.tokenId != null && nft.tokenId !== "") subParts.push(`#${nft.tokenId}`);
        const sub = subParts.join(" · ") || short(nft.contract || "");
        const thumb = walletNftThumbSrc(nft.image);
        const img = thumb
          ? `<img class="wallet-nft-thumb" src="${escapeHtml(thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'wallet-nft-thumb ph','aria-hidden':'true',textContent:'NFT'}))" />`
          : `<span class="wallet-nft-thumb ph" aria-hidden="true">NFT</span>`;
        return `<a class="wallet-nft-item" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="OpenSea · ${escapeHtml(
          String(nft.name || "")
        )}">
          ${img}
          <span class="wallet-nft-meta">
            <span class="wallet-nft-name">${escapeHtml(name)}</span>
            <span class="wallet-nft-sub">${escapeHtml(sub)}</span>
          </span>
        </a>`;
      })
      .join("");

    if (walletNftCache?.truncated) {
      setWalletNftStatus(t("walletNftsTruncated", items.length), true);
    } else {
      setWalletNftStatus("", false);
    }
  }

  async function loadWalletNfts(force) {
    if (!walletAddress) {
      walletNftCache = null;
      renderWalletNfts();
      return;
    }
    if (
      !force &&
      walletNftCache &&
      walletNftCache.address === walletAddress &&
      !walletNftCache.error
    ) {
      renderWalletNfts();
      return;
    }
    const reqId = ++walletNftReqId;
    const addr = walletAddress;
    walletNftLoading = true;
    renderWalletNfts();
    try {
      const res = await fetch(
        `/api/wallet/nfts?address=${encodeURIComponent(addr)}`,
        { cache: "no-store", signal: AbortSignal.timeout(45000) }
      );
      const data = await res.json().catch(() => ({}));
      if (reqId !== walletNftReqId || walletAddress !== addr) return;
      if (!res.ok || data.ok === false) {
        walletNftCache = {
          address: addr,
          items: [],
          truncated: false,
          error: data.error || `HTTP ${res.status}`,
        };
      } else {
        walletNftCache = {
          address: addr,
          items: Array.isArray(data.items) ? data.items : [],
          truncated: !!data.truncated,
          error: null,
        };
      }
    } catch (e) {
      if (reqId !== walletNftReqId || walletAddress !== addr) return;
      walletNftCache = {
        address: addr,
        items: [],
        truncated: false,
        error: e?.message || String(e),
      };
    } finally {
      if (reqId === walletNftReqId) {
        walletNftLoading = false;
        renderWalletNfts();
      }
    }
  }

  function openWalletMenu() {
    const menu = $("walletMenu");
    const btn = els.btnWallet;
    if (!menu || !btn || !walletAddress) return;
    walletMenuOpen = true;
    menu.hidden = false;
    menu.removeAttribute("hidden");
    menu.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    walletMenuIgnoreOutsideUntil = Date.now() + 200;
    renderWalletNfts();
    loadWalletNfts(true);
  }

  function closeWalletMenu() {
    walletMenuOpen = false;
    const menu = $("walletMenu");
    const btn = els.btnWallet;
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (!menu) return;
    menu.classList.remove("is-open");
    menu.hidden = true;
    menu.setAttribute("hidden", "");
  }

  function toggleWalletMenu(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (isWalletMenuOpen()) closeWalletMenu();
    else openWalletMenu();
  }

  async function disconnectWallet() {
    const eth = getEthereum();
    walletAddress = null;
    walletNftCache = null;
    walletNftReqId += 1;
    closeWalletMenu();
    syncWalletBtn();
    if (typeof window.__onRaffleWalletChange === "function") {
      window.__onRaffleWalletChange();
    }
    // Best-effort full revoke (MetaMask etc.); not all wallets support it
    try {
      if (eth && eth.request) {
        await eth.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      }
    } catch {
      /* local session already cleared */
    }
    syncWalletBtn();
  }

  async function trySwitchRobinhood(eth) {
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: RH_CHAIN_HEX }],
      });
    } catch (e) {
      // 4902 = chain not added — best-effort add
      if (e && (e.code === 4902 || e.code === -32603)) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: RH_CHAIN_HEX,
                chainName: "Robinhood Chain",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
                blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
              },
            ],
          });
        } catch {
          /* ignore — connect still useful without chain switch */
        }
      }
    }
  }

  async function connectWallet() {
    const eth = getEthereum();
    if (!eth) {
      alert("No wallet found. Install MetaMask or similar.");
      return;
    }
    if (walletBusy) return;
    walletBusy = true;
    syncWalletBtn();
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      const addr = accounts && accounts[0] ? String(accounts[0]) : null;
      walletAddress = addr ? addr.toLowerCase() : null;
      if (walletAddress) {
        // Best-effort; does not block if user stays on another chain
        trySwitchRobinhood(eth).catch(() => {});
      }
      if (typeof window.__onRaffleWalletChange === "function") {
        window.__onRaffleWalletChange();
      }
    } catch (e) {
      const code = e && e.code;
      if (code === 4001) {
        /* user rejected — quiet */
      } else {
        console.warn("[wallet]", e);
      }
      // keep previous address if any
    } finally {
      walletBusy = false;
      syncWalletBtn();
      if (typeof window.__onRaffleWalletChange === "function") {
        window.__onRaffleWalletChange();
      }
    }
  }

  async function onWalletBtnClick(ev) {
    if (walletBusy) return;
    // Connected → open menu (Disconnect); not connected → connect
    if (walletAddress) {
      toggleWalletMenu(ev);
      return;
    }
    closeWalletMenu();
    await connectWallet();
  }

  function bindWalletListeners() {
    const eth = getEthereum();
    if (!eth || !eth.on) return;
    eth.on("accountsChanged", (accs) => {
      const next = accs && accs[0] ? String(accs[0]).toLowerCase() : null;
      walletAddress = next;
      walletNftCache = null;
      walletNftReqId += 1;
      if (!walletAddress) closeWalletMenu();
      else if (isWalletMenuOpen()) loadWalletNfts(true);
      syncWalletBtn();
      if (typeof window.__onRaffleWalletChange === "function") {
        window.__onRaffleWalletChange();
      }
    });
    eth.on("chainChanged", () => {
      // UI-only; no reload required for radar
      syncWalletBtn();
    });
  }

  function bindWalletMenu() {
    const btnDisc = $("btnDisconnect");
    if (btnDisc) {
      btnDisc.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        disconnectWallet();
      });
    }
    document.addEventListener("click", (ev) => {
      if (!isWalletMenuOpen()) return;
      if (Date.now() < walletMenuIgnoreOutsideUntil) return;
      const t = ev.target;
      if (t && typeof t.closest === "function") {
        if (t.closest("#btnWallet") || t.closest("#walletMenu")) return;
      }
      closeWalletMenu();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && isWalletMenuOpen()) closeWalletMenu();
    });
  }

  async function restoreWalletIfConnected() {
    const eth = getEthereum();
    if (!eth) return;
    try {
      const accounts = await eth.request({ method: "eth_accounts" });
      if (accounts && accounts[0]) {
        walletAddress = String(accounts[0]).toLowerCase();
        syncWalletBtn();
        if (typeof window.__onRaffleWalletChange === "function") {
          window.__onRaffleWalletChange();
        }
      }
    } catch {
      /* ignore */
    }
  }

  function toggleLang() {
    setLang(lang === "zh" ? "en" : "zh");
  }

  function fmtNum(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return Number(n).toLocaleString(lang === "zh" ? "zh-CN" : "en-US");
  }

  function relTime(iso) {
    if (!iso) return "—";
    const ts = new Date(iso).getTime();
    if (!ts) return "—";
    const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (sec < 5) return t("justNow");
    if (sec < 60) return t("secAgo", sec);
    if (sec < 3600) return t("minAgo", Math.floor(sec / 60));
    return t("hourAgo", Math.floor(sec / 3600));
  }

  function short(addr) {
    if (!addr || addr.length < 12) return addr || "—";
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }

  /** Display label max length — long names must not blow table width */
  const NAME_MAX = 15;

  function ellipsize(s, max = NAME_MAX) {
    const t = String(s ?? "").trim();
    if (!t) return "";
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  }

  /** Sold-out if server flag or minted >= maxSupply */
  function isMintedOutRow(r) {
    if (!r) return false;
    if (r.mintedOut === true) return true;
    const minted = Number(r.minted ?? r.totalSupply);
    const max = Number(r.maxSupply);
    return (
      Number.isFinite(minted) &&
      Number.isFinite(max) &&
      max > 0 &&
      minted >= max
    );
  }

  /**
   * Hot leaderboard: never show sold-out (server filters too; client is belt-and-suspenders).
   * New mint-outs found here are absorbed into localMintedOut.
   */
  function pickHot(data) {
    const raw = Array.isArray(data?.hot) ? data.hot : [];
    const kept = [];
    for (const r of raw) {
      const c = String(r?.contract || "").toLowerCase();
      if (c && localMintedOut.has(c)) continue;
      if (isMintedOutRow(r)) {
        if (c) absorbMintedOutRow(r);
        continue;
      }
      kept.push(r);
    }
    return kept;
  }

  /** Merge one sold-out row into sticky local archive. Returns true if newly added. */
  function absorbMintedOutRow(r) {
    const c = String(r?.contract || "").toLowerCase();
    if (!c || c.length < 10) return false;
    if (localMintedOut.has(c)) {
      // Keep first snapshot stable — no thrashing fields every poll
      return false;
    }
    localMintedOut.set(c, { ...r, contract: c, mintedOut: true });
    return true;
  }

  function localMintedOutList() {
    return [...localMintedOut.values()]
      .filter((r) => !isBlocked(r.contract) && !isNoiseNft(r))
      .sort((a, b) => (Number(b.lastTs) || 0) - (Number(a.lastTs) || 0));
  }

  function mintedOutSignature(list) {
    return list.map((r) => String(r.contract || "").toLowerCase()).join("|");
  }

  /** Always hide Uniswap LP position NFTs (no UI toggle). */
  function isLpNft(row) {
    return (
      /UNI-V[34]|Positions NFT/i.test(row?.name || "") ||
      /UNI-V[34]/i.test(row?.symbol || "")
    );
  }

  /**
   * Vote-escrow / governance lock NFTs — not collectible mints (match server filter).
   * Chain has no standard flag; name/symbol heuristics only on the client.
   */
  function isVeOrGovNft(row) {
    const name = String(row?.name || "");
    const symbol = String(row?.symbol || "").trim();
    if (
      /\bve[\s_-]?nft\b|\bvoting[\s_-]?escrow\b|\bvote[\s_-]?escrow\b|\bvote[\s_-]?lock\b|\bescrow[\s_-]?nft\b|\blocked[\s_-]?nft\b|\bgovernance[\s_-]?(lock|nft|position)\b/i.test(
        name
      ) ||
      /\bve[\s_-]?nft\b|\bvoting[\s_-]?escrow\b/i.test(symbol)
    ) {
      return true;
    }
    if (/^ve[A-Za-z0-9]{1,16}$/i.test(symbol)) return true;
    return false;
  }

  /** Noise rows to hide everywhere (LP + ve/gov locks). */
  function isNoiseNft(row) {
    return isLpNft(row) || isVeOrGovNft(row);
  }

  function loadPriceFilter() {
    try {
      const v = localStorage.getItem(PRICE_FILTER_KEY);
      if (v === "all" || v === "free" || v === "paid") return v;
    } catch {
      /* ignore */
    }
    return "all";
  }

  function persistPriceFilter() {
    try {
      localStorage.setItem(PRICE_FILTER_KEY, priceFilter);
    } catch {
      /* ignore */
    }
  }

  /** free | paid | unknown — based on latest known unit price */
  function priceCategory(r) {
    if (r?.priceDisplay != null && String(r.priceDisplay).trim() !== "") {
      const s = String(r.priceDisplay).trim().toLowerCase();
      if (/\bfree\b|免费/.test(s)) return "free";
      if (/^0+(\.0+)?(\s*eth)?$/.test(s)) return "free";
      const m = s.match(/([0-9]*\.?[0-9]+)\s*eth/);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) return n > 0 ? "paid" : "free";
      }
    }
    const eth = r?.priceEth ?? r?.priceMinEth ?? r?.priceLastEth;
    if (eth != null && eth !== "") {
      const n = Number(eth);
      if (Number.isFinite(n)) return n > 0 ? "paid" : "free";
    }
    const wei = r?.priceWei ?? r?.priceLastWei;
    if (wei != null && wei !== "") {
      try {
        // string wei may be large — treat non-zero as paid
        if (String(wei) === "0") return "free";
        if (/^[0-9]+$/.test(String(wei)) && BigInt(String(wei)) > 0n) return "paid";
      } catch {
        /* ignore */
      }
    }
    return "unknown";
  }

  let priceFilterMenuOpen = false;
  let priceFilterIgnoreOutsideUntil = 0;

  function setPriceFilter(next) {
    if (next !== "free" && next !== "paid" && next !== "all") return;
    if (priceFilter === next) {
      closePriceFilterMenu();
      return;
    }
    priceFilter = next;
    persistPriceFilter();
    syncPriceFilterUi();
    closePriceFilterMenu();
    if (lastData) renderAll(lastData, { forceMintedOut: true });
  }

  function isPriceFilterMenuOpen() {
    const menu = $("priceFilterMenu");
    return (
      priceFilterMenuOpen &&
      menu &&
      !menu.hidden &&
      menu.classList.contains("is-open")
    );
  }

  function positionPriceFilterMenu() {
    const btn = $("btnPriceFilter");
    const menu = $("priceFilterMenu");
    if (!btn || !menu || !isPriceFilterMenuOpen()) return;
    const rect = btn.getBoundingClientRect();
    const gap = 6;
    const width = Math.max(104, menu.offsetWidth || 104);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    let top = rect.bottom + gap;
    menu.style.position = "fixed";
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.right = "auto";
    requestAnimationFrame(() => {
      if (!isPriceFilterMenuOpen()) return;
      const h = menu.offsetHeight || 80;
      if (top + h > window.innerHeight - 8 && rect.top > h + gap) {
        menu.style.top = `${Math.max(8, rect.top - h - gap)}px`;
      }
    });
  }

  function openPriceFilterMenu() {
    const btn = $("btnPriceFilter");
    let menu = $("priceFilterMenu");
    if (!btn || !menu) return;
    // Body layer so sticky/overflow table does not clip the menu
    if (menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
    priceFilterMenuOpen = true;
    menu.hidden = false;
    menu.removeAttribute("hidden");
    menu.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    syncPriceFilterUi();
    positionPriceFilterMenu();
    priceFilterIgnoreOutsideUntil = Date.now() + 200;
  }

  function closePriceFilterMenu() {
    priceFilterMenuOpen = false;
    const btn = $("btnPriceFilter");
    const menu = $("priceFilterMenu");
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (!menu) return;
    menu.classList.remove("is-open");
    menu.hidden = true;
    menu.setAttribute("hidden", "");
  }

  function togglePriceFilterMenu(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (isPriceFilterMenuOpen()) closePriceFilterMenu();
    else openPriceFilterMenu();
  }

  function syncPriceFilterUi() {
    const btn = $("btnPriceFilter");
    if (btn) {
      btn.classList.toggle("is-active", priceFilter === "free" || priceFilter === "paid");
      const title = t("priceFilterTitle");
      btn.title = title;
      btn.setAttribute("aria-label", title);
    }
    document.querySelectorAll("[data-price-filter]").forEach((el) => {
      const mode = el.getAttribute("data-price-filter");
      const on = mode === priceFilter;
      el.classList.toggle("active", on);
      el.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function filterHot(list) {
    return list
      .slice()
      .filter((r) => !isBlocked(r.contract) && !isNoiseNft(r))
      .filter((r) => {
        if (priceFilter === "all") return true;
        const cat = priceCategory(r);
        if (priceFilter === "free") return cat === "free";
        if (priceFilter === "paid") return cat === "paid";
        return true;
      });
  }

  /** True for 0 / 0.0 / "0 ETH" / Free — same notion as priceCategory free. */
  function isFreePriceText(s) {
    const t0 = String(s ?? "")
      .trim()
      .toLowerCase();
    if (!t0) return false;
    if (/\bfree\b|免费/.test(t0)) return true;
    // "0", "0.0", "0 ETH", "0.000 eth"
    if (/^0+(\.0+)?(\s*eth)?$/.test(t0)) return true;
    return false;
  }

  function isZeroEthAmount(eth) {
    if (eth == null || eth === "") return false;
    if (eth === 0 || eth === "0") return true;
    const n = Number(eth);
    return Number.isFinite(n) && n === 0;
  }

  /** Single reference price only — Free or one ETH amount (no ranges). */
  function formatPriceCell(r) {
    if (r.priceDisplay != null && String(r.priceDisplay).trim() !== "") {
      let s = String(r.priceDisplay).trim();
      // Backend may send "0 ETH" for free/dust; never show that in the UI
      if (isFreePriceText(s)) return t("priceFree");
      if (lang === "zh") s = s.replace(/\bFree\b/g, t("priceFree"));
      return s;
    }
    const eth = r.priceEth ?? r.priceMinEth ?? r.priceLastEth;
    if (eth == null || eth === "") return t("pricePending");
    if (isZeroEthAmount(eth)) return t("priceFree");
    return `${eth} ETH`;
  }

  function renderHot(data) {
    const list = filterHot(pickHot(data));

    if (!list.length) {
      els.hotBody.innerHTML = `<tr><td colspan="9" class="empty">${escapeHtml(
        t("hotEmpty")
      )}</td></tr>`;
      return;
    }

    els.hotBody.innerHTML = list
      .map((r, i) => {
        const rankClass = i < 3 ? "rank top" : "rank";
        const priceText = formatPriceCell(r);
        const priceTitle = priceText;
        const fullName = r.name || "Unknown";
        const fullSym = String(r.symbol || "").trim();
        const symShow = ellipsize(fullSym);
        // symbol only — no contract address (OpenSea / explorer cover that)
        const metaHtml = symShow
          ? `<span class="meta" title="${escapeHtml(fullSym)}">${escapeHtml(symShow)}</span>`
          : `<span class="meta meta-empty" aria-hidden="true"></span>`;
        return `<tr>
          <td class="${rankClass}">${i + 1}</td>
          <td>
            <div class="col-row">
              <div class="col-media">
                ${avatarHtml(r)}
                ${mintProgressHtml(r)}
              </div>
              <div class="col-name">
                <div class="name-row">
                  <a class="name" href="${r.explorerToken}" target="_blank" rel="noopener" title="${escapeHtml(fullName)}">${escapeHtml(ellipsize(fullName))}</a>
                  ${riskBadgeHtml(r)}
                  ${starBtnHtml(r)}
                </div>
                ${metaHtml}
                <span class="meta links">
                  ${socialsHtml(r)}
                  <a class="explorer-link" href="${r.explorerToken}" target="_blank" rel="noopener" title="Blockscout">${escapeHtml(t("explorer"))}</a>
                </span>
              </div>
            </div>
          </td>
          <td class="num">${fmtNum(r.mints5m)}</td>
          <td class="num">${fmtNum(r.mints30m)}</td>
          <td class="num">${fmtNum(r.mints1h)}</td>
          <td class="num price-cell" title="${escapeHtml(priceTitle)}">${escapeHtml(priceText)}</td>
          <td class="num">${fmtNum(r.holders)}</td>
          <td class="num">${fmtNum(r.minted ?? r.totalSupply)}</td>
          <td>
            <a href="${r.explorerTx}" target="_blank" rel="noopener" class="num">${relTime(r.lastMintAt)}</a>
          </td>
        </tr>`;
      })
      .join("");
  }

  function renderFeed(data) {
    let feed = Array.isArray(data.feed) ? data.feed : [];
    feed = feed.filter((e) => !isBlocked(e.contract) && !isNoiseNft(e));

    if (!feed.length) {
      els.feed.innerHTML = `<div class="empty">${escapeHtml(t("feedEmpty"))}</div>`;
      return;
    }

    const nextKeys = new Set(feed.map((e) => e.key));
    lastFeedKeys = nextKeys;

    els.feed.innerHTML = feed
      .map((e) => {
        const method = e.method
          ? `<span class="pill mint">${escapeHtml(e.method)}</span>`
          : "";
        return `<article class="feed-item">
          <div class="feed-top">
            <div class="feed-title">
              ${avatarHtml(e)}
              <div class="name-row">
                <a class="name" href="${e.explorerToken}" target="_blank" rel="noopener" title="${escapeHtml(e.name || "Unknown")}">${escapeHtml(ellipsize(e.name || "Unknown"))}</a>
                ${riskBadgeHtml(e)}
                ${starBtnHtml(e)}
              </div>
              ${socialsHtml(e)}
            </div>
            <span class="time">${relTime(e.timestamp)}</span>
          </div>
          <div class="feed-row">
            <span>#${escapeHtml(String(e.tokenId ?? "?"))}</span>
            <span>${escapeHtml(e.symbol || "")}</span>
            ${method}
            <span class="price-tag">${escapeHtml(
              e.unitPriceEth == null
                ? t("pricePending")
                : e.unitPriceEth === "0"
                  ? t("priceFree")
                  : `${e.unitPriceEth} ETH`
            )}</span>
            <a href="${e.explorerMinter}" target="_blank" rel="noopener">${escapeHtml(t("minter"))} ${escapeHtml(e.minterShort || short(e.minter))}</a>
            <a href="${e.explorerTx}" target="_blank" rel="noopener">tx ↗</a>
          </div>
        </article>`;
      })
      .join("");
  }

  /**
   * Ingest sold-outs from API bootstrap and/or hot scan.
   * Returns whether local archive gained any new contract.
   */
  function ingestMintedOutFromData(data) {
    let added = false;
    const serverList = Array.isArray(data?.mintedOut) ? data.mintedOut : [];
    for (const r of serverList) {
      if (isMintedOutRow(r) || r?.mintedOut) {
        if (absorbMintedOutRow(r)) added = true;
      }
    }
    // Scan hot: mint-out → move into sticky 已铸完 (even if still present one tick)
    for (const r of Array.isArray(data?.hot) ? data.hot : []) {
      if (isMintedOutRow(r) && absorbMintedOutRow(r)) added = true;
    }
    return added;
  }

  /**
   * Bottom-right sold-out panel — sticky local list.
   * force=true: language/theme/blocklist change must repaint.
   * Otherwise only paint when contract set changes (no 4s flicker).
   */
  function renderMintedOut(data, { force = false } = {}) {
    if (!els.mintedOut) return;
    if (data) ingestMintedOutFromData(data);

    const list = localMintedOutList();
    const sig = mintedOutSignature(list);
    if (!force && sig === mintedOutPaintSig && mintedOutPaintSig !== "") {
      return;
    }
    // Empty list: still paint once (or when forced) so empty-state i18n is correct
    if (!force && sig === mintedOutPaintSig && list.length === 0 && els.mintedOut.dataset.outReady === "1") {
      return;
    }
    mintedOutPaintSig = sig;
    els.mintedOut.dataset.outReady = "1";

    if (!list.length) {
      els.mintedOut.innerHTML = `<div class="empty">${escapeHtml(t("outEmpty"))}</div>`;
      return;
    }

    els.mintedOut.innerHTML = list
      .map((r) => {
        const fullName = r.name || "Unknown";
        const priceText = formatPriceCell(r);
        const minted = r.minted ?? r.totalSupply;
        const max = r.maxSupply;
        const supplyLabel =
          max != null && minted != null
            ? `${fmtNum(minted)} / ${fmtNum(max)}`
            : fmtNum(minted);
        return `<article class="feed-item is-out">
          <div class="feed-top">
            <div class="feed-title">
              ${avatarHtml(r)}
              <div class="name-row">
                <a class="name" href="${r.explorerToken || "#"}" target="_blank" rel="noopener" title="${escapeHtml(fullName)}">${escapeHtml(ellipsize(fullName))}</a>
                ${riskBadgeHtml(r)}
                ${starBtnHtml(r)}
              </div>
              ${socialsHtml(r)}
            </div>
            <span class="time">${relTime(r.lastMintAt)}</span>
          </div>
          <div class="out-meta">
            <span class="pill-out">${escapeHtml(t("mintOut"))}</span>
            <span class="price-tag">${escapeHtml(priceText)}</span>
            <span>supply ${escapeHtml(String(supplyLabel))}</span>
            <span>holders ${fmtNum(r.holders)}</span>
            <a href="${r.opensea || openseaUrl(r.contract, r) || "#"}" target="_blank" rel="noopener">OpenSea ↗</a>
            <a class="explorer-link" href="${r.explorerToken || "#"}" target="_blank" rel="noopener">${escapeHtml(t("explorer"))}</a>
          </div>
        </article>`;
      })
      .join("");
  }

  function renderStatus(data) {
    // Poll health stays in hidden statusLine only (header is wallet CTA now)
    const st = data.status || {};
    const pollAgeMs = st.lastPollAt
      ? Date.now() - new Date(st.lastPollAt).getTime()
      : Infinity;
    const dataFresh =
      (st.storeSize || 0) > 0 && Number.isFinite(pollAgeMs) && pollAgeMs < 45_000;

    if (st.lastError && !dataFresh) {
      els.statusLine.textContent = t(
        "statusError",
        st.lastError,
        st.pollCount || 0
      );
    } else if (!st.pollCount && !dataFresh) {
      els.statusLine.textContent = t("statusWarm");
    } else {
      els.statusLine.textContent = t(
        "statusOk",
        relTime(st.lastPollAt),
        st.storeSize,
        st.metaOk || 0,
        st.metaCached || 0,
        st.pollCount
      );
    }

    renderDataHealth(st);
  }

  /** Hide fault banner only (green/red chip is handled separately). */
  function hideFaultBanner() {
    const banner = els.dataHealthBanner;
    if (banner) {
      banner.hidden = true;
      banner.removeAttribute("data-level");
      banner.removeAttribute("data-code");
    }
    if (els.dataHealthLink) els.dataHealthLink.hidden = true;
    if (els.dataHealthTitle) els.dataHealthTitle.textContent = "";
    if (els.dataHealthDetail) els.dataHealthDetail.textContent = "";
  }

  /**
   * Header status pill:
   *  - Healthy → green "Blockscout live" (always on when pipeline OK)
   *  - Fault   → red fault label + dismissible detail banner
   * Warming / no status yet → hide pill (avoid false green before first poll)
   */
  function renderDataHealth(st) {
    const banner = els.dataHealthBanner;
    const chip = els.blockscoutStatusChip;
    const h = st?.health || null;
    const code = h?.code || "ok";
    const level = h?.level || "ok";
    // Real error only — never force-demo; ok/warn stay green live or quiet
    const isFault = !!(h && isBlockscoutFault(code, level));
    const isWarming = !h || code === "warming" || code === "warm";

    // —— Status chip ——
    if (chip) {
      if (isWarming && !isFault) {
        chip.hidden = true;
        chip.removeAttribute("data-level");
        chip.textContent = "";
        chip.removeAttribute("title");
      } else if (isFault) {
        const chips = t("healthChip") || {};
        const titles = t("healthTitle") || {};
        const chipLabel =
          (typeof chips === "object" && chips[code]) ||
          (typeof titles === "object" && titles[code]) ||
          "Blockscout 故障";
        const detailReason =
          (lang === "zh" ? h.reasonZh || h.reason : h.reason || h.reasonZh) ||
          chipLabel;
        chip.textContent = chipLabel;
        chip.dataset.level = "error";
        chip.title = detailReason;
        chip.hidden = false;
      } else {
        // ok / mint_quiet / no_recent_mints — explorer is fine
        healthDismissedCode = null;
        chip.textContent = t("healthChipLive");
        chip.dataset.level = "live";
        chip.title = t("healthChipLiveTitle");
        chip.hidden = false;
      }
    }

    // —— Detail banner: faults only, dismissible ——
    if (!banner) return;

    if (!isFault) {
      hideFaultBanner();
      return;
    }

    if (healthDismissedCode === code) {
      banner.hidden = true;
      return;
    }

    const chips = t("healthChip") || {};
    const titles = t("healthTitle") || {};
    const title =
      (typeof chips === "object" && chips[code]) ||
      (typeof titles === "object" && titles[code]) ||
      code;
    const detailReason =
      (lang === "zh" ? h.reasonZh || h.reason : h.reason || h.reasonZh) || title;
    const hints = t("healthHint") || {};
    const hint =
      (typeof hints === "object" && hints[code]) || detailReason || "";

    const newestRel = h.newestEventAt
      ? relTime(h.newestEventAt)
      : h.newestEventAgeMs != null
        ? relTime(new Date(Date.now() - h.newestEventAgeMs).toISOString())
        : null;
    const pollRel = st.lastPollOkAt
      ? relTime(st.lastPollOkAt)
      : st.lastPollAt
        ? relTime(st.lastPollAt)
        : null;
    const meta = t(
      "healthMeta",
      newestRel,
      pollRel,
      st.storeSize ?? h.storeSize,
      st.consecutivePollFailures ?? h.consecutivePollFailures ?? 0
    );

    if (els.dataHealthTitle) els.dataHealthTitle.textContent = `⚠ ${title}`;
    if (els.dataHealthDetail) {
      els.dataHealthDetail.textContent = hint ? `${hint} · ${meta}` : meta;
    }
    if (els.dataHealthLink) {
      els.dataHealthLink.hidden = false;
      els.dataHealthLink.textContent = t("healthLink");
    }
    if (els.dataHealthDismiss) {
      els.dataHealthDismiss.title = t("healthDismiss");
      els.dataHealthDismiss.setAttribute("aria-label", t("healthDismiss"));
    }

    banner.dataset.level = "error";
    banner.dataset.code = code;
    banner.hidden = false;
  }

  function renderAll(data, { forceMintedOut = false } = {}) {
    // Hot first so pickHot can absorb any residual mint-outs into local archive
    renderHot(data);
    renderFeed(data);
    renderMintedOut(data, { force: forceMintedOut });
    renderStatus(data);
    updateBlockedUi();
    updateFavoritesUi();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Stable monogram: first letter/digit/CJK of name (fallback symbol / ?) */
  function avatarLetter(r) {
    const raw = String(r.name || r.symbol || r.short || "?").trim();
    const m = raw.match(/[A-Za-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/);
    const ch = (m && m[0]) || raw.charAt(0) || "?";
    return ch.toUpperCase();
  }

  function iconUrlOf(r) {
    const u = String(r?.icon || "").trim();
    return u || "";
  }

  function canUseIcon(r) {
    const icon = iconUrlOf(r);
    if (!icon) return false;
    if (brokenIconUrls.has(icon)) return false;
    const c = String(r.contract || "").toLowerCase();
    if (c && brokenIconByContract.get(c) === icon) return false;
    return true;
  }

  function markIconBroken(contract, url) {
    const u = String(url || "").trim();
    const c = String(contract || "").toLowerCase();
    if (u) brokenIconUrls.add(u);
    if (c && u) brokenIconByContract.set(c, u);
  }

  function letterAvatarHtml(letter) {
    return `<div class="avatar ph" aria-hidden="true">${escapeHtml(letter)}</div>`;
  }

  function starBtnHtml(r) {
    const contractRaw = String(r.contract || "").toLowerCase();
    const contract = escapeHtml(contractRaw);
    const favOn = isFavorite(contractRaw);
    const starLabel = escapeHtml(favOn ? t("unfavoriteTitle") : t("favoriteTitle"));
    return `<button type="button" class="star-btn${favOn ? " is-on" : ""}" data-fav="${contract}" title="${starLabel}" aria-label="${starLabel}" aria-pressed="${favOn ? "true" : "false"}">${STAR_SVG}</button>`;
  }

  /** Real mint progress: minted / maxSupply. Sold out → MINT OUT. Never heat ranking. */
  function mintProgressHtml(r) {
    const minted = Number(r?.minted ?? r?.totalSupply);
    const max = Number(r?.maxSupply);
    const hasMax = Number.isFinite(max) && max > 0;
    const hasMinted = Number.isFinite(minted) && minted >= 0;

    if (hasMax && hasMinted) {
      const pctRaw = (minted / max) * 100;
      const pct = Math.max(0, Math.min(100, Math.round(pctRaw)));
      const soldOut = r?.mintedOut === true || minted >= max;
      const title = escapeHtml(
        t("mintProgressTitle", fmtNum(minted), fmtNum(max), pct)
      );
      if (soldOut) {
        return `<div class="mint-progress is-out" title="${title}">
          <span class="mint-out-label">${escapeHtml(t("mintOut"))}</span>
        </div>`;
      }
      // Visible progress % (not hover-only; not 1h heat)
      return `<div class="mint-progress" title="${title}">
        <div class="mint-progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${title}">
          <i style="width:${pct}%"></i>
        </div>
        <span class="mint-progress-pct">${pct}%</span>
      </div>`;
    }

    // No maxSupply yet — empty track + dash (still not heat)
    return `<div class="mint-progress is-unknown" title="${escapeHtml(t("mintProgressUnknown"))}">
      <div class="mint-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuetext="unknown">
        <i style="width:0%"></i>
      </div>
      <span class="mint-progress-pct is-muted">—</span>
    </div>`;
  }

  /**
   * High risk when Minted / Holders > 10
   * (few wallets holding many mints → possible internal/control minting).
   * Requires both numbers to be valid and holders > 0.
   */
  function mintHolderRatio(r) {
    const minted = Number(r?.minted ?? r?.totalSupply);
    const holders = Number(r?.holders);
    if (!Number.isFinite(minted) || !Number.isFinite(holders) || holders <= 0) {
      return null;
    }
    if (minted < 0) return null;
    return minted / holders;
  }

  function isHighRisk(r) {
    const ratio = mintHolderRatio(r);
    return ratio != null && ratio > 10;
  }

  function riskBadgeHtml(r) {
    if (!isHighRisk(r)) return "";
    const ratio = mintHolderRatio(r);
    const ratioText =
      ratio >= 100 ? String(Math.round(ratio)) : ratio.toFixed(1).replace(/\.0$/, "");
    const title = escapeHtml(t("highRiskTitle", ratioText));
    // Red emergency siren — top rays flash (CSS easter egg)
    return `<span class="risk-badge" title="${title}" aria-label="${title}" role="img">
      <svg class="risk-badge-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path class="siren-ray siren-ray-l" fill="currentColor" d="M4.49 3.7l1.06-1.06 2.12 2.12-1.06 1.06L4.49 3.7z"/>
        <path class="siren-ray siren-ray-c" fill="currentColor" d="M11.25 1.5h1.5v3h-1.5v-3z"/>
        <path class="siren-ray siren-ray-r" fill="currentColor" d="M18.45 3.7l1.06 1.06-2.12 2.12-1.06-1.06 2.12-2.12z"/>
        <path class="siren-dome" fill="currentColor" d="M7.25 11c0-2.76 2.13-5 4.75-5s4.75 2.24 4.75 5v4.25H7.25V11z"/>
        <path fill="currentColor" d="M5.5 15.75h13v2.1a1.15 1.15 0 0 1-1.15 1.15H6.65A1.15 1.15 0 0 1 5.5 17.85v-2.1z"/>
        <path fill="currentColor" d="M4.75 19.4h14.5v1.85H4.75V19.4z"/>
      </svg>
    </span>`;
  }

  /** Google reverse image search (Lens by image URL). */
  function googleLensUrl(imageUrl) {
    const u = String(imageUrl || "").trim();
    if (!u || !/^https?:\/\//i.test(u)) return null;
    return `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(u)}`;
  }

  function avatarHtml(r) {
    const name = escapeHtml(r.name || "?");
    const letter = avatarLetter(r);
    const contractRaw = String(r.contract || "").toLowerCase();
    const contract = escapeHtml(contractRaw);
    const blockLabel = escapeHtml(t("blockTitle"));
    const searchLabel = escapeHtml(t("googleSearchTitle"));
    let face;
    let searchHtml = "";
    if (canUseIcon(r)) {
      const rawIcon = iconUrlOf(r);
      const src = escapeHtml(rawIcon);
      face = `<img class="avatar" src="${src}" alt="${name}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-contract="${contract}" data-letter="${escapeHtml(letter)}" />`;
      const lens = googleLensUrl(rawIcon);
      if (lens) {
        searchHtml = `<a class="img-search" href="${escapeHtml(lens)}" target="_blank" rel="noopener noreferrer" title="${searchLabel}" aria-label="${searchLabel}">${SEARCH_SVG}</a>`;
      }
    } else {
      face = letterAvatarHtml(letter);
    }
    return `<div class="avatar-wrap">
      ${face}
      ${searchHtml}
      <button type="button" class="block-btn" data-block="${contract}" title="${blockLabel}" aria-label="${blockLabel}">${EYE_SLASH_SVG}</button>
    </div>`;
  }

  // Capture-phase: failed logos → letter, cache so later polls don't re-insert broken <img>
  document.addEventListener(
    "error",
    (ev) => {
      const img = ev.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (!img.classList.contains("avatar")) return;
      const url = img.currentSrc || img.src || "";
      const contract = img.getAttribute("data-contract") || "";
      markIconBroken(contract, url);
      const letter = img.getAttribute("data-letter") || "?";
      const wrap = img.closest(".avatar-wrap");
      if (wrap) {
        wrap.querySelectorAll(".img-search").forEach((el) => el.remove());
      }
      const ph = document.createElement("div");
      ph.className = "avatar ph";
      ph.setAttribute("aria-hidden", "true");
      ph.textContent = letter;
      img.replaceWith(ph);
    },
    true
  );

  const ICONS = {
    x: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>`,
    web: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
    os: `<img class="os-img" src="/opensea-icon.jpg" alt="OpenSea" width="16" height="16" draggable="false" />`,
  };

  function iconBtn(kind, href, title) {
    const inner = ICONS[kind] || "";
    if (href) {
      return `<a class="icon-btn ${kind} is-on" href="${escapeHtml(href)}" target="_blank" rel="noopener" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${inner}</a>`;
    }
    return `<span class="icon-btn ${kind} is-off" title="${escapeHtml(t("socialOff", title))}" aria-label="${escapeHtml(title)} unavailable" aria-disabled="true">${inner}</span>`;
  }

  function socialsHtml(r) {
    const os = openseaUrl(r.contract, r);
    return `<span class="icon-row">
      ${iconBtn("x", r.twitter || null, "X / Twitter")}
      ${iconBtn("web", r.website || null, "Website")}
      ${iconBtn("os", os, "OpenSea")}
    </span>`;
  }

  async function refresh() {
    try {
      const qs = new URLSearchParams({
        window: String(RANK_WINDOW_MIN),
        feed: "100",
        hot: "30",
        out: "50",
      });
      const res = await fetch(`/api/mints?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Merge server archive + any residual hot mint-outs into sticky local map
      ingestMintedOutFromData(data);
      mintedOutBootstrapped = true;

      lastData = data;
      lastDataRefreshAt = Date.now();
      // 已铸完: renderMintedOut only paints when contract set changes (no 4s DOM thrash)
      renderAll(data, { forceMintedOut: false });
    } catch (e) {
      els.statusLine.textContent = e.message || String(e);
      // Only surface fault UI when our own API request fails (real outage)
      if (els.dataHealthBanner || els.blockscoutStatusChip) {
        renderDataHealth({
          health: {
            level: "error",
            code: "poll_error",
            reason: e.message || String(e),
            reasonZh: e.message || String(e),
            consecutivePollFailures: 1,
            storeSize: 0,
          },
          consecutivePollFailures: 1,
          storeSize: 0,
        });
      }
    } finally {
      updateDataFreshnessUi();
    }
  }

  // One-tap cycle: Light↔Dark, 中文↔EN (no popup)
  const themeToggle = document.getElementById("themeToggle");
  const langToggle = document.getElementById("langToggle");
  if (themeToggle) themeToggle.addEventListener("click", () => toggleTheme());
  if (langToggle) langToggle.addEventListener("click", () => toggleLang());

  if (els.btnWallet) {
    els.btnWallet.addEventListener("click", (ev) => onWalletBtnClick(ev));
  }
  bindWalletListeners();
  bindWalletMenu();
  restoreWalletIfConnected();
  syncWalletBtn();

  els.btnRefresh.addEventListener("click", () => refresh());

  if (els.dataHealthDismiss) {
    els.dataHealthDismiss.addEventListener("click", () => {
      const code = els.dataHealthBanner?.dataset?.code || "ok";
      healthDismissedCode = code;
      if (els.dataHealthBanner) els.dataHealthBanner.hidden = true;
    });
  }
  syncPriceFilterUi();
  closePriceFilterMenu();
  window.addEventListener("resize", positionPriceFilterMenu);
  window.addEventListener("scroll", positionPriceFilterMenu, true);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && isPriceFilterMenuOpen()) closePriceFilterMenu();
  });

  function rowFromContract(addr) {
    let row = { contract: addr };
    const key = String(addr || "").toLowerCase();
    if (localMintedOut.has(key)) {
      row = localMintedOut.get(key);
    } else if (lastData) {
      const all = [
        ...(lastData.hot || []),
        ...(lastData.feed || []),
        ...(lastData.mintedOut || []),
      ];
      const hit = all.find(
        (x) => String(x.contract || "").toLowerCase() === key
      );
      if (hit) row = hit;
    } else if (isFavorite(addr)) {
      const meta = favoritesMeta.get(key) || {};
      row = { contract: addr, ...meta };
    }
    return row;
  }

  // One-click favorite / block / price filter from hot list / live feed
  document.addEventListener("click", (ev) => {
    const trigger = ev.target.closest("#btnPriceFilter");
    if (trigger) {
      togglePriceFilterMenu(ev);
      return;
    }

    const priceOpt = ev.target.closest("[data-price-filter]");
    if (priceOpt) {
      ev.preventDefault();
      ev.stopPropagation();
      setPriceFilter(priceOpt.getAttribute("data-price-filter"));
      return;
    }

    if (isPriceFilterMenuOpen()) {
      if (Date.now() >= priceFilterIgnoreOutsideUntil) {
        const t = ev.target;
        if (
          !t ||
          typeof t.closest !== "function" ||
          (!t.closest("#priceFilterMenu") && !t.closest("#btnPriceFilter"))
        ) {
          closePriceFilterMenu();
        }
      }
    }

    const favEl = ev.target.closest("[data-fav]");
    if (favEl) {
      ev.preventDefault();
      ev.stopPropagation();
      const addr = favEl.getAttribute("data-fav");
      toggleFavorite(rowFromContract(addr));
      return;
    }

    const unfavEl = ev.target.closest("[data-unfav]");
    if (unfavEl) {
      ev.preventDefault();
      ev.stopPropagation();
      unfavoriteContract(unfavEl.getAttribute("data-unfav"));
      return;
    }

    const blockEl = ev.target.closest("[data-block]");
    if (blockEl) {
      ev.preventDefault();
      ev.stopPropagation();
      const addr = blockEl.getAttribute("data-block");
      blockContract(rowFromContract(addr));
      return;
    }

    const unEl = ev.target.closest("[data-unblock]");
    if (unEl) {
      ev.preventDefault();
      ev.stopPropagation();
      unblockContract(unEl.getAttribute("data-unblock"));
      return;
    }
  });

  function isBlockedPanelOpen() {
    return (
      blockedPanelOpen &&
      els.blockedPanel &&
      els.blockedPanel.classList.contains("is-open")
    );
  }

  function isFavoritesPanelOpen() {
    return (
      favoritesPanelOpen &&
      els.favoritesPanel &&
      els.favoritesPanel.classList.contains("is-open")
    );
  }

  function positionDropdownPanel(panel, btn) {
    if (!panel || !btn) return;
    const rect = btn.getBoundingClientRect();
    const gap = 8;
    const width = Math.min(320, window.innerWidth * 0.86);
    let left = rect.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    const top = rect.bottom + gap;
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.right = "auto";
    panel.style.top = `${top}px`;
    requestAnimationFrame(() => {
      if (!panel.classList.contains("is-open")) return;
      const h = panel.offsetHeight || 200;
      if (top + h > window.innerHeight - 8 && rect.top > h + gap) {
        panel.style.top = `${Math.max(8, rect.top - h - gap)}px`;
      }
    });
  }

  function positionBlockedPanel() {
    if (!els.blockedPanel || !els.btnBlocked || !isBlockedPanelOpen()) return;
    positionDropdownPanel(els.blockedPanel, els.btnBlocked);
  }

  function positionFavoritesPanel() {
    if (!els.favoritesPanel || !els.btnFavorites || !isFavoritesPanelOpen()) return;
    positionDropdownPanel(els.favoritesPanel, els.btnFavorites);
  }

  function openBlockedPanel() {
    // re-query in case DOM moved
    els.blockedPanel = $("blockedPanel") || els.blockedPanel;
    els.blockedList = $("blockedList") || els.blockedList;
    els.blockedEmpty = $("blockedEmpty") || els.blockedEmpty;
    els.btnClearBlocked = $("btnClearBlocked") || els.btnClearBlocked;
    if (!els.blockedPanel) return;

    closeFavoritesPanel();

    if (els.blockedPanel.parentElement !== document.body) {
      document.body.appendChild(els.blockedPanel);
    }

    blockedPanelOpen = true;
    els.blockedPanel.hidden = false;
    els.blockedPanel.removeAttribute("hidden");
    els.blockedPanel.classList.add("is-open");
    updateBlockedUi();
    positionBlockedPanel();
    blockedIgnoreOutsideUntil = Date.now() + 200;
  }

  function closeBlockedPanel() {
    blockedPanelOpen = false;
    if (!els.blockedPanel) return;
    els.blockedPanel.classList.remove("is-open");
    els.blockedPanel.hidden = true;
    els.blockedPanel.setAttribute("hidden", "");
  }

  function toggleBlockedPanel(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (isBlockedPanelOpen()) closeBlockedPanel();
    else openBlockedPanel();
  }

  function openFavoritesPanel() {
    els.favoritesPanel = $("favoritesPanel") || els.favoritesPanel;
    els.favoritesList = $("favoritesList") || els.favoritesList;
    els.favoritesEmpty = $("favoritesEmpty") || els.favoritesEmpty;
    els.btnClearFavorites = $("btnClearFavorites") || els.btnClearFavorites;
    if (!els.favoritesPanel) return;

    closeBlockedPanel();

    if (els.favoritesPanel.parentElement !== document.body) {
      document.body.appendChild(els.favoritesPanel);
    }

    favoritesPanelOpen = true;
    els.favoritesPanel.hidden = false;
    els.favoritesPanel.removeAttribute("hidden");
    els.favoritesPanel.classList.add("is-open");
    updateFavoritesUi();
    positionFavoritesPanel();
    favoritesIgnoreOutsideUntil = Date.now() + 200;
  }

  function closeFavoritesPanel() {
    favoritesPanelOpen = false;
    if (!els.favoritesPanel) return;
    els.favoritesPanel.classList.remove("is-open");
    els.favoritesPanel.hidden = true;
    els.favoritesPanel.setAttribute("hidden", "");
  }

  function toggleFavoritesPanel(ev) {
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    if (isFavoritesPanelOpen()) closeFavoritesPanel();
    else openFavoritesPanel();
  }

  // Bind after DOM ready pieces exist
  (function bindBlockedPanel() {
    els.btnBlocked = $("btnBlocked") || els.btnBlocked;
    els.blockedPanel = $("blockedPanel") || els.blockedPanel;
    if (!els.btnBlocked || !els.blockedPanel) {
      console.warn("[ui] blocked panel elements missing", {
        btn: !!els.btnBlocked,
        panel: !!els.blockedPanel,
      });
      return;
    }
    if (els.blockedPanel.parentElement !== document.body) {
      document.body.appendChild(els.blockedPanel);
    }
    // start closed
    closeBlockedPanel();

    els.btnBlocked.addEventListener("click", toggleBlockedPanel);

    if (els.btnClearBlocked) {
      els.btnClearBlocked.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        clearBlocked();
      });
    }

    document.addEventListener("click", (ev) => {
      if (!isBlockedPanelOpen()) return;
      if (Date.now() < blockedIgnoreOutsideUntil) return;
      const t = ev.target;
      if (t && typeof t.closest === "function") {
        if (t.closest("#btnBlocked") || t.closest("#blockedPanel")) return;
      }
      closeBlockedPanel();
    });

    window.addEventListener("resize", positionBlockedPanel);
    window.addEventListener("scroll", positionBlockedPanel, true);
  })();

  (function bindFavoritesPanel() {
    els.btnFavorites = $("btnFavorites") || els.btnFavorites;
    els.favoritesPanel = $("favoritesPanel") || els.favoritesPanel;
    if (!els.btnFavorites || !els.favoritesPanel) {
      console.warn("[ui] favorites panel elements missing", {
        btn: !!els.btnFavorites,
        panel: !!els.favoritesPanel,
      });
      return;
    }
    if (els.favoritesPanel.parentElement !== document.body) {
      document.body.appendChild(els.favoritesPanel);
    }
    closeFavoritesPanel();

    els.btnFavorites.addEventListener("click", toggleFavoritesPanel);

    if (els.btnClearFavorites) {
      els.btnClearFavorites.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        clearFavorites();
      });
    }

    document.addEventListener("click", (ev) => {
      if (!isFavoritesPanelOpen()) return;
      if (Date.now() < favoritesIgnoreOutsideUntil) return;
      const t = ev.target;
      if (t && typeof t.closest === "function") {
        if (t.closest("#btnFavorites") || t.closest("#favoritesPanel")) return;
      }
      closeFavoritesPanel();
    });

    window.addEventListener("resize", positionFavoritesPanel);
    window.addEventListener("scroll", positionFavoritesPanel, true);
  })();

  // Whitelist raffle modal (periods / partner / WL type / Twitter / winners + win badge)
  (function bindRaffleModal() {
    const btn = $("btnRaffle");
    const modal = $("raffleModal");
    const backdrop = $("raffleModalBackdrop");
    const btnClose = $("btnCloseRaffle");
    const rulesEl = $("raffleRules");
    const listEl = $("raffleRounds");
    const emptyEl = $("raffleEmpty");
    const unreadDot = $("raffleUnreadDot");
    if (!btn || !modal || !listEl) return;

    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }

    let open = false;
    let lastFocus = null;
    let cache = null;
    let loading = false;

    function normAddr(a) {
      return String(a || "").trim().toLowerCase();
    }

    function roundKey(round) {
      if (round?.id != null && String(round.id).trim()) {
        return String(round.id).trim().toLowerCase();
      }
      return `period-${Number(round?.period) || 0}`;
    }

    function loadReadMap() {
      try {
        const raw = localStorage.getItem(RAFFLE_READ_KEY);
        const data = raw ? JSON.parse(raw) : {};
        return data && typeof data === "object" ? data : {};
      } catch {
        return {};
      }
    }

    function saveReadMap(map) {
      try {
        localStorage.setItem(RAFFLE_READ_KEY, JSON.stringify(map || {}));
      } catch {
        /* ignore */
      }
    }

    function isDemoRound(round) {
      return (
        round?.demo === true ||
        round?.demo === 1 ||
        String(round?.demo || "").toLowerCase() === "true"
      );
    }

    /**
     * Demo rounds: after wallet connect, put viewer address first in winners
     * so everyone can see red-dot / "you won" UI without a real draw.
     * Real (non-demo) rounds are never rewritten.
     */
    function decorateRoundsForViewer(rounds, address) {
      const a = normAddr(address);
      if (!Array.isArray(rounds)) return [];
      if (!a) return rounds.slice();
      return rounds.map((round) => {
        if (!isDemoRound(round)) return round;
        if (String(round?.status || "").toLowerCase() !== "drawn") return round;
        const raw = Array.isArray(round.winners) ? round.winners.filter(Boolean) : [];
        const rest = raw.filter((w) => normAddr(w) !== a);
        return {
          ...round,
          winners: [a, ...rest],
          _demoPreview: true,
        };
      });
    }

    function viewerRounds() {
      return decorateRoundsForViewer(
        Array.isArray(cache?.rounds) ? cache.rounds : [],
        walletAddress
      );
    }

    function isRoundWinner(round, address) {
      const a = normAddr(address);
      if (!a) return false;
      if (String(round?.status || "").toLowerCase() !== "drawn") return false;
      const winners = Array.isArray(round?.winners) ? round.winners : [];
      return winners.some((w) => normAddr(w) === a);
    }

    function unreadWinKeys(address, rounds) {
      const a = normAddr(address);
      if (!a || !Array.isArray(rounds)) return [];
      const map = loadReadMap();
      const read = map[a] && typeof map[a] === "object" ? map[a] : {};
      const keys = [];
      for (const round of rounds) {
        if (!isRoundWinner(round, a)) continue;
        const k = roundKey(round);
        if (!read[k]) keys.push(k);
      }
      return keys;
    }

    function markWinsRead(address, rounds) {
      const a = normAddr(address);
      if (!a || !Array.isArray(rounds)) return;
      const map = loadReadMap();
      if (!map[a] || typeof map[a] !== "object") map[a] = {};
      let changed = false;
      for (const round of rounds) {
        if (!isRoundWinner(round, a)) continue;
        const k = roundKey(round);
        if (!map[a][k]) {
          map[a][k] = true;
          changed = true;
        }
      }
      if (changed) saveReadMap(map);
    }

    function syncUnreadBadge() {
      const rounds = viewerRounds();
      const unread = walletAddress ? unreadWinKeys(walletAddress, rounds) : [];
      const has = unread.length > 0;
      if (unreadDot) {
        unreadDot.hidden = !has;
        unreadDot.setAttribute("aria-hidden", has ? "false" : "true");
      }
      btn.classList.toggle("has-raffle-unread", has);
      if (has) {
        btn.setAttribute("aria-label", `${t("raffleLink")} · ${t("raffleUnreadAria")}`);
        btn.title = t("raffleUnreadAria");
      } else {
        btn.removeAttribute("aria-label");
        btn.removeAttribute("title");
      }
    }

    function wlTypeLabel(round) {
      if (lang === "en") {
        return (
          round.wlTypeEn ||
          round.wlTypeZh ||
          round.wlType ||
          "—"
        );
      }
      return (
        round.wlTypeZh ||
        round.wlTypeEn ||
        round.wlType ||
        "—"
      );
    }

    function formatDrawnAt(iso) {
      if (!iso) return "";
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        return d.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        return String(iso);
      }
    }

    function twitterHref(url) {
      const u = String(url || "").trim();
      if (!u) return "";
      if (/^https?:\/\//i.test(u)) return u;
      if (u.startsWith("@")) return `https://x.com/${u.slice(1)}`;
      if (/^x\.com\//i.test(u) || /^twitter\.com\//i.test(u)) return `https://${u}`;
      return `https://x.com/${u.replace(/^\/+/, "")}`;
    }

    function twitterDisplay(url) {
      const u = String(url || "").trim();
      if (!u) return "";
      try {
        const href = twitterHref(u);
        const path = new URL(href).pathname.replace(/\/$/, "");
        if (path && path !== "/") return `@${path.replace(/^\//, "").split("/")[0]}`;
      } catch {
        /* fall through */
      }
      return u.startsWith("@") ? u : u;
    }

    async function copyText(text, btnEl) {
      const value = String(text || "");
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const ta = document.createElement("textarea");
          ta.value = value;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        if (btnEl) {
          const prev = btnEl.textContent;
          btnEl.textContent = t("raffleCopied");
          setTimeout(() => {
            btnEl.textContent = prev || t("raffleCopy");
          }, 1200);
        }
      } catch {
        /* ignore */
      }
    }

    function renderRound(round) {
      const period = Number(round.period) || 0;
      const spots = Number(round.spots);
      const status = String(round.status || "").toLowerCase() === "drawn" ? "drawn" : "pending";
      const winners = Array.isArray(round.winners) ? round.winners.filter(Boolean) : [];
      const tw = twitterHref(round.projectTwitter || round.twitter || "");
      const note =
        lang === "en"
          ? round.noteEn || round.noteZh || ""
          : round.noteZh || round.noteEn || "";
      const drawnLabel = formatDrawnAt(round.drawnAt);
      const youWon = isRoundWinner(round, walletAddress);
      const me = normAddr(walletAddress);
      const isDemo = isDemoRound(round);

      const winnersHtml =
        status === "drawn" && winners.length
          ? `<div class="raffle-winners-head">
              <span class="raffle-winners-label">${escapeHtml(t("raffleWinnersLabel"))}${
                drawnLabel ? ` · ${escapeHtml(t("raffleDrawnAt", drawnLabel))}` : ""
              }</span>
            </div>
            <ul class="raffle-winner-list">
              ${winners
                .map((addr, i) => {
                  const isMe = me && normAddr(addr) === me;
                  return `<li class="${isMe ? "is-me" : ""}">
                    <span class="raffle-winner-idx">${i + 1}.</span>
                    <span class="raffle-winner-addr" title="${escapeHtml(addr)}">${escapeHtml(addr)}</span>
                    <button type="button" class="raffle-winner-copy" data-copy="${escapeHtml(addr)}">${escapeHtml(
                      t("raffleCopy")
                    )}</button>
                  </li>`;
                })
                .join("")}
            </ul>`
          : `<div class="raffle-pending-box">${escapeHtml(t("rafflePendingHint"))}</div>`;

      return `<article class="raffle-round${youWon ? " is-you-won" : ""}${isDemo ? " is-demo" : ""}" role="listitem" data-period="${period}">
        <div class="raffle-round-head">
          <div class="raffle-round-title">
            <span class="raffle-period">${escapeHtml(t("rafflePeriod", period))}</span>
            <span class="raffle-status ${status === "drawn" ? "is-drawn" : "is-pending"}">${escapeHtml(
              status === "drawn" ? t("raffleStatusDrawn") : t("raffleStatusPending")
            )}</span>
            ${isDemo ? `<span class="raffle-demo-badge">${escapeHtml(t("raffleDemoBadge"))}</span>` : ""}
            ${youWon ? `<span class="raffle-you-won">${escapeHtml(t("raffleYouWon"))}</span>` : ""}
          </div>
          <span class="raffle-spots">${escapeHtml(
            Number.isFinite(spots) ? t("raffleSpots", spots) : ""
          )}</span>
        </div>
        <div class="raffle-meta">
          <div class="raffle-meta-row">
            <span class="raffle-meta-label">${escapeHtml(t("raffleProjectLabel"))}</span>
            <span class="raffle-project">${escapeHtml(round.project || "—")}</span>
            <span class="raffle-wl-type" title="${escapeHtml(t("raffleWlTypeLabel"))}">${escapeHtml(
              wlTypeLabel(round)
            )}</span>
          </div>
          <div class="raffle-meta-row">
            <span class="raffle-meta-label">${escapeHtml(t("raffleTwitterLabel"))}</span>
            ${
              tw
                ? `<a class="raffle-twitter" href="${escapeHtml(tw)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                    twitterDisplay(round.projectTwitter || round.twitter || tw)
                  )} ↗</a>`
                : `<span class="raffle-project">—</span>`
            }
          </div>
        </div>
        ${note ? `<p class="raffle-note">${escapeHtml(note)}</p>` : ""}
        ${winnersHtml}
      </article>`;
    }

    function render() {
      if (rulesEl) {
        if (cache?.rules) {
          rulesEl.textContent =
            lang === "en"
              ? cache.rules.en || cache.rules.zh || ""
              : cache.rules.zh || cache.rules.en || "";
          rulesEl.hidden = !rulesEl.textContent;
        } else if (loading) {
          rulesEl.textContent = t("raffleLoading");
          rulesEl.hidden = false;
        } else {
          rulesEl.textContent = "";
          rulesEl.hidden = true;
        }
      }
      const rounds = viewerRounds();
      if (!rounds.length) {
        listEl.innerHTML = "";
        if (emptyEl) {
          emptyEl.hidden = loading;
          emptyEl.textContent = loading ? t("raffleLoading") : t("raffleEmpty");
        }
        syncUnreadBadge();
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      listEl.innerHTML = rounds.map(renderRound).join("");
      syncUnreadBadge();
    }

    window.__renderRaffleModal = render;
    window.__syncRaffleWinBadge = syncUnreadBadge;

    async function load(force) {
      if (loading) return;
      if (cache && !force) {
        render();
        return;
      }
      loading = true;
      render();
      try {
        const res = await fetch("/api/raffles", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        cache = {
          rules: data.rules || null,
          rounds: Array.isArray(data.rounds) ? data.rounds : [],
        };
      } catch (e) {
        console.warn("[raffle]", e);
        if (!cache) {
          cache = { rules: null, rounds: [] };
          if (rulesEl) {
            rulesEl.textContent = t("raffleLoadError");
            rulesEl.hidden = false;
          }
        }
      } finally {
        loading = false;
        render();
      }
    }

    function close() {
      if (!open) return;
      open = false;
      modal.hidden = true;
      document.body.classList.remove("os-modal-open");
      btn.setAttribute("aria-expanded", "false");
      if (lastFocus && typeof lastFocus.focus === "function") {
        try {
          lastFocus.focus();
        } catch {
          /* ignore */
        }
      }
      lastFocus = null;
    }

    async function show(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      lastFocus = document.activeElement;
      open = true;
      modal.hidden = false;
      document.body.classList.add("os-modal-open");
      btn.setAttribute("aria-expanded", "true");
      await load(true);
      // Opening the panel counts as reading all current win notices for this wallet
      // (includes demo preview wins after address injection)
      if (walletAddress) {
        markWinsRead(walletAddress, viewerRounds());
      }
      render();
      const focusTarget = btnClose || modal.querySelector(".raffle-modal-card");
      if (focusTarget && typeof focusTarget.focus === "function") {
        try {
          focusTarget.focus();
        } catch {
          /* ignore */
        }
      }
    }

    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "raffleModal");
    btn.addEventListener("click", show);

    if (btnClose) {
      btnClose.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        close();
      });
    }
    if (backdrop) {
      backdrop.addEventListener("click", (ev) => {
        ev.preventDefault();
        close();
      });
    }
    listEl.addEventListener("click", (ev) => {
      const tEl = ev.target;
      if (!tEl || typeof tEl.closest !== "function") return;
      const copyBtn = tEl.closest("[data-copy]");
      if (!copyBtn) return;
      ev.preventDefault();
      copyText(copyBtn.getAttribute("data-copy") || "", copyBtn);
    });

    // Prefetch so the red dot can appear without opening the modal first
    load(false);

    window.__onRaffleWalletChange = () => {
      if (open) render();
      else syncUnreadBadge();
      // If cache empty, try load for badge
      if (!cache) load(false);
      else if (!loading && walletAddress) {
        // refresh badge against latest cache
        syncUnreadBadge();
      }
    };

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && open) {
        ev.preventDefault();
        close();
      }
    });
  })();

  // OpenSea explain modal (header link between Twitter and Updates)
  (function bindOpenSeaModal() {
    const btn = $("btnOpenSea");
    const modal = $("openSeaModal");
    const backdrop = $("openSeaModalBackdrop");
    const btnClose = $("btnCloseOpenSea");
    const cta = $("openSeaCta");
    if (!btn || !modal) return;
    if (cta && OFFICIAL_NFT.mintUrl) {
      cta.setAttribute("href", OFFICIAL_NFT.mintUrl);
    }

    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }

    let open = false;
    let lastFocus = null;

    function close() {
      if (!open) return;
      open = false;
      modal.hidden = true;
      document.body.classList.remove("os-modal-open");
      btn.setAttribute("aria-expanded", "false");
      if (lastFocus && typeof lastFocus.focus === "function") {
        try {
          lastFocus.focus();
        } catch {
          /* ignore */
        }
      }
      lastFocus = null;
    }

    function show(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      lastFocus = document.activeElement;
      open = true;
      modal.hidden = false;
      document.body.classList.add("os-modal-open");
      btn.setAttribute("aria-expanded", "true");
      const focusTarget = btnClose || modal.querySelector(".os-modal-card");
      if (focusTarget && typeof focusTarget.focus === "function") {
        try {
          focusTarget.focus();
        } catch {
          /* ignore */
        }
      }
    }

    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "openSeaModal");
    btn.addEventListener("click", show);

    if (btnClose) {
      btnClose.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        close();
      });
    }
    if (backdrop) {
      backdrop.addEventListener("click", (ev) => {
        ev.preventDefault();
        close();
      });
    }
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && open) {
        ev.preventDefault();
        close();
      }
    });
  })();

  // Lightweight updates panel (replaces empty Telegram link)
  (function bindUpdatesPanel() {
    const btn = $("btnUpdates");
    const panel = $("updatesPanel");
    const btnClose = $("btnCloseUpdates");
    if (!btn || !panel) return;

    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }

    let open = false;
    let ignoreOutsideUntil = 0;

    function position() {
      const r = btn.getBoundingClientRect();
      const w = panel.offsetWidth || 320;
      let left = r.right - w;
      if (left < 8) left = 8;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      panel.style.top = `${Math.round(r.bottom + 8)}px`;
      panel.style.right = "auto";
      panel.style.left = `${Math.round(left)}px`;
    }

    function close() {
      open = false;
      panel.hidden = true;
      panel.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    }

    function show() {
      renderUpdatesList();
      open = true;
      panel.hidden = false;
      panel.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
      position();
      ignoreOutsideUntil = Date.now() + 200;
    }

    function toggle(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      if (open) close();
      else show();
    }

    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "updatesPanel");
    btn.addEventListener("click", toggle);
    if (btnClose) {
      btnClose.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        close();
      });
    }
    document.addEventListener("click", (ev) => {
      if (!open || Date.now() < ignoreOutsideUntil) return;
      const t = ev.target;
      if (t && typeof t.closest === "function") {
        if (t.closest("#btnUpdates") || t.closest("#updatesPanel")) return;
      }
      close();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && open) close();
    });
    window.addEventListener("resize", () => {
      if (open) position();
    });
    window.addEventListener(
      "scroll",
      () => {
        if (open) position();
      },
      true
    );
    close();
  })();

  applyThemeUi();
  applyStaticI18n();
  updateDataFreshnessUi();
  refresh();
  timer = setInterval(refresh, 4000);
  freshnessTicker = setInterval(updateDataFreshnessUi, 1000);

  window.addEventListener("beforeunload", () => {
    if (timer) clearInterval(timer);
    if (freshnessTicker) clearInterval(freshnessTicker);
  });
})();
