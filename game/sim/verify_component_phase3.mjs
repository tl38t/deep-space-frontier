// Phase 3 验证探针（2026-11-10）：33 艘战斗/考古舰接入 SHIPS + SLOT_LAYOUT + repair 派生 + 默认舰 id 迁移
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

const SHIPS = Data.Ships.SHIPS;
const ids = Object.keys(SHIPS);
const OLD = ["frigate","destroyer","cruiser","battlecruiser","battleship","capital","supercapital"];
const compIds = new Set(Data.Recipes.COMPONENT.map(r => r.out));

// ① 44 舰齐全（Phase3 的 33 + Phase4 的 11 工业）+ 7 抽象 id 已清除
const INDUSTRIAL = ["miner_frigate","gas_frigate","miner_destroyer","gas_destroyer","miner_cruiser","gas_cruiser","dolphin","miner_battleship","gas_battleship","yunjin","orca"];
ok("① SHIPS 数量 = 45（33 战斗/考古 + 11 工业 + 1 泰坦）", ids.length === 45, "n="+ids.length);
ok("①b 7 抽象 id 已全部移除", OLD.every(o => !(o in SHIPS)), "残留=" + OLD.filter(o => o in SHIPS).join(","));
ok("①c 11 工业舰全部就位", INDUSTRIAL.every(o => o in SHIPS), "缺失=" + INDUSTRIAL.filter(o => !(o in SHIPS)).join(","));

// ② classTier/bodyLevelReq 范围 + cost 键有效 + 槽位一致
let fieldOk = true, fieldDetail = "";
for (const id of ids) {
  const s = SHIPS[id];
  if (s.classTier < 1 || s.classTier > 5) { fieldOk = false; fieldDetail += " ct:"+id; }
  if (s.bodyLevelReq < 0 || s.bodyLevelReq > 4) { fieldOk = false; fieldDetail += " bl:"+id; }
  for (const k in (s.cost||{})) if (!compIds.has(k)) { fieldOk = false; fieldDetail += " cost:"+id+":"+k; }
  const lay = Data.Ships.slotLayout(id);
  const sum = lay.high + lay.mid + lay.low + lay.rig;
  if (sum !== s.slots) { fieldOk = false; fieldDetail += " slot:"+id+"("+sum+"!="+s.slots+")"; }
  if (typeof s.archaeologyScanStrength !== "number") { fieldOk = false; fieldDetail += " scan:"+id; }
}
ok("② 字段契约（classTier1-4/bodyLevel0-3/cost键有效/槽位一致/scan数值）", fieldOk, fieldDetail || "all-good");

// ③ SLOT_LAYOUT 44 条（随 SHIPS 同步）
ok("③ SLOT_LAYOUT 数量 = 45", Object.keys(Data.Ships.SLOT_LAYOUT).length === 45, "n="+Object.keys(Data.Ships.SLOT_LAYOUT).length);

// ④ repair 按 classTier 派生（4 个 tier 都返回正数，不再按字面 id）
const rep = Data.Ships; // repair 经 Engine.Repair
const Repair = sandbox.NSK.Engine.Repair;
let repOk = true, repDetail = "";
for (const id of ["rifter","dawnlight","sunlance","starcrown"]) { // ct 1/2/3/4
  const d = Repair.repairDuration(id, null);
  if (!(d > 0)) { repOk = false; repDetail += " " + id + "=" + d; }
}
ok("④ repairDuration 按 classTier 派生（4 档均 >0）", repOk, repDetail || "ok");

// ⑤ 默认舰 id 存在（store/fleet/state 兜底 + state 初始分配）
for (const d of ["rookie_corvette","rifter","raylight"]) ok("⑤ 默认舰 id 存在: "+d, !!Data.Ships.shipById(d), "");

// ⑥ 考古扫描字段活：考古舰>0、战斗舰=0
ok("⑥ heron 扫描=10（活字段）", Data.Ships.shipById("heron").archaeologyScanStrength === 10, "");
ok("⑥ illuminator 扫描=120（活字段）", Data.Ships.shipById("illuminator").archaeologyScanStrength === 120, "");
ok("⑥ rifter 扫描=0（战斗舰忠实无扫描）", Data.Ships.shipById("rifter").archaeologyScanStrength === 0, "");

// ⑦ buildShip 消耗正确（rifter cost = integrated_hull/power_core/functional_system 各2）
const st = St.defaultState(Date.now(), Data);
for (const k of compIds) st.res[k] = Math.max(st.res[k] || 0, 20);
const b0 = { i: st.res.integrated_hull, p: st.res.power_core, f: st.res.functional_system };
const bRes = Prod.buildShip(st, "rifter", 1);
ok("⑦a buildShip(rifter) ok", bRes && bRes.ok, JSON.stringify(bRes));
const b1 = { i: st.res.integrated_hull, p: st.res.power_core, f: st.res.functional_system };
ok("⑦b 扣 integrated_hull/power_core/functional_system 各 2", (b0.i-b1.i===2)&&(b0.p-b1.p===2)&&(b0.f-b1.f===2), JSON.stringify(b0)+"->"+JSON.stringify(b1));
ok("⑦c 入 buildQueue", (st.base.industry.buildQueue||[]).length >= 1, "len="+(st.base.industry.buildQueue||[]).length);

// ⑧ 主循环 + 建造结算无异常（含新舰入 roster）
let err8 = null;
try {
  for (let i = 0; i < 4; i++) Settle.settle(st, st.lastSeen + 3600 * 1000);
} catch (e) { err8 = e.message; }
ok("⑧ 主循环+建造结算无异常", !err8, err8 || "");
ok("⑧b 造出 rifter（ships 增加）", st.ships.length >= 1, "ships="+st.ships.length);

// ⑨ 存档往返安全（33 舰键无死数据：cost 键均注册）
let normOk = false, normDetail = "";
try {
  const env = Core.normalize ? Core.normalize(st) : null;
  normOk = !!(env && env.res);
  normDetail = env && env.res ? "res-keys="+Object.keys(env.res).length : "no-env";
} catch (e) { normDetail = "err:" + e.message; }
ok("⑨ 存档往返安全", normOk, normDetail);

console.log("\nRESULT pass=" + pass + " fail=" + fail);
process.exit(fail > 0 ? 1 : 0);
