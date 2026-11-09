// 配方原料接入审计探针（2026-11-09）
// 目的：在接任何配方表之前，先确认「原料有没有接入」——
//   ① 能否注册进存档：每个配方用到的资源键必须 ∈ Data.Resources.ALL，
//      否则 Core.normalize（store.js:231）会在读档时把它从 res 里删掉 → 配方变死数据。
//   ② 能否获取：每个原料键必须「可开采/可掉落/可行星采集/可由其他配方产出」之一，
//      否则配方跑不起来（永远凑不齐料）。
// 覆盖全部已加载的实时配方系统：SMELT / COMPONENT / INVENT / BOOSTER(1代正本) / EQUIPMENT。
// 另含 Phase 3 前瞻：1 代 SHIP_ASSEMBLY 高阶材料（镓/铂/…）是否已定义+有源。
//
// 与 integration_chain 同样用 Node vm 加载全部 UMD 模块（无 DOM）。
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
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), "utf8");
  vm.runInContext(code, ctx, { filename: f });
}
const { Data, Engine, Core } = sandbox.NSK;
if (sandbox.NSK.Narrative && typeof sandbox.NSK.Narrative.pick === "function") {
  sandbox.NSK.Narrative.pick = function () { return null; };
}

let pass = 0, fail = 0, warn = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("PASS ", name, extra || ""); }
  else { fail++; console.log("FAIL ", name, extra || ""); }
}
function note(name, extra) { warn++; console.log("WARN ", name, extra || ""); }

// ---------- 1. 资源注册表 ----------
const R = Data.Resources;
const ALL = new Set(Object.keys(R.ALL || {}));
const CATS = ["TOP","ORE","GAS","MINERAL","COMPONENT","BLUEPRINT","AMMO","PLANET","MOON_ORE","TACTIC"];
function catOf(key) {
  for (const c of CATS) { if (R[c] && R[c][key]) return c; }
  return "??";
}
console.log("[info] Resources.ALL 共", ALL.size, "键；分类:", CATS.map(c => c+"="+Object.keys(R[c]||{}).length).join(" "));

// ---------- 2. 星图原始源（采矿/气云 abundance）----------
const st = Engine.State.defaultState(Date.now(), Data);
const starMap = st.starMap;
const rawFromMap = new Set();      // 星图 abundance 直接可采
const planetTypes = new Set();     // 行星 planetType
let cloudBodies = 0;
for (const nd of (starMap.nodes || [])) {
  for (const b of (nd.bodies || [])) {
    if (b.kind === "cloud" || b.kind === "gas") cloudBodies++;
    if (b.abundance) { for (const k of Object.keys(b.abundance)) rawFromMap.add(k); }
    if (b.kind === "planet" && b.planetType) planetTypes.add(b.planetType);
  }
}
console.log("[info] 星图节点", (starMap.nodes||[]).length, " 行星planetType:", [...planetTypes].join(","), " 气云体:", cloudBodies, " abundance键数:", rawFromMap.size);

// planet 采集装置产出键（经 Logistics.resourceForPlanetType 映射）
const planetProduced = new Set();
let planetMapValid = true;
for (const pt of planetTypes) {
  const k = (Engine.Logistics.resourceForPlanetType ? Engine.Logistics.resourceForPlanetType(pt) : null);
  if (!k) { planetMapValid = false; continue; }
  planetProduced.add(k);
  if (catOf(k) !== "PLANET") planetMapValid = false; // 映射出来的键必须属于 PLANET 分类
}
console.log("[info] 行星采集装置映射产出键:", [...planetProduced].join(","), " 映射合法:", planetMapValid);

// gas 分类键（气云产出，视为可获取）
const gasKeys = new Set(Object.keys(R.GAS || {}));

