// 从 1 代 STARTER_SHIPS（28 战斗舰）提取活键 bonuses → JSON map（id → {live keys}）
import fs from "fs";
import vm from "vm";
import path from "path";

const ONE = "D:/EVE-IDLE/EVEIDLE-WORKBUDDY-FRESH/js/data/ships.js";
const sandbox = { console, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox; sandbox.self = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(ONE, "utf8"), ctx, { filename: ONE });
const GEN = sandbox.SHIP_DATA;
const STARTER = GEN.STARTER_SHIPS;
if (!STARTER) throw new Error("STARTER_SHIPS not found; keys=" + Object.keys(GEN).join(","));

const LIVE = ["shieldCapacity","armorCapacity","structureCapacity","laserDamage","missileDamage","cannonDamage","hitBonus","structureRepair","armorRepair","structureEmergencyRepair"];
const out = {};
let n = 0;
for (const s of Object.values(STARTER)) {
  if (!s || !s.id) continue;
  const b = (s.bonuses || {});
  const keep = {};
  for (const k of LIVE) if (typeof b[k] === "number") keep[k] = b[k];
  out[s.id] = keep;
  n++;
}
console.log("// extracted combat ships with bonuses:", n);
fs.writeFileSync(path.resolve("D:/深空星疆：商业与战争/game/sim/_phase5_bonuses.json"), JSON.stringify(out, null, 0));
console.log(JSON.stringify(out, null, 2));
