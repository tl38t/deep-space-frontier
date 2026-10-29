// 生成「天体在岗提示」验证夹具：注入一个有人在小行星带采矿的存档，页面自动取证。
// 仅本地 headless 用，验完删除 _tmp_wk.html。
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/storage.js", "js/core/store.js",
  "js/core/save-envelope.js", "js/core/cloud-save-contract.js", "js/core/cloud-providers.js",
  "js/core/cloud-save-service.js", "js/core/persistence.js",
  "js/data/resources.js", "js/data/starmap.js", "js/data/ships.js", "js/data/recipes.js",
  "js/data/factions.js", "js/data/names.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js",
  "js/engine/npc.js", "js/engine/booster.js", "js/engine/mastery.js",
  "js/engine/production.js", "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js",
  "js/narrative/events.js", "js/engine/settle.js",
];
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { Data, Engine } = sandbox.NSK;

const now = Date.now();
const st = Engine.State.defaultState(now, Data);
const nd = Data.StarMap.nodeById(st.starMap, st.base.nodeId);
const belt = (nd.bodies || []).find(b => b.kind === "belt");
console.log("baseNode=" + nd.id + " belt=" + (belt ? belt.id : "NONE"));
if (belt) {
  Engine.Dispatch.assign(st, st.members[0].id, "mine", { nodeId: nd.id, bodyId: belt.id });
  Engine.Dispatch.assign(st, st.members[1].id, "mine", { nodeId: nd.id, bodyId: belt.id });
}
Engine.Dispatch.assign(st, st.members[2].id, "mine", { nodeId: nd.id }); // 未指定天体

const payload = JSON.stringify(st);
const probe = `
setTimeout(function(){
  var o={};
  o.badges=document.querySelectorAll('.sys-worker').length;
  o.badgeText=[].map.call(document.querySelectorAll('.sys-worker-t'),function(e){return e.textContent;});
  o.sysWorkers=((document.querySelector('.sys-workers')||{}).textContent||'').slice(0,120);
  o.wkLines=[].map.call(document.querySelectorAll('.node-card .wk-line'),function(e){return e.textContent;});
  var g=document.querySelector('.sys-body.belt');
  if(g) g.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
  var pop=document.getElementById('nsk-pop');
  o.popShown=!!(pop&&pop.classList.contains('show'));
  o.popHasWorker=pop?pop.textContent.indexOf('在岗')>=0:false;
  o.recallBtns=pop?pop.querySelectorAll('[data-act^="recall:"]').length:0;
  document.body.setAttribute('data-wk', JSON.stringify(o));
},1800);
`;

let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const seed = '<script>try{localStorage.setItem("nsk_save_v7", ' + JSON.stringify(payload) + ');}catch(e){}</script>\n<!-- Core 层 -->';
html = html.replace("<!-- Core 层 -->", seed);
html = html.replace("</body>", "<script>" + probe + "</script>\n</body>");
fs.writeFileSync(path.join(ROOT, "_tmp_wk.html"), html, "utf8");
console.log("WROTE _tmp_wk.html bytes=" + html.length);
