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
  // ⚠️ 已删 combatBonus()（三技能 skillBonus 的算术平均）：无调用方，且与 1 代不符。
  //    1 代是每门武器按自己的 skillKey 取技能（命中 +lv×4、伤害 ×(1+lv×0.02)），
  //    见 engine/combat.js scanFit / SKILL_OF_WEAPON。这里保留注释，防有人再把它加回来。

  // 战斗产出规范（2026-11-01 对齐现状）：
  //   每波掉落 = DROP_CREDIT_BASE × 星系赏金倍率 × Σ成员赏金倍率
  //   总产出   = 每波掉落 × 击杀波数          ← 击杀波数由真实伤害打空编队血量得出
  // 战斗技能不进掉落，而进武器伤害（波变短 → 单位时间波数变多），不重复乘。
  // ⚠️ 已删除：`eff`（小队战力/海盗战力）与 `underCL`（等级不足 ×0.5）两个乘区——
  //    1 代没有「战力」概念，也没有把等级门槛做成软惩罚（它是硬解锁条件）。
  //    这两个量从未参与结算，只在 UI 上承诺过效果，属自创残留。
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

  // 战斗受击：把该节点本 tick 的敌方总伤害平摊给参战成员，按 shield→armor→structure 扣除。
  // 结构归零 → 舰体失去战力，撤出剿匪返港（不阵亡：人是活的，船进船坞修）。
  // 返港后 status="idle"，下一 tick 由 Repair.tick 自动拉进修复泊位（复用 1-E 队列）。
  // O(参战成员)，与离线时长无关（受击量由 Combat.advance 一次算出）。
  function applyCombatDamage(state, nodeId, totalDamage) {
    if (!(totalDamage > 0)) return [];
    const fighters = (state.members || []).filter(function (m) {
      return m && !m.destroyed && m.assignment && m.assignment.type === "combat" && m.assignment.nodeId === nodeId;
    });
    if (!fighters.length) return [];
    const share = totalDamage / fighters.length;
    const withdrawn = [];
    for (const m of fighters) {
      m.hp = m.hp || {};
      let dmg = share;
      for (const key of ["shield", "armor", "structure"]) {
        if (dmg <= 0) break;
        const cur = Math.max(0, m.hp[key] || 0);
        const take = Math.min(cur, dmg);
        m.hp[key] = cur - take;
        dmg -= take;
      }
      // 浮点容差：血池封顶后 damage 恰等于血池，逐项相减会残留 ~1e-13，不能因此判定「还有结构」
      if ((m.hp.structure || 0) <= 1e-6) {
        m.hp.structure = 0;
        m.assignment = null;
        m.status = "idle";
        const ship = Data.Ships.shipById ? Data.Ships.shipById(m.shipId) : null;
        pushReport(state, "战斗撤离", [
          m.name + " 的" + ((ship && ship.name) || "舰船") + "结构被打穿，已撤出剿匪返港，等待船坞修复。",
        ]);
        withdrawn.push(m.id);
      }
    }
    return withdrawn;
  }

  // 整队撤退（断弹）：该节点所有参战成员解除派遣返港待命。
  // 与「结构被打穿」不同——船没坏，是人没弹了。战利品保留（已在逐波结算时入账）。
  function withdrawSquad(state, nodeId, reason) {
    const out = [];
    for (const m of (state.members || [])) {
      if (!m || m.destroyed) continue;
      if (!m.assignment || m.assignment.type !== "combat" || m.assignment.nodeId !== nodeId) continue;
      m.assignment = null;
      m.status = "idle";
      out.push(m.id);
    }
    if (out.length) pushReport(state, "战斗撤退", [reason]);
    return out;
  }

  // 主结算
  function settle(state, now) {
    const raw = Math.max(0, (now - state.lastSeen) / 1000);
    const dt = Math.min(raw, MAX_OFFLINE_SECONDS); // 封顶：超出部分丢弃（标准放置做法）
    if (dt <= 0) return { dt: 0, produced: [], events: [] };
    const produced = [];
    const events = [];
    // 精通点：本 tick 的工业批次发点（`M.award` 在下方批次结算后调用）
    // ⚠️ 2026-11-01：原本这里还算过一个 masteryYield（combat 节点 +8% 赏金/级），
    //    但从未被使用 → 已删。该节点目前**未接线**，属待决策项，不是已完成功能。
    const M = _Mastery();

    // 舰基自动修复（§14）：受损成员回港后排队修复，每 tick 推进
    const Repair = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Repair : null;
    if (Repair) Repair.tick(state, dt);

    // 0) 剿匪结算：每个「有参战成员」的据点结算一次。
    //    焦点节点（state.combatFocus）走逐轮真仿真，其余（含离线大 dt）走一次乘除闭式；
    //    两条路共用 state.combatWaveHp（已打进当前编队的伤害），所以切页签不白打。
    const Combat = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Combat : null;
    const Raids = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data.Raids : null;
    state.combatWaveHp = state.combatWaveHp || {};
    state.battles = state.battles || {};
    if (Combat && Combat.advance) {
      const combatNodes = {};
      for (const m of state.members) {
        if (m.destroyed || !m.assignment || m.assignment.type !== "combat") continue;
        const nid = m.assignment.nodeId;
        // 战斗只发生在具名据点（node.raid）。旧档若有人被派在普通节点，就地召回并提示一次，
        // 避免「派了兵但永远零产出」的静默失效。
        if (Raids && state.starMap && !Raids.raidAt(state.starMap, nid)) {
          const nm = m.name;
          m.assignment = null;
          m.status = "idle";
          pushReport(state, "剿匪规则变更", [nm + " 所在的星系没有海盗据点，已自动召回待命。",
            "现在剿匪需要在星图上选中标有 ⚔ 的据点。"]);
          continue;
        }
        combatNodes[nid] = 1;
      }
      for (const nid in combatNodes) {
        const focus = (state.combatFocus === nid);
        const r = Combat.advance(state, nid, dt, state.combatWaveHp[nid] || 0, focus);
        state.combatWaveHp[nid] = r.waveHp;
        if (r.credits || r.rep) { state.res.credits += r.credits; state.res.rep += r.rep; }
        // 弹药扣除（按弹种；某弹种打空该型武器哑火，全部打空则整队撤退）
        if (r.ammoUsed) {
          for (const k in r.ammoUsed) {
            state.res[k] = Math.max(0, (state.res[k] || 0) - r.ammoUsed[k]);
          }
        }
        // 我方受击（离线同规则）：打到结构归零就当场撤离返港，下一 tick 进修复泊位
        if (r.damage > 0) applyCombatDamage(state, nid, r.damage);
        // 战报每 tick 刷新（含波内进度，供 UI 画编队血条）；只写标量，不拼字符串、不建数组
        const b = state.battles[nid] || (state.battles[nid] = { waves: 0, credits: 0, rep: 0, lastTs: 0 });
        b.waves += r.waves;
        b.credits += r.credits;
        b.rep += r.rep;
        if (r.waves > 0) b.lastTs = now;
        b.waveSec = r.waveSec;
        b.progress = r.progress;
        b.squadDps = r.squadDps;
        b.weaponDps = r.weaponDps;
        b.fleetDps = r.fleetDps;
        b.incomingDps = r.incomingDps;
        b.repairPerSec = r.repairPerSec;
        b.dmgReduction = r.dmgReduction;
        b.fleetHp = r.fleetHp;
        b.band = r.band;
        b.simmed = r.simmed;
        b.hits = r.hits;
        b.misses = r.misses;
        if (r.allDry) {
          delete state.combatWaveHp[nid];
          withdrawSquad(state, nid, "弹药耗尽，剿匪小队已撤离返港（保留已得战利品）。");
          delete state.battles[nid];
        }
      }
      // 战斗结束（节点已无参战成员）时清空该节点战报与余量，保证「本场」语义正确
      for (const k in state.battles) { if (!combatNodes[k]) { delete state.battles[k]; delete state.combatWaveHp[k]; } }
      for (const k in state.combatWaveHp) { if (!combatNodes[k]) delete state.combatWaveHp[k]; }
    }

    // 0.5) 科技研究推进（单线队列，绝对时间戳 endsAt，离线同样完成）
    const Tech = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Tech : null;
    if (Tech) {
      const done = Tech.advance(state, now);
      if (done) {
        pushReport(state, "科技完成 · " + done.node.name,
          [done.node.desc || "", "编制上限现为 " + Tech.squadCapacity(state) + " 人/据点"].filter(Boolean));
      }
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
        // 装配加成（Phase 2）：气云与矿石走**不同乘区**，高槽采集器与低槽提升器叠加。
        //   气云 → gasEfficiency + gasLaserEfficiency
        //   矿石 → miningEfficiency + miningLaserEfficiency
        // 每成员每 tick 聚合一次（O(成员×槽位)，与离线时长无关，红线不破）。
        const ArchM = (window.NSK && window.NSK.Engine && window.NSK.Engine.Archaeology) || null;
        const fitB = (ArchM && ArchM.fittedBonuses) ? ArchM.fittedBonuses(m) : null;
        let fitEff = 1;
        if (fitB) {
          const isGas = !!(Data.Resources && Data.Resources.GAS && Data.Resources.GAS[ore]);
          fitEff = isGas
            ? 1 + (fitB.gasEfficiency || 0) + (fitB.gasLaserEfficiency || 0)
            : 1 + (fitB.miningEfficiency || 0) + (fitB.miningLaserEfficiency || 0);
        }
        const y = BASE_MINE * skillBonus(m.skills, "mining") * abv * dt * ym * effLogi * fitEff;
        state.res[ore] = (state.res[ore] || 0) + y;
        m.skills.mining = (m.skills.mining || 0) + XP_RATE.mining * dt * passionMult(m, "mining") * xpMultOf(m, "mining");
      } else if (a.type === "explore" && node) {
        // 残骸场考古：装配 analyzer 的 archaeologyCycleReduction 缩短遗址周期（封顶 0.50）
        const Arch = (window.NSK && window.NSK.Engine && window.NSK.Engine.Archaeology) || null;
        const cycRed = Arch ? Arch.cycleReduction(m) : 0;
        const period = 120 * (1 - Math.min(0.50, cycRed));
        a.exploreProgress += dt / period;
        const ebody = Dispatch.bodyById ? Dispatch.bodyById(state.starMap, a.nodeId, a.bodyId) : null;
        if (ebody && ebody.kind === "derelict") {
          // —— 残骸场考古（焦点自选）：每个遗址周期按焦点算成功率/掉落/反噬（含船体损伤）——
          m.skills.archaeology = (m.skills.archaeology || 0) + XP_RATE.archaeology * dt * passionMult(m, "archaeology") * xpMultOf(m, "archaeology");
          if (a.exploreProgress >= 1) {
            a.exploreProgress = 0;
            const focus = a.focus || "salvage";
            if (Arch) {
              const res = Arch.cycle(state, m, ebody, focus);
              if (res.drops.credits) state.res.credits = (state.res.credits || 0) + res.drops.credits;
              if (res.drops.bp) state.res.bp = (state.res.bp || 0) + res.drops.bp;
              if (res.drops.rep) state.res.rep = (state.res.rep || 0) + res.drops.rep;
              pushReport(state, "考古 · " + Data.Archaeology.profileById(focus).name, res.lines);
            }
          }
        } else {
          // —— 旧逻辑：行星勘探 = 扫图发现新节点（UI 已下线，仅存量行星 explorer 兼容）——
          m.skills.scanning = (m.skills.scanning || 0) + XP_RATE.scanning * dt * passionMult(m, "scanning") * xpMultOf(m, "scanning");
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
        }
      } else if (a.type === "combat") {
        // 剿匪产出已在第 0 步按节点逐波结算（Engine.Combat.advance）；此处只增长战斗技能，
        // 避免「节点级产出」在成员循环里被重复累加。无逐波仿真、无每击杀簿记。
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
