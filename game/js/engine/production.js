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
  // 蓝图效率研究（ME/TE）：同样惰性取用，避免与 UMD 注册顺序耦合
  function _Invention() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Invention : null; }
  // 科技树（④ 泰坦子系统 requiresTech 门禁校验用）：惰性取用，避免 load-time 捕获为 null
  function _Tech() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Tech : null; }
  // 读取某科技节点已达等级（1 代同义：state.tech.levels[id]，未研究=0）
  function techLevelOf(state, id) {
    const lv = state && state.tech && state.tech.levels ? state.tech.levels[id] : 0;
    return lv || 0;
  }
  function techNameOf(id) {
    const T = _Tech();
    const n = (T && T.byId) ? T.byId(id) : null;
    return (n && n.name) || id;
  }

  const MAX_BATCHES = 2000; // 单次 settle 安全上限，防离线巨量迭代冻结

  function canAfford(res, cost) {
    for (const k in cost) if ((res[k] || 0) < cost[k]) return false;
    return true;
  }
  function spend(res, cost) { for (const k in cost) res[k] = Math.max(0, (res[k] || 0) - cost[k]); }
  function gain(res, out, qty) { res[out] = (res[out] || 0) + qty; }
  // 总装船坞（manufacture）槽位由「部件制造队列」+「造船队列」+「强化队列」共享
  function manufactureUsed(state) {
    const ind = state.base.industry;
    return (ind.manufactureQueue || []).length + (ind.buildQueue || []).length + (ind.enhanceQueue || []).length;
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
    // ④ 泰坦子系统：配方级科技门禁（requiresTech）。未达等级拒绝入队。
    if (r.requiresTech != null && techLevelOf(state, r.requiresTech) < 1)
      return { ok: false, err: "需先完成科技「" + techNameOf(r.requiresTech) + "」" };
    // 精炼门禁（复用 1 代精炼等级语义，落到本作 bodyLevel 轴）：bodyLevelReq 未满足拒绝入队
    if (r.bodyLevelReq != null && state.base.bodyLevel < r.bodyLevelReq)
      return { ok: false, err: "舰基等级不足，无法精炼该矿材" };
    const q = state.base.industry[queueType + "Queue"];

    // 总装整船走 manufacture 但引用 ships（此处仅部件/矿材/图纸）
    repeat = repeat || 1;
    // 精密配给剂材料折扣：仅总装部件(manufacture)享受舰船材料折扣（与 1 代 getShipBuildingQuote kind:"component" 同口径）；
    // 精炼/发明输入不受影响。折扣在入队时锁定到 it.in（与 1 代「报价即扣料」一致）。
    const inCost0 = (queueType === "manufacture" && Booster && Booster.discountedCost)
      ? Booster.discountedCost(state, r.in, "ship") : r.in;
    // 蓝图 ME（材料效率研究）：**必须在 discountedCost 之后**叠，避免 1 代 station.js:1074
    // 的重复叠折扣 bug。目前仅弹药 T1 三条制造配方有对应蓝图；其余返回 0，原样通过。
    const I0 = _Invention();
    const inCost = (I0 && queueType === "manufacture")
      ? I0.applyMeReduction(inCost0, I0.meReductionForRecipe(state, queueType, recipeId))
      : inCost0;
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

  // ---- 蓝图效率研究（ME / TE）入队：复用 inventQueue 通用批量队列 ----
  // 队列项 outType:"study"；扣费口径与 1 代等价（每循环 2000×tier 星币 + tier 张改装图纸），
  // 差异仅在**扣费时机**：1 代每完成 1 循环才扣，本作通用队列入队扣第 1 批、之后每批续扣。
  // 设计稿已接受（改通用队列会影响其余 5 条产线，风险远大于收益）。
  function enqueueStudy(state, key, dir, repeat) {
    const I = _Invention();
    if (!I) return { ok: false, err: "蓝图研究系统未就绪" };
    const bp = I.blueprintByKey(key);
    if (!bp) return { ok: false, err: "蓝图不存在" };
    if (!I.isUnlocked(state, bp)) return { ok: false, err: "科研 Lv" + bp.gate + " 解锁" };
    const plan = Data.Ships.bodyLevelPlan(state.base.bodyLevel);
    const q = state.base.industry.inventQueue || (state.base.industry.inventQueue = []);
    if (q.length >= plan.invent) return { ok: false, err: "发明舱槽位已满（需升级舰基）" };
    const d = dir === "te" ? "te" : "me";
    const cost = I.cycleCostOf(bp);
    repeat = repeat || 1;
    if (!canAfford(state.res, cost)) return { ok: false, err: "星币或改装图纸不足" };
    spend(state.res, cost);   // 入队即扣第 1 循环；后续续批由 processQueue 的既有逻辑扣
    const durationMult = Base && Base.queueDurationMultiplier ? Base.queueDurationMultiplier(state, "invent") : 1;
    q.push({
      recipeId: "study:" + key + ":" + d,
      studyKey: key, studyDir: d,
      dur: I.cycleSecondsOf(bp) * durationMult,
      out: "study", qty: 0, outType: "study",
      in: cost, startedAt: Date.now(), repeat: repeat, done: 0,
    });
    return { ok: true };
  }

  // 增强剂速度乘区（按队列 + 队列项类型）：忠实 1 代 getBoosterEffectState 语义。
  // 总装队列里「装备制造」走装备工程加速，「部件/整船」走舰船工程加速；其余队列一一对应。
  function boosterSpeedFor(state, queueType, it) {
    const B = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Booster : null;
    if (!B || !B.getEffectState) return 1;
    const eff = B.getEffectState(state);
    const I = _Invention();
    if (queueType === "smelt") return eff.smeltSpeedMultiplier;
    if (queueType === "invent") return 1;   // 研究作业自身**不吃** TE（1 代同口径）
    if (queueType === "booster") {
      const r = eff.boosterSpeedMultiplier;
      const teR = I ? I.teReductionForRecipe(state, "booster", it && it.recipeId) : 0;
      return teR ? r / (1 - teR) : r;       // 1 代 manufacturing.js:182 原式，禁写 ×(1−teR)
    }
    // 制造车间（2026-11-03 独立队列）：吃「装备制造速度」增强剂
    if (queueType === "equip") return eff.equipmentSpeedMultiplier;
    if (queueType === "manufacture") {
      const isEquip = !!(it && it.recipeId && Data.Equipment && Data.Equipment.byId && Data.Equipment.byId(it.recipeId));
      const r = isEquip ? eff.equipmentSpeedMultiplier : eff.shipSpeedMultiplier;
      // 弹药 T1 三张蓝图有对应制造配方，TE 缩短其制造耗时
      const teR = I ? I.teReductionForRecipe(state, "manufacture", it && it.recipeId) : 0;
      return teR ? r / (1 - teR) : r;
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
          // 装备精炼泵提速：仅统计已装配成员（与既有规则一致）。
          if (mbr.fitted && ArchP.fittedBonuses) {
            smeltFit += ArchP.fittedBonuses(mbr).smeltingSpeed || 0;
          }
          // 舰船工业加成（专项①+②-min）：成员舰船 smeltingSpeed 与装备平行叠加（同池封顶 50%）。
          // 基于成员所分配舰船生效，与是否装配无关；工业舰（驮星/云津/山海级等）驻留阵营即计入，普通舰无 bonuses → 退化为 0。
          const sh = (Data && Data.Ships && Data.Ships.shipById) ? Data.Ships.shipById(mbr.shipId) : null;
          if (sh && sh.bonuses) smeltFit += sh.bonuses.smeltingSpeed || 0;
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
    // ⚠️ **并行槽位**（2026-11-03 修）：队列长度上限 === 槽位上限（enqueue 就是把槽位当占位用），
    // 所以队列里每一项都占一条独立产线，各自按自己的 startedAt 推进。
    // 旧实现只推 q[0]（队首），第 2 项起要等前一项整条跑完才开始 —— 玩家反馈「只有第一个队列能跑」、
    // 界面上第 2/3 条永远 0% 就是这个原因，多槽位形同虚设。
    const alive = [];
    for (let qi = 0; qi < q.length; qi++) {
      const it = q[qi];
      let keep = true;   // false = 该项本帧结束（跑满 或 续不上料）
      while (guard < MAX_BATCHES) {
        const d = effDur(it);                        // 等效单批耗时（同一项在同一帧内恒定）
        const elapsed = (now - it.startedAt) / 1000; // 真实流逝（秒）
        if (typeof console !== "undefined" && state.__dbg) console.log("  PQ", queueType, "slot=", qi, "elapsed=", elapsed.toFixed(2), "effDur=", d.toFixed(2), "pm=", pm, "done=", it.done);
        if (elapsed < d) break; // 本项未到一批
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
        const isStudy = it.outType === "study";
        if (isStudy) {
          // 研究循环：不产出资源、不进产出日志（1 代研究不计工业产出，故也不给精通点）。
          // 扣费已由通用队列在「入队 / 上一批完成时续批」扣好 → paid:true，只推进计数。
          const I = _Invention();
          const r = I ? I.settleCycle(state, it.studyKey, it.studyDir, { paid: true }) : { ok: false };
          if (!r.ok) { keep = false; break; }   // 异形 study 项：零副作用丢弃
        } else if (it.outType === "equipment") {
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
          if (w) {
            const xpAmt = (Sx.recipeBatchXp ? Sx.recipeBatchXp(state, queueType, it) : (it.dur || 0) * 0.35);
            Sx.grantBatchXp(state, w.member, w.skill, xpAmt);
          }
        }
        if (it.done >= it.repeat) { keep = false; break; }
        // 续下一批：推进 startedAt（按等效耗时），重新校验原料（用队列项快照 it.in，避免依赖配方表）
        it.startedAt += d * 1000;
        if (!it.in || !canAfford(state.res, it.in)) { keep = false; break; }
        spend(state.res, it.in);
        guard += 1;
      }
      if (keep) alive.push(it);
    }
    // 原地重写队列（保持 state.base.industry 上那个数组引用不变，外部捕获的引用不失效）
    if (alive.length !== q.length) { q.length = 0; for (let k = 0; k < alive.length; k++) q.push(alive[k]); }
    return log;
  }

  // ---- 造船队列（总装船坞，共享 manufacture 槽位；完成入 state.ships）----
  // 入队：检查总装槽位 + 核心门禁 + 材料，扣材料，写 buildQueue 项。
  function buildShip(state, shipId, repeat) {
    const Ship = Data.Ships;
    const ship = Ship.shipById(shipId);
    if (!ship) return { ok: false, err: "舰船不存在" };
    if (!Ship.canBuildAt(shipId, state.base.bodyLevel)) return { ok: false, err: "核心等级不足（需 Lv." + (ship.bodyLevelReq + 1) + "）" };
    // ④ 泰坦子系统门禁：requiresTech（8 节点顶点 titan_command）+ 需成立军团 + 需完成星图主线
    if (ship.requiresTech != null && techLevelOf(state, ship.requiresTech) < 1)
      return { ok: false, err: "需先完成科技「" + techNameOf(ship.requiresTech) + "」" };
    if (ship.requiresAlliance && !(state.legion && state.legion.formed))
      return { ok: false, err: "需先成立军团（军团系统）" };
    if (ship.requiresStarMap && !state.starMapDone)
      return { ok: false, err: "需先完成星图主线" };
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

  // 装备拆解回收精炼料（2026-11-10）：拆未装配的库存装备 → 按精炼回收率无损返还制造成本材料，
  // 形成「造→拆→回料→再造」闭环，补齐 1 代精炼 parity。
  // 回收率复用科技树·精炼工艺（Tech.smeltYieldMult），默认 1.0 即无损，封顶 1.0（不超发材料）。
  function recoverRate(state) {
    const Tech = (typeof window !== "undefined" && window.NSK && window.NSK.Engine && window.NSK.Engine.Tech) ? window.NSK.Engine.Tech : null;
    const y = (Tech && Tech.smeltYieldMult) ? Tech.smeltYieldMult(state) : 1;
    return Math.min(1.0, y);
  }
  // 纯计算（不落库）：返回某装备拆 count 件的回收明细，供 UI 预览。
  function dismantlePreview(state, equipId, count) {
    const Eq = (Data.Equipment && Data.Equipment.byId) ? Data.Equipment.byId(equipId) : null;
    const rate = recoverRate(state);
    const back = {};
    if (Eq && count > 0) {
      const cost = Eq.cost || {};
      for (const k in cost) {
        const q = Math.floor((cost[k] || 0) * rate);
        if (q > 0) back[k] = (back[k] || 0) + q;
      }
    }
    return { rate: rate, back: back };
  }
  // 实际拆解：校验库存 → 回收材料 → 扣库存。
  function dismantleEquipment(state, equipId, count) {
    count = Math.floor(Number(count) || 0);
    if (count < 1) return { ok: false, err: "数量无效" };
    const Eq = (Data.Equipment && Data.Equipment.byId) ? Data.Equipment.byId(equipId) : null;
    if (!Eq) return { ok: false, err: "装备不存在" };
    const have = ((state.equipment && state.equipment[equipId]) || 0);
    if (have < count) return { ok: false, err: "库存不足（拥有 " + have + "）" };
    const rate = recoverRate(state);
    const back = {};
    const cost = Eq.cost || {};
    for (const k in cost) {
      const q = Math.floor((cost[k] || 0) * rate);
      if (q > 0) back[k] = (back[k] || 0) + q;
    }
    state.res = state.res || {};
    for (const k in back) state.res[k] = (state.res[k] || 0) + back[k];
    state.equipment[equipId] = have - count;
    if (state.equipment[equipId] <= 0) delete state.equipment[equipId];
    return { ok: true, back: back, rate: rate, count: count, name: Eq.name };
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
        // 整船制造经验：发给总装船坞驻舱者，走 manufacture 技能，用 ship.xp（1 代移植真值）。
        // ⚠️ 此前 processBuildQueue 完全没调 grantBatchXp → 造整船一直给 0 制造经验，本次一并补上。
        const Sx = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null;
        if (Sx && Sx.grantBatchXp && Base && Base.stationWorker) {
          const w = Base.stationWorker(state, "build");
          if (w) {
            const xpAmt = (Sx.recipeBatchXp ? Sx.recipeBatchXp(state, "build", it) : (ship.buildTime || it.dur || 0) * 0.35);
            Sx.grantBatchXp(state, w.member, w.skill, xpAmt);
          }
        }
      }
      q.shift();
      guard += 1;
    }
    return log;
  }

  // ---- 舰船强化（总装船坞，共享 manufacture 槽位；短耗时到点掷骰）----
  // ② 2 代重做：每次尝试 = 从当前等级升 1 级（失败照扣、材料随等级指数递增），由成功率公式决定是否升级。
  // 入队即扣「本次（level=curL）」成本；结算逐次续扣（失败也扣，标准 genre）。
  // 单队列项 repeat=N：占 1 个槽位连续尝试 N 次，每次独立掷骰、等级随成功推进。
  function enhanceShip(state, memberId, repeat) {
    const m = (state.members || []).find(x => x.id === memberId);
    if (!m) return { ok: false, err: "成员不存在" };
    if (m.status === "dispatched" || m.status === "traveling" || m.status === "repairing")
      return { ok: false, err: "成员正在出勤/维修，回港后才能强化" };
    const Ship = Data.Ships;
    const ship = Ship.shipById(m.shipId);
    if (!ship) return { ok: false, err: "舰船不存在" };
    if (ship.requiresTech != null && techLevelOf(state, ship.requiresTech) < 1)
      return { ok: false, err: "需先完成科技「" + techNameOf(ship.requiresTech) + "」" };
    const plan = Ship.bodyLevelPlan(state.base.bodyLevel);
    if (manufactureUsed(state) >= plan.manufacture) return { ok: false, err: "总装船坞槽位已满（需升级舰基）" };
    const ES = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.ShipEnhancement : null;
    if (!ES) return { ok: false, err: "强化系统未就绪" };
    const curL = m.enhancementLevel || 0;
    const cost = ES.getCost(state, m, m.shipId, curL); // 升到 curL+1 的成本
    if (!canAfford(state.res, cost)) return { ok: false, err: "材料/星币/泰坦料不足" };
    spend(state.res, cost);
    const Base = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Base : null;
    const durationMult = Base && Base.queueDurationMultiplier ? Base.queueDurationMultiplier(state, "manufacture") : 1;
    const dur = 30 * durationMult; // 短耗时（提议 30s，待标定）：与造船同构但快得多
    const q = state.base.industry.enhanceQueue || (state.base.industry.enhanceQueue = []);
    q.push({ memberId: memberId, shipId: m.shipId, level: curL, fromLevel: curL, toLevel: curL + 1, repeat: repeat || 1, dur: dur, startedAt: Date.now(), done: 0 });
    return { ok: true, fromLevel: curL, toLevel: curL + 1 };
  }

  // 结算强化队列：到点掷骰（确定性 rng，在线/离线一致），成功升级并放大 HP、给 manufacture 经验；失败等级不变（料已扣）。
  function processEnhanceQueue(state, now) {
    const pm = (Base && Base.powerMult) ? Base.powerMult(state) : 1;
    const B = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Booster : null;
    const bm = (B && B.getEffectState) ? B.getEffectState(state).shipSpeedMultiplier : 1;
    const M = _Mastery();
    const mm = (M && M.industryTimeMult) ? M.industryTimeMult(state) : 1;
    const effDur = (it) => it.dur / (pm * bm) * mm;
    const q = state.base.industry.enhanceQueue || (state.base.industry.enhanceQueue = []);
    const log = [];
    let guard = 0;
    const alive = [];
    for (const it of q) {
      let keep = true;
      while (guard < MAX_BATCHES) {
        const elapsed = (now - it.startedAt) / 1000;
        if (elapsed < effDur(it)) break;
        const m = (state.members || []).find(x => x.id === it.memberId);
        const ship = Data.Ships.shipById(it.shipId);
        if (!m || !ship) { keep = false; break; } // 成员/舰船丢失：丢弃该项（零副作用）
        const ES = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.ShipEnhancement : null;
        const Ch = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.EnhancementChance : null;
        if (!ES || !Ch) { keep = false; break; }
        const curL = it.level;
        const req = ES.reqOf(it.shipId);
        const eng = ES.memberSkillLevel(m, "manufacture");
        const pc = Ch.chance(eng, req, curL);
        // 确定性掷骰：seed 由 rngSeed + startedAt + 已完成次数 派生（与 processQueue 双击骰同口径，在线离线一致）
        const seed = ((state.rngSeed || 0) ^ Math.imul(it.startedAt >>> 0, 0x85EBCA77) ^ Math.imul(it.done + 1, 2654435761)) >>> 0;
        const rng = Core.makeRng(seed);
        const ok = rng() < pc;
        if (ok) {
          const oldMult = ES.getBonuses(it.shipId, curL).hpMultiplier;
          const newMult = ES.getBonuses(it.shipId, curL + 1).hpMultiplier;
          const ratio = oldMult > 0 ? newMult / oldMult : 1;
          // HP 上限随强化放大（本作 m.hp 满血即上限，故直接按比例放大当前值）
          m.hp.shield *= ratio; m.hp.armor *= ratio; m.hp.structure *= ratio;
          m.enhancementLevel = curL + 1;
          it.level = curL + 1;
          // 总装坞制造经验（与 buildShip 同口径）：发给驻舱者，走 manufacture 技能
          const Sx = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null;
          if (Sx && Sx.grantBatchXp && Base && Base.stationWorker) {
            const w = Base.stationWorker(state, "build");
            if (w) {
              const xpAmt = (Sx.recipeBatchXp ? Sx.recipeBatchXp(state, "build", it) : (it.dur || 30) * 0.35);
              Sx.grantBatchXp(state, w.member, w.skill, xpAmt);
            }
          }
          log.push({ memberId: m.id, shipId: it.shipId, level: curL + 1, ok: true });
        } else {
          log.push({ memberId: m.id, shipId: it.shipId, level: curL, ok: false }); // 失败：等级不变、料已扣
        }
        it.done += 1;
        if (it.done >= it.repeat) { keep = false; break; }
        it.startedAt += effDur(it) * 1000;
        // 续批扣下一级成本（失败照扣：同级也扣；成功则扣已晋级后的下一级）
        const nextCost = ES.getCost(state, m, it.shipId, it.level);
        if (!canAfford(state.res, nextCost)) { keep = false; break; }
        spend(state.res, nextCost);
      }
      if (keep) alive.push(it);
    }
    // 原地重写队列（保持数组引用不变，外部捕获的引用不失效）
    if (alive.length !== q.length) { q.length = 0; for (let k = 0; k < alive.length; k++) q.push(alive[k]); }
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
    all.push(...processEnhanceQueue(state, now));
    return all;
  }

  function queueStatus(state, queueType, now) {
    const q = state.base.industry[queueType + "Queue"] || [];
    return q.map(it => {
      const p = Core.clamp((now - it.startedAt) / 1000 / it.dur, 0, 1);
      return { recipeId: it.recipeId, progress: p, repeat: it.repeat, done: it.done };
    });
  }

  return { enqueue, enqueueStudy, boosterSpeedFor, processAll, processQueue, processBuildQueue, processEnhanceQueue, buildShip, enhanceShip, buildEquipment, equipGateLevel, fitEquipment, unfitEquipment, buildStatus, manufactureUsed, queueStatus, canAfford, spend, gain, dismantleEquipment, dismantlePreview, recoverRate };
});
