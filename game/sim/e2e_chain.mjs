// 端到端产业链探针：矿石 → 熔炼(矿材) → 制造部件 → 组装舰船
// 复用 arch_probe 的模块加载方式（vm + window.NSK）
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/storage.js", "js/core/store.js",
  "js/data/resources.js", "js/data/starmap.js", "js/data/ships.js", "js/data/recipes.js",
  "js/data/factions.js", "js/data/names.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js",
  "js/engine/booster.js", "js/engine/mastery.js", "js/engine/production.js",
  "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js", "js/engine/sites.js",
  "js/narrative/events.js", "js/engine/settle.js",
];
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { Core, Data, Engine } = sandbox.NSK;

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log("PASS", n, e || ""); } else { fail++; console.log("FAIL", n, e || ""); } };

const now = Date.now();
const s = Engine.State.defaultState(now, Data);

// 给足产业链上游材料（矿石）
s.res.fe_ore = 100000; s.res.ni_ore = 100000; s.res.bo_ore = 100000;

// ---- 第1环：熔炼 矿石 → 矿材 ----
const feAlloyBefore = s.res.fe_alloy || 0;
const e1 = Engine.Production.enqueue(s, "smelt", "smelt_fe_alloy", 5);
ok("①熔炼入队", e1.ok, JSON.stringify(e1));
Engine.Settle.settle(s, now + 60 * 1000); // 推进 60s（5批×8s=40s 完成）
const feAlloyAfter = s.res.fe_alloy || 0;
ok("①熔炼产出矿材(fe_alloy)", feAlloyAfter > feAlloyBefore, "fe_alloy " + feAlloyBefore + " -> " + feAlloyAfter);

// ---- 第2环：制造部件 矿材 → 部件 ----
const structBefore = s.res.struct || 0;
const e2 = Engine.Production.enqueue(s, "manufacture", "mk_struct", 5);
ok("②制造部件入队", e2.ok, JSON.stringify(e2));
Engine.Settle.settle(s, now + 120 * 1000); // 再推进 60s（5批×16s=80s）
const structAfter = s.res.struct || 0;
ok("②制造产出部件(struct)", structAfter > structBefore, "struct " + structBefore + " -> " + structAfter);

// ---- 第3环：组装舰船 部件+矿材 → 整船 ----
const shipBefore = s.ships.length;
// 确保材料够 frigate cost: { fe_alloy:20, struct:4 }
s.res.fe_alloy = (s.res.fe_alloy || 0) + 100;
s.res.struct = (s.res.struct || 0) + 100;
const e3 = Engine.Production.buildShip(s, "frigate");
ok("③组装舰船入队", e3.ok, JSON.stringify(e3));
Engine.Settle.settle(s, now + 200 * 1000); // 再推进 80s（frigate buildTime=60s）
const shipAfter = s.ships.length;
ok("③组装产出整船(state.ships)", shipAfter > shipBefore, "ships " + shipBefore + " -> " + shipAfter + (s.ships.length ? " [" + s.ships[s.ships.length-1].name + "]" : ""));

// ---- 全链路闭环确认 ----
ok("产业链四级全通", feAlloyAfter > feAlloyBefore && structAfter > structBefore && shipAfter > shipBefore);

console.log("\n== 产业链端到端结果: " + pass + " PASS / " + fail + " FAIL ==");
process.exit(fail ? 1 : 0);
