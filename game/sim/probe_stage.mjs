// 探针：验证 星带全矿种 + 初期/后期星域 + 海盗威胁缩放
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const StarMap = require("../js/data/starmap.js");
const Events = require("../js/narrative/events.js");

const map = StarMap.generateStarMap({});   // 固定种子，确定性
console.log("节点数:", map.nodes.length, " 区域数:", map.regions.length);

// 1) 全矿种：抽几个节点看 abundance 是否含 7 种矿
const ALL_ORES = ["fe_ore","ni_ore","bo_ore","mx_ore","no_ore","zr_ore","px_ore"];
let allOreOk = true;
for (const n of map.nodes) {
  for (const o of ALL_ORES) if (!(o in n.abundance)) { allOreOk = false; }
  const belt = n.bodies.find(b => b.kind === "belt");
  if (!belt || !belt.abundance || !( "px_ore" in belt.abundance)) allOreOk = false;
}
console.log("每个节点 abundance 含全部 7 矿 + belt 含全矿:", allOreOk);

// 丰寡：高安(富裕度1) 节点的 px(越级) 应显著低于 fe(同级)；0.0(富裕度4) 反过来
const secOf = id => (map.regions.find(r => r.id === id) || {}).secLevel;
const secHi = map.nodes.find(n => secOf(n.region) === "1.0-0.8");
const secLo = map.nodes.find(n => secOf(n.region) === "0.0");
console.log("高安(富1) fe/px:", secHi.abundance.fe_ore.toFixed(2), secHi.abundance.px_ore.toFixed(2));
console.log("0.0(富4) px/fe:", secLo.abundance.px_ore.toFixed(2), secLo.abundance.fe_ore.toFixed(2));

// 2) 区域 stage/sec/pirate
console.log("区域:", map.regions.map(r => `${r.name} st${r.stage} sec${r.secLevel} ${r.pirate}`).join(" | "));

// 3) 连边燃料按 stage 加价：找一条跨 stage 边
const crossStage = map.edges.find(e => {
  const a = map.nodes.find(n=>n.id===e.from), b = map.nodes.find(n=>n.id===e.to);
  const ra = map.regions.find(r=>r.id===a.region), rb = map.regions.find(r=>r.id===b.region);
  return ra.stage !== rb.stage;
});
console.log("跨stage边 燃料:", crossStage ? crossStage.fuelCost : "无(全同stage)");

// 4) 海盗威胁缩放：同一次 roll 在高安 vs 0.0 区，mine_pirate 命中率
function pirateHitRate(sec, N) {
  let hit = 0;
  for (let i = 0; i < N; i++) {
    let s = 12345 + i * 7;
    const rng = () => { s = (s*1103515245+12345) & 0x7fffffff; return s/0x7fffffff; };
    const ev = Events.pick("mine", rng, null, null, sec);
    if (ev && ev.id === "mine_pirate") hit++;
  }
  return (hit/N*100).toFixed(1) + "%";
}
console.log("高安(0.9) 海盗事件率:", pirateHitRate(0.9, 4000), " | 0.0(0.1) 海盗事件率:", pirateHitRate(0.1, 4000));

// 5) deadspace 缩放：exp_relic credits 在高威胁区更肥
const mk = sec => { let s=999; const rng=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;}; let r=null; for(let i=0;i<200;i++){const e=Events.pick("explore",rng,null,null,sec); if(e&&e.id==="exp_relic"){r=e;break;}} return r; };
const lo = mk(0.9), hi = mk(0.1);
console.log("残骸场产出 高安 credits:", lo && lo.deltas.credits, " | 0.0 credits:", hi && hi.deltas.credits);

// 6) 确定性：两次生成读同一个节点 abundance 一致
const map2 = StarMap.generateStarMap({});
const same = JSON.stringify(map.nodes[10].abundance) === JSON.stringify(map2.nodes[10].abundance);
console.log("生成确定性(两次一致):", same);
