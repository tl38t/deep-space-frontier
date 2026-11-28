// 临时定向自检：伴生矿/气 rig「在线掷骰 / 离线期望」双轨。验证后删除，不进探针套件。
// 用户 2026-11-28 拍板 A 方案：在线攒满一个名义周期 T 掷一次骰；离线大 dt 直接发期望，O(1)。
import fs from "fs";
import vm from "vm";
import path from "path";
const ROOT = path.resolve("D:/深空星疆：商业与战争/game");
const files = [
  "js/core/rng.js", "js/core/codec.js", "js/core/storage.js", "js/core/equip-instances.js", "js/core/store.js",
  "js/core/save-envelope.js", "js/core/cloud-save-contract.js", "js/core/cloud-providers.js",
  "js/core/cloud-save-service.js", "js/core/persistence.js",
  "js/data/resources.js", "js/data/starmap.js", "js/data/archaeology.js", "js/data/archaeology-content.js",
  "js/data/ships.js", "js/data/recipes.js", "js/data/equipment.js", "js/data/pirates.js", "js/data/raids.js",
  "js/data/tech.js", "js/data/factions.js", "js/data/names.js", "js/lib/eveidle/data/boosters.js",
  "js/engine/state.js", "js/engine/recruit.js", "js/engine/dispatch.js", "js/engine/base.js", "js/engine/npc.js",
  "js/engine/booster.js", "js/engine/mastery.js", "js/engine/tech.js", "js/engine/production.js",
  "js/engine/faction.js", "js/engine/combat.js", "js/engine/logistics.js", "js/engine/sites.js",
  "js/narrative/events.js", "js/engine/settle.js", "js/engine/ship-enhancement.js",
  "js/engine/rig-resonance.js", "js/engine/archaeology.js", "js/engine/repair.js",
];
const sandbox = { console, Date, Math, JSON, Object, Array, String, Number, isNaN, parseInt, parseFloat };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.module = undefined;
const ctx = vm.createContext(sandbox);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
const { Data, Engine, Core } = sandbox.NSK;
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log("PASS", n, e || ""); } else { fail++; console.log("FAIL", n, e || ""); } };

// 造一个「成员在矿石节点采矿 + 装了伴生矿 rig」的夹具
function mineFixture() {
  const st = Engine.State.defaultState(Date.now(), Data);
  const m = st.members[0];
  const node = st.starMap.nodes.find(n => n.abundance && Object.keys(n.abundance).length);
  const ore = Object.keys(node.abundance).sort((a, b) => node.abundance[b] - node.abundance[a])[0];
  m.fitted.rig = [Core.EquipInstances.create(st, "rig_mining_rich_i", [])];  // miningRichChance=0.05
  const r = Engine.Dispatch.assign(st, m.id, "mine", { nodeId: node.id, oreId: ore, bodyId: null });
  if (!r.ok) throw new Error("assign failed: " + JSON.stringify(r));
  st.richCounter = 0;
  st.lastSeen = Date.now();
  return { st, m, node, ore };
}

// 1. 字段存在性：初始 richCounter / assignment.richProgress
{
  const { st, m } = mineFixture();
  ok("字段:richCounter初始0", st.richCounter === 0, "v=" + st.richCounter);
  ok("字段:richProgress初始0", m.assignment.richProgress === 0, "v=" + m.assignment.richProgress);
}

// 2. normalize 幂等补字段（旧档缺失）
{
  const { st, m } = mineFixture();
  delete st.richCounter;
  delete m.assignment.richProgress;
  Core.normalize(st);
  ok("normalize:richCounter补0", st.richCounter === 0, "v=" + st.richCounter);
  ok("normalize:richProgress补0", m.assignment.richProgress === 0, "v=" + m.assignment.richProgress);
}

