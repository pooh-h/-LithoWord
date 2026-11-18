/* 岩语 LithoWord · 纯逻辑内核（无 DOM 依赖，可在 Node 中测试）
 * 词形还原 / 学科分类 / SM-2 间隔重复 / 每日组卡 / Zotero 题录解析
 */
(function (root) {
  "use strict";

  /* ---------- 词形还原 ---------- */
  // 学科名词、分词形容词：保持原形，避免把 bedding 还原成 bed
  const PROTECTED = new Set([
    "bedding", "sorting", "weathering", "twinning", "mapping", "sampling", "logging",
    "mining", "drilling", "dating", "heating", "melting", "cooling", "folding", "faulting",
    "fracturing", "grading", "lamination", "foliation", "lineation", "cleavage", "facies",
    "species", "series", "lens", "stress", "mass", "gas", "analysis", "basis", "crisis",
    "physics", "geophysics", "mathematics", "means", "bedded", "folded", "faulted",
    "foliated", "mineralized", "weathered", "altered", "brecciated", "laminated", "graded",
    "sorted", "rounded", "cemented", "compacted", "deformed", "metamorphosed", "crystallized",
    "lithified", "oxidized", "reduced", "fractured", "sheared", "mylonitized", "mineralisation",
    "mineralization", "deformation", "metamorphism", "sedimentation", "crystallisation"
  ]);

  const IRREGULAR = {
    strata: "stratum", analyses: "analysis", axes: "axis", data: "datum",
    phenomena: "phenomenon", criteria: "criterion", phyla: "phylum", genera: "genus",
    larvae: "larva", formulae: "formula", nuclei: "nucleus", radii: "radius"
  };

  const PLURAL_MAP = {
    shelves: "shelf", wolves: "wolf", halves: "half", leaves: "leaf",
    lives: "life", knives: "knife", thieves: "thief"
  };

  const ING_MAP = {
    making: "make", taking: "take", using: "use", giving: "give", having: "have",
    moving: "move", mining: "mine", dating: "date", heating: "heat", melting: "melt",
    cooling: "cool", logging: "log", drilling: "drill", mapping: "map", sampling: "sample",
    folding: "fold", faulting: "fault", fracturing: "fracture", measuring: "measure",
    altering: "alter", occurring: "occur", beginning: "begin", running: "run",
    cutting: "cut", bedding: "bedding", sorting: "sorting", weathering: "weathering"
  };

  const ED_MAP = {
    based: "base", used: "use", caused: "cause", produced: "produce", included: "include",
    shown: "show", found: "find", left: "leave", made: "make", given: "give",
    taken: "take", known: "know", seen: "see", done: "do", studied: "study",
    applied: "apply", supplied: "supply", carried: "carry"
  };

  function lemma(input, opts) {
    const original = String(input == null ? "" : input).trim();
    const known = (opts && opts.known) || null;
    let w = original.toLowerCase().replace(/[’]/g, "'").replace(/^[^a-z'-]+|[^a-z'-]+$/g, "");
    const steps = [];
    if (!w) return { lemma: original.toLowerCase(), original: original, steps: steps, changed: false };
    if (known && known.has(w)) {
      return { lemma: w, original: original, steps: ["词库已有该词形，保持原样"], changed: false };
    }
    if (PROTECTED.has(w)) {
      return { lemma: w, original: original, steps: ["学科名词，保持原形"], changed: false };
    }

    if (/'s$/.test(w)) { w = w.slice(0, -2); steps.push("去所有格 -'s"); }
    if (IRREGULAR[w]) {
      const l = IRREGULAR[w];
      steps.push("不规则词形 " + w + " → " + l);
      return { lemma: l, original: original, steps: steps, changed: true };
    }

    let cur = w;
    if (PLURAL_MAP[cur]) {
      cur = PLURAL_MAP[cur]; steps.push("复数 " + w + " → " + cur);
    } else if (/(?:s|x|z|ch|sh)es$/.test(cur)) {
      cur = cur.slice(0, -2); steps.push("复数 -es：" + w + " → " + cur);
    } else if (/ies$/.test(cur) && cur.length > 4) {
      cur = cur.slice(0, -3) + "y"; steps.push("复数 -ies → -y：" + w + " → " + cur);
    } else if (/s$/.test(cur) && !/(?:ss|us|is)$/.test(cur) && cur.length > 3) {
      cur = cur.slice(0, -1); steps.push("复数 -s：" + w + " → " + cur);
    }
    if (cur !== w) return { lemma: cur, original: original, steps: steps, changed: true };

    if (/ing$/.test(w) && w.length > 5) {
      let stem = w.slice(0, -3);
      if (ING_MAP[w]) {
        steps.push("动词 -ing：" + w + " → " + ING_MAP[w]);
        return { lemma: ING_MAP[w], original: original, steps: steps, changed: true };
      }
      if (/([b-df-hj-np-tv-z])\1$/.test(stem)) {
        stem = stem.slice(0, -1); steps.push("去双写辅音 -ing：" + w + " → " + stem);
      } else if (/(?:iz|ur)$/.test(stem)) {
        stem += "e"; steps.push("补 -e：" + w + " → " + stem);
      } else if (/(?:at)$/.test(stem)) {
        stem += "e"; steps.push("补 -e：" + w + " → " + stem);
      } else {
        steps.push("动词 -ing：" + w + " → " + stem);
      }
      return { lemma: stem, original: original, steps: steps, changed: true };
    }

    if (/ed$/.test(w) && w.length > 4) {
      if (ED_MAP[w]) {
        steps.push("动词 -ed：" + w + " → " + ED_MAP[w]);
        return { lemma: ED_MAP[w], original: original, steps: steps, changed: true };
      }
      if (/ied$/.test(w)) {
        const l = w.slice(0, -3) + "y";
        steps.push("动词 -ied → -y：" + w + " → " + l);
        return { lemma: l, original: original, steps: steps, changed: true };
      }
      let stem = w.slice(0, -2);
      if (/([b-df-hj-np-tv-z])\1$/.test(stem)) {
        stem = stem.slice(0, -1); steps.push("去双写辅音 -ed：" + w + " → " + stem);
      } else if (/(?:at|iz|is|ur)$/.test(stem)) {
        stem += "e"; steps.push("补 -e：" + w + " → " + stem);
      } else {
        steps.push("动词 -ed：" + w + " → " + stem);
      }
      return { lemma: stem, original: original, steps: steps, changed: true };
    }

    return { lemma: w, original: original, steps: steps, changed: false };
  }

  /* ---------- 学科分类 ---------- */
  // 词根提示：只在词库未命中时兜底，置信度诚实标为 0.55
  const ROOT_HINTS = [
    { re: /geochem|isotop|isotope|redox|fractionat|chondrit/, domain: "geochem", label: "geochem/isotope(地球化学)" },
    { re: /seism|tomograph|epicent|hypocent|magnet|resistiv|gravit/, domain: "geophys", label: "seism/gravit(地球物理)" },
    { re: /biostrat|strat|stratum|conodont|trilobit|foraminif|fossil/, domain: "strat", label: "strat/fossil(地层古生物)" },
    { re: /lith|petro|magma|igneous|metamorph|schist|gneiss|basalt|granit|migmatit|porphy/, domain: "petro", label: "lith/petro(岩石学)" },
    { re: /hydro|aqua|aqui|groundwater|watershed/, domain: "hydro", label: "hydro/aqui(水文地质)" },
    { re: /therm|geothermal|kerogen|hydrocarbon|vitrinit/, domain: "energy", label: "therm/kerogen(能源地质)" },
    { re: /miner|crystal|cleav|feldspar|quartz|silicate|amphibol|pyroxen|olivin/, domain: "mineral", label: "miner/crystal(矿物学)" },
    { re: /clast|sediment|facies|turbid|bedding|ripple|diagen/, domain: "sed", label: "clast/facies(沉积学)" },
    { re: /(\bore\b|orebody|mineraliz|beneficiat|tailings|cut-off)/, domain: "econ", label: "ore/mineralization(矿床)" },
    { re: /fold|fault|thrust|shear|mylonit|orogen|tecton|anticlin|synclin/, domain: "struct", label: "fault/shear(构造)" },
    { re: /outcrop|mapping|traverse|clinometer|terrain|elevation/, domain: "field", label: "outcrop/traverse(野外)" },
    { re: /microscope|spectro|diffract|microprobe|calibrat|analys/, domain: "anal", label: "microprobe/XRD(分析)" }
  ];

  function classify(term, index) {
    const t = String(term || "").trim().toLowerCase();
    if (!t) return { domainId: "academic", confidence: 0, reason: "空词" };
    let hit = index && index.byTerm ? index.byTerm.get(t) : null;
    let via = "词库命中";
    if (!hit) {
      const L = lemma(t, { known: index ? index.known : null });
      if (L.changed && index && index.byTerm.get(L.lemma)) {
        hit = index.byTerm.get(L.lemma);
        via = "词形还原 " + t + " → " + L.lemma;
      }
    }
    if (hit) {
      return { domainId: hit.domain, confidence: 0.96, reason: via + "：" + hit.term };
    }
    const hints = ROOT_HINTS.filter(function (h) { return h.re.test(t); });
    if (hints.length) {
      return {
        domainId: hints[0].domain,
        confidence: 0.55,
        reason: "词根推断：" + hints.slice(0, 2).map(function (h) { return h.label; }).join("、")
      };
    }
    return {
      domainId: "academic",
      confidence: 0.25,
      reason: "未命中地质词库，暂按通用学术处理，可手动归类"
    };
  }

  /* ---------- 日期 ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function todayISO(d) {
    const dt = d || new Date();
    return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
  }
  function addDays(iso, n) {
    const p = String(iso).split("-").map(Number);
    const dt = new Date(p[0], p[1] - 1, p[2] + n);
    return todayISO(dt);
  }
  function daysBetween(a, b) {
    const A = new Date(String(a) + "T00:00:00");
    const B = new Date(String(b) + "T00:00:00");
    return Math.round((B - A) / 86400000);
  }

  /* ---------- 复习排期 ----------
     用一条写死的间隔阶梯代替 SM-2 的 ease 连乘：
       1 → 2 → 4 → 7 → 15 → 30 → 60 天
     · 记得      → 升一档
     · 很简单    → 升两档
     · 有点难    → 退一档
     · 不会/忘记 → 直接回到 2 天后重来
     这样「下次几天后」永远能用人话解释，不会出现 47 天这种数。
  */
  const LADDER = [1, 2, 4, 7, 15, 30, 60];
  const MASTERED_DAYS = 15;

  function ladderStage(interval) {
    const n = Math.max(0, Number(interval) || 0);
    for (let i = 0; i < LADDER.length; i++) if (LADDER[i] >= n) return i;
    return LADDER.length - 1;
  }

  function newSrs(today) {
    return { ease: 2.5, interval: 0, reps: 0, lapses: 0, stage: 0, hard: 0, due: today || todayISO(), last: null };
  }

  function sm2(srs, rating, today) {
    const s = Object.assign(newSrs(today), srs || {});
    const r = Math.max(1, Math.min(4, Number(rating) || 3));
    if (s.stage == null) s.stage = ladderStage(s.interval);
    if (s.hard == null) s.hard = 0;

    if (r === 1) {
      s.lapses += 1;
      s.hard += 1;
      s.stage = 0;
      s.interval = 2;
      s.reps = 0;
    } else {
      let step = 1;
      if (r === 2) { step = -1; s.hard += 1; }
      if (r === 4) step = 2;
      s.stage = Math.max(0, Math.min(LADDER.length - 1, s.stage + step));
      s.interval = LADDER[s.stage];
      s.reps += 1;
      if (step > 0) s.hard = Math.max(0, s.hard - 1);
    }
    s.ease = r === 1 ? Math.max(1.3, s.ease - 0.2) : (r === 4 ? Math.min(3.2, s.ease + 0.1) : s.ease);
    s.due = addDays(today, s.interval);
    s.last = today;
    return s;
  }

  function previewIntervals(srs, today) {
    const out = {};
    [1, 2, 3, 4].forEach(function (r) { out[r] = sm2(srs, r, today).interval; });
    return out;
  }

  function buildQueue(words, today, opts) {
    const o = opts || {};
    const dueLimit = o.dueLimit == null ? 30 : o.dueLimit;
    const randomExtra = o.randomExtra == null ? 4 : o.randomExtra;
    const rng = o.rng || Math.random;
    const due = words.filter(function (w) { return w.srs && w.srs.due && w.srs.due <= today; })
      .sort(function (a, b) {
        if (a.srs.due !== b.srs.due) return a.srs.due < b.srs.due ? -1 : 1;
        return String(a.addedAt || "").localeCompare(String(b.addedAt || ""));
      });
    const picked = due.slice(0, dueLimit);
    const ids = new Set(picked.map(function (w) { return w.id; }));
    const pool = words.filter(function (w) {
      if (ids.has(w.id)) return false;
      return !(w.srs && w.srs.due && w.srs.due <= today);
    });
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }
    return picked.concat(shuffled.slice(0, randomExtra));
  }

  function streak(log, today) {
    const dates = new Set((log || []).map(function (x) { return x.d; }).filter(Boolean));
    if (!dates.size) return 0;
    let cursor = dates.has(today) ? today : addDays(today, -1);
    if (!dates.has(cursor)) return 0;
    let n = 0;
    while (dates.has(cursor)) { n += 1; cursor = addDays(cursor, -1); }
    return n;
  }

  /* ---------- Zotero 题录解析 ---------- */
  function pickYear(v) {
    const m = String(v || "").match(/(1[5-9]\d\d|20\d\d|21\d\d)/);
    return m ? m[1] : "";
  }

  function parseCSL(text) {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : (data.items || []);
    return arr.map(function (it) {
      const authors = (it.author || it.editor || []).map(function (a) {
        if (a.family) return a.family + (a.given ? ", " + a.given : "");
        return a.literal || a.name || "";
      }).filter(Boolean).join("; ");
      const issued = it.issued && it.issued["date-parts"] && it.issued["date-parts"][0];
      const id = it.id == null ? "" : String(it.id);
      return {
        itemKey: /^[A-Z0-9]{8}$/.test(id) ? id : "",
        citationKey: id,
        title: it.title || "",
        authors: authors,
        year: issued && issued[0] ? String(issued[0]) : "",
        venue: it["container-title"] || it.publisher || "",
        doi: it.DOI || "",
        type: it.type || "",
        abstract: it.abstract || ""
      };
    }).filter(function (s) { return s.title; });
  }

  function parseBibTeX(text) {
    const out = [];
    const chunks = String(text).split(/@(?=\w+\s*[{(])/).slice(1);
    chunks.forEach(function (chunk) {
      const head = chunk.match(/^(\w+)\s*[{(]\s*([^,\s]+)\s*,/);
      if (!head) return;
      const type = head[1].toLowerCase();
      const key = head[2];
      const fields = {};
      const re = /(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,\n]+)/g;
      let m;
      while ((m = re.exec(chunk))) {
        let v = m[2].trim();
        if (v.charAt(0) === "{" && v.charAt(v.length - 1) === "}") v = v.slice(1, -1);
        if (v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') v = v.slice(1, -1);
        fields[m[1].toLowerCase()] = v.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
      }
      const authors = (fields.author || "").split(/\s+and\s+/).filter(Boolean).join("; ");
      out.push({
        itemKey: "",
        citationKey: key,
        title: fields.title || "",
        authors: authors,
        year: pickYear(fields.year || fields.date),
        venue: fields.journal || fields.booktitle || fields.publisher || "",
        doi: fields.doi || "",
        type: type,
        abstract: fields.abstract || ""
      });
    });
    return out.filter(function (s) { return s.title; });
  }

  function parseRIS(text) {
    const out = [];
    const records = String(text).split(/^ER\s*-?\s*$/m);
    records.forEach(function (rec) {
      const f = {};
      rec.split(/\r?\n/).forEach(function (line) {
        const m = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
        if (!m) return;
        const k = m[1], v = m[2].trim();
        if (k === "AU" || k === "A1") (f.au = f.au || []).push(v);
        else if (k === "TI" || k === "T1") f.title = v;
        else if (k === "PY" || k === "Y1") f.year = v;
        else if (k === "JO" || k === "JF" || k === "T2") f.venue = v;
        else if (k === "DO") f.doi = v;
        else if (k === "ID") f.id = v;
        else if (k === "TY") f.type = v;
        else if (k === "AB") f.abstract = v;
      });
      if (!f.title) return;
      out.push({
        itemKey: f.id && /^[A-Z0-9]{8}$/.test(f.id) ? f.id : "",
        citationKey: f.id || "",
        title: f.title,
        authors: (f.au || []).join("; "),
        year: pickYear(f.year),
        venue: f.venue || "",
        doi: f.doi || "",
        type: (f.type || "").toLowerCase(),
        abstract: f.abstract || ""
      });
    });
    return out;
  }

  function parseImport(text, filename) {
    const name = String(filename || "").toLowerCase();
    const t = String(text || "").trim();
    if (name.endsWith(".bib") || t.startsWith("@")) return { format: "bibtex", sources: parseBibTeX(t) };
    if (name.endsWith(".ris") || /^TY\s{2}-/m.test(t)) return { format: "ris", sources: parseRIS(t) };
    if (name.endsWith(".json") || t.charAt(0) === "[" || t.charAt(0) === "{") {
      if (/^\s*[{[]/.test(t)) {
        try { return { format: "csl", sources: parseCSL(t) }; } catch (e) { /* fall through */ }
      }
    }
    if (t.startsWith("@")) return { format: "bibtex", sources: parseBibTeX(t) };
    return { format: "unknown", sources: [] };
  }

  function sourceKey(s) {
    if (s.doi) return "doi:" + String(s.doi).toLowerCase();
    if (s.itemKey) return "key:" + s.itemKey;
    return "title:" + String(s.title || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ").trim();
  }

  /* ---------- 用词典中文释义反推学科 ----------
     只给词库里没有、且词根也没命中的词兜底用：置信度低于词库命中，
     用户可以在抽屉里手动改。命中顺序即优先级。 */
  const GLOSS_HINTS = [
    { domain: "struct", conf: 0.55, label: "构造变形", re: /构造|断层|褶皱|剪切|劈理|线理|变形|节理|韧性|脆性|应变|滑动|推覆|走滑|香肠/ },
    { domain: "strat", conf: 0.52, label: "地层古生物", re: /地层|化石|年代|不整合|古生|中生|新生代|寒武|奥陶|志留|泥盆|石炭|二叠|三叠|侏罗|白垩|孢粉|古生物/ },
    { domain: "petro", conf: 0.52, label: "岩石", re: /岩|岩浆|火山|变质|玄武|花岗|辉长|闪长|片麻|角闪|斑状/ },
    { domain: "mineral", conf: 0.52, label: "矿物", re: /矿物|晶体|晶系|解理|硬度|光泽|石英|长石|云母|方解石|橄榄石|辉石|矿石/ },
    { domain: "geochem", conf: 0.50, label: "地球化学", re: /同位素|元素|稀土|痕量|丰度|比值|分馏|蚀变|地球化学/ },
    { domain: "geophys", conf: 0.50, label: "地球物理", re: /地震|磁|重力|波速|地电|测井|震源|地壳|地幔|地核/ },
    { domain: "sed", conf: 0.50, label: "沉积盆地", re: /沉积|盆地|砂岩|泥岩|页岩|碳酸盐|碎屑|粒度|磨圆|交错层/ },
    { domain: "hydro", conf: 0.48, label: "水文环境", re: /地下水|含水层|渗流|孔隙水|污染|水系|径流|土壤/ },
    { domain: "energy", conf: 0.48, label: "能源", re: /石油|天然气|煤\b|油气|储层|烃源|页岩气/ },
    { domain: "econ", conf: 0.48, label: "矿床", re: /矿床|成矿|矿石|品位|脉状|热液|矿体/ }
  ];

  function classifyGloss(gloss) {
    const g = String(gloss || "");
    if (!g) return null;
    const txt = g.replace(/^[a-z.／\/,，;；\s]+/i, "");
    for (let i = 0; i < GLOSS_HINTS.length; i++) {
      const h = GLOSS_HINTS[i];
      if (h.re.test(txt)) {
        return { domainId: h.domain, confidence: h.conf, reason: "词典释义推断（" + h.label + "）：" + txt.slice(0, 26) };
      }
    }
    return null;
  }

  const api = {
    lemma: lemma,
    classify: classify,
    classifyGloss: classifyGloss,
    todayISO: todayISO,
    addDays: addDays,
    daysBetween: daysBetween,
    newSrs: newSrs,
    sm2: sm2,
    LADDER: LADDER,
    MASTERED_DAYS: MASTERED_DAYS,
    ladderStage: ladderStage,
    previewIntervals: previewIntervals,
    buildQueue: buildQueue,
    streak: streak,
    parseCSL: parseCSL,
    parseBibTeX: parseBibTeX,
    parseRIS: parseRIS,
    parseImport: parseImport,
    sourceKey: sourceKey,
    PROTECTED: PROTECTED
  };

  root.LithoCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
