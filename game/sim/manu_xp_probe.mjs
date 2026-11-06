// 制造经验移植探针（2026-11-03）
// 验证：① recipeBatchXp 优先取配方/舰船/装备自带 xp（1 代移植真值），缺省回退 速率×时长×0.5；
//       ② 制造队列结算确实按 recipe.xp 发经验（不再硬传 it.dur）；
//       ③ 造船队列此前漏发制造经验，现已补齐（走 manufacture 技能）。
// 用 Node vm 加载全部 UMD 模块，无 DOM，与 skill_matrix 同 harness。
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/storage.js", "js/core/store.js",
  "js/core/save-envelope.js", "js/core/cloud-save-contract.js",
  "js/core/cloud-providers.js", "js/core/cloud-save-service.js", "js/core/persistence.js",
  "js/data/resources.js", "js/data/starmap.js", "js/data/archaeology.js", "js/data/ships.js", "js/data/recipes.js", "js/data/equipment.js",
  "js/data/pirates.js", "js/data/raids.js", "js/data/tech.js",
  "js/data/factions.js", "js/data/names.js", "js/lib/eveidle/data/boosters.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js", "js/engine/npc.js",
  "js/engine/booster.js", "js/engine/mastery.js", "js/engine/tech.js",
  "js/engine/production.js", "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js", "js/engine/sites.js", "js/narrative/events.js",
  "js/engine/settle.js", "js/engine/ship-enhancement.js", "js/engine/archaeology.js", "js/engine/repair.js",
];

const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), "utf8");
  vm.runInContext(code, ctx, { filename: f });
}
const { Data, Engine } = sandbox.NSK;
const St = Engine.State, Settle = Engine.Settle, Prod = Engine.Production;

// 静音活动事件：避免 settle 每 25s 给在岗成员 roll 资源污染断言
if (sandbox.NSK.Narrative && typeof sandbox.NSK.Narrative.pick === "function") {
  sandbox.NSK.Narrative.pick = function () { return null; };
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name, extra || ""); }
  else { fail++; console.log("FAIL", name, extra || ""); }
}

const now = Date.now();
function fresh() {
  const st = St.defaultState(now, Data);
  st.rngSeed = 0x5EED1234;
  for (const k in st.res) st.res[k] = 999999;
  st.res.credits = 9999999;
  for (const m of st.members) {
    m.destroyed = false; m.assignment = null; m.status = "idle";
    m.passion = {};
    for (const k of St.SKILL_KEYS) m.passion[k] = "none";
    m.mods = { creditMult: {}, yieldMult: {}, xpMult: {}, learnMult: 1 };
    m.fitted = { high: [], mid: [], low: [], rig: [] };
    m.enhancementLevel = 0;
    m.skills = {};
    for (const k of St.SKILL_KEYS) m.skills[k] = 0;
  }
  return st;
}
// 让某成员唯一在场，并驻指定工业模块（manufacture / booster 等）
function stationAt(st, slot, skill) {
  const m = st.members[0];
  st.members = [m];
  m.passion[skill] = "minor"; // 倍率 1.0，便于断言
  m.assignment = { type: "station", slotId: slot };
  return m;
}
function advance(st, sec) {
  for (let i = 1; i <= sec; i++) Settle.settle(st, now + i * 1000);
}

// ---------- A. recipeBatchXp 解析器（单元） ----------
console.log("== A. recipeBatchXp 解析 ==");
const A = fresh();
ok("manufacture 取 mk_struct.xp=39", Settle.recipeBatchXp(A, "manufacture", { recipeId: "mk_struct" }) === 39,
   "got=" + Settle.recipeBatchXp(A, "manufacture", { recipeId: "mk_struct" }));
ok("manufacture mk_prop.xp=24", Settle.recipeBatchXp(A, "manufacture", { recipeId: "mk_prop" }) === 24);
ok("manufacture mk_weapon.xp=9", Settle.recipeBatchXp(A, "manufacture", { recipeId: "mk_weapon" }) === 9);
ok("equip 取 t1_small_laser.xp=12", Settle.recipeBatchXp(A, "equip", { recipeId: "t1_small_laser" }) === 12,
   "got=" + Settle.recipeBatchXp(A, "equip", { recipeId: "t1_small_laser" }));
ok("build 取 frigate.xp=15", Settle.recipeBatchXp(A, "build", { shipId: "frigate" }) === 15,
   "got=" + Settle.recipeBatchXp(A, "build", { shipId: "frigate" }));
