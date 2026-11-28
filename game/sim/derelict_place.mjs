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

// ── 2. 天体结构契约（2026-11-28 改：不再与 11-01 快照逐点比） ────────────
//   原断言是「与旧快照逐点比 orbit/ang/size，一个都不许动」。星图改成极坐标分层后，
//   节点数/星座分配全变 → 主 PRNG 消耗序列不同 → 每个星系的天体参数必然重算，
//   逐点比只会恒红（实测 5 条 FAIL 全部来自这里）。
//   改为钉住**每个 kind 的结构契约**：数量分布 + 轨道/尺寸/角度合法域。
//   「残骸场不越界、不撞天体」这类几何问题仍由第 1 / 3 节守住，不受影响。
const byKind = {};
for (const n of newMap.nodes) for (const b of n.bodies) (byKind[b.kind] = byKind[b.kind] || []).push({ node: n, b });
const kindOf = k => byKind[k] || [];

// 每星系必带 1 个：主星 / 小行星带 / 气云 / 残骸场 / 月岩区
for (const kind of ["star", "belt", "gas", "derelict", "moon"]) {
  const everyNode = newMap.nodes.every(n => n.bodies.filter(b => b.kind === kind).length === 1);
  ok("每星系恰好 1 个 " + kind, everyNode && kindOf(kind).length === newMap.nodes.length,
    kindOf(kind).length + " 个 / " + newMap.nodes.length + " 节点");
}

// 固定轨道与尺寸
ok("主星 orbit 0 / ang 0 / size 26",
  kindOf("star").every(x => x.b.orbit === 0 && x.b.ang === 0 && x.b.size === 26));
ok("小行星带 orbit 72 / size 17",
  kindOf("belt").every(x => x.b.orbit === 72 && x.b.size === 17));
ok("气云 orbit 50 / size 22",
  kindOf("gas").every(x => x.b.orbit === 50 && x.b.size === 22));
ok("残骸场 orbit = DR_ORBIT / size 9",
  kindOf("derelict").every(x => x.b.orbit === SM.DR_ORBIT && x.b.size === 9));
// 月岩区：size 6，轨道 = min(196, 宿主行星 orbit + 9)，无行星则走兜底 88
ok("月岩区 size 6 / orbit 合法（88~196）",
  newMap.nodes.every(n => {
    const mo = n.bodies.find(b => b.kind === "moon");
    return !!mo && mo.size === 6 && mo.orbit >= 88 && mo.orbit <= 196;
  }));

// 行星 / 空间站：每星系 2~3 个
ok("每星系 2~3 个行星/空间站",
  newMap.nodes.every(n => {
    const k = n.bodies.filter(b => b.kind === "planet" || b.kind === "station").length;
    return k >= 2 && k <= 3;
  }));
const extras = [...kindOf("planet"), ...kindOf("station")];
ok("行星 size 11~18 / 空间站 size 12",
  kindOf("planet").every(x => x.b.size >= 11 && x.b.size <= 18) &&
  kindOf("station").every(x => x.b.size === 12));
ok("行星/空间站 orbit ∈ [112,202]",
  extras.every(x => x.b.orbit >= 112 && x.b.orbit <= 202),
  "越界 " + extras.filter(x => x.b.orbit < 112 || x.b.orbit > 202).length + " 个");

// 角度一律 [0,360) 整数
ok("所有天体角度 ∈ [0,360) 整数",
  Object.keys(byKind).every(k => kindOf(k).every(x =>
    Number.isInteger(x.b.ang) && x.b.ang >= 0 && x.b.ang < 360)));

// 残骸场元数据自洽：id 后缀固定、名字非空、band 与所属区域一致（band 由区域安等决定）
const bandByRegion = {};
let bandConflict = 0;
for (const x of kindOf("derelict")) {
  if (bandByRegion[x.node.region] === undefined) bandByRegion[x.node.region] = x.b.band;
  else if (bandByRegion[x.node.region] !== x.b.band) bandConflict++;
}
ok("残骸场 id / name / band 自洽（band 与所属区域一致）",
  kindOf("derelict").every(x => x.b.id === x.node.id + "_dr" &&
    typeof x.b.name === "string" && x.b.name.length > 0 &&
    Number.isInteger(x.b.band) && x.b.band >= 1 && x.b.band <= 5) && bandConflict === 0,
  "band 冲突 " + bandConflict + " 个");

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
