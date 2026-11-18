/* 岩语 LithoWord · 内核与词库完整性测试
 * 运行：node tests/core.test.js
 */
"use strict";

global.window = global;
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
require(path.join(root, "assets/lexicon.js"));
require(path.join(root, "assets/data-mineral.js"));
require(path.join(root, "assets/data-struct.js"));
require(path.join(root, "assets/data-resource.js"));
require(path.join(root, "assets/data-surface.js"));
const Core = require(path.join(root, "assets/core.js"));
const L = global.LITHO;

let pass = 0, fail = 0;
const failures = [];
function ok(name, fn) {
  try { fn(); pass++; console.log("  PASS  " + name); }
  catch (e) { fail++; failures.push(name + " :: " + e.message); console.log("  FAIL  " + name + " — " + e.message); }
}

console.log("\n— 词库完整性 —");
ok("词库条数 ≥ 140", () => assert.ok(L.entries.length >= 140, "只有 " + L.entries.length));
ok("13 个领域", () => assert.strictEqual(L.domains.length, 13));
ok("7 种场景", () => assert.strictEqual(L.scenes.length, 7));
ok("10 个词包", () => assert.strictEqual(L.packs.length, 10));
ok("16 个缩写", () => assert.strictEqual(L.abbr.length, 16));
ok("没有重复词条", () => {
  const seen = new Set();
  L.entries.forEach((e) => {
    assert.ok(!seen.has(e.term), "重复：" + e.term);
    seen.add(e.term);
  });
});
ok("所有领域 id 合法", () => {
  const ids = new Set(L.domains.map((d) => d.id));
  L.entries.forEach((e) => assert.ok(ids.has(e.domain), e.term + " 的领域非法：" + e.domain));
});
ok("所有场景 id 合法", () => {
  const ids = new Set(L.scenes.map((s) => s.id));
  L.entries.forEach((e) => assert.ok(ids.has(e.scene), e.term + " 的场景非法：" + e.scene));
});
ok("每条都有音标/词根/释义/例句", () => {
  L.entries.forEach((e) => {
    ["ipa", "roots", "defZh", "exEn", "exZh"].forEach((k) => {
      assert.ok(String(e[k] || "").trim().length > 0, e.term + " 缺 " + k);
    });
  });
});
ok("每个词包至少 8 个词", () => L.packs.forEach((p) => assert.ok(p.terms.length >= 8, p.id)));
ok("词包里的词都能在词库找到", () => {
  L.packs.forEach((p) => {
    p.terms.forEach((t) => assert.ok(L.byTerm.get(t.toLowerCase()), p.id + " 找不到：" + t));
  });
});
ok("每条至少 2 个搭配", () => {
  L.entries.forEach((e) => assert.ok(e.collocations.length >= 2, e.term + " 搭配不足"));
});
ok("例句里出现该词（或屈折形）", () => {
  L.entries.forEach((e) => {
    const low = e.exEn.toLowerCase();
    const stem = e.term.toLowerCase().replace(/(?:e|y)$/, "");
    assert.ok(low.includes(e.term.toLowerCase()) || low.includes(stem), e.term + " 例句不含该词：" + e.exEn);
  });
});

console.log("\n— 词形还原 —");
const lemma = (w) => Core.lemma(w).lemma;
ok("studies → study", () => assert.strictEqual(lemma("studies"), "study"));
ok("deposits → deposit", () => assert.strictEqual(lemma("deposits"), "deposit"));
ok("gneisses → gneiss", () => assert.strictEqual(lemma("gneisses"), "gneiss"));
ok("mapped → map", () => assert.strictEqual(lemma("mapped"), "map"));
ok("running → run", () => assert.strictEqual(lemma("running"), "run"));
ok("mineralizing → mineralize", () => assert.strictEqual(lemma("mineralizing"), "mineralize"));
ok("strata → stratum", () => assert.strictEqual(lemma("strata"), "stratum"));
ok("analyses → analysis", () => assert.strictEqual(lemma("analyses"), "analysis"));
ok("bedding 保持原形", () => assert.strictEqual(lemma("bedding"), "bedding"));
ok("facies 保持原形", () => assert.strictEqual(lemma("facies"), "facies"));
ok("shear zone 保持空格", () => assert.strictEqual(lemma("shear zones"), "shear zone"));
ok("" + "已收录词形不再还原", () => {
  const r = Core.lemma("cleavage", { known: new Set(["cleavage"]) });
  assert.strictEqual(r.changed, false);
});
ok("步骤可读", () => assert.ok(Core.lemma("studies").steps.length > 0));