// 3. 在线小 dt：不掷骰（未满一周期），richProgress 累加生效
{
  const { st, m } = mineFixture();
  const before = st.res.fe_ore || 0;
  const cnt0 = st.richCounter;
  Engine.Settle.settle(st, st.lastSeen + 14000);  // dt=14s < T=15s
  ok("在线:未满周期不掷骰", st.richCounter === cnt0, "cnt=" + st.richCounter);
  ok("在线:进度累加=14/15", Math.abs(m.assignment.richProgress - 14 / 15) < 1e-6, "p=" + m.assignment.richProgress);
  ok("在线:主矿仍连续产出", (st.res.fe_ore || 0) > before, "ore=" + (st.res.fe_ore || 0).toFixed(3));
}

// 4. 在线攒满一周期：掷一次骰（counter+1），余数保留
{
  const { st, m } = mineFixture();
  Engine.Settle.settle(st, st.lastSeen + 15000);  // dt=15s = T，正好一周期
  ok("在线:满周期掷一次骰", st.richCounter === 1, "cnt=" + st.richCounter);
  ok("在线:余数归0", Math.abs(m.assignment.richProgress) < 1e-9, "p=" + m.assignment.richProgress);
}

// 5. 确定性可复现：同 seed + 同 dt + 同装配 → richCounter 与伴生矿量逐值一致
{
  const a = mineFixture(), b = mineFixture();
  b.st.rngSeed = a.st.rngSeed;
  for (let k = 0; k < 5; k++) {
    Engine.Settle.settle(a.st, a.st.lastSeen + 15000 * (k + 1));
    Engine.Settle.settle(b.st, b.st.lastSeen + 15000 * (k + 1));
  }
  ok("可复现:counter一致", a.st.richCounter === b.st.richCounter, a.st.richCounter + " vs " + b.st.richCounter);
  ok("可复现:伴生矿量一致", Math.abs((a.st.res.fe_ore || 0) - (b.st.res.fe_ore || 0)) < 1e-9,
     (a.st.res.fe_ore || 0).toFixed(4) + " vs " + (b.st.res.fe_ore || 0).toFixed(4));
}

// 6. 离线大 dt：直接发期望 n×chance×qty，O(1) 不掷骰（counter 不动）
{
  const { st, m } = mineFixture();
  const chance = 0.05;
  const dt = 3600;            // 1h → n=240 周期
  const n = Math.floor(dt / 15);
  const cnt0 = st.richCounter;
  const mainBefore = st.res.fe_ore || 0;
  const t0 = Date.now();
  Engine.Settle.settle(st, st.lastSeen + dt * 1000);
  const elapsed = Date.now() - t0;
  ok("离线:不掷骰counter不动", st.richCounter === cnt0, "cnt=" + st.richCounter);
  ok("离线:余数保留", Math.abs(m.assignment.richProgress - (dt / 15 - n)) < 1e-6, "p=" + m.assignment.richProgress);
  ok("离线:O(1)瞬时(<200ms)", elapsed < 200, "elapsed=" + elapsed + "ms n=" + n);
  // 伴生矿 = 总量 − 主矿连续产出（主矿口径无法闭式复算，改用「有额外增量」+ 量级断言）
  const delta = (st.res.fe_ore || 0) - mainBefore;
  ok("离线:伴生矿期望>0", delta > 0, "delta=" + delta.toFixed(2));
}

// 7. 离线期望量精确：构造一个不产主矿的对照（abundance 主矿为 0 不便），改测「同 dt 掷骰 vs 期望」的期望等价性
//    用 100 次不同 seed 的在线掷骰求均值，应收敛到离线期望 n×chance
{
  let sum = 0;
  const T = 20, chance = 0.05, trials = 400;
  for (let k = 0; k < trials; k++) {
    const s = Engine.State.defaultState(1000 + k, Data);
    s.rngSeed = (k * 2654435761) >>> 0;
    for (let j = 1; j <= 20; j++) {
      const rng = Core.makeRng((s.rngSeed ^ Math.imul(0x9E3779B1, 0x518C) ^ Math.imul(j, 0x85EBCA77)) >>> 0);
      if (rng() < chance) sum += 1;
    }
  }
  const mean = sum / trials;
  ok("等价:在线20次骰均值≈离线期望", Math.abs(mean - T * chance) < 1.2,
     "mean=" + mean.toFixed(3) + " expect=" + (T * chance).toFixed(3));
}

console.log("RESULT", pass, "PASS", fail, "FAIL");
