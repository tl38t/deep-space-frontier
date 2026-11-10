// Phase 5 验证探针（2026-11-10）：战斗舰 bonuses 接线（伤害/命中/HP容量/维修/紧急维修）
// 验证点：
//   ① 数据层：28 战斗舰 bonuses 精确等于 1 代提取（_phase5_bonuses.json）；无 targetingspeed/speed 死键
//   ② 引擎·HP容量：maxHp 对含 capacity 加成舰放大（rookie shield 240×1.05=252；atron structure 300×1.10=330）
//   ③ 引擎·武器伤害：同激光武器下，rookie_corvette(laserDamage 0.02) 的 laser DPS ≈ kestrel(无) ×1.02
//   ④ 引擎·维修：atron(structureRepair 2) 的 repairRaw ≈ kestrel(无) ×3.0；emergencyRepair 捕获=1 vs 0
//   ⑤ 引擎·紧急维修：tiny hp 强制结构比<0.7，atron 的 incomingDps < kestrel（紧急维修生效）
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
const St = Engine.State, Disp = Engine.Dispatch, Combat = Engine.Combat;
if (sandbox.NSK.Narrative && typeof sandbox.NSK.Narrative.pick === "function") sandbox.NSK.Narrative.pick = () => null;

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log("PASS", name, extra || ""); } else { fail++; console.log("FAIL", name, extra || ""); } }
function findCombatNode(st) { return st.starMap.nodes.find(n => Data.Raids.raidAt(st.starMap, n.id)) || null; }

// ① 数据层：精确比对
const expect = JSON.parse(fs.readFileSync(path.join(ROOT, "sim/_phase5_bonuses.json"), "utf8"));
const ids = Object.keys(expect);
let dataOk = true, dataDetail = "";
for (const id of ids) {
  const b = (Data.Ships.shipById(id) || {}).bonuses || {};
  const e = expect[id];
  for (const k of Object.keys(e)) {
    const got = b[k]; const want = e[k];
    const close = (typeof want === "number") ? Math.abs((got||0) - want) < 1e-9 : got === want;
    if (!close) { dataOk = false; dataDetail += " " + id + "." + k + " 期望" + want + " 实得" + got; }
  }
  // 纪律：无 targetingspeed/speed
  if ("targetingSpeed" in b || "speed" in b) { dataOk = false; dataDetail += " " + id + " 含未接线死键"; }
}
ok("① 28 战斗舰 bonuses 精确等于 1 代提取且无死键", dataOk && ids.length === 28, "n=" + ids.length + (dataDetail ? dataDetail : " all-good"));

// ② HP 容量
const mhRookie = Data.Ships.maxHp("rookie_corvette");
const mhAtron = Data.Ships.maxHp("atron");
ok("②a rookie_corvette shield 240×1.05=252", Math.abs(mhRookie.shield - 252) < 1e-6, "shield=" + mhRookie.shield);
ok("②b atron structure 300×1.10=330（armor/shield 不变）", Math.abs(mhAtron.structure - 330) < 1e-6 && mhAtron.shield === 100 && mhAtron.armor === 100, "s/a/st=" + mhAtron.shield + "/" + mhAtron.armor + "/" + mhAtron.structure);
// ②c kestrel 仅含 armorCapacity:0.1（无 shield/structure capacity 加成）
// → 证明乘区只命中带 capacity 的字段，其余字段保持本体值不变
const mhK = Data.Ships.maxHp("kestrel");
ok("②c kestrel 仅 armor 放大、shield/structure 保持本体", mhK.armor === 330 && mhK.shield === 100 && mhK.structure === 100, "s/a/st=" + mhK.shield + "/" + mhK.armor + "/" + mhK.structure);

// 战斗节点 bootstrap
function combatState(shipId, fitted, hp) {
  const st = St.defaultState(Date.now(), Data);
  while (st.members.length < 2) st.members.push(St.makeMember(Data, Math.random, st.base.nodeId));
  const m = st.members[0];
  m.shipId = shipId;
  m.skills = {};                 // 清零技能，隔离舰船加成（lv=0 → 技能乘区=1）
  m.fitted = fitted;
  m.hp = hp || { shield: 100, armor: 100, structure: 100 };
  const node = findCombatNode(st);
  const r = Disp.assign(st, m.id, "combat", { nodeId: node.id });
  return { st, node, r };
}
const LASER = { high: ["t1_small_laser"], mid: [], low: [], rig: [] };
const REPAIR = { high: [], mid: [], low: ["t1_structure_repairer"], rig: [] };

// ③ 武器伤害 A/B
const A = combatState("rookie_corvette", LASER);
const B = combatState("kestrel", LASER);
const Pa = Combat.prepareNode(A.st, A.node.id);
const Pb = Combat.prepareNode(B.st, B.node.id);
const ratioLaser = (Pa && Pb && Pb.dpsByType.laser > 0) ? Pa.dpsByType.laser / Pb.dpsByType.laser : 0;
ok("③ rookie(laserDamage0.02) laser DPS ≈ kestrel ×1.02", ratioLaser >= 1.015 && ratioLaser <= 1.025, "ratio=" + ratioLaser.toFixed(4));

// ④ 维修 A/B + emergency 捕获
const C = combatState("atron", REPAIR);
const D = combatState("kestrel", REPAIR);
const Pc = Combat.prepareNode(C.st, C.node.id);
const Pd = Combat.prepareNode(D.st, D.node.id);
const ratioRep = (Pc && Pd && Pd.repairRaw > 0) ? Pc.repairRaw / Pd.repairRaw : 0;
ok("④a atron(structureRepair2) repairRaw ≈ kestrel ×3.0", ratioRep >= 2.9 && ratioRep <= 3.1, "ratio=" + ratioRep.toFixed(3));
ok("④b atron emergencyRepair 捕获=1，kestrel=0", (Pc && Pc.emergencyRepair === 1) && (Pd && Pd.emergencyRepair === 0), "atron=" + (Pc&&Pc.emergencyRepair) + " kestrel=" + (Pd&&Pd.emergencyRepair));

// ⑤ 紧急维修功能：tiny hp 强制结构比<0.7，atron incomingDps < kestrel
const E = combatState("atron", REPAIR, { shield: 0, armor: 0, structure: 1 });
const F = combatState("kestrel", REPAIR, { shield: 0, armor: 0, structure: 1 });
const advE = Combat.advance(E.st, E.node.id, 3600, 0, false);
const advF = Combat.advance(F.st, F.node.id, 3600, 0, false);
ok("⑤ tiny hp 下 atron 紧急维修使其 incomingDps < kestrel", advE.incomingDps < advF.incomingDps, "atron=" + advE.incomingDps.toFixed(2) + " kestrel=" + advF.incomingDps.toFixed(2));

console.log("\nRESULT phase5: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
