// ================================================================
// 深空星疆 —— Data.Tech：科技树数据（T1 最小版：只放战斗编制一条支线）
// ----------------------------------------------------------------
// 1 代有完整研究系统（js/data/research.js：45 节点 / 6 大类 / era 0~4 / 前置树，
// 主树时间预算 ≈ 92.77 天）。本作先只落「战斗编制」这一条支线，
// 其余分支等数值与玩法标定完再按同一 schema 扩，不改引擎。
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
      bonus: { squadCap: 1 },
      effects: ["同一据点可同时派遣 3 名成员。"],
      desc: "把小队扩到满员三船。三船齐射的收益不是线性的：编队越厚，越能顶住精英据点的第一轮爆发。",
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