// tactic：战斗中是否有掉落源？探针无 grep，但已知 engine 未实现 tactic 掉落（仅 credits/bp/rep）。
// 此处以「是否存在任何 engine 函数引用 tactic 作为产出」为准——用 Booster 重映射是消耗端，不算源。
const tacticKeys = new Set(Object.keys(R.TACTIC || {}));
const tacticHasSource = false; // 经全仓 grep 确认 combat/sites/settle 均无 tactic 产出；本作未实现掉落

// ---------- 3. 收集各配方系统的资源键 ----------
const usedIn = {};   // key -> [systems]
const producedBy = {}; // key -> [systems]
function touchIn(sys, key, qty) { (usedIn[key] = usedIn[key] || new Set()).add(sys); }
function touchOut(sys, key) { (producedBy[key] = producedBy[key] || new Set()).add(sys); }

// SMELT / COMPONENT / INVENT
for (const r of (Data.Recipes.SMELT||[])) { for (const k in r.in) touchIn("SMELT", k); touchOut("SMELT", r.out); }
for (const r of (Data.Recipes.COMPONENT||[])) { for (const k in r.in) touchIn("COMPONENT", k); touchOut("COMPONENT", r.out); }
for (const r of (Data.Recipes.INVENT||[])) { for (const k in r.in) touchIn("INVENT", k); touchOut("INVENT", r.out); }

// BOOSTER（1代正本，经 craftCost 重映射后的真实消耗键）
let boosterRecipes = 0, boosterInKeys = new Set();
try {
  const recs = Engine.Booster.recipes() || [];
  boosterRecipes = recs.length;
  for (const r of recs) {
    const cost = Engine.Booster.craftCost(null, r.id) || {};
    for (const k in cost) { touchIn("BOOSTER", k); boosterInKeys.add(k); }
  }
} catch (e) { console.log("[debug] booster craftCost err:", e.message); }
console.log("[info] BOOSTER 配方数:", boosterRecipes, " 消耗键:", [...boosterInKeys].join(","));

// EQUIPMENT（buildEquipment 消耗 cost）
// ⚠️ 真实物品表在 Data.Equipment.EQUIPMENT（模块 return { EQUIPMENT, byId, all, ... }），非顶层平铺。
let equipItems = 0, equipInKeys = new Set();
const EqMod = Data.Equipment || {};
let eqItems = [];
if (EqMod.EQUIPMENT && typeof EqMod.EQUIPMENT === "object") eqItems = eqItems.concat(Object.values(EqMod.EQUIPMENT));
if (typeof EqMod.all === "function") { try { const a = EqMod.all(); if (Array.isArray(a)) eqItems = eqItems.concat(a); } catch (e) {} }
// 兜底：若 EQUIPMENT 本身是分类嵌套（cat -> {id:item}），再展平一层
for (const v of Object.values(EqMod.EQUIPMENT || {})) {
  if (v && typeof v === "object" && !v.id && !v.cost) { for (const w of Object.values(v)) if (w && typeof w === "object") eqItems.push(w); }
}
for (const it of eqItems) {
  if (!it || typeof it !== "object") continue;
  equipItems++;
  if (it.cost && typeof it.cost === "object") { for (const k in it.cost) { touchIn("EQUIPMENT", k); equipInKeys.add(k); } }
}
console.log("[info] EQUIPMENT 物品数:", equipItems, " 消耗键:", [...equipInKeys].join(","));

// ---------- 4. 原料判定 ----------
// 可获取集 = 星图直接可采 ∪ 气云分类键 ∪ 行星采集产出(映射合法) ∪ 配方产出(闭包)
const rawReachable = new Set();
for (const k of rawFromMap) rawReachable.add(k);
for (const k of gasKeys) rawReachable.add(k);
if (planetMapValid) for (const k of planetProduced) rawReachable.add(k);

