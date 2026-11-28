// 临时定向自检：rig 数据 / 谐振 / 燃料加算 / 拆卸即毁。验证后删除，不进探针套件。
import fs from "fs";
import vm from "vm";
import path from "path";
const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/storage.js", "js/core/equip-instances.js", "js/core/store.js",
  "js/core/save-envelope.js", "js/core/cloud-save-contract.js", "js/core/cloud-providers.js",
  "js/core/cloud-save-service.js", "js/core/persistence.js",
  "js/data/resources.js", "js/data/starmap.js", "js/data/archaeology.js", "js/data/archaeology-content.js",
  "js/data/ships.js", "js/data/recipes.js", "js/data/equipment.js", "js/data/pirates.js", "js/data/raids.js",
  "js/data/tech.js", "js/data/factions.js", "js/data/names.js", "js/lib/eveidle/data/boosters.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js", "js/engine/npc.js",
  "js/engine/booster.js", "js/engine/mastery.js", "js/engine/tech.js", "js/engine/production.js",
  "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js", "js/engine/sites.js",
  "js/narrative/events.js", "js/engine/settle.js", "js/engine/ship-enhancement.js",
  "js/engine/rig-resonance.js", "js/engine/archaeology.js", "js/engine/repair.js",
];
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { Data, Engine, Core } = sandbox.NSK;
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log("PASS", n, e || ""); } else { fail++; console.log("FAIL", n, e || ""); } };

// 1. 数据矩阵
const rigs = Data.Equipment.all().filter(x => x.slot === "rig");
const groups = new Set(rigs.map(r => r.stackGroup));
ok("rig数据:13系", groups.size === 13, "groups=" + groups.size);
ok("rig数据:65+5件", rigs.length === 70, "total=" + rigs.length);
ok("rig数据:扫描T5=0.20", Data.Equipment.byId("rig_archaeology_scan_v").bonuses.archaeologyScanPercent === 0.20);
ok("rig数据:燃料T1=0.04加算", Data.Equipment.byId("rig_archaeology_fuel_i").bonuses.archaeologyFuelEfficiency === 0.04);

// 2. 谐振数学
const RR = Engine.RigResonance;
ok("谐振:S(1)=1", Math.abs(RR.stackPenalty(0) - 1) < 1e-9, RR.stackPenalty(0).toFixed(4));
ok("谐振:S(2)≈0.869", Math.abs(RR.stackPenalty(1) - 0.869) < 0.002, RR.stackPenalty(1).toFixed(4));
ok("谐振:S(5)≈0.106", Math.abs(RR.stackPenalty(4) - 0.106) < 0.002, RR.stackPenalty(4).toFixed(4));

// 3. 同系列2件降序惩罚（扫描 T5+T1：0.20×1 + 0.08×S(2)）
const st = Engine.State.defaultState(Date.now(), Data);
const m = st.members[0];
m.fitted.rig = [
  Core.EquipInstances.create(st, "rig_archaeology_scan_i", []),
  Core.EquipInstances.create(st, "rig_archaeology_scan_v", []),
];
const mods = RR.modifiersOf(st, m);
const expect = 0.20 * 1 + 0.08 * RR.stackPenalty(1);
ok("谐振:同系2件降序惩罚", Math.abs(mods.archaeologyScanPercent - expect) < 1e-9,
   "got=" + mods.archaeologyScanPercent.toFixed(6) + " expect=" + expect.toFixed(6));

// 4. 词条谐振外直加：给小件挂 0.05 词条，应额外直加不被 S(2) 衰减
const uidSmall = m.fitted.rig[0];
st.equipInstances[uidSmall].affixes = [{ bonusKey: "archaeologyScanPercent", value: 0.05 }];
const mods2 = RR.modifiersOf(st, m);
ok("谐振:词条直加不吃惩罚", Math.abs(mods2.archaeologyScanPercent - (expect + 0.05)) < 1e-9,
   "got=" + mods2.archaeologyScanPercent.toFixed(6));

// 5. 燃料加算：船体 1.00 - T5 0.10 = 0.90
const st2 = Engine.State.defaultState(Date.now(), Data);
const m2 = st2.members[0];
m2.fitted.rig = [Core.EquipInstances.create(st2, "fe_rig_t5", [])];
const fe = Engine.Settle.fuelEfficiencyMult(st2, m2);
const shipEff = Data.Ships.shipById(m2.shipId).fuelEfficiency;
ok("燃料:加算max(0,船体−节省)", Math.abs(fe - Math.max(0, shipEff - 0.10)) < 1e-9,
   "fe=" + fe.toFixed(4) + " ship=" + shipEff);

// 6. 拆卸即毁：rig 卸下不返库存、实例销毁
const st3 = Engine.State.defaultState(Date.now(), Data);
const m3 = st3.members[0];
st3.equipment["rig_shield_capacity_i"] = 1;
const fitR = Engine.Production.fitEquipment(st3, m3.id, "rig", "rig_shield_capacity_i");
ok("拆卸:装配成功", fitR.ok && Core.EquipInstances.looksLikeUid(m3.fitted.rig[0]), JSON.stringify(fitR));
const uidR = m3.fitted.rig[0];
const unfitR = Engine.Production.unfitEquipment(st3, m3.id, "rig", uidR);
ok("拆卸:返回destroyed标志", unfitR.destroyed === true, JSON.stringify(unfitR));
ok("拆卸:库存不返还", (st3.equipment["rig_shield_capacity_i"] || 0) === 0);
ok("拆卸:实例已销毁", !st3.equipInstances[uidR]);

// 7. 普通装备卸下仍返库存（回归）
const st4 = Engine.State.defaultState(Date.now(), Data);
const m4 = st4.members[0];
st4.equipment["t1_small_laser"] = 1;
Engine.Production.fitEquipment(st4, m4.id, "high", "t1_small_laser");
const unfitN = Engine.Production.unfitEquipment(st4, m4.id, "high", m4.fitted.high[0]);
ok("拆卸:普通装备仍返库存", unfitN.destroyed !== true && (st4.equipment["t1_small_laser"] || 0) === 1);

// 8. 干扰字段幂等
const st5 = Engine.State.defaultState(Date.now(), Data);
delete st5.archaeology.interferenceUntil;
Core.normalize(st5);
ok("干扰:normalize补0", st5.archaeology.interferenceUntil === 0);

console.log("RESULT", pass, "PASS", fail, "FAIL");
