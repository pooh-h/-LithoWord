/* 岩语 LithoWord · 元素周期表数据
 * 118 个元素：符号 / 英文名 / 中文名 / 音标 / 原子量 / 周期表坐标 / 类别 / 地质·工业相关性 / 常见英文搭配
 * 字段顺序：z|sym|en|zh|ipa|mass|g|p|cat|note|words
 * g = 18 列布局中的列号；镧系与锕系的 p 记为 9 / 10，单独两行。
 */
window.PTABLE = (function () {
  "use strict";

  var CATS = [
    { id: "alkali", zh: "碱金属", en: "Alkali metal", color: "#e0635a" },
    { id: "alkaline", zh: "碱土金属", en: "Alkaline earth", color: "#e08a3c" },
    { id: "transition", zh: "过渡金属", en: "Transition metal", color: "#c9a227" },
    { id: "post", zh: "后过渡金属", en: "Post-transition", color: "#5f9e56" },
    { id: "metalloid", zh: "类金属", en: "Metalloid", color: "#3f9a8c" },
    { id: "nonmetal", zh: "非金属", en: "Nonmetal", color: "#3d7fc4" },
    { id: "halogen", zh: "卤素", en: "Halogen", color: "#6a62c8" },
    { id: "noble", zh: "稀有气体", en: "Noble gas", color: "#8a63b8" },
    { id: "lanthanide", zh: "镧系", en: "Lanthanide", color: "#b1649c" },
    { id: "actinide", zh: "锕系", en: "Actinide", color: "#a04f6c" },
    { id: "unknown", zh: "性质未知", en: "Unknown", color: "#7c8794" }
  ];

  var RAW = [
    "1|H|hydrogen|氢|/ˈhaɪdrədʒən/|1.008|1|1|nonmetal|宇宙中最丰富的元素；地质上以水、烃类、OH 基矿物形式存在|hydrogen bond 氢键;hydrogen sulfide 硫化氢",
    "2|He|helium|氦|/ˈhiːliəm/|4.0026|18|1|noble|惰性气体；用于同位素定年（U-Th/He 低温热年代学）|helium dating 氦定年;helium leak test 氦检漏",
    "3|Li|lithium|锂|/ˈlɪθiəm/|6.94|1|2|alkali|新能源关键金属；花岗伟晶岩与盐湖卤水是主要来源|lithium brine 锂卤水;lithium pegmatite 锂伟晶岩",
    "4|Be|beryllium|铍|/bəˈrɪliəm/|9.0122|2|2|alkaline|稀有轻金属；绿柱石中产出，用于 X 射线窗口与合金|beryl 绿柱石;beryllium alloy 铍合金",
    "5|B|boron|硼|/ˈbɔːrɒn/|10.81|13|2|metalloid|硼酸盐矿物与蒸发岩；硼同位素可示踪古海水|borate 硼酸盐;boron isotope 硼同位素",
    "6|C|carbon|碳|/ˈkɑːbən/|12.011|14|2|nonmetal|金刚石与石墨的同素异形体；有机质与碳酸盐的核心|carbonate 碳酸盐;organic carbon 有机碳",
    "7|N|nitrogen|氮|/ˈnaɪtrədʒən/|14.007|15|2|nonmetal|大气主要成分；硝酸盐与氮同位素用于物源示踪|nitrate 硝酸盐;nitrogen isotope 氮同位素",
    "8|O|oxygen|氧|/ˈɒksɪdʒən/|15.999|16|2|nonmetal|地壳中最丰富的元素；氧化物构成绝大多数造岩矿物|oxide 氧化物;silicate 硅酸盐",
    "9|F|fluorine|氟|/ˈflʊəriːn/|18.998|17|2|halogen|最活泼的非金属；萤石是其主要矿物|fluorite 萤石;fluorapatite 氟磷灰石",
    "10|Ne|neon|氖|/ˈniːɒn/|20.180|18|2|noble|惰性气体；氖同位素可示踪地幔脱气|neon isotope 氖同位素;noble gas 稀有气体",
    "11|Na|sodium|钠|/ˈsəʊdiəm/|22.990|1|3|alkali|海水与蒸发岩的主量元素；钠长石是常见造岩矿物|sodium chloride 氯化钠;albite 钠长石",
    "12|Mg|magnesium|镁|/mæɡˈniːziəm/|24.305|2|3|alkaline|镁铁质矿物的关键元素；菱镁矿是耐火材料原料|magnesite 菱镁矿;mafic 镁铁质",
    "13|Al|aluminium|铝|/ˌæljəˈmɪniəm/|26.982|13|3|post|地壳含量最高的金属元素；铝土矿经风化富集|bauxite 铝土矿;gibbsite 三水铝石",
    "14|Si|silicon|硅|/ˈsɪlɪkən/|28.085|14|3|metalloid|硅酸盐骨架元素，地壳第二大含量；半导体原材料|silica 二氧化硅;silicate 硅酸盐",
    "15|P|phosphorus|磷|/ˈfɒsfərəs/|30.974|15|3|nonmetal|磷灰石是主要载体；磷块岩是重要沉积矿产|apatite 磷灰石;phosphate 磷酸盐",
    "16|S|sulfur|硫|/ˈsʌlfə/|32.06|16|3|nonmetal|硫化物矿床与火山喷气；硫酸盐是蒸发岩组分|sulfide 硫化物;sulfate 硫酸盐",
    "17|Cl|chlorine|氯|/ˈklɔːriːn/|35.45|17|3|halogen|卤水与蒸发岩；氯同位素用于示踪流体来源|chloride 氯化物;halite 石盐",
    "18|Ar|argon|氩|/ˈɑːɡɒn/|39.948|18|3|noble|大气中含量最高的稀有气体；Ar-Ar 定年的基础|argon dating 氩定年;radiogenic argon 放射成因氩",
    "19|K|potassium|钾|/pəˈtæsiəm/|39.098|1|4|alkali|钾长石与云母的主要成分；K-Ar 定年常用|potash feldspar 钾长石;K-Ar dating 钾氩定年",
    "20|Ca|calcium|钙|/ˈkælsiəm/|40.078|2|4|alkaline|碳酸盐岩与石膏的核心元素；方解石、文石|calcite 方解石;calcium carbonate 碳酸钙",
    "21|Sc|scandium|钪|/ˈskændiəm/|44.956|3|4|transition|分散元素；常富集于辉石与角闪石中|scandium alloy 钪合金;trace element 微量元素",
    "22|Ti|titanium|钛|/tɪˈteɪniəm/|47.867|4|4|transition|钛铁矿与金红石；重矿物组合的常见成员|rutile 金红石;ilmenite 钛铁矿",
    "23|V|vanadium|钒|/vəˈneɪdiəm/|50.942|5|4|transition|钒云母等含钒矿物；可指示氧化还原条件|vanadium mica 钒云母;redox 氧化还原",
    "24|Cr|chromium|铬|/ˈkrəʊmiəm/|51.996|6|4|transition|铬铁矿是唯一工业矿物；蛇绿岩中常见|chromite 铬铁矿;chromium spinel 铬尖晶石",
    "25|Mn|manganese|锰|/ˈmæŋɡəniːz/|54.938|7|4|transition|锰氧化物是海洋结核的主要成分；菱锰矿|pyrolusite 软锰矿;manganese nodule 锰结核",
    "26|Fe|iron|铁|/ˈaɪən/|55.845|8|4|transition|地核主要成分；铁氧化物与硫化物控制成矿|hematite 赤铁矿;magnetite 磁铁矿",
    "27|Co|cobalt|钴|/ˈkəʊbɔːlt/|58.933|9|4|transition|钴硫化物常与铜镍矿共生；电池关键金属|cobaltite 辉钴矿;cobalt crust 富钴结壳",
    "28|Ni|nickel|镍|/ˈnɪkl/|58.693|10|4|transition|镍黄铁矿；超基性岩中的岩浆硫化物矿床|pentlandite 镍黄铁矿;laterite 红土",
    "29|Cu|copper|铜|/ˈkɒpə/|63.546|11|4|transition|黄铜矿与斑岩铜矿；最常用的导电金属|chalcopyrite 黄铜矿;porphyry copper 斑岩铜矿",
    "30|Zn|zinc|锌|/zɪŋk/|65.38|12|4|transition|闪锌矿是最主要矿石；常与铅共生|sphalerite 闪锌矿;zinc sulfide 硫化锌",
    "31|Ga|gallium|镓|/ˈɡæliəm/|69.723|13|4|post|分散元素；铝土矿与闪锌矿中富集，半导体材料|gallium arsenide 砷化镓;by-product 伴生",
    "32|Ge|germanium|锗|/dʒɜːˈmeɪniəm/|72.630|14|4|metalloid|煤与闪锌矿中富集；红外光学与半导体原料|germanium diode 锗二极管;critical mineral 关键矿产",
    "33|As|arsenic|砷|/ˈɑːsənɪk/|74.922|15|4|metalloid|毒砂与雄黄；常作为金矿的指示元素|arsenopyrite 毒砂;realgar 雄黄",
    "34|Se|selenium|硒|/səˈliːniəm/|78.971|16|4|nonmetal|硫化物中类质同象替代硫；环境地球化学关注|selenide 硒化物;trace element 微量元素",
    "35|Br|bromine|溴|/ˈbrəʊmiːn/|79.904|17|4|halogen|卤水与蒸发岩末端组分；有机溴化物|bromide 溴化物;bittern 卤水",
    "36|Kr|krypton|氪|/ˈkrɪptɒn/|83.798|18|4|noble|稀有气体；可示踪地下水与大气来源|krypton isotope 氪同位素;noble gas 稀有气体",
    "37|Rb|rubidium|铷|/ruːˈbɪdiəm/|85.468|1|5|alkali|云母与钾长石中替代钾；Rb-Sr 定年体系|Rb-Sr dating 铷锶定年;mica 云母",
    "38|Sr|strontium|锶|/ˈstrɒntiəm/|87.62|2|5|alkaline|碳酸盐与长石中；Sr 同位素示踪物源|strontium isotope 锶同位素;celestite 天青石",
    "39|Y|yttrium|钇|/ˈɪtriəm/|88.906|3|5|transition|独居石与磷钇矿；稀土族成员|monazite 独居石;xenotime 磷钇矿",
    "40|Zr|zirconium|锆|/zɜːˈkəʊniəm/|91.224|4|5|transition|锆石是 U-Pb 定年的核心矿物|zircon 锆石;U-Pb dating 铀铅定年",
    "41|Nb|niobium|铌|/naɪˈəʊbiəm/|92.906|5|5|transition|铌铁矿；碳酸岩中富集，用于高温合金|columbite 铌铁矿;carbonatite 碳酸岩",
    "42|Mo|molybdenum|钼|/məˈlɪbdənəm/|95.95|6|5|transition|辉钼矿；斑岩系统中常见|molybdenite 辉钼矿;porphyry 斑岩",
    "43|Tc|technetium|锝|/tekˈniːʃiəm/|(98)|7|5|transition|无稳定同位素；人工放射性元素，医学显像|radioisotope 放射性同位素;tracer 示踪剂",
    "44|Ru|ruthenium|钌|/ruːˈθiːniəm/|101.07|8|5|transition|铂族元素；常与镍铜硫化物共生|platinum group 铂族元素;sulfide 硫化物",
    "45|Rh|rhodium|铑|/ˈrəʊdiəm/|102.91|9|5|transition|铂族元素中最稀有之一；催化剂|platinum group 铂族元素;catalyst 催化剂",
    "46|Pd|palladium|钯|/pəˈleɪdiəm/|106.42|10|5|transition|铂族元素；常富集于层状岩体|layered intrusion 层状岩体;PGM 铂族金属",
    "47|Ag|silver|银|/ˈsɪlvə/|107.87|11|5|transition|辉银矿与自然银；热液矿床中的贵金属|argentite 辉银矿;epithermal 浅成低温热液",
    "48|Cd|cadmium|镉|/ˈkædmiəm/|112.41|12|5|transition|闪锌矿中的类质同象组分；环境污染关注|cadmium sulfide 硫化镉;trace element 微量元素",
    "49|In|indium|铟|/ˈɪndiəm/|114.82|13|5|post|分散元素；闪锌矿中富集，ITO 靶材|indium tin oxide 氧化铟锡;by-product 伴生",
    "50|Sn|tin|锡|/tɪn/|118.71|14|5|post|锡石是唯一工业矿物；花岗岩相关矿床|cassiterite 锡石;greisen 云英岩",
    "51|Sb|antimony|锑|/ˈæntɪməni/|121.76|15|5|metalloid|辉锑矿；低温热液矿床的标型矿物|stibnite 辉锑矿;epithermal 浅成低温热液",
    "52|Te|tellurium|碲|/teˈljʊəriəm/|127.60|16|5|metalloid|碲化物与金银共生；稀有类金属|telluride 碲化物;gold deposit 金矿",
    "53|I|iodine|碘|/ˈaɪədiːn/|126.90|17|5|halogen|卤水与海藻富集；碘同位素示踪|iodide 碘化物;brine 卤水",
    "54|Xe|xenon|氙|/ˈzenɒn/|131.29|18|5|noble|稀有气体；Xe 同位素示踪地幔与大气| xenon isotope 氙同位素;noble gas 稀有气体",
    "55|Cs|caesium|铯|/ˈsiːziəm/|132.91|1|6|alkali|铯榴石；蒸发岩中富集，铯钟基准|pollucite 铯榴石;evaporite 蒸发岩",
    "56|Ba|barium|钡|/ˈbeəriəm/|137.33|2|6|alkaline|重晶石是主要矿物；钻井液加重剂|barite 重晶石;barium sulfate 硫酸钡",
    "57|La|lanthanum|镧|/ˈlænθənəm/|138.91|3|9|lanthanide|稀土元素；独居石与氟碳铈矿中富集|monazite 独居石;rare earth 稀土",
    "58|Ce|cerium|铈|/ˈsɪəriəm/|140.12|4|9|lanthanide|地壳中最丰富的稀土元素；氟碳铈矿|bastnäsite 氟碳铈矿;rare earth 稀土",
    "59|Pr|praseodymium|镨|/ˌpreɪziəʊˈdɪmiəm/|140.91|5|9|lanthanide|稀土元素；用于强磁体与抛光粉|rare earth 稀土;magnet 磁体",
    "60|Nd|neodymium|钕|/ˌniːəʊˈdɪmiəm/|144.24|6|9|lanthanide|钕铁硼磁体关键元素；离子吸附型稀土矿|NdFeB magnet 钕铁硼磁体;ion adsorption 离子吸附",
    "61|Pm|promethium|钷|/prəˈmiːθiəm/|(145)|7|9|lanthanide|无稳定同位素；人工放射性，仅科研使用|radioisotope 放射性同位素;research 科研",
    "62|Sm|samarium|钐|/səˈmeəriəm/|150.36|8|9|lanthanide|独居石中；钐钴磁体与中子吸收剂|samarium cobalt 钐钴;neutron absorber 中子吸收剂",
    "63|Eu|europium|铕|/jʊˈrəʊpiəm/|151.96|9|9|lanthanide|Eu 异常是示踪斜长石分异的经典指标|Eu anomaly 铕异常;plagioclase 斜长石",
    "64|Gd|gadolinium|钆|/ˌɡædəˈlɪniəm/|157.25|10|9|lanthanide|稀土元素；磁共振造影与中子屏蔽|gadolinium contrast 钆造影;neutron shield 中子屏蔽",
    "65|Tb|terbium|铽|/ˈtɜːbiəm/|158.93|11|9|lanthanide|重稀土；荧光粉与磁致伸缩材料|heavy rare earth 重稀土;phosphor 荧光粉",
    "66|Dy|dysprosium|镝|/dɪsˈprəʊziəm/|162.50|12|9|lanthanide|重稀土；高温钕铁硼磁体的关键添加元素|heavy rare earth 重稀土;coercivity 矫顽力",
    "67|Ho|holmium|钬|/ˈhəʊlmiəm/|164.93|13|9|lanthanide|重稀土；激光与磁光材料|heavy rare earth 重稀土;laser 激光",
    "68|Er|erbium|铒|/ˈɜːbiəm/|167.26|14|9|lanthanide|重稀土；光纤放大器掺杂物|erbium-doped 掺铒;fiber amplifier 光纤放大器",
    "69|Tm|thulium|铥|/ˈθjuːliəm/|168.93|15|9|lanthanide|最稀有的稀土之一；便携 X 射线源|rare earth 稀土;X-ray source X 射线源",
    "70|Yb|ytterbium|镱|/ɪˈtɜːbiəm/|173.05|16|9|lanthanide|稀土元素；激光与原子钟|ytterbium laser 镱激光;atomic clock 原子钟",
    "71|Lu|lutetium|镥|/luːˈtiːʃiəm/|174.97|17|9|lanthanide|最重的稀土；PET 探测晶体与催化剂|lutetium crystal 镥晶体;catalyst 催化剂",
    "72|Hf|hafnium|铪|/ˈhæfniəm/|178.49|4|6|transition|锆石中与锆共生；核反应堆控制棒|hafnium control rod 铪控制棒;zircon 锆石",
    "73|Ta|tantalum|钽|/ˈtæntələm/|180.95|5|6|transition|钽铁矿；电容器与高温合金|tantalite 钽铁矿;capacitor 电容器",
    "74|W|tungsten|钨|/ˈtʌŋstən/|183.84|6|6|transition|黑钨矿与白钨矿；高熔点金属，接触变质指示|wolframite 黑钨矿;scheelite 白钨矿",
    "75|Re|rhenium|铼|/ˈriːniəm/|186.21|7|6|transition|极稀有；辉钼矿中富集，航空发动机合金|molybdenite 辉钼矿;superalloy 高温合金",
    "76|Os|osmium|锇|/ˈɒzmiəm/|190.23|8|6|transition|密度最大的元素；铂族元素之一|platinum group 铂族元素;osmiridium 锇铱矿",
    "77|Ir|iridium|铱|/ɪˈrɪdiəm/|192.22|9|6|transition|铱异常是白垩纪末撞击事件的经典证据|iridium anomaly 铱异常;impact 撞击",
    "78|Pt|platinum|铂|/ˈplætɪnəm/|195.08|10|6|transition|自然铂与硫化物；层状岩体与砂矿|platinum group 铂族元素;placer 砂矿",
    "79|Au|gold|金|/ɡəʊld/|196.97|11|6|transition|自然金与碲化物；造山型与浅成低温热液金矿|native gold 自然金;orogenic gold 造山型金矿",
    "80|Hg|mercury|汞|/ˈmɜːkjəri/|200.59|12|6|transition|辰砂是主要矿物；汞异常可指示深部流体|cinnabar 辰砂;mercury anomaly 汞异常",
    "81|Tl|thallium|铊|/ˈθæliəm/|204.38|13|6|post|分散元素；低温热液矿床中的指示元素|thallium anomaly 铊异常;epithermal 浅成低温热液",
    "82|Pb|lead|铅|/led/|207.2|14|6|post|方铅矿；U-Pb 定年与铅同位素示踪的联系点|galena 方铅矿;lead isotope 铅同位素",
    "83|Bi|bismuth|铋|/ˈbɪzməθ/|208.98|15|6|post|自然铋与辉铋矿；低熔点合金|bismuthinite 辉铋矿;low-melting alloy 低熔点合金",
    "84|Po|polonium|钋|/pəˈləʊniəm/|(209)|16|6|metalloid|强放射性；铀系衰变链成员|radioactive decay 放射性衰变;uranium series 铀系",
    "85|At|astatine|砹|/ˈæstətiːn/|(210)|17|6|halogen|极稀有放射性卤素；仅痕量存在|radioactive 放射性;trace 痕量",
    "86|Rn|radon|氡|/ˈreɪdɒn/|(222)|18|6|noble|放射性气体；铀矿与断裂带的示踪气体|radon anomaly 氡异常;uranium 铀",
    "87|Fr|francium|钫|/ˈfrænsiəm/|(223)|1|7|alkali|极不稳定的碱金属；仅痕量存在于铀矿|radioactive 放射性;trace 痕量",
    "88|Ra|radium|镭|/ˈreɪdiəm/|(226)|2|7|alkaline|放射性碱土金属；铀矿中的衰变产物|radium 镭;uranium decay 铀衰变",
    "89|Ac|actinium|锕|/ækˈtɪniəm/|(227)|3|10|actinide|锕系首元素；强放射性，科研用|actinide 锕系;radioactive 放射性",
    "90|Th|thorium|钍|/ˈθɔːriəm/|232.04|4|10|actinide|独居石中富集；潜在核燃料，Th-Pb 定年|monazite 独居石;Th-Pb dating 钍铅定年",
    "91|Pa|protactinium|镤|/ˌprəʊtækˈtɪniəm/|231.04|5|10|actinide|铀系衰变中间产物；铀系不平衡定年|uranium series 铀系;disequilibrium 不平衡",
    "92|U|uranium|铀|/jʊˈreɪniəm/|238.03|6|10|actinide|晶质铀矿；U-Pb 定年与核燃料的核心元素|uraninite 晶质铀矿;U-Pb dating 铀铅定年",
    "93|Np|neptunium|镎|/nepˈtjuːniəm/|(237)|7|10|actinide|人工放射性；核燃料循环副产物|transuranic 超铀;nuclear fuel 核燃料",
    "94|Pu|plutonium|钚|/pluːˈtəʊniəm/|(244)|8|10|actinide|人工放射性；核燃料与同位素电池|plutonium 钚;reactor 反应堆",
    "95|Am|americium|镅|/ˌæməˈrɪsiəm/|(243)|9|10|actinide|人工放射性；烟雾探测器电离源|ionization source 电离源;smoke detector 烟雾探测器",
    "96|Cm|curium|锔|/ˈkjʊəriəm/|(247)|10|10|actinide|人工放射性；空间探测器的热电源|radioisotope power 放射性同位素电源;alpha emission α衰变",
    "97|Bk|berkelium|锫|/bɜːˈkiːliəm/|(247)|11|10|actinide|人工放射性；仅科研合成与表征|synthetic element 合成元素;research 科研",
    "98|Cf|californium|锎|/ˌkælɪˈfɔːniəm/|(251)|12|10|actinide|中子源；人工放射性，用于活化分析|neutron source 中子源;activation analysis 活化分析",
    "99|Es|einsteinium|锿|/aɪnˈstaɪniəm/|(252)|13|10|actinide|人工放射性；仅毫克级合成研究|synthetic element 合成元素;research 科研",
    "100|Fm|fermium|镄|/ˈfɜːmiəm/|(257)|14|10|actinide|人工放射性；仅原子级研究|synthetic element 合成元素;research 科研",
    "101|Md|mendelevium|钔|/ˌmendəˈliːviəm/|(258)|15|10|actinide|人工放射性；以门捷列夫命名|synthetic element 合成元素;Mendeleev 门捷列夫",
    "102|No|nobelium|锘|/nəʊˈbiːliəm/|(259)|16|10|actinide|人工放射性；以诺贝尔命名|synthetic element 合成元素;Nobel 诺贝尔",
    "103|Lr|lawrencium|铹|/lɔːˈrensiəm/|(266)|17|10|actinide|锕系末元素；人工放射性|synthetic element 合成元素;actinide 锕系",
    "104|Rf|rutherfordium|𬬻|/ˌrʌðəˈfɔːdiəm/|(267)|4|7|transition|人工合成超重元素；以卢瑟福命名|superheavy element 超重元素;synthetic 合成",
    "105|Db|dubnium|𬭊|/ˈdʌbniəm/|(268)|5|7|transition|人工合成超重元素；以杜布纳命名|superheavy element 超重元素;synthetic 合成",
    "106|Sg|seaborgium|𬭳|/siːˈbɔːɡiəm/|(269)|6|7|transition|人工合成超重元素；以西博格命名|superheavy element 超重元素;synthetic 合成",
    "107|Bh|bohrium|𬭛|/ˈbɔːriəm/|(270)|7|7|transition|人工合成超重元素；以玻尔命名|superheavy element 超重元素;synthetic 合成",
    "108|Hs|hassium|𬭶|/ˈhæsiəm/|(270)|8|7|transition|人工合成超重元素；以黑森州命名|superheavy element 超重元素;synthetic 合成",
    "109|Mt|meitnerium|鿏|/maɪtˈnɪəriəm/|(278)|9|7|unknown|人工合成超重元素；以迈特纳命名|superheavy element 超重元素;synthetic 合成",
    "110|Ds|darmstadtium|𫟼|/dɑːmˈstætiəm/|(281)|10|7|unknown|人工合成超重元素；以达姆施塔特命名|superheavy element 超重元素;synthetic 合成",
    "111|Rg|roentgenium|𬬭|/rɜːntˈɡeniəm/|(282)|11|7|unknown|人工合成超重元素；以伦琴命名|superheavy element 超重元素;synthetic 合成",
    "112|Cn|copernicium|鎶|/ˌkəʊpəˈnɪsiəm/|(285)|12|7|unknown|人工合成超重元素；以哥白尼命名|superheavy element 超重元素;synthetic 合成",
    "113|Nh|nihonium|鉨|/nɪˈhəʊniəm/|(286)|13|7|unknown|人工合成超重元素；以日本命名|superheavy element 超重元素;synthetic 合成",
    "114|Fl|flerovium|𫓧|/fleˈrəʊviəm/|(289)|14|7|unknown|人工合成超重元素；以弗廖罗夫命名|superheavy element 超重元素;synthetic 合成",
    "115|Mc|moscovium|镆|/mɒsˈkəʊviəm/|(290)|15|7|unknown|人工合成超重元素；以莫斯科命名|superheavy element 超重元素;synthetic 合成",
    "116|Lv|livermorium|𫟷|/ˌlɪvəˈmɔːriəm/|(293)|16|7|unknown|人工合成超重元素；以利弗莫尔命名|superheavy element 超重元素;synthetic 合成",
    "117|Ts|tennessine|鿬|/ˈtenəsiːn/|(294)|17|7|halogen|人工合成超重元素；以田纳西州命名|superheavy element 超重元素;synthetic 合成",
    "118|Og|oganesson|鿫|/ˌɒɡəˈnesɒn/|(294)|18|7|noble|人工合成超重元素；以奥加涅相命名|superheavy element 超重元素;synthetic 合成"
  ];

  var byZ = {}, bySym = {}, byEn = {}, byZh = {};
  var elements = RAW.map(function (line) {
    var f = line.split("|");
    var el = {
      z: Number(f[0]),
      sym: f[1],
      en: f[2],
      zh: f[3],
      ipa: f[4],
      mass: f[5],
      g: Number(f[6]),
      p: Number(f[7]),
      cat: f[8],
      note: f[9],
      words: (f[10] || "").split(";").map(function (w) { return w.trim(); }).filter(Boolean).map(function (w) {
        var i = w.lastIndexOf(" ");
        var en = i > 0 ? w.slice(0, i) : w, zh = i > 0 ? w.slice(i + 1).trim() : "";
        return { en: en, zh: zh || "—" };
      })
    };
    el.catZh = (CATS.filter(function (c) { return c.id === el.cat; })[0] || CATS[CATS.length - 1]).zh;
    el.color = (CATS.filter(function (c) { return c.id === el.cat; })[0] || CATS[CATS.length - 1]).color;
    byZ[el.z] = el;
    bySym[el.sym.toLowerCase()] = el;
    byEn[el.en.toLowerCase()] = el;
    byZh[el.zh] = el;
    return el;
  });

  /* 常见度分级：A 级 = 专业文献与工业里几乎天天遇到 */
  var COMMON = {
    A: ["Si", "O", "Al", "Fe", "Ca", "Na", "K", "Mg", "Ti", "Mn", "P", "S", "C", "H", "N", "Cl", "F", "Ba", "Sr", "Zr", "Cu", "Zn", "Pb", "Au", "Ag", "U", "Th", "Li", "Cr", "Ni", "Co", "W", "Sn", "Mo", "Rb", "Cs", "Be", "B", "As", "He", "Ar"],
    B: ["Sc", "V", "Ga", "Ge", "Se", "Br", "I", "Y", "Nb", "Ta", "Hf", "Re", "Pt", "Pd", "Hg", "Sb", "Te", "Bi", "Cd", "In", "Tl", "Ce", "La", "Nd", "Sm", "Eu", "Gd", "Ne", "Kr", "Xe", "Rn", "Ra", "Ac", "Pa", "Np", "Pu"]
  };
  var rankOf = {};
  COMMON.A.forEach(function (s) { rankOf[s] = "A"; });
  COMMON.B.forEach(function (s) { if (!rankOf[s]) rankOf[s] = "B"; });
  elements.forEach(function (e) { e.rank = rankOf[e.sym] || "C"; });

  function search(q) {
    var s = String(q || "").trim().toLowerCase();
    if (!s) return elements.slice();
    return elements.filter(function (e) {
      return e.sym.toLowerCase() === s ||
        e.en.toLowerCase().indexOf(s) === 0 ||
        e.en.toLowerCase().indexOf(s) >= 0 ||
        e.zh.indexOf(s) >= 0 ||
        e.catZh.indexOf(s) >= 0;
    });
  }

  function get(key) {
    if (key == null) return null;
    var k = String(key);
    if (/^\d+$/.test(k)) return byZ[Number(k)] || null;
    var low = k.toLowerCase();
    return bySym[low] || byEn[low] || byZh[k] || null;
  }

  return {
    CATS: CATS,
    elements: elements,
    byZ: byZ,
    get: get,
    search: search,
    ranks: { A: "高频", B: "常见", C: "少见" }
  };
})();
