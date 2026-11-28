// Phase 3 应用脚本：把生成的 SHIPS / SLOT_LAYOUT 块替换进 ships.js（块级正则替换，避免 whitespace 误配）
import fs from "fs";
const SHIPS_JS = "D:/深空星疆：商业与战争/game/js/data/ships.js";
const shipBlock = fs.readFileSync("D:/深空星疆：商业与战争/game/sim/_phase3_ships_block.txt", "utf8").trimEnd();
const slotBlock = fs.readFileSync("D:/深空星疆：商业与战争/game/sim/_phase3_slot_block.txt", "utf8").trimEnd();

// 整体缩进 +2，使 const 行与函数体 2 空格对齐
const indent = b => b.split("\n").map(l => "  " + l).join("\n");

let content = fs.readFileSync(SHIPS_JS, "utf8");
const shipsRe = /const SHIPS = \{[\s\S]*?\n  \};/;
const slotRe  = /const SLOT_LAYOUT = \{[\s\S]*?\n  \};/;

if (!shipsRe.test(content)) throw new Error("SHIPS block not found");
if (!slotRe.test(content)) throw new Error("SLOT_LAYOUT block not found");

content = content.replace(shipsRe, indent(shipBlock));
content = content.replace(slotRe, indent(slotBlock));

fs.writeFileSync(SHIPS_JS, content, "utf8");
console.log("ships.js SHIPS + SLOT_LAYOUT 已替换。SHIPS 行数校验：",
  (content.match(/^\s{6}\w+:\s*\{ id:/gm) || []).length, "(期望 33)");
