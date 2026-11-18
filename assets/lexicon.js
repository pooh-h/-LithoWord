/* 岩语 LithoWord · 词库骨架
 * 领域 / 使用场景 / 高频词表 / 缩写表 / 词条容器
 */
window.LITHO = (function () {
  const domains = [
    { id: "mineral", zh: "矿物学", en: "Mineralogy", icon: "crystal", color: "#2f6fd0",
      blurb: "晶形、解理、光性——薄片台上最先要叫出名字的东西。" },
    { id: "petro", zh: "岩石学", en: "Petrology", icon: "layers", color: "#2a7fa8",
      blurb: "岩浆、变质、结构、组构：把岩石放回它的形成过程。" },
    { id: "struct", zh: "构造地质学", en: "Structural Geology", icon: "folds", color: "#3f6fbf",
      blurb: "褶皱、断层、面理线理，读图与野外记录的主力词汇。" },
    { id: "strat", zh: "地层与古生物", en: "Stratigraphy & Palaeontology", icon: "strata", color: "#2c82c9",
      blurb: "时间与化石：给岩石排顺序、定年代。" },
    { id: "geochem", zh: "地球化学", en: "Geochemistry", icon: "atom", color: "#0e8aa8",
      blurb: "元素与同位素，把“看起来像”变成“测出来是”。" },
    { id: "econ", zh: "矿床与经济地质", en: "Economic Geology", icon: "cube", color: "#235f96",
      blurb: "矿体、品位、储量：从露头到资源量。" },
    { id: "geophys", zh: "地球物理", en: "Geophysics", icon: "wave", color: "#4a6fd4",
      blurb: "地震波、重力、磁法，给地球做透视。" },
    { id: "hydro", zh: "水文与环境地质", en: "Hydrogeology & Environment", icon: "droplet", color: "#1b83b5",
      blurb: "水在岩石里怎么走，污染物又怎么跟着走。" },
    { id: "sed", zh: "沉积与盆地", en: "Sedimentology & Basins", icon: "dune", color: "#3b82b0",
      blurb: "层理、粒度、相：读沉积岩里的环境档案。" },
    { id: "field", zh: "野外与制图", en: "Field Geology & Mapping", icon: "compass", color: "#2d7099",
      blurb: "罗盘、露头、路线、剖面——野外记录的标准表达。" },
    { id: "anal", zh: "分析与实验", en: "Analytical Methods", icon: "microscope", color: "#0a7f95",
      blurb: "薄片、探针、衍射：方法章节里的高频词。" },
    { id: "energy", zh: "能源地质", en: "Energy Geology", icon: "flame", color: "#1f6f8f",
      blurb: "烃源岩、储层、圈闭，以及地热与页岩气。" },
    { id: "academic", zh: "通用学术", en: "General & Academic", icon: "pen", color: "#5b7da8",
      blurb: "论文里反复出现、却总被跳过的那些词。" }
  ];

  const scenes = [
    { id: "thin", zh: "镜下描述", en: "Thin section", hint: "薄片鉴定、光性描述、矿物组合" },
    { id: "field", zh: "野外记录", en: "Field notes", hint: "露头、产状、路线、采样记录" },
    { id: "plate", zh: "图版与图注", en: "Figures", hint: "图版说明、比例尺、剖面图注" },
    { id: "method", zh: "方法与仪器", en: "Methods", hint: "样品制备、测试条件、数据分析" },
    { id: "genesis", zh: "成因与讨论", en: "Genesis", hint: "成因机制、来源、演化过程" },
    { id: "resource", zh: "资源评价", en: "Resource", hint: "品位、储量、选冶、经济性" },
    { id: "lecture", zh: "课堂与综述", en: "Lecture", hint: "教材、综述、课堂讲义" }
  ];

  const packs = [
    { id: "thin-section", zh: "薄片鉴定速成", en: "Thin-section essentials", domain: "mineral",
      blurb: "第一次独立看薄片，先把这 10 个词叫顺。",
      terms: ["cleavage", "twinning", "pleochroism", "extinction", "birefringence", "relief", "inclusion", "alteration", "thin section", "polarized light"] },
    { id: "igneous", zh: "岩浆岩描述", en: "Igneous petrography", domain: "petro",
      blurb: "从斑晶到基质，描述一段岩浆岩薄片。",
      terms: ["igneous", "magma", "phenocryst", "groundmass", "porphyritic", "crystallization", "differentiation", "basalt", "granite", "texture"] },
    { id: "metamorphic", zh: "变质与变形", en: "Metamorphism & deformation", domain: "petro",
      blurb: "面理、片理、糜棱岩——变质岩描述的核心骨架。",
      terms: ["foliation", "schistosity", "gneiss", "migmatite", "mylonite", "shear zone", "orogeny", "paragenesis"] },
    { id: "structure", zh: "构造读图", en: "Reading structures", domain: "struct",
      blurb: "看剖面图、读构造纲要时绕不开的词。",
      terms: ["anticline", "syncline", "fault", "thrust", "strike-slip", "dip", "strike", "unconformity", "cross-section", "attitude"] },
    { id: "stratigraphy", zh: "地层与年代", en: "Stratigraphy & time", domain: "strat",
      blurb: "给一套地层定名、定年、对比。",
      terms: ["stratigraphy", "stratum", "formation", "biostratigraphy", "index fossil", "conodont", "trilobite", "foraminifera", "Paleozoic", "Cenozoic"] },
    { id: "geochem", zh: "地球化学示踪", en: "Geochemical tracing", domain: "geochem",
      blurb: "图解、标准化、异常：读懂地球化学结果。",
      terms: ["isotope", "trace element", "rare earth element", "fractionation", "chondrite", "anomaly", "provenance", "weathering", "redox", "hydrothermal"] },
    { id: "ore", zh: "矿床评价", en: "Ore deposit evaluation", domain: "econ",
      blurb: "从矿化到储量，汇报一个矿床需要的词。",
      terms: ["orebody", "grade", "reserve", "cut-off grade", "porphyry", "epithermal", "skarn", "beneficiation", "tailings", "overburden"] },
    { id: "water-energy", zh: "水工环与能源", en: "Water & energy", domain: "hydro",
      blurb: "含水层与油气储层共享的一套物性词汇。",
      terms: ["aquifer", "porosity", "permeability", "recharge", "subsidence", "reservoir", "source rock", "kerogen", "cap rock", "trap"] },
    { id: "fieldwork", zh: "野外填图", en: "Field mapping", domain: "field",
      blurb: "出野外第一天就该会的表达。",
      terms: ["outcrop", "attitude", "traverse", "clinometer", "sampling", "mapping", "elevation", "terrain"] },
    { id: "academic", zh: "论文高频", en: "Academic verbs", domain: "academic",
      blurb: "摘要和讨论里出现频率极高的一组词。",
      terms: ["ubiquitous", "plausible", "constrain", "corroborate", "consistent", "predominant", "systematic", "negligible"] }
  ];

  const abbr = [
    ["XRD", "X-ray diffraction", "X 射线衍射"],
    ["XRF", "X-ray fluorescence", "X 射线荧光光谱"],
    ["EPMA", "electron probe microanalysis", "电子探针微区分析"],
    ["SEM", "scanning electron microscope", "扫描电子显微镜"],
    ["BSE", "backscattered electron", "背散射电子"],
    ["CL", "cathodoluminescence", "阴极发光"],
    ["LA-ICP-MS", "laser ablation inductively coupled plasma mass spectrometry", "激光剥蚀电感耦合等离子体质谱"],
    ["REE", "rare earth elements", "稀土元素"],
    ["PGE", "platinum-group elements", "铂族元素"],
    ["VMS", "volcanogenic massive sulfide", "火山成因块状硫化物"],
    ["SEDEX", "sedimentary exhalative", "喷流沉积型"],
    ["TOC", "total organic carbon", "总有机碳"],
    ["LOI", "loss on ignition", "烧失量"],
    ["Ma", "mega-annum (10⁶ years)", "百万年"],
    ["DEM", "digital elevation model", "数字高程模型"],
    ["UTM", "Universal Transverse Mercator", "通用横轴墨卡托投影"]
  ];

  const entries = [];
  const byTerm = new Map();

  function add(rows) {
    rows.forEach(function (r) {
      if (!r || r.length < 8) return;
      const e = {
        term: r[0],
        domain: r[1],
        scene: r[2],
        ipa: r[3] || "",
        roots: r[4] || "",
        defZh: r[5] || "",
        exEn: r[6] || "",
        exZh: r[7] || "",
        collocations: (r[8] || "").split("|").map(function (s) { return s.trim(); }).filter(Boolean),
        tip: r[9] || "",
        lemma: r[0].toLowerCase()
      };
      entries.push(e);
      byTerm.set(e.lemma, e);
    });
  }

  return { domains: domains, scenes: scenes, packs: packs, abbr: abbr, entries: entries, byTerm: byTerm, add: add };
})();
