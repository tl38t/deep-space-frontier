// ================================================================
// 深空星疆 —— 舰队引擎探针（Node 沙箱，无浏览器）
// 覆盖 Engine.Fleet：迁移 / 配属 / 换乘 / 三防迁移 / 槽位回收 / 拒绝条件 / 汇总排序
// 运行：node game/sim/fleet_engine.mjs
// ================================================================
import fs from "fs";
import vm from "vm";
import path from "path";

const ROOT = "D:/深空星疆：商业与战争/game";
const sb = {};
sb.window = sb; sb.self = sb; sb.console = console;
vm.createContext(sb);
for (const f of ["js/data/ships.js", "js/engine/fleet.js"]) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
}
const Ships = sb.NSK.Data.Ships;
const Fleet = sb.NSK.Engine.Fleet;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  cond ? pass++ : fail++;
  console.log((cond ? "PASS] " : "FAIL] ") + name + (extra !== undefined ? "  → " + extra : ""));
};

const HP = (id) => Ships.maxHp(id);

function mkMember(id, shipId, hpRatio) {
  const mx = HP(shipId);
  const r = hpRatio === undefined ? 1 : hpRatio;
  return {
    id: id, name: "成员" + id, shipId: shipId, status: "idle", destroyed: false,
    hp: { shield: Math.round(mx.shield * r), armor: Math.round(mx.armor * r), structure: Math.round(mx.structure * r) },
    fitted: { high: [], mid: [], low: [], rig: [] },
  };
}
function mkState(members) {
  return {
    base: { nodeId: "n_start", bodyLevel: 0 },
    members: members || [],
    ships: [],
    equipment: {},
  };
}

/* ── 1. 旧档迁移：成员无船 → ensure 补一艘，舰种与 m.shipId 一致 ── */
{
  const st = mkState([mkMember("a", "frigate"), mkMember("b", "destroyer")]);
  ok("迁移前 ships 为空", st.ships.length === 0);
  Fleet.ensure(st);
  ok("ensure 为每个成员补一艘船", st.ships.length === 2, st.ships.length + " 艘");
  ok("成员 shipUid 全部有效", st.members.every(m => st.ships.some(s => s.id === m.shipUid)));
  ok("船 memberId 指回成员", st.members.every(m => st.ships.find(s => s.id === m.shipUid).memberId === m.id));
  ok("船舰种继承 m.shipId", st.members.every(m => st.ships.find(s => s.id === m.shipUid).shipId === m.shipId),
    st.ships.map(s => s.shipId).join(","));

  const n = st.ships.length;
  Fleet.ensure(st);
  Fleet.ensure(st);
  ok("ensure 幂等（连调两次不重复补船）", st.ships.length === n, st.ships.length + " vs " + n);
}

/* ── 2. 孤儿船回收 + 阵亡标记 ── */
{
  const st = mkState([mkMember("a", "frigate"), mkMember("b", "frigate")]);
  Fleet.ensure(st);
  st.members.splice(0, 1);              // a 被解雇
  Fleet.ensure(st);
  const orphans = st.ships.filter(s => !s.memberId);
  ok("解雇成员的船回收为库存", orphans.length === 1, orphans.length + " 艘库存");

  const st2 = mkState([mkMember("c", "frigate")]);
  Fleet.ensure(st2);
  st2.members[0].destroyed = true;
  Fleet.ensure(st2);
  ok("阵亡成员的船标为 lost", st2.ships[0].status === "lost", st2.ships[0].status);
}

/* ── 3. 库存船配属给成员：旧船回库存 ── */
{
  const st = mkState([mkMember("a", "frigate")]);
  Fleet.ensure(st);
  const oldShip = st.ships[0];
  const newShip = Fleet.newShip(st, "cruiser", null);
  st.ships.push(newShip);
  const r = Fleet.assign(st, newShip.id, "a");
  ok("库→成员 配属成功", r.ok, r.err || r.shipName);
  ok("成员 shipId 同步为新舰种", st.members[0].shipId === "cruiser", st.members[0].shipId);
  ok("成员 shipUid 指向新船", st.members[0].shipUid === newShip.id);
  ok("旧船回库存（memberId=null）", oldShip.memberId === null, String(oldShip.memberId));
  ok("成员 hp 上限变为巡洋级", st.members[0].hp.shield === HP("cruiser").shield,
    st.members[0].hp.shield + " vs " + HP("cruiser").shield);
}

