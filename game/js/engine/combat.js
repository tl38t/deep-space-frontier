// ================================================================
// 深空星疆 —— Engine.Combat：战斗（MVP 最小占位）
// 成员派 combat 时由 settle 直接累加声望/战利品（连续速率，见 settle.js）。
// 本文件预留军团小队战斗力估算与未来离散战斗结算接口。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Combat = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Combat = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 军团小队战斗力（占位：= 在战成员 三武器技能等级之和，未来接舰船/装备）
  function squadPower(state) {
    const Settle = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null;
    let p = 0;
    for (const m of state.members) {
      if (m.status === "dispatched" && m.assignment && m.assignment.type === "combat" && !m.destroyed) {
        // 三武器技能（激光/炮台/指挥）等级求和，复用 EVE-IDLE 玩家等级（无上限）
        p += Settle ? (Settle.levelOf(m.skills.combatLaser) + Settle.levelOf(m.skills.combatTurret) + Settle.levelOf(m.skills.command)) : 3;
      }
    }
    return p;
  }

  // 指定星系的当前剿匪战力（= 在该节点 combat 的成员三武器等级之和）。O(1) 单次调用。
  function squadPowerAtNode(state, nodeId) {
    const Settle = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null;
    let p = 0;
    for (const m of state.members) {
      if (m.status === "dispatched" && m.assignment && m.assignment.type === "combat" && m.assignment.nodeId === nodeId && !m.destroyed) {
        p += Settle ? (Settle.levelOf(m.skills.combatLaser) + Settle.levelOf(m.skills.combatTurret) + Settle.levelOf(m.skills.command)) : 3;
      }
    }
    return p;
  }

  // 小队容量（复用 EVE-IDLE 研究门禁：1→2→3 人，由 base.squadTier 升级解锁）
  function getSquadCapacity(state) {
    return 1 + (state && state.base && typeof state.base.squadTier === "number" ? state.base.squadTier : 0);
  }

  // 参战资格判定（稳定 reason，不抛异常；复用 EVE-IDLE canLegionNpcJoinCombat 约定）
  function canJoinSquad(state, memberId) {
    if (!state || !state.squad) return { ok: false, reason: "no-squad" };
    const m = (state.members || []).find(x => x.id === memberId);
    if (!m) return { ok: false, reason: "not-found" };
    if (m.destroyed) return { ok: false, reason: "destroyed" };
    if (state.squad.members.includes(memberId)) return { ok: false, reason: "already-in-squad" };
    const cap = getSquadCapacity(state);
    if (state.squad.members.length >= cap) return { ok: false, reason: "squad-full" };
    if (m.status !== "idle") return { ok: false, reason: "busy" };
    return { ok: true, member: m };
  }

  // 离散战斗结算钩子（MVP 未启用）。
  // 铁律（2026-10-31 修订，取代旧「禁止逐波仿真」表述）：
  //   禁止「随离线时长线性增长」的战斗结算成本（§14.5 红线不破）；
  //   战斗以「波」为时间单位，一波 = 一支敌方编队；一波时长由敌我强度算出（非常量），
  //   总数 = 每秒速率 × dt，一次乘法（O(1)）；「在线逐波」= UI 按波刷新编队血条，不逐帧仿真。
  function resolveSquad(state, enemyPower) {
    return { win: squadPower(state) >= enemyPower, power: squadPower(state) };
  }

  // ================================================================
  // 齐射战斗模型（一波 = 一支敌方编队）
  // ----------------------------------------------------------------
  // 经济锚点：每秒速率沿用旧连续速率公式（各乘区一字不改），
  //   每波总掉落 = 基础值 × 星系倍率 × 参战人数，
  //   一波时长   = 每波掉落 ÷ 每秒速率  ⇔  编队总血 ÷ 我方每秒伤害（两式恒等）。
  // 恒等推导（未触发 clamp 时）：
  //   每波掉落/速率 = (6·iskMult·N) / (0.3·iskMult·eff·skillSum) = 20P/(sp·skillAvg)
  //   编队总血/DPS  = (P·60) / (sp·skillAvg·3)                    = 20P/(sp·skillAvg)
  //   ⇒ 波时长两路推导完全一致；引入编队/血条/受击后每秒收益仍与改造前精确等价（经济零漂移）。
  // 性能：prepareNode 预聚合（O(成员) 一次）+ advance 一次乘法；成本与离线时长无关（§14.5 红线不破）。
  // 焦点战场只影响 UI 是否按波绘制编队血条，不影响结算数学。
  // ================================================================
  const DROP_CREDIT_BASE = 6;   // 每波每舰基础星币掉落（标定锚点，与 Pirates.HP_PER_POWER 联动）
  const DROP_REP_BASE = 1;      // 每波每舰基础声望掉落
  const WAVE_MIN_SEC = 2;       // 一波最短时长（敌舰进场/刷新上限：清得再快也没有下一队）
  const WAVE_MAX_SEC = 60;      // 一波最长时长（打不动时的磨血上限）
  const SQUAD_DPS_K = 3;        // 我方每秒伤害 = 三武器等级和 × 平均技能加成 × 该系数

  function _Data() { return (typeof window !== "undefined" && window.NSK) ? window.NSK.Data : null; }
  function _Settle() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null; }
  function _Mastery() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Mastery : null; }

  function _Pirates() {
    const D = _Data();
    return (D && D.Pirates) ? D.Pirates : null;
  }

  // 由「总剩余血量」反推三防分布（编队血条快照用）。
  // 填充顺序 structure→armor→shield：挨打顺序是 shield→armor→structure，
  // 所以剩余血量少时应当只剩结构（护盾、装甲先被打空），血条观感才正确。
  function drainHp(maxHp, remainTotal) {
    let r = Math.max(0, remainTotal || 0);
    const out = {};
    for (const k of ["structure", "armor", "shield"]) {
      const keep = Math.min(maxHp[k] || 0, r);
      out[k] = keep;
      r -= keep;
    }
    return out;
  }

  // 预聚合某节点战斗参数（O(成员) 一次）。无参战成员返回 null。
  // 每秒速率与旧 settle 连续速率逐项一致（skill / iskMult·repMult / eff / underCL / mastery）；
  // 一波时长 = 每波掉落 ÷ 每秒速率，故随敌我强度自然变化（不再有硬编码的固定波长）。
  function prepareNode(state, nodeId) {
    const Data = _Data(), Settle = _Settle(), M = _Mastery(), Pirates = _Pirates();
    if (!Data || !Settle) return null;
    const raid = Data.StarMap.pirateRaid(state.starMap, nodeId);
    if (!raid) return null;

    const masteryYield = (M && M.combatYieldMult) ? M.combatYieldMult(state) : 1;
    let sp = 0, cnt = 0, skillSum = 0, skillWeighted = 0;
    const members = [];
    for (const m of state.members) {
      if (m.destroyed || !m.assignment || m.assignment.type !== "combat" || m.assignment.nodeId !== nodeId) continue;
      members.push(m);
      sp += Settle.levelOf(m.skills.combatLaser) + Settle.levelOf(m.skills.combatTurret) + Settle.levelOf(m.skills.command);
      const sk = (Settle.skillBonus(m.skills, "combatLaser") + Settle.skillBonus(m.skills, "combatTurret") + Settle.skillBonus(m.skills, "command")) / 3;
      const modCredit = (m.mods && m.mods.creditMult && m.mods.creditMult.combat) || 1;
      skillSum += sk;
      skillWeighted += sk * modCredit;
      cnt++;
    }
    if (!cnt) return null;

    const avgCL = sp / cnt;
    const underCL = (raid.requiredCL && avgCL < raid.requiredCL) ? 0.5 : 1;   // 等级不足惩罚
    const eff = Math.max(0.2, Math.min(2.5, raid.piratePower > 0 ? sp / raid.piratePower : 1));

    // 每秒速率（与改造前连续速率公式逐项一致；声望不吃成员星币倍率）
    const rateRep     = 0.05 * skillSum      * raid.repMult * eff * underCL * masteryYield;
    const rateCredits = 0.30 * skillWeighted * raid.iskMult * eff * underCL * masteryYield;

    // 每波总掉落 + 一波时长（时长 = 掉落 ÷ 速率 ⇒ 随敌我强度变化）
    const dropCredits = DROP_CREDIT_BASE * raid.iskMult * cnt;
    const dropRep     = DROP_REP_BASE    * raid.repMult * cnt;
    const waveRaw = rateCredits > 0 ? (dropCredits / rateCredits) : WAVE_MAX_SEC;
    const waveSec = Math.max(WAVE_MIN_SEC, Math.min(WAVE_MAX_SEC, waveRaw));
    // clamp 后按实际时长重算每秒速率，保证「战报上的一波时长」与「实际入账」严格一致
    const realRateCredits = waveSec > 0 ? (dropCredits / waveSec) : rateCredits;
    const realRateRep     = waveSec > 0 ? (dropRep / waveSec) : rateRep;

    const skillAvg = skillSum / cnt;
    const squadDps = sp * skillAvg * SQUAD_DPS_K * underCL * masteryYield;   // 我方每秒伤害
    const fleet = Pirates ? Pirates.fleetFor(raid.band || 1, raid.faction) : null;
    const fleetDps = fleet ? fleet.dps : 0;                                  // 敌方每秒伤害

    return {
      nodeId: nodeId,
      members: members,
      cnt: cnt,
      squadPower: sp,
      enemyPower: raid.piratePower,
      clearRatio: eff,
      underCL: underCL,
      masteryYield: masteryYield,
      rateCredits: rateCredits,           // 未 clamp 的原始每秒速率（对标旧公式）
      rateRep: rateRep,
      realRateCredits: realRateCredits,   // clamp 后实际入账速率
      realRateRep: realRateRep,
      dropCredits: dropCredits,           // 每波总掉落
      dropRep: dropRep,
      waveSec: waveSec,                   // 一波时长（秒）—— 由敌我强度算出，非常量
      squadDps: squadDps,
      fleetDps: fleetDps,
      fleet: fleet,                       // 敌方编队模板（含每艘命名与三防）
      band: raid.band || 1,
    };
  }

  // 结算某节点 dtSec 秒的战斗。carrySec = 上次未满一波的余量（秒）。
  // 返回 { waves, credits, rep, carry, damage, fightSec, wiped, waveSec, progress, fleet, ... }。
  // 一次乘法出结果（O(1)、零循环、零分配），成本与离线时长无关（§14.5）。
  // 受击封顶（关键）：成员血池打空即撤离，故实际战斗时长 = min(dt, 血池 ÷ 敌方DPS)。
  //   否则离线 8 小时会凭空承受 8 小时的伤害，既失真又会把「离线收益」算歪。
  function advance(state, nodeId, dtSec, carrySec) {
    const P = prepareNode(state, nodeId);
    const dt = Math.max(0, dtSec || 0);
    if (!P) {
      return { waves: 0, credits: 0, rep: 0, carry: Math.max(0, carrySec || 0) + dt, damage: 0, fightSec: 0, wiped: false, waveSec: 0, progress: 0, fleet: null, squadPower: 0, enemyPower: 0, clearRatio: 0, squadDps: 0, fleetDps: 0 };
    }
    // 血池：参战成员当前剩余三防总和
    let pool = 0;
    for (const m of P.members) pool += Math.max(0, (m.hp && m.hp.shield) || 0) + Math.max(0, (m.hp && m.hp.armor) || 0) + Math.max(0, (m.hp && m.hp.structure) || 0);
    const maxFightSec = P.fleetDps > 0 ? (pool / P.fleetDps) : dt;
    const fightSec = Math.min(dt, maxFightSec);
    const wiped = fightSec < dt - 1e-9;   // 本轮被打空 → 剩余时间不再产出

    const c = Math.max(0, carrySec || 0) + fightSec;
    const waves = Math.floor(c / P.waveSec);
    const carry = c - waves * P.waveSec;
    const credits = P.dropCredits * waves;
    const rep = P.dropRep * waves;
    const damage = P.fleetDps * fightSec;
    const progress = P.waveSec > 0 ? Math.max(0, Math.min(1, 1 - carry / P.waveSec)) : 1;
    return {
      waves: waves, credits: credits, rep: rep, carry: carry, damage: damage,
      fightSec: fightSec, wiped: wiped,
      waveSec: P.waveSec, progress: progress, fleet: P.fleet,
      squadPower: P.squadPower, enemyPower: P.enemyPower, clearRatio: P.clearRatio,
      squadDps: P.squadDps, fleetDps: P.fleetDps,
    };
  }

  // 编队血条快照（UI 用）：按本波进度 progress(0~1) 计算每艘敌舰剩余三防。
  // 纯读、零副作用、O(艘数)=3；只在 UI 需要绘制时调用，不进结算热路径。
  function fleetSnapshot(fleet, progress) {
    if (!fleet || !fleet.ships) return null;
    const p = Math.max(0, Math.min(1, progress || 0));
    let done = fleet.totalHp * p;
    let targetIdx = -1;
    const ships = fleet.ships.map(function (s, i) {
      const take = Math.min(s.total, done);
      done -= take;
      const remain = s.total - take;
      if (targetIdx < 0 && remain > 0) targetIdx = i;
      return {
        id: s.id, name: s.name, kind: s.kind, kindCn: s.kindCn,
        maxHp: s.maxHp, total: s.total,
        hp: drainHp(s.maxHp, remain),
        cleared: remain <= 0,
      };
    });
    let cleared = 0;
    for (const s of ships) if (s.cleared) cleared++;
    return { title: fleet.title, factionName: fleet.factionName, band: fleet.band, totalHp: fleet.totalHp, dps: fleet.dps, ships: ships, targetIdx: targetIdx, cleared: cleared, progress: p };
  }

  return {
    squadPower, squadPowerAtNode, getSquadCapacity, canJoinSquad, resolveSquad,
    DROP_CREDIT_BASE, DROP_REP_BASE, WAVE_MIN_SEC, WAVE_MAX_SEC, SQUAD_DPS_K,
    prepareNode, advance, fleetSnapshot,
  };
});
