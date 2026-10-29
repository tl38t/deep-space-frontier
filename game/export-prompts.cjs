// 生图 Prompt 整合文档生成器（单一真相源 → 单文件 .md）
// 取代原先散落在仓库根的 6 份 .md。运行：node game/export-prompts.cjs
const path = require("path");
const fs = require("fs");
const AP = require("./js/data/asset-prompts.js");

const outRel = process.argv[2] || "../深空星疆·生图Prompt整合包.md";
const out = path.resolve(__dirname, outRel);
const md = AP.buildPromptDoc();
fs.writeFileSync(out, md, "utf8");
console.log("written:", out);
console.log("bytes:", fs.statSync(out).size, "| lines:", md.split("\n").length);
console.log("factionContacts:", AP.FACTION_CONTACTS.length,
  "| npcArchetypes:", AP.NPC_ARCHETYPES.length,
  "| augments:", AP.AUGMENT_PROMPTS.length,
  "| guides:", AP.GUIDE_CHARACTERS.length);
