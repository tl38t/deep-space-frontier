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
  // 采集（采矿/采气）经验已改为按节点富裕度查表（见 MINING_XP_RATE / GAS_XP_RATE），
  // 考古经验改为按遗址档位查表（见 ARCH_XP_BY_BAND），均不再连续 ×dt；
  // 故此处移除 mining/gas/archaeology 三项，避免双源；其余 10 项仍用于批量经验白名单与训练。
  // ⚠️ 2026-11-08：本表**不是当前产率表** —— 战斗按齐射、工业按逐配方 xp、采集按富裕度查表。
  //    这里的值只作 grantBatchXp 的技能白名单 + 异形队列项兜底，改它不会改变正常经验速率。
  const XP_RATE = { refine: 0.9, manufacture: 0.7, research: 0.6, combatLaser: 0.8, combatTurret: 0.8, missile: 0.8, defense: 0.6, capacitor: 0.5, piloting: 0.7, train: 1.4 };

  // 采集经验对回 1 代（2026-11-03）：1 代每秒 = area.baseXP / area.baseTime（eff=1）。
  // 用户定调：baseTime 砍到 1/3 → 每秒 ×3，即下方数值已含 ×3。
  // 按节点富裕度（StarMap.nodeRich，安等→1~4）分档；v1 节点内 XP 不随成员技能缩放。
  const MINING_XP_RATE = { 1: 2.0,   2: 4.0,   3: 5.111, 4: 6.105 }; // 凡晶石/水硼砂/干焦岩/艾克诺岩 (baseXP/baseTime ×3)
  const GAS_XP_RATE    = { 1: 1.333, 2: 3.2,   3: 4.0,   4: 4.622 }; // 富勒烯/稳定富勒烯/高纯/超纯 (baseXP/baseTime ×3)

  // 考古经验对回 1 代（2026-11-04，用户纠正：1 代 systems/archaeology.js:696 是「每次成功解析周期发固定 site.xp」）。
  // 1 代 ARCHAEOLOGY_SITES 每档 3 遗址共用同一 site.xp：I=50 / II=150 / III=400 / IV=900 / V=2000。
  // 2 代残骸场 band(安等分档 1–5) 与 1 代遗址档位 I–V 1:1 对齐，故 xp 直接取 1 代真值；
  // 经验只在 Arch.cycle 成功时发放（与 1 代 if(success) 块一致），不再连续 ×dt。
  const ARCH_XP_BY_BAND = { 1: 50, 2: 150, 3: 400, 4: 900, 5: 2000 };
  function archXpForBand(band) { return ARCH_XP_BY_BAND[band] || ARCH_XP_BY_BAND[1]; }

  // 战斗经验对回 1 代：按「齐射」发（1 代每齐射普通武器 +2 / defense +1，combat.js 真值）。
  //   1 代 1 齐射 = ROUND_SEC 秒；2 代锚点取 advance 的 r.fightSec（本次实际战斗秒数，O(1)，离线同在线），
  //   故每成员每武器技能经验 = VOLLEY_XP × (fightSec/ROUND_SEC) × 烈度(band)。不复用 ×dt 占位。
  //   之所以不用「按波」：高安等敌舰血量约为 band1 的 70 倍，按波会让高安等反而拿 ~25× 更少经验，
  //   与「烈度」目标（危险处更值钱）相反；按齐射(战斗秒)则天然让高安等经验更高。
  const COMBAT_VOLLEY_XP = 2;
  const COMBAT_DEF_XP = 1;
  // 安等烈度：高安等敌舰更硬（每波耗时↑→同时间清波数↓），故按 band 给额外烈度乘区补偿，
  // 使高安等剿匪经验回报高于低安等（提议值，待标定）。
  const COMBAT_INTENSITY_BY_BAND = { 1: 1.0, 2: 1.4, 3: 1.9, 4: 2.6, 5: 3.5 };
  function combatIntensity(band) { return COMBAT_INTENSITY_BY_BAND[band] || COMBAT_INTENSITY_BY_BAND[1]; }
  function miningXpRate(node, isGas) {
    const rich = node ? (node.richness != null ? node.richness : (node.tier != null ? node.tier : 1)) : 1;
    const tbl = isGas ? GAS_XP_RATE : MINING_XP_RATE;
    return tbl[rich] || tbl[1];
  }
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
  // 词条技能经验倍率（O(1) 查预聚合 mods）；再叠人生目的全局乘区 goalXp（⑤）；
  // 末接增强剂神经训练催化器乘区（Engine.Booster.skillXpMultiplierFor，按本作技能键读取，combat 桶已广播到战斗子键）。
  function xpMultOf(state, m, key) {
    const base = (m && m.mods && m.mods.xpMult && m.mods.xpMult[key]) || 1;
    const goal = (m && m.mods && m.mods.goalXp) || 1;
    const Bm = (state && window.NSK && window.NSK.Engine && window.NSK.Engine.Booster) ? window.NSK.Engine.Booster : null;
    const bXp = Bm ? Bm.skillXpMultiplierFor(state, key) : 1;
    return base * goal * bXp;
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
    const T = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Tech : null;
    const fuelMult = (T && T.fuelMult) ? T.fuelMult(state) : 1;
    const need = edge.fuelCost * fuelMult;   // 科技树·跃迁增效：校验与扣减同一值（电容管理只减战斗燃料，不影响跃迁 warpFuel）
    if (state.base.fuel < need) return { ok: false, err: "跃迁燃料不足" };
    state.base.fuel -= need;
    state.base.nodeId = toNodeId;
    if (node && !node.discovered) { node.discovered = true; state.starMap.discovered.push(toNodeId); }
    return { ok: true, fuelCost: need };
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
  // —— 燃料效率乘区（对回 1 代 getArchaeologyFuelCostState 的两项减免）——
  // 1) 船体燃料效率 ship.fuelEfficiency（本作扩展字段，1 代无对应；提议值待标定）
  // 2) 考古燃料效率改装件（rig 槽，bonuses.archaeologyFuelEfficiency，与 archaeologyScan 等同置于 bonuses）
  // 两者均乘性叠加进 eff；调用方 archaeologyFuelCost 不变。
  function fuelEfficiencyMult(state, m) {
    const Data = (typeof window !== "undefined" && window.NSK) ? window.NSK.Data : null;
    let mult = 1;
    // 船体燃料效率：smaller 探索舰更省、capital/supercapital 更费（提议值，见数值标定清单）
    if (Data && Data.Ships && Data.Ships.shipById && m && m.shipId) {
      const ship = Data.Ships.shipById(m.shipId);
      if (ship && typeof ship.fuelEfficiency === "number") mult *= ship.fuelEfficiency;
    }
    // 装配的考古燃料效率改装件（遍历 high/mid/low/rig 四槽，多件乘性叠加）
    if (Data && Data.Equipment && Data.Equipment.byId && m && m.fitted) {
      for (const slot of ["high", "mid", "low", "rig"]) {
        for (const id of (m.fitted[slot] || [])) {
          const eq = Data.Equipment.byId(id);
          const v = eq && eq.bonuses && eq.bonuses.archaeologyFuelEfficiency;
          if (typeof v === "number") mult *= v;
        }
      }
    }
    return mult;
  }

  // 考古每周期燃料（对回 1 代 getArchaeologyFuelCostState：baseFuel = Σ上场装备 combat.fuelCost，
  //   × 船体燃料效率 × 考古燃料效率改装件 × 电容折扣）。后两项效率暂无字段 → 1.0 占位，留接口。
  function archaeologyFuelCost(state, m) {
    const Combat = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Combat : null;
    const baseFuel = Combat && Combat.fittedFuelCost ? Combat.fittedFuelCost(m) : 0;
    const eff = fuelEfficiencyMult(state, m);
    const capXp = (m && m.skills && typeof m.skills.capacitor === "number") ? m.skills.capacitor : 0;
    const capLv = levelOf(capXp);   // xp=0 → levelOf=1（Lv1 电容即有 2% 折扣，对回 1 代）
    const capMult = 1 / (1 + capLv * 0.02);   // 1 代 selectors.js:2671：电容管理降燃料消耗 2%/级，战斗+考古通用
    return baseFuel * eff * capMult;
  }

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

    // 增强剂计时（忠实 1 代逐瓶模型）：按当前在岗活动消耗对应槽位，工业四槽常驻运行。
    const Booster = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Booster : null;
    if (Booster && Booster.tick) Booster.tick(state, now);

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
        // 2026-11-01 起每个星系都有据点，正常情况走不进这里；
        // 保留分支是为了挡住「存档 nodeId 指向已不存在的节点」这类脏数据，
        // 避免「派了兵但永远零产出」的静默失效。
        if (Raids && state.starMap && !Raids.raidAt(state.starMap, nid)) {
          const nm = m.name;
          m.assignment = null;
          m.status = "idle";
          pushReport(state, "剿匪目标失效", [nm + " 所在星系在星图中已不存在，已自动召回待命。"]);
          continue;
        }
        combatNodes[nid] = 1;
      }
      const memberById = {};
      for (const mm of state.members) memberById[mm.id] = mm;
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
        // 战术材料掉落（band N → tactic:tN）：这是 tactic 唯一获取途径，喂给对应 tier 增强剂配方。
        // 直接累加进 state.res（tactic:t1..t5 已在 Resources.ALL 注册，读档安全）。
        if (r.drops) {
          for (const k in r.drops) {
            state.res[k] = (state.res[k] || 0) + r.drops[k];
          }
        }
        // 我方受击（离线同规则）：打到结构归零就当场撤离返港，下一 tick 进修复泊位
        if (r.damage > 0) applyCombatDamage(state, nid, r.damage);
        // 战斗经验对回 1 代（按「齐射=ROUND_SEC 战斗秒」发，O(1)；复用 grantBatchXp 接 passionMult×xpMultOf）：
        //   · 武器系：参战成员每装一门武器类型，每齐射给对应技能 VOLLEY_XP×烈度（没装就不涨）
        //   · defense：本 tick 本舰受创(r.damage>0)才给 DEF_XP×烈度（1 代每齐射受创+1）
        //   锚点取 r.fightSec（本次实际战斗秒数，焦点/闭式同产出，离线不爆炸），非逐波循环。
        if (r.fightSec > 0 && r.combatants) {
          const inten = combatIntensity(r.band);
          const volleys = r.fightSec / Combat.ROUND_SEC;   // 1 代 1 齐射 = ROUND_SEC 秒
          for (const c of r.combatants) {
            const m = memberById[c.id];
            if (!m || m.destroyed) continue;
            for (const key of c.keys) grantBatchXp(state, m, key, COMBAT_VOLLEY_XP * volleys * inten);
            if (r.damage > 0) grantBatchXp(state, m, "defense", COMBAT_DEF_XP * volleys * inten);
            // 电容管理 / 驾驶（均对回 1 代 combat 系技能）：战斗涨经验，量级与武器技能同锚（volleys×inten）。
            // 1 代真值 volleyFuel×0.3 依赖 volleyFuel 追踪，本作战斗不扣燃料，故用同口径 volleys×inten 等价表达（待标定）。
            grantBatchXp(state, m, "capacitor", COMBAT_VOLLEY_XP * volleys * inten);
            grantBatchXp(state, m, "piloting", COMBAT_VOLLEY_XP * volleys * inten);
          }
        }
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

    // 1) 燃料回复（基础再生，与电容管理无关；电容管理效果为降战斗/考古燃料消耗，见 Combat.advance / archaeologyFuelCost）
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
        // 采气 / 采矿分流（2026-11-01 技能体系）：同一采矿派遣按目标矿种自动分派技能。
        // 判定用现成的 Data.Resources.GAS —— 与装配乘区用的是同一个标记，不另起一套判据。
        const isGas = !!(Data.Resources && Data.Resources.GAS && Data.Resources.GAS[ore]);
        const mineKey = isGas ? "gas" : "mining";
        let fitEff = 1;
        if (fitB) {
          fitEff = isGas
            ? 1 + (fitB.gasEfficiency || 0) + (fitB.gasLaserEfficiency || 0)
            : 1 + (fitB.miningEfficiency || 0) + (fitB.miningLaserEfficiency || 0);
        }
        // 增强剂（忠实 1 代）：采矿/气云速度与「翻倍概率」由全局 16 槽聚合。
        // 连续产出模型下，翻倍概率按期望值并入（×(1+chance)），避免离线大 dt 单次掷骰的剧烈波动。
        const Bm = (window.NSK && window.NSK.Engine && window.NSK.Engine.Booster) ? window.NSK.Engine.Booster : null;
        const bEff = Bm ? Bm.getEffectState(state) : null;
        const bSpeed = bEff ? (isGas ? bEff.gasSpeedMultiplier : bEff.miningSpeedMultiplier) : 1;
        const bDouble = bEff ? (isGas ? bEff.doubleGasChance : bEff.doubleMineralChance) : 0;
        const y = BASE_MINE * skillBonus(m.skills, mineKey) * abv * dt * ym * effLogi * fitEff * bSpeed * (1 + bDouble);
        state.res[ore] = (state.res[ore] || 0) + y;
        m.skills[mineKey] = (m.skills[mineKey] || 0) + miningXpRate(node, isGas) * dt * passionMult(m, mineKey) * xpMultOf(state, m, mineKey);
      } else if (a.type === "explore" && node) {
        // 残骸场考古：装配 analyzer 的 archaeologyCycleReduction 缩短遗址周期（封顶 0.50）
        const Arch = (window.NSK && window.NSK.Engine && window.NSK.Engine.Archaeology) || null;
        const cycRed = Arch ? Arch.cycleReduction(m) : 0;
        let period = 120 * (1 - Math.min(0.50, cycRed));
        // 增强剂（遗迹解析液 archaeologySpeed，-8%/-16%/-25% → 周期 ×0.92/0.84/0.75）
        const Bm = (window.NSK && window.NSK.Engine && window.NSK.Engine.Booster) ? window.NSK.Engine.Booster : null;
        const bEff = Bm ? Bm.getEffectState(state) : null;
        if (bEff) period *= bEff.archaeologySpeedMultiplier;
        a.exploreProgress += dt / period;
        const ebody = Dispatch.bodyById ? Dispatch.bodyById(state.starMap, a.nodeId, a.bodyId) : null;
        if (ebody && ebody.kind === "derelict") {
          // —— 残骸场考古（焦点自选）：每个遗址周期按焦点算成功率/掉落/反噬（含船体损伤）——
          // 1 代 fidelity：经验按「每次成功解析周期」发固定 xp（ARCH_XP_BY_BAND[band]，1 代 site.xp 真值），
          // 不再连续 ×dt。band 1–5 = 遗址档位 I–V。失败（反噬）不发经验，与 1 代 if(success) 块一致。
          // while 补齐长 dt（在线逐 tick / 离线一次）下漏算的周期，保证在线/离线 parity；
          // 此前 if 单发会在离线大 dt 丢失其余周期，导致离线考古经验/掉落严重亏欠。
          // 安全上限 2000 次防止极端时长下的意外长循环（远小于 MAX_OFFLINE/period≈720）。
          // 阵亡（m.destroyed）立即停后续周期；report 由 pushReport 封顶 30 条，无刷屏风险。
          if (a.exploreProgress >= 1) {
            const focus = a.focus || "salvage";
            // 成员装配在一次结算内不变：fittedBonuses 提到循环外算一次，循环内复用（离线大批量结算性能）。
            // 成功率仍每周期按当前技能重算（cycle 内 successChance 读 m.skills.archaeology），保 1 代保真。
            const fit = Arch ? Arch.fittedBonuses(m) : null;
            let guard = 0;
            while (a.exploreProgress >= 1 && guard < 2000) {
              guard++;
              // 考古燃料扣减（对回 1 代 getArchaeologyFuelCostState：每成功解析周期扣 baseFuel×效率×电容折扣；
              //   不足则本周期不推进，保留进度待下 tick 重试）。后两项效率暂无字段 → 1.0 占位，留接口。
              const fuelPool = (state.base && typeof state.base.fuel === "number") ? state.base.fuel : 0;
              const fuelCost = archaeologyFuelCost(state, m);
              if (fuelPool < fuelCost) break;
              state.base.fuel = Math.max(0, state.base.fuel - fuelCost);
              a.exploreProgress -= 1;
              if (!Arch) break;
              const res = Arch.cycle(state, m, ebody, focus, fit);
              if (res.drops.credits) state.res.credits = (state.res.credits || 0) + res.drops.credits;
              if (res.drops.bp) state.res.bp = (state.res.bp || 0) + res.drops.bp;
              if (res.drops.rep) state.res.rep = (state.res.rep || 0) + res.drops.rep;
              if (res.success) {
                const band = ebody.band || 1;
                m.skills.archaeology = (m.skills.archaeology || 0)
                  + archXpForBand(band) * passionMult(m, "archaeology") * xpMultOf(state, m, "archaeology");
              }
              pushReport(state, "考古 · " + Data.Archaeology.profileById(focus).name, res.lines);
              if (m.destroyed) { a.exploreProgress = 0; break; }
            }
          }
        } else {
          // —— 旧逻辑：行星勘探 = 扫图发现新节点（UI 已下线，仅存量行星 explorer 兼容）——
          // 2026-11-01：不再增长任何技能。原 scanning 技能已并入 gas（气体采集），
          // 但「扫图发现节点」不是采气，塞给它等于语义污染；这条分支本就已下线，不配发经验。
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
      } else if (a.type === "train") {
        // 演训 = 主动技能训练，增长所选技能。白名单校验：旧存档里可能写着已删除的键（command 等），
        // 直接当键名用会给一个不存在的技能发经验（白算），落到 combatLaser 更安全。
        // 门禁用「键真实存在于 m.skills（12 项）」而非 XP_RATE —— 采矿/采气经验已改查表，
        // 从 XP_RATE 移除后若仍用 XP_RATE 当门禁，演训舱选采矿/采气训练会静默落空（2026-11-03 回归）。
        const sk = (a.trainSkill && m.skills && m.skills[a.trainSkill] !== undefined) ? a.trainSkill : "combatLaser";
        m.skills[sk] = (m.skills[sk] || 0) + XP_RATE.train * dt * passionMult(m, sk) * xpMultOf(state, m, sk);
      } else if (a.type === "logistics") {
        // 物流岗：原地累积物流补偿（见 Logistics.accumulate），并训练「驾驶」技能——
        // 1 代 piloting 既降战斗受伤（闪避 +1/级）又统管物流效率，故双路涨经验（战斗块 + 本岗）。
        m.skills.piloting = (m.skills.piloting || 0) + XP_RATE.piloting * dt * passionMult(m, "piloting") * xpMultOf(state, m, "piloting");
      } else if (a.type === "station") {
        // 驻舱（2026-11-01，用户定「驻舱不涨技能」）：**只有演训舱按时间涨经验** ——
        // 全游戏唯一「不产出也涨」的通道，玩家付的是一个人力。
        // 其余舱段（精炼环/总装船坞/发明舱/指挥塔/泊位/仓储/能源）驻着**不涨**：
        // 工业经验只在「真的产出一批」时结算（见 production.js → Settle.grantBatchXp）。
        if (a.slotType === "habitat" && a.trainSkill && a.trainSkill !== "train" && m.skills && m.skills[a.trainSkill] !== undefined) {
          const sk = a.trainSkill;
          m.skills[sk] = (m.skills[sk] || 0) + XP_RATE.train * dt * passionMult(m, sk) * xpMultOf(state, m, sk);
        }
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

  // 批次经验（production.js 在「一批真的产出」时调用）——这才是 1 代「真正使用才涨」的工业侧口径。
  // 入参 xpAmount 已是「每批完整经验」（配方/舰船/装备自带的 xp，或旧逻辑 速率×时长×BATCH_XP_RATIO 的回退值），
  // 这里只叠加激情(passion)/词条(xpMult)乘区，不再内部乘 XP_RATE —— 配方 xp 本身就是 1 代移植真值（终值）。
  // 2026-11-08 科研经验四路全部定稿后，本常量**不再被任何正常队列使用**：
  // 精炼/制造/装备/整船/增强剂/发明(含 inv_bp) 均逐配方显式配 xp。
  // 保留仅为旧档里缺字段的异形队列项不至于拿 0 经验；探针 G 组断言正常路径命中 0 次。
  const BATCH_XP_RATIO = 0.5;
  function grantBatchXp(state, m, key, xpAmount) {
    if (!m || !key || key === "train" || !XP_RATE[key]) return 0;
    const gain = (xpAmount || 0);
    if (!m.skills) m.skills = {};
    m.skills[key] = (m.skills[key] || 0) + gain * passionMult(m, key) * xpMultOf(state, m, key);
    return gain;
  }

  // 解析某队列项每批应得经验：优先用配方/舰船/装备自带的 xp（1 代移植真值，已是「每批完整经验」）。
  // 2026-11-08：精炼/发明/增强剂/整船亦已全部补齐显式 xp，回退分支仅为兼容兜底。
  function recipeBatchXp(state, queueType, it) {
    const Data = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data : null;
    const Base = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Base : null;
    const skill = (Base && Base.QUEUE_SKILL && queueType) ? Base.QUEUE_SKILL[queueType] : null;
    let rxp = null;
    if (Data) {
      if (queueType === "smelt") {
        // 精炼对回 1 代：配方自带 xp（= 1 代 SMELTING_RECIPES.baseXP 真值），逐批定值，不再用 XP_RATE.refine×dur×0.5 占位。
        const r = (Data.Recipes && Data.Recipes.SMELT) ? Data.Recipes.SMELT.find(x => x.id === it.recipeId) : null;
        rxp = r ? r.xp : null;
      } else if (queueType === "manufacture") {
        const r = Data.Recipes.COMPONENT.find(x => x.id === it.recipeId); rxp = r ? r.xp : null;
      } else if (queueType === "equip") {
        const r = (Data.Equipment && Data.Equipment.byId) ? Data.Equipment.byId(it.recipeId) : null; rxp = r ? r.xp : null;
      } else if (queueType === "build" || queueType === "ship") {
        const r = (Data.Ships && Data.Ships.shipById) ? Data.Ships.shipById(it.shipId) : null; rxp = r ? r.xp : null;
      } else if (queueType === "booster") {
        // 增强剂制造 → 科研：配方 xp 已是 1 代正本真值（BOOSTER_RECIPES，booster.js:5「1 代正本，不动」），
        // 与制造/装备同口径「逐配方定值」，不再用 XP_RATE.research×dur×0.5 占位公式。
        const BR = (typeof window !== "undefined" && window.BOOSTER_RECIPES) ? window.BOOSTER_RECIPES : null;
        const r = BR ? BR.find(x => x.id === it.recipeId) : null; rxp = r ? r.xp : null;
      } else if (queueType === "invent") {
        // 发明舱两路（2026-11-08 定稿）：
        //  ① 蓝图效率研究 → 1 代 xpForBlueprint = ceil(0.4×1.1^E)，逐循环定值；
        //  ② inv_bp 图纸合成 → 配方显式 xp:12（原占位回退 0.6×40×0.5 转正，手感不变）。
        const I = (typeof window !== "undefined" && window.NSK && window.NSK.Engine)
          ? window.NSK.Engine.Invention : null;
        if (it && it.outType === "study") {
          const bp = I && I.blueprintByKey(it.studyKey);
          rxp = bp ? I.xpForBlueprint(bp) : null;
        } else {
          const r = (Data.Recipes && Data.Recipes.INVENT)
            ? Data.Recipes.INVENT.find(x => x.id === (it && it.recipeId)) : null;
          rxp = r ? r.xp : null;
        }
      }
    }
    // 兼容兜底：四路科研经验 + 精炼/制造/装备/整船均已逐配方显式配 xp，
    // 正常路径**永不走这里**；保留仅为旧档异形队列项不会直接拿 0 经验。
    if (rxp == null) {
      const rate = (skill && XP_RATE[skill]) ? XP_RATE[skill] : 0.7;
      return rate * (it.dur || 0) * BATCH_XP_RATIO;
    }
    return rxp;
  }

  return {
    settle, moveBase, levelOf, skillBonus, xpForLevel, XP_RATE, FUEL_REGEN, BASE_MINE, LV_THRESHOLD, MAX_OFFLINE_SECONDS,
    passionMult, xpMultOf, enqueuePending, MAX_PENDING_EVENTS, grantBatchXp, recipeBatchXp, BATCH_XP_RATIO,
    MINING_XP_RATE, GAS_XP_RATE, miningXpRate,
    ARCH_XP_BY_BAND, archXpForBand,
    COMBAT_VOLLEY_XP, COMBAT_DEF_XP, COMBAT_INTENSITY_BY_BAND, combatIntensity,
    fuelEfficiencyMult, archaeologyFuelCost,
  };
});
