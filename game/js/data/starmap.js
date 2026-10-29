// ================================================================
// 深空星疆 —— Data.StarMap：固定星图生成（EVE 式有机簇团结构）
// 设计要点（§5/§11）：
//  - 系统名复用前作命名池（中文诗意名 + 风格译名），解耦后不含 EVE 裸名
//  - 【固定星图】全量 207 系统，命名不洗牌不抽样（NODE_NAMES[i] 固定对应 node_i）
//  - 【有机云团】不画领地圆盘、不留规则虚空：各区域用「重叠高斯团」散布，
//      核心区 sigma 小 + 节点多 → 高密度核心；外围 sigma 大 + 节点少 → 稀疏长散，
//      相邻团大面积重叠 → 颜色互相犬牙交错（EVE 星图那种融合感，而非分明地界）。
//      区域靠「密度 + 颜色 + 漂浮文字标签」自然区分，无硬边界。
//  - 【层级】207 系统 -> 9 区域(Region) -> 每域 3~6 星座(Constellation)（域内 k-means 聚类）
//  - 【连边三层】星座内密网(MST+近邻) + 星座间桥 + 区域间长途星门(高燃料/战略要冲)
//  - 同一张图每次新存档完全一致（固定种子 mulberry32）
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.StarMap = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.StarMap = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // —— 207 个系统名（解耦命名池，固定全量）——
  const NODE_NAMES = ["灰之域","烬之扉","星之海","白昼尽头","落日幽谷","蓝晶原","银河浅滩","寒星湾","沉默边境","远方灯塔","黑潮","碎星带","流光海","无声深渊","孤城","雾隐之地","铁幕","冰火边境","暮色航道","日出港","羽落川","黑石湾","远古门庭","翠灭星海","玛蒂尔","维拉克斯","诺伊萨","阿尔忒","塞拉菲","卡洛恩","伊斯塔尔","泽布隆","奥瑞斯","塔维恩","米拉赫","科尔萨","尤弥尔","瓦伦特","利奥斯","艾斯卡","赫利俄","萨恩特","普罗米亚","德拉维","昆塔尔","奥菲兰","拉格纳","梅尔希","埃尔诺","贝洛辛","卡西尔","德尔塔","弗拉克","戈尔宁","赫斯塔","伊诺维","拉斐尔","科瑞恩","莱斯特","莫拉克","纳维斯","奥兰德","佩拉辛","阿斯特","布雷恩","塞尔瓦","托勒恩","乌尔萨","希格玛","泽里昂","卡斯佩","伊沃尔","诺坎","维瑟尔","阿洛恩","赫塔尔","米瑞克","萨沃斯","奥德林","贝尔塔","科维恩","莱昂斯","德维卡","塔洛斯","艾玛尔","璃安","霁川","弥珀","洛迦","赫岚","缇欧","维岚","萨芮","澜序","诺弥","塞芙","柯岚","伊泽尔","塔弥","莱芙","奥迦","米妲","泽恩","卡洛斯","瑟琳","尤格","贝芮","德索","弗恩","戈拉","赫洛","伊芙宁","拉乌","科塔","莱弥","莫恩","纳迦","奥芙","佩洛","阿斯洛","布伦","塞勒","托恩","乌弥","希洛","泽芙","卡岚","伊萨","诺泽","维洛恩","阿洛斯","赫因","米莱","萨洛","奥汀","贝恩","科洛斯","莱塔","德恩","塔芙","艾洛","芮安","洛珊","弥洛斯","澈影","烬歌","星阙","暮岚","霜庭","青砾","玄湾","流烁","寂光","远烬","寒穹","烁庭","云岫","沉弦","苍澜","夜汐","微烬","赤霄","青冥","银岚","幽棘","裂穹","眠星","雾棱","临渊","归墟","无垠","长昼","残响","静潮","晦光","白砾","深蓝","映岚","星渡","烬原","霁野","荒庭","流霜","寒汐","澄湾","玄星","暮河","黯潮","辉岑","离歌","朔风","青燧","孤烛","天陨","月蚀","曜痕","寰影","辰砂","星陇","迦南","弥塞","洛希","维塔","瑟昂","欧律","诺瓦恩","阿尔戈斯"];

  // —— 9 个区域（原创名 + 领域色 + 资源偏置 rich + 锚点/散布 sigma/系统数）——
  //    锚点密集的核心三区（苍曜/霜环/玄渊）→ 高密度核心；外围六区 sigma 大、节点少 → 稀疏融合
  //    stage：进度档（1 初期 / 2 中期 / 3 后期，由 rich 推导）；sec：安全度 1.0(高安)→0.05(0.0 死寂)；
  //    pirate：主导海盗势力（复用 3 大雇佣势力 id，设定上它们也是星区劫掠者）。
  //    secLevel：EVE 式安全等级分档（复用 EVE-IDLE combat 区 schema 的 band 命名）。
  //    软进度：不硬锁后期区，但连边燃料按目的地区 stage 加价（见 addEdge），高威胁区自然劝退。
  //    安全等级分档表（iskMult 赏金倍率 / repMult 声望倍率 / fuelMult 燃料倍率 / requiredCL 推荐战斗等级）：
  const SECLEVEL_TABLE = {
    "1.0-0.8": { name: "高安", iskMult: 1.0, repMult: 1.0, fuelMult: 1.0,  requiredCL: 1,  band: 1 },
    "0.7-0.5": { name: "边境", iskMult: 1.5, repMult: 1.2, fuelMult: 1.1,  requiredCL: 15, band: 2 },
    "0.4-0.3": { name: "低安", iskMult: 2.0, repMult: 1.5, fuelMult: 1.2,  requiredCL: 35, band: 3 },
    "0.2-0.1": { name: "深空", iskMult: 2.5, repMult: 1.8, fuelMult: 1.35, requiredCL: 55, band: 4 },
    "0.0":     { name: "0.0", iskMult: 3.5, repMult: 2.5, fuelMult: 1.8,  requiredCL: 80, band: 5 },
  };
  // 富裕度完全由安等决定（EVE 式：高安贫瘠、低安富、0.0 最肥），不再有独立 T 评级
  const SEC_RICHNESS = { "1.0-0.8": 1, "0.7-0.5": 2, "0.4-0.3": 3, "0.2-0.1": 4, "0.0": 4 };
  function richnessOf(secLevel) { return SEC_RICHNESS[secLevel] || 1; }
  // 节点富裕度读取：新档走 richness，旧档回退 tier，再不济取 1（兼容老存档）
  function nodeRich(n) { return n.richness != null ? n.richness : (n.tier != null ? n.tier : 1); }
  // 海盗战力仅由安等 band 决定（安等已同时表达安全度与富裕度，危险度不再叠加节点 tier）
  const PIRATE_POWER = { 1: 14, 2: 28, 3: 46, 4: 72, 5: 110 };
  const REGION_DEFS = [
    { name: "苍曜星域", color: "#5ad1a0", rich: 2, stage: 1, secLevel: "1.0-0.8", pirate: "angel",  ax: 1420, ay: 1060, sigma: 205, size: 27 },
    { name: "霜环星域", color: "#5fb8ff", rich: 2, stage: 1, secLevel: "1.0-0.8", pirate: "blood",  ax: 1700, ay: 1190, sigma: 212, size: 25 },
    { name: "沉沙星域", color: "#e8b45a", rich: 1, stage: 1, secLevel: "1.0-0.8", pirate: "sansha", ax: 870,  ay: 720,  sigma: 330, size: 22 },
    { name: "碧落星域", color: "#7ee0c0", rich: 1, stage: 1, secLevel: "1.0-0.8", pirate: "angel",  ax: 2140, ay: 1600, sigma: 338, size: 24 },
    { name: "远寂星域", color: "#cfd8e3", rich: 2, stage: 1, secLevel: "0.7-0.5", pirate: "angel",  ax: 2620, ay: 1240, sigma: 392, size: 20 },
    { name: "玄渊星域", color: "#b07cff", rich: 3, stage: 2, secLevel: "0.4-0.3", pirate: "sansha", ax: 1370, ay: 1330, sigma: 205, size: 26 },
    { name: "幽烬星域", color: "#9b8cff", rich: 3, stage: 2, secLevel: "0.4-0.3", pirate: "blood",  ax: 2200, ay: 780,  sigma: 345, size: 23 },
    { name: "残辉星域", color: "#e879a8", rich: 4, stage: 3, secLevel: "0.2-0.1", pirate: "blood",  ax: 620,  ay: 1500, sigma: 385, size: 19 },
    { name: "赤潮星域", color: "#ef6b5a", rich: 4, stage: 3, secLevel: "0.0",     pirate: "sansha", ax: 1260, ay: 340,  sigma: 362, size: 21 },
  ];

  // —— MVP 试玩门禁（用户 2026-10-26 确认）：仅开放 stage ≤ TRIAL_STAGE_MAX 的区域 ——
  // 试玩 = stage1 两档（高安 1.0-0.8 + 边境 0.7-0.5）；stage ≥ 2（低安/深空/0.0）本周锁定。
  const TRIAL_STAGE_MAX = 1;
  // 行星类型按区域 stage 分层：试玩(stage1) 只出 lava/gas/ice 三类；stage2+（本周锁定）出 plasma/temperate/storm。
  // 每颗行星天体固定 1 个 planetType → 只产其对应产物（满足「每种行星只产出其对应产品」）。
  const TRIAL_PLANET_TYPES = ["lava", "gas", "ice"];
  const LOCKED_PLANET_TYPES = ["plasma", "temperate", "storm"];
  function planetTypeForStage(stage, rand) {
    const pool = (stage || 1) <= TRIAL_STAGE_MAX ? TRIAL_PLANET_TYPES : LOCKED_PLANET_TYPES;
    return pool[Math.floor(rand() * pool.length)];
  }

  // —— 星座名池（原创，足够多，避免与系统名/星域名撞车）——
  const CONST_NAMES = ["北辰","落霞","寒霜","幽蓝","赤焰","银辉","玄墨","青冥","暮光","星澜","沉沙","破晓","孤星","霜河","远岚","流光","寂夜","苍梧","丹曦","残月","长庚","太微","天枢","瑶光","玄戈","招摇","织火","陨星","蜃楼","瀚海","墟烟","晗光","望舒","烛龙","溟海","玦影","穹苍","离朱","幽都","丹宸","白藏","玄英","青阳","广漠","封狼","天驷","天苑","天街","天津","天渊","天潢","天关","天钺","天棓","天枪","天厨","天船","天毕","天节","天相","天柱","天泉","天沚","北落","参宿"];

  // 矿种分带（解耦内部键）：仅作「矿种→tier」映射；节点 abundance 含【全部】矿种，
  // 由 oreAbundance(矿种tier, 节点tier) 给出丰寡倍率（同级丰富 / 低级中等 / 越级稀缺可采）。
  const ORE_BY_TIER = { 1: ["fe_ore", "ni_ore"], 2: ["bo_ore", "mx_ore"], 3: ["no_ore", "zr_ore"], 4: ["px_ore"] };
  // 气体分带（复用 EVE-IDLE 7 气解锁序）：低阶节点富产低阶气，高阶节点解锁高阶气（越级稀缺可采）
  const GAS_BY_TIER = { 1: ["crude_fullerene"], 2: ["he_gas", "stable_fullerene"], 3: ["hy_gas", "high_purity_fullerene"], 4: ["poly_gas", "ultra_pure_poly_gas"] };
  const ALL_ORES = [], ORE_TIER = {};
  for (const t in ORE_BY_TIER) for (const o of ORE_BY_TIER[t]) { ALL_ORES.push(o); ORE_TIER[o] = +t; }
  const ALL_GASES = [], GAS_TIER = {};
  for (const t in GAS_BY_TIER) for (const g of GAS_BY_TIER[t]) { ALL_GASES.push(g); GAS_TIER[g] = +t; }

  // 丰寡倍率：矿种 tier 相对节点 tier。同级=丰富(1.6~2.5)，低级=中等(0.5~1.0)，越级=稀缺可采(0.12~0.45)
  function oreAbundance(oreTier, nodeTier, rand) {
    if (oreTier === nodeTier) return 1.6 + rand() * 0.9;
    if (oreTier < nodeTier) return 0.5 + rand() * 0.5;
    return 0.12 + rand() * 0.3;
  }

  // 坐标空间（逻辑画布；实际 extent 由生成结果回填 width/height）
  const W = 3000, H = 2200, MARGIN = 170;

  function gauss(rand, mu, sigma) {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // —— 星系内部天体（程序化、确定性）——
  // 每个星系 = 1 恒星 + 1 必带小行星带（采矿点，继承节点矿种）+ 2~4 其他天体。
  // 行星=勘探目标 / 残骸=考古目标 / 空间站=势力·工业锚点（后续接入）。
  // 种子化：ensureBodies 用 node.id 哈希 prng（与生成顺序无关、跨存档可复现）；
  // generateStarMap 内部用同一固定 rand 注入，保证「固定星图」每次一致。
  function hashPrng(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    let s = h >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeBodies(node, rand, regionStage) {
    const bodies = [];
    const rt = nodeRich(node);
    bodies.push({ id: node.id + "_star", kind: "star", name: node.name + " 主星", orbit: 0, ang: 0, size: 26, tier: rt });
    // 必带小行星带（采矿点）：继承节点矿种 abundance
    const beltOres = {};
    for (const o in node.abundance) beltOres[o] = node.abundance[o];
    bodies.push({ id: node.id + "_belt", kind: "belt", name: node.name + " 小行星带", orbit: 72, ang: Math.floor(rand() * 360), size: 17, tier: rt, abundance: beltOres });
    // 气云（约 40% 星系出现）：另一种采集点，采气体资源（走 mining 技能）；全气体丰寡，越级气体稀缺可采
    if (rand() < 0.4) {
      const gasOres = {};
      for (const g of ALL_GASES) gasOres[g] = +oreAbundance(GAS_TIER[g], rt, rand).toFixed(3);
      bodies.push({ id: node.id + "_gas", kind: "gas", name: node.name + " 气云", orbit: 50, ang: Math.floor(rand() * 360), size: 22, tier: rt, abundance: gasOres });
    }
    const pool = ["planet", "planet", "planet", "derelict", "derelict", "station"];
    const nExtra = 2 + Math.floor(rand() * 3); // 2~4
    for (let i = 0; i < nExtra; i++) {
      const k = pool[Math.floor(rand() * pool.length)];
      const orbit = 72 + (i + 1) * 40 + rand() * 10;
      const ang = Math.floor(rand() * 360);
      const size = k === "planet" ? 11 + Math.floor(rand() * 8) : k === "station" ? 12 : 9;
      const b = {
        id: node.id + "_b" + i, kind: k,
        name: node.name + "-" + (i + 1) + (k === "planet" ? " 行星" : k === "derelict" ? " 残骸场" : " 空间站"),
        orbit: Math.round(orbit), ang: ang, size: size, tier: rt,
      };
      if (k === "derelict") b.abundance = {};
      if (k === "planet") b.planetType = planetTypeForStage(regionStage, rand);
      bodies.push(b);
    }
    return bodies;
  }
  // 旧档/外部构造补天体（幂等）：缺 bodies 才生成；已存在则补全全矿种/全气体（O(1) 不破坏新档确定性）
  function ensureBodies(map) {
    if (!map || !map.nodes) return map;
    for (const n of map.nodes) {
      if (!n.bodies || !n.bodies.length) { n.bodies = makeBodies(n, hashPrng(n.id)); continue; }
      // 节点 abundance 补全（缺某矿种则按 tier 补丰寡倍率）
      if (!n.abundance) n.abundance = {};
      let needFill = false;
      for (const o of ALL_ORES) if (!(o in n.abundance)) needFill = true;
      if (needFill) {
        const ar = hashPrng(n.id + "_ab");
        for (const o of ALL_ORES) if (!(o in n.abundance)) n.abundance[o] = +oreAbundance(ORE_TIER[o], nodeRich(n), ar).toFixed(3);
      }
      // 小行星带同步节点全矿种
      const belt = n.bodies.find(b => b.kind === "belt");
      if (belt) { belt.abundance = {}; for (const o in n.abundance) belt.abundance[o] = n.abundance[o]; }
      // 气云：缺失则按 40% 概率补（全气体）；已存在则补全缺的气体
      let gas = n.bodies.find(b => b.kind === "gas");
      const gr = hashPrng(n.id + "_gas");
      if (!gas) {
        if (gr() < 0.4) {
          const gasOres = {};
          for (const g of ALL_GASES) gasOres[g] = +oreAbundance(GAS_TIER[g], nodeRich(n), gr).toFixed(3);
          n.bodies.push({ id: n.id + "_gas", kind: "gas", name: n.name + " 气云", orbit: 50, ang: Math.floor(gr() * 360), size: 22, tier: nodeRich(n), abundance: gasOres });
        }
      } else {
        for (const g of ALL_GASES) if (!(g in gas.abundance)) gas.abundance[g] = +oreAbundance(GAS_TIER[g], nodeRich(n), gr).toFixed(3);
      }
    }
    return map;
  }

  // 简单 k-means（域内星座聚类；farthest-point 初始化 + 8 轮）
  function kmeans(pts, k, rand) {
    const n = pts.length;
    if (n <= k) return { assign: pts.map((_, i) => i), centers: pts.map(p => ({ x: p.x, y: p.y })) };
    const seeds = [pts[Math.floor(rand() * n)]];
    while (seeds.length < k) {
      let best = pts[0], bestD = -1;
      for (const p of pts) {
        let d = Infinity;
        for (const s of seeds) { const dd = (p.x - s.x) * (p.x - s.x) + (p.y - s.y) * (p.y - s.y); if (dd < d) d = dd; }
        if (d > bestD) { bestD = d; best = p; }
      }
      seeds.push(best);
    }
    let assign = new Array(n).fill(0);
    for (let iter = 0; iter < 10; iter++) {
      let changed = false;
      for (let i = 0; i < n; i++) {
        let bi = 0, bd = Infinity;
        for (let j = 0; j < k; j++) { const d = (pts[i].x - seeds[j].x) ** 2 + (pts[i].y - seeds[j].y) ** 2; if (d < bd) { bd = d; bi = j; } }
        if (assign[i] !== bi) { assign[i] = bi; changed = true; }
      }
      for (let j = 0; j < k; j++) {
        let sx = 0, sy = 0, c = 0;
        for (let i = 0; i < n; i++) if (assign[i] === j) { sx += pts[i].x; sy += pts[i].y; c++; }
        if (c) { seeds[j] = { x: sx / c, y: sy / c }; }
      }
      if (!changed) break;
    }
    // 组装分组：丢弃空簇 + 合并过小簇(<3 成员)到最近簇
    //（高斯离群点会让 k-means 切出大小为 1 的簇，导致「单点星座」与质心几乎重合）
    const groups = [];
    for (let j = 0; j < k; j++) groups.push({ x: seeds[j].x, y: seeds[j].y, ids: [] });
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < groups.length; j++) { const d = (pts[i].x - groups[j].x) ** 2 + (pts[i].y - groups[j].y) ** 2; if (d < bd) { bd = d; bi = j; } }
      groups[bi].ids.push(i);
    }
    // 合并过小簇（<3 成员）——注意下限放到 1，否则只剩两组时会残留 1 人星座
    for (let guard = 0; guard < 80; guard++) {
      let small = -1;
      for (let i = 0; i < groups.length; i++) if (groups[i].ids.length < 3) { small = i; break; }
      if (small < 0 || groups.length <= 1) break;
      let bj = -1, bd = Infinity;
      for (let j = 0; j < groups.length; j++) {
        if (j === small) continue;
        const d = (groups[small].x - groups[j].x) ** 2 + (groups[small].y - groups[j].y) ** 2;
        if (d < bd) { bd = d; bj = j; }
      }
      groups[bj].ids = groups[bj].ids.concat(groups[small].ids);
      groups.splice(small, 1);
    }
    // 拆分巨簇（>9 成员）——沿最大投影轴二分 + 4 轮 Lloyd 细化，避免单个星座塞十几颗星
    for (let guard = 0; guard < 30; guard++) {
      let big = -1;
      for (let i = 0; i < groups.length; i++) if (groups[i].ids.length > 9) { big = i; break; }
      if (big < 0 || groups.length >= 8) break;
      const ids = groups[big].ids;
      let mx = 0, my = 0;
      for (const i of ids) { mx += pts[i].x; my += pts[i].y; }
      mx /= ids.length; my /= ids.length;
      let sxx = 0, syy = 0, sxy = 0;
      for (const i of ids) { const dx = pts[i].x - mx, dy = pts[i].y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(theta), uy = Math.sin(theta);
      const arr = ids.map(i => ({ i: i, p: (pts[i].x - mx) * ux + (pts[i].y - my) * uy })).sort((a, b) => a.p - b.p);
      const h = Math.ceil(arr.length / 2);
      let A = arr.slice(0, h).map(o => o.i), B = arr.slice(h).map(o => o.i);
      for (let it = 0; it < 4; it++) {
        let ax = 0, ay = 0, bx = 0, by = 0;
        for (const i of A) { ax += pts[i].x; ay += pts[i].y; }
        for (const i of B) { bx += pts[i].x; by += pts[i].y; }
        ax /= A.length || 1; ay /= A.length || 1; bx /= B.length || 1; by /= B.length || 1;
        const nA = [], nB = [];
        for (const i of ids) {
          const da = (pts[i].x - ax) ** 2 + (pts[i].y - ay) ** 2, db = (pts[i].x - bx) ** 2 + (pts[i].y - by) ** 2;
          (da <= db ? nA : nB).push(i);
        }
        if (!nA.length || !nB.length) break;
        A = nA; B = nB;
      }
      groups.splice(big, 1, { x: 0, y: 0, ids: A }, { x: 0, y: 0, ids: B });
    }
    const assign2 = new Array(n).fill(0);
    groups.forEach((g, gi) => {
      let cx = 0, cy = 0;
      for (const i of g.ids) { cx += pts[i].x; cy += pts[i].y; }
      g.x = cx / g.ids.length; g.y = cy / g.ids.length;
      for (const i of g.ids) assign2[i] = gi;
    });
    return { assign: assign2, centers: groups.map(g => ({ x: g.x, y: g.y })) };
  }

  function generateStarMap(rng, opts) {
    opts = opts || {};
    const names = NODE_NAMES;
    const count = Math.min(opts.count || names.length, names.length);

    // 固定种子 PRNG（mulberry32）——保证每次新存档都是「同一张固定星图」
    let _s = (2071900 ^ 0x9e3779b1) >>> 0;
    function rand() {
      _s = (_s + 0x6D2B79F5) | 0;
      let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // ---- 1) 区域：锚点 + 抖动（去掉手摆感），sigma/规模来自定义 ----
    const regions = REGION_DEFS.map((rd, i) => ({
      id: "region_" + i,
      name: rd.name,
      color: rd.color,
      rich: rd.rich,
      stage: rd.stage,            // 进度档（1 初期 / 2 中期 / 3 后期）
      secLevel: rd.secLevel,      // EVE 式安全等级分档（见 SECLEVEL_TABLE）
      pirate: rd.pirate,          // 主导海盗势力 id
      trialOpen: rd.stage <= TRIAL_STAGE_MAX,  // MVP 试玩门禁：仅 stage1 开放
      cx: Math.round(Math.max(MARGIN, Math.min(W - MARGIN, rd.ax + (rand() - 0.5) * 140))),
      cy: Math.round(Math.max(MARGIN, Math.min(H - MARGIN, rd.ay + (rand() - 0.5) * 140))),
      radius: Math.round(rd.sigma * 1.3),
      _sigma: rd.sigma,
      _size: rd.size,
    }));

    // ---- 2) 系统落点：各区域高斯散布（重叠 -> 颜色犬牙交错），轻量最小间距防完全重合 ----
    const nodes = [];
    const placed = [];
    let sysIdx = 0;
    regions.forEach((reg) => {
      for (let k = 0; k < reg._size && sysIdx < count; k++) {
        let x = 0, y = 0;
        for (let a = 0; a < 12; a++) {
          x = gauss(rand, reg.cx, reg._sigma);
          y = gauss(rand, reg.cy, reg._sigma);
          x = Math.max(MARGIN, Math.min(W - MARGIN, x));
          y = Math.max(MARGIN, Math.min(H - MARGIN, y));
          let ok = true;
          for (const p of placed) { if ((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) < 15 * 15) { ok = false; break; } }
          if (ok) break;
        }
        placed.push({ x: x, y: y });
        // 富裕度完全由安等决定（EVE 式：高安贫、0.0 富），不再有独立 T 评级
        const richness = richnessOf(reg.secLevel);
        // 全矿种 abundance：每个矿种都可出现，倍率由「矿种 tier vs 节点富裕度」决定丰寡
        const abundance = {};
        for (const ore of ALL_ORES) abundance[ore] = +oreAbundance(ORE_TIER[ore], richness, rand).toFixed(3);
        const nd = {
          id: "node_" + sysIdx,
          name: names[sysIdx],
          richness: richness,
          abundance: abundance,
          x: Math.round(x),
          y: Math.round(y),
          region: reg.id,
          constellation: null,
          discovered: false,
          faction: null,
          trialOpen: reg.stage <= TRIAL_STAGE_MAX,  // MVP 试玩门禁：仅 stage1 开放
        };
        nd.bodies = makeBodies(nd, rand, reg.stage);   // 星系内部天体（确定性）
        nodes.push(nd);
        sysIdx++;
      }
    });

    // ---- 3) 星座：域内 k-means 聚类（每域 3~5 座），建二级层级 ----
    const constellations = [];
    let constNameIdx = 0;
    regions.forEach((reg) => {
      const idxs = [];
      nodes.forEach((n, i) => { if (n.region === reg.id) idxs.push(i); });
      if (!idxs.length) return;
      const pts = idxs.map(i => ({ x: nodes[i].x, y: nodes[i].y }));
      const k = Math.max(3, Math.min(6, Math.round(idxs.length / 6)));
      const r = kmeans(pts, k, rand);
      const local = [];
      for (let c = 0; c < r.centers.length; c++) {
        const cname = CONST_NAMES[constNameIdx % CONST_NAMES.length] + "座";
        constNameIdx++;
        const con = { id: "c_" + reg.id + "_" + c, name: cname, regionId: reg.id, cx: Math.round(r.centers[c].x), cy: Math.round(r.centers[c].y) };
        constellations.push(con);
        local.push(con);
      }
      idxs.forEach((i, j) => { nodes[i].constellation = local[r.assign[j]].id; });
    });

    // ---- 3b) 结点收紧：把各星座成员往其质心拉 40% -> 局部成紧密结点（EVE 团簇质感），
    //          区域间仍因高斯重叠而犬牙交错，不会被拉成方块网格 ----
    constellations.forEach((con) => {
      const ids = [];
      nodes.forEach((n, i) => { if (n.constellation === con.id) ids.push(i); });
      if (ids.length < 2) return;
      let cx = 0, cy = 0;
      for (const i of ids) { cx += nodes[i].x; cy += nodes[i].y; }
      cx /= ids.length; cy /= ids.length;
      for (const i of ids) {
        nodes[i].x = nodes[i].x + (cx - nodes[i].x) * 0.42;
        nodes[i].y = nodes[i].y + (cy - nodes[i].y) * 0.42;
      }
    });

    // ---- 3c) 松弛：把距离过近的节点对推开（防收紧后圆点重叠糊成一坨）----
    for (let it = 0; it < 8; it++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
          const d = Math.hypot(dx, dy) || 0.001;
          if (d < 14) {
            const push = (14 - d) / 2 / d;
            nodes[i].x -= dx * push; nodes[i].y -= dy * push;
            nodes[j].x += dx * push; nodes[j].y += dy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    for (const n of nodes) { n.x = Math.round(n.x); n.y = Math.round(n.y); }
    // 松弛后回填星座质心
    constellations.forEach((con) => {
      const ids = [];
      nodes.forEach((n, i) => { if (n.constellation === con.id) ids.push(i); });
      if (!ids.length) return;
      let cx = 0, cy = 0;
      for (const i of ids) { cx += nodes[i].x; cy += nodes[i].y; }
      con.cx = Math.round(cx / ids.length); con.cy = Math.round(cy / ids.length);
    });

    // ---- 4) 连边（三层：星座内密网 / 星座间桥 / 区域间长途星门）----
    const idxOf = {}; nodes.forEach((n, i) => (idxOf[n.id] = i));
    const edges = [];
    const used = new Set();
    const deg = new Array(nodes.length).fill(0);
    function dist(a, b) { return Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y); }
    function connected(a, b) { const key = a < b ? a + "|" + b : b + "|" + a; return used.has(key); }
    function addEdge(a, b, kind) {
      if (a === b) return;
      const ka = nodes[a].id, kb = nodes[b].id;
      const key = a < b ? a + "|" + b : b + "|" + a;
      if (used.has(key)) return;
      used.add(key);
      const d = dist(a, b);
      // 软进度：目的地区 stage 越高，跃迁燃料越贵（后期星域自然劝退，不硬锁）
      const rsa = regions.find(r => r.id === nodes[a].region), rsb = regions.find(r => r.id === nodes[b].region);
      const extra = (Math.max((rsa && rsa.stage) || 1, (rsb && rsb.stage) || 1) - 1) * 3;
      const fc = Math.max(2, Math.round(d / 82)) + extra;
      edges.push({ from: ka, to: kb, fuelCost: fc, kind: kind || "intra" });
      deg[a]++; deg[b]++;
    }
    function mstOver(ids, kind) {
      const inT = new Set([ids[0]]);
      while (inT.size < ids.length) {
        let ba = -1, bj = -1, bd = Infinity;
        for (const a of inT) for (const b of ids) {
          if (inT.has(b)) continue;
          const d = dist(a, b);
          if (d < bd) { bd = d; ba = a; bj = b; }
        }
        addEdge(ba, bj, kind); inT.add(bj);
      }
    }
    function nearestExtra(ids, maxDeg, kind) {
      for (const a of ids) {
        if (deg[a] >= maxDeg) continue;
        let bj = -1, bd = Infinity;
        for (const b of ids) { if (b === a || connected(a, b)) continue; const d = dist(a, b); if (d < bd) { bd = d; bj = b; } }
        if (bj >= 0) addEdge(a, bj, kind);
      }
    }
    function closestIdx(ids, px, py) {
      let bi = ids[0], bd = Infinity;
      for (const i of ids) { const d = Math.hypot(nodes[i].x - px, nodes[i].y - py); if (d < bd) { bd = d; bi = i; } }
      return bi;
    }
    const allIdx = nodes.map((n, i) => i);

    // 星座内：密网
    constellations.forEach(c => {
      const ids = allIdx.filter(i => nodes[i].constellation === c.id);
      if (ids.length < 2) return;
      mstOver(ids, "intra");
      nearestExtra(ids, 3, "intra");
    });
    // 星座间桥（同域内）：星座枢纽(离域心最近) 连 MST + 1 近邻
    regions.forEach(reg => {
      const hubs = constellations.filter(c => c.regionId === reg.id).map(c => closestIdx(allIdx.filter(i => nodes[i].constellation === c.id), reg.cx, reg.cy));
      if (hubs.length >= 2) { mstOver(hubs, "bridge"); nearestExtra(hubs, 2, "bridge"); }
    });
    // 区域间长途星门：各域枢纽(离域心最近) 连 MST + 1 近邻（距离长 -> 高燃料，战略要冲）
    const regHubs = regions.map(reg => closestIdx(allIdx.filter(i => nodes[i].region === reg.id), reg.cx, reg.cy));
    mstOver(regHubs, "choke");
    nearestExtra(regHubs, 2, "choke");

    // ---- 5) 起点 = 起始区域(region_0)枢纽；揭示起点 + 直接邻居 ----
    const startId = nodes[regHubs[0]].id;
    nodes[regHubs[0]].discovered = true;
    for (const e of edges) {
      if (e.from === startId) nodes[idxOf[e.to]].discovered = true;
      else if (e.to === startId) nodes[idxOf[e.from]].discovered = true;
    }

    // ---- 6) 实际 extent 回填（更紧的 viewBox）+ 平移到 0 原点 ----
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const minX = Math.min.apply(null, xs) - 60, minY = Math.min.apply(null, ys) - 60;
    const maxX = Math.max.apply(null, xs) + 60, maxY = Math.max.apply(null, ys) + 60;
    for (const n of nodes) { n.x = Math.round(n.x - minX); n.y = Math.round(n.y - minY); }
    for (const r of regions) { r.cx = Math.round(r.cx - minX); r.cy = Math.round(r.cy - minY); }
    for (const c of constellations) { c.cx = Math.round(c.cx - minX); c.cy = Math.round(c.cy - minY); }

    return {
      nodes: nodes,
      edges: edges,
      regions: regions,
      constellations: constellations,
      startId: startId,
      discovered: nodes.filter(n => n.discovered).map(n => n.id),
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY),
    };
  }

  // 邻接表（移动可达判定 / UI 高亮）
  function adjacency(map) {
    const adj = {};
    for (const n of map.nodes) adj[n.id] = [];
    for (const e of map.edges) {
      adj[e.from].push({ to: e.to, fuelCost: e.fuelCost, kind: e.kind });
      adj[e.to].push({ to: e.from, fuelCost: e.fuelCost, kind: e.kind });
    }
    return adj;
  }

  function nodeById(map, id) { return map.nodes.find(n => n.id === id) || null; }

  // 母舰 → 作业节点的最短跳数（无向 BFS，O(V+E)，确定性；物流效率周三复用）。
  // 返回整数跳数；不可达 / 节点缺失返回 -1。试玩门禁（trialOpen=false）不影响图连通性——
  // 仍按完整星图算跳数，UI 用 trialOpen 做可达灰显即可（保持物流公式「距离」语义稳定）。
  function shortestHops(map, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return fromId === toId ? 0 : -1;
    const adj = adjacency(map);
    if (!adj[fromId] || !adj[toId]) return -1;
    const seen = Object.create(null);
    seen[fromId] = true;
    let frontier = [fromId];
    let hops = 0;
    while (frontier.length) {
      const next = [];
      for (const u of frontier) {
        for (const e of adj[u]) {
          if (seen[e.to]) continue;
          if (e.to === toId) return hops + 1;
          seen[e.to] = true;
          next.push(e.to);
        }
      }
      frontier = next;
      hops++;
    }
    return -1;
  }

  // 星系海盗据点参数（复用 EVE-IDLE combat 区 secLevel 分级 + 死亡空间 enemyPool 思路）：
  //   - 安全等级越低（band 越大）→ 海盗战力越高、赏金/声望倍率越高（iskMult/repMult）。
  //   - 节点 tier 越高 → 海盗战力越高（资源更肥、守卫更强）。
  //   - requiredCL 推荐战斗等级门槛（低于则剿匪效率下降，见 settle.js）。
  // O(1)，不依赖 now/调用频率（确定性）。
  function pirateRaid(map, nodeId) {
    const node = nodeById(map, nodeId);
    if (!node) return null;
    const region = (map.regions || []).find(r => r.id === node.region) || {};
    const p = SECLEVEL_TABLE[region.secLevel] || SECLEVEL_TABLE["1.0-0.8"];
    const piratePower = PIRATE_POWER[p.band] || 14;
    return {
      faction: region.pirate || "sansha",
      secLevel: region.secLevel,
      secName: p.name,
      iskMult: p.iskMult,
      repMult: p.repMult,
      requiredCL: p.requiredCL,
      piratePower: piratePower,
    };
  }

  return { generateStarMap, adjacency, nodeById, shortestHops, ensureBodies, makeBodies, pirateRaid, ORE_BY_TIER, REGION_DEFS, SECLEVEL_TABLE };
});