/* ── 4. 两人换乘（对调）── */
{
  const st = mkState([mkMember("a", "frigate"), mkMember("b", "destroyer")]);
  Fleet.ensure(st);
  const shipA = st.ships.find(s => s.memberId === "a");
  const shipB = st.ships.find(s => s.memberId === "b");
  const r = Fleet.assign(st, shipB.id, "a");
  ok("换乘（抢别人的船）成功", r.ok && r.swapped, r.err || "swapped=" + r.swapped);
  ok("a 现在开 b 的旧船", st.members[0].shipUid === shipB.id && st.members[0].shipId === "destroyer");
  ok("b 接过 a 的旧船", st.members[1].shipUid === shipA.id && st.members[1].shipId === "frigate",
    st.members[1].shipId);
  ok("两艘船没有被重复配属", new Set(st.ships.map(s => s.memberId)).size === st.ships.length);
}

/* ── 5. 三防按损伤比例迁移（换船 ≠ 免费修满）── */
{
  const st = mkState([mkMember("a", "frigate", 0.5)]);
  Fleet.ensure(st);
  const big = Fleet.newShip(st, "battleship", null);
  st.ships.push(big);
  const before = { shield: st.members[0].hp.shield / HP("frigate").shield };
  Fleet.assign(st, big.id, "a");
  const mx = HP("battleship");
  const after = st.members[0].hp.shield / mx.shield;
  ok("损伤比例保留（50% → 50%）", Math.abs(after - 0.5) < 0.01,
    "before=" + before.shield.toFixed(3) + " after=" + after.toFixed(3));
  ok("换船后血量绝对值按新上限放大", st.members[0].hp.shield > HP("frigate").shield,
    st.members[0].hp.shield + " vs 旧上限 " + HP("frigate").shield);
  ok("换船后 hp 不超过新上限", st.members[0].hp.shield <= mx.shield && st.members[0].hp.armor <= mx.armor);
}

/* ── 6. 槽位缩水：溢出装备退回仓库 ── */
{
  const st = mkState([mkMember("a", "battleship")]);
  Fleet.ensure(st);
  const la = Ships.slotLayout("battleship");   // high2 mid2 low1 rig1
  st.members[0].fitted = { high: ["eq_h1", "eq_h2"], mid: ["eq_m1"], low: ["eq_l1"], rig: ["eq_r1"] };
  const small = Fleet.newShip(st, "frigate", null);
  st.ships.push(small);
  Fleet.assign(st, small.id, "a");
  const lf = Ships.slotLayout("frigate");      // high1 mid1 low0 rig0
  ok("high 槽位裁到旗舰布局", st.members[0].fitted.high.length === lf.high,
    st.members[0].fitted.high.length + " / " + lf.high);
  ok("low 槽位裁到 0", st.members[0].fitted.low.length === 0);
  ok("rig 槽位裁到 0", st.members[0].fitted.rig.length === 0);
  const returned = Object.values(st.equipment).reduce((a, b) => a + b, 0);
  ok("溢出装备全部退回仓库（3 件：high×1 low×1 rig×1）",
    returned === 3 && st.equipment.eq_h2 === 1 && st.equipment.eq_l1 === 1 && st.equipment.eq_r1 === 1,
    JSON.stringify(st.equipment));
  ok("装在槽内的装备没被误退", st.members[0].fitted.high[0] === "eq_h1");
}

/* ── 7. 拒绝条件 ── */
{
  const st = mkState([mkMember("a", "frigate"), mkMember("b", "frigate")]);
  Fleet.ensure(st);
  const stock = Fleet.newShip(st, "cruiser", null);
  st.ships.push(stock);

  st.members[0].status = "dispatched";
  ok("出勤中的成员拒绝换船", !Fleet.assign(st, stock.id, "a").ok, Fleet.assign(st, stock.id, "a").err);
  st.members[0].status = "repairing";
  ok("维修中的成员拒绝换船", !Fleet.assign(st, stock.id, "a").ok, Fleet.assign(st, stock.id, "a").err);
  st.members[0].status = "idle";
  st.members[0].destroyed = true;
  ok("阵亡成员拒绝配属", !Fleet.assign(st, stock.id, "a").ok, Fleet.assign(st, stock.id, "a").err);
  st.members[0].destroyed = false;

  const lost = Fleet.newShip(st, "frigate", null);
  lost.status = "lost";
  st.ships.push(lost);
  ok("已损失舰船拒绝配属", !Fleet.assign(st, lost.id, "a").ok, Fleet.assign(st, lost.id, "a").err);
  ok("不存在的船拒绝配属", !Fleet.assign(st, "s_nope", "a").ok, Fleet.assign(st, "s_nope", "a").err);
  ok("不存在的成员拒绝配属", !Fleet.assign(st, stock.id, "m_nope").ok, Fleet.assign(st, stock.id, "m_nope").err);

  const cur = st.ships.find(s => s.memberId === "b");
  ok("配给现任驾驶者本人 → 拒绝（无变化）", !Fleet.assign(st, cur.id, "b").ok, Fleet.assign(st, cur.id, "b").err);
  ok("拒绝操作后归属没有被破坏", cur.memberId === "b" && st.members[1].shipUid === cur.id);
}