console.log("\n— 学科分类 —");
const idx = { byTerm: L.byTerm, known: new Set(L.byTerm.keys()) };
ok("mylonite → 构造", () => assert.strictEqual(Core.classify("mylonite", idx).domainId, "struct"));
ok("kerogen → 能源", () => assert.strictEqual(Core.classify("kerogen", idx).domainId, "energy"));
ok("seismic → 地球物理", () => assert.strictEqual(Core.classify("seismic", idx).domainId, "geophys"));
ok("gneiss 词形还原后命中岩石学", () => assert.strictEqual(Core.classify("gneisses", idx).domainId, "petro"));
ok("未知词按通用学术 0.25", () => {
  const r = Core.classify("florblex", idx);
  assert.strictEqual(r.confidence, 0.25);
  assert.strictEqual(r.domainId, "academic");
});
ok("词根推断置信 0.55", () => {
  const r = Core.classify("seismogenic", idx);
  assert.strictEqual(r.confidence, 0.55);
  assert.strictEqual(r.domainId, "geophys");
});

console.log("\n— 间隔阶梯 —");
const today = "2026-11-17";
ok("新词点「记得」→ 2 天", () => assert.strictEqual(Core.sm2(Core.newSrs(today), 3, today).interval, 2));
ok("再点「记得」→ 4 天", () => assert.strictEqual(Core.sm2({ stage: 1, interval: 2 }, 3, today).interval, 4));
ok("「很简单」一次走两格 → 7 天", () => assert.strictEqual(Core.sm2({ stage: 1, interval: 2 }, 4, today).interval, 7));
ok("「有点难」退一格", () => assert.strictEqual(Core.sm2({ stage: 3, interval: 7 }, 2, today).interval, 4));
ok("「忘记」回到 2 天后重来", () => {
  const s = Core.sm2({ stage: 4, interval: 15, reps: 4, hard: 0 }, 1, today);
  assert.strictEqual(s.stage, 0);
  assert.strictEqual(s.interval, 2);
  assert.strictEqual(s.due, "2026-11-19");
  assert.strictEqual(s.lapses, 1);
});
ok("阶梯封顶 60 天", () => {
  let s = Core.newSrs(today);
  for (let i = 0; i < 20; i++) s = Core.sm2(s, 3, today);
  assert.strictEqual(s.interval, 60);
});
ok("ladderStage 反查档位", () => {
  assert.strictEqual(Core.ladderStage(0), 0);
  assert.strictEqual(Core.ladderStage(7), 3);
  assert.strictEqual(Core.ladderStage(16), 5);
});
ok("已掌握阈值 15 天", () => assert.strictEqual(Core.MASTERED_DAYS, 15));
ok("下次到期日正确", () => assert.strictEqual(Core.sm2(Core.newSrs(today), 3, today).due, "2026-11-19"));
ok("日期加减", () => assert.strictEqual(Core.addDays("2026-11-17", 5), "2026-11-22"));

