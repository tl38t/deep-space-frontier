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

const comp = safeEval(extract('SHIP_COMPONENT_RECIPES'));
const asm = safeEval(extract('SHIP_ASSEMBLY_RECIPES'));

let o = '';
if (Array.isArray(comp)) {
  o += '=== COMPONENT count=' + comp.length + ' ===\n';
  for (const r of comp) {
    o += `id=${r.id || '?'} name=${r.name || '?'} time=${r.time} xp=${r.xp} ` +
         `out=${JSON.stringify(r.out || r.output || r.produces)} ` +
         `in=${JSON.stringify(r.in || r.ingredients || r.cost || r.materials)}\n`;
  }
} else {
  o += '=== COMPONENT ERR ' + JSON.stringify(comp) + '\n';
}
if (Array.isArray(asm)) {
  const want = ['frigate', 'destroyer', 'cruiser', 'battlecruiser', 'battleship', 'capital', 'supercapital'];
  o += '\n=== ASSEMBLY (本作7船型) count匹配如下 ===\n';
  for (const r of asm) {
    const sid = r.shipId || r.id || '';
    if (want.includes(sid)) {
      o += `shipId=${sid} name=${r.name} comp=${JSON.stringify(r.componentCost)} ` +
           `mat=${JSON.stringify(r.materialCost)} time=${r.time} xp=${r.xp} bp=${r.requiresBlueprint}\n`;
    }
  }
} else {
  o += '\n=== ASSEMBLY ERR ' + JSON.stringify(asm) + '\n';
}
fs.writeFileSync('/tmp/extract1gen.txt', o);
console.log('done comp=' + (Array.isArray(comp) ? comp.length : 'ERR') + ' asm=' + (Array.isArray(asm) ? asm.length : 'ERR'));
