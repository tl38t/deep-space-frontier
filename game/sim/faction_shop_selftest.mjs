// 探针：势力商店（2026-11-28 实装）
//   覆盖：目录 67 张构成 / 三套键格式 / 定价台阶 / 校验链逐条拒绝 / 扣款 /
//         三处门禁（造船·造装备·增强剂）在购买前后翻转 / 老档一次性回落幂等 / sansha 挂起
// 运行：node sim/faction_shop_selftest.mjs
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/equip-instances.js", "js/core/store.js", "js/engine/rig-resonance.js",
  "js/data/resources.js", "js/data/starmap.js", "js/data/ships.js",
  "js/data/equipment.js", "js/data/recipes.js", "js/data/factions.js", "js/data/names.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/base.js",
  "js/engine/booster.js", "js/engine/production.js", "js/engine/faction.js",
  "js/engine/faction-shop.js",
  "js/lib/eveidle/host-stubs.js", "js/lib/eveidle/data/boosters.js",
];
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });

const { Data, Engine } = sandbox.NSK;
const FS = Engine.FactionShop;
const Eq = Data.Equipment, Ship = Data.Ships, Prod = Engine.Production, B = Engine.Booster;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; fails.push(name); console.log("  FAIL  " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}
function fresh(patch) {
  const st = Engine.State.defaultState(Date.now(), Data);
  if (Engine.Base && Engine.Base.normalize) Engine.Base.normalize(st);
  if (patch) Object.assign(st, patch);
  return st;
}

console.log("== 势力商店探针 ==");

// ---------- 1. 目录构成 ----------
console.log("[目录 67 张]");
const cat = FS.catalog();
const by = k => cat.list.reduce((n, r) => n + r[k].length, 0);
ok("总数 = 67", cat.total === 67, cat.total);
ok("装备 27", by("equip") === 27, by("equip"));
ok("增强剂 26", by("booster") === 26, by("booster"));
ok("舰船 14", by("ship") === 14, by("ship"));
const per = {};
cat.list.forEach(r => { per[r.id] = r.items.length; });
const want = { federation: 12, angel: 14, blood: 15, mining_guild: 6, salvage_union: 3, lone_star: 3, abyssal_inst: 9, bounty_league: 2, settlers: 3, sansha: 0 };
let perOk = true, perDiff = {};
for (const k in want) if (per[k] !== want[k]) { perOk = false; perDiff[k] = per[k] + "≠" + want[k]; }
ok("逐势力件数对齐设计稿", perOk, perDiff);
ok("sansha 挂起且 0 件", cat.byId.sansha.suspended === true && per.sansha === 0, per.sansha);

// ---------- 2. 键格式 ----------
console.log("[三套键格式]");
const all = FS.items();
ok("装备键 = equipment:<id>", all.filter(x => x.kind === "equip").every(x => x.key === "equipment:" + x.id));
ok("增强剂键 = booster:<id>", all.filter(x => x.kind === "booster").every(x => x.key === "booster:" + x.id));
ok("舰船键 = 裸 shipId", all.filter(x => x.kind === "ship").every(x => x.key === x.id && !!Ship.shipById(x.id)));
ok("无 sansha 商品泄漏", all.every(x => !String(x.key).includes("sansha") && x.factionId !== "sansha"));
ok("无考古稀有 7 件", all.every(x => !Eq.RARE_BLUEPRINT_ONLY || !Eq.RARE_BLUEPRINT_ONLY[x.id]));

// ---------- 3. 定价台阶 ----------
console.log("[装备定价台阶]");
const ladder = { 1: 20, 10: 20, 15: 40, 25: 40, 35: 80, 45: 80, 55: 160, 65: 160, 80: 320, 85: 320 };
let ladderOk = true, ladDiff = {};
for (const lv in ladder) {
  const p = Eq.shopPrice({ level: Number(lv) });
  if (p !== ladder[lv]) { ladderOk = false; ladDiff[lv] = p; }
}
ok("level→价格 20/40/80/160/320", ladderOk, ladDiff);
ok("增强剂 n/r/l = 15/35/70", FS.BOOSTER_PRICE.n === 15 && FS.BOOSTER_PRICE.r === 35 && FS.BOOSTER_PRICE.l === 70);

