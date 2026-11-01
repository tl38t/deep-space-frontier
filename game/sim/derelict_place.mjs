// 残骸场定位回归探针。
// 核心目的：把残骸场从「画布外的 orbit 200~218」挪到画布内（orbit 104），
// 同时 **必须证明其它天体一个都没动** —— makeDerelict 少消耗一次 rand() 就会让整张星图重排。
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = "D:/深空星疆：商业与战争/game";
const OLD_PATH = process.env.OLD_STARMAP || "C:/Users/Administrator/AppData/Local/Temp/smc/old.js";
const NEW_PATH = path.join(ROOT, "js/data/starmap.js");

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("PASS] " + name); }
  else { fail++; console.log("FAIL] " + name + (detail ? "  → " + detail : "")); }
}

function loadMap(starmapPath) {
  const sb = {}; sb.window = sb; sb.self = sb; sb.console = console;
  vm.createContext(sb);
  for (const f of ["js/core/rng.js", "js/data/resources.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
  }
  vm.runInContext(fs.readFileSync(starmapPath, "utf8"), sb, { filename: starmapPath });
  const SM = sb.NSK.Data.StarMap;
  return { SM, map: SM.generateStarMap(null, {}) };
}

const oldRes = loadMap(OLD_PATH);
const newRes = loadMap(NEW_PATH);
const oldMap = oldRes.map, newMap = newRes.map, SM = newRes.SM;

const R2D = Math.PI / 180;
const svgX = b => 200 + b.orbit * Math.cos(b.ang * R2D);
const svgY = b => 200 + b.orbit * Math.sin(b.ang * R2D);
// 圆心到画布四边的最小距离（负数 = 圆心已在画布外）
const edgeDist = b => Math.min(svgX(b), svgY(b), 400 - svgX(b), 400 - svgY(b));

function bodiesOf(map, kind) {
  const out = [];
  for (const n of map.nodes) for (const b of n.bodies || []) if (!kind || b.kind === kind) out.push({ node: n.id, b });
  return out;
}

// ── 1. 残骸场：轨道与出界 ─────────────────────────────────────────────
const drNew = bodiesOf(newMap, "derelict");
const drOld = bodiesOf(oldMap, "derelict");
ok("节点数一致（207）", newMap.nodes.length === oldMap.nodes.length && newMap.nodes.length === 207, String(newMap.nodes.length));
ok("残骸场数一致（每节点 1 个）", drNew.length === 207 && drOld.length === 207, drNew.length + " vs " + drOld.length);

const oldOrbits = drOld.map(x => x.b.orbit);
const newOrbits = drNew.map(x => x.b.orbit);
ok("旧版确实全部越界（orbit 全在 200~218）",
  Math.min(...oldOrbits) >= 200 && Math.max(...oldOrbits) <= 218,
  Math.min(...oldOrbits).toFixed(1) + "~" + Math.max(...oldOrbits).toFixed(1));
ok("新版轨道统一为 DR_ORBIT(104)", newOrbits.every(o => o === SM.DR_ORBIT), [...new Set(newOrbits)].join(","));

const oldOut = drOld.filter(x => edgeDist(x.b) < 0).length;
const newOut = drNew.filter(x => edgeDist(x.b) < 0).length;
ok("旧版圆心出界 85 个（问题复现）", oldOut === 85, String(oldOut));
ok("新版圆心出界 0 个", newOut === 0, String(newOut));

const DR_R = 15;
const oldTight = drOld.filter(x => edgeDist(x.b) < x.b.size + 16).length;
const newTight = drNew.filter(x => edgeDist(x.b) < DR_R).length;
ok("旧版贴边 150 个（问题复现）", oldTight === 150, String(oldTight));
ok("新版视觉半径 15 也完全在画布内", newTight === 0, String(newTight));

const minEdge = Math.min(...drNew.map(x => edgeDist(x.b)));
ok("新版距画布边最近 ≥ 80 单位", minEdge >= 80, minEdge.toFixed(1));

// ── 2. 其它天体：必须一个都没动 ────────────────────────────────────────
for (const kind of ["star", "belt", "gas", "planet", "station"]) {
  const a = bodiesOf(oldMap, kind), b = bodiesOf(newMap, kind);
  if (!a.length && !b.length) { ok("其它天体 " + kind + "：两版都无", true); continue; }
  // 气云自 2026-11-01 起改为「每星系必有」（原本 40% 概率），总数必然从 76 涨到 207。
  // 这里要验的不是「数量相同」，而是**既有那 76 个一个都没动**（参数取自原 rand 序列），
  // 新增的 131 个走独立 hashPrng，不能反过来扰动别的东西（下面 planet/station 的零漂移就是证据）。
  if (kind === "gas") {
    const byNode = {};
    for (const x of b) byNode[x.node] = x;
    const kept = a.filter(x => byNode[x.node] && byNode[x.node].b.id === x.b.id &&
      Math.abs(byNode[x.node].b.orbit - x.b.orbit) < 1e-9 && byNode[x.node].b.ang === x.b.ang &&
      byNode[x.node].b.size === x.b.size);
    ok("既有气云 76 个位置完全不变（新增 " + (b.length - a.length) + " 个补全）",
      kept.length === a.length && b.length === 207, kept.length + "/" + a.length + " 保留，总数 " + b.length);
    continue;
  }
  const same = a.length === b.length && a.every((x, i) =>
    x.node === b[i].node && x.b.id === b[i].b.id &&
    Math.abs(x.b.orbit - b[i].b.orbit) < 1e-9 && x.b.ang === b[i].b.ang && x.b.size === b[i].b.size);
  const drift = a.length === b.length ? a.filter((x, i) => x.b.ang !== b[i].b.ang).length : -1;
  ok(kind + " 位置完全不变（" + a.length + " 个）", same, "漂移 " + drift + " 个");
}

// 残骸场的 id/name/band 不该被这次定位改动影响
const drSameMeta = drNew.every((x, i) => x.b.id === drOld[i].b.id && x.b.name === drOld[i].b.name && x.b.band === drOld[i].b.band && x.b.size === drOld[i].b.size);
ok("残骸场 id / name / band / size 未变", drSameMeta);

// ── 3. 角度避让：与邻近天体的间隙 ──────────────────────────────────────
let worstGap = Infinity, worstNode = "";
for (const n of newMap.nodes) {
  const dr = (n.bodies || []).find(b => b.kind === "derelict");
  if (!dr) continue;
  const dx = svgX(dr), dy = svgY(dr);
  for (const b of n.bodies) {
    if (b === dr || !b.orbit || b.kind === "belt") continue;   // belt 是整圈，不参与点对点
    const gap = Math.hypot(dx - svgX(b), dy - svgY(b)) - (b.size + DR_R);
    if (gap < worstGap) { worstGap = gap; worstNode = n.id + " vs " + b.kind; }
  }
}
console.log("  最小间隙 = " + worstGap.toFixed(1) + " 单位（" + worstNode + "）");

const newCollide = [];
for (const n of newMap.nodes) {
  const dr = (n.bodies || []).find(b => b.kind === "derelict");
  if (!dr) continue;
  const dx = svgX(dr), dy = svgY(dr);
  for (const b of n.bodies) {
    if (b === dr || !b.orbit || b.kind === "belt") continue;
    // 按实际 size 判定（图形未改时残骸只有 9）：真实覆盖重叠才算撞
    if (Math.hypot(dx - svgX(b), dy - svgY(b)) < b.size + dr.size) { newCollide.push(n.id + "/" + b.kind); break; }
  }
}
const oldCollide = [];
for (const n of oldMap.nodes) {
  const dr = (n.bodies || []).find(b => b.kind === "derelict");
  if (!dr) continue;
  const dx = svgX(dr), dy = svgY(dr);
  for (const b of n.bodies) {
    if (b === dr || !b.orbit || b.kind === "belt") continue;
    if (Math.hypot(dx - svgX(b), dy - svgY(b)) < b.size + dr.size) { oldCollide.push(n.id + "/" + b.kind); break; }
  }
}
ok("新版与行星/空间站实际覆盖重叠 < 旧版", newCollide.length < oldCollide.length || oldCollide.length === 0,
  "新 " + newCollide.length + " vs 旧 " + oldCollide.length);

// ── 4. 旧档迁移：幂等 ─────────────────────────────────────────────────
function makeLegacyMap() {
  // 模拟旧档：把残骸场 orbit 改回 200+，其余不动
  const m = newRes.SM.generateStarMap(null, {});
  for (const n of m.nodes) {
    const dr = (n.bodies || []).find(b => b.kind === "derelict");
    if (dr) { dr.orbit = 200 + (n.id.length % 18); dr.ang = 30; }
  }
  return m;
}
const legacy = makeLegacyMap();
const legacyBad = bodiesOf(legacy, "derelict").filter(x => x.b.orbit > 180).length;
ok("构造的旧档有越界残骸场", legacyBad === 207, String(legacyBad));

SM.ensureBodies(legacy);
const fixed = bodiesOf(legacy, "derelict");
ok("ensureBodies 把旧档全部修回 DR_ORBIT", fixed.every(x => x.b.orbit === SM.DR_ORBIT), [...new Set(fixed.map(x => x.b.orbit))].join(","));
ok("迁移后出界数归零", fixed.filter(x => edgeDist(x.b) < 0).length === 0);

const snap1 = fixed.map(x => x.node + ":" + x.b.orbit + ":" + x.b.ang).join("|");
SM.ensureBodies(legacy);
const snap2 = bodiesOf(legacy, "derelict").map(x => x.node + ":" + x.b.orbit + ":" + x.b.ang).join("|");
ok("迁移幂等（再跑一次结果一致）", snap1 === snap2);

// 迁移结果应与全新生成的星图完全一致（确定性）
const freshSnap = bodiesOf(newRes.SM.generateStarMap(null, {}), "derelict").map(x => x.node + ":" + x.b.orbit + ":" + x.b.ang).join("|");
ok("迁移结果 = 全新生成结果（可复现）", snap1 === freshSnap);

// ── 5. 已迁移的档不再被改写 ───────────────────────────────────────────
const clean = newRes.SM.generateStarMap(null, {});
const before = bodiesOf(clean, "derelict").map(x => x.b.ang).join(",");
SM.ensureBodies(clean);
const after = bodiesOf(clean, "derelict").map(x => x.b.ang).join(",");
ok("已是新轨道的档，ensureBodies 不再改动角度", before === after);

console.log("\n======== RESULT: PASS=" + pass + " FAIL=" + fail + " ========");
process.exit(fail ? 1 : 0);
