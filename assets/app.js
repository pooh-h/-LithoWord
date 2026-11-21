/* 岩语 · LithoWord — 应用层
 * 无框架、无构建、无外部依赖。数据存放于 localStorage。
 */
(function () {
  "use strict";

  const LC = window.LithoCore;
  const L = window.LITHO;
  if (!LC || !L) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">词库或内核加载失败，请检查 assets/ 目录是否完整。</p>';
    return;
  }

  const KEY = "lithoword.v2";
  const TODAY = LC.todayISO();
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  const WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const RATE_LABEL = { 1: "忘记", 2: "模糊", 3: "记得", 4: "很简单" };

  /* ======================================================================
     工具
     ====================================================================== */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function uid() {
    return Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
  }
  function norm(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtISO(iso) {
    const p = String(iso).split("-");
    return p[0] + "年" + Number(p[1]) + "月" + Number(p[2]) + "日";
  }
  function fmtShort(iso) {
    const p = String(iso).split("-");
    return Number(p[1]) + "月" + Number(p[2]) + "日";
  }
  function weekday(iso) {
    const p = iso.split("-").map(Number);
    return WEEK_CN[new Date(p[0], p[1] - 1, p[2]).getDay()];
  }
  function nowISO() { return new Date().toISOString(); }
  function domainOf(id) { return L.domains.find(function (d) { return d.id === id; }) || L.domains[L.domains.length - 1]; }
  function sceneOf(id) { return L.scenes.find(function (s) { return s.id === id; }) || L.scenes[L.scenes.length - 1]; }
  function sourceOf(id) { return store.sources.find(function (s) { return s.id === id; }) || null; }
  function knownSet() {
    const s = new Set(L.byTerm.keys());
    store.words.forEach(function (w) { s.add(norm(w.term)); if (w.lemma) s.add(norm(w.lemma)); });
    return s;
  }
  function entryOf(raw) {
    const t = norm(raw);
    if (!t) return null;
    const hit = L.byTerm.get(t);
    if (hit) return hit;
    const li = LC.lemma(t, { known: knownSet() });
    return L.byTerm.get(norm(li.lemma)) || null;
  }
  function sceneForDomain(domainId) {
    const map = { thin: "thin", petro: "thin", mineral: "thin", sed: "thin", struct: "field", strat: "field",
      field: "field", hydro: "field", geochem: "method", anal: "method", geophys: "method",
      econ: "resource", energy: "resource", academic: "lecture" };
    return map[domainId] || "lecture";
  }
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function chip(domainId, extra) {
    const d = domainOf(domainId);
    return '<span class="chip domain" style="--dc:' + d.color + '"><i class="dot"></i>' + esc(d.zh) + (extra ? " · " + esc(extra) : "") + "</span>";
  }
  function sceneChip(sceneId) {
    const s = sceneOf(sceneId);
    return '<span class="chip scene">' + esc(s.zh) + "</span>";
  }
  function shortTitle(s) {
    const t = String((s && s.title) || "未命名").replace(/\s+/g, " ");
    return t.length > 46 ? t.slice(0, 44) + "…" : t;
  }
  function cite(s) {
    if (!s) return "未关联文献";
    return [s.authors ? s.authors.split(";")[0].trim() : "", s.year, s.venue].filter(Boolean).join(" · ");
  }
  function markTerm(text, term) {
    const t = String(text || "");
    if (!t) return "";
    const safe = esc(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safe) return esc(t);
    try {
      return esc(t).replace(new RegExp("(" + safe + ")", "ig"), "<mark>$1</mark>");
    } catch (e) { return esc(t); }
  }
  function splitRoots(roots) {
    if (!roots) return [];
    return String(roots).split(/\s*\+\s*/).map(function (chunk) {
      const m = chunk.match(/^(.+?)[（(]([^）)]+)[）)]\s*$/);
      return m ? { root: m[1].trim(), meaning: m[2].trim() } : { root: chunk.trim(), meaning: "" };
    }).filter(function (x) { return x.root; });
  }

  /* ======================================================================
     状态
     ====================================================================== */
  const DEFAULT_SETTINGS = {
    dailyDue: 30,
    randomExtra: 4,
    autoSpeak: false,
    agentPort: 8737,
    hotkey: "doubleTab",
    dictOnline: true,
    dictRemote: true
  };

  let store = null;
  let route = { name: "today", params: new URLSearchParams() };
  let session = null;
  let sessionSig = "";
  let drawerWordId = null;
  let drawerLexTerm = null;
  let drawerOpen = false;
  let pendingConfirm = null;
  let wordFilters = { q: "", status: "all", domain: "all", sort: "recent", source: "" };
  let lastWordsSig = "";
  let libTab = "cards";
  let elQ = "";          // 元素搜索
  let elCat = "all";     // 元素类别筛选
  let elRank = "all";    // 常见度筛选：all / A / B / mine
  let agentOnline = false;
  const PT = window.PTABLE || null;
  let lastTabAt = 0;

  function defaults() {
    return {
      version: 2,
      words: [],
      sources: [],
      log: [],
      settings: Object.assign({}, DEFAULT_SETTINGS),
      meta: { createdAt: nowISO(), seeded: false }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.words)) return null;
      data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
      data.sources = data.sources || [];
      data.log = data.log || [];
      data.meta = data.meta || { createdAt: nowISO(), seeded: true };
      // 老版本默认 12 张/天，换成间隔阶梯后默认提到 30；只在用户没动过时迁移
      if (data.settings.dailyDue === 12 && !data.meta.ladderMigrated) {
        data.settings.dailyDue = 30;
        data.meta.ladderMigrated = true;
      }
      return data;
    } catch (e) {
      console.warn("读取本地数据失败", e);
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {
      toast("本地存储写入失败：可能空间已满", "err");
    }
  }

  /* ======================================================================
     示例数据
     ====================================================================== */
  function seedStore() {
    const day = function (offset) { return LC.addDays(TODAY, offset); };
    const srcA = {
      id: "s-demo-a", key: "doi:10.1016/j.sedgeo.2020.105789", itemKey: "", demo: true,
      title: "Detrital zircon provenance of the Cretaceous Gyeongsang Basin, Korea",
      authors: "Lee, J.; Kim, Y.; Park, S.", year: "2021", venue: "Sedimentary Geology",
      doi: "10.1016/j.sedgeo.2020.105789", type: "article-journal",
      abstract: "U–Pb ages of detrital zircons constrain the source-to-sink history of the basin fill.",
      addedAt: nowISO()
    };
    const srcB = {
      id: "s-demo-b", key: "doi:10.1016/j.oregeorev.2019.103055", itemKey: "", demo: true,
      title: "Magmatic–hydrothermal evolution of the Yulong porphyry Cu–Mo deposit, eastern Tibet",
      authors: "Hou, Z.; Yang, Z.", year: "2019", venue: "Ore Geology Reviews",
      doi: "10.1016/j.oregeorev.2019.103055", type: "article-journal",
      abstract: "Fluid inclusion and isotope data record a multi-stage magmatic-hydrothermal system.",
      addedAt: nowISO()
    };

    const seeds = [
      { term: "cleavage", source: srcA.id, page: "4", due: -2, reps: 3, interval: 6, ease: 2.5, lapses: 1,
        quote: "Cleavage in amphibole is developed along {110} and appears as two sets intersecting at about 56°." },
      { term: "porphyritic", source: srcB.id, page: "2", due: 0, reps: 1, interval: 3, ease: 2.4, lapses: 1,
        quote: "The host granite is medium-grained and porphyritic, with K-feldspar phenocrysts up to 3 cm across." },
      { term: "mylonite", source: srcA.id, page: "7", due: 0, reps: 0, interval: 0, ease: 2.5, lapses: 0,
        quote: "A 40-m-wide mylonite zone marks the northern strand of the boundary fault." },
      { term: "fractionation", source: srcB.id, page: "6", due: 0, reps: 2, interval: 8, ease: 2.6, lapses: 0,
        quote: "Fractionation of the light REEs is indicated by steep chondrite-normalized patterns." },
      { term: "aquifer", source: srcA.id, page: "3", due: 3, reps: 4, interval: 21, ease: 2.7, lapses: 0,
        quote: "The sandstone aquifer is confined by the overlying mudstone unit." },
      { term: "kerogen", source: srcB.id, page: "5", due: 1, reps: 2, interval: 5, ease: 2.5, lapses: 0,
        quote: "Type II kerogen dominates the source-rock interval and reaches TOC values of 4.8 wt%." },
      { term: "cross-bedding", source: srcA.id, page: "3", due: -1, reps: 2, interval: 3, ease: 2.3, lapses: 1,
        quote: "Planar cross-bedding indicates a unidirectional paleocurrent toward the southeast." },
      { term: "ubiquitous", source: srcA.id, page: "2", due: 5, reps: 5, interval: 34, ease: 2.8, lapses: 0,
        quote: "Zircon is ubiquitous in the analyzed sandstones, although its abundance varies widely." }
    ];

    const words = seeds.map(function (s, i) {
      const e = L.byTerm.get(s.term) || {};
      return {
        id: "w-demo-" + i,
        term: e.term || s.term,
        input: s.term,
        lemma: norm(e.term || s.term),
        domain: e.domain || "academic",
        scene: e.scene || "thin",
        ipa: e.ipa || "",
        roots: e.roots || "",
        defZh: e.defZh || "",
        defEn: "",
        exEn: e.exEn || "",
        exZh: e.exZh || "",
        collocations: (e.collocations || []).slice(),
        tip: e.tip || "",
        contexts: [{ sourceId: s.source, page: s.page, quote: s.quote, addedAt: nowISO() }],
        variants: [],
        tags: [],
        clsReason: "词库命中：" + (e.term || s.term),
        clsConf: 0.96,
        demo: true,
        createdAt: LC.addDays(TODAY, -(6 - i)) + "T09:00:00.000Z",
        srs: { ease: s.ease, interval: s.interval, reps: s.reps, lapses: s.lapses, due: LC.addDays(TODAY, s.due), last: s.reps ? LC.addDays(TODAY, -2) : null }
      };
    });

    const logs = [
      { d: day(-1), type: "review", n: 4, demo: true },
      { d: day(-1), type: "add", n: 1, demo: true },
      { d: day(-2), type: "review", n: 3, demo: true },
      { d: day(-2), type: "add", n: 2, demo: true },
      { d: day(-3), type: "review", n: 5, demo: true },
      { d: day(-4), type: "add", n: 1, demo: true },
      { d: day(-6), type: "review", n: 2, demo: true },
      { d: day(-6), type: "add", n: 1, demo: true }
    ];

    return { version: 2, words: words, sources: [srcA, srcB], log: logs,
      settings: Object.assign({}, DEFAULT_SETTINGS),
      meta: { createdAt: nowISO(), seeded: true, demo: true } };
  }

  /* 开发用：?reset=1 清空本地数据并回到干净示例 */
  if (new URLSearchParams(location.search).get("reset") === "1") {
    try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
    location.replace(location.pathname);
  }

  store = load();
  if (!store) { store = seedStore(); save(); }

  /* ======================================================================
     统计
     ====================================================================== */
  function dueWords() {
    return store.words.filter(function (w) { return w.srs && w.srs.due && w.srs.due <= TODAY; });
  }
  function masteredCount() {
    return store.words.filter(function (w) { return w.srs && w.srs.interval >= LC.MASTERED_DAYS; }).length;
  }
  function todayCount(type) {
    return store.log.filter(function (x) { return x.d === TODAY && x.type === type; })
      .reduce(function (a, x) { return a + (x.n || 1); }, 0);
  }
  function logCount(iso, type) {
    return store.log.filter(function (x) { return x.d === iso && x.type === type; })
      .reduce(function (a, x) { return a + (x.n || 1); }, 0);
  }
  function pushLog(type, n) {
    let e = store.log.find(function (x) { return x.d === TODAY && x.type === type && !x.demo; });
    if (!e) { e = { d: TODAY, type: type, n: 0 }; store.log.push(e); }
    e.n += (n || 1);
  }
  function streakDays() {
    const dates = new Set(store.log.filter(function (x) { return x.n > 0; }).map(function (x) { return x.d; }));
    let cursor = dates.has(TODAY) ? TODAY : LC.addDays(TODAY, -1);
    if (!dates.has(cursor)) return 0;
    let n = 0;
    while (dates.has(cursor)) { n++; cursor = LC.addDays(cursor, -1); }
    return n;
  }

  /* ======================================================================
     收录 / 词形归并
     ====================================================================== */
  function normalizeCtx(ctx) {
    if (!ctx) return null;
    const c = {
      sourceId: ctx.sourceId || "",
      page: String(ctx.page || "").trim(),
      quote: String(ctx.quote || "").trim(),
      addedAt: nowISO()
    };
    return (c.sourceId || c.page || c.quote) ? c : null;
  }

  function addContext(word, ctx) {
    const c = normalizeCtx(ctx);
    if (!c) return false;
    const dup = (word.contexts || []).some(function (x) {
      return x.sourceId === c.sourceId && x.page === c.page && x.quote === c.quote;
    });
    if (dup) return false;
    word.contexts = word.contexts || [];
    word.contexts.push(c);
    word.updatedAt = nowISO();
    return true;
  }

  function upsertWord(raw, ctx) {
    const input = String(raw || "").trim();
    if (!input) return { error: "空词" };
    const lib = entryOf(input);
    const li = LC.lemma(input, { known: knownSet() });
    const term = lib ? lib.term : li.lemma;
    const cls = LC.classify(term, { byTerm: L.byTerm, known: knownSet() });

    const existing = store.words.find(function (w) {
      if (norm(w.term) === norm(input) || norm(w.term) === norm(term)) return true;
      return li.changed && norm(w.term) === norm(li.lemma);
    });

    if (existing) {
      const added = addContext(existing, ctx);
      existing.variants = existing.variants || [];
      if (li.changed && norm(input) !== norm(existing.term) && existing.variants.indexOf(norm(input)) < 0) {
        existing.variants.push(norm(input));
      }
      save();
      return { word: existing, merged: true, addedContext: added, lib: lib, lemmaInfo: li, cls: cls };
    }

    const word = {
      id: uid(),
      term: term,
      input: input,
      lemma: norm(term),
      domain: lib ? lib.domain : cls.domainId,
      scene: lib ? lib.scene : sceneForDomain(cls.domainId),
      ipa: lib ? lib.ipa : "",
      roots: lib ? lib.roots : "",
      defZh: lib ? lib.defZh : "",
      defEn: "",
      exEn: lib ? lib.exEn : "",
      exZh: lib ? lib.exZh : "",
      collocations: lib ? lib.collocations.slice() : [],
      tip: lib ? lib.tip : "",
      contexts: [],
      variants: li.changed && norm(input) !== norm(term) ? [norm(input)] : [],
      tags: [],
      clsReason: cls.reason,
      clsConf: cls.confidence,
      createdAt: nowISO(),
      srs: LC.newSrs(TODAY),
      lookupAt: 0
    };
    addContext(word, ctx);
    store.words.push(word);
    pushLog("add", 1);
    save();
    return { word: word, merged: false, addedContext: !!ctx, lib: lib, lemmaInfo: li, cls: cls };
  }

  /* ======================================================================
     离线词典：走本机取词助手的 /api/dict（ECDICT 英汉 · 77 万词条）
     ====================================================================== */
  const dictCache = new Map();
  let dictInfo = { ready: false, rows: 0, size: 0, built: "", stage: "none", text: "", progress: 0, checked: 0 };

  function dictRequest(path, ms) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 6000);
    return fetch(agentBase() + path, { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .finally(function () { clearTimeout(timer); });
  }

  function dictLookup(term) {
    const key = norm(term);
    if (!key) return Promise.resolve(null);
    if (dictCache.has(key)) return Promise.resolve(dictCache.get(key));
    return dictRequest("/api/dict?w=" + encodeURIComponent(term), 5000)
      .then(function (d) { dictCache.set(key, d); return d; })
      .catch(function () { return null; });
  }

  const onlineCache = new Map();

  function onlineLookup(term) {
    const key = norm(term);
    if (!key) return Promise.resolve(null);
    if (onlineCache.has(key)) return Promise.resolve(onlineCache.get(key));
    return dictRequest("/api/dict/online?w=" + encodeURIComponent(term), 9000)
      .then(function (d) { onlineCache.set(key, d); return d; })
      .catch(function () { return null; });
  }

  /* 有道的结果比离线库多两样：例句（中英对照）和真人发音。只补空字段。 */
  function applyOnline(word, d) {
    if (!word || !d || !d.found) return false;
    let touched = false;
    if (!word.ipa && d.phonetic) { word.ipa = "/" + String(d.phonetic).replace(/^\/|\/$/g, "") + "/"; touched = true; }
    if (!word.defZh && d.trans && d.trans.length) { word.defZh = d.trans.join("；"); touched = true; }
    const ex = (d.examples || [])[0];
    if (!word.exEn && ex && ex.en) {
      word.exEn = ex.en;
      if (!word.exZh && ex.zh) word.exZh = ex.zh;
      touched = true;
    }
    if (!word.audio && d.audio) { word.audio = d.audio; touched = true; }
    word.remote = { trans: d.trans || [], examples: d.examples || [], source: d.source || "有道词典（联网）", cached: !!d.cached };
    if (touched) word.updatedAt = nowISO();
    return touched;
  }

  function dictRefreshStatus(force) {
    if (!force && Date.now() - dictInfo.checked < 12000) return Promise.resolve(dictInfo);
    return dictRequest("/api/dict/status", 4000).then(function (s) {
      dictInfo = Object.assign({}, dictInfo, s, { agent: true, checked: Date.now() });
      return dictInfo;
    }).catch(function () {
      dictInfo = Object.assign({}, dictInfo, { agent: false, checked: Date.now() });
      return dictInfo;
    });
  }

  function dictTransText(d) {
    return (d.trans || []).join("；").replace(/\s+/g, " ").trim();
  }

  function humanSize(n) {
    if (!n) return "0 B";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0, x = Number(n) || 0;
    while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
    return (Math.round(x * 10) / 10) + " " + u[i];
  }

  function dictBusy(s) {
    return s && (s.stage === "download" || s.stage === "extract" || s.stage === "build" || s.stage === "start");
  }

  function dictPanelHTML() {
    const s = dictInfo || {};
    if (!s.agent) {
      return '<div class="agent"><i class="lamp"></i><div class="txt"><b>取词助手没连上</b> · 离线词典要靠它来查。双击 <span class="mono">启动.bat</span> 后再回来。</div></div>' +
        '<div class="hero-actions" style="margin-top:8px"><button class="btn btn-sm btn-ghost" data-act="agent-retry">重新连接助手</button>' +
        '<button class="btn btn-sm btn-quiet" data-act="dict-recheck">重新检测</button></div>';
    }
    if (dictBusy(s)) {
      const pct = Math.max(0, Math.min(100, Number(s.progress) || 0));
      return '<div class="agent on"><i class="lamp"></i><div class="txt"><b>' + esc(s.text || "正在准备离线词典…") +
        (pct ? " · " + pct + "%" : "") + "</b></div></div>" +
        '<div class="pbar" style="margin-top:10px"><i style="width:' + pct + '%"></i></div>' +
        '<div class="hero-actions" style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-act="dict-recheck">刷新进度</button></div>';
    }
    if (s.ready) {
      return '<div class="agent on"><i class="lamp"></i><div class="txt"><b>已安装</b> · ' + Number(s.rows || 0).toLocaleString() +
        " 条 · " + humanSize(s.size) + (s.built ? " · 建于 " + esc(s.built) : "") + "</div></div>" +
        '<div class="hero-actions" style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-act="dict-recheck">重新检测</button></div>';
    }
    if (s.stage === "done" || s.stage === "error" || s.error) {
      return '<div class="agent"><i class="lamp"></i><div class="txt"><b>安装失败</b> · ' + esc(s.error || s.text || "未知原因") +
        "。再点一次重试，或手动运行 <span class=\"mono\">python tools/dict_build.py</span>。</div></div>" +
        '<div class="hero-actions" style="margin-top:10px"><button class="btn btn-sm btn-primary" data-act="dict-install"><svg style="width:14px;height:14px"><use href="#i-download"/></svg>重新下载建库</button></div>';
    }
    return '<div class="agent"><i class="lamp"></i><div class="txt"><b>未安装</b> · 下载约 30 MB 词表，解压后建索引，共 77 万英汉词条；查词不联网。</div></div>' +
      '<div class="hero-actions" style="margin-top:10px"><button class="btn btn-sm btn-primary" data-act="dict-install"><svg style="width:14px;height:14px"><use href="#i-download"/></svg>下载并安装离线词典</button>' +
      '<button class="btn btn-sm btn-quiet" data-act="dict-recheck">重新检测</button></div>';
  }

  function paintDictPanel() {
    const box = document.getElementById("dictBox");
    if (box) box.innerHTML = dictPanelHTML();
  }

  let dictPollTimer = null;

  function pollDictInstall() {
    clearTimeout(dictPollTimer);
    dictRefreshStatus(true).then(function (s) {
      paintDictPanel();
      if (dictBusy(s)) {
        dictPollTimer = setTimeout(pollDictInstall, 1500);
        return;
      }
      if (s && s.ready) {
        dictCache.clear();
        toast("离线词典已就绪：" + Number(s.rows || 0).toLocaleString() + " 条", "good");
      } else if (s && (s.error || s.stage === "error")) {
        toast("词典安装失败：" + (s.error || "看看 data/cache/dict-progress.json"), "warn");
      }
    });
  }

  /* 把词典结果填进词条：只补空字段，不覆盖用户自己写的 */
  function applyDict(word, d) {
    if (!word || !d || !d.found) return false;
    let touched = false;
    if (!word.ipa && d.phonetic) { word.ipa = "/" + String(d.phonetic).replace(/^\/|\/$/g, "") + "/"; touched = true; }
    if (!word.defZh && d.trans && d.trans.length) { word.defZh = dictTransText(d); touched = true; }
    if (!word.defEn && d.definition) { word.defEn = String(d.definition).split("\n")[0].trim(); touched = true; }
    word.dict = {
      word: d.word || word.term,
      matched: d.matched || "",
      tag: d.tag || "",
      exchange: d.exchange || "",
      frq: d.frq || 0,
      bnc: d.bnc || 0,
      trans: d.trans || [],
      definition: d.definition || "",
      source: d.source || "ECDICT 离线词典"
    };
    if (touched) word.updatedAt = nowISO();
    return touched;
  }

  /* 词典补全之后：还挂在"通用学术"兜底的词，用中文释义再猜一次学科 */
  function maybeGlossClassify(word) {
    if (!word || !word.defZh) return false;
    if (word.domain && word.domain !== "academic") return false;
    if ((word.clsConf || 0) > 0.3) return false;
    const g = LC.classifyGloss(word.defZh);
    if (!g) return false;
    word.domain = g.domainId;
    word.clsConf = g.confidence;
    word.clsReason = g.reason;
    word.updatedAt = nowISO();
    return true;
  }

  function refreshWordViews(word) {
    if (drawerOpen && drawerWordId === word.id) openWord(word.id);
    if (route.name === "words") updateWordRows();
    if (route.name === "today") render();
  }

  /* 补全一个词：离线词典 → 有道联网 →（最后）dictionaryapi.dev 英文兜底 */
  async function enrichWord(word) {
    if (!word) return word;
    if (word.lookupState === "ok" || word.lookupState === "dict") return word;
    let touched = false;
    const d = await dictLookup(word.term);
    if (d && d.found) touched = applyDict(word, d) || touched;
    if (store.settings.dictRemote !== false) {
      const od = await onlineLookup(word.term);
      if (od && od.found) touched = applyOnline(word, od) || touched;
    }
    if (word.defZh) {
      word.lookupState = "dict";
    } else if (store.settings.dictOnline !== false) {
      await enrichOnline(word);
      return word;
    } else {
      word.lookupState = "fail";
    }
    word.lookupAt = Date.now();
    if (touched) maybeGlossClassify(word);
    save();
    refreshWordViews(word);
    return word;
  }

  /* 在线兜底：离线词典也没有的词，才去 dictionaryapi.dev 取英文释义 */
  async function enrichOnline(word) {
    if (!word || word.lookupState === "ok" || word.lookupState === "fail") return;
    if (entryOf(word.term)) return;
    word.lookupState = "loading";
    word.lookupAt = Date.now();
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 7000);
    try {
      const res = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word.term),
        ctrl ? { signal: ctrl.signal } : {});
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const d = Array.isArray(data) ? data[0] : null;
      if (!d) throw new Error("empty");
      const phon = (d.phonetics || []).filter(function (p) { return p.text || p.audio; });
      const withText = phon.find(function (p) { return p.text; });
      const withAudio = phon.find(function (p) { return p.audio; });
      word.ipa = word.ipa || d.phonetic || (withText ? withText.text : "");
      word.audio = withAudio ? withAudio.audio : "";
      const m = (d.meanings || [])[0];
      if (m) {
        word.partOfSpeech = m.partOfSpeech || "";
        const def = (m.definitions || [])[0];
        if (def) {
          word.defEn = word.defEn || def.definition || "";
          if (!word.exEn) {
            const ex = (m.definitions || []).find(function (x) { return x.example; });
            if (ex) word.exEn = ex.example;
          }
        }
      }
      word.lookupState = "ok";
    } catch (e) {
      word.lookupState = "fail";
    } finally {
      clearTimeout(timer);
      save();
      if (drawerOpen && drawerWordId === word.id) openWord(word.id);
      if (route.name === "words") updateWordRows();
    }
  }

  /* ======================================================================
     抽屉 / 模态 / 提示
     ====================================================================== */
  function toast(msg, tone) {
    const box = $("#toasts");
    const el = document.createElement("div");
    el.className = "toast " + (tone || "");
    el.innerHTML = '<i class="tdot"></i><span>' + esc(msg) + "</span>";
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add("out");
      setTimeout(function () { el.remove(); }, 260);
    }, 3200);
  }

  function openDrawer() {
    drawerOpen = true;
    $("#drawer").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
    $("#backdrop").classList.add("open");
  }
  function closeDrawer() {
    drawerOpen = false;
    drawerWordId = null;
    drawerLexTerm = null;
    $("#drawer").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
    if (!$("#modal").classList.contains("open")) $("#backdrop").classList.remove("open");
  }
  function openModal(html) {
    $("#modalCard").innerHTML = html;
    $("#modal").classList.add("open");
    $("#modal").setAttribute("aria-hidden", "false");
    $("#backdrop").classList.add("open");
    const first = $("#modalCard input, #modalCard textarea, #modalCard button");
    if (first) setTimeout(function () { first.focus(); }, 60);
  }
  function closeModal() {
    $("#modal").classList.remove("open");
    $("#modal").setAttribute("aria-hidden", "true");
    if (!drawerOpen) $("#backdrop").classList.remove("open");
  }
  function confirmDialog(title, body, label, fn) {
    pendingConfirm = fn;
    openModal(
      '<div class="modal-head"><h2>' + esc(title) + "</h2></div>" +
      '<p class="modal-sub">' + body + "</p>" +
      '<div class="modal-acts"><button class="btn btn-ghost" data-close>取消</button>' +
      '<button class="btn btn-danger" data-act="confirm-ok">' + esc(label || "确认") + "</button></div>"
    );
  }

  /* ======================================================================
     词条行 / 徽章
     ====================================================================== */
  function dueInfo(w) {
    const d = LC.daysBetween(TODAY, w.srs.due);
    if (d < 0) return { text: "逾期 " + (-d) + " 天", cls: "overdue" };
    if (d === 0) return { text: "今天到期", cls: "due-now" };
    if (d === 1) return { text: "明天复习", cls: "" };
    return { text: d + " 天后", cls: "" };
  }

  function wordRow(w) {
    const di = dueInfo(w);
    const d = domainOf(w.domain);
    return '<button class="word-row" data-act="open-word" data-id="' + w.id + '">' +
      '<span class="w-main"><span class="w-term">' + esc(w.term) + "</span>" +
      '<span class="w-ipa">' + (w.ipa ? esc(w.ipa) : "音标待补") + "</span></span>" +
      '<span class="w-def">' + esc(w.defZh || w.defEn || "还没有释义，打开补全") + "</span>" +
      '<span class="chip domain" style="--dc:' + d.color + '"><i class="dot"></i>' + esc(d.zh) + "</span>" +
      '<span class="w-due ' + di.cls + '">' + di.text + "</span>" +
      "</button>";
  }

  /* ======================================================================
     今日
     ====================================================================== */
  function viewToday() {
    const due = dueWords();
    const total = store.words.length;
    const mastered = masteredCount();
    const streak = streakDays();
    const rate = total ? Math.round(mastered / total * 100) : 0;
    const reviewedToday = todayCount("review");
    const addedToday = todayCount("add");

    if (!total) return emptyNotebook();

    const sessionSize = LC.buildQueue(store.words, TODAY, {
      dueLimit: store.settings.dailyDue, randomExtra: store.settings.randomExtra
    }).length;

    const heroTitle = due.length
      ? "今天，看 <em>" + due.length + " 块薄片</em>。"
      : "今天的薄片，<em>已经看完了</em>。";

    const week = [];
    for (let i = 6; i >= 0; i--) {
      const iso = LC.addDays(TODAY, -i);
      week.push({ iso: iso, add: logCount(iso, "add"), rev: logCount(iso, "review") });
    }
    const max = Math.max(1, Math.max.apply(null, week.map(function (d) { return Math.max(d.add, d.rev); })));

    const weekHTML = week.map(function (d) {
      const isToday = d.iso === TODAY;
      return '<div class="day ' + (isToday ? "today " : "") + (d.add + d.rev === 0 ? "empty" : "") + '">' +
        '<span class="dw">' + weekday(d.iso) + "</span>" +
        '<span class="dn">' + fmtShort(d.iso) + "</span>" +
        '<span class="bar">' +
        '<i style="height:' + Math.max(4, Math.round(d.add / max * 100)) + '%"></i>' +
        '<i class="' + (d.rev ? "hi" : "") + '" style="height:' + Math.max(4, Math.round(d.rev / max * 100)) + '%"></i>' +
        "</span>" +
        '<span class="cnt"><b>' + (d.add + d.rev) + "</b> 张</span>" +
        "</div>";
    }).join("");

    /* 学科分布 */
    const byDomain = {};
    store.words.forEach(function (w) { byDomain[w.domain] = (byDomain[w.domain] || 0) + 1; });
    const domainRows = Object.keys(byDomain).sort(function (a, b) { return byDomain[b] - byDomain[a]; })
      .slice(0, 7).map(function (id) {
        const d = domainOf(id);
        const n = byDomain[id];
        const pct = Math.round(n / total * 100);
        return '<a class="dom-row" href="#/words?domain=' + id + '" style="--dc:' + d.color + '">' +
          '<span class="dom-ico">' + esc(d.zh.slice(0, 1)) + "</span>" +
          '<span class="dom-name">' + esc(d.zh) + "<small>" + esc(d.en.split(" ")[0]) + "</small></span>" +
          '<span class="dom-track"><span class="dom-fill" style="width:' + pct + '%"></span></span>' +
          '<span class="dom-num">' + n + "</span></a>";
      }).join("");

    /* 最近语境 */
    const ctxWords = store.words.filter(function (w) { return (w.contexts || []).length; })
      .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 3);
    const ctxHTML = ctxWords.map(function (w) {
      const c = w.contexts[w.contexts.length - 1];
      const s = sourceOf(c.sourceId);
      return '<div class="ctx">' +
        '<div class="ctx-top"><span class="ctx-term">' + esc(w.term) + "</span>" +
        '<span class="chip domain" style="--dc:' + domainOf(w.domain).color + '"><i class="dot"></i>' + esc(domainOf(w.domain).zh) + "</span>" +
        '<span class="ctx-src">' + esc(s ? shortTitle(s) : "未关联文献") + (c.page ? " · p." + esc(c.page) : "") + "</span></div>" +
        (c.quote ? '<div class="ctx-quote">' + markTerm(c.quote, w.term) + "</div>" : "") +
        "</div>";
    }).join("") || '<div class="empty" style="padding:26px"><p>还没有带语境的词条。用 <kbd>Tab</kbd>×2 或点右上角引号按钮，把原句一起收进来。</p></div>';

    const recent = store.words.slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }).slice(0, 5);

    return '<section class="hero">' +
      '<div class="hero-copy">' +
      '<div class="hero-eyebrow">FIELD NOTE · ' + fmtShort(TODAY) + " " + weekday(TODAY) + " · " + L.domains.length + " 个领域在线</div>" +
      "<h2>" + heroTitle + "</h2>" +
      '<p class="hero-lead">从 Zotero 划来的词、视频里听到的词，先放上这张载物台。<b>词形自动归并</b>，一词语境一起留档；复习时按 SM-2 节奏回来找你。</p>' +
      '<ul class="hero-stats">' +
      "<li><span class=\"n\">" + total + "</span><span class=\"l\">我的词条</span></li>" +
      "<li><span class=\"n\">" + due.length + "</span><span class=\"l\">今日到期</span></li>" +
      "<li><span class=\"n\">" + streak + "</span><span class=\"l\">连续天数</span></li>" +
      "<li><span class=\"n\">" + rate + "<small>%</small></span><span class=\"l\">掌握率</span></li>" +
      "</ul>" +
      '<div class="hero-actions">' +
      (due.length
        ? '<a class="btn btn-primary" href="#/review"><svg><use href="#i-review"/></svg>开始今日复习 · ' + sessionSize + " 张</a>"
        : '<a class="btn btn-primary" href="#/review?mode=random"><svg><use href="#i-shuffle"/></svg>随机抽查 4 张</a>') +
      '<a class="btn btn-ghost" href="#/review?mode=random"><svg><use href="#i-shuffle"/></svg>随机抽查</a>' +
      '<button class="btn btn-quiet" data-act="open-capture"><svg><use href="#i-quote"/></svg>带语境收录</button>' +
      "</div></div>" +
      '<div class="hero-visual"><div class="slide">' +
      '<div class="slide-ring"></div><div class="crosshair"></div>' +
      '<div class="slide-core"><span class="num">' + due.length + "<small>/" + total + "</small></span>" +
      '<span class="cap">specimens due</span>' +
      "<span class=\"due\">" + (due.length ? "今天到期 · 约 " + Math.max(2, Math.round(due.length * 1.2)) + " 分钟" : "载物台已清空") + "</span></div>" +
      '<span class="slide-tag t1">PPL · 单偏光</span>' +
      '<span class="slide-tag t2">XPL · 正交偏光</span>' +
      '<span class="slide-tag t3">×40 / 0.65</span>' +
      "</div></div></section>" +

      '<div class="sec-head"><h2>本周切片</h2><span class="sec-sub">新增与复习，按天计数</span><span class="sec-rule"></span>' +
      '<span class="tiny muted">今天：新增 ' + addedToday + " · 复习 " + reviewedToday + "</span></div>" +
      '<div class="week">' + weekHTML + "</div>" +

      '<div class="cols" style="margin-top:26px">' +
      '<div class="panel"><div class="panel-head"><h3>学科分布</h3><span class="tiny muted">' + L.domains.length + " 个领域</span>" +
      '<a class="act" href="#/library">查看词库 →</a></div><div class="panel-body">' +
      (domainRows || '<p class="muted tiny">还没有词条。</p>') + "</div></div>" +

      '<div class="panel"><div class="panel-head"><h3>最近语境</h3><a class="act" href="#/sources">文献库 →</a></div>' +
      '<div class="panel-body flush">' + ctxHTML + "</div></div>" +
      "</div>" +

      '<div class="sec-head"><h2>最近收录</h2><a class="sec-act" href="#/words">全部 ' + total + " 条 →</a></div>" +
      '<div class="panel"><div class="word-list">' + recent.map(wordRow).join("") + "</div></div>";
  }

  function emptyNotebook() {
    return '<section class="hero"><div class="hero-copy">' +
      '<div class="hero-eyebrow">FIELD NOTE · ' + fmtShort(TODAY) + "</div>" +
      "<h2>载物台上，<em>还没有薄片</em>。</h2>" +
      '<p class="hero-lead">先收一个词试试：读文献时按 <kbd>Tab</kbd>×2（应用内）或装好取词助手后在任意窗口连按两次 Tab。也可以直接载入一组地质学示例，看看完整流程。</p>' +
      '<div class="hero-actions"><button class="btn btn-primary" data-act="open-capture"><svg><use href="#i-plus"/></svg>收录第一个词</button>' +
      '<button class="btn btn-ghost" data-act="seed-demo"><svg><use href="#i-library"/></svg>载入示例数据</button>' +
      '<a class="btn btn-quiet" href="#/library">先逛词库 →</a></div></div>' +
      '<div class="hero-visual"><div class="slide"><div class="slide-ring"></div><div class="crosshair"></div>' +
      '<div class="slide-core"><span class="num">0<small>/0</small></span><span class="cap">specimens</span><span class="due">等待第一块薄片</span></div></div></div></section>';
  }

  /* ======================================================================
     复习
     ====================================================================== */
  function packById(id) { return L.packs.find(function (p) { return p.id === id; }); }

  function makeSession(opts) {
    opts = opts || {};
    let pool = store.words.slice();
    let title = "全部词条";
    if (opts.pack) {
      const p = packById(opts.pack);
      if (p) {
        title = p.zh;
        pool = pool.filter(function (w) {
          return p.terms.some(function (t) { return norm(t) === norm(w.term) || norm(t) === norm(w.lemma); });
        });
      }
    }
    if (opts.domain) {
      title = domainOf(opts.domain).zh;
      pool = pool.filter(function (w) { return w.domain === opts.domain; });
    }
    if (opts.source) {
      const s = sourceOf(opts.source);
      title = s ? shortTitle(s) : "文献词条";
      pool = pool.filter(function (w) { return (w.contexts || []).some(function (c) { return c.sourceId === opts.source; }); });
    }
    let queue;
    if (opts.mode === "random") {
      const rng = mulberry(Date.now() % 100000);
      const shuffled = pool.slice().sort(function () { return rng() - 0.5; });
      queue = shuffled.slice(0, Math.max(1, opts.limit || 4));
    } else {
      queue = LC.buildQueue(pool, TODAY, {
        dueLimit: store.settings.dailyDue,
        randomExtra: store.settings.randomExtra,
        rng: mulberry(Date.now() % 100000)
      });
    }
    return {
      queue: queue, idx: 0, revealed: false, ratings: { 1: 0, 2: 0, 3: 0, 4: 0 },
      startedAt: Date.now(), title: title, poolSize: pool.length, mode: opts.mode || "daily"
    };
  }

  function viewReview() {
    if (!session) return '<div class="empty"><h3>没有可复习的词</h3></div>';
    if (!session.queue.length) {
      return '<div class="review"><div class="review-done">' + glyph() +
        "<h2>" + (session.poolSize ? "这一组今天已经清空" : "这个范围里还没有词") + "</h2>" +
        '<p>' + (session.poolSize ? "所有卡片都还没到复习时间。可以随机抽几张保持手感，或去读下一篇文献。" : "先把词收进来，或者换一个词包。") + "</p>" +
        '<div class="hero-actions" style="justify-content:center">' +
        '<a class="btn btn-primary" href="#/today">回今日</a>' +
        '<a class="btn btn-ghost" href="#/review?mode=random">随机抽查 4 张</a>' +
        '<a class="btn btn-quiet" href="#/words">看生词本</a></div></div></div>';
    }
    if (session.idx >= session.queue.length) return reviewDone();

    const w = session.queue[session.idx];
    const d = domainOf(w.domain);
    const previews = LC.previewIntervals(w.srs, TODAY);
    const c = (w.contexts || [])[0];
    const s = c ? sourceOf(c.sourceId) : null;
    const pct = Math.round(session.idx / session.queue.length * 100);

    const back = session.revealed ? (
      '<div class="answer">' +
      '<p class="answer-def">' + esc(w.defZh || "（暂无中文释义，点“编辑”补上）") +
      (w.defEn ? '<span class="en">' + esc(w.defEn) + "</span>" : "") + "</p>" +
      '<div class="answer-grid">' +
      (w.roots ? '<div class="field"><span class="k">Roots · 词根分解</span><div class="roots">' +
        splitRoots(w.roots).map(function (r) { return '<span class="root"><b>' + esc(r.root) + "</b>" + (r.meaning ? "<span>" + esc(r.meaning) + "</span>" : "") + "</span>"; }).join("") +
        "</div></div>" : "") +
      (w.exEn ? '<div class="field"><span class="k">Example · 例句</span><p class="example">' +
        markTerm(w.exEn, w.term) + (w.exZh ? '<span class="zh">' + esc(w.exZh) + "</span>" : "") + "</p></div>" : "") +
      (w.collocations && w.collocations.length ? '<div class="field"><span class="k">Collocations · 学术搭配</span><div class="roots">' +
        w.collocations.map(function (x) { return '<span class="root"><b>' + esc(x) + "</b></span>"; }).join("") + "</div></div>" : "") +
      (c && c.quote ? '<div class="field"><span class="k">In context · 原文语境</span><div class="quote-box">“' + markTerm(c.quote, w.term) + '”' +
        '<span class="src">' + (s ? esc(shortTitle(s)) : "未关联文献") + (c.page ? " · p." + esc(c.page) : "") +
        (s && s.itemKey ? ' · <a href="#" data-act="zotero" data-key="' + esc(s.itemKey) + '">Zotero 回跳</a>' : "") + "</span></div></div>" : "") +
      (w.tip ? '<div class="field"><span class="k">Usage · 使用提示</span><p class="tiny muted" style="line-height:1.7">' + esc(w.tip) + "</p></div>" : "") +
      "</div></div>" +
      '<div class="rate">' +
      [1, 2, 3, 4].map(function (r) {
        const iv = previews[r];
        return '<button class="r' + r + '" data-act="rate" data-r="' + r + '"><b>' + RATE_LABEL[r] + "</b>" +
          "<small>" + (iv ? (iv === 0 ? "今天再来" : "+" + iv + " 天") : "—") + "</small><span class=\"n\">按 " + r + "</span></button>";
      }).join("") + "</div>"
    ) : (
      '<div class="flash-hint"><span>先自己回忆：它属于哪个学科？词根是什么？</span>' +
      '<span class="kbd-hint">点卡片 · <kbd>空格</kbd> 看答案</span></div>'
    );

    return '<div class="review">' +
      '<div class="review-top">' +
      '<a class="btn btn-sm btn-quiet" href="#/today">← 今日</a>' +
      '<span class="review-spec">' + esc(session.title) + " · SPECIMEN " + pad(session.idx + 1) + " / " + pad(session.queue.length) + "</span>" +
      '<span class="review-progress"><i style="width:' + pct + '%"></i></span>' +
      '<span class="tiny muted">' + (session.idx) + "/" + session.queue.length + "</span>" +
      "</div>" +
      '<div class="flash' + (session.revealed ? "" : " is-ask") + '" data-act="reveal">' +
      '<div class="flash-meta">' + chip(w.domain) + sceneChip(w.scene) +
      (c ? '<span class="chip gold">语境 · ' + (s ? esc((s.year || "") + " " + (s.authors || "").split(";")[0]) : "已存档") + "</span>" : "") +
      (w.lemma && norm(w.lemma) !== norm(w.term) ? '<span class="chip">原形 ' + esc(w.lemma) + "</span>" : "") +
      "</div>" +
      '<div class="flash-term">' + esc(w.term) + "</div>" +
      '<div class="flash-ipa">' + (w.ipa ? esc(w.ipa) : "音标暂缺") +
      ' <button class="btn btn-sm btn-quiet" data-act="speak" data-term="' + esc(w.term) + '" data-audio="' + esc(w.audio || "") + '" title="朗读" style="padding:2px 6px"><svg style="width:14px;height:14px"><use href="#i-sound"/></svg></button></div>' +
      ((w.variants || []).length ? '<div class="flash-lemma">收录时写作 <b>' + esc(w.variants.join(" / ")) + "</b>，已按原形归并</div>" : "") +
      back +
      "</div>" +
      '<div class="review-foot">' +
      '<button class="btn btn-sm btn-quiet" data-act="end-session">结束本轮</button>' +
      '<span class="tiny muted">' + (session.mode === "random" ? "随机抽查" : "到期 + 随机") + " · 池中 " + session.poolSize + " 条</span>" +
      '<span class="keys kbd-hint"><kbd>空格</kbd> 显示 · <kbd>1</kbd>–<kbd>4</kbd> 评分 · <kbd>Esc</kbd> 收起</span>' +
      "</div></div>";
  }

  function reviewDone() {
    const total = Object.keys(session.ratings).reduce(function (a, k) { return a + session.ratings[k]; }, 0);
    const good = session.ratings[3] + session.ratings[4];
    const mins = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
    const nextDue = dueWords().length;
    return '<div class="review"><div class="review-done">' + glyph() +
      "<h2>本轮 " + total + " 张，收工。</h2>" +
      '<p>' + (good >= total * 0.7 ? "记得的比例不错，间隔会在下一轮拉开。" : "忘记的卡片已经排到今天稍后，今天之内会再遇到它们。") +
      "　用时约 " + mins + " 分钟。</p>" +
      '<div class="stat-grid" style="max-width:560px;margin:0 auto 22px;text-align:left">' +
      '<div class="stat" style="--dc:#2c8a68"><span class="k">记得</span><span class="v">' + good + '</span><span class="d">记得 + 很简单</span></div>' +
      '<div class="stat" style="--dc:#c0564d"><span class="k">忘记</span><span class="v">' + session.ratings[1] + '</span><span class="d">今天会再出现</span></div>' +
      '<div class="stat" style="--dc:#1a6fd0"><span class="k">今日剩余</span><span class="v">' + nextDue + '</span><span class="d">张到期卡</span></div>' +
      '<div class="stat" style="--dc:#b98a3c"><span class="k">连续</span><span class="v">' + streakDays() + '</span><span class="d">天</span></div>' +
      "</div>" +
      '<div class="hero-actions" style="justify-content:center">' +
      '<a class="btn btn-primary" href="#/today">回今日</a>' +
      '<a class="btn btn-ghost" href="#/review?mode=random">再抽 4 张</a>' +
      '<a class="btn btn-quiet" href="#/sources">去收新词 →</a></div></div></div>';
  }

  function glyph() {
    return '<svg class="glyph" viewBox="0 0 100 100" fill="none" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="44" stroke="#bcdcf5" stroke-width="2"/>' +
      '<circle cx="50" cy="50" r="30" stroke="#5fb4ee" stroke-width="1.2" opacity=".7"/>' +
      '<circle cx="50" cy="50" r="13" fill="#eaf5ff" stroke="#1a6fd0" stroke-width="1.6"/>' +
      '<path d="M50 2v18M50 80v18M2 50h18M80 50h18" stroke="#8dc3ee" stroke-width="1.2"/>' +
      '<path d="M50 37v26M37 50h26" stroke="#1a6fd0" stroke-width="1.2" opacity=".45"/></svg>';
  }

  function rate(r) {
    if (!session || !session.revealed) return;
    const w = session.queue[session.idx];
    if (!w) return;
    w.srs = LC.sm2(w.srs, r, TODAY);
    w.updatedAt = nowISO();
    session.ratings[r] = (session.ratings[r] || 0) + 1;
    pushLog("review", 1);
    if (r === 1) session.queue.push(w);
    session.idx++;
    session.revealed = false;
    save();
    paintDueDot();
    render();
  }

  /* ======================================================================
     生词本
     ====================================================================== */
  function filteredWords() {
    let list = store.words.slice();
    const q = norm(wordFilters.q);
    if (q) {
      list = list.filter(function (w) {
        const hay = [
          w.term, w.lemma, w.ipa, w.defZh, w.defEn, w.roots, w.exEn, w.exZh,
          domainOf(w.domain).zh,
          (w.collocations || []).join(" "),
          (w.contexts || []).map(function (c) { return c.quote; }).join(" ")
        ].join(" ").toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    if (wordFilters.domain !== "all") list = list.filter(function (w) { return w.domain === wordFilters.domain; });
    if (wordFilters.source) list = list.filter(function (w) { return (w.contexts || []).some(function (c) { return c.sourceId === wordFilters.source; }); });
    if (wordFilters.status === "due") list = list.filter(function (w) { return w.srs.due <= TODAY; });
    if (wordFilters.status === "new") list = list.filter(function (w) { return !w.srs.reps; });
    if (wordFilters.status === "learning") list = list.filter(function (w) { return w.srs.reps > 0 && w.srs.interval < LC.MASTERED_DAYS; });
    if (wordFilters.status === "mastered") list = list.filter(function (w) { return w.srs.interval >= LC.MASTERED_DAYS; });
    if (wordFilters.sort === "alpha") list.sort(function (a, b) { return a.term.localeCompare(b.term); });
    else if (wordFilters.sort === "due") list.sort(function (a, b) { return String(a.srs.due).localeCompare(String(b.srs.due)); });
    else list.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    return list;
  }

  function viewWords() {
    const source = sourceOf(wordFilters.source);
    return '<div class="sec-head" style="margin-top:16px"><h2>我的标本册</h2>' +
      '<span class="sec-sub">' + store.words.length + " 条 · 按原形归并</span><span class=\"sec-rule\"></span>" +
      '<button class="btn btn-sm btn-ghost" data-act="export" data-kind="csv"><svg><use href="#i-download"/></svg>导出 CSV</button></div>' +
      (source ? '<div style="margin:-4px 0 10px"><span class="chip gold">仅看：' + esc(shortTitle(source)) + '</span> <button class="btn btn-sm btn-quiet" data-act="clear-source-filter">清除</button></div>' : "") +
      '<div class="toolbar">' +
      '<label class="search"><svg><use href="#i-search"/></svg><input id="wordSearch" type="search" placeholder="搜我的生词：单词 / 音标 / 释义 / 学科 / 原句" value="' + esc(wordFilters.q) + '"></label>' +
      '<div class="seg" id="statusSeg">' +
      ["all", "due", "new", "learning", "mastered"].map(function (s) {
        const label = { all: "全部", due: "到期", new: "新词", learning: "学习中", mastered: "已掌握" }[s];
        return '<button data-status="' + s + '" class="' + (wordFilters.status === s ? "on" : "") + '">' + label + "</button>";
      }).join("") + "</div>" +
      '<label class="filter">领域<select id="domainFilter"><option value="all">全部 13 个</option>' +
      L.domains.map(function (d) { return '<option value="' + d.id + '"' + (wordFilters.domain === d.id ? " selected" : "") + ">" + esc(d.zh) + "</option>"; }).join("") +
      "</select></label>" +
      '<label class="filter">排序<select id="sortFilter">' +
      '<option value="recent"' + (wordFilters.sort === "recent" ? " selected" : "") + ">最近收录</option>" +
      '<option value="alpha"' + (wordFilters.sort === "alpha" ? " selected" : "") + ">字母序</option>" +
      '<option value="due"' + (wordFilters.sort === "due" ? " selected" : "") + ">最快到期</option></select></label>" +
      '<span class="spacer"></span><span class="count-note" id="wordCount"></span></div>' +
      '<div class="panel"><div class="word-list" id="wordRows"></div></div>';
  }

  function updateWordRows() {
    const rows = $("#wordRows");
    if (!rows) return;
    const list = filteredWords();
    rows.innerHTML = list.length ? list.map(wordRow).join("") :
      '<div class="empty"><svg class="glyph"><use href="#i-words"/></svg><h3>没有符合条件的词</h3><p>换一个筛选条件，或把搜索框清空。</p></div>';
    const cnt = $("#wordCount");
    if (cnt) cnt.textContent = list.length + " / " + store.words.length + " 条";
  }

  /* ======================================================================
     词库
     ====================================================================== */
  /* ======================================================================
     学科卡片墙：点开某个学科，每个词是一张方形卡片
     ====================================================================== */
  const DIFF_LEVELS = [
    { v: 1, zh: "会了", cls: "ok" },
    { v: 2, zh: "很难", cls: "hard" },
    { v: 3, zh: "不会", cls: "no" }
  ];
  let libDomain = "all";
  let libQ = "";
  const cardOpen = Object.create(null);

  function diffLevel(w) {
    if (!w || !w.diff) return null;
    for (let i = 0; i < DIFF_LEVELS.length; i++) if (DIFF_LEVELS[i].v === w.diff) return DIFF_LEVELS[i];
    return null;
  }

  function diffLabel(w) {
    const lv = diffLevel(w);
    if (!lv) return "未标注（去「词库 → 学科卡片」点一下就能标）";
    return lv.zh + " · 标过 " + (w.diffHits || 1) + " 次";
  }

  function wordByTerm(term) {
    const n = norm(term);
    return store.words.find(function (w) { return norm(w.term) === n || norm(w.lemma) === n; }) || null;
  }

  function cardList() {
    const q = norm(libQ);
    return L.entries.filter(function (e) {
      if (libDomain !== "all" && e.domain !== libDomain) return false;
      if (!q) return true;
      if (norm(e.term).indexOf(q) >= 0) return true;
      return String(e.defZh || "").toLowerCase().indexOf(String(libQ).toLowerCase()) >= 0;
    });
  }

  function wcardHTML(e) {
    const d = domainOf(e.domain);
    const w = wordByTerm(e.term);
    const lv = diffLevel(w);
    const open = !!cardOpen[e.term];
    const badge = lv
      ? '<span class="wc-badge ' + lv.cls + '">' + lv.zh + (w.diffHits > 1 ? " ×" + w.diffHits : "") + "</span>"
      : (w ? '<span class="wc-badge in">已收录</span>' : '<span class="wc-badge">未收录</span>');
    const acts = '<div class="wc-acts">' + DIFF_LEVELS.map(function (x) {
      const on = lv && lv.v === x.v ? " on" : "";
      return '<button class="wc-diff-btn ' + x.cls + on + '" data-act="wcard-diff" data-term="' + esc(e.term) +
        '" data-v="' + x.v + '">' + x.zh + "</button>";
    }).join("") + "</div>";
    return '<article class="wcard' + (open ? " on" : "") + '" data-act="wcard" data-term="' + esc(e.term) +
      '" style="--dc:' + d.color + '"><div class="wc-in">' +
      '<div class="wc-front">' +
      '<span class="wc-dom"><i></i>' + esc(d.zh) + "</span>" +
      "<h3>" + esc(e.term) + "</h3>" +
      '<span class="wc-ipa">' + esc(e.ipa || "音标待补") + "</span>" +
      '<div class="wc-foot">' + badge + "</div></div>" +
      '<div class="wc-back">' +
      '<p class="wc-def">' + esc(e.defZh) + "</p>" +
      (e.exEn ? '<p class="wc-ex">' + esc(e.exEn) + "</p>" : "") +
      acts +
      (w ? '<button class="btn btn-sm btn-quiet" data-act="open-word" data-id="' + esc(w.id) + '">打开词条</button>'
        : '<button class="btn btn-sm btn-quiet" data-act="add-lex" data-term="' + esc(e.term) + '">收录进生词本</button>') +
      "</div></div></article>";
  }

  function paintCards() {
    const g = $("#wgrid");
    if (g) g.innerHTML = cardList().map(wcardHTML).join("");
    const n = $("#wcount");
    if (n) n.textContent = cardList().length + " 张卡片";
  }

  function setCardDiff(term, v) {
    let w = wordByTerm(term);
    let added = false;
    if (!w) {
      const r = upsertWord(term, null);
      if (!r || r.error) { toast("收录失败，换个词试试", "warn"); return; }
      w = r.word;
      added = true;
      enrichWord(w);
    }
    w.diff = v;
    w.diffHits = (w.diffHits || 0) + 1;
    w.srs = LC.sm2(w.srs, v === 3 ? 1 : (v === 2 ? 2 : 3), TODAY);
    save();
    paintCards();
    const lv = diffLevel(w);
    toast((added ? "已收录并标为 " : "已标为 ") + lv.zh + " · 下次复习 " + (w.srs.interval || 0) + " 天后", "good");
  }

  function cardWallHTML() {
    const chips = [{ id: "all", zh: "全部", color: "#3d7ab8" }].concat(L.domains);
    return '<div class="wfilter">' +
      '<input id="wcardQ" class="wsearch" type="search" placeholder="搜词或释义：mylonite / 糜棱岩" value="' + esc(libQ) + '">' +
      '<span class="tiny muted" id="wcount">' + cardList().length + " 张卡片</span></div>" +
      '<div class="wchips">' + chips.map(function (d) {
        return '<button class="wchip' + (libDomain === d.id ? " on" : "") + '" data-act="wcard-domain" data-domain="' +
          d.id + '" style="--dc:' + d.color + '">' + esc(d.zh) + "</button>";
      }).join("") + "</div>" +
      '<div class="wgrid" id="wgrid">' + cardList().map(wcardHTML).join("") + "</div>" +
      '<p class="tiny muted" style="margin-top:14px">点卡片看背面。背面三个按钮就是难度标注：标「很难 / 不会」会把它直接排进 2–3 天后的复习，标「会了」往上走一档——每个词可以反复标，次数会累计在卡片上。</p>';
  }


  function viewLibrary() {
    const tabs = [["packs", "高频词包"], ["matrix", "学科 × 场景"], ["cards", "学科卡片"], ["abbr", "缩写表"]];
    let body = "";
    if (libTab === "packs") {
      body = '<div class="packs">' + L.packs.map(function (p) {
        const d = domainOf(p.domain);
        const have = p.terms.filter(function (t) {
          return store.words.some(function (w) { return norm(w.term) === norm(t) || norm(w.lemma) === norm(t); });
        }).length;
        return '<article class="pack" style="--dc:' + d.color + '">' +
          '<div class="pack-top"><span class="pack-ico">' + esc(d.zh.slice(0, 1)) + "</span>" +
          "<div><h3>" + esc(p.zh) + '</h3><div class="en">' + esc(p.en) + "</div></div></div>" +
          "<p>" + esc(p.blurb) + "</p>" +
          '<div class="pack-terms">' + p.terms.slice(0, 6).map(function (t) {
            return "<span>" + esc(t) + "</span>";
          }).join("") + (p.terms.length > 6 ? "<span>+" + (p.terms.length - 6) + "</span>" : "") + "</div>" +
          '<div class="pack-foot"><button class="btn btn-sm btn-primary" data-act="pack-review" data-pack="' + p.id + '">背这一包</button>' +
          '<button class="btn btn-sm btn-quiet" data-act="pack-words" data-pack="' + p.id + '">看词条</button>' +
          '<span class="pack-count">已收 ' + have + "/" + p.terms.length + "</span></div></article>";
      }).join("") + "</div>";
    } else if (libTab === "matrix") {
      const byDomain = {};
      L.entries.forEach(function (e) { (byDomain[e.domain] = byDomain[e.domain] || []).push(e); });
      const rows = L.domains.map(function (d) {
        const list = byDomain[d.id] || [];
        const scenes = {};
        list.forEach(function (e) { scenes[e.scene] = (scenes[e.scene] || 0) + 1; });
        const sceneText = Object.keys(scenes).sort(function (a, b) { return scenes[b] - scenes[a]; })
          .slice(0, 3).map(function (s) { return sceneOf(s).zh + " " + scenes[s]; }).join(" · ");
        const have = store.words.filter(function (w) { return w.domain === d.id; }).length;
        const terms = list.slice(0, 4).map(function (e) { return "<span>" + esc(e.term) + "</span>"; }).join("");
        return "<tr><td><span class=\"dom-cell\"><i class=\"dom-ico\" style=\"--dc:" + d.color + ";background:color-mix(in srgb," + d.color + " 12%,#fff);color:" + d.color + "\">" + esc(d.zh.slice(0, 1)) + "</i>" + esc(d.zh) + "</span></td>" +
          '<td class="mono">' + list.length + "</td>" +
          '<td class="tiny muted">' + esc(sceneText || "—") + "</td>" +
          '<td class="col-terms"><span class="terms">' + terms + "</span></td>" +
          '<td><span class="chip">' + have + " 条</span> <button class=\"btn btn-sm btn-quiet\" data-act=\"domain-review\" data-domain=\"" + d.id + "\">背这类</button></td></tr>";
      }).join("");
      body = '<div class="panel"><table class="matrix"><thead><tr><th>领域</th><th>词条</th><th>主要使用场景</th><th class="col-terms">示例</th><th>我的</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        '<p class="tiny muted" style="margin-top:10px">场景说明：镜下描述 / 野外记录 / 图版图注 / 方法与仪器 / 成因讨论 / 资源评价 / 课堂综述。每张卡片都会标注它最常出现的场景。</p>';
    } else if (libTab === "abbr") {
      body = '<div class="panel"><table class="matrix"><thead><tr><th>缩写</th><th>全称</th><th>中文</th><th></th></tr></thead><tbody>' +
        L.abbr.map(function (a) {
          return "<tr><td><b class=\"mono\" style=\"font-size:13px\">" + esc(a[0]) + "</b></td><td class=\"tiny\">" + esc(a[1]) + "</td><td class=\"tiny muted\">" + esc(a[2]) + "</td>" +
            '<td><button class="btn btn-sm btn-quiet" data-act="copy" data-text="' + esc(a[0] + " — " + a[1] + "（" + a[2] + "）") + '">复制</button></td></tr>';
        }).join("") + "</tbody></table></div>";
    } else {
      body = cardWallHTML();
    }

    return '<div class="sec-head" style="margin-top:16px"><h2>词库与领域</h2>' +
      '<span class="sec-sub">' + L.entries.length + " 条精选 · 13 个学科 · 7 种使用场景</span><span class=\"sec-rule\"></span></div>" +
      '<div class="seg" id="libTabs" style="margin-bottom:16px">' + tabs.map(function (t) {
        return '<button data-tab="' + t[0] + '" class="' + (libTab === t[0] ? "on" : "") + '">' + t[1] + "</button>";
      }).join("") + "</div>" + body;
  }

  /* ======================================================================
     元素周期表
     ====================================================================== */
  function elHave(e) {
    return store.words.find(function (w) {
      return norm(w.term) === norm(e.en) || norm(w.term) === norm(e.zh) || norm(w.term) === norm(e.sym);
    });
  }

  function elementCell(e, on) {
    const have = elHave(e);
    const cls = ["el"];
    if (!on) cls.push("off");
    if (have) cls.push("mine");
    if (e.rank === "A") cls.push("rk-a");
    return '<button class="' + cls.join(" ") + '" data-act="el-open" data-el="' + e.z + '" ' +
      'style="grid-area:' + e.p + "/" + e.g + ";--ec:" + e.color + '" ' +
      'title="' + esc(e.sym + " · " + e.en + " · " + e.zh) + '">' +
      '<i class="el-z">' + e.z + "</i>" +
      '<b class="el-sym">' + esc(e.sym) + "</b>" +
      '<span class="el-zh">' + esc(e.zh) + "</span>" +
      '<em class="el-en">' + esc(e.en) + "</em>" +
      (have ? '<i class="el-dot" title="已在生词本"></i>' : "") +
      "</button>";
  }

  function periodicTableHTML(onFn) {
    const cells = PT.elements.map(function (e) { return elementCell(e, onFn(e)); }).join("");
    const marker = function (p, txt, sub) {
      return '<div class="el-marker" style="grid-area:' + p + '/3"><b>' + txt + "</b><span>" + sub + "</span></div>";
    };
    return '<div class="ptable-scroll"><div class="ptable" id="ptable">' +
      cells +
      marker(6, "57–71", "镧系") + marker(7, "89–103", "锕系") +
      '<div class="ptable-gap" style="grid-area:8/1/9/19"></div>' +
      "</div></div>";
  }

  function viewElements() {
    if (!PT) return '<div class="empty"><h3>元素数据未加载</h3><p>assets/data-elements.js 没有引入。</p></div>';
    const q = elQ.trim();
    const base = PT.search(q);
    const inQuery = new Set(base.map(function (e) { return e.z; }));
    const on = function (e) {
      if (!inQuery.has(e.z)) return false;
      if (elCat !== "all" && e.cat !== elCat) return false;
      if (elRank === "A" && e.rank !== "A") return false;
      if (elRank === "B" && e.rank !== "B") return false;
      if (elRank === "mine" && !elHave(e)) return false;
      return true;
    };
    const hitCount = PT.elements.filter(on).length;
    const mineCount = PT.elements.filter(elHave).length;
    const filtering = !!q || elCat !== "all" || elRank !== "all";

    const rankChips = [["all", "全部 118"], ["A", "高频 " + PT.elements.filter(function (e) { return e.rank === "A"; }).length],
      ["B", "常见 " + PT.elements.filter(function (e) { return e.rank === "B"; }).length],
      ["mine", "已收录 " + mineCount]];
    const catChips = [["all", "全部类别"]].concat(PT.CATS.map(function (c) { return [c.id, c.zh]; }));

    return '<div class="sec-head" style="margin-top:16px"><h2>元素周期表</h2>' +
      '<span class="sec-sub">118 个元素 · 英文名与音标 · 点开看地质与工业用法</span><span class="sec-rule"></span></div>' +

      '<div class="elfilter">' +
      '<div class="elsearch"><svg style="width:15px;height:15px"><use href="#i-search"/></svg>' +
      '<input id="elQ" type="text" placeholder="搜元素：zinc / 锌 / Zn / 30" value="' + esc(elQ) + '" autocomplete="off" spellcheck="false">' +
      (q ? '<button class="elclear" data-act="el-clear" title="清空">×</button>' : "") + "</div>" +
      '<div class="wchips elchips">' + rankChips.map(function (r) {
        return '<button class="wchip' + (elRank === r[0] ? " on" : "") + '" data-act="el-rank" data-rank="' + r[0] + '">' + r[1] + "</button>";
      }).join("") + "</div>" +
      '<div class="wchips elchips">' + catChips.map(function (c) {
        return '<button class="wchip' + (elCat === c[0] ? " on" : "") + '" data-act="el-cat" data-cat="' + c[0] + '">' + c[1] + "</button>";
      }).join("") + "</div>" +
      "</div>" +

      '<p class="count-note elcount">' + (filtering ? "筛选出 " + hitCount + " 个" : "全部 118 个元素") +
      " · 格子里灰色小字是英文名，右上角数字是原子序数" + "</p>" +

      periodicTableHTML(on) +

      '<div class="el-legend">' + PT.CATS.map(function (c) {
        return '<span class="el-key" style="--ec:' + c.color + '"><i></i>' + esc(c.zh) + " " + esc(c.en) + "</span>";
      }).join("") + "</div>" +

      '<div class="panel" style="margin-top:16px"><div class="panel-body">' +
      '<p class="tiny muted" style="line-height:1.85;margin:0">' +
      "用法：点任意格子打开右栏，里面有英文名、音标、朗读、地质与工业上的常见说法；点「收录进生词本」它会带着音标和释义进你的复习队列。" +
      "格子右上角有蓝点表示这个词已经在生词本里。</p></div></div>";
  }

  function openElement(key) {
    const e = PT && PT.get(key);
    if (!e) return;
    const have = elHave(e);
    const groupTxt = e.p === 9 ? "镧系" : e.p === 10 ? "锕系" : e.g + " 族";
    const periodTxt = e.p === 9 || e.p === 10 ? "第 6 / 7 周期（单独列出）" : "第 " + e.p + " 周期";
    drawerWordId = null;
    drawerLexTerm = null;
    $("#drawer").innerHTML =
      '<div class="drawer-head"><div class="dh-main">' +
      '<div class="el-hero" style="--ec:' + e.color + '"><b>' + esc(e.sym) + "</b><span>" + esc(e.zh) + "</span></div>" +
      "<h2>" + esc(e.en) + "</h2>" +
      '<div class="ipa">' + esc(e.ipa) +
      ' <button class="btn btn-sm btn-quiet" data-act="speak" data-term="' + esc(e.en) + '" data-audio="" style="padding:1px 6px"><svg style="width:14px;height:14px"><use href="#i-sound"/></svg>朗读</button></div>' +
      '<div class="chips"><span class="chip" style="--dc:' + e.color + ";background:color-mix(in srgb," + e.color + " 12%,#fff);color:" + e.color + ";border-color:color-mix(in srgb," + e.color + " 30%,#fff)\">" + esc(e.catZh) + "</span>" +
      '<span class="chip">' + esc(PT.ranks[e.rank]) + "</span>" +
      '<span class="chip mono">' + esc(e.sym) + " · Z=" + e.z + "</span>" +
      (have ? '<span class="chip ok">已在生词本</span>' : "") + "</div>" +
      "</div><button class=\"icon-btn\" data-close aria-label=\"关闭\"><svg><use href=\"#i-close\"/></svg></button></div>" +
      '<div class="drawer-body">' +
      "<section><h4>Element · 元素</h4>" +
      '<div class="kv"><span>英文名</span><span>' + esc(e.en) + "</span></div>" +
      '<div class="kv"><span>音标</span><span>' + esc(e.ipa) + "</span></div>" +
      '<div class="kv"><span>中文名</span><span>' + esc(e.zh) + "</span></div>" +
      '<div class="kv"><span>符号 / 原子序数</span><span>' + esc(e.sym) + " / " + e.z + "</span></div>" +
      '<div class="kv"><span>相对原子质量</span><span>' + esc(e.mass) + "</span></div>" +
      '<div class="kv"><span>类别</span><span>' + esc(e.catZh) + " · " + esc((PT.CATS.filter(function (c) { return c.id === e.cat; })[0] || {}).en || "") + "</span></div>" +
      '<div class="kv"><span>周期 / 族</span><span>' + esc(periodTxt) + " · " + esc(groupTxt) + "</span></div>" +
      "</section>" +
      "<section><h4>Geology · 地质与工业</h4><p style=\"font-size:13.5px;line-height:1.8\">" + esc(e.note) + "</p></section>" +
      (e.words.length ? "<section><h4>Collocations · 常见搭配</h4><div class=\"roots\">" +
        e.words.map(function (w) { return '<span class="root"><b>' + esc(w.en) + "</b><span>" + esc(w.zh) + "</span></span>"; }).join("") +
        "</div></section>" : "") +
      "</div>" +
      '<div class="drawer-acts">' +
      (have ? '<button class="btn btn-sm btn-primary" data-act="el-word" data-id="' + have.id + '">打开我的词条</button>'
        : '<button class="btn btn-sm btn-primary" data-act="el-add" data-el="' + e.z + '"><svg style="width:15px;height:15px"><use href="#i-plus"/></svg>收录进生词本</button>') +
      '<button class="btn btn-sm btn-quiet" data-act="copy" data-text="' + esc(e.sym + " " + e.en + " " + e.ipa + " " + e.zh) + '">复制</button>' +
      "</div>";
    openDrawer();
  }

  function addElement(key) {
    const e = PT && PT.get(key);
    if (!e) return;
    const r = upsertWord(e.en, null);
    if (r.error) { toast(r.error); return; }
    const w = r.word;
    if (!w.ipa) w.ipa = e.ipa;
    w.element = { z: e.z, sym: e.sym, zh: e.zh, cat: e.cat };
    if (!w.defZh) w.defZh = "n. " + e.zh + "（" + e.sym + "，原子序数 " + e.z + "，" + e.catZh + "）";
    if (!w.defEn) w.defEn = "chemical element " + e.en + " (" + e.sym + "), atomic number " + e.z + ", atomic mass " + e.mass;
    if (!w.domain || w.domain === "academic") {
      w.domain = "geochem";
      w.scene = "method";
      w.clsConf = 0.5;
      w.clsReason = "元素周期表：" + e.catZh + " · " + e.sym;
    }
    if (!(w.collocations || []).length) w.collocations = e.words.map(function (x) { return x.en; }).slice(0, 3);
    w.updatedAt = nowISO();
    save();
    closeDrawer();
    render();
    openWord(w.id);
    toast("已收录 " + e.en + " · " + e.zh + " · 已带音标和释义", "good");
    enrichWord(w);
  }

  /* ======================================================================
     文献
     ====================================================================== */
  function viewSources() {
    const list = store.sources.slice().sort(function (a, b) { return String(b.addedAt).localeCompare(String(a.addedAt)); });
    const rows = list.map(function (s) {
      const n = store.words.filter(function (w) { return (w.contexts || []).some(function (c) { return c.sourceId === s.id; }); }).length;
      return '<div class="source"><div>' +
        '<h4><a href="#" data-act="src-open" data-id="' + s.id + '">' + esc(s.title) + "</a></h4>" +
        '<div class="meta"><span>' + esc(s.authors || "佚名") + "</span><span class=\"dotsep\">·</span><span>" + esc(s.year || "—") + "</span>" +
        (s.venue ? '<span class="dotsep">·</span><span>' + esc(s.venue) + "</span>" : "") +
        (s.doi ? '<span class="dotsep">·</span><span class="mono">' + esc(s.doi) + "</span>" : "") +
        (s.demo ? '<span class="dotsep">·</span><span class="chip gold">示例</span>' : "") + "</div>" +
        '<div class="links"><span class="chip">' + n + " 个词条</span>" +
        (s.itemKey ? '<a class="src-link" href="#" data-act="zotero" data-key="' + esc(s.itemKey) + '" data-demo="' + (s.demo ? "1" : "") + '"><svg style="width:12px;height:12px"><use href="#i-link"/></svg>Zotero 定位</a>' : '<span class="tiny muted">无 itemKey · 导入时可保留</span>') +
        (s.doi ? '<a class="src-link" href="https://doi.org/' + esc(s.doi) + '" target="_blank" rel="noopener">DOI ↗</a>' : "") +
        "</div></div>" +
        '<div class="acts"><button class="icon-btn" data-act="edit-source" data-id="' + s.id + '" title="编辑题录"><svg><use href="#i-edit"/></svg></button>' +
        '<button class="icon-btn" data-act="del-source" data-id="' + s.id + '" title="删除题录"><svg><use href="#i-trash"/></svg></button></div></div>';
    }).join("");

    return '<div class="sec-head" style="margin-top:16px"><h2>语境来源</h2>' +
      '<span class="sec-sub">' + store.sources.length + " 篇 · 只读你主动导出的题录</span><span class=\"sec-rule\"></span>" +
      '<button class="btn btn-sm btn-ghost" data-act="manual-source"><svg><use href="#i-plus"/></svg>手动添加</button></div>' +
      '<div class="drop" id="dropZone">' +
      '<svg class="ico"><use href="#i-sources"/></svg>' +
      "<h3>把你的 Zotero 文献放进来</h3>" +
      "<p>Zotero → 文件 → 导出文库 → 选 <b>CSL JSON</b>、<b>BibTeX</b> 或 <b>RIS</b>，把文件拖到这里。<br>不读取 Zotero 数据库，只解析你主动导出的文件。</p>" +
      '<div class="hero-actions" style="justify-content:center">' +
      '<button class="btn btn-primary" data-act="pick-import"><svg><use href="#i-upload"/></svg>选择文件</button>' +
      '<button class="btn btn-ghost" data-act="manual-source">手动填一条</button></div>' +
      '<div class="formats"><span class="chip">.csl.json</span><span class="chip">.bib</span><span class="chip">.ris</span></div>' +
      "</div>" +
      '<input type="file" id="importSources" accept=".json,.bib,.ris,.txt" hidden>' +
      '<div class="sec-head"><h2>题录</h2><span class="sec-sub">点击标题筛选关联词条</span><span class="sec-rule"></span></div>' +
      '<div class="panel">' + (rows || '<div class="empty"><svg class="glyph"><use href="#i-sources"/></svg><h3>还没有题录</h3><p>导入一篇你正在读的论文，收录词条时就能带上页码和原句。</p></div>') + "</div>" +
      '<p class="tiny muted" style="margin-top:10px;line-height:1.8">Zotero 回跳依赖题录里的 8 位 itemKey（形如 <span class="mono">K7F2M9QX</span>）。CSL JSON 导出通常带 <span class="mono">id</span> 字段，RIS 带 <span class="mono">ID</span>；若缺失，可在题录编辑里手动填。示例题录不可回跳。</p>';
  }

  /* ======================================================================
     设置
     ====================================================================== */
  function viewSettings() {
    const size = Math.round(JSON.stringify(store).length / 1024 * 10) / 10;
    return '<div class="sec-head" style="margin-top:16px"><h2>台面设置</h2><span class="sec-sub">所有数据只在本机浏览器</span><span class="sec-rule"></span></div>' +
      '<div class="settings">' +

      '<div class="panel"><div class="panel-head"><h3>取词助手</h3><span class="tiny muted">任意窗口 · 连按两次 Tab</span></div><div class="panel-body">' +
      '<div class="agent ' + (agentOnline ? "on" : "") + '" id="agentBox" style="margin-bottom:12px"><i class="lamp"></i><div class="txt">' +
      (agentOnline ? "<b>已连接</b> · 端口 " + store.settings.agentPort + "，正在监听键盘" : "<b>未连接</b> · 不装也能用，装了才能在 Zotero / 播放器里直接取词") + "</div></div>" +
      '<div class="form-row"><label>快捷键模式</label>' +
      '<select class="input" id="setHotkey">' +
      '<option value="doubleTab"' + (store.settings.hotkey === "doubleTab" ? " selected" : "") + ">连按两次 Tab（推荐，不干扰单 Tab 切换）</option>" +
      '<option value="ctrlTab"' + (store.settings.hotkey === "ctrlTab" ? " selected" : "") + ">Ctrl + Tab</option>" +
      '<option value="singleTab"' + (store.settings.hotkey === "singleTab" ? " selected" : "") + ">单次 Tab（会拦截系统 Tab，慎用）</option>" +
      "</select><div class=\"help\">助手会读取 <span class=\"mono\">tools/agent_config.json</span>。改完这里，还要把同样的值写进配置并重启助手。</div></div>" +
      '<div class="form-row"><label>桌面快捷方式</label><div class="help">双击 <span class="mono">创建桌面快捷方式.bat</span>，会在桌面生成「岩语 LithoWord」。之后双击图标即可：启动本机助手 → 打开网页 → 开始监听 Tab。</div>' +
      '<div class="hero-actions" style="margin-top:8px"><button class="btn btn-sm btn-ghost" data-act="agent-retry"><svg><use href="#i-link"/></svg>重新连接助手</button>' +
      '<button class="btn btn-sm btn-quiet" data-act="copy" data-text="python tools/desktop_agent.py">复制启动命令</button></div></div>' +
      "</div></div>" +

      '<div class="panel"><div class="panel-head"><h3>离线词典</h3><span class="tiny muted">ECDICT 英汉 · 77 万词条</span></div><div class="panel-body">' +
      '<div id="dictBox">' + dictPanelHTML() + "</div>" +
      '<div class="form-row" style="margin-top:10px"><label>有道联网词典</label>' +
      '<label class="switch"><input type="checkbox" id="setDictRemote"' + (store.settings.dictRemote !== false ? " checked" : "") +
      "><span>离线词典缺的东西（例句、真人发音、没收录的生僻词）再向有道查一次</span></label>" +
      '<div class="help">用的是有道公开词条接口，免费、不需要注册。查过的词会缓存在 <span class="mono">data/cache/online.sqlite</span>，第二次不再联网。断网时自动跳过。</div></div>' +
      '<div class="form-row" style="margin-top:10px"><label>最后的英文兜底</label>' +
      '<label class="switch"><input type="checkbox" id="setDictOnline"' + (store.settings.dictOnline !== false ? " checked" : "") +
      "><span>两个词典都没收录，再问一次 dictionaryapi.dev（只要英文释义）</span></label></div>" +
      '<div class="help">离线词典放在 <span class="mono">data/dict.sqlite</span>，查词不联网、~1 毫秒一个。收录新词时，音标与中文释义会自动填进去；已经有内容的字段不会被覆盖。</div>' +
      "</div></div>" +

      '<div class="panel"><div class="panel-head"><h3>复习节奏</h3><span class="tiny muted">间隔阶梯</span></div><div class="panel-body">' +
      '<div class="form-row"><label>每天最多到期卡</label><input class="input" type="number" min="4" max="60" id="setDue" value="' + store.settings.dailyDue + '">' +
      '<div class="help">默认 30 张。超出部分顺延到明天，不会一次堆成山。</div></div>' +
      '<div class="form-row"><label>每天随机抽查</label><input class="input" type="number" min="0" max="20" id="setExtra" value="' + store.settings.randomExtra + '">' +
      '<div class="help">从还没到期的词里抽几张，防止只记“刚好到期”的那批。</div></div>' +
      '<div class="form-row"><label>显示答案时自动朗读</label><label class="switch"><input type="checkbox" id="setSpeak"' + (store.settings.autoSpeak ? " checked" : "") + "><span>开启后，翻面会读一遍</span></label></div>" +
      '<div class="kv" style="margin-top:12px"><span>复习阶梯</span><span>' + LC.LADDER.join(" → ") + " 天</span></div>" +
      '<div class="help">点「记得」往右走一格，「很简单」走两格，「有点难」退一格；点「不会／忘记」直接回到 2 天后重来。' +
      "所以已掌握的词大概半个月到一个月才见一次，老忘的词两三天就回来一次。到 " + LC.MASTERED_DAYS + " 天以上就算「已掌握」。</div>" +
      "</div></div>" +

      '<div class="panel"><div class="panel-head"><h3>数据</h3><span class="tiny muted">' + store.words.length + " 词 · " + store.sources.length + " 题录 · " + size + " KB</span></div><div class=\"panel-body\">" +
      '<div class="hero-actions" style="margin:0 0 10px">' +
      '<button class="btn btn-sm btn-primary" data-act="export" data-kind="json"><svg><use href="#i-download"/></svg>备份 JSON</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="export" data-kind="csv"><svg><use href="#i-download"/></svg>CSV</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="export" data-kind="anki"><svg><use href="#i-download"/></svg>Anki 卡片</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="pick-import-data"><svg><use href="#i-upload"/></svg>恢复备份</button>' +
      "</div>" +
      '<input type="file" id="importData" accept=".json" hidden>' +
      '<div class="kv"><span>示例数据</span><span>' + (store.meta.demo ? "已载入（2 篇题录 + 8 词）" : "无") + "</span></div>" +
      '<div class="kv"><span>本地存储键</span><span>lithoword.v2</span></div>' +
      '<div class="hero-actions" style="margin-top:12px">' +
      '<button class="btn btn-sm btn-ghost" data-act="seed-demo">载入示例</button>' +
      '<button class="btn btn-sm btn-danger" data-act="clear-demo">清除示例</button>' +
      '<button class="btn btn-sm btn-quiet" data-act="clear-all">清空全部</button></div>' +
      "</div></div>" +

      '<div class="panel"><div class="panel-head"><h3>快捷键</h3></div><div class="panel-body">' +
      '<div class="kv"><span>任意窗口取词</span><span>Tab ×2</span></div>' +
      '<div class="kv"><span>应用内取词</span><span>Tab ×2 / C</span></div>' +
      '<div class="kv"><span>显示答案</span><span>Space</span></div>' +
      '<div class="kv"><span>评分</span><span>1 忘记 · 2 模糊 · 3 记得 · 4 很简单</span></div>' +
      '<div class="kv"><span>收起面板</span><span>Esc</span></div>' +
      '<div class="kv"><span>搜索生词本</span><span>/</span></div>' +
      '<p class="tiny muted" style="margin:12px 0 0;line-height:1.8">应用内连按 Tab 只在不输入文字时生效，单击 Tab 仍然是正常的焦点切换。</p>' +
      "</div></div>" +

      '<div class="panel"><div class="panel-head"><h3>关于</h3><span class="tiny muted">v2.0 · 无依赖</span></div><div class="panel-body">' +
      "<p class=\"tiny muted\" style=\"line-height:1.85;margin:0\">岩语 LithoWord 是一个地质学词汇工作台：词形还原、学科判定、词根分解、语境回链与 SM-2 每日复习。词库 " + L.entries.length + " 条，覆盖 13 个领域与 7 种使用场景；词库外的生词由本机 ECDICT 离线词典（77 万条）补音标与释义。生词本存在浏览器 localStorage，除离线词典要经过本机 127.0.0.1:8737 之外不联网。</p>" +
      '<p class="tiny muted" style="line-height:1.85;margin:8px 0 0">已知边界：词库外的词先查本机离线词典，词典也没有就留「音标待补」；词典释义反推学科只是低置信度启发式；文献回跳依赖 itemKey；示例题录不可回跳。</p>' +
      "</div></div>" +

      "</div>";
  }

  /* ======================================================================
     词条抽屉
     ====================================================================== */
  function rootsHTML(roots) {
    if (!roots) return '<p class="tiny muted">暂无词根分解，可点“编辑”补充。</p>';
    return '<div class="roots">' + splitRoots(roots).map(function (r) {
      return '<span class="root"><b>' + esc(r.root) + "</b>" + (r.meaning ? "<span>" + esc(r.meaning) + "</span>" : "") + "</span>";
    }).join("") + "</div>";
  }

  function contextHTML(w) {
    const list = (w.contexts || []).map(function (c) {
      const s = sourceOf(c.sourceId);
      return '<div class="quote-box" style="margin-bottom:8px">“' + markTerm(c.quote || "（未填写原句）", w.term) + '”' +
        '<span class="src">' + (s ? esc(shortTitle(s)) : "未关联文献") + (c.page ? " · p." + esc(c.page) : "") +
        (s && s.itemKey ? ' · <a href="#" data-act="zotero" data-key="' + esc(s.itemKey) + '" data-demo="' + (s.demo ? "1" : "") + '">在 Zotero 中定位</a>' : "") +
        "</span></div>";
    }).join("");
    return list || '<p class="tiny muted">还没记录原文语境。下次收录时把原句一起带上，复习可以一键回跳。</p>';
  }

  function openWord(id) {
    const w = store.words.find(function (x) { return x.id === id; });
    if (!w) { closeDrawer(); return; }
    drawerWordId = id;
    drawerLexTerm = null;
    const d = domainOf(w.domain);
    const due = dueInfo(w);
    $("#drawer").innerHTML =
      '<div class="drawer-head"><div class="dh-main">' +
      "<h2>" + esc(w.term) + "</h2>" +
      '<div class="ipa">' + (w.ipa ? esc(w.ipa) : "音标待补") +
      ' <button class="btn btn-sm btn-quiet" data-act="speak" data-term="' + esc(w.term) + '" data-audio="' + esc(w.audio || "") + '" style="padding:1px 6px"><svg style="width:14px;height:14px"><use href="#i-sound"/></svg>朗读</button></div>' +
      '<div class="chips">' + chip(w.domain) + sceneChip(w.scene) +
      (w.clsConf && w.clsConf < 0.9 ? '<span class="chip warn">判定置信 ' + Math.round(w.clsConf * 100) + "%</span>" : "") +
      (due.cls ? '<span class="chip ' + (due.cls === "overdue" ? "warn" : "") + '">' + due.text + "</span>" : "") + "</div>" +
      "</div><button class=\"icon-btn\" data-close aria-label=\"关闭\"><svg><use href=\"#i-close\"/></svg></button></div>" +
      '<div class="drawer-body">' +
      '<section><h4>Definition · 释义</h4><p style="font-size:14.5px;line-height:1.75">' + esc(w.defZh || "—") + "</p>" +
      (w.defEn ? '<p class="tiny muted" style="margin-top:5px;line-height:1.7">' + esc(w.defEn) + "</p>" : "") +
      (!w.defZh ? '<button class="btn btn-sm btn-ghost" style="margin-top:8px" data-act="dict-fill" data-id="' + w.id + '"><svg style="width:14px;height:14px"><use href="#i-download"/></svg>用离线词典补全</button>' : "") +
      "</section>" +
      (w.dict ? '<section><h4>Dictionary · 词典</h4>' +
        '<div class="kv"><span>词条</span><span>' + esc(w.dict.word || w.term) +
        (w.dict.matched && norm(w.dict.matched) !== norm(w.dict.word || w.term) ? "（按 " + esc(w.dict.matched) + " 命中）" : "") + "</span></div>" +
        (w.dict.tag ? '<div class="kv"><span>考试标签</span><span>' + esc(w.dict.tag) + "</span></div>" : "") +
        (w.dict.exchange ? '<div class="kv"><span>词形变化</span><span style="font-family:var(--mono);font-size:11px">' + esc(w.dict.exchange) + "</span></div>" : "") +
        (w.dict.frq ? '<div class="kv"><span>常用度</span><span>词频第 ' + w.dict.frq + " 位</span></div>" : "") +
        '<div class="kv"><span>来源</span><span>' + esc(w.dict.source || "ECDICT 离线词典") + "</span></div></section>" : "") +
      '<section><h4>Roots · 词根</h4>' + rootsHTML(w.roots) + "</section>" +
      '<section><h4>Example · 例句</h4>' + (w.exEn ? '<p class="example">' + markTerm(w.exEn, w.term) + (w.exZh ? '<span class="zh">' + esc(w.exZh) + "</span>" : "") + "</p>" : '<p class="tiny muted">暂无例句。</p>') + "</section>" +
      (w.collocations && w.collocations.length ? '<section><h4>Collocations · 搭配</h4><div class="roots">' +
        w.collocations.map(function (x) { return '<button class="root" data-act="copy" data-text="' + esc(x) + '"><b>' + esc(x) + "</b></button>"; }).join("") + "</div></section>" : "") +
      '<section><h4>Context · 语境与来源</h4>' + contextHTML(w) + "</section>" +
      (w.tip ? '<section><h4>Usage · 提示</h4><p class="tiny muted" style="line-height:1.75">' + esc(w.tip) + "</p></section>" : "") +
      ((w.variants || []).length ? '<section><h4>Forms · 已归并词形</h4><div class="roots">' + w.variants.map(function (v) { return '<span class="root"><b>' + esc(v) + "</b><span>已并入本词</span></span>"; }).join("") + "</div></section>" : "") +
      '<section><h4>Memory · 记忆状态</h4><div class="kv"><span>下次复习</span><span>' + fmtISO(w.srs.due) + "（" + due.text + "）</span></div>" +
      '<div class="kv"><span>下次间隔</span><span>' + (w.srs.interval || 0) + " 天（复习阶梯第 " +
        (LC.ladderStage(w.srs.interval) + 1) + " 档 / 共 " + LC.LADDER.length + " 档）</span></div>" +
      '<div class="kv"><span>复习 / 忘记</span><span>' + w.srs.reps + " 次 / " + w.srs.lapses + " 次</span></div>" +
      '<div class="kv"><span>难度标注</span><span>' + diffLabel(w) + "</span></div>" +
      '<div class="kv"><span>判定依据</span><span style="font-family:var(--sans);font-size:11px">' + esc(w.clsReason || "—") + "</span></div></section>" +
      "</div>" +
      '<div class="drawer-acts">' +
      '<button class="btn btn-sm btn-primary" data-act="review-word" data-id="' + w.id + '">复习这张</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="edit-word" data-id="' + w.id + '">编辑</button>' +
      '<button class="btn btn-sm btn-quiet" data-act="del-word" data-id="' + w.id + '">删除</button>' +
      "</div>";
    openDrawer();
  }

  function openLex(term) {
    const e = L.byTerm.get(norm(term));
    if (!e) return;
    drawerLexTerm = norm(term);
    drawerWordId = null;
    const d = domainOf(e.domain);
    const have = store.words.find(function (w) { return norm(w.term) === norm(e.term); });
    $("#drawer").innerHTML =
      '<div class="drawer-head"><div class="dh-main">' +
      "<h2>" + esc(e.term) + "</h2>" +
      '<div class="ipa">' + esc(e.ipa || "音标待补") + ' <button class="btn btn-sm btn-quiet" data-act="speak" data-term="' + esc(e.term) + '" data-audio="" style="padding:1px 6px"><svg style="width:14px;height:14px"><use href="#i-sound"/></svg>朗读</button></div>' +
      '<div class="chips"><span class="chip domain" style="--dc:' + d.color + '"><i class="dot"></i>' + esc(d.zh) + "</span>" + sceneChip(e.scene) +
      (have ? '<span class="chip ok">已在生词本</span>' : '<span class="chip">词库预览</span>') + "</div>" +
      "</div><button class=\"icon-btn\" data-close aria-label=\"关闭\"><svg><use href=\"#i-close\"/></svg></button></div>" +
      '<div class="drawer-body">' +
      '<section><h4>Definition · 释义</h4><p style="font-size:14.5px;line-height:1.75">' + esc(e.defZh) + "</p></section>" +
      '<section><h4>Roots · 词根</h4>' + rootsHTML(e.roots) + "</section>" +
      '<section><h4>Example · 例句</h4><p class="example">' + markTerm(e.exEn, e.term) + '<span class="zh">' + esc(e.exZh) + "</span></p></section>" +
      (e.collocations.length ? '<section><h4>Collocations · 搭配</h4><div class="roots">' + e.collocations.map(function (x) { return '<span class="root"><b>' + esc(x) + "</b></span>"; }).join("") + "</div></section>" : "") +
      (e.tip ? '<section><h4>Usage · 提示</h4><p class="tiny muted" style="line-height:1.75">' + esc(e.tip) + "</p></section>" : "") +
      "</div>" +
      '<div class="drawer-acts">' +
      (have ? '<button class="btn btn-sm btn-primary" data-act="open-word" data-id="' + have.id + '">打开我的词条</button>'
        : '<button class="btn btn-sm btn-primary" data-act="add-lex" data-term="' + esc(e.term) + '"><svg style="width:15px;height:15px"><use href="#i-plus"/></svg>收录进生词本</button>') +
      '<button class="btn btn-sm btn-quiet" data-act="copy" data-text="' + esc(e.term + " " + (e.ipa || "")) + '">复制</button>' +
      "</div>";
    openDrawer();
  }

  /* ======================================================================
     取词模态
     ====================================================================== */
  function capturePreviewHTML(raw) {
    const value = String(raw || "").trim();
    if (!value) return '<div class="pv-row tiny muted">输入后，这里会显示词形还原与学科判定。</div>';
    const lib = entryOf(value);
    const li = LC.lemma(value, { known: knownSet() });
    const cls = LC.classify(lib ? lib.term : li.lemma, { byTerm: L.byTerm, known: knownSet() });
    const d = domainOf(lib ? lib.domain : cls.domainId);
    const exists = store.words.find(function (w) {
      return norm(w.term) === norm(value) || norm(w.term) === norm(li.lemma);
    });
    let html = '<div class="pv-row"><span class="pv-k">词形</span><span class="mono">' + esc(value) + "</span>";
    if (li.changed) html += '<span class="arrow">→</span><span class="to">' + esc(li.lemma) + "</span>";
    html += '<span class="steps">' + esc(li.steps.join("；") || "保持原形") + "</span></div>";
    html += '<div class="pv-row"><span class="pv-k">学科</span><span class="chip domain" style="--dc:' + d.color + '"><i class="dot"></i>' + esc(d.zh) + "</span>" +
      '<span class="steps">' + esc(cls.reason) + "</span></div>";
    if (lib) {
      html += '<div class="pv-row"><span class="pv-k">词库</span><span class="steps">' + esc(lib.ipa) + " · " + esc(lib.defZh) + "</span></div>";
    } else {
      html += '<div class="pv-row"><span class="pv-k">词库</span><span class="steps">未收录，将从离线词典取音标与释义；仍查不到才按词根推断</span></div>';
    }
    if (exists) html += '<div class="pv-row"><span class="pv-k">提示</span><span class="chip warn">已在生词本 · 会合并语境</span></div>';
    return html;
  }

  /* 收录框里的离线词典实时预览 */
  function dictPreviewHTML(d, term) {
    if (!d) return '<div class="pv-row tiny muted">词典：取词助手未连接，暂时查不了（双击 启动.bat 可开启）</div>';
    if (!d.found) {
      return '<div class="pv-row"><span class="pv-k">词典</span><span class="tiny muted">离线词典和有道都没查到「' +
        esc(term) + "」，收录后可以手动补释义</span></div>";
    }
    const forms = String(d.exchange || "").split(/[\s/]+/).filter(Boolean).slice(0, 5)
      .map(function (x) { return x.replace(/^[0-9psdirt]:/, ""); });
    const ex = (d.examples || [])[0];
    return '<div class="pv-row"><span class="pv-k">音标</span><span class="mono">' +
      esc(d.phonetic ? " /" + String(d.phonetic).replace(/^\/|\/$/g, "") + "/ " : "—") +
      (d.tag ? ' <span class="chip">' + esc(d.tag.replace(/\s+/g, " · ")) + "</span>" : "") +
      (d.source ? ' <span class="chip">' + esc(d.source) + "</span>" : "") + "</span></div>" +
      '<div class="pv-row"><span class="pv-k">释义</span><span class="steps">' + esc(dictTransText(d) || "—") + "</span></div>" +
      (forms.length ? '<div class="pv-row"><span class="pv-k">词形</span><span class="steps">' + esc(forms.join(" / ")) + "</span></div>" : "") +
      (ex && ex.en ? '<div class="pv-row"><span class="pv-k">例句</span><span class="steps">' + esc(ex.en) +
        (ex.zh ? " · " + esc(ex.zh) : "") + "</span></div>" : "");
  }

  async function paintDictPreview(term) {
    paintDictPreview.seq = (paintDictPreview.seq || 0) + 1;
    const seq = paintDictPreview.seq;
    const box = $("#capDict");
    if (!box) return;
    const t = String(term || "").trim();
    if (!t) { box.innerHTML = '<div class="pv-row tiny muted">词典：输入单词后自动查音标、释义与例句</div>'; return; }
    box.innerHTML = '<div class="pv-row tiny muted">查词典中…</div>';
    let d = await dictLookup(t);
    if (seq !== paintDictPreview.seq) return;
    if (store.settings.dictRemote !== false && (!d || !d.found || !d.phonetic || !(d.trans || []).length)) {
      const od = await onlineLookup(t);
      if (seq !== paintDictPreview.seq) return;
      if (od && od.found) {
        d = {
          found: true,
          phonetic: (d && d.phonetic) || od.phonetic || "",
          trans: (d && (d.trans || []).length) ? d.trans : (od.trans || []),
          exchange: (d && d.exchange) || "",
          tag: (d && d.tag) || "",
          examples: od.examples || [],
          source: (d && d.found) ? "ECDICT + 有道" : "有道词典（联网）"
        };
      }
    }
    const live = $("#capDict");
    if (live) live.innerHTML = dictPreviewHTML(d, t);
  }

  function openCapture(prefill) {
    const p = prefill || {};
    const opts = store.sources.map(function (s) {
      return '<option value="' + s.id + '"' + (p.sourceId === s.id ? " selected" : "") + ">" + esc(shortTitle(s)) + "</option>";
    }).join("");
    openModal(
      '<div class="modal-head"><h2>收录一个词</h2><span class="chip gold" style="margin-left:auto">TAB ×2</span></div>' +
      '<p class="modal-sub">词形会被自动还原并归并；填上原句和页码，复习时可以回跳 Zotero 原文。</p>' +
      '<form id="capForm" autocomplete="off">' +
      '<div class="form-row"><label for="capTerm">单词或短语</label>' +
      '<input class="input" id="capTerm" name="term" placeholder="例如 studies / birefringence / cross-bedding" value="' + esc(p.term || "") + '" spellcheck="false" required></div>' +
      '<div class="preview" id="capPreview">' + capturePreviewHTML(p.term || "") + "</div>" +
      '<div class="preview" id="capDict"><div class="pv-row tiny muted">离线词典：输入单词后自动查音标与释义</div></div>' +
      '<div class="form-row"><label for="capSource">出处文献（可选）</label><select class="input" id="capSource" name="sourceId"><option value="">不关联</option>' + opts + "</select></div>" +
      '<div style="display:grid;grid-template-columns:110px 1fr;gap:10px">' +
      '<div class="form-row" style="border-bottom:0"><label for="capPage">页码</label><input class="input" id="capPage" name="page" placeholder="p. 12" value="' + esc(p.page || "") + '"></div>' +
      '<div class="form-row" style="border-bottom:0"><label for="capQuote">原文语境</label><textarea class="input" id="capQuote" name="quote" rows="2" placeholder="粘贴原句，复习时能看到它出现在哪">' + esc(p.quote || "") + "</textarea></div>" +
      "</div>" +
      '<div class="modal-acts"><button type="button" class="btn btn-ghost" data-close>取消</button>' +
      '<button type="submit" class="btn btn-primary"><svg><use href="#i-plus"/></svg>收录</button></div></form>'
    );
    const term = $("#capTerm");
    if (term) {
      term.focus();
      let tTimer = null;
      term.addEventListener("input", function () {
        const box = $("#capPreview");
        if (box) box.innerHTML = capturePreviewHTML(term.value);
        clearTimeout(tTimer);
        tTimer = setTimeout(function () { paintDictPreview(term.value); }, 260);
      });
      if (term.value.trim()) paintDictPreview(term.value);
    }
  }

  /* ======================================================================
     编辑 / 题录模态
     ====================================================================== */
  function openEditWord(id) {
    const w = store.words.find(function (x) { return x.id === id; });
    if (!w) return;
    openModal(
      '<div class="modal-head"><h2>编辑词条</h2></div>' +
      '<form id="editForm" data-id="' + w.id + '">' +
      '<div class="form-row"><label>词条</label><input class="input" name="term" value="' + esc(w.term) + '"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
      '<div class="form-row"><label>领域</label><select class="input" name="domain">' + L.domains.map(function (d) {
        return '<option value="' + d.id + '"' + (w.domain === d.id ? " selected" : "") + ">" + esc(d.zh) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="form-row"><label>使用场景</label><select class="input" name="scene">' + L.scenes.map(function (s) {
        return '<option value="' + s.id + '"' + (w.scene === s.id ? " selected" : "") + ">" + esc(s.zh) + "</option>";
      }).join("") + "</select></div></div>" +
      '<div class="form-row"><label>音标</label><input class="input" name="ipa" value="' + esc(w.ipa) + '" placeholder="/…/"></div>' +
      '<div class="form-row"><label>词根分解</label><input class="input" name="roots" value="' + esc(w.roots) + '" placeholder="photo(光) + synthesis(合成)"></div>' +
      '<div class="form-row"><label>中文释义</label><textarea class="input" name="defZh" rows="2">' + esc(w.defZh) + "</textarea></div>" +
      '<div class="form-row"><label>英文释义</label><textarea class="input" name="defEn" rows="2">' + esc(w.defEn) + "</textarea></div>" +
      '<div class="form-row"><label>例句（英）</label><textarea class="input" name="exEn" rows="2">' + esc(w.exEn) + "</textarea></div>" +
      '<div class="form-row"><label>例句翻译</label><input class="input" name="exZh" value="' + esc(w.exZh) + '"></div>' +
      '<div class="form-row"><label>搭配（用 | 分隔）</label><input class="input" name="collocations" value="' + esc((w.collocations || []).join(" | ")) + '"></div>' +
      '<div class="modal-acts"><button type="button" class="btn btn-ghost" data-close>取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
      "</form>"
    );
  }

  function openSourceForm(id) {
    const s = id ? sourceOf(id) : null;
    openModal(
      '<div class="modal-head"><h2>' + (s ? "编辑题录" : "手动添加题录") + "</h2></div>" +
      '<p class="modal-sub">itemKey 是 Zotero 里 8 位条目键，填了才能一键回跳原文。</p>' +
      '<form id="srcForm" data-id="' + (s ? s.id : "") + '">' +
      '<div class="form-row"><label>标题</label><input class="input" name="title" required value="' + esc(s ? s.title : "") + '"></div>' +
      '<div class="form-row"><label>作者（; 分隔）</label><input class="input" name="authors" value="' + esc(s ? s.authors : "") + '"></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
      '<div class="form-row"><label>年份</label><input class="input" name="year" value="' + esc(s ? s.year : "") + '"></div>' +
      '<div class="form-row"><label>期刊 / 出版物</label><input class="input" name="venue" value="' + esc(s ? s.venue : "") + '"></div></div>' +
      '<div class="form-row"><label>DOI</label><input class="input" name="doi" value="' + esc(s ? s.doi : "") + '"></div>' +
      '<div class="form-row"><label>Zotero itemKey（8 位）</label><input class="input" name="itemKey" maxlength="12" value="' + esc(s ? s.itemKey : "") + '" placeholder="K7F2M9QX"></div>' +
      '<div class="modal-acts"><button type="button" class="btn btn-ghost" data-close>取消</button><button type="submit" class="btn btn-primary">保存</button></div>' +
      "</form>"
    );
  }

  /* ======================================================================
     导出 / 导入
     ====================================================================== */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
  }

  function exportData(kind) {
    const stamp = TODAY.replace(/-/g, "");
    if (kind === "json") {
      download("lithoword-backup-" + stamp + ".json", JSON.stringify(store, null, 2), "application/json;charset=utf-8");
      toast("已导出完整备份", "good");
      return;
    }
    if (kind === "csv") {
      const head = ["term", "lemma", "ipa", "domain", "scene", "defZh", "roots", "exEn", "exZh", "collocations", "source", "page", "quote", "due", "interval", "reps", "lapses"];
      const rows = store.words.map(function (w) {
        const c = (w.contexts || [])[0] || {};
        const s = sourceOf(c.sourceId);
        return [w.term, w.lemma, w.ipa, domainOf(w.domain).zh, sceneOf(w.scene).zh, w.defZh, w.roots, w.exEn, w.exZh,
          (w.collocations || []).join(" | "), s ? s.title : "", c.page || "", c.quote || "", w.srs.due, w.srs.interval, w.srs.reps, w.srs.lapses];
      });
      const csv = [head].concat(rows).map(function (r) {
        return r.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(",");
      }).join("\r\n");
      download("lithoword-" + stamp + ".csv", "\ufeff" + csv, "text/csv;charset=utf-8");
      toast("已导出 CSV（可直接进 Excel）", "good");
      return;
    }
    if (kind === "anki") {
      const lines = store.words.map(function (w) {
        const c = (w.contexts || [])[0] || {};
        const s = sourceOf(c.sourceId);
        const front = w.term + (w.ipa ? "<br><span style=\"color:#1a6fd0\">" + w.ipa + "</span>" : "");
        const back = [
          w.defZh,
          w.roots ? "词根：" + w.roots : "",
          w.exEn ? w.exEn + (w.exZh ? "<br>" + w.exZh : "") : "",
          c.quote ? "原文：" + c.quote : "",
          s ? "出处：" + s.title : ""
        ].filter(Boolean).join("<br>");
        return front.replace(/\t/g, " ") + "\t" + back.replace(/\t/g, " ").replace(/\n/g, "<br>");
      }).join("\n");
      download("lithoword-anki-" + stamp + ".txt", lines, "text/plain;charset=utf-8");
      toast("已导出 Anki 制表符卡片", "good");
      return;
    }
  }

  function importSourcesFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      const text = String(reader.result || "");
      const res = LC.parseImport(text, file.name);
      if (!res.sources.length) {
        toast("没识别到题录。请确认是 CSL JSON / BibTeX / RIS 导出文件", "err");
        return;
      }
      let added = 0, merged = 0;
      res.sources.forEach(function (s) {
        const key = LC.sourceKey(s);
        const ex = store.sources.find(function (x) {
          return LC.sourceKey(x) === key || (s.itemKey && x.itemKey && s.itemKey === x.itemKey);
        });
        if (ex) {
          if (!ex.abstract && s.abstract) ex.abstract = s.abstract;
          if (!ex.doi && s.doi) ex.doi = s.doi;
          if (!ex.itemKey && s.itemKey) ex.itemKey = s.itemKey;
          merged++;
        } else {
          store.sources.push(Object.assign({ id: uid(), key: key, addedAt: nowISO() }, s));
          added++;
        }
      });
      save();
      render();
      toast("导入 " + added + " 条，合并 " + merged + " 条（" + res.format.toUpperCase() + "）", "good");
    };
    reader.readAsText(file, "utf-8");
  }

  function importDataFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(String(reader.result || "{}"));
        if (!data || !Array.isArray(data.words)) throw new Error("格式不对");
        let added = 0;
        data.words.forEach(function (w) {
          if (!w || !w.term) return;
          const ex = store.words.find(function (x) { return norm(x.term) === norm(w.term); });
          if (ex) {
            ex.contexts = ex.contexts || [];
            (w.contexts || []).forEach(function (c) { if (!ex.contexts.some(function (y) { return y.quote === c.quote && y.page === c.page; })) ex.contexts.push(c); });
            added++;
          } else {
            w.id = w.id || uid();
            w.srs = w.srs || LC.newSrs(TODAY);
            w.contexts = w.contexts || [];
            store.words.push(w);
            added++;
          }
        });
        (data.sources || []).forEach(function (s) {
          if (s && s.title && !store.sources.some(function (x) { return LC.sourceKey(x) === LC.sourceKey(s); })) {
            s.id = s.id || uid();
            store.sources.push(s);
          }
        });
        save();
        render();
        toast("备份已合并：" + added + " 个词条", "good");
      } catch (e) {
        toast("备份文件解析失败：" + e.message, "err");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  /* ======================================================================
     桌面助手
     ====================================================================== */
  function agentBase() { return "http://127.0.0.1:" + store.settings.agentPort; }

  function paintAgent() {
    const lamp = $("#agentLamp");
    if (lamp) {
      lamp.classList.toggle("on", agentOnline);
      lamp.classList.toggle("off", !agentOnline);
      lamp.innerHTML = agentOnline ? "ON<br>LINE" : "OFF<br>LINE";
      lamp.title = agentOnline ? "取词助手已连接" : "取词助手未连接";
    }
    const foot = $("#footAgent");
    if (foot) foot.textContent = agentOnline ? "AGENT ONLINE" : "AGENT OFFLINE";
    const box = $("#agentBox");
    if (box) {
      box.classList.toggle("on", agentOnline);
      const txt = box.querySelector(".txt");
      if (txt) txt.innerHTML = agentOnline
        ? "<b>已连接</b> · 端口 " + store.settings.agentPort + "，正在监听键盘"
        : "<b>未连接</b> · 不装也能用，装了才能在 Zotero / 播放器里直接取词";
    }
  }

  async function pingAgent(manual) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 2200);
    let ok = false;
    try {
      const res = await fetch(agentBase() + "/api/heartbeat?ts=" + Date.now(), ctrl ? { signal: ctrl.signal } : {});
      ok = res.ok;
      if (ok) {
        const data = await res.json().catch(function () { return {}; });
        if (data && data.hotkey && data.hotkey !== store.settings.hotkey) {
          /* 以助手实际配置为准，只提示，不偷偷改用户设置 */
        }
      }
    } catch (e) { ok = false; }
    clearTimeout(timer);
    const changed = ok !== agentOnline;
    agentOnline = ok;
    if (changed) paintAgent();
    if (manual) toast(ok ? "取词助手已连接" : "连不上助手：先双击 启动.bat，或确认端口 " + store.settings.agentPort, ok ? "good" : "warn");
    return ok;
  }

  async function pollInbox() {
    if (!agentOnline) return;
    try {
      const res = await fetch(agentBase() + "/api/inbox", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const items = (data && data.items) || [];
      items.forEach(function (it) {
        if (!it || (!it.text && !it.quote)) return;
        openCapture({ term: it.text || "", quote: it.quote || "", page: it.page || "", sourceId: it.sourceId || "" });
      });
    } catch (e) { /* 助手退出后下一轮心跳会置为离线 */ }
  }

  /* ======================================================================
     路由与渲染
     ====================================================================== */
  function parseRoute() {
    const raw = location.hash.replace(/^#\/?/, "") || "today";
    const qIndex = raw.indexOf("?");
    const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    const qs = qIndex >= 0 ? raw.slice(qIndex + 1) : "";
    const seg = path.split("/");
    return { name: seg[0] || "today", params: new URLSearchParams(qs) };
  }

  const TITLES = {
    today: ["FIELD NOTE · 薄片台", "今日工作台"],
    review: ["SESSION · 记忆载物台", "复习"],
    words: ["CATALOGUE · 标本册", "生词本"],
    library: ["REFERENCE · 词库", "词库与领域"],
    elements: ["PERIODIC TABLE · 元素", "元素周期表"],
    sources: ["PROVENANCE · 语境", "文献来源"],
    settings: ["SETTINGS · 台面", "设置"]
  };

  function paintChrome() {
    const t = TITLES[route.name] || TITLES.today;
    const eb = $("#tbEyebrow"), ti = $("#tbTitle");
    if (eb) eb.textContent = t[0];
    if (ti) ti.textContent = route.name === "words" ? "生词本 · " + store.words.length : t[1];
    $$("[data-nav]").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-nav") === route.name);
    });
    document.title = "岩语 · LithoWord — " + t[1];
    paintDueDot();
    paintAgent();
  }

  function paintDueDot() {
    const dot = $("#navDueDot");
    if (dot) dot.hidden = dueWords().length === 0;
  }

  function render() {
    const prevName = route.name;
    route = parseRoute();
    if (route.name !== "review") { session = null; sessionSig = ""; }

    if (route.name === "words") {
      const sig = location.hash;
      if (sig !== lastWordsSig) {
        lastWordsSig = sig;
        wordFilters = {
          q: "",
          status: "all",
          domain: route.params.get("domain") || "all",
          sort: "recent",
          source: route.params.get("source") || ""
        };
      }
    }

    if (route.name === "review") {
      const opts = {
        pack: route.params.get("pack") || "",
        domain: route.params.get("domain") || "",
        source: route.params.get("source") || "",
        mode: route.params.get("mode") || "daily",
        limit: Number(route.params.get("limit") || 4)
      };
      const sig = JSON.stringify(opts);
      if (!session || sessionSig !== sig) {
        session = makeSession(opts);
        sessionSig = sig;
      }
    }

    let html = "";
    if (route.name === "today") html = viewToday();
    else if (route.name === "review") html = viewReview();
    else if (route.name === "words") html = viewWords();
    else if (route.name === "library") html = viewLibrary();
    else if (route.name === "elements") html = viewElements();
    else if (route.name === "sources") html = viewSources();
    else if (route.name === "settings") html = viewSettings();
    else { location.hash = "#/today"; return; }

    const view = $("#view");
    view.innerHTML = html;
    view.classList.remove("view");
    void view.offsetWidth;
    view.classList.add("view");

    if (route.name === "words") updateWordRows();
    paintChrome();
    if (prevName !== route.name) window.scrollTo({ top: 0, behavior: "auto" });

    if (route.name === "sources") bindDropZone();
    if (route.name === "settings") {
      paintAgent();
      dictRefreshStatus(true).then(function (s) {
        paintDictPanel();
        if (dictBusy(s)) pollDictInstall();
      });
    }
  }

  /* ======================================================================
     事件
     ====================================================================== */
  function findWordByTerm(term) {
    return store.words.find(function (w) {
      return norm(w.term) === norm(term) || norm(w.lemma) === norm(lemmaOf(term));
    });
  }
  function lemmaOf(term) { return LC.lemma(term, { known: knownSet() }).lemma; }

  function handleAction(act, el) {
    switch (act) {
      case "open-word": openWord(el.getAttribute("data-id")); break;
      case "lex": openLex(el.getAttribute("data-term")); break;
      case "add-lex": {
        const r = upsertWord(el.getAttribute("data-term"), null);
        closeDrawer();
        render();
        openWord(r.word.id);
        toast("已收录 " + r.word.term, "good");
        break;
      }
      case "wcard": {
        const t = el.getAttribute("data-term");
        cardOpen[t] = !cardOpen[t];
        paintCards();
        break;
      }
      case "wcard-domain": {
        libDomain = el.getAttribute("data-domain");
        render();
        break;
      }
      case "wcard-diff": {
        setCardDiff(el.getAttribute("data-term"), Number(el.getAttribute("data-v")));
        break;
      }
      case "el-open": openElement(el.getAttribute("data-el")); break;
      case "el-cat": elCat = el.getAttribute("data-cat"); render(); break;
      case "el-rank": elRank = el.getAttribute("data-rank"); render(); break;
      case "el-clear": elQ = ""; render(); break;
      case "el-add": addElement(el.getAttribute("data-el")); break;
      case "el-word": closeDrawer(); openWord(el.getAttribute("data-id")); break;
      case "review-word": {
        const id = el.getAttribute("data-id");
        const w = store.words.find(function (x) { return x.id === id; });
        if (!w) break;
        session = { queue: [w], idx: 0, revealed: false, ratings: { 1: 0, 2: 0, 3: 0, 4: 0 }, startedAt: Date.now(), title: "单张复习", poolSize: 1, mode: "single" };
        sessionSig = "single";
        closeDrawer();
        location.hash = "#/review";
        render();
        break;
      }
      case "speak": {
        const term = el.getAttribute("data-term");
        const audio = el.getAttribute("data-audio");
        speak(term, audio);
        break;
      }
      case "rate": rate(Number(el.getAttribute("data-r"))); break;
      case "reveal": {
        if (session && !session.revealed) { session.revealed = true; render(); autoSpeak(); }
        break;
      }
      case "end-session": {
        session = null; sessionSig = "";
        location.hash = "#/today";
        break;
      }
      case "open-capture": openCapture(); break;
      case "edit-word": closeDrawer(); openEditWord(el.getAttribute("data-id")); break;
    case "dict-fill": {
      const wd = store.words.find(function (x) { return x.id === el.getAttribute("data-id"); });
      if (!wd) break;
      toast("正在查离线词典…");
      dictLookup(wd.term).then(function (d) {
        if (!d) { toast("取词助手没连上，先双击 启动.bat", "warn"); return; }
        if (!d.found) { toast("离线词典也没收录「" + wd.term + "」", "warn"); return; }
        applyDict(wd, d);
        wd.lookupState = "dict";
        save();
        openWord(wd.id);
        toast("已补全：" + ((d.trans || [])[0] || "音标与释义已写入"), "good");
      });
      break;
    }
    case "dict-install": {
      toast("开始下载离线词典，约 30 MB，完成后自动建索引…");
      dictRequest("/api/dict/build", 6000).then(function (r) {
        if (!r || r.error) { toast("启动失败：" + ((r && r.error) || "助手未连接"), "warn"); return; }
        pollDictInstall();
      }).catch(function () { toast("取词助手没连上，先双击 启动.bat", "warn"); });
      break;
    }
    case "dict-recheck": {
      dictRefreshStatus(true).then(function () { paintDictPanel(); });
      break;
    }
      case "del-word": {
        const id = el.getAttribute("data-id");
        const w = store.words.find(function (x) { return x.id === id; });
        if (!w) break;
        confirmDialog("删除词条？", "「" + esc(w.term) + "」及其语境会被移除，复习记录不再保留。", "删除", function () {
          store.words = store.words.filter(function (x) { return x.id !== id; });
          save();
          closeDrawer();
          render();
          toast("已删除 " + w.term);
        });
        break;
      }
      case "zotero": {
        const key = el.getAttribute("data-key");
        const demo = el.getAttribute("data-demo") === "1";
        const url = "zotero://select/library/items/" + encodeURIComponent(key);
        if (demo) {
          openModal('<div class="modal-head"><h2>示例题录不可回跳</h2></div>' +
            '<p class="modal-sub">这条是内置示例。导入你自己的 Zotero 题录（CSL JSON / RIS）后，同样的按钮会用 itemKey 打开：</p>' +
            '<p class="mono tiny" style="background:#f4faff;padding:10px;border-radius:8px;word-break:break-all">' + esc(url) + "</p>" +
            '<div class="modal-acts"><button class="btn btn-ghost" data-close>知道了</button></div>');
        } else {
          window.location.href = url;
          toast("正在唤起 Zotero…");
        }
        break;
      }
      case "copy": {
        const text = el.getAttribute("data-text") || "";
        copyText(text);
        break;
      }
      case "export": exportData(el.getAttribute("data-kind")); break;
      case "pack-review": {
        location.hash = "#/review?pack=" + encodeURIComponent(el.getAttribute("data-pack"));
        break;
      }
      case "pack-words": {
        const p = packById(el.getAttribute("data-pack"));
        if (p) {
          wordFilters = { q: "", status: "all", domain: "all", sort: "recent", source: "" };
          location.hash = "#/words";
          setTimeout(function () {
            wordFilters = { q: "", status: "all", domain: p.domain, sort: "recent", source: "" };
            const sel = $("#domainFilter");
            if (sel) sel.value = p.domain;
            updateWordRows();
            toast("已按「" + p.zh + "」所在领域筛选：" + domainOf(p.domain).zh);
          }, 30);
        }
        break;
      }
      case "domain-review": location.hash = "#/review?domain=" + el.getAttribute("data-domain"); break;
      case "src-open": {
        location.hash = "#/words?source=" + el.getAttribute("data-id");
        break;
      }
      case "clear-source-filter": {
        location.hash = "#/words";
        break;
      }
      case "manual-source": openSourceForm(""); break;
      case "edit-source": openSourceForm(el.getAttribute("data-id")); break;
      case "del-source": {
        const id = el.getAttribute("data-id");
        const s = sourceOf(id);
        if (!s) break;
        confirmDialog("删除题录？", "「" + esc(shortTitle(s)) + "」会被移除；已收录的词条保留，但会显示“来源已删除”。", "删除", function () {
          store.sources = store.sources.filter(function (x) { return x.id !== id; });
          save();
          render();
          toast("已删除题录");
        });
        break;
      }
      case "pick-import": {
        const input = $("#importSources");
        if (input) input.click();
        break;
      }
      case "pick-import-data": {
        const input = $("#importData");
        if (input) input.click();
        break;
      }
      case "seed-demo": {
        const seed = seedStore();
        const haveTerms = new Set(store.words.map(function (w) { return norm(w.term); }));
        seed.words.forEach(function (w) {
          if (!haveTerms.has(norm(w.term))) store.words.push(w);
        });
        seed.sources.forEach(function (s) {
          if (!store.sources.some(function (x) { return LC.sourceKey(x) === LC.sourceKey(s); })) store.sources.push(s);
        });
        seed.log.forEach(function (l) {
          if (!store.log.some(function (x) { return x.d === l.d && x.type === l.type; })) store.log.push(l);
        });
        store.meta.demo = true;
        save();
        render();
        toast("示例数据已载入", "good");
        break;
      }
      case "clear-demo": {
        confirmDialog("清除示例数据？", "只删除内置的 8 个示例词和 2 条示例题录，你自己收的词不受影响。", "清除", function () {
          store.words = store.words.filter(function (w) { return !w.demo; });
          store.sources = store.sources.filter(function (s) { return !s.demo; });
          store.log = store.log.filter(function (x) { return !x.demo; });
          store.meta.demo = false;
          save();
          render();
          toast("示例数据已清除");
        });
        break;
      }
      case "clear-all": {
        confirmDialog("清空全部数据？", "所有词条、题录、复习记录都会删除，且无法撤销。建议先导出 JSON 备份。", "全部清空", function () {
          store = defaults();
          store.meta.seeded = true;
          save();
          session = null;
          closeDrawer();
          render();
          toast("已清空，可以从词库重新开始");
        });
        break;
      }
      case "agent-retry": pingAgent(true); break;
      case "confirm-ok": {
        const fn = pendingConfirm;
        pendingConfirm = null;
        closeModal();
        if (fn) fn();
        break;
      }
      default: break;
    }
  }

  function copyText(text) {
    const done = function () { toast("已复制", "good"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { toast("复制失败", "err"); }
    ta.remove();
  }

  function tts(term) {
    if (!("speechSynthesis" in window)) { toast("这台机器没有可用的语音合成", "warn"); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(term);
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find(function (v) { return /en-GB|en-US|en_GB|en_US/.test(v.lang); });
    if (en) u.voice = en;
    u.lang = en ? en.lang : "en-US";
    u.rate = 0.88;
    window.speechSynthesis.speak(u);
  }
  function speak(term, audio) {
    if (!term) return;
    if (audio) {
      try {
        const a = new Audio(audio);
        a.play().catch(function () { tts(term); });
        return;
      } catch (e) { /* fall through */ }
    }
    tts(term);
  }

  function bindDropZone() {
    const zone = $("#dropZone");
    const input = $("#importSources");
    if (!zone) return;
    ["dragenter", "dragover"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("over"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove("over"); });
    });
    zone.addEventListener("drop", function (e) {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importSourcesFile(f);
    });
    if (input) input.addEventListener("change", function () {
      if (input.files && input.files[0]) importSourcesFile(input.files[0]);
      input.value = "";
    });
  }

  /* ======================================================================
     全局监听
     ====================================================================== */
  document.addEventListener("click", function (e) {
    const closer = e.target.closest("[data-close]");
    if (closer) { closeModal(); return; }
    const actEl = e.target.closest("[data-act]");
    if (actEl) {
      if (actEl.tagName === "A") e.preventDefault();
      handleAction(actEl.getAttribute("data-act"), actEl);
      return;
    }
    const tab = e.target.closest("[data-tab]");
    if (tab) { libTab = tab.getAttribute("data-tab"); render(); return; }
    const status = e.target.closest("[data-status]");
    if (status) {
      wordFilters.status = status.getAttribute("data-status");
      $$("#statusSeg button").forEach(function (b) { b.classList.toggle("on", b === status); });
      updateWordRows();
      return;
    }
  });

  $("#backdrop").addEventListener("click", function () {
    closeModal(); closeDrawer();
  });

  document.addEventListener("change", function (e) {
    const t = e.target;
    if (t.id === "domainFilter") { wordFilters.domain = t.value; updateWordRows(); }
    if (t.id === "sortFilter") { wordFilters.sort = t.value; updateWordRows(); }
    if (t.id === "importSources") { /* handled in bindDropZone */ }
    if (t.id === "importData" && t.files && t.files[0]) { importDataFile(t.files[0]); t.value = ""; }
    if (t.id === "setDue") {
      store.settings.dailyDue = Math.max(4, Math.min(60, Number(t.value) || 12));
      t.value = store.settings.dailyDue; save(); toast("每天到期上限：" + store.settings.dailyDue);
    }
    if (t.id === "setExtra") {
      store.settings.randomExtra = Math.max(0, Math.min(20, Number(t.value) || 0));
      t.value = store.settings.randomExtra; save(); toast("每日随机抽查：" + store.settings.randomExtra);
    }
    if (t.id === "setSpeak") { store.settings.autoSpeak = t.checked; save(); }
    if (t.id === "setHotkey") { store.settings.hotkey = t.value; save(); toast("已记录偏好；请同步修改 tools/agent_config.json 并重启助手", "warn"); }
    if (t.id === "setDictRemote") {
      store.settings.dictRemote = !!t.checked;
      save();
      toast(store.settings.dictRemote ? "已开启有道联网词典（补例句与发音）" : "已关闭联网词典，只用本地库");
    }
    if (t.id === "setDictOnline") {
      store.settings.dictOnline = !!t.checked;
      save();
      toast(store.settings.dictOnline ? "离线词典查不到时会再问在线词典" : "只查离线词典，完全不联网");
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target.id === "wordSearch") {
      wordFilters.q = e.target.value;
      updateWordRows();
    }
    if (e.target.id === "wcardQ") {
      libQ = e.target.value;
      paintCards();
    }
    if (e.target.id === "elQ") {
      const caret = e.target.selectionStart;
      elQ = e.target.value;
      render();
      const box = document.getElementById("elQ");
      if (box) { box.focus(); const p = Math.min(caret, box.value.length); box.setSelectionRange(p, p); }
    }
  });

  document.addEventListener("submit", async function (e) {
    const f = e.target;
    e.preventDefault();
    if (f.id === "capForm") {
      const term = f.term.value;
      const ctx = { sourceId: f.sourceId.value, page: f.page.value, quote: f.quote.value };
      const r = upsertWord(term, ctx);
      if (r.error) { toast("请先输入一个词", "warn"); return; }
      const dd = await dictLookup(r.word.term);
      const filled = dd && dd.found ? applyDict(r.word, dd) : false;
      if (dd && dd.found) { r.word.lookupState = "dict"; r.word.lookupAt = Date.now(); }
      maybeGlossClassify(r.word);
      save();
      closeModal();
      render();
      openWord(r.word.id);
      if (r.merged) {
        toast("已并入「" + r.word.term + "」" + (r.addedContext ? "，语境已附加" : "（这条语境已存在）"), "good");
      } else {
        const extra = r.lemmaInfo.changed ? "词形 " + term + " → " + r.lemmaInfo.lemma + "；" : "";
        toast(extra + "归入 " + domainOf(r.word.domain).zh + " · 置信 " + Math.round(r.word.clsConf * 100) + "%" +
          (filled ? " · 词典已补全释义" : ""), "good");
      }
      enrichWord(r.word);
      return;
    }
    if (f.id === "editForm") {
      const w = store.words.find(function (x) { return x.id === f.getAttribute("data-id"); });
      if (!w) return;
      const oldTerm = w.term;
      w.term = f.term.value.trim() || w.term;
      w.lemma = norm(w.term);
      w.domain = f.domain.value;
      w.scene = f.scene.value;
      w.ipa = f.ipa.value.trim();
      w.roots = f.roots.value.trim();
      w.defZh = f.defZh.value.trim();
      w.defEn = f.defEn.value.trim();
      w.exEn = f.exEn.value.trim();
      w.exZh = f.exZh.value.trim();
      w.collocations = f.collocations.value.split("|").map(function (x) { return x.trim(); }).filter(Boolean);
      w.updatedAt = nowISO();
      save(); closeModal();
      if (drawerWordId === w.id) openWord(w.id);
      render();
      toast(oldTerm !== w.term ? "已改名为 " + w.term : "已保存", "good");
      return;
    }
    if (f.id === "srcForm") {
      const id = f.getAttribute("data-id");
      const data = {
        title: f.title.value.trim(),
        authors: f.authors.value.trim(),
        year: f.year.value.trim(),
        venue: f.venue.value.trim(),
        doi: f.doi.value.trim(),
        itemKey: f.itemKey.value.trim().toUpperCase()
      };
      if (!data.title) { toast("标题不能为空", "warn"); return; }
      if (id) {
        const s = sourceOf(id);
        if (s) Object.assign(s, data, { key: LC.sourceKey(data) });
      } else {
        store.sources.push(Object.assign({ id: uid(), key: LC.sourceKey(data), addedAt: nowISO(), type: "manual", demo: false }, data));
      }
      save(); closeModal(); render();
      toast("题录已保存", "good");
      return;
    }
  });

  $("#quickForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const input = $("#quickInput");
    const val = input.value.trim();
    if (!val) { input.focus(); return; }
    const li = LC.lemma(val, { known: knownSet() });
    const existed = wordByTerm(val) || wordByTerm(li.lemma);
    input.value = "";
    if (existed) {
      render();
      openWord(existed.id);
      toast("「" + existed.term + "」已在生词本 · " + dueInfo(existed).text, "good");
      return;
    }
    const r = upsertWord(val, null);
    await enrichWord(r.word);
    render();
    openWord(r.word.id);
    if (r.merged) toast("已并入「" + r.word.term + "」", "good");
    else toast("已收录 " + r.word.term + " · " + domainOf(r.word.domain).zh +
      (r.word.defZh ? " · 释义已补全" : ""), "good");
  });

  $("#ctxBtn").addEventListener("click", function () { openCapture(); });

  document.addEventListener("keydown", function (e) {
    const el = document.activeElement;
    const typing = el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

    if (e.key === "Escape") {
      if ($("#modal").classList.contains("open")) { closeModal(); return; }
      if (drawerOpen) { closeDrawer(); return; }
      if (route.name === "review" && session) { location.hash = "#/today"; return; }
    }

    if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
      const qi = $("#quickInput");
      if (qi) { e.preventDefault(); qi.focus(); qi.select(); }
      return;
    }

    if (e.key === "Tab" && !typing) {
      if (agentOnline) return; // 助手在线时由它统一处理，避免一次按键弹出两层
      const now = Date.now();
      if (now - lastTabAt < 430) {
        e.preventDefault();
        lastTabAt = 0;
        openCapture();
        return;
      }
      lastTabAt = now;
      return;
    }

    if (typing) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && $("#wordSearch") === el) {
        el.blur();
      }
      return;
    }

    if (route.name === "review" && session && session.idx < session.queue.length) {
      if (e.code === "Space") {
        e.preventDefault();
        if (!session.revealed) { session.revealed = true; render(); autoSpeak(); }
        return;
      }
      if (/^[1-4]$/.test(e.key)) {
        if (session.revealed) { e.preventDefault(); rate(Number(e.key)); }
        else { e.preventDefault(); session.revealed = true; render(); autoSpeak(); }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (!session.revealed) { session.revealed = true; render(); autoSpeak(); }
        else rate(3);
        return;
      }
    }

    if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); openCapture(); }
    if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
      const s = $("#wordSearch");
      if (s) { e.preventDefault(); s.focus(); }
      else { location.hash = "#/words"; setTimeout(function () { const x = $("#wordSearch"); if (x) x.focus(); }, 120); }
    }
  });

  function autoSpeak() {
    if (!store.settings.autoSpeak) return;
    const w = session && session.queue[session.idx];
    if (w) speak(w.term, w.audio);
  }

  window.addEventListener("hashchange", function () { render(); });

  /* 首次从 URL 取词（助手 / 快捷方式） */
  (function bootParams() {
    const q = new URLSearchParams(location.search);
    const add = q.get("add");
    if (add) {
      setTimeout(function () {
        openCapture({ term: add, quote: q.get("quote") || "", page: q.get("page") || "" });
        const clean = location.pathname + (location.hash || "#/today");
        try { history.replaceState(null, "", clean); } catch (e) { /* file:// 下可能失败 */ }
      }, 260);
    }
  })();

  /* 助手心跳 + 收件箱 */
  let heartbeat = null;
  function startAgentLoop() {
    pingAgent(false);
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(function () {
      pingAgent(false);
    }, 6000);
    setInterval(pollInbox, 1600);
  }

  /* ======================================================================
     自检（?selftest=1）
     ====================================================================== */
  function runSelfTest() {
    const results = [];
    function ok(name, cond, detail) { results.push({ name: name, pass: !!cond, detail: detail || "" }); }
    try {
      ok("studies → study", LC.lemma("studies").lemma === "study");
      ok("strata → stratum", LC.lemma("strata").lemma === "stratum");
      ok("bedding 不被误还原", LC.lemma("bedding").changed === false);
      ok("mapped → map", LC.lemma("mapped").lemma === "map");
      ok("mineralizing → mineralize", LC.lemma("mineralizing").lemma === "mineralize", LC.lemma("mineralizing").lemma);
      ok("gneisses → gneiss", LC.lemma("gneisses").lemma === "gneiss", LC.lemma("gneisses").lemma);
      ok("mylonite 归类构造", LC.classify("mylonite", { byTerm: L.byTerm, known: knownSet() }).domainId === "struct");
      ok("未知词置信 0.25", LC.classify("unobtainium", { byTerm: L.byTerm, known: knownSet() }).confidence === 0.25);
      ok("首次记得 → 2 天后", LC.sm2(LC.newSrs(TODAY), 3, TODAY).interval === 2);
      ok("阶梯推进 4 → 7", LC.sm2({ interval: 4, stage: 2, reps: 3 }, 3, TODAY).interval === 7);
      ok("记得够久 → 15 天", LC.sm2({ interval: 7, stage: 3, reps: 4 }, 3, TODAY).interval === 15);
      ok("忘记 → 2 天后重来", LC.sm2({ interval: 30, stage: 5, reps: 6 }, 1, TODAY).interval === 2);
      ok("有点难退一档", LC.sm2({ interval: 15, stage: 4, reps: 5 }, 2, TODAY).interval === 7);
      ok("每日队列 ≤ 上限+抽查", LC.buildQueue(store.words, TODAY, { dueLimit: 30, randomExtra: 4 }).length <= 34);
      ok("词库条数 ≥ 140", L.entries.length >= 140, L.entries.length + " 条");
      ok("CSL 解析", LC.parseCSL('[{"id":"ABCD1234","title":"T","author":[{"family":"Li"}],"issued":{"date-parts":[[2020]]}}]').length === 1);
      ok("BibTeX 解析", LC.parseBibTeX("@article{k, title={A}, author={Li, X}, year={2021}}").length === 1);
      ok("RIS 解析", LC.parseRIS("TY  - JOUR\nTI  - Some title\nAU  - Li, X\nPY  - 2020\nER  - ").length === 1);
      ok("示例数据完整", store.words.length >= 8 && store.words.every(function (w) { return w.srs && w.srs.due; }));
      ok("每个词条都有领域", store.words.every(function (w) { return L.domains.some(function (d) { return d.id === w.domain; }); }));
      ok("DOM 已渲染", !!$("#view") && $("#view").children.length > 0);
      ok("连续天数", streakDays() >= 0, "TODAY=" + TODAY + " streak=" + streakDays() + " log=" + store.log.map(function (x) { return x.d + "/" + x.type + ":" + x.n; }).join(" "));
    } catch (e) {
      ok("运行异常", false, e.message);
    }
    const passed = results.filter(function (r) { return r.pass; }).length;
    $("#view").innerHTML = '<div class="sec-head"><h2>自检 SELFTEST</h2><span class="sec-sub">' + passed + " / " + results.length + " 通过</span></div>" +
      '<div class="panel"><table class="matrix"><thead><tr><th>项目</th><th>结果</th><th>详情</th></tr></thead><tbody>' +
      results.map(function (r) {
        return "<tr><td>" + esc(r.name) + '</td><td><span class="chip ' + (r.pass ? "ok" : "warn") + '">' + (r.pass ? "PASS" : "FAIL") + "</span></td><td class=\"tiny muted\">" + esc(r.detail) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="tiny muted" style="margin-top:12px">此页面仅用于开发核验，正常入口不带 ?selftest=1。</p>';
    window.__lithoSelftest = { passed: passed, total: results.length, results: results };
  }

  /* ======================================================================
     启动
     ====================================================================== */
  render();
  startAgentLoop();
  if (new URLSearchParams(location.search).get("selftest") === "1") runSelfTest();

  window.__litho = {
    get store() { return store; },
    dueWords: dueWords,
    seedStore: seedStore,
    render: render,
    LC: LC,
    L: L
  };
})();
