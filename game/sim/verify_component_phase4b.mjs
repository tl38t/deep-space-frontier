// Phase 4b 验证探针（2026-11-10）：考古舰 archaeologyFailureDamageReduction 活字段接线
// 验证点：
//   ① 数据层：5 艘考古舰 archaeologyScanStrength / archaeologyFailureDamageReduction 真值（对回 1 代 bonuses）
//   ② 纪律：工业/战斗舰不含此键（不制造死数据泄漏）
//   ③ 引擎层：失败伤害 frac = profile.hullDamageFrac(band) × (1-stabRed) × (1-shipFdr)
//      A=rifter(FDR 0) 与 B=illuminator(FDR 0.20) 同 band 同 profile，期望 frac_B/frac_A ≈ 0.80
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
const St = Engine.State, Arch = Engine.Archaeology;
if (sandbox.NSK.Narrative && typeof sandbox.NSK.Narrative.pick === "function") sandbox.NSK.Narrative.pick = () => null;

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log("PASS", name, extra || ""); } else { fail++; console.log("FAIL", name, extra || ""); } }

// ① 数据层：5 艘考古舰双字段真值（对回 1 代 bonuses）
const archExpect = {
  heron:       { scan: 10,  fdr: 0.00 },
  tracer:      { scan: 25,  fdr: 0.05 },
  starmap:     { scan: 50,  fdr: 0.10 },
  farscope:    { scan: 80,  fdr: 0.15 },
  illuminator: { scan: 120, fdr: 0.20 },
};
let dataOk = true, dataDetail = "";
for (const [id, e] of Object.entries(archExpect)) {
  const s = Data.Ships.shipById(id);
  if (!s) { dataOk = false; dataDetail += " " + id + " 缺失"; continue; }
  if (s.archaeologyScanStrength !== e.scan) { dataOk = false; dataDetail += " " + id + ".scan 期望" + e.scan + " 实得" + s.archaeologyScanStrength; }
  if (Math.abs((s.archaeologyFailureDamageReduction || 0) - e.fdr) > 1e-9) { dataOk = false; dataDetail += " " + id + ".fdr 期望" + e.fdr + " 实得" + s.archaeologyFailureDamageReduction; }
}
ok("① 5 艘考古舰 archaeologyScanStrength / archaeologyFailureDamageReduction 真值正确", dataOk, dataDetail || "all-good");

// ② 纪律：工业/战斗舰不应含 archaeologyFailureDamageReduction（不制造死数据泄漏）
let leakOk = true, leakDetail = "";
for (const id of ["rifter", "miner_frigate", "dolphin", "orca", "firmament"]) {
  const s = Data.Ships.shipById(id);
  if (s && "archaeologyFailureDamageReduction" in s) { leakOk = false; leakDetail += " " + id + " 误含 FDR"; }
  if (s && s.bonuses && "archaeologyFailureDamageReduction" in s.bonuses) { leakOk = false; leakDetail += " " + id + ".bonuses 误含 FDR"; }
}
ok("② 工业/战斗舰不含 archaeologyFailureDamageReduction（无死数据泄漏）", leakOk, leakDetail || "all-good");

// ③ 引擎层：失败伤害 frac A/B 比对
function mkMem(shipId) {
  return {
    id: "m_" + shipId, name: "tester", shipId,
    skills: { archaeology: 0 },
    fitted: {},
    hp: { shield: 100, armor: 100, structure: 100 },
    destroyed: false, assignment: null, status: "idle",
  };
}
// 强制取一次失败（!success 且 !avoided）的 hullDamage.frac
function captureFailFrac(shipId) {
  const state = { rngSeed: 0x51A1, archCounter: 0 };
  const body = { band: 1, name: "测试遗址" };
  for (let i = 0; i < 3000; i++) {
    const m = mkMem(shipId);
    const r = Arch.cycle(state, m, body, "salvage", null);
    if (!r.success && !r.hullDamage.avoided) return r.hullDamage.frac;
  }
  return null;
}
const fracA = captureFailFrac("rifter");        // FDR 0
const fracB = captureFailFrac("illuminator");   // FDR 0.20
const ratio = (fracA && fracB) ? fracB / fracA : 0;
ok("③a 两舰均能在有限步内触发失败损伤", fracA != null && fracB != null, "fracA=" + fracA + " fracB=" + fracB);
ok("③b illum(FDR0.20) / rifter(FDR0) 失败 frac 比值 ≈ 0.80", ratio >= 0.78 && ratio <= 0.82, "ratio=" + ratio.toFixed(4));

console.log("\nRESULT phase4b: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
