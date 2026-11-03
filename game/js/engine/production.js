// ================================================================
// 深空星疆 —— Engine.Production：工业三队列结算
// 精炼(smelt)/制造部件+总装(manufacture)/发明(invent)。
// 入队时扣原料，完成一批产一批（离散批次 + repeat，支持离线 O(批次数)）。
// 精炼恒可；manufacture 造舰种受 bodyLevel 门禁（见 ships.js）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Production = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Production = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Core = (typeof window !== "undefined" ? window.NSK.Core : require("./core/rng.js"));
  const Data = (typeof window !== "undefined" ? window.NSK.Data : require("../data/resources.js"));
  const Base = (typeof window !== "undefined" && window.NSK.Engine) ? window.NSK.Engine.Base : null;
  const Booster = (typeof window !== "undefined" && window.NSK.Engine) ? window.NSK.Engine.Booster : null;
  // 精通点强化用惰性取用（mastery.js 可能晚于本文件注册，避免 load-time 捕获为 null）
  function _Mastery() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Mastery : null; }

  const MAX_BATCHES = 2000; // 单次 settle 安全上限，防离线巨量迭代冻结

  function canAfford(res, cost) {
    for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
    return true;
  }
  function spend(res, cost) { for (const k in cost) res[k] = Math.max(0, (res[k] || 0) - cost[k]); }
  function gain(res, out, qty) { res[out] = (res[out] || 0) + qty; }
  // 总装船坞（manufacture）槽位由「部件制造队列」+「造船队列」共享
  function manufactureUsed(state) {
    const ind = state.base.industry;
    return (ind.manufactureQueue || []).length + (ind.buildQueue || []).length;
  }

  // 入队：检查槽位 + 原料，扣原料，写队列项
  function enqueue(state, queueType, recipeId, repeat) {
    const Ship = Data.Ships;
    // —— 增强剂制造队列（反应实验室）：配方来自 1 代 BOOSTER_RECIPES，瓶身入库 state.res ——
    if (queueType === "booster") {
      const plan = Ship.bodyLevelPlan(state.base.bodyLevel);
      if (state.base.industry.boosterQueue.length >= plan.booster)
        return { ok: false, err: "反应实验室槽位已满（需升级舰基）" };
      const B = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Booster : null;
      if (!B) return { ok: false, err: "增强剂系统未就绪" };
      const cc = B.canCraft(state, recipeId);
      if (!cc.ok) return cc;
      const r = cc.recipe;
      const cost = B.craftCost(state, recipeId); // 已重映射到本作资源键
      repeat = repeat || 1;
      if (!canAfford(state.res, cost)) return { ok: false, err: "原料不足" };
      spend(state.res, cost);
      const durationMult = Base && Base.queueDurationMultiplier ? Base.queueDurationMultiplier(state, "booster") : 1;
      state.base.industry.boosterQueue.push({
        recipeId: recipeId, dur: r.time * durationMult, out: r.itemId, qty: 1, outType: "res",
        in: cost, startedAt: Date.now(), repeat: repeat, done: 0,
      });
      return { ok: true };
    }
    const plan = Ship.bodyLevelPlan(state.base.bodyLevel);
    const slots = queueType === "smelt" ? plan.smelt : queueType === "manufacture" ? plan.manufacture : plan.invent;
    // manufacture 槽位由「部件制造队列」与「造船队列」共享（同为总装船坞）
    const used = queueType === "manufacture" ? manufactureUsed(state) : state.base.industry[queueType + "Queue"].length;
    if (used >= slots) return { ok: false, err: "生产线槽位已满（需升级舰基）" };

    const tbl = queueType === "smelt" ? Data.Recipes.SMELT
      : queueType === "manufacture" ? Data.Recipes.COMPONENT
      : Data.Recipes.INVENT;
    const r = tbl.find(x => x.id === recipeId);
    if (!r) return { ok: false, err: "配方不存在" };
    // 精炼门禁（复用 1 代精炼等级语义，落到本作 bodyLevel 轴）：bodyLevelReq 未满足拒绝入队
    if (r.bodyLevelReq != null && state.base.bodyLevel < r.bodyLevelReq)
      return { ok: false, err: "舰基等级不足，无法精炼该矿材" };
    const q = state.base.industry[queueType + "Queue"];

    // 总装整船走 manufacture 但引用 ships（此处仅部件/矿材/图纸）
    repeat = repeat || 1;
    // 精密配给剂材料折扣：仅总装部件(manufacture)享受舰船材料折扣（与 1 代 getShipBuildingQuote kind:"component" 同口径）；
    // 精炼/发明输入不受影响。折扣在入队时锁定到 it.in（与 1 代「报价即扣料」一致）。
    const inCost = (queueType === "manufacture" && Booster && Booster.discountedCost)
      ? Booster.discountedCost(state, r.in, "ship") : r.in;
    if (!canAfford(state.res, inCost)) return { ok: false, err: "原料不足" };
    spend(state.res, inCost);
    const durationMult = Base && Base.queueDurationMultiplier ? Base.queueDurationMultiplier(state, queueType) : 1;
    q.push({
      recipeId: recipeId, dur: r.dur * durationMult, out: r.out, qty: r.qty, outType: "res",
      in: inCost,
      startedAt: Date.now(), repeat: repeat, done: 0,
    });
    return { ok: true };
  }

  // 增强剂速度乘区（按队列 + 队列项类型）：忠实 1 代 getBoosterEffectState 语义。
  // 总装队列里「装备制造」走装备工程加速，「部件/整船」走舰船工程加速；其余队列一一对应。
  function boosterSpeedFor(state, queueType, it) {
    const B = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Booster : null;
    if (!B || !B.getEffectState) return 1;
    const eff = B.getEffectState(state);
    if (queueType === "smelt") return eff.smeltSpeedMultiplier;
    if (queueType === "invent") return 1;
    if (queueType === "booster") return eff.boosterSpeedMultiplier;
    // 制造车间（2026-11-03 独立队列）：吃「装备制造速度」增强剂
    if (queueType === "equip") return eff.equipmentSpeedMultiplier;
    if (queueType === "manufacture") {
      const isEquip = !!(it && it.recipeId && Data.Equipment && Data.Equipment.byId && Data.Equipment.byId(it.recipeId));
      return isEquip ? eff.equipmentSpeedMultiplier : eff.shipSpeedMultiplier;
    }
    return 1;
  }

  // 结算某队列（推进批次）。powerMult：电网棕化系数（§1.5 运行时降速，正常为 1）；
  //   boosterMult：增强剂整舱加速倍率（>=1，production 已在等效耗时中除以它）。返回产出日志 [{out, qty}]
  function processQueue(state, queueType, now, powerMult) {
    const pm = (powerMult && powerMult > 0) ? powerMult : 1;
    const M = _Mastery();
    const mm = (M && M.industryTimeMult) ? M.industryTimeMult(state) : 1;     // 精通点·工业调度（耗时乘区）
    const Tech = (typeof window !== "undefined" && window.NSK && window.NSK.Engine && window.NSK.Engine.Tech) ? window.NSK.Engine.Tech : null;
    const smeltYieldMult = (Tech && Tech.smeltYieldMult) ? Tech.smeltYieldMult(state) : 1;   // 科技树·精炼工艺（仅 smelt 产出）
    const techManu = (Tech && Tech.manuSpeedFactor) ? Tech.manuSpeedFactor(state) : 1;       // 科技树·柔性产线（仅 manufacture 耗时）
    // 冶炼速度（Phase 2）：外接精炼泵是「any」槽外接设备，作用于舰基冶炼队列。
    // 取全军团装配之和（封顶 50%）——泵是基地设施，不随成员出勤失效，故不走单成员判定。
    let smeltFit = 0;
    if (queueType === "smelt") {
      const ArchP = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Archaeology : null;
      if (ArchP && ArchP.fittedBonuses) {
        for (const mbr of (state.members || [])) {
          if (!mbr.fitted) continue;
          smeltFit += ArchP.fittedBonuses(mbr).smeltingSpeed || 0;
        }
        smeltFit = Math.min(0.50, smeltFit);
      }
    }
    // 驻舱技能因子（2026-11-01）：**运行时算**。queueDurationMultiplier 是入队时烘进 it.dur 的
    // 布局乘区（物理结构不变），而驻舱的人随时会被撤走 —— 撤走就该立刻变慢，所以放这里。
    // 无人驻舱时 sf = 1.4（UNMANNED_PENALTY），不会被布局那一层的 clamp(0.65~1) 钳掉。
    const sf = (Base && Base.stationSpeedMult) ? Base.stationSpeedMult(state, queueType) : 1;
    const effDur = (it) => it.dur / (pm * boosterSpeedFor(state, queueType, it)) * mm / (1 + smeltFit) * sf * ((queueType === "manufacture" || queueType === "equip") ? techManu : 1); // 棕化(pm<1)拉长；增强剂(逐队列项乘区)缩短；精通(mm<1)缩短；精炼泵缩短；驻舱技能缩短/无人拉长；科技树·柔性产线(manufacture)缩短
    // 增强剂双倍产出（冶炼/增幅剂）：取双倍概率；逐批确定性掷骰（派生 rng，避免在线/离线分歧）。
    const eff = (Booster && Booster.getEffectState) ? Booster.getEffectState(state) : null;
    const dblChance = (queueType === "smelt") ? (eff ? eff.doubleSmeltChance : 0)
      : (queueType === "booster") ? (eff ? eff.doubleBoosterChance : 0) : 0;
    const q = state.base.industry[queueType + "Queue"] || (state.base.industry[queueType + "Queue"] = []);
    const log = [];
    let guard = 0;
    while (q.length && guard < MAX_BATCHES) {
      const it = q[0];
      const elapsed = (now - it.startedAt) / 1000; // 真实流逝（秒）
      if (typeof console !== "undefined" && state.__dbg) console.log("  PQ", queueType, "elapsed=", elapsed.toFixed(2), "effDur=", effDur(it).toFixed(2), "pm=", pm, "done=", it.done);
      if (elapsed < effDur(it)) break; // 队首未到一批
      // 完成一批：装备入库，部件/矿材/图纸入 state.res
      // 双倍产出（冶炼/增幅剂）：以「本批起始时刻 + 队列类型盐」派生确定性 rng 掷骰，命中则产量翻倍。
      // 该种子与在线/离线无关（恒由 it.startedAt 决定），保证在线离线一致。
      let outQty = it.qty;
      if (dblChance > 0) {
        const seed = ((state.rngSeed || 0) ^ Math.imul(it.startedAt >>> 0, 0x9E3779B1) ^ (queueType === "smelt" ? 0x5001 : 0x5002)) >>> 0;
        const rng = Core.makeRng(seed);
        if (rng() < dblChance) outQty = it.qty * 2;
      }
      if (queueType === "smelt") outQty = outQty * smeltYieldMult;   // 科技树·精炼工艺（在双倍之后叠加，连乘）
      if (it.outType === "equipment") {
        state.equipment[it.out] = (state.equipment[it.out] || 0) + outQty;
        log.push({ out: it.out, qty: outQty, outType: "equipment" });
      } else {
        gain(state.res, it.out, outQty);
        log.push({ out: it.out, qty: outQty });
      }
      it.done += 1;
      // 驻舱工头经验（2026-11-01）：**真产出一批才涨**，与 1 代「真正使用才涨」同口径。
      // 无人驻舱 = 没人涨（这是驻舱的第二个动机，第一个是耗时倍率）。
      // 用 it.dur 而非 effDur 发经验：effDur 含技能因子，会造成「技能越高练得越慢」。
      const Sx = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null;
      if (Sx && Sx.grantBatchXp && Base && Base.stationWorker) {
        const w = Base.stationWorker(state, queueType);
        if (w) Sx.grantBatchXp(state, w.member, w.skill, it.dur);
      }
      if (it.done >= it.repeat) { q.shift(); continue; }
      // 续下一批：推进 startedAt（按等效耗时），重新校验原料（用队列项快照 it.in，避免依赖配方表）
      it.startedAt += effDur(it) * 1000;
      if (!it.in || !canAfford(state.res, it.in)) { q.shift(); continue; }
      spend(state.res, it.in);
      guard += 1;
    }
    return log;
  }

  // ---- 造船队列（总装船坞，共享 manufacture 槽位；完成入 state.ships）----
  // 入队：检查总装槽位 + 核心门禁 + 材料，扣材料，写 buildQueue 项。
  function buildShip(state, shipId, repeat) {
    const Ship = Data.Ships;
    const ship = Ship.shipById(shipId);
    if (!ship) return { ok: false, err: "舰船不存在" };
    if (!Ship.canBuildAt(shipId, state.base.bodyLevel)) return { ok: false, err: "核心等级不足（需 Lv." + (ship.bodyLevelReq + 1) + "）" };
    const plan = Ship.bodyLevelPlan(state.base.bodyLevel);
    if (manufactureUsed(state) >= plan.manufacture) return { ok: false, err: "总装船坞槽位已满（需升级舰基）" };
    // 精密配给剂舰船材料折扣（与 1 代 getShipBuildingQuote kind:"assembly" 同口径）
    const shipCost = (Booster && Booster.discountedCost) ? Booster.discountedCost(state, ship.cost, "ship") : ship.cost;
    if (!canAfford(state.res, shipCost)) return { ok: false, err: "材料不足" };
    spend(state.res, shipCost);
    const durationMult = Base && Base.queueDurationMultiplier ? Base.queueDurationMultiplier(state, "manufacture") : 1;
    const q = state.base.industry.buildQueue || (state.base.industry.buildQueue = []);
    q.push({ shipId: shipId, dur: ship.buildTime * durationMult, startedAt: Date.now(), repeat: repeat || 1, done: 0 });
    return { ok: true, ship: ship };
  }

  // ---- 装备制造（制造车间，独立 equip 队列；完成入 state.equipment 库存）----
  // 2026-11-03 从总装船坞独立出来：此前与部件/造船共用 manufacture 槽位，现走 equipQueue，
  // 槽位上限 = BODY_LEVELS[].equip（1/1/2/3）。舰体特化加成仍沿用总装坞的（见 Base.queueDurationMultiplier）。
  // 复刻 1 代舰船装配：装备按 T1-T5 分档（equipment.level: 1/15/35/55/80），
  // 映射到舰基核心等级门禁（bodyLevel 0-3，提议值）；消耗 equipment.cost，耗时 equipment.time。
  function equipGateLevel(equipLevel) { return Math.min(3, Math.floor((equipLevel - 1) / 20)); }
  function buildEquipment(state, equipId, repeat) {
    const Eq = (Data.Equipment && Data.Equipment.byId) ? Data.Equipment.byId(equipId) : null;
    if (!Eq) return { ok: false, err: "装备不存在" };
    // 蓝图门禁（1 代 actions.js:339 同口径）：requiresBlueprint 为真且没解锁 → 拒绝。
    // 1 代顺序为「蓝图 → 等级 → 船坞 → 材料」，这里保持一致，蓝图排在最前。
    // ⚠️ 势力商店未实装期间由 Data.Equipment.BP_GRANT_ALL 在建档时全量授予，
    //    故当前走不到这条分支；开关翻成 false 后立即生效。
    if (Eq.requiresBlueprint) {
      const okBp = (Data.Equipment && Data.Equipment.hasBlueprint)
        ? Data.Equipment.hasBlueprint(state, equipId) : true;
      if (!okBp) return { ok: false, err: "缺少蓝图：需先解锁该装备的制造蓝图（势力商店）" };
    }
    // 势力关系门槛（Phase 2）：1 代「势力装备生产许可 A/B/C/D/S」改为本作 relation 门槛。
    // relation 是 0~100 的好感度（每次交付 +4），不是新造的声望数值，故复用现成字段。
    if (Eq.requiresRel) {
      for (const fid in Eq.requiresRel) {
        const ent = (state.factions || []).find(x => x.id === fid);
        const cur = ent ? (ent.relation || 0) : 0;
        const need = Eq.requiresRel[fid];
        if (cur < need) {
          const fdef = (Data.Factions && Data.Factions.factionById) ? Data.Factions.factionById(fid) : null;
          return { ok: false, err: "势力关系不足（" + (fdef ? fdef.name : fid) + " 需 " + need + "，当前 " + Math.round(cur) + "）" };
        }
      }
    }
    const gate = equipGateLevel(Eq.level);
    if (state.base.bodyLevel < gate) return { ok: false, err: "核心等级不足（需 Lv." + (gate + 1) + "）" };
    const plan = Data.Ships.bodyLevelPlan(state.base.bodyLevel);
    const eqUsed = (state.base.industry.equipQueue || []).length;
    if (eqUsed >= plan.equip) return { ok: false, err: "制造车间槽位已满（需升级舰基）" };
    // 精密配给剂装备材料折扣（与 1 代 getEquipEngBuildingQuote 同口径）
    const eqCost = (Booster && Booster.discountedCost) ? Booster.discountedCost(state, Eq.cost, "equip") : Eq.cost;
    if (!canAfford(state.res, eqCost)) return { ok: false, err: "原料不足" };
    spend(state.res, eqCost);
    const durationMult = Base && Base.queueDurationMultiplier ? Base.queueDurationMultiplier(state, "equip") : 1;
    const q = state.base.industry.equipQueue || (state.base.industry.equipQueue = []);
    q.push({ recipeId: equipId, outType: "equipment", out: equipId, qty: 1, in: eqCost, dur: Eq.time * durationMult, startedAt: Date.now(), repeat: repeat || 1, done: 0 });
    return { ok: true, equip: Eq };
  }

  // 结算造船队列：完成一艘 → 推入 state.ships（{id, shipId, name, status, nodeId}），并记 counters.builtShips。
  function processBuildQueue(state, now) {
    const pm = (Base && Base.powerMult) ? Base.powerMult(state) : 1;
    const B = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Booster : null;
    const bm = (B && B.getEffectState) ? B.getEffectState(state).shipSpeedMultiplier : 1; // 造船复用舰船工程增强剂
    const M = _Mastery();
    const mm = (M && M.industryTimeMult) ? M.industryTimeMult(state) : 1;
    const effDur = (it) => it.dur / (pm * bm) * mm;
    const q = state.base.industry.buildQueue || (state.base.industry.buildQueue = []);
    const log = [];
    let guard = 0;
    while (q.length && guard < MAX_BATCHES) {
      const it = q[0];
      const elapsed = (now - it.startedAt) / 1000;
      if (elapsed < effDur(it)) break;
      const ship = Data.Ships.shipById(it.shipId);
      if (ship) {
        // memberId: null = 出厂入库待配属。舰队页（Engine.Fleet）负责把它配给成员；
        // 不直接给 m.shipId，否则会绕过「换船 = 按损伤比例迁移三防」的规则。
        state.ships.push({ id: "s_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36), shipId: ship.id, name: ship.name, status: "idle", nodeId: state.base.nodeId, memberId: null });
        log.push({ shipId: ship.id, name: ship.name });
        state.counters = state.counters || {};
        state.counters.builtShips = (state.counters.builtShips || 0) + 1;
        // 精通点：完成一艘总装 +3（离散发点，非 tick）
        const M = _Mastery();
        if (M && M.award) M.award(state, 3, "ship");
      }
      q.shift();
      guard += 1;
    }
    return log;
  }

  // ---- 舰船装配（成员四槽；复用 1 代 fitted 数组模型）----
  // 装配：从 state.equipment 库存取一件装备，装入成员 m.fitted[slot]；卸下反向退回库存。
  const FIT_SLOTS = ["high", "mid", "low", "rig"];
  const SLOT_CN = { high: "高槽", mid: "中槽", low: "低槽", rig: "改装件" };
  function fitEquipment(state, memberId, slot, equipId) {
    if (FIT_SLOTS.indexOf(slot) < 0) return { ok: false, err: "槽位类型非法" };
    const Eq = (Data.Equipment && Data.Equipment.byId) ? Data.Equipment.byId(equipId) : null;
    if (!Eq) return { ok: false, err: "装备不存在" };
    if (Eq.slot !== slot) return { ok: false, err: "装备槽位不匹配（需 " + (SLOT_CN[Eq.slot] || Eq.slot) + "）" };
    const m = (state.members || []).find(x => x.id === memberId);
    if (!m) return { ok: false, err: "成员不存在" };
    const layout = (Data.Ships && Data.Ships.slotLayout) ? Data.Ships.slotLayout(m.shipId) : {};
    const cap = layout[slot] || 0;
    if (cap <= 0) return { ok: false, err: "该舰无「" + (SLOT_CN[slot] || slot) + "」槽位" };
    const cur = (m.fitted && m.fitted[slot]) || [];
    if (cur.length >= cap) return { ok: false, err: "该槽位已满（" + cap + "）" };
    if ((state.equipment[equipId] || 0) <= 0) return { ok: false, err: "库存不足" };
    state.equipment[equipId] -= 1;
    m.fitted[slot] = cur.concat(equipId);
    return { ok: true, equip: Eq };
  }
  function unfitEquipment(state, memberId, slot, equipId) {
    if (FIT_SLOTS.indexOf(slot) < 0) return { ok: false, err: "槽位类型非法" };
    const m = (state.members || []).find(x => x.id === memberId);
    if (!m) return { ok: false, err: "成员不存在" };
    const arr = (m.fitted && m.fitted[slot]) || [];
    const idx = arr.indexOf(equipId);
    if (idx < 0) return { ok: false, err: "该槽未装配此装备" };
    arr.splice(idx, 1);
    m.fitted[slot] = arr;
    state.equipment[equipId] = (state.equipment[equipId] || 0) + 1;
    return { ok: true, equip: (Data.Equipment && Data.Equipment.byId) ? Data.Equipment.byId(equipId) : null };
  }

  function buildStatus(state, now) {
    const q = state.base.industry.buildQueue || [];
    return q.map(it => {
      const p = Core.clamp((now - it.startedAt) / 1000 / it.dur, 0, 1);
      const ship = Data.Ships.shipById(it.shipId);
      return { shipId: it.shipId, name: ship ? ship.name : it.shipId, progress: p, done: it.done, repeat: it.repeat };
    });
  }

  function processAll(state, now) {
    const pm = (Base && Base.powerMult) ? Base.powerMult(state) : 1;
    const all = [];
    all.push(...processQueue(state, "smelt", now, pm));
    all.push(...processQueue(state, "manufacture", now, pm));
    all.push(...processQueue(state, "equip", now, pm));
    all.push(...processQueue(state, "invent", now, pm));
    all.push(...processQueue(state, "booster", now, pm));
    all.push(...processBuildQueue(state, now));
    return all;
  }

  function queueStatus(state, queueType, now) {
    const q = state.base.industry[queueType + "Queue"] || [];
    return q.map(it => {
      const p = Core.clamp((now - it.startedAt) / 1000 / it.dur, 0, 1);
      return { recipeId: it.recipeId, progress: p, repeat: it.repeat, done: it.done };
    });
  }

  return { enqueue, processAll, processQueue, processBuildQueue, buildShip, buildEquipment, equipGateLevel, fitEquipment, unfitEquipment, buildStatus, manufactureUsed, queueStatus, canAfford, spend, gain };
});
