// Phase 1 验证探针（2026-11-09）：移植 1 代 18 件 class-specific 部件配方 + 改造 buildShip
// 验证点：
//   ① 18 条 class 部件配方齐全，且每条 out/in 键都已注册进 Resources.ALL（无死数据）
//   ② 全部 33 艘舰 SHIPS.cost 全为 class 部件键（无 struct/prop/weapon 残留；Phase 3 后抽象 id 已弃用）
//   ③ 制造链路：注入材料 → enqueue(mk_integrated_hull) → settle → integrated_hull 库存上升
//   ④ 建造链路：buildShip(rookie_corvette) 扣 class 部件(各1) → 入 buildQueue → settle 出船
//   ⑤ 存档往返：部件键已注册，normalize 不丢
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
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat, setTimeout };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { Data, Engine, Core } = sandbox.NSK;
const St = Engine.State, Settle = Engine.Settle, Prod = Engine.Production;
if (sandbox.NSK.Narrative && typeof sandbox.NSK.Narrative.pick === "function") sandbox.NSK.Narrative.pick = () => null;

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log("PASS", name, extra || ""); } else { fail++; console.log("FAIL", name, extra || ""); } }

const PARTS = ["integrated_hull","power_core","functional_system",
  "destroyer_integrated_hull","destroyer_power_core","destroyer_functional_system",
  "cruiser_integrated_hull","cruiser_power_core","cruiser_functional_system",
  "battleship_integrated_hull","battleship_power_core","battleship_functional_system",
  "capital_integrated_hull","capital_power_core","capital_functional_system",
  "supercapital_integrated_hull","supercapital_power_core","supercapital_functional_system"];

// ① 18 条配方齐全 + 键注册
let compFound = 0, compOk = true, compDetail = "";
for (const p of PARTS) {
  const r = Data.Recipes.COMPONENT.find(x => x.out === p);
  if (!r) { compOk = false; compDetail += " 缺失out=" + p; continue; }
  compFound++;
  if (!Data.Resources.ALL[p]) { compOk = false; compDetail += " out未注册=" + p; }
  for (const k in (r.in || {})) if (!Data.Resources.ALL[k]) { compOk = false; compDetail += " in未注册=" + k; }
}
ok("① 18 条 class 部件配方齐全且 in/out 键均已注册", compFound === 18 && compOk, "found=" + compFound + compDetail);

// ② 全部 33 艘舰 cost 全为 class 部件键（无 struct/prop/weapon 残留；Phase 3 后抽象 id 已弃用）
let shipOk = true, shipDetail = "";
const shipIds = Object.keys(Data.Ships.SHIPS || {});
for (const sid of shipIds) {
  const cost = (Data.Ships.shipById(sid) || {}).cost || {};
  for (const k in cost) if (!PARTS.includes(k)) { shipOk = false; shipDetail += " " + sid + ":" + k; }
}
ok("② " + shipIds.length + " 艘舰 cost 全为 class 部件键（无 struct/prop/weapon 残留）", shipOk, shipDetail || "all-good");

// ③ 制造链路
const st = St.defaultState(Date.now(), Data);
for (const k of ["fe_alloy","ni_alloy","planet_lava","planet_gas","bo_alloy","mx_alloy","no_alloy","zr_alloy","px_alloy","morph_alloy","rb_moon","planet_ice","planet_plasma","planet_mag","poly_gas","ultra_pure_poly_gas"])
  st.res[k] = Math.max(st.res[k] || 0, 200);
const beforeHull = st.res.integrated_hull || 0;
Prod.enqueue(st, "manufacture", "mk_integrated_hull", 1);
const enqLen = (st.base.industry.manufactureQueue || []).length;
ok("③a enqueue 制造 integrated_hull 入 manufactureQueue", enqLen >= 1, "len=" + enqLen);
let err3 = null;
try { for (let i = 0; i < 5; i++) Settle.settle(st, st.lastSeen + 3600 * 1000); } catch (e) { err3 = e.message; }
ok("③b 制造期间主循环无异常", !err3, err3 || "");
const afterHull = st.res.integrated_hull || 0;
ok("③c 制造产出 integrated_hull（库存上升）", afterHull > beforeHull, "before=" + beforeHull + " after=" + afterHull);

// ④ 建造链路（Phase 3 后 rookie_corvette 为起始可造舰，cost 各 1）
const st2 = St.defaultState(Date.now(), Data);
for (const k of PARTS) st2.res[k] = Math.max(st2.res[k] || 0, 20);
const b0 = { i: st2.res.integrated_hull, p: st2.res.power_core, f: st2.res.functional_system };
const bRes = Prod.buildShip(st2, "rookie_corvette", 1);
ok("④a buildShip(rookie_corvette) 返回 ok", bRes && bRes.ok, JSON.stringify(bRes));
const b1 = { i: st2.res.integrated_hull, p: st2.res.power_core, f: st2.res.functional_system };
const spentOk = (b0.i - b1.i === 1) && (b0.p - b1.p === 1) && (b0.f - b1.f === 1);
ok("④b buildShip 扣除 rookie_corvette class 部件(各1)", spentOk, JSON.stringify(b0) + "->" + JSON.stringify(b1));
ok("④c 入 buildQueue", (st2.base.industry.buildQueue || []).length >= 1, "len=" + (st2.base.industry.buildQueue || []).length);
const shipsBefore = st2.ships.length;
let err4 = null;
try { for (let i = 0; i < 3; i++) Settle.settle(st2, st2.lastSeen + 3600 * 1000); } catch (e) { err4 = e.message; }
ok("④d 建造期间主循环无异常", !err4, err4 || "");
ok("④e 造出 rookie_corvette（ships 增加）", st2.ships.length > shipsBefore, "ships " + shipsBefore + "->" + st2.ships.length);

// ⑤ 存档往返
let normOk = false, normDetail = "";
try {
  const env = Core.normalize ? Core.normalize(st2) : null;
  normOk = !!(env && env.res && env.res.integrated_hull !== undefined);
  normDetail = env && env.res ? "integrated_hull=" + env.res.integrated_hull : "no-env";
} catch (e) { normDetail = "err:" + e.message; }
ok("⑤ 存档往返安全（部件键已注册，不丢）", normOk, normDetail);

console.log("\nRESULT pass=" + pass + " fail=" + fail);
process.exit(fail > 0 ? 1 : 0);
