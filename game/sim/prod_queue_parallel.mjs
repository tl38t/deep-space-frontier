// 探针：工业队列「并行槽位」回归（2026-11-03）
// 背景：玩家反馈「只有第一个队列可以正常运行」——SMELT 队列显示 3/3，但第 2 项起进度恒 0%。
// 根因：production.processQueue 只推进 q[0]（队首），后入队的项要等前一项整条跑完才开始，
//       与设计「每个队列的并行槽位数由 bodyLevel 决定」矛盾（架构设计.md §生产线数量）。
// 本探针钉住：① 队列内每一项都独立推进；② 完成项出队不影响其余项；③ 缺料项单独出队，不拖累其余；
//            ④ 并行后「离线一次结算 == 在线多次结算」仍成立。
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/store.js",
  "js/core/save-envelope.js", "js/core/cloud-save-contract.js",
  "js/core/cloud-providers.js", "js/core/cloud-save-service.js", "js/core/persistence.js",
  "js/data/resources.js", "js/data/starmap.js", "js/data/ships.js", "js/data/recipes.js",
  "js/data/raids.js", "js/data/pirates.js", "js/data/equipment.js", "js/data/factions.js", "js/data/names.js",
  "js/data/tech.js", "js/engine/tech.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js",
  "js/engine/npc.js", "js/engine/booster.js", "js/engine/mastery.js",
  "js/engine/production.js", "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js",
  "js/narrative/events.js", "js/engine/settle.js",
  "js/lib/eveidle/host-stubs.js",
  "js/lib/eveidle/data/boosters.js",
];
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined; sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { Data, Engine } = sandbox.NSK;
const Prod = Engine.Production;

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; fails.push(name); console.log("  FAIL  " + name + (extra !== undefined ? "  → " + JSON.stringify(extra) : "")); }
}

// bodyLevel: 0→1 槽 / 1→2 槽 / 2~3→3 槽（Data.Ships.bodyLevelPlan）
function state0(bodyLevel) {
  const st = Engine.State.defaultState(1234567890, Data);
  if (Engine.Base && Engine.Base.normalize) Engine.Base.normalize(st);
  st.base.bodyLevel = bodyLevel == null ? 2 : bodyLevel;
  st.res.fe_ore = 5000; st.res.ni_ore = 5000; st.res.bo_ore = 5000; st.res.px_ore = 5000;
  st.base.industry.smeltQueue.length = 0;
  return st;
}
const snap = (st, ks) => ks.reduce((o, k) => (o[k] = st.res[k] || 0, o), {});
const delta = (a, b, k) => (b[k] || 0) - (a[k] || 0);

const T0 = Date.now();

console.log("== 工业队列并行槽位探针 ==");

// ---------- ① 三槽并发：每一项都要动 ----------
console.log("[① 三槽并发推进]");
{
  const st = state0(2);                             // 星城：smelt 3 槽
  ok("槽位 = 3（星城）", Data.Ships.bodyLevelPlan(st.base.bodyLevel).smelt === 3);
  Prod.enqueue(st, "smelt", "smelt_fe_alloy", 10);  // 10s/批
  Prod.enqueue(st, "smelt", "smelt_ni_alloy", 10);  // 20s/批
  Prod.enqueue(st, "smelt", "smelt_bo_alloy", 10);  // 35s/批
  const q = st.base.industry.smeltQueue;
  ok("入队 3 项", q.length === 3, q.length);
  const s0 = snap(st, ["fe_alloy", "ni_alloy", "bo_alloy"]);

  // 90s 中途：三项都该动过，但都没跑满 10 批 —— 旧实现后两项恒 0
  Prod.processQueue(st, "smelt", T0 + 90 * 1000, 1);
  ok("队首（fe，10s/批）已推进", q[0] && q[0].done > 0, q.map(x => x.done));
  ok("第 2 项（ni，20s/批）已推进 —— 旧实现恒为 0", q[1] && q[1].done > 0, q.map(x => ({ id: x.recipeId, done: x.done })));
  ok("第 3 项（bo，35s/批）已推进 —— 旧实现恒为 0", q[2] && q[2].done > 0, q.map(x => ({ id: x.recipeId, done: x.done })));
  ok("三槽均未跑满（仍占槽）", q.length === 3, q.length);
  ok("批次速度符合配方时长（fe ≥ ni ≥ bo）", q[0].done >= q[1].done && q[1].done >= q[2].done, q.map(x => x.done));

  // 一小时：三项都该跑满 10 批并出队
  Prod.processQueue(st, "smelt", T0 + 3600 * 1000, 1);
  ok("10 批全跑完（队列清空）", q.length === 0, q.length);
  ok("fe_alloy 净产 10", delta(s0, st.res, "fe_alloy") === 10, delta(s0, st.res, "fe_alloy"));
  ok("ni_alloy 净产 10", delta(s0, st.res, "ni_alloy") === 10, delta(s0, st.res, "ni_alloy"));
  ok("bo_alloy 净产 10", delta(s0, st.res, "bo_alloy") === 10, delta(s0, st.res, "bo_alloy"));
}