ok("build 取 supercapital.xp=408", Settle.recipeBatchXp(A, "build", { shipId: "supercapital" }) === 408);
// 缺省回退：发明无 xp 字段 → 速率×时长×0.5
// 精炼：2026-11-06 已对回 1 代，配方自带 xp（SMELTING_RECIPES.baseXP 真值），不再走回退
ok("smelt 取 smelt_fe_alloy.xp=10 (1代真值)", Settle.recipeBatchXp(A, "smelt", { recipeId: "smelt_fe_alloy" }) === 10,
   "got=" + Settle.recipeBatchXp(A, "smelt", { recipeId: "smelt_fe_alloy" }));
ok("smelt 取 smelt_px_alloy.xp=580 (1代真值)", Settle.recipeBatchXp(A, "smelt", { recipeId: "smelt_px_alloy" }) === 580);
ok("smelt 取 smelt_morph_alloy.xp=580 (同 Lv4 档)", Settle.recipeBatchXp(A, "smelt", { recipeId: "smelt_morph_alloy" }) === 580);
ok("smelt 缺 recipeId 仍回退 0.9×10×0.5=4.5", Math.abs(Settle.recipeBatchXp(A, "smelt", { dur: 10 }) - 4.5) < 1e-9);
ok("invent 回退 0.6×40×0.5=12", Math.abs(Settle.recipeBatchXp(A, "invent", { dur: 40 }) - 12) < 1e-9);
// 增强剂：已接 1 代 xp 真值（BOOSTER_RECIPES），不再走回退
ok("booster 取 reaction_accelerant_n.xp=13", Settle.recipeBatchXp(A, "booster", { recipeId: "reaction_accelerant_n" }) === 13,
   "got=" + Settle.recipeBatchXp(A, "booster", { recipeId: "reaction_accelerant_n" }));
ok("booster 取 reaction_chain_proliferation_l.xp=350", Settle.recipeBatchXp(A, "booster", { recipeId: "reaction_chain_proliferation_l" }) === 350);
// 增强剂缺 recipeId（防御）仍回退 0.6×30×0.5=9
ok("booster 缺 recipeId 回退 9", Math.abs(Settle.recipeBatchXp(A, "booster", { dur: 30 }) - 9) < 1e-9);

// ---------- B. 制造队列端到端：按 recipe.xp 发经验 ----------
console.log("== B. 制造队列结算（mk_struct×3）==");
const B = fresh();
const bm = stationAt(B, "manufacture", "manufacture");
const beforeB = bm.skills.manufacture || 0;
const enqB = Prod.enqueue(B, "manufacture", "mk_struct", 3);
ok("入队成功", enqB.ok === true, JSON.stringify(enqB));
ok("队列项携带 recipeId", (B.base.industry.manufactureQueue[0] || {}).recipeId === "mk_struct");
advance(B, 600);
const afterB = bm.skills.manufacture || 0;
const deltaB = afterB - beforeB;
ok("manufacture xp 增长 = 39×3×1.0 = 117", Math.abs(deltaB - 117) < 1e-6, "delta=" + deltaB);
ok("mk_struct 三批已全部完成（队列清空）", (B.base.industry.manufactureQueue || []).length === 0);
ok("产出 struct 已入库", (B.res.struct || 0) > 0, "struct=" + (B.res.struct || 0));

// ---------- B2. 精炼队列端到端：按配方 xp（1代 baseXP 真值）发经验 ----------
console.log("== B2. 精炼队列结算（smelt_fe_alloy×3）==");
const B2 = fresh();
const b2m = stationAt(B2, "smelt", "refine");
const beforeB2 = b2m.skills.refine || 0;
const enqB2 = Prod.enqueue(B2, "smelt", "smelt_fe_alloy", 3);
ok("入队成功", enqB2.ok === true, JSON.stringify(enqB2));
ok("队列项携带 recipeId", (B2.base.industry.smeltQueue[0] || {}).recipeId === "smelt_fe_alloy");
advance(B2, 600);
const afterB2 = b2m.skills.refine || 0;
const deltaB2 = afterB2 - beforeB2;
ok("refine xp 增长 = 10×3×1.0 = 30（1代 baseXP 真值，非 0.9×dur×0.5 占位）", Math.abs(deltaB2 - 30) < 1e-6, "delta=" + deltaB2);
ok("smelt_fe_alloy 三批已全部完成（队列清空）", (B2.base.industry.smeltQueue || []).length === 0);
ok("产出 fe_alloy 已入库", (B2.res.fe_alloy || 0) > 0, "fe_alloy=" + (B2.res.fe_alloy || 0));