console.log("\n— 每日组卡 —");
function w(id, due, reps) { return { id: id, addedAt: "2026-11-01", srs: { due: due, reps: reps || 0 } }; }
ok("到期优先且不超过上限", () => {
  const words = [w("a", "2026-11-10"), w("b", "2026-11-16"), w("c", "2026-11-17"), w("d", "2026-12-01"), w("e", "2026-12-02")];
  const q = Core.buildQueue(words, today, { dueLimit: 2, randomExtra: 1, rng: () => 0.5 });
  assert.strictEqual(q.length, 3);
  assert.deepStrictEqual(q.slice(0, 2).map((x) => x.id), ["a", "b"]);
});
ok("没有到期也会抽随机卡", () => {
  const q = Core.buildQueue([w("x", "2026-12-01"), w("y", "2026-12-02")], today, { dueLimit: 12, randomExtra: 2 });
  assert.strictEqual(q.length, 2);
});
ok("空列表返回空", () => assert.strictEqual(Core.buildQueue([], today).length, 0));

console.log("\n— 连续天数 —");
ok("连续 3 天", () => {
  const log = [{ d: "2026-11-17" }, { d: "2026-11-16" }, { d: "2026-11-15" }, { d: "2026-11-13" }];
  assert.strictEqual(Core.streak(log, today), 3);
});
ok("今天没复习但从昨天连续", () => {
  const log = [{ d: "2026-11-16" }, { d: "2026-11-15" }];
  assert.strictEqual(Core.streak(log, today), 2);
});

console.log("\n— Zotero 题录 —");
ok("CSL JSON 解析作者/年份/DOI", () => {
  const s = Core.parseCSL(JSON.stringify([{
    id: "ABCD1234", type: "article-journal", title: "A title",
    author: [{ family: "Lee", given: "J." }, { family: "Kim", given: "Y." }],
    issued: { "date-parts": [[2021, 5]] }, "container-title": "Geology", DOI: "10.1000/x"
  }]))[0];
  assert.strictEqual(s.itemKey, "ABCD1234");
  assert.strictEqual(s.authors, "Lee, J.; Kim, Y.");
  assert.strictEqual(s.year, "2021");
  assert.strictEqual(s.venue, "Geology");
  assert.strictEqual(s.doi, "10.1000/x");
});
ok("BibTeX 解析", () => {
  const s = Core.parseBibTeX("@article{lee2021,\n title={Basin provenance},\n author={Lee, J. and Kim, Y.},\n journal={Sedimentary Geology},\n year={2021},\n doi={10.1016/x}\n}")[0];
  assert.strictEqual(s.citationKey, "lee2021");
  assert.strictEqual(s.title, "Basin provenance");
  assert.strictEqual(s.year, "2021");
  assert.ok(s.authors.includes("Lee"));
});
ok("RIS 解析", () => {
  const s = Core.parseRIS("TY  - JOUR\nTI  - Some title\nAU  - Li, X\nAU  - Wang, Y\nPY  - 2020\nJO  - Ore Geology Reviews\nDO  - 10.1/y\nER  - ") [0];
  assert.strictEqual(s.title, "Some title");
  assert.strictEqual(s.authors, "Li, X; Wang, Y");
  assert.strictEqual(s.year, "2020");
});
ok("按扩展名自动识别", () => {
  assert.strictEqual(Core.parseImport("@article{a, title={T}}", "lib.bib").format, "bibtex");
  assert.strictEqual(Core.parseImport("TY  - JOUR\nTI  - T\nER  - ", "lib.ris").format, "ris");
  assert.strictEqual(Core.parseImport('[{"title":"T"}]', "lib.json").format, "csl");
});
ok("sourceKey 优先 DOI", () => {
  assert.strictEqual(Core.sourceKey({ doi: "10.1/X", title: "A" }), "doi:10.1/x");
  assert.ok(Core.sourceKey({ title: "A title" }).startsWith("title:a title"));
});

console.log("\n— 结果 —");
console.log("通过 " + pass + " 项，失败 " + fail + " 项");
if (fail) {
  failures.forEach((f) => console.log("  ! " + f));
  process.exit(1);
}