// ---------- ② 完成项出队不扰动其余项 ----------
console.log("[② 短任务先完成、长任务继续]");
{
  const st = state0(3);                              // 深空要塞：px 可精炼
  const r1 = Prod.enqueue(st, "smelt", "smelt_fe_alloy", 2);   // 2×10s
  const r2 = Prod.enqueue(st, "smelt", "smelt_px_alloy", 50);  // 50×190s
  ok("两项入队成功", r1.ok && r2.ok, [r1, r2]);
  const q = st.base.industry.smeltQueue;
  ok("入队 2 项", q.length === 2, q.length);

  Prod.processQueue(st, "smelt", T0 + 600 * 1000, 1);
  ok("短任务跑完出队", !q.some(x => x.recipeId === "smelt_fe_alloy"), q.map(x => x.recipeId));
  ok("长任务仍在队列且已推进", q.length === 1 && q[0].recipeId === "smelt_px_alloy" && q[0].done > 0, q.map(x => ({ id: x.recipeId, done: x.done })));
  ok("槽位释放后长度 = 1（未误删）", q.length === 1, q.length);
}

// ---------- ③ 缺料项单独出队，不拖累其余 ----------
console.log("[③ 缺料只影响自己]");
{
  const st = state0(2);
  Prod.enqueue(st, "smelt", "smelt_fe_alloy", 100);
  Prod.enqueue(st, "smelt", "smelt_ni_alloy", 100);
  const q = st.base.industry.smeltQueue;
  const s0 = snap(st, ["fe_alloy", "ni_alloy"]);
  st.res.fe_ore = 0;                        // 第一项续不上料
  st.res.ni_ore = 5000;                     // 第二项料足
  Prod.processQueue(st, "smelt", T0 + 600 * 1000, 1);
  ok("缺料项被移出队列", !q.some(x => x.recipeId === "smelt_fe_alloy"), q.map(x => x.recipeId));
  ok("料足项仍在跑且已推进", q.length === 1 && q[0].done > 0, q.map(x => ({ id: x.recipeId, done: x.done })));
  ok("ni 确有产出", delta(s0, st.res, "ni_alloy") > 0, delta(s0, st.res, "ni_alloy"));
}

// ---------- ④ 离线一致性：一次大步长 == 多次小步长（并行后仍成立） ----------
console.log("[④ 离线一次结算 == 在线多次结算]");
{
  const mk = () => {
    const st = state0(2);
    Prod.enqueue(st, "smelt", "smelt_fe_alloy", 30);
    Prod.enqueue(st, "smelt", "smelt_ni_alloy", 30);
    Prod.enqueue(st, "smelt", "smelt_bo_alloy", 30);
    return st;
  };
  const a = mk(); Prod.processQueue(a, "smelt", T0 + 900 * 1000, 1);
  const b = mk();
  for (let t = 1; t <= 90; t++) Prod.processQueue(b, "smelt", T0 + t * 10 * 1000, 1);
  for (const k of ["fe_alloy", "ni_alloy", "bo_alloy"]) {
    ok("一次结算产出 = 分次结算产出（" + k + "）", (a.res[k] || 0) === (b.res[k] || 0), [a.res[k], b.res[k]]);
  }
  ok("队列长度一致（剩余项数相同）", a.base.industry.smeltQueue.length === b.base.industry.smeltQueue.length,
    [a.base.industry.smeltQueue.length, b.base.industry.smeltQueue.length]);
  ok("每项 done 一致", JSON.stringify(a.base.industry.smeltQueue.map(x => [x.recipeId, x.done]))
    === JSON.stringify(b.base.industry.smeltQueue.map(x => [x.recipeId, x.done])),
    [a.base.industry.smeltQueue.map(x => x.done), b.base.industry.smeltQueue.map(x => x.done)]);
  ok("慢槽（bo，35s/批）确未跑满 30 批 —— 900s 不足以跑完", a.base.industry.smeltQueue.length > 0);
}

console.log("\n== 结果：" + pass + " PASS / " + fail + " FAIL ==");
if (fail) { console.log("失败项：" + fails.join(" | ")); process.exit(1); }
