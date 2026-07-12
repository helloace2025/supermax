(() => {
  const $ = (id) => document.getElementById(id);
  const LANG_KEY = "mint-radar-lang";
  const BLOCK_KEY = "mint-radar-blocked";
  const BLOCK_META_KEY = "mint-radar-blocked-meta";

  const EYE_SLASH_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2.1 3.51 3.51 2.1l18.38 18.39-1.41 1.41-3.1-3.1A11.4 11.4 0 0 1 12 19c-5 0-9.27-3.11-11-7.5a12.3 12.3 0 0 1 4.18-5.09L2.1 3.51zM12 7a5 5 0 0 1 5 5c0 .7-.14 1.36-.4 1.97l-1.57-1.57A2.99 2.99 0 0 0 12 9c-.4 0-.78.08-1.13.23L9.3 7.66A4.96 4.96 0 0 1 12 7zm0-5c5 0 9.27 3.11 11 7.5a12.48 12.48 0 0 1-4.05 5.04l-1.45-1.45A10.4 10.4 0 0 0 21.17 9.5 10.46 10.46 0 0 0 12 4c-1.08 0-2.12.16-3.1.46L7.35 2.9A12.3 12.3 0 0 1 12 2zM8.12 9.54 9.6 11A3 3 0 0 0 12 15c.36 0 .7-.06 1.02-.18l1.48 1.48A5 5 0 0 1 8.12 9.54z"/></svg>`;

  const I18N = {
    zh: {
      htmlLang: "zh-CN",
      title: "RH NFT Mint Radar · Robinhood Chain",
      brandTitle: "NFT Mint Radar",
      brandSub: "Robinhood Chain · 实时铸造热度",
      liveConnecting: "连接中…",
      liveOk: "实时监控中",
      liveWarm: "预热中…",
      livePollErr: "轮询异常",
      liveFail: "连接失败",
      kpiAria: "关键指标",
      kpiHottest: "当前最热",
      kpi5m: "5 分钟量",
      kpiMinters: "独立 minter",
      kpiCols: "活跃集合",
      kpiNew: "新盘 (低 supply)",
      kpiLast: "最近一笔",
      kpiBlock: "区块",
      hideLp: "隐藏 LP NFT",
      onlyMethod: "仅显示有 method 的 mint",
      refresh: "立即刷新",
      hotTitle: "🔥 铸造热榜",
      thCollection: "集合",
      thUnique: "独立 minter",
      th5m: "5 分钟",
      th30m: "30 分钟",
      th1h: "1 小时",
      thHolders: "Holders",
      thSupply: "Supply",
      thRecent: "最近",
      hotLoading: "正在拉取链上 mint…",
      hotEmpty: "暂无铸造数据（或仍在预热缓存）…",
      feedTitle: "⚡ 实时铸造流",
      feedHint: "from 0x0 · ERC-721",
      feedEmpty: "暂无铸造事件",
      statusWaiting: "等待数据…",
      footerNote: "数据源：Blockscout REST · 无需自建节点（后续可升级 RPC eth_getLogs）",
      none: "暂无",
      addresses: "地址",
      colsUnit: "个",
      justNow: "刚刚",
      secAgo: (s) => `${s}s 前`,
      minAgo: (m) => `${m}m 前`,
      hourAgo: (h) => `${h}h 前`,
      statusError: (err, n) => `错误: ${err} · 轮询 #${n}`,
      statusWarm: "首次拉取 Blockscout…",
      statusOk: (pollRel, store, metaOk, metaCached, n) =>
        `上次轮询 ${pollRel} · mint ${store} · meta ${metaOk}/${metaCached} · poll #${n}`,
      socialOff: (title) => `${title}（未检测到）`,
      minter: "minter",
      explorer: "Explorer",
      blockTitle: "屏蔽此项目",
      blockedBtn: (n) => `已屏蔽 · ${n}`,
      blockedTitle: "屏蔽列表",
      blockedClear: "全部取消",
      blockedEmpty: "暂无屏蔽",
      unblock: "取消屏蔽",
    },
    en: {
      htmlLang: "en",
      title: "RH NFT Mint Radar · Robinhood Chain",
      brandTitle: "NFT Mint Radar",
      brandSub: "Robinhood Chain · Live mint heat",
      liveConnecting: "Connecting…",
      liveOk: "Live",
      liveWarm: "Warming up…",
      livePollErr: "Poll error",
      liveFail: "Connection failed",
      kpiAria: "Key metrics",
      kpiHottest: "Hottest now",
      kpi5m: "5m volume",
      kpiMinters: "Unique minters",
      kpiCols: "Active collections",
      kpiNew: "New (low supply)",
      kpiLast: "Latest mint",
      kpiBlock: "Block",
      hideLp: "Hide LP NFTs",
      onlyMethod: "Only mints with method",
      refresh: "Refresh",
      hotTitle: "🔥 Mint Leaderboard",
      thCollection: "Collection",
      thUnique: "Unique minters",
      th5m: "5 min",
      th30m: "30 min",
      th1h: "1 hour",
      thHolders: "Holders",
      thSupply: "Supply",
      thRecent: "Latest",
      hotLoading: "Loading on-chain mints…",
      hotEmpty: "No mint data yet (or still warming cache)…",
      feedTitle: "⚡ Live mint feed",
      feedHint: "from 0x0 · ERC-721",
      feedEmpty: "No mint events yet",
      statusWaiting: "Waiting for data…",
      footerNote:
        "Source: Blockscout REST · No self-hosted node (RPC eth_getLogs later)",
      none: "None",
      addresses: "addrs",
      colsUnit: "",
      justNow: "just now",
      secAgo: (s) => `${s}s ago`,
      minAgo: (m) => `${m}m ago`,
      hourAgo: (h) => `${h}h ago`,
      statusError: (err, n) => `Error: ${err} · poll #${n}`,
      statusWarm: "First Blockscout fetch…",
      statusOk: (pollRel, store, metaOk, metaCached, n) =>
        `Last poll ${pollRel} · mint ${store} · meta ${metaOk}/${metaCached} · poll #${n}`,
      socialOff: (title) => `${title} (not found)`,
      minter: "minter",
      explorer: "Explorer",
      blockTitle: "Block this collection",
      blockedBtn: (n) => `Blocked · ${n}`,
      blockedTitle: "Blocked list",
      blockedClear: "Unblock all",
      blockedEmpty: "Nothing blocked",
      unblock: "Unblock",
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

  /** Fixed ranking window: who appears on the board (5m/30m/1h columns carry the volume detail). */
  const RANK_WINDOW_MIN = 60;

  let lang = detectLang();
  let timer = null;
  let lastFeedKeys = new Set();
  /** last successful API payload — re-render on language switch */
  let lastData = null;
  /** @type {Set<string>} */
  let blocked = loadBlocked();
  /** @type {Map<string, {name?: string, symbol?: string}>} */
  let blockedMeta = loadBlockedMeta();

  const els = {
    livePill: $("livePill"),
    liveText: $("liveText"),
    kLeader: $("kLeader"),
    kVel: $("kVel"),
    kMinters: $("kMinters"),
    kCols: $("kCols"),
    kNew: $("kNew"),
    kLast: $("kLast"),
    kBlock: $("kBlock"),
    hotBody: $("hotBody"),
    feed: $("feed"),
    statusLine: $("statusLine"),
    hideLp: $("hideLp"),
    onlyPaid: $("onlyPaid"),
    btnRefresh: $("btnRefresh"),
    btnBlocked: $("btnBlocked"),
    blockedPanel: $("blockedPanel"),
    blockedList: $("blockedList"),
    blockedEmpty: $("blockedEmpty"),
    btnClearBlocked: $("btnClearBlocked"),
  };

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
    if (lastData) renderAll(lastData);
    else updateBlockedUi();
  }

  function unblockContract(contract) {
    const c = String(contract || "").toLowerCase();
    blocked.delete(c);
    blockedMeta.delete(c);
    persistBlocked();
    if (lastData) renderAll(lastData);
    else updateBlockedUi();
  }

  function clearBlocked() {
    blocked.clear();
    blockedMeta.clear();
    persistBlocked();
    if (lastData) renderAll(lastData);
    else updateBlockedUi();
  }

  function updateBlockedUi() {
    const n = blocked.size;
    if (els.btnBlocked) {
      els.btnBlocked.textContent = t("blockedBtn", n);
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

    document.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });
    updateBlockedUi();
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
      renderAll(lastData);
    } else {
      els.liveText.textContent = t("liveConnecting");
      els.statusLine.textContent = t("statusWaiting");
    }
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

  function setLive(ok, text) {
    els.livePill.classList.remove("ok", "err");
    if (ok === true) els.livePill.classList.add("ok");
    if (ok === false) els.livePill.classList.add("err");
    els.liveText.textContent = text;
  }

  function pickHot(data) {
    return data.hot || [];
  }

  function filterHot(list) {
    let out = list.slice().filter((r) => !isBlocked(r.contract));
    if (els.hideLp.checked) {
      out = out.filter(
        (r) =>
          !/UNI-V[34]|Positions NFT/i.test(r.name || "") &&
          !/UNI-V[34]/i.test(r.symbol || "")
      );
    }
    if (els.onlyPaid.checked) {
      out = out.filter((r) => r.topMethod && r.topMethod !== "null");
    }
    return out;
  }

  function renderStats(data) {
    const st = data.status || {};
    const hot = filterHot(pickHot(data));
    const leader = hot[0] || null;
    const feed = (Array.isArray(data.feed) ? data.feed : []).filter(
      (e) => !isBlocked(e.contract)
    );

    if (leader) {
      const name = leader.name || leader.symbol || short(leader.contract);
      const vol1h =
        leader.mints1h != null ? fmtNum(leader.mints1h) : fmtNum(leader.mints);
      els.kLeader.textContent = `${name} · ${vol1h} / 1h`;
      els.kLeader.title = leader.contract || "";
      els.kVel.textContent =
        leader.mints5m != null ? `${fmtNum(leader.mints5m)} / 5m` : "—";
      els.kMinters.textContent =
        leader.uniqueMinters != null
          ? `${fmtNum(leader.uniqueMinters)} ${t("addresses")}`
          : "—";
    } else {
      els.kLeader.textContent = t("none");
      els.kLeader.title = "";
      els.kVel.textContent = "—";
      els.kMinters.textContent = "—";
    }

    if (hot.length) {
      const unit = t("colsUnit");
      els.kCols.textContent = unit
        ? `${hot.length} ${unit}`
        : String(hot.length);
    } else {
      els.kCols.textContent = "0";
    }

    const newish = hot.filter((r) => {
      const supply = Number(r.totalSupply);
      const holders = Number(r.holders);
      const lowSupply = Number.isFinite(supply) && supply > 0 && supply < 500;
      const lowHolders =
        Number.isFinite(holders) && holders > 0 && holders < 200;
      return lowSupply || lowHolders;
    });
    if (newish.length) {
      const top = newish[0];
      els.kNew.textContent = `${newish.length} · ${top.name || top.symbol || "—"}`;
      els.kNew.title = newish
        .slice(0, 5)
        .map((r) => r.name || r.symbol)
        .join(", ");
    } else {
      els.kNew.textContent = "0";
      els.kNew.title = "";
    }

    const last = feed[0];
    if (last?.timestamp) {
      const who = last.name || last.symbol || short(last.contract);
      els.kLast.textContent = `${relTime(last.timestamp)} · ${who}`;
      els.kLast.title = last.txHash || "";
    } else {
      els.kLast.textContent = "—";
      els.kLast.title = "";
    }

    els.kBlock.textContent =
      st.latestBlock != null ? fmtNum(st.latestBlock) : "—";
  }

  function renderHot(data) {
    const list = filterHot(pickHot(data));

    if (!list.length) {
      els.hotBody.innerHTML = `<tr><td colspan="9" class="empty">${escapeHtml(
        t("hotEmpty")
      )}</td></tr>`;
      return;
    }

    const maxMints = Math.max(...list.map((r) => r.mints1h || r.mints || 0), 1);

    els.hotBody.innerHTML = list
      .map((r, i) => {
        const rankClass = i < 3 ? "rank top" : "rank";
        const pct = Math.round(((r.mints1h || 0) / maxMints) * 100);
        return `<tr>
          <td class="${rankClass}">${i + 1}</td>
          <td>
            <div class="col-row">
              ${avatarHtml(r)}
              <div class="col-name">
                <a class="name" href="${r.explorerToken}" target="_blank" rel="noopener">${escapeHtml(r.name || "Unknown")}</a>
                <span class="meta">${escapeHtml(r.symbol || "")} · ${escapeHtml(r.short || short(r.contract))}</span>
                <span class="meta links">
                  ${socialsHtml(r)}
                  <a class="explorer-link" href="${r.explorerToken}" target="_blank" rel="noopener" title="Blockscout">${escapeHtml(t("explorer"))}</a>
                </span>
                <div class="bar"><i style="width:${pct}%"></i></div>
              </div>
            </div>
          </td>
          <td class="num">${fmtNum(r.uniqueMinters)}</td>
          <td class="num">${fmtNum(r.mints5m)}</td>
          <td class="num">${fmtNum(r.mints30m)}</td>
          <td class="num">${fmtNum(r.mints1h)}</td>
          <td class="num">${fmtNum(r.holders)}</td>
          <td class="num">${fmtNum(r.totalSupply)}</td>
          <td>
            <a href="${r.explorerTx}" target="_blank" rel="noopener" class="num">${relTime(r.lastMintAt)}</a>
          </td>
        </tr>`;
      })
      .join("");
  }

  function renderFeed(data) {
    let feed = Array.isArray(data.feed) ? data.feed : [];
    feed = feed.filter((e) => !isBlocked(e.contract));
    if (els.hideLp.checked) {
      feed = feed.filter(
        (e) =>
          !/UNI-V[34]|Positions NFT/i.test(e.name || "") &&
          !/UNI-V[34]/i.test(e.symbol || "")
      );
    }
    if (els.onlyPaid.checked) {
      feed = feed.filter((e) => e.method);
    }

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
              <a class="name" href="${e.explorerToken}" target="_blank" rel="noopener">${escapeHtml(e.name || "Unknown")}</a>
              ${socialsHtml(e)}
            </div>
            <span class="time">${relTime(e.timestamp)}</span>
          </div>
          <div class="feed-row">
            <span>#${escapeHtml(String(e.tokenId ?? "?"))}</span>
            <span>${escapeHtml(e.symbol || "")}</span>
            ${method}
            <a href="${e.explorerMinter}" target="_blank" rel="noopener">${escapeHtml(t("minter"))} ${escapeHtml(e.minterShort || short(e.minter))}</a>
            <a href="${e.explorerTx}" target="_blank" rel="noopener">tx ↗</a>
            <span>blk ${fmtNum(e.blockNumber)}</span>
          </div>
        </article>`;
      })
      .join("");
  }

  function renderStatus(data) {
    const st = data.status || {};
    if (st.lastError) {
      setLive(false, t("livePollErr"));
      els.statusLine.textContent = t(
        "statusError",
        st.lastError,
        st.pollCount || 0
      );
    } else if (!st.pollCount) {
      setLive(null, t("liveWarm"));
      els.statusLine.textContent = t("statusWarm");
    } else {
      setLive(true, t("liveOk"));
      els.statusLine.textContent = t(
        "statusOk",
        relTime(st.lastPollAt),
        st.storeSize,
        st.metaOk || 0,
        st.metaCached || 0,
        st.pollCount
      );
    }
  }

  function renderAll(data) {
    renderStats(data);
    renderHot(data);
    renderFeed(data);
    renderStatus(data);
    updateBlockedUi();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function avatarHtml(r) {
    const name = escapeHtml(r.name || "?");
    const letter = escapeHtml(
      (r.name || r.symbol || "?").slice(0, 1).toUpperCase()
    );
    const contract = escapeHtml(String(r.contract || "").toLowerCase());
    const blockLabel = escapeHtml(t("blockTitle"));
    let face;
    if (r.icon) {
      face = `<img class="avatar" src="${escapeHtml(r.icon)}" alt="${name}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar ph',textContent:'${letter}'}))" />`;
    } else {
      face = `<div class="avatar ph">${letter}</div>`;
    }
    return `<div class="avatar-wrap">
      ${face}
      <button type="button" class="block-btn" data-block="${contract}" title="${blockLabel}" aria-label="${blockLabel}">${EYE_SLASH_SVG}</button>
    </div>`;
  }

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
    const os =
      r.opensea ||
      (r.contract
        ? `https://opensea.io/contract/robinhood/${r.contract}`
        : null);
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
      });
      const res = await fetch(`/api/mints?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      lastData = data;
      renderAll(data);
    } catch (e) {
      setLive(false, t("liveFail"));
      els.statusLine.textContent = e.message || String(e);
    }
  }

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLang(btn.dataset.lang));
  });

  els.hideLp.addEventListener("change", () => {
    if (lastData) renderAll(lastData);
    else refresh();
  });
  els.onlyPaid.addEventListener("change", () => {
    if (lastData) renderAll(lastData);
    else refresh();
  });
  els.btnRefresh.addEventListener("click", () => refresh());

  // One-click block from hot list / live feed
  document.addEventListener("click", (ev) => {
    const blockEl = ev.target.closest("[data-block]");
    if (blockEl) {
      ev.preventDefault();
      ev.stopPropagation();
      const addr = blockEl.getAttribute("data-block");
      let row = { contract: addr };
      if (lastData) {
        const all = [
          ...(lastData.hot || []),
          ...(lastData.feed || []),
        ];
        const hit = all.find(
          (x) => String(x.contract || "").toLowerCase() === addr
        );
        if (hit) row = hit;
      }
      blockContract(row);
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

  if (els.btnBlocked && els.blockedPanel) {
    els.btnBlocked.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const open = els.blockedPanel.hasAttribute("hidden");
      if (open) {
        els.blockedPanel.removeAttribute("hidden");
        updateBlockedUi();
      } else {
        els.blockedPanel.setAttribute("hidden", "");
      }
    });
  }
  if (els.btnClearBlocked) {
    els.btnClearBlocked.addEventListener("click", (ev) => {
      ev.stopPropagation();
      clearBlocked();
    });
  }
  document.addEventListener("click", (ev) => {
    if (!els.blockedPanel || els.blockedPanel.hasAttribute("hidden")) return;
    if (ev.target.closest(".blocked-wrap")) return;
    els.blockedPanel.setAttribute("hidden", "");
  });

  applyStaticI18n();
  refresh();
  timer = setInterval(refresh, 2500);

  window.addEventListener("beforeunload", () => {
    if (timer) clearInterval(timer);
  });
})();