// ---------- C. 造船队列端到端：补发制造经验（此前漏发） ----------
console.log("== C. 造船队列结算（frigate×1，验证补发）==");
const C = fresh();
const cm = stationAt(C, "manufacture", "manufacture");
const beforeC = cm.skills.manufacture || 0;
ok("造船前 manufacture xp 为 0", beforeC === 0);
const enqC = Prod.buildShip(C, "frigate", 1);
ok("造船入队成功", enqC.ok === true, JSON.stringify(enqC));
advance(C, 300);
const afterC = cm.skills.manufacture || 0;
const deltaC = afterC - beforeC;
ok("造船发 manufacture xp = 15×1.0 = 15（此前为 0）", Math.abs(deltaC - 15) < 1e-6, "delta=" + deltaC);
ok("frigate 已入库 state.ships", (C.ships || []).length >= 1, "ships=" + (C.ships || []).length);

// ---------- D. 增强剂制造端到端：1 代 xp 真值 → 科研经验 ----------
console.log("== D. 增强剂制造结算（reaction_accelerant_n×1 → 科研）==");
const Dst = fresh();
const dm = stationAt(Dst, "booster", "research");
const beforeD = dm.skills.research || 0;
ok("增强剂制造前 research xp 为 0", beforeD === 0);
Dst.ownedBlueprints = ["booster:reaction_accelerant_n"]; // 真实路径：玩家持有该蓝图
Dst.res["planet_ice"] = 999999; Dst.res["tactic:t2"] = 999999; // 注增强剂原料（remapCost 后：planetary:同位素→planet_ice，special:活性战术凝胶→tactic:t2）
const enqD = Prod.enqueue(Dst, "booster", "reaction_accelerant_n", 1);
ok("增强剂入队成功", enqD.ok === true, JSON.stringify(enqD));
advance(Dst, 300);
const afterD = dm.skills.research || 0;
const deltaD = afterD - beforeD;
ok("增强剂制造发 research xp = 13×1.0 = 13（此前为 0.6×73×0.5≈21.9 占位）", Math.abs(deltaD - 13) < 1e-6, "delta=" + deltaD);
ok("增强剂已入库 res", (Dst.res["booster:reaction_accelerant_n"] || 0) > 0, "res=" + (Dst.res["booster:reaction_accelerant_n"] || 0));

// ---------- E. 科技研究经验：方案 A 固定 xp（替代旧 node.sec 当 XP） ----------
console.log("== E. 科技研究经验标定（node.xp 固定定值）==");
const TechD = Data.Tech;
const nodes = TechD.NODES || (TechD.byId ? Object.values(TechD.byId) : []);
let allHaveXp = true, sumXp = 0;
for (const nd of nodes) {
  if (typeof nd.xp !== "number") { allHaveXp = false; continue; }
  sumXp += nd.xp * (nd.maxLevel || 1); // 多级别节点每级发一次（advance 逐级完成）
}
ok("全部科技节点均含 xp 字段", allHaveXp, "节点数=" + nodes.length);
ok("全树跑满各级 xp 合计 = 840（→ 科研 Lv 7）", sumXp === 840, "sum=" + sumXp);

const E = fresh();
const em = stationAt(E, "invent", "research"); // 驻发明舱，发 research 经验
const beforeE = em.skills.research || 0;
ok("研究前 research xp 为 0", beforeE === 0);
E.tech = E.tech || {}; E.tech.levels = E.tech.levels || {}; E.tech.prog = E.tech.prog || {};
E.tech.active = { id: "combat_squad_1", startedAt: now - 2000, endsAt: now - 1000, base: 0 }; // 已到结束时刻
const adv = Engine.Tech.advance(E, now);
ok("advance 返回完成节点 combat_squad_1", adv && adv.node && adv.node.id === "combat_squad_1", JSON.stringify(adv && adv.node));
const afterE = em.skills.research || 0;
const deltaE = afterE - beforeE;
ok("科技研究发 research xp = 40（combat_squad_1.xp，不再是 sec=1800）", Math.abs(deltaE - 40) < 1e-6, "delta=" + deltaE);
ok("研究节点已升级（levels=1）", (E.tech.levels["combat_squad_1"] || 0) === 1);

console.log("\n==== 制造经验探针 " + pass + " passed, " + fail + " failed ====");
process.exit(fail ? 1 : 0);
