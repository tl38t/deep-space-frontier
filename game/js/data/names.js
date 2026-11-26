// ================================================================
// 深空星疆 —— Data.Names：成员名生成（按出身分音系，确定性 + 名册去重）
// 每个 NPC 是一个类玩家自主体；无评级（§13，多技能字典）。
//
// 设计（2026-11-26）：
//   · 名字不再是一个中文池抽三下，而是按「出身」分到 7 套命名制度：
//     chinese 内星区中文 / roman 罗马三段名 / spanish 西班牙式 / french 法国式 /
//     german 德国式 / japanese 日本式 / tribal 边疆部落音译 / void 无籍代号。
//   · 拉开差异靠「结构」——段数、连字符、von/de 前缀、连写，不是随机加字。
//   · 无籍代号（void）没有姓：没人在乎流民叫什么。
//   · 名册去重：makeName(rng, { childhood, used })；used 传数组会被就地追加。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Names = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Names = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------
  // 七套命名制度
  // ---------------------------------------------------------------
  const NAME_CULTURES = {
    // 内星区中文：姓 + 冷硬单字 / 动作双字（禁"有福/铁蛋"这类乡土词）
    chinese: {
      kind: "zh",
      sur: ["林", "沈", "江", "顾", "谢", "萧", "楚", "苏", "陆", "卫", "叶", "裴", "宋", "韩", "云", "程", "闻", "姜", "骆", "商", "岑", "费", "邵", "谭", "傅", "童", "桑", "穆", "应", "詹", "柏", "席"],
      g1: ["昭", "砚", "澈", "屿", "曜", "翎", "澜", "霁", "珩", "晏", "聿", "珞", "湛", "宁", "昀", "翊", "灏", "笙", "棠", "骞", "淮", "瑾", "玦", "榆", "渊", "砺", "隼", "朔", "沉", "野", "阙", "岳", "岸", "铖", "冽", "祁", "峤", "弦", "戎", "熹", "洵", "圭", "擎", "峋"],
      g2: ["行舟", "长风", "听雷", "望山", "定川", "执戈", "守夜", "渡海", "叩星", "折光", "临渊", "孤鸿"],
    },
    // 罗马式：三段名 praenomen · nomen · cognomen（联邦官僚 / 军官世家）
    roman: {
      kind: "tri",
      a: ["马库斯", "卢基乌斯", "盖乌斯", "提图斯", "昆图斯", "奥卢斯", "德西穆斯", "塞普提缪斯", "普布利乌斯", "阿庇乌斯", "格奈乌斯", "曼利乌斯"],
      b: ["奥雷利乌斯", "瓦莱里乌斯", "科尔内利乌斯", "尤利乌斯", "克劳狄乌斯", "塞维利乌斯", "安东尼乌斯", "弗拉维乌斯", "多米提乌斯", "卡尔普尔尼乌斯", "李锡尼乌斯", "帕皮里乌斯"],
      c: ["瓦伦斯", "塞维鲁斯", "费利克斯", "马克西穆斯", "隆古斯", "阿格里帕", "普里斯库斯", "鲁弗斯", "斯特拉波", "卡图卢斯", "格拉古", "纳西卡"],
    },
    // 西班牙式：名 · 父姓 ·（母姓），商队 / 拓殖者
    spanish: {
      kind: "tri2",
      a: ["迭戈", "胡安", "卡洛斯", "米格尔", "罗德里戈", "阿隆索", "埃斯特万", "圣地亚哥", "伊莎贝尔", "露西亚", "玛尔塔", "哈维尔"],
      b: ["阿尔瓦雷斯", "罗梅罗", "塞拉诺", "卡斯特罗", "门多萨", "奥尔特加", "纳瓦罗", "伊瓦拉", "富恩特斯", "卡里略"],
      c: ["德·拉·克鲁斯", "德·拉·维加", "德尔·坎波", "德·索托", "德·拉·托雷", "德尔·里奥", "德·莱昂", "德·拉·富恩特"],
    },
    // 法国式：名（可连字符）· 姓（de / le 前缀）
    french: {
      kind: "pair",
      given: ["让-吕克", "皮埃尔", "艾蒂安", "洛朗", "米歇尔", "奥克塔夫", "塞巴斯蒂安", "让-巴蒂斯特", "埃洛迪", "玛蒂尔德", "塞西尔", "安托万"],
      sur: ["德·蒙福尔", "勒克莱尔", "杜瓦隆", "布歇", "拉菲特", "德·拉瓦利埃", "莫雷尔", "卡隆", "德·维尔纳夫", "勒鲁"],
    },
    // 德国式：名（可带中名）· 姓（von 前缀），工业 / 冶炼
    german: {
      kind: "german",
      given: ["汉斯", "弗里德里希", "卡尔", "京特", "沃尔夫冈", "迪特尔", "克劳斯", "洛塔尔", "安妮", "格蕾塔", "约阿希姆", "乌尔里希"],
      mid: ["卡尔", "威廉", "海因里希", "恩斯特"],
      sur: ["冯·施特劳斯", "冯·霍恩", "施密特", "米勒", "鲍尔", "克吕格", "魏斯", "霍夫曼", "冯·艾森", "布劳恩"],
    },
    // 日本式：姓 + 名连写（研究 / 精细制造）
    japanese: {
      kind: "jp",
      sur: ["九条", "桐生", "黑田", "白石", "东云", "神崎", "鹰栖", "水无月", "结城", "相马", "绫濑", "早乙女"],
      given: ["玲奈", "隼人", "千夏", "悠真", "澪", "启介", "沙耶", "佑树", "葵", "龙之介", "冬马", "茜"],
    },
    // 边疆部落：名 · 族名（硬辅音音译）
    tribal: {
      kind: "pair",
      given: ["卡伦", "薇达", "托尔", "娜塔", "斯兰", "格里", "布尔", "耶娃", "德尔", "拉姆", "提库", "米拉", "库什", "沙恩", "尔丹", "布丽", "塔洛", "赫姆"],
      sur: ["沙克", "米杜", "格兰", "达兰", "图库", "布兰", "斯托", "哈夫", "耶尔", "达姆", "库兰", "瑟夫", "塔尔", "洛姆", "汉德", "芬里"],
    },
  };

  // 无籍：没有姓，只有代号 / 编号
  const VOID_TAGS = ["砾", "烬", "哑", "拾", "缺口", "断线", "空罐", "锈钉", "半截", "十号", "七号", "无灯", "破网", "孤盏", "三手", "失频", "断轨", "空转", "铁皮", "无籍", "空包", "静噪", "折翼", "弃号", "哑弦", "零号", "空号", "断签", "缺页", "静默", "灰罐", "二号", "走线", "空舱", "哑火", "断链", "无主", "旧号"];

  // 出身 → 命名制度（键 = state.js 的 BACKSTORY_DEFS.id）
  const CHILDHOOD_CULTURE = {
    orphan_void: "void",            // 虚空孤儿：没人给姓
    fleet_brat: "roman",            // 舰队子弟：军官世家，三段名
    belt_nomad: "tribal",           // 小行星带游牧：部落
    station_rat: "void",            // 空间站鼠辈：街名
    relic_kid: "tribal",            // 遗迹猎人之后
    corp_heir: "french",            // 财团继承人：旧大陆家族
    defector: "roman",              // 叛逃者：原帝国/联邦军官
    signal_orphan: "void",          // 信号弃儿
    smelter_apprentice: "german",   // 冶炼学徒：工业世家
    salvage_waif: "tribal",         // 拾荒遗孤
    gas_drifter: "spanish",         // 气井游商：商队
    abyss_acolyte: "japanese",      // 深空研习生：研究院体系
    bounty_foundling: "spanish",    // 赏金猎徒：悬赏网络
    settler_scion: "chinese",       // 拓殖农裔：中文移民
    turret_child: "chinese",        // 激光炮手之子
  };
  const DEFAULT_CULTURE = "chinese";

  const pick = (rng, a) => a[Math.floor(rng() * a.length)];

  // 两段式（名·姓）：避免「布尔·尔姆」（叠音）与「布丽·布兰」（同首字）这类读着卡的组合
  function pairName(rng, C) {
    for (let i = 0; i < 4; i++) {
      const g = pick(rng, C.given);
      const s = pick(rng, C.sur);
      if (g[g.length - 1] === s[0]) continue;
      if (g[0] === s[0]) continue;
      return g + "·" + s;
    }
    return pick(rng, C.given) + "·" + pick(rng, C.sur);
  }

  function composeName(rng, kind) {
    if (kind === "void") return pick(rng, VOID_TAGS);
    const C = NAME_CULTURES[kind];
    if (!C) return pick(rng, VOID_TAGS);
    switch (C.kind) {
      case "zh": {
        // 姓 + 单字名（62%）/ 姓 + 动作双字（38%）
        const g = rng() < 0.62 ? pick(rng, C.g1) : pick(rng, C.g2);
        return pick(rng, C.sur) + g;
      }
      case "tri":  return pick(rng, C.a) + "·" + pick(rng, C.b) + "·" + pick(rng, C.c);
      case "tri2": {
        // 西班牙：60% 三段（含母姓），40% 两段
        const head = pick(rng, C.a) + "·" + pick(rng, C.b);
        return rng() < 0.6 ? head + "·" + pick(rng, C.c) : head;
      }
      case "pair": return pairName(rng, C);
      case "german": {
        // 45% 带中名 → 三段（中名不与本名重复）
        const g = pick(rng, C.given);
        const s = pick(rng, C.sur);
        const m = pick(rng, C.mid);
        return (rng() < 0.45 && m !== g) ? g + "·" + m + "·" + s : g + "·" + s;
      }
      case "jp":   return pick(rng, C.sur) + pick(rng, C.given);
      default:     return pairName(rng, C);
    }
  }

  // 名册去重：used 可为 Array（就地追加）或 Set；缺省则不查。
  function isTaken(used, n) {
    if (!used) return false;
    if (typeof used.has === "function") return used.has(n);
    return used.indexOf(n) >= 0;
  }
  function remember(used, n) {
    if (!used) return;
    if (typeof used.add === "function") used.add(n);
    else if (typeof used.push === "function") used.push(n);
  }

  // opts 可省略（老调用点 makeName(rng) 仍可用，走内星区中文）
  //   opts.childhood = BACKSTORY_DEFS.id → 决定命名制度
  //   opts.culture   = 直接指定制度（探针 / debug 用）
  //   opts.used      = 名册已用名字（数组就地追加 / Set 直接 add）
  function makeName(rng, opts) {
    const o = opts || {};
    const culture = o.culture || CHILDHOOD_CULTURE[o.childhood] || DEFAULT_CULTURE;
    for (let i = 0; i < 24; i++) {
      const n = composeName(rng, culture);
      if (!isTaken(o.used, n)) { remember(o.used, n); return n; }
    }
    // 兜底：池子被抽干（正常名册规模不会发生），追加序号保证不重名
    const base = composeName(rng, culture);
    let k = 2, n = base + " " + k;
    while (isTaken(o.used, n)) { k++; n = base + " " + k; }
    remember(o.used, n);
    return n;
  }

  // 12 性格（仅文案，不参与数值，自研文案）
  const PERSONALITIES = [
    { id: "stoic",   name: "沉静", line: "任务结束前，我不会多说一句话。" },
    { id: "eager",   name: "热忱", line: "又有活干了？太好了。" },
    { id: "grumpy",  name: "冷面", line: "别在我校准火控的时候说话。" },
    { id: "witty",   name: "机敏", line: "这星系的风景，抵得上三倍佣金。" },
    { id: "loyal",   name: "笃忠", line: "军团在哪，我就在哪。" },
    { id: "reckless",name: "莽撞", line: "冲就完了，分析留给别人。" },
    { id: "calm",    name: "持重", line: "先观望，再决策。" },
    { id: "ambitious",name: "野心", line: "我要的不是星币，是名号。" },
    { id: "kind",    name: "温厚", line: "新兵犯错，我替他扛。" },
    { id: "cynical", name: "讥诮", line: "又一个会画饼的老板。" },
    { id: "brave",   name: "无畏", line: "炮口对准哪里，我就去哪里。" },
    { id: "quiet",   name: "缄默", line: "……（点头）" },
  ];
  function personalityById(id) { return PERSONALITIES.find(p => p.id === id) || PERSONALITIES[0]; }

  return { makeName, PERSONALITIES, personalityById, NAME_CULTURES, CHILDHOOD_CULTURE, VOID_TAGS };
});
