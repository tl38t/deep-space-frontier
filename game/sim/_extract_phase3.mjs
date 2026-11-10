// Phase 3 提取脚本（2026-11-10）：从 1 代 ships.js 生成 33 艘战斗/考古舰的 SHIPS + SLOT_LAYOUT
// 忠实平移：hp/dodge/slots/cost/classTier/bodyLevelReq/buildTime/xp/fuelEfficiency
// 不搬 bonuses/capitalTrait/counterFaction（留作舰船特性接线专项）
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const GEN = require("D:/EVE-IDLE/EVEIDLE-WORKBUDDY-FRESH/js/data/ships.js");
const DEEP = require("D:/深空星疆：商业与战争/game/js/data/recipes.js");

const SD = GEN.SHIP_DATA;
const STARTER = SD.STARTER_SHIPS;     // 28 战斗
const ARCH = SD.ARCHAEOLOGY_SHIPS;   // 5 考古
const ASM = SD.SHIP_ASSEMBLY_RECIPES; // 44 装配配方（含 deployable）
const IND = SD.INDUSTRIAL_SHIPS;      // 11 工业（本轮暂缓）

const compIds = new Set(DEEP.COMPONENT.map(r => r.out));

// 1 代 type 字符串 → 深空 classTier(1-4) / bodyLevelReq(0-3)
const typeMap = {
  frigate:{ct:1,bl:0}, destroyer:{ct:1,bl:0},
  cruiser:{ct:2,bl:1}, battleship:{ct:3,bl:2},
  capital:{ct:3,bl:2}, supercapital:{ct:4,bl:3},
  archaeology_frigate:{ct:1,bl:0}, archaeology_destroyer:{ct:1,bl:0},
  archaeology_cruiser:{ct:2,bl:1}, archaeology_battleship:{ct:3,bl:2},
  archaeology_capital:{ct:3,bl:2},
};

function asmOf(id){ return ASM.find(r => r.shipId === id); }

const ships = {};
const slotLayout = {};
const problems = [];

function emit(id, tbl, isArch) {
  const a = asmOf(id);
  if (!a) { problems.push("no-assembly:" + id); return; }
  const t = typeMap[tbl.type];
  if (!t) { problems.push("no-typemap:" + id + ":" + tbl.type); return; }
  const cost = a.componentCost || {};
  for (const k in cost) if (!compIds.has(k)) problems.push("bad-cost-key:" + id + ":" + k);
  const sl = tbl.slots || {high:1,mid:1,low:0,rig:0};
  const total = (sl.high||0)+(sl.mid||0)+(sl.low||0)+(sl.rig||0);
  const hp = tbl.hp || {shield:100,armor:100,structure:100};
  const scan = isArch ? ((tbl.bonuses && tbl.bonuses.archaeologyScanStrength) || 0) : 0;
  ships[id] = {
    id, name: tbl.name, classTier: t.ct, bodyLevelReq: t.bl,
    cost, buildTime: a.time, xp: a.xp, slots: total, dodge: tbl.dodge,
    hp: { shield: hp.shield, armor: hp.armor, structure: hp.structure },
    archaeologyScanStrength: scan, fuelEfficiency: tbl.fuelEfficiency,
  };
  slotLayout[id] = { high: sl.high||0, mid: sl.mid||0, low: sl.low||0, rig: sl.rig||0 };
}

for (const id in STARTER) emit(id, STARTER[id], false);
for (const id in ARCH) emit(id, ARCH[id], true);

// 自校验
const ids = Object.keys(ships);
let ctOk = true, blOk = true;
for (const id of ids) {
  const s = ships[id];
  if (s.classTier < 1 || s.classTier > 4) { ctOk = false; problems.push("ct-range:" + id); }
  if (s.bodyLevelReq < 0 || s.bodyLevelReq > 3) { blOk = false; problems.push("bl-range:" + id); }
  const lay = slotLayout[id];
  const sum = lay.high + lay.mid + lay.low + lay.rig;
  if (sum !== s.slots) problems.push("slot-mismatch:" + id + " sum=" + sum + " slots=" + s.slots);
}

// 生成 SHIPS 字面量块
const shipLines = ids.map(id => {
  const s = ships[id];
  return `    ${id}: { id:"${id}", name:"${s.name}", classTier:${s.classTier}, bodyLevelReq:${s.bodyLevelReq}, cost:${JSON.stringify(s.cost)}, buildTime:${s.buildTime}, xp:${s.xp}, slots:${s.slots}, dodge:${s.dodge}, hp:{shield:${s.hp.shield},armor:${s.hp.armor},structure:${s.hp.structure}}, archaeologyScanStrength:${s.archaeologyScanStrength}, fuelEfficiency:${s.fuelEfficiency} },`;
}).join("\n");
const slotLines = ids.map(id => {
  const l = slotLayout[id];
  return `    ${id}: { high:${l.high}, mid:${l.mid}, low:${l.low}, rig:${l.rig} },`;
}).join("\n");

const shipsBlock = "const SHIPS = {\n" + shipLines + "\n  };";
const slotBlock = "const SLOT_LAYOUT = {\n" + slotLines + "\n  };";

fs.writeFileSync("D:/深空星疆：商业与战争/game/sim/_phase3_ships_block.txt", shipsBlock, "utf8");
fs.writeFileSync("D:/深空星疆：商业与战争/game/sim/_phase3_slot_block.txt", slotBlock, "utf8");

console.log("=== Phase 3 提取校验 ===");
console.log("combat(STARTER):", Object.keys(STARTER).length, " arch(ARCH):", Object.keys(ARCH).length, " industrial(暂缓):", Object.keys(IND).length);
console.log("生成 SHIPS 数:", ids.length, " (期望 33)");
console.log("classTier 范围 1-4:", ctOk, " bodyLevelReq 范围 0-3:", blOk);
console.log("component id 全部有效:", !problems.some(p => p.startsWith("bad-cost-key")));
console.log("问题:", problems.length ? problems.join(" | ") : "无");
console.log("样例 rookie_corvette:", JSON.stringify(ships.rookie_corvette));
console.log("样例 firmament(capital):", JSON.stringify(ships.firmament));
console.log("样例 illuminator(arch):", JSON.stringify(ships.illuminator));
