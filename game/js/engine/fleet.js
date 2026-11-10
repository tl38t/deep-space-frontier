// ================================================================
// 深空星疆 —— Engine.Fleet：舰队名册（船只资产 / 配属 / 换乘）
// ----------------------------------------------------------------
// 设计意图（2026-11-01）：
//   · 在此之前 state.ships 是一条**死数据**——造船只往数组里 push 一艘
//     {id, shipId, name, status, nodeId}，全工程读它的地方全都是 `.length`，
//     没有任何分配 / 换乘入口。造出来的船对玩法零影响。
//   · 本模块把「船」确立为**独立资产**：每艘船有唯一 id 与主人（memberId 为
//     null 即库存），成员通过 shipUid 指向自己驾驶的那艘。
//
// 关键约束（为什么这样设计）：
//   1. **m.shipId 必须保留**。战斗 / 考古 / 维修 / 装配 / 装备 全部直接读
//      `m.shipId`（combat.js:287、archaeology.js:61、repair.js:36、equipment.js:169…），
//      改这些调用点风险极高。所以 m.shipId 降级为「shipUid 指向那艘船的舰种镜像」，
//      换船时两个字段一起写，所有既有链路零改动。
//   2. 旧档迁移**不升 STATE_VERSION**。ensure() 幂等：老玩家每个成员自动获得一艘
//      「初始配发舰」，与当前 m.shipId 一致，血量不变。
//   3. 换船不白送修复。hp 按**损伤比例**迁移到新船上限（打残的船换到更大的船
//      仍然是同样比例残血），避免「换船 = 免费满血」。
//   4. 换船会改槽位数。新船槽位比旧船少时，溢出装备退回 state.equipment 库存，
//      与 store.js 旧档越界回收同口径，不凭空消失。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {}
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Fleet = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Fleet = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Data = (typeof window !== "undefined" ? window.NSK.Data : null);
  const SLOTS = ["high", "mid", "low", "rig"];

  // 出勤中 / 维修中不能换船：换船会改三防上限与槽位，中途换等于白嫖一次维修，
  // 也会让战斗快照与实船对不上。
  const BUSY_STATUS = { dispatched: 1, traveling: 1, repairing: 1 };

  function shipsOf(state) { return (state && Array.isArray(state.ships)) ? state.ships : []; }
  function maxHp(shipId, enhLvl) { return Data.Ships.maxHp(shipId, enhLvl); }

  // 舰船显示编号：s_<时间戳36>_<随机36> → S-XXXX
  // ⚠️ 必须取**尾部随机段**而不是头部：id 头部是 Date.now().toString(36)，
  // 同一毫秒连造的几艘船前缀完全相同，取头部会让所有同批船编号撞成一样的。
  function label(id) {
    const s = String(id || "");
    const parts = s.split("_");
    const tail = parts.length > 2 ? parts[parts.length - 1] : s;
    const code = tail.toUpperCase().slice(-4);
    return "S-" + (code.length >= 4 ? code : code.padStart(4, "0"));
  }

  function newShip(state, shipId, memberId) {
    const def = Data.Ships.shipById(shipId);
    return {
      id: "s_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e9).toString(36),
      shipId: shipId,
      name: def ? def.name : shipId,
      status: "idle",
      nodeId: (state && state.base) ? state.base.nodeId : null,
      memberId: memberId || null,
    };
  }

  // ---- 旧档迁移 / 一致性修复（幂等）----
  // 三件事：每个成员必有船、船的 memberId 必须指回成员、阵亡成员的船标为 lost。
  function ensure(state) {
    if (!state || typeof Data === "undefined" || !Data.Ships) return state;
    if (!Array.isArray(state.ships)) state.ships = [];
    const members = Array.isArray(state.members) ? state.members : [];
    const byId = {};
    for (const s of state.ships) if (s && s.id) byId[s.id] = s;

    for (const m of members) {
      if (!m.shipId) m.shipId = "rookie_corvette";
      // 1) 成员的 shipUid 是否有效（船存在、且主人是自己）
      let ship = m.shipUid ? byId[m.shipUid] : null;
      if (ship && ship.memberId !== m.id) ship = null;
      // 2) 退一步：有没有别的一艘船记着这个主人（防止 shipUid 丢失但船还在）
      if (!ship) ship = state.ships.find(s => s && s.memberId === m.id) || null;
      // 3) 都没有 → 初始配发一艘，舰种取成员当前 m.shipId（与迁移前行为完全一致）
      if (!ship) {
        ship = newShip(state, m.shipId, m.id);
        state.ships.push(ship);
        byId[ship.id] = ship;
      }
      ship.memberId = m.id;
      ship.shipId = m.shipId;          // 成员侧为准：m.shipId 是既有链路的真相源
      if (!ship.name) { const d = Data.Ships.shipById(ship.shipId); ship.name = d ? d.name : ship.shipId; }
      if (!ship.nodeId) ship.nodeId = (state.base ? state.base.nodeId : null);
      if (m.destroyed) ship.status = "lost";
      else if (ship.status === "lost") ship.status = "idle";
      m.shipUid = ship.id;
    }

    // 孤儿船：主人在名册里已不存在（被解雇）→ 收回库存，别让船跟着幽灵绑定
    const alive = {};
    for (const m of members) alive[m.id] = 1;
    for (const s of state.ships) {
      if (s.memberId && !alive[s.memberId]) s.memberId = null;
      if (!s.status) s.status = "idle";
    }
    return state;
  }

  // ---- 三防按损伤比例迁移到新船上限 ----
  function carryHp(m, oldShipId) {
    const from = maxHp(oldShipId, m.enhancementLevel);
    const to = maxHp(m.shipId, m.enhancementLevel);
    const ratio = (k) => (from[k] > 0 ? Math.max(0, Math.min(1, (m.hp[k] || 0) / from[k])) : 1);
    const r = { shield: ratio("shield"), armor: ratio("armor"), structure: ratio("structure") };
    m.hp = {
      shield: Math.round(to.shield * r.shield),
      armor: Math.round(to.armor * r.armor),
      structure: Math.round(to.structure * r.structure),
    };
  }

  // ---- 槽位缩水：溢出装备退回库存（与 store.js 旧档越界回收同口径）----
  function reclaimOverflow(state, m) {
    if (!m.fitted) return;
    const layout = Data.Ships.slotLayout(m.shipId);
    for (const slot of SLOTS) {
      const cap = layout[slot] || 0;
      const arr = Array.isArray(m.fitted[slot]) ? m.fitted[slot] : [];
      if (arr.length > cap) {
        const over = arr.splice(cap);
        for (const id of over) {
          state.equipment = state.equipment || {};
          state.equipment[id] = (state.equipment[id] || 0) + 1;
        }
      }
      m.fitted[slot] = arr;
    }
  }

  // ---- 配属 / 换乘 ----
  // assign(state, shipUid, memberId)：把这艘船交给这个成员。
  //   · 船本来在别人手上 → 两人交换（对方接走本成员的旧船）
  //   · 成员旧船无人接手 → 回库存（memberId = null）
  function assign(state, shipUid, memberId) {
    ensure(state);
    const target = shipsOf(state).find(s => s.id === shipUid);
    if (!target) return { ok: false, err: "舰船不存在" };
    if (target.status === "lost") return { ok: false, err: "该舰已在战斗中损失，无法配属" };
    const m = (state.members || []).find(x => x.id === memberId);
    if (!m) return { ok: false, err: "成员不存在" };
    if (m.destroyed) return { ok: false, err: "该成员已阵亡，无法配属舰船" };
    if (BUSY_STATUS[m.status]) return { ok: false, err: "成员正在出勤或维修，回港后才能换乘" };
    const myShip = shipsOf(state).find(s => s.id === m.shipUid) || null;
    if (myShip && myShip.id === target.id) return { ok: false, err: "该成员已经驾驶这艘船" };

    const prev = target.memberId ? (state.members || []).find(x => x.id === target.memberId) : null;
    const oldShipId = m.shipId;
    const prevOldShipId = prev && prev.id !== m.id ? prev.shipId : null;

    // 1) 重排归属
    target.memberId = m.id;
    if (prev && prev.id !== m.id) {
      // 交换：原主人接走本成员的旧船（若本成员没有旧船则对方回库存）
      if (myShip) { myShip.memberId = prev.id; prev.shipUid = myShip.id; prev.shipId = myShip.shipId; }
      else { prev.shipUid = null; }
    } else if (myShip) {
      myShip.memberId = null;   // 旧船回库存
    }
    m.shipUid = target.id;
    m.shipId = target.shipId;
    target.nodeId = state.base ? state.base.nodeId : target.nodeId;

    // 2) 三防按比例迁移 + 槽位溢出回收（先迁移 hp 再回收装备，顺序无关但都要做）
    carryHp(m, oldShipId);
    reclaimOverflow(state, m);
    if (prev && prev.id !== m.id && prevOldShipId) {
      carryHp(prev, prevOldShipId);
      reclaimOverflow(state, prev);
    }
    return {
      ok: true, ship: target, member: m,
      swapped: !!(prev && prev.id !== m.id), prev: (prev && prev.id !== m.id) ? prev : null,
      shipName: target.name || target.shipId,
      memberName: m.name,
    };
  }

  // ---- 汇总（舰队页头部统计）----
  function summary(state) {
    ensure(state);
    const list = shipsOf(state);
    let crewed = 0, stock = 0, lost = 0, damaged = 0;
    for (const s of list) {
      if (s.status === "lost") { lost++; continue; }
      if (s.memberId) crewed++; else stock++;
    }
    for (const m of (state.members || [])) {
      if (m.destroyed || !m.hp) continue;
      const mx = maxHp(m.shipId, m.enhancementLevel);
      if (m.hp.shield < mx.shield || m.hp.armor < mx.armor || m.hp.structure < mx.structure) damaged++;
    }
    return { total: list.length, crewed: crewed, stock: stock, lost: lost, damaged: damaged };
  }

  // ---- 舰队页展示行（把船 + 主人 + 三防 + 槽位拼成一份只读视图）----
  function rows(state) {
    ensure(state);
    const out = [];
    for (const s of shipsOf(state)) {
      const def = Data.Ships.shipById(s.shipId) || null;
      const owner = s.memberId ? ((state.members || []).find(x => x.id === s.memberId) || null) : null;
      const mx = def ? maxHp(s.shipId, owner ? owner.enhancementLevel : 0) : null;
      const layout = Data.Ships.slotLayout(s.shipId);
      const fitted = owner && owner.fitted ? owner.fitted : null;
      const used = {};
      for (const slot of SLOTS) used[slot] = fitted && Array.isArray(fitted[slot]) ? fitted[slot].length : 0;
      out.push({
        id: s.id, shipId: s.shipId, name: s.name || (def ? def.name : s.shipId),
        label: label(s.id), tier: def ? def.classTier : 1, def: def,
        status: s.status || "idle", owner: owner,
        hp: owner ? owner.hp : (mx ? { shield: mx.shield, armor: mx.armor, structure: mx.structure } : null),
        max: mx, layout: layout, used: used,
        fittedCount: used.high + used.mid + used.low + used.rig,
        slotTotal: Data.Ships.totalSlots(s.shipId),
        nodeId: s.nodeId || (state.base ? state.base.nodeId : null),
      });
    }
    // 排序：在役优先 → 舰级降序 → 编号，保证列表稳定不跳动
    out.sort((a, b) => {
      const rank = (r) => r.status === "lost" ? 2 : (r.owner ? 0 : 1);
      return rank(a) - rank(b) || b.tier - a.tier || String(a.label).localeCompare(String(b.label));
    });
    return out;
  }

  // 可换乘的库存船（给「换船」选择器用）
  function stockShips(state) {
    ensure(state);
    return shipsOf(state).filter(s => !s.memberId && s.status !== "lost");
  }

  // 可接收舰船的成员（给「配属」选择器用）
  function assignableMembers(state) {
    return (state.members || []).filter(m => !m.destroyed && !BUSY_STATUS[m.status]);
  }

  return {
    SLOTS, BUSY_STATUS,
    ensure, assign, summary, rows, stockShips, assignableMembers,
    label, newShip, maxHp,
  };
});
