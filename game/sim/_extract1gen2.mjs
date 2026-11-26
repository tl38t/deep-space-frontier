import fs from 'fs';
const ROOT = 'D:/EVE-IDLE/EVEIDLE-WORKBUDDY-FRESH';
const t = fs.readFileSync(ROOT + '/js/data/ships.js', 'utf8');
function extract(varName) {
  const re = new RegExp('(?:var|let|const)\\s+' + varName + '\\s*=\\s*\\[');
  const m = t.match(re);
  if (!m) return null;
  const start = t.indexOf('[', m.index);
  let depth = 0;
  for (let i = start; i < t.length; i++) {
    if (t[i] === '[') depth++;
    else if (t[i] === ']') { depth--; if (depth === 0) return t.slice(start, i + 1); }
  }
  return null;
}
function safeEval(s) { try { return eval(s); } catch (e) { return { __err: e.message }; } }
const asm = safeEval(extract('SHIP_ASSEMBLY_RECIPES'));
let o = '=== ASSEMBLY count=' + (Array.isArray(asm) ? asm.length : 'ERR') + ' ===\n';
if (Array.isArray(asm)) {
  for (const r of asm) {
    o += `shipId=${r.shipId || r.id} comp=${JSON.stringify(r.componentCost)} mat=${JSON.stringify(r.materialCost)} time=${r.time} xp=${r.xp}\n`;
  }
}
fs.writeFileSync('/tmp/asm.txt', o);
console.log('done asm=' + (Array.isArray(asm) ? asm.length : 'ERR'));
