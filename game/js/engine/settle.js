// ================================================================
// 深空星疆 —— Engine.Settle：时间戳结算核心（§14）
// 单一入口 settle(state, now)。无 DOM 依赖、纯函数式（给定 state+now 可复现）。
// 处理：燃料回复 / 成员连续产出+经验 / 工业批次 / 势力刷新 / 活动事件触发。
// 离线 = 同一次调用（dt 可能很大，但全部 O(1) 或 O(批次数上限)）。
//
// 地基纪律（2026-10-14 固化，参考 Kittens Game 闭式 + EVE-IDLE 教训）：
//  1) 时间戳驱动：dt = (now - lastSeen)/1000，零 tick 累加器。
//  2) 在线离线同核：不分在线/离线，dt 大即离线 → 根治 parity bug。
//  3) dt 封顶：MAX_OFFLINE_SECONDS，超出截断（防数值爆炸 + 异常）。
//  4) rng 解耦：随机源种子只依赖 rngSeed + 语义盐 + 单调计数器，
//     与 now / 调用频率无关 → 同样 elapsed 在线离线随机序列一致。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Settle = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Settle = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Core = (typeof window !== "undefined" ? window.NSK.Core : null);
  const Data = (typeof window !== "undefined" ? window.NSK.Data : null);
  const Dispatch = (typeof window !== "undefined" ? window.NSK.Engine.Dispatch : null);
  const Production = (typeof window !== "undefined" ? window.NSK.Engine.Production : null);
  const Faction = (typeof window !== "undefined" ? window.NSK.Engine.Faction : null);
  const Narrative = (typeof window !== "undefined" ? window.NSK.Narrative : null);
  const Logistics = (typeof window !== "undefined" ? window.NSK.Engine.Logistics : null);
  const Npc = (typeof window !== "undefined" ? window.NSK.Engine.Npc : null);
  const Sites = (typeof window !== "undefined" ? window.NSK.Engine.Sites : null);

  // ---- 标定常量（§13 默认，待平衡） ----
  const FUEL_REGEN = 0.02;       // 跃迁燃料 /秒
  const BASE_MINE = 0.5;         // 矿石基础速率 /秒（abundance=1, lv=0）
  // 经验速率（每技能 /秒，MVP 周五落地提案值，待标定）。train = 演训 dispatch，增长所选技能。
  // 2026-10-30 调慢：原值约 ×10 会导致 1 分钟内冲到 Lv5、半小时破 Lv10；
  //   现约 ÷10，使「试玩周期可见成长但不瞬满」——Lv5 约需 6~9 分钟专注（含专精 passion），Lv10 约需 17~25 分钟。
  //   曲线仍复用 EVE-IDLE 玩家升级曲线（xpForLevel 指数），无 NPC 等级、技能等级无硬上限。
  const XP_RATE = { mining: 0.9, scanning: 0.6, archaeology: 0.6, refine: 0.9, manufacture: 0.7, invent: 0.6, combatLaser: 0.8, combatTurret: 0.8, command: 0.8, defense: 0.6, train: 1.4 };
  // 复用 EVE-IDLE 玩家曲线：xpForLevel(lv)=floor(100*1.1^(lv-1))，技能等级无上限（无 NPC 等级）。
  const LV_THRESHOLD = 100;      // （保留兼容常量；等级改用 levelOf 闭式）
  const EVENT_INTERVAL = 25;      // 每成员活动事件 roll 间隔（秒）
  const MAX_EVENTS_PER_SETTLE = 4;
  const MAX_PENDING_EVENTS = 5;   // 待决事件（含选项/链式）上限：满了不再入队，防刷屏
  const MAX_OFFLINE_SECONDS = 24 * 3600; // 离线结算封顶 24h，超出不补（防数值爆炸 + 异常）

  // 精通点惰性取用（mastery.js 可能晚于本文件注册）
  function _Mastery() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Mastery : null; }

  // 待决事件入队（有 options / chain 的事件不自动结算，等玩家在日报页决策）
  function enqueuePending(state, ev, memberId, now) {
    if (!ev) return false;
    if (!Array.isArray(state.pendingEvents)) state.pendingEvents = [];
    if (state.pendingEvents.length >= MAX_PENDING_EVENTS) return false;
    for (const p of state.pendingEvents) if (p.eventId === ev.id && p.memberId === (memberId || null)) return false;
    state.pendingEvents.push({
      uid: "pe_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36),
      eventId: ev.id,
      memberId: memberId || null,
      queuedAt: now || Date.now(),
    });
    return true;
  }

  // 复用 EVE-IDLE 玩家升级曲线；技能等级无上限（无 NPC 等级）。
  // 累计到等级 L 所需 xp ≈ 1000*(1.1^(L-1) - 1)，闭式反解 → O(1)，不踩 §14.5 红线。
  function xpForLevel(lv) { return Math.floor(100 * Math.pow(1.1, lv - 1)); }
  function levelOf(xp) {
    const x = xp || 0;
    if (x <= 0) return 1;                  // 玩家技能起始 Lv1（无 NPC 等级）
    return 1 + Math.floor(Math.log(x / 1000 + 1) / Math.log(1.1));
  }
  function skillBonus(skills, key) { return 1 + levelOf(skills[key]) * 0.02; }
  // 战斗综合加成：三武器技能（激光/炮台/指挥）等级取平均 → 平滑替代单一 attack。
  function combatBonus(skills) {
    return (skillBonus(skills, "combatLaser") + skillBonus(skills, "combatTurret") + skillBonus(skills, "command")) / 3;
  }

  // 数值规范：所有战斗加成统一为「独立乘区」相乘，禁止隐蔽加算。
  // 公式统一为：产出 = baseRate × skillBonus × envMult × modMult × eff × underCL × dt
  // - baseRate：标定常数（纯数值，无意义）
  // - skillBonus：成员战斗技能加成（三武器等级均值）
  // - envMult：星系环境倍率（secLevel 驱动的 iskMult / repMult）
  // - modMult：成员/舰船/词条修正（预聚合 mods.creditMult 等）
  // - eff：战力效率（小队战力 / 海盗战力，clamp 0.2~2.5）
  // - underCL：等级不足惩罚（固定 ×0.5，否则 1）
  // 未来新增任何修正，必须声明它属于上述哪一类「独立乘区」，否则判为违规。
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  // RimWorld 式经验倍率：major ×1.5 / minor ×1.0 / none ×0.35（只影响成长速度）
  // 再叠成员词条 learnMult（全局学习速度，O(1) 预聚合于 member.mods）
  function passionMult(m, key) {
    const p = m && m.passion && m.passion[key];
    const base = p === "major" ? 1.5 : p === "minor" ? 1.0 : 0.35;
    return base * ((m && m.mods && m.mods.learnMult) || 1);
  }
  // 词条技能经验倍率（O(1) 查预聚合 mods）；再叠人生目的全局乘区 goalXp（⑤）
  function xpMultOf(m, key) {
    const base = (m && m.mods && m.mods.xpMult && m.mods.xpMult[key]) || 1;
    const goal = (m && m.mods && m.mods.goalXp) || 1;
    return base * goal;
  }

  // rng 解耦：种子只依赖存档 rngSeed + 语义盐 + 单调计数器，与 now/调用频率无关 → 在线离线 parity。
  // （旧实现用 rngSeed^now 且多语义源共用一个 rng 实例，导致在线/离线随机序列分歧、事件触发不一致）
  function deriveRng(state, salt, counter) {
    let s = (state.rngSeed ^ Math.imul(salt >>> 0, 0x9E3779B1)) >>> 0;
    s = (s ^ Math.imul(counter >>> 0, 0x85EBCA77)) >>> 0;
    return Core.makeRng(s);
  }

  function pushReport(state, title, lines) {
    state.reports.unshift({ ts: Date.now(), title: title, lines: lines });
    if (state.reports.length > 30) state.reports.length = 30;
  }

  // 移动舰基（消耗燃料，跃迁）
  function moveBase(state, toNodeId) {
    if (toNodeId === state.base.nodeId) return { ok: false, err: "已在目标节点" };
    const adj = Data.StarMap.adjacency(state.starMap);
    const edge = (adj[state.base.nodeId] || []).find(e => e.to === toNodeId);
    if (!edge) return { ok: false, err: "无直达航线" };
    const node = Data.StarMap.nodeById(state.starMap, toNodeId);
    if (node && node.trialOpen === false) return { ok: false, err: "该星域试玩期未开放" };
    if (state.base.fuel < edge.fuelCost) return { ok: false, err: "跃迁燃料不足" };
    state.base.fuel -= edge.fuelCost;
    state.base.nodeId = toNodeId;
    if (node && !node.discovered) { node.discovered = true; state.starMap.discovered.push(toNodeId); }
    return { ok: true, fuelCost: edge.fuelCost };
  }

  // 主结算
  function settle(state, now) {
    const raw = Math.max(0, (now - state.lastSeen) / 1000);
    const dt = Math.min(raw, MAX_OFFLINE_SECONDS); // 封顶：超出部分丢弃（标准放置做法）
    if (dt <= 0) return { dt: 0, produced: [], events: [] };
    const produced = [];
    const events = [];
    // 精通点全局强化（O(1) 读取；combat 乘区用于作战声望/赏金）
    const M = _Mastery();
    const masteryYield = (M && M.combatYieldMult) ? M.combatYieldMult(state) : 1;

    // 0) 预聚合各节点剿匪战力（O(1) 单次扫描；结算循环内只读不重算，不踩 §14.5 红线）
    const combatByNode = {}, combatCount = {};
    for (const m of state.members) {
      if (m.destroyed || !m.assignment || m.assignment.type !== "combat") continue;
      const nid = m.assignment.nodeId;
      combatByNode[nid] = (combatByNode[nid] || 0) + levelOf(m.skills.combatLaser) + levelOf(m.skills.combatTurret) + levelOf(m.skills.command);
      combatCount[nid] = (combatCount[nid] || 0) + 1;
    }

    // 1) 燃料回复
    state.base.fuel = Math.min(state.base.fuelMax, state.base.fuel + FUEL_REGEN * dt);

    // 1.5) 物流补偿累积（由 logistics 岗成员持续产生，软顶 70pp）
    if (Logistics) Logistics.accumulate(state, dt);

    // 1.6) 行星采集设施（EVE 式收菜）：装置产缓冲 + 物流岗自动回收
    if (Sites && Sites.tick) Sites.tick(state, dt);

    // 2) 成员连续产出 + 经验 + 事件
    let eventBudget = MAX_EVENTS_PER_SETTLE;
    for (let mi = 0; mi < state.members.length; mi++) {
      const m = state.members[mi];
      if (m.destroyed || !m.assignment) continue;
      const a = m.assignment;
      const node = Data.StarMap.nodeById(state.starMap, a.nodeId);
      // 物流效率（独立乘区）：远程派遣（采矿/行星开发）产出 × 此系数
      const effLogi = Logistics ? Logistics.jobEfficiency(state, a.nodeId) : 1;
      if (a.type === "mine" && node) {
        // 优先用星系内天体（belt）的 abundance 取矿；无 bodyId（旧档）回退节点 abundance
        const body = Dispatch.bodyById ? Dispatch.bodyById(state.starMap, a.nodeId, a.bodyId) : null;
        const ab = (body && body.abundance) ? body.abundance : node.abundance;
        // 目标矿：assignment.oreId 指定且在该带 abundance 内则用之；否则自动选最丰富（默认行为）
        let ore = (a.oreId && ab[a.oreId] != null) ? a.oreId : (Object.keys(ab).sort((x, y) => ab[y] - ab[x])[0] || Object.keys(node.abundance)[0]);
        const abv = ab[ore] || 0;
        const ym = (m.mods && m.mods.yieldMult && m.mods.yieldMult.mine) || 1;
        const y = BASE_MINE * skillBonus(m.skills, "mining") * abv * dt * ym * effLogi;
        state.res[ore] = (state.res[ore] || 0) + y;
        m.skills.mining = (m.skills.mining || 0) + XP_RATE.mining * dt * passionMult(m, "mining") * xpMultOf(m, "mining");
      } else if (a.type === "explore" && node) {
        a.exploreProgress += dt / 120;
        m.skills.scanning = (m.skills.scanning || 0) + XP_RATE.scanning * dt * passionMult(m, "scanning") * xpMultOf(m, "scanning");
        // 残骸场勘探额外涨考古（archaeology 主要由遗迹事件涨，这里给稳定通道）
        const ebody = Dispatch.bodyById ? Dispatch.bodyById(state.starMap, a.nodeId, a.bodyId) : null;
        if (ebody && ebody.kind === "derelict") m.skills.archaeology = (m.skills.archaeology || 0) + XP_RATE.archaeology * dt * passionMult(m, "archaeology") * xpMultOf(m, "archaeology");
        if (a.exploreProgress >= 1) {
          a.exploreProgress = 0;
          const adj = Data.StarMap.adjacency(state.starMap)[a.nodeId] || [];
          const hidden = adj.map(e => Data.StarMap.nodeById(state.starMap, e.to)).filter(n => n && !n.discovered);
          if (hidden.length) {
            state.exploreCounter = (state.exploreCounter || 0) + 1;
            const er = deriveRng(state, 0xED11, state.exploreCounter);
            const t = hidden[Math.floor(er() * hidden.length)];
            t.discovered = true; state.starMap.discovered.push(t.id);
            pushReport(state, "星图发现", [m.name + " 在「" + node.name + "」侦测到新节点：「" + t.name + "」"]);
          }
        }
      } else if (a.type === "combat") {
        // 轻量化战斗结算：挂机连续速率，O(1)。无逐波仿真、无每击杀簿记、无 N 级变量。
        // 详见 §14.7「轻量化战斗模式」：产出 = baseRate × skill × env × mod × eff × underCL × dt。
        const raid = node ? Data.StarMap.pirateRaid(state.starMap, a.nodeId) : null;
        const sp = combatByNode[a.nodeId] || 0;          // 该节点三武器等级之和
        const cnt = combatCount[a.nodeId] || 0;            // 该节点参战人数
        const skill = combatBonus(m.skills);             // 该成员战斗技能加成（独立乘区）
        const envRep = raid ? raid.repMult : 1;          // 星系环境：声望倍率（独立乘区）
        const envCredit = raid ? raid.iskMult : 1;       // 星系环境：赏金倍率（独立乘区）
        const modCredit = (m.mods && m.mods.creditMult && m.mods.creditMult.combat) || 1; // 成员修正：星币倍率（独立乘区）
        const eff = raid ? clamp(sp / raid.piratePower, 0.2, 2.5) : 1;   // 战力效率（独立乘区）
        const avgCL = cnt > 0 ? sp / cnt : 0;             // 平均战斗等级
        const underCL = (raid && avgCL < raid.requiredCL) ? 0.5 : 1;     // 等级不足惩罚（独立乘区）
        // 基础速率（标定常数）。未来调平衡只改这里，不动公式结构。
        const BASE_REP_RATE = 0.05;
        const BASE_CREDIT_RATE = 0.3;
        state.res.rep += BASE_REP_RATE * skill * envRep * eff * underCL * masteryYield * dt;
        state.res.credits += BASE_CREDIT_RATE * skill * envCredit * modCredit * eff * underCL * masteryYield * dt;
        // 战斗同时增长三武器技能（激光/炮台/指挥，各满额）+ 防御（副，0.6×），复用 EVE-IDLE 战斗攻击三类 / 战斗防御
        m.skills.combatLaser = (m.skills.combatLaser || 0) + XP_RATE.combatLaser * dt * passionMult(m, "combatLaser") * xpMultOf(m, "combatLaser");
        m.skills.combatTurret = (m.skills.combatTurret || 0) + XP_RATE.combatTurret * dt * passionMult(m, "combatTurret") * xpMultOf(m, "combatTurret");
        m.skills.command = (m.skills.command || 0) + XP_RATE.command * dt * passionMult(m, "command") * xpMultOf(m, "command");
        m.skills.defense = (m.skills.defense || 0) + XP_RATE.defense * 0.6 * dt * passionMult(m, "defense") * xpMultOf(m, "defense");
      } else if (a.type === "train") {
        const sk = a.trainSkill || "combatLaser";   // 演训 = EVE-IDLE 主动技能训练，增长所选技能
        m.skills[sk] = (m.skills[sk] || 0) + XP_RATE.train * dt * passionMult(m, sk) * xpMultOf(m, sk);
      }

      // 活动事件 roll（六类 MVP 工作 + 演训/行星开发/物流）
      if (eventBudget > 0 && Narrative && Narrative.pick) {
        a.eventRoll = a.eventRoll || 0; // 防御：assignment 未初始化时避免 NaN
        a.eventRoll += dt;
        let rolls = Math.floor(a.eventRoll / EVENT_INTERVAL);
        if (rolls > 0) {
          a.eventRoll -= rolls * EVENT_INTERVAL;
          const act = a.type; // mine / explore / combat / refine / manufacture / invent / train / develop / logistics
          let rollIdx = a.rollIndex || 0;
          while (rolls-- > 0 && eventBudget > 0) {
            const er = deriveRng(state, 0xA11E + mi, rollIdx++);
            const ev = Narrative.pick(act, er, state, m);
            if (ev) {
              // 有 options / chain 的事件不自动结算 → 入待决队列，等玩家在日报页选择
              if (ev.options && ev.options.length) {
                if (enqueuePending(state, ev, m.id, now)) {
                  pushReport(state, "待决事件 · " + ev.title, [(ev.lines && ev.lines[0]) || "需要你的决策。", "前往「日报」页处理。"]);
                }
              } else {
                Narrative.applyEvent(state, ev, m);
              }
              events.push(ev); eventBudget--;
            }
          }
          a.rollIndex = rollIdx;
        }
      }

      // 行为里程碑检查（仅对在岗成员；幂等，已得不再发）
      if (Npc && Npc.checkMilestones) Npc.checkMilestones(state, m);
    }

    // 3) 工业批次
    const batchLog = Production.processAll(state, now);
    produced.push(...batchLog);
    // 精通点：完成 1 批工业/总装 +1（离散发点，非 tick；MAN 批次数已由 MAX_BATCHES 限流）
    if (batchLog.length && M && M.award) M.award(state, batchLog.length, "industry");

    // 4) 势力刷新（rng 内部派生，见 faction.js）
    Faction.refreshFactions(state, now);

    state.lastSeen = now;
    return { dt: dt, produced: produced, events: events };
  }

  // 兼容旧调用：事件结算统一委托 Narrative（已修复「顶层 skillKey/skill 不生效」的历史 bug）
  function applyEvent(state, ev, member) {
    if (Narrative && Narrative.applyEvent) Narrative.applyEvent(state, ev, member);
  }

  return {
    settle, moveBase, levelOf, skillBonus, xpForLevel, XP_RATE, FUEL_REGEN, BASE_MINE, LV_THRESHOLD, MAX_OFFLINE_SECONDS,
    passionMult, xpMultOf, enqueuePending, MAX_PENDING_EVENTS,
  };
});