// ---------- 4. 校验链逐条拒绝 ----------
console.log("[校验链]");
{
  const st = fresh({ res: Object.assign({}, Data.Resources.startingResources(), { rep: 0, credits: 0 }) });
  // ⚠️ 不能取初始免费集那两件（raider_mining_laser / raider_gas_harvester）：它们开局就有，
  //    否则命中的是「已拥有」分支而不是「余额不足」分支。
  const it = all.find(x => x.kind === "equip" && x.relMin === 0 && x.price > 0 && Eq.FREE_BLUEPRINT_KEYS.indexOf(x.key) < 0);
  const r = FS.buy(st, "equip", it.id);
  ok("声望 0 时买装备被拒（声望不足）", r.ok === false && /不足/.test(r.err), r.err);
  ok("被拒后不写键", (st.ownedBlueprints || []).indexOf(it.key) < 0);
}
{
  const st = fresh({ res: Object.assign({}, Data.Resources.startingResources(), { rep: 9999 }) });
  const it = all.find(x => x.relMin === 25);
  const r0 = FS.buy(st, "equip", it.id);
  ok("关系 0 买 rel25 件被拒", r0.ok === false && /关系不足/.test(r0.err), r0.err);
  const f = st.factions.find(x => x.id === it.relFaction); f.relation = 25;
  const r1 = FS.buy(st, "equip", it.id);
  ok("关系达标后可买", r1.ok === true && (st.ownedBlueprints || []).indexOf(it.key) >= 0, r1.err);
  ok("重复购买被拒（已拥有）", FS.buy(st, "equip", it.id).ok === false);
  ok("扣款精确 = price", st.res.rep === 9999 - it.price, { rep: st.res.rep, price: it.price });
}
{
  const st = fresh({ res: Object.assign({}, Data.Resources.startingResources(), { rep: 9999, credits: 999999 }) });
  st.base.bodyLevel = 0;
  const hi = all.find(x => x.kind === "ship" && x.bodyLevel === 3);
  const r0 = FS.buy(st, "ship", hi.id);
  ok("舰基 Lv1 买 Lv4 舰船蓝图被拒", r0.ok === false && /舰基/.test(r0.err), r0.err);
  st.base.bodyLevel = 3;
  ok("舰基 Lv4 后放行", FS.buy(st, "ship", hi.id).ok === true);
  const neutral = all.find(x => x.kind === "ship" && x.neutral);
  ok("中立舰船付 credits", neutral.currency === "credits" && neutral.price === 50000, neutral && neutral.currency);
  const before = st.res.credits;
  ok("中立舰船扣星币 50000", FS.buy(st, "ship", neutral.id).ok === true && st.res.credits === before - 50000, st.res.credits);
}
{
  const st = fresh({ res: Object.assign({}, Data.Resources.startingResources(), { credits: 0 }) });
  const neutral = all.find(x => x.kind === "ship" && x.neutral);
  const r = FS.buy(st, "ship", neutral.id);
  ok("星币 0 买中立舰船被拒", r.ok === false && /星币不足/.test(r.err), r.err);
}
{
  const st = fresh();
  ok("check() 已拥有态 tone=owned", (() => {
    const it = all[0]; st.ownedBlueprints.push(it.key);
    return FS.check(st, it).tone === "owned";
  })());
}

