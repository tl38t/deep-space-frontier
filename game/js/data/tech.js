// ================================================================
// 深空星疆 —— Data.Tech：科技树数据（T1 扩展版：战斗编制 + 6 个新乘区）
// ----------------------------------------------------------------
// 1 代有完整研究系统（js/data/research.js：45 节点 / 6 大类 / era 0~4 / 前置树，
// 主树时间预算 ≈ 92.77 天）。本作按同一 schema 逐步扩，不改引擎。
//
// 本次扩展（方案 A）：在原有「战斗编制」支线之外，新增 6 个乘区节点，
// 分别接进 命中 / 剿匪赏金 / 冶炼产出 / 制造耗时 / 跳数惩罚 / 燃料 六条引擎热路径。
// 分类列仍为 战斗 / 工业 / 后勤 三列（UI 按 cat 分列，不改布局）。
//
// 节点字段：
//   id       稳定键（不含中文，存档直接存它）
//   name     显示名
//   cat      分类（combat / industry / exploration / logistics …），**同时决定科技树列号**
//   maxLevel 最高等级（1 = 单级节点，边「单级」徽章；>1 在方块内画等级 pip）
//   requires 前置 [{id, level}]，空数组 = 无前置
//   cost     星币花费（1 代研究不花星币只花时间；本作无科研工时货币，故用星币做门槛）
//   sec      研究时长（秒，真实时间，离线同样推进）
//   bonus    { squadCap: n } = **每级**给同一据点增加的派遣上限（容量 = BASE + Σ bonus×当前级）
//   effects  每级效果文案（数组下标 = 等级-1），详情面板逐行列出、已获得/下一级上色
//   desc     说明
//
// ⚠️ 数值（cost / sec）全部是**提议值**，待试玩标定，不是最终数值。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Tech = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Tech = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 编制基础容量：未研究任何科技时，一个据点只能派 1 人
  const BASE_SQUAD_CAP = 1;

  // 科技树的列（1 代用「时代 era」分列，本作用「分类」分列，其余布局/连线算法完全同构）。
  // 列顺序 = 屏幕从左到右；color 是列头条的底色（1 代也是每列一个色块）。
  const COLS = [
    { cat: "combat", label: "战斗", code: "COMBAT", color: "#4a2430" },
    { cat: "industry", label: "工业", code: "INDUSTRY", color: "#4a3a22" },
    { cat: "logistics", label: "后勤", code: "LOGISTICS", color: "#1f3d4a" },
  ];

  const NODES = [
    {
      id: "combat_squad_1",
      name: "战斗编制 I",
      cat: "combat",
      maxLevel: 1,
      requires: [],
      cost: { credits: 6000 },
      sec: 30 * 60,
      xp: 40,                    // 科技研究经验（方案 A 固定定值，与增强剂同量级；不再用 sec 当 XP）
      bonus: { squadCap: 1 },
      effects: ["同一据点可同时派遣 2 名成员。"],
      desc: "为剿匪小队配一名副手。两人可以互相掩护，也让据点能在同一轮里多打一发齐射。",
    },
    {
      id: "combat_squad_2",
      name: "战斗编制 II",
      cat: "combat",
      maxLevel: 1,
      requires: [{ id: "combat_squad_1", level: 1 }],
      cost: { credits: 36000 },
      sec: 2 * 3600,
      xp: 120,                   // 单级最长研究 → 最高单节点经验
      bonus: { squadCap: 1 },
      effects: ["同一据点可同时派遣 3 名成员。"],
      desc: "把小队扩到满员三船。三船齐射的收益不是线性的：编队越厚，越能顶住精英据点的第一轮爆发。",
    },

    // —— 以下 6 个节点是方案 A 新增乘区。bonus 字段即引擎消费的乘区键 ——
    //    命中（加性，独立于指挥塔的命中加成）、剿匪赏金（唯一赏金源，不接精通点死代码）
    {
      id: "combat_aim",
      name: "精准瞄准",
      cat: "combat",
      maxLevel: 3,
      requires: [{ id: "combat_squad_1", level: 1 }],
      cost: { credits: 12000 },
      sec: 30 * 60,
      xp: 40,                    // 每级 40（3 级共 120）
      bonus: { hitAdd: 3 },
      effects: ["命中 +3", "命中 +6（累计）", "命中 +9（累计）"],
      desc: "校准瞄具与弹道计算机，让每一发都更可能咬住目标。与指挥塔的全局命中加成叠加（不同乘区，非双源）。",
    },
    {
      id: "bounty_1",
      name: "战利品协议",
      cat: "combat",
      maxLevel: 3,
      requires: [{ id: "combat_squad_1", level: 1 }],
      cost: { credits: 18000 },
      sec: 60 * 60,
      xp: 40,                    // 每级 40（3 级共 120）
      bonus: { bountyMult: 0.10 },
      effects: ["剿匪星币赏金 +10%", "赏金 +20%（累计）", "赏金 +30%（累计）"],
      desc: "与据点谈妥分成、优化战利品处置流程。本作剿匪赏金的**唯一**乘区来源（精通点的赏金节点已弃用，不在此重复接线）。",
    },

    //    冶炼产出（仅 smelt 队列）、制造耗时（仅 manufacture 队列，与精通点·工业调度的独立乘区叠加）
    {
      id: "smelt_1",
      name: "精炼工艺",
      cat: "industry",
      maxLevel: 3,
      requires: [],
      cost: { credits: 9000 },
      sec: 30 * 60,
      xp: 40,                    // 每级 40（3 级共 120）
      bonus: { smeltYield: 0.08 },
      effects: ["冶炼产出 +8%", "产出 +16%（累计）", "产出 +24%（累计）"],
      desc: "更好的坩埚与溶剂配比，让每炉矿材多炼出一点金属。只作用于冶炼队列。",
    },
    {
      id: "manu_1",
      name: "柔性产线",
      cat: "industry",
      maxLevel: 2,
      requires: [],
      cost: { credits: 15000 },
      sec: 45 * 60,
      xp: 50,                    // 每级 50（2 级共 100）
      bonus: { manuSpeed: 0.05 },
      effects: ["制造耗时 -5%", "耗时 -10%（累计）"],
      desc: "模块化工位与并行调度，压缩装备制造（总装/部件）的工时。与精通点·工业调度是两条独立耗时乘区。",
    },

    //    跳数惩罚（在精通点·航线优化之后再减，最低地板 0.05）、燃料（跃迁消耗乘区）
    {
      id: "hop_1",
      name: "航线优化",
      cat: "logistics",
      maxLevel: 3,
      requires: [],
      cost: { credits: 8000 },
      sec: 30 * 60,
      xp: 40,                    // 每级 40（3 级共 120）
      bonus: { hopReduce: 0.02 },
      effects: ["每跳距离惩罚 -2pp", "惩罚 -4pp（累计）", "惩罚 -6pp（累计）"],
      desc: "预计算捷径与中继点，削弱远程派遣的物流衰减。在精通点·航线优化的基础上再减（两条独立减项，非重复逻辑）。",
    },
    {
      id: "fuel_1",
      name: "跃迁增效",
      cat: "logistics",
      maxLevel: 2,
      requires: [],
      cost: { credits: 12000 },
      sec: 45 * 60,
      xp: 50,                    // 每级 50（2 级共 100）
      bonus: { fuelEff: 0.08 },
      effects: ["跃迁燃料消耗 -8%", "消耗 -16%（累计）"],
      desc: "回收跃迁余辉、优化曲速包络，让每次跃迁少喝一口燃料。",
    },
  ];

  const CAT_CN = { combat: "战斗", industry: "工业", exploration: "探索", logistics: "后勤", foundation: "基础" };

  function byId(id) { return NODES.find(n => n.id === id) || null; }
  function all() { return NODES.slice(); }
  function byCat(cat) { return NODES.filter(n => n.cat === cat); }
  function maxLevelOf(node) { return (node && node.maxLevel > 0) ? node.maxLevel : 1; }
  function isSingle(node) { return maxLevelOf(node) === 1; }
  // 列内列号（找不到分类 → -1，UI 会把它丢进最后一列避免节点凭空消失）
  function colOf(node) {
    const i = COLS.findIndex(c => c.cat === (node && node.cat));
    return i < 0 ? COLS.length - 1 : i;
  }
  // 前置是否全满足（lv 由调用方给出 getLevel(id) 函数，避免数据层依赖 state）
  function prereqOk(node, getLevel) {
    return (node.requires || []).every(r => (getLevel(r.id) || 0) >= (r.level || 1));
  }

  return { NODES, BASE_SQUAD_CAP, COLS, CAT_CN, byId, all, byCat, maxLevelOf, isSingle, colOf, prereqOk };
});
