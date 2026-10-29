// ================================================================
// 深空星疆 —— Data.Ships：舰船定义 + 造船厂(bodyLevel)门禁
// 门禁机制：base.bodyLevel 即舰基本体的造船厂等级（§11），逐舰种门禁见 SHIPS 表。
// tier→bodyLevel 映射：Lv1 空间站→护卫/驱逐；Lv2 星堡→巡洋/战列巡洋；
//   Lv3 星城→战列/旗舰；Lv4 深空要塞→泰坦。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Ships = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Ships = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // classTier 与 bodyLevel 门禁；舰名复用 EVE-IDLE 解耦显示名（启程级/星矛级…），泰坦沿用原创名
  // hp = 该舰三防满载（成员绑定舰船后 hp 上限即此值，见 state.makeMember）
  // 舰种门禁：bodyLevelReq 采用 0-based，与 BODY_LEVELS 下标、state.base.bodyLevel 起始值 0 对齐（2026-10-27 修 off-by-one）。
  //   frigate/destroyer 可在起始本体（空间站 Lv1，bodyLevel=0）直接建造；
  //   cruiser/battlecruiser 需升级核心一次（星堡 Lv2）；battleship/capital 需 Lv3；supercapital 需 Lv4。
  const SHIPS = {
    frigate:      { id: "frigate",      name: "启程级", classTier: 1, bodyLevelReq: 0, cost: { fe_alloy: 20, struct: 4 },                 buildTime: 60,  slots: 2, hp: { shield: 240,  armor: 320,  structure: 460 } },
    destroyer:     { id: "destroyer",     name: "星矛级", classTier: 1, bodyLevelReq: 0, cost: { fe_alloy: 40, struct: 10, prop: 4 },        buildTime: 120, slots: 3, hp: { shield: 360,  armor: 520,  structure: 680 } },
    cruiser:       { id: "cruiser",       name: "铁卫级", classTier: 2, bodyLevelReq: 1, cost: { ni_alloy: 60, struct: 20, prop: 10 },       buildTime: 300, slots: 4, hp: { shield: 700,  armor: 980,  structure: 1300 } },
    battlecruiser: { id: "battlecruiser", name: "闪刃级", classTier: 2, bodyLevelReq: 1, cost: { ni_alloy: 120, struct: 40, prop: 20, weapon: 10 }, buildTime: 540, slots: 5, hp: { shield: 1000, armor: 1400, structure: 1900 } },
    battleship:    { id: "battleship",    name: "岩脊级", classTier: 3, bodyLevelReq: 2, cost: { bo_alloy: 200, struct: 80, prop: 40, weapon: 30 }, buildTime: 1200, slots: 6, hp: { shield: 1800, armor: 2600, structure: 3400 } },
    capital:       { id: "capital",       name: "山海级", classTier: 3, bodyLevelReq: 2, cost: { bo_alloy: 400, struct: 160, prop: 80, weapon: 60 }, buildTime: 2400, slots: 8, hp: { shield: 3000, armor: 4200, structure: 5600 } },
    supercapital:  { id: "supercapital",  name: "星渊泰坦", classTier: 4, bodyLevelReq: 3, cost: { px_alloy: 600, struct: 300, prop: 150, weapon: 120 }, buildTime: 5400, slots: 10, hp: { shield: 6000, armor: 9000, structure: 12000 } },
  };

  // 单个能源舱的发电输出（供能）。与 BODY_LEVELS[i].energy（本体外壳电网基础容量）共同构成总预算。
  const ENERGY_OUTPUT = 100;

  // 舰基母舰蓝图：每艘船的舱位拓扑各异；核心独立于船体，模块可在同类舱位间拆装。
  // energy 字段 = 该模块运行时电力占用（⚡ 能源舱自身为 0，其发电见 ENERGY_OUTPUT）。
  // 占用数值为 MVP 提议值（周四标定，E 项），后续可按平衡微调。
  const BASE_MODULES = {
    energy:      { type: "energy",      name: "能源舱",   icon: "⚡", color: "#e7b45d", desc: "发电并稳定工业电网。", energy: 0 },
    cargo:       { type: "cargo",       name: "仓储舱",   icon: "▣",  color: "#79a9ff", desc: "周转矿石、矿材与舰船组件。", energy: 5 },
    smelt:       { type: "smelt",       name: "精炼环",   icon: "⚗",  color: "#67d4a1", desc: "将采集矿石转化为矿材。", energy: 20 },
    manufacture: { type: "manufacture", name: "总装船坞", icon: "⌬",  color: "#42d6e8", desc: "制造舰船组件与整舰。", energy: 30 },
    invent:      { type: "invent",      name: "发明舱",   icon: "◇",  color: "#b28cff", desc: "研发改装图纸与高级配方。", energy: 40 },
    dock:        { type: "dock",        name: "舰队泊位", icon: "◈",  color: "#b28cff", desc: "停泊与维护舰队。", energy: 10 },
    command:     { type: "command",     name: "指挥塔",   icon: "⌁",  color: "#e8c46a", desc: "统筹成员、舰队与基地行动。", energy: 10 },
    habitat:     { type: "habitat",     name: "居住舱",   icon: "⌂",  color: "#ef7b87", desc: "供成员生活与训练。", energy: 10 },
  };

  const BASE_HULLS = [
    {
      id: "hull_frontier", name: "拓荒者级", factionId: "settlers", tagline: "边境通用母舰",
      shape: "frontier", accent: "#b5c46a", bodyLevelReq: 0, relationReq: 0, blueprintCost: {},
      specialSlot: { id: "smelt", name: "矿脉导流舱", queue: "smelt", speedMult: 0.94, effect: "精炼耗时 -6%" },
      layout: { core:[3,3], energy:[3,1], cargo:[4,3], smelt:[4,4], manufacture:[3,2], invent:[2,2], dock:[2,3], command:[3,4], habitat:[3,5] },
    },
    {
      id: "hull_angel_raider", name: "苍穹掠袭舰", factionId: "angel", tagline: "高速突入 / 分散舱列",
      shape: "raider", accent: "#5ad1a0", bodyLevelReq: 0, relationReq: 0, blueprintCost: { credits: 8000 },
      specialSlot: { id: "manufacture", name: "战利品快装位", queue: "manufacture", speedMult: 0.90, effect: "制造耗时 -10%" },
      layout: { core:[3,3], energy:[3,2], cargo:[3,1], smelt:[4,1], manufacture:[2,2], invent:[2,3], dock:[2,4], command:[3,4], habitat:[4,4] },
    },
    {
      id: "hull_blood_oath", name: "赤誓堡垒舰", factionId: "blood", tagline: "纵向装甲 / 中轴指挥",
      shape: "bastion", accent: "#e879a8", bodyLevelReq: 0, relationReq: 8, blueprintCost: { credits: 18000 },
      specialSlot: { id: "manufacture", name: "军规装配位", queue: "manufacture", speedMult: 0.88, effect: "制造耗时 -12%" },
      layout: { core:[3,3], energy:[3,2], cargo:[2,3], smelt:[1,3], manufacture:[4,3], invent:[3,1], dock:[5,3], command:[2,4], habitat:[4,4] },
    },
    {
      id: "hull_mining_ark", name: "矿脉工造方舟", factionId: "mining_guild", tagline: "宽幅工业翼 / 矿冶强化",
      shape: "ark", accent: "#b5793f", bodyLevelReq: 0, relationReq: 4, blueprintCost: { credits: 12000 },
      specialSlot: { id: "smelt", name: "深层熔炼槽", queue: "smelt", speedMult: 0.84, effect: "精炼耗时 -16%" },
      layout: { core:[3,3], energy:[3,2], cargo:[4,2], smelt:[4,3], manufacture:[4,4], invent:[2,2], dock:[5,3], command:[3,4], habitat:[2,4] },
    },
    {
      id: "hull_salvage_union", name: "残骸拼接舰", factionId: "salvage_union", tagline: "非对称拼装 / 模块外露",
      shape: "salvage", accent: "#c9772e", bodyLevelReq: 0, relationReq: 4, blueprintCost: { credits: 16000 },
      specialSlot: { id: "manufacture", name: "回收件快装位", queue: "manufacture", speedMult: 0.90, effect: "制造耗时 -10%" },
      layout: { core:[3,3], energy:[3,2], cargo:[4,2], smelt:[5,2], manufacture:[4,3], invent:[2,3], dock:[2,4], command:[3,4], habitat:[4,4] },
    },
    {
      id: "hull_lone_star", name: "孤星商队母舰", factionId: "lone_star", tagline: "紧凑货运 / 双侧生产线",
      shape: "caravan", accent: "#d8c07a", bodyLevelReq: 0, relationReq: 8, blueprintCost: { credits: 24000 },
      specialSlot: { id: "cargo", name: "冷链货运接口", queue: "manufacture", speedMult: 0.91, effect: "制造耗时 -9%" },
      layout: { core:[3,3], energy:[3,2], cargo:[4,2], smelt:[4,3], manufacture:[2,3], invent:[2,2], dock:[5,3], command:[2,4], habitat:[3,4] },
    },
    {
      id: "hull_abyssal", name: "深空研习母舰", factionId: "abyssal_inst", tagline: "环形实验区 / 发明强化",
      shape: "research", accent: "#9b8fd0", bodyLevelReq: 1, relationReq: 12, blueprintCost: { credits: 32000 },
      specialSlot: { id: "invent", name: "先驱遗物实验位", queue: "invent", speedMult: 0.82, effect: "发明耗时 -18%" },
      layout: { core:[3,3], energy:[3,2], cargo:[4,2], smelt:[4,3], manufacture:[3,4], invent:[2,2], dock:[2,3], command:[2,4], habitat:[4,4] },
    },
    {
      id: "hull_bounty", name: "悬赏者突击母舰", factionId: "bounty_league", tagline: "箭形舰首 / 前线总装",
      shape: "spear", accent: "#b02a1f", bodyLevelReq: 0, relationReq: 8, blueprintCost: { credits: 20000 },
      specialSlot: { id: "manufacture", name: "前线换装位", queue: "manufacture", speedMult: 0.88, effect: "制造耗时 -12%" },
      layout: { core:[3,3], energy:[3,2], cargo:[3,1], smelt:[4,1], manufacture:[4,2], invent:[2,3], dock:[4,3], command:[2,4], habitat:[3,4] },
    },
  ];

  function baseHullById(id) { return BASE_HULLS.find(h => h.id === id) || null; }
  function baseModuleByType(type) { return BASE_MODULES[type] || null; }
  function baseHullSlots(hullOrId) {
    const hull = typeof hullOrId === "string" ? baseHullById(hullOrId) : hullOrId;
    if (!hull) return [];
    const slots = Object.keys(BASE_MODULES).map(type => ({
      id: type, type: type, x: hull.layout[type][0], y: hull.layout[type][1],
      special: hull.specialSlot && hull.specialSlot.id === type ? hull.specialSlot : null,
    }));
    slots.push({ id: "core", type: "core", x: hull.layout.core[0], y: hull.layout.core[1] });
    return slots;
  }
  function createInitialBase() {
    const owned = Object.keys(BASE_MODULES).map(type => ({ id: "module_" + type + "_01", type: type }));
    return {
      coreId: "base_core_01", hullId: "hull_frontier", ownedHullBlueprints: ["hull_frontier"],
      modules: {
        owned: owned,
        installed: owned.map(m => ({ slotId: m.type, moduleId: m.id })),
      },
    };
  }

  // 各级本体电网基础容量（energy）。总供能预算 = 本项 + 已装能源舱数 × ENERGY_OUTPUT。MVP 提议值，待标定。
  const BODY_LEVELS = [
    { lv: 1, name: "空间站",   smelt: 1, manufacture: 1, invent: 0, energy: 80 },
    { lv: 2, name: "星堡",     smelt: 2, manufacture: 2, invent: 1, energy: 180 },
    { lv: 3, name: "星城",     smelt: 3, manufacture: 3, invent: 2, energy: 320 },
    { lv: 4, name: "深空要塞", smelt: 3, manufacture: 3, invent: 3, energy: 520 },
  ];

  function bodyLevelPlan(lv) { return BODY_LEVELS[Math.max(0, Math.min(3, lv))] || BODY_LEVELS[0]; }
  function canBuildAt(shipId, bodyLevel) {
    const s = SHIPS[shipId];
    return !!s && bodyLevel >= s.bodyLevelReq;
  }
  function shipsAtLevel(bodyLevel) {
    return Object.values(SHIPS).filter(s => s.bodyLevelReq <= bodyLevel)
      .sort((a, b) => a.classTier - b.classTier);
  }
  function shipById(id) { return SHIPS[id] || null; }
  // 舰船三防满载（成员 hp 上限来源）
  function maxHp(shipId) {
    const s = SHIPS[shipId];
    return s ? { shield: s.hp.shield, armor: s.hp.armor, structure: s.hp.structure }
             : { shield: 100, armor: 100, structure: 100 };
  }
  function upgradeCost(lv) {
    // lv = 当前等级，返回升到下一级的代价
    const COST = { 0: { credits: 5000, fe_alloy: 100 }, 1: { credits: 20000, ni_alloy: 150, struct: 40 }, 2: { credits: 60000, bo_alloy: 300, struct: 120 }, 3: { credits: 200000, px_alloy: 400, struct: 300 } };
    return COST[lv] || null;
  }

  return { SHIPS, BODY_LEVELS, bodyLevelPlan, canBuildAt, shipsAtLevel, shipById, maxHp, upgradeCost, ENERGY_OUTPUT,
    BASE_MODULES, BASE_HULLS, baseHullById, baseModuleByType, baseHullSlots, createInitialBase };
});