// ---------- 5. 三处门禁购买前后翻转 ----------
console.log("[门禁翻转]");
{
  // 5.1 造船（Production.buildShip，1 代顺序「蓝图 → 等级 → 船坞 → 材料」）
  const st = fresh();
  const hull = all.find(x => x.kind === "ship" && x.price === 60 && x.currency === "rep");
  Object.assign(st.res, { rep: 9999 });
  const r0 = Prod.buildShip(st, hull.id);
  ok("无舰船蓝图时 buildShip 被蓝图拦下", r0.ok === false && /蓝图/.test(r0.err), r0.err);
  // 材料充足后仍必须被蓝图拦（证明不是「材料不足」冒充）
  const shipDef = Ship.shipById(hull.id);
  for (const k in shipDef.cost) st.res[k] = 1e9;
  const r1 = Prod.buildShip(st, hull.id);
  ok("材料充足但缺蓝图仍被拒", r1.ok === false && /蓝图/.test(r1.err), r1.err);
  ok("购买蓝图", FS.buy(st, "ship", hull.id).ok === true);
  const r2 = Prod.buildShip(st, hull.id);
  ok("买蓝图后 buildShip 放行", r2.ok === true, r2.err);
}
{
  // 5.2 造装备（Production.buildEquipment）
  const st = fresh();
  Object.assign(st.res, { rep: 9999 });
  const it = all.find(x => x.kind === "equip" && x.relMin === 0 && Eq.FREE_BLUEPRINT_KEYS.indexOf(x.key) < 0);
  const def = Eq.byId(it.id);
  for (const k in (def.cost || {})) st.res[k] = 1e9;
  st.base.bodyLevel = 3;
  const r0 = Prod.buildEquipment(st, it.id);
  ok("无装备蓝图时 buildEquipment 被蓝图拦下", r0.ok === false && /蓝图/.test(r0.err), r0.err);
  ok("购买装备蓝图", FS.buy(st, "equip", it.id).ok === true);
  const r1 = Prod.buildEquipment(st, it.id);
  ok("买蓝图后 buildEquipment 放行", r1.ok === true, r1.err);
}
{
  // 5.3 增强剂（Booster.canCraft）
  const st = fresh();
  Object.assign(st.res, { rep: 9999 });
  const bt = all.find(x => x.kind === "booster");
  const recipe = B.getRecipe(bt.id);
  ok("无增强剂蓝图时 canCraft=false", (() => {
    const r = B.hasBlueprint(st, bt.id); return r === false;
  })());
  const r0 = B.canCraft(st, bt.id);
  ok("canCraft 报缺蓝图", r0.ok === false && /蓝图/.test(r0.err), r0.err);
  ok("购买增强剂蓝图", FS.buy(st, "booster", bt.id).ok === true);
  ok("买后 canCraft=true", B.canCraft(st, bt.id).ok === true, recipe && recipe.id);
}

// ---------- 6. 老档一次性回落 ----------
console.log("[迁移 A]");
{
  const st = fresh();
  // 构造被 BP_GRANT_ALL 污染的老档：全部 requiresBlueprint 装备键 + 若干增强剂键
  const legacy = Eq.all().filter(e => e.requiresBlueprint).map(e => Eq.bpKey(e.id))
    .concat(sandbox.BOOSTER_RECIPES.filter(r => r.requiresBlueprint).map(r => "booster:" + r.id));
  st.ownedBlueprints = legacy.slice();
  delete st.shopMigrated;
  const r = FS.migrate(st);
  ok("迁移触发 changed", r.changed === true && r.cleared === legacy.length, r);
  ok("清空后只剩初始免费集 2 键", st.ownedBlueprints.length === 2
    && st.ownedBlueprints[0] === "equipment:raider_mining_laser"
    && st.ownedBlueprints[1] === "equipment:raider_gas_harvester", st.ownedBlueprints);
  ok("打上 shopMigrated 标记", st.shopMigrated === true);
  const r2 = FS.migrate(st);
  ok("再次迁移幂等（changed=false）", r2.changed === false && st.ownedBlueprints.length === 2, r2);
}
{
  // 新档：defaultState 内部已走迁移，直接是免费集 + 标记
  const st = fresh();
  ok("新档自带免费集 2 键 + 标记", st.ownedBlueprints.length === 2 && st.shopMigrated === true, st.ownedBlueprints);
  ok("BP_GRANT_ALL 已关闭", Eq.BP_GRANT_ALL === false);
  ok("grantAllBlueprints 关闭后返回 0", Eq.grantAllBlueprints(st) === 0);
}

// ---------- 7. UI 依赖的展示字段 ----------
console.log("[卡片字段]");
ok("每件都有 name/tag/desc/price/currency", all.every(x => x.name && x.tag && x.desc && x.price > 0 && /^(rep|credits)$/.test(x.currency)));
ok("装备 tag 含等级", all.filter(x => x.kind === "equip").every(x => /Lv\d+/.test(x.tag)));
ok("舰船 tag 含舰基等级", all.filter(x => x.kind === "ship").every(x => /舰基 Lv\.\d/.test(x.tag)));
ok("curMeta(rep) = 宇宙声望", FS.curMeta("rep").name === "宇宙声望", FS.curMeta("rep"));

console.log("\n结果：" + pass + " PASS / " + fail + " FAIL");
if (fail) { console.log("失败项：" + fails.join(" | ")); process.exit(1); }
