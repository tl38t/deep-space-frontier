// 生成「待决事件 UI 验证」夹具页：注入一份带 pendingEvents 的存档，再自动点选第一个选项。
// 仅用于本地 headless 取证，不属于游戏产物（跑完可删 _tmp_evtest.html）。
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/store.js",
  "js/core/save-envelope.js", "js/core/cloud-save-contract.js",
  "js/core/cloud-providers.js", "js/core/cloud-save-service.js", "js/core/persistence.js",
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
const { Core, Data, Engine } = sandbox.NSK;

const now = Date.now();
const st = Engine.State.defaultState(now, Data);
// 让一个成员在岗（面板会显示成员名），并塞两条真实待决事件（一条选项、一条链）
Engine.Dispatch.assign(st, st.members[0].id, "mine", { nodeId: st.base.nodeId });
Engine.Settle.enqueuePending(st, sandbox.NSK.Narrative.findById("mine_rich_choice"), st.members[0].id, now);
Engine.Settle.enqueuePending(st, sandbox.NSK.Narrative.findById("chain_combat_1"), st.members[1].id, now);
st.pendingEvents[1].memberId = st.members[1].id;
st.res.fe_ore = 500;

const payload = JSON.stringify(st);
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  .replace("<!-- Core 层 -->", '<script>try{localStorage.setItem("nsk_save_v7", ' + JSON.stringify(payload) + ');}catch(e){document.title="SEED_FAIL:"+e.message;}</script>\n<!-- Core 层 -->')
  .replace("</body>", '<script>\n'
    + 'setTimeout(function(){try{\n'
    + '  var btns=document.querySelectorAll(".pe-opts button:not([disabled])");\n'
    + '  document.body.setAttribute("data-pe-count", document.querySelectorAll(".pe-card").length);\n'
    + '  document.body.setAttribute("data-opt-count", btns.length);\n'
    + '  if(btns.length){btns[0].click();}\n'
    + '  setTimeout(function(){\n'
    + '    document.body.setAttribute("data-pe-after", document.querySelectorAll(".pe-card").length);\n'
    + '    document.body.setAttribute("data-evtest","done");\n'
    + '  },600);\n'
    + '}catch(e){document.body.setAttribute("data-evtest","err:"+e.message);}},700);\n'
    + '</script>\n</body>');

fs.writeFileSync(path.join(ROOT, "_tmp_evtest.html"), html, "utf8");
console.log("WROTE _tmp_evtest.html  bytes=" + html.length + "  pending=" + st.pendingEvents.length);