/* ── 8. summary 计数 + rows 排序 ── */
{
  const st = mkState([mkMember("a", "frigate"), mkMember("b", "destroyer", 0.4)]);
  Fleet.ensure(st);
  st.ships.push(Fleet.newShip(st, "cruiser", null));
  st.ships.push(Fleet.newShip(st, "battleship", null));
  const dead = Fleet.newShip(st, "frigate", null); dead.status = "lost";
  st.ships.push(dead);

  const s = Fleet.summary(st);
  ok("summary 总数正确（4 存 + 1 损）", s.total === 5, JSON.stringify(s));
  ok("summary 在役 2", s.crewed === 2, s.crewed);
  ok("summary 库存 2", s.stock === 2, s.stock);
  ok("summary 战损 1", s.lost === 1, s.lost);
  ok("summary 受损 1（b 成员残血）", s.damaged === 1, s.damaged);

  const rows = Fleet.rows(st);
  const lastLive = rows.findIndex(r => r.status === "lost");
  const firstLost = rows.findIndex(r => r.status === "lost");
  ok("rows 把战损排到最后", firstLost === rows.length - 1, "index=" + firstLost + "/" + rows.length);
  ok("rows 在役排在库存之前",
    rows.findIndex(r => r.owner) < rows.findIndex(r => !r.owner && r.status !== "lost"),
    rows.map(r => r.status === "lost" ? "L" : (r.owner ? "C" : "S")).join(""));
  ok("rows 带舰级与槽位", rows.every(r => r.tier >= 1 && typeof r.slotTotal === "number"));
  ok("rows 舰船编号形如 S-XXXX", rows.every(r => /^S-[0-9A-Z]{4}$/.test(r.label)), rows.map(r => r.label).join(","));
  // 同毫秒连造多艘时，id 头部时间戳完全相同 → 编号必须取尾部随机段才不会全撞成一个
  ok("同批建的同型船编号互不重复", new Set(rows.map(r => r.label)).size === rows.length,
    rows.map(r => r.label).join(","));

  const st2 = Fleet.stockShips(st);
  ok("stockShips 只返回无主且未损失的船", st2.length === 2 && st2.every(x => !x.memberId && x.status !== "lost"), st2.length);
  const am = Fleet.assignableMembers(st);
  ok("assignableMembers 排除阵亡与忙碌", am.length === 2, am.length);
  st.members[0].status = "repairing";
  ok("忙碌成员不在可配属列表", Fleet.assignableMembers(st).length === 1, Fleet.assignableMembers(st).length);
}

/* ── 9. 一致性：ships 与 members 不会互相矛盾 ── */
{
  const st = mkState([mkMember("a", "frigate"), mkMember("b", "frigate"), mkMember("c", "frigate")]);
  Fleet.ensure(st);
  const ids = ["cruiser", "battleship", "destroyer"];
  for (const id of ids) st.ships.push(Fleet.newShip(st, id, null));
  // 乱序配属，制造多次换船
  Fleet.assign(st, st.ships[3].id, "a");
  Fleet.assign(st, st.ships[4].id, "b");
  Fleet.assign(st, st.ships[3].id, "c");   // c 抢 a 的巡洋舰
  Fleet.ensure(st);
  const okAll = st.members.every(m => {
    const s = st.ships.find(x => x.id === m.shipUid);
    return s && s.memberId === m.id && s.shipId === m.shipId;
  });
  ok("多轮换船后成员↔船 双向一致", okAll, st.members.map(m => m.name + ":" + m.shipId).join(","));
  ok("没有任何一艘船被两个成员同时持有",
    new Set(st.ships.filter(s => s.memberId).map(s => s.memberId)).size === st.ships.filter(s => s.memberId).length);
}

console.log("");
console.log("==== RESULT: PASS=" + pass + " FAIL=" + fail + " ====");
process.exit(fail ? 1 : 0);
