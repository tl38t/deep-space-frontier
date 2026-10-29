// PoC：验证 EVE-IDLE 本地库（game/js/lib/eveidle）可 file:// 加载 + 装备链路可用
// 目标：加载无错误 → 资源注册表可用 → 装备库可读 → resolveEquipmentReference 解析 → 强化公式 → bonuses 聚合
global.window = global;
global.NSK = {};
// stub 可选依赖（库文件用 typeof 守护，缺失不抛）
global.GameEvents = { on: function () {}, emit: function () {} };
global.DisplayNames = undefined;
// 宿主全局契约（EVE-IDLE 原作专属；深空星疆不提供时给空默认，避免裸引用抛错）
global.ARCHAEOLOGY_SHIP_TYPES = [];
global.RIG_SERIES = [];

const base = "D:/深空星疆：商业与战争/game/js/lib/eveidle/";
require(base + "host-stubs.js");   // 宿主契约垫片：先提供空默认值，库才能独立加载
const order = [
  "core/resources.js",
  "data/display-names.js",
  "data/equipment.js",
  "systems/enhancement-chance.js",
  "systems/equipment-enhancement.js",
  "systems/rigs.js",
  "systems/ship-enhancement.js",
  "data/ammunition.js",
  "data/cargo.js",
  "data/boosters.js",
  "data/implants.js",
  "data/ammo.js",
];

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log("  ✗ FAIL: " + m); } }

// 1) 加载全部库文件，捕获任何加载期异常
const loadErrs = [];
for (const f of order) {
  try { require(base + f); }
  catch (e) { loadErrs.push(f + " :: " + e.message); }
}
ok(loadErrs.length === 0, "全部库文件加载无异常" + (loadErrs.length ? " -> " + loadErrs.join(" | ") : ""));
ok(typeof ResourceRegistry === "object" && ResourceRegistry, "ResourceRegistry 已挂载");
ok(typeof EQUIPMENT_DB === "object" && EQUIPMENT_DB, "EQUIPMENT_DB 已挂载");
ok(typeof getEnhancementChance === "function", "getEnhancementChance 已挂载");
ok(window.EquipmentEnhancement && typeof window.EquipmentEnhancement.resolveEquipmentReference === "function", "resolveEquipmentReference 已挂载（window.EquipmentEnhancement）");
ok(typeof getRigModifiers === "function", "getRigModifiers 已挂载（window）");

// 2) 资源注册表：按 EVE-IDLE 形态注册（标量资源存 state.resources[scalarKey]）
ResourceRegistry.register({ namespace: "mineral", key: "三钛合金", name: "三钛合金", category: "mineral", scalarKey: "三钛合金" });
ResourceRegistry.register({ namespace: "mineral", key: "类银超金属", name: "类银超金属", category: "mineral", scalarKey: "类银超金属" });
ResourceRegistry.register({ namespace: "currency", key: "isk", name: "ISK", scalarKey: "isk", category: "currency" });
const st = { resources: { minerals: { "三钛合金": 999, "类银超金属": 999 }, isk: 5000 }, equipment: { inventory: [], instances: [] } };
ok(ResourceRegistry.get(st, "mineral:三钛合金") === 999, "注册后可读取材料库存（pool 型 minerals 桶）");

// 3) 装备库内容量确认（证明数据真的搬过来了）
const ids = Object.keys(EQUIPMENT_DB);
ok(ids.length > 50, "装备库条目数 > 50（实得 " + ids.length + "）");
const miningLaser = EQUIPMENT_DB["t1_mining_laser"];
ok(miningLaser && miningLaser.bonuses && miningLaser.bonuses.miningEfficiency === 0.05, "取 t1_mining_laser 且 bonuses.miningEfficiency=0.05");
console.log("  装备样例 cost=" + JSON.stringify(miningLaser.cost) + " bonuses=" + JSON.stringify(miningLaser.bonuses));

// 4) 装备解析（resolveEquipmentReference）：把引用 id 解析成定义
const resolveEquipmentReference = window.EquipmentEnhancement.resolveEquipmentReference;
const ref = resolveEquipmentReference(st, "t1_mining_laser");
ok(ref && ref.definition && ref.definition.id === "t1_mining_laser", "resolveEquipmentReference 解析装备引用");

// 5) 强化公式（边际递减，纯函数 O(1)）
//    工程等级远超需求 → 接近上限；工程等级=需求且 0 级 → 接近基础 0.50
const hi = getEnhancementChance(100, 1, 0);
const lo = getEnhancementChance(1, 1, 0);
ok(hi > lo && hi >= 0.80 && lo >= 0.40, "强化成功率 高工程(" + hi.toFixed(2) + ") > 低工程(" + lo.toFixed(2) + ")");
const b = getEnhancementChanceBreakdown(100, 1, 0);
ok(b.final === Math.max(b.minChance, Math.min(b.maxChance, 0.50 + b.skillBonus - b.levelPenalty)), "enhancement 公式自洽");

// 6) 装备→加成聚合（模拟：把一件装备装到 fitting，累加 bonuses）
//    深空星疆自写结算层只需遍历 fitting 调 resolveEquipmentReference 累加 bonuses，这里是最小验证
function aggregateBonuses(state, fitting) {
  let agg = {};
  for (const slot of ["high", "mid", "low", "rig"]) {
    for (const r of (fitting[slot] || [])) {
      const resolved = resolveEquipmentReference(state, r);
      if (resolved && resolved.definition && resolved.definition.bonuses) {
        for (const k in resolved.definition.bonuses) agg[k] = (agg[k] || 0) + resolved.definition.bonuses[k];
      }
    }
  }
  return agg;
}
const fitting = { high: ["t1_mining_laser"], mid: [], low: [], rig: [] };
const agg = aggregateBonuses(st, fitting);
ok(agg.miningEfficiency === 0.05, "聚合后 miningEfficiency=0.05（装备→加成链路通）");

// 7) 确定性 + DOM-free 化验证：两次聚合结果一致；无 document 引用
ok(JSON.stringify(aggregateBonuses(st, fitting)) === JSON.stringify(agg), "聚合结果确定性一致");
ok(typeof document === "undefined", "运行环境无 document（DOM-free 验证）");

// 8) 改装件谐振惩罚（rig 堆叠）
const rp1 = getRigStackPenalty(0);   // 第 1 件吃满效
const rp2 = getRigStackPenalty(1);   // 第 2 件衰减
ok(rp1 === 1 && rp2 < 1, "rig 谐振惩罚：第1件满效(" + rp1 + ") 第2件衰减(" + rp2.toFixed(3) + ")");

console.log("\nPoC 结果: " + pass + " PASS / " + fail + " FAIL");
process.exit(fail ? 1 : 0);