// 配方产出闭包：反复把「所有输入都已可获取」的配方输出加入可获取集
let changed = true, guard = 0;
const sysOut = { SMELT:{}, COMPONENT:{}, INVENT:{} };
for (const r of (Data.Recipes.SMELT||[])) sysOut.SMELT[r.out] = r.in;
for (const r of (Data.Recipes.COMPONENT||[])) sysOut.COMPONENT[r.out] = r.in;
for (const r of (Data.Recipes.INVENT||[])) sysOut.INVENT[r.out] = r.in;
// booster/equipment 产出不是资源键（booster:<id> / 装备 id），不进资源闭包
const craftable = new Set();
while (changed && guard++ < 50) {
  changed = false;
  for (const sys of ["SMELT","COMPONENT","INVENT"]) {
    for (const outk in sysOut[sys]) {
      if (craftable.has(outk)) continue;
      const ins = sysOut[sys][outk];
      const allOk = Object.keys(ins).every(k => rawReachable.has(k) || craftable.has(k));
      if (allOk) { craftable.add(outk); changed = true; }
    }
  }
}

// 汇总所有被用作「输入」的键
const allInKeys = Object.keys(usedIn).sort();
const missingALL = [];
const noSource = [];
for (const k of allInKeys) {
  if (!ALL.has(k)) missingALL.push(k);
  const reachable = rawReachable.has(k) || craftable.has(k);
  if (!reachable) noSource.push(k);
}

console.log("\n========== 审计结果 ==========");
ok("① 所有配方原料键均注册进 Resources.ALL（否则读档被删）", missingALL.length === 0,
   missingALL.length ? ("缺失: "+missingALL.join(",")) : ("共 "+allInKeys.length+" 个输入键全在 ALL 内"));
ok("② 所有配方原料键均可获取（开采/掉落/行星/可由配方产出）", noSource.length === 0,
   noSource.length ? ("无源: "+noSource.join(",")) : "全部可获取");

// 分类明细
const byCat = {};
for (const k of allInKeys) { const c = catOf(k); (byCat[c] = byCat[c] || []).push(k); }
console.log("\n[明细] 输入键按资源分类分布：");
for (const c of Object.keys(byCat).sort()) {
  console.log("  " + c + " (" + byCat[c].length + "): " + byCat[c].join(", "));
}

// 重点：planet_* 与 tactic:* 单独报告
const planetIn = allInKeys.filter(k => catOf(k) === "PLANET");
const tacticIn = allInKeys.filter(k => catOf(k) === "TACTIC");
console.log("\n[重点] PLANET 类输入键:", planetIn.join(",") || "（无）", " → 采集装置映射" + (planetMapValid ? "有效，可获取" : "无效/未接入！"));
console.log("[重点] TACTIC 类输入键:", tacticIn.join(",") || "（无）", " → 战斗掉落源" + (tacticHasSource ? "已接入" : "【未实现，当前无任何获取途径】"));

// 各系统各自缺哪
console.log("\n[分系统] 不可获取原料：");
for (const sys of ["SMELT","COMPONENT","INVENT","BOOSTER","EQUIPMENT"]) {
  const bad = [...new Set([...Object.keys(usedIn)].filter(k => usedIn[k].has(sys) && !(rawReachable.has(k)||craftable.has(k))))];
  console.log("  " + sys + ": " + (bad.length ? bad.join(", ") : "全部可获取"));
}

// ---------- 5. Phase 3 前瞻：1代 SHIP_ASSEMBLY 高阶材料 ----------
const phase3Mats = ["镓","铂","铪","锇","钷","铷","钛","钯"]; // 1代高阶船 materialCost 常见矿材（中文名，仅作存在性提示）
console.log("\n[前瞻 Phase3] 1代高阶造船材料（中文名）是否在 Resources 中有对应键（仅提示，数据不在此仓）：");
for (const name of phase3Mats) {
  const found = Object.values(R.ALL).find(v => v && v.name === name);
  console.log("  " + name + ": " + (found ? ("已定义 -> "+found.id) : "【未定义】"));
}

console.log("\n======== RESULT: PASS=" + pass + " FAIL=" + fail + " WARN=" + warn + " ========");
process.exit(fail === 0 ? 0 : 1);
