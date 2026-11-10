// ================================================================
// 深空星疆 —— Engine.Repair：舰基自动修复（§14 舰船装配·反噬修复回路）
// 设计：成员回舰基（idle）且三防未满即进入修复；舰基船坞限制并发维修数，超出排队。
// 修复时长基准 180s（驱逐级 3min），按舰级放大；修复按 shield→armor→structure 顺序回满。
// 阵亡（destroyed）成员不可修复（永久损失），与"自动回舰基修复"选项一致。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {}
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Repair = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Repair = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Data = (typeof window !== "undefined" ? window.NSK.Data : null);

  const REPAIR_TIME_BASE = 180; // 驱逐级基准 180s（3min）

  // 各舰级修复时长倍率：按舰种层级(classTier 1-4)派生，覆盖全部具名舰
  // （原按 7 个抽象 id 字面量查表，替换 44 舰后失效）。映射：
  //   T1(护卫/驱逐)=1.0 / T2(巡洋)=1.5 / T3(战列/旗舰)=3.0 / T4(超级旗舰)=5.0
  //   注：原战列2.5/旗舰3.5 在 4 级 classTier 下合并为 T3=3.0，属待标定微调。
  function classMultOf(shipId) {
    const s = (Data && Data.Ships) ? Data.Ships.shipById(shipId) : null;
    const ct = s ? s.classTier : 1;
    return ({ 1: 1.0, 2: 1.5, 3: 3.0, 4: 5.0, 5: 8.0 })[ct] || 1.0;
  }

  // 修复时长。第二参 state 用于「泊位驻舱」加速（2026-11-01 技能体系）：
  // 维修是工程活，取驻泊位者的 manufacture 技能；**只缩短时长，不动 repairBays**
  // —— 并发格数已由 bodyLevel 产出（repairBays），再给一份就是双源。
  function repairDuration(shipId, state) {
    const m = classMultOf(shipId);
    const base = REPAIR_TIME_BASE * m;
    const E = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine : null;
    const B = E ? E.Base : null;
    const w = (state && B && B.stationedOfType) ? B.stationedOfType(state, "dock") : null;
    if (!w) return base;
    const lv = B.memberSkillLv ? B.memberSkillLv(w, "manufacture") : 1;
    return base / (1 + lv * 0.02);
  }

  // 舰基船坞并发维修格数（随本体等级提升；Lv1→2 格，每级 +1）
  function repairBays(state) {
    const bl = (state && state.base && typeof state.base.bodyLevel === "number") ? state.base.bodyLevel : 0;
    return Math.max(2, bl + 2);
  }

  // 成员是否需修复（在港 idle + 三防未满 + 未阵亡）
  function needsRepair(m) {
    if (!m || m.destroyed) return false;
    if (m.status === "dispatched" || m.status === "traveling") return false;
    const max = Data.Ships.maxHp(m.shipId, m.enhancementLevel);
    return m.hp.shield < max.shield || m.hp.armor < max.armor || m.hp.structure < max.structure;
  }

  // 当前三防已损比例（0–1），用于排队优先级（越残越优先）
  function damageRatio(m) {
    const max = Data.Ships.maxHp(m.shipId, m.enhancementLevel);
    const total = max.shield + max.armor + max.structure;
    const lost = (max.shield - m.hp.shield) + (max.armor - m.hp.armor) + (max.structure - m.hp.structure);
    return total > 0 ? lost / total : 0;
  }

  // 预估剩余修复秒数（基于已损总量 / 修复速率）。state 用于泊位加速，四处调用必须一起传。
  function repairETA(m, state) {
    if (!needsRepair(m)) return 0;
    const max = Data.Ships.maxHp(m.shipId, m.enhancementLevel);
    const totalMax = max.shield + max.armor + max.structure;
    const lost = (max.shield - m.hp.shield) + (max.armor - m.hp.armor) + (max.structure - m.hp.structure);
    return repairDuration(m.shipId, state) * (lost / totalMax);
  }

  // 每 tick 推进修复（settle 调用）。O(members)，幂等。
  function tick(state, dt) {
    const bays = repairBays(state);
    // 1) 正在修复的成员继续回血（按 shield→armor→structure 顺序）
    let active = 0;
    for (const m of state.members) {
      if (m.status !== "repairing" || m.destroyed) continue;
      active++;
      const max = Data.Ships.maxHp(m.shipId, m.enhancementLevel);
      const rate = totalMaxHp(m) / repairDuration(m.shipId, state); // 每秒回血量（按总三防均摊）
      let heal = rate * dt;
      for (const key of ["shield", "armor", "structure"]) {
        if (heal <= 0) break;
        const gap = max[key] - m.hp[key];
        const add = Math.min(gap, heal);
        m.hp[key] += add;
        heal -= add;
      }
      if (m.hp.shield >= max.shield && m.hp.armor >= max.armor && m.hp.structure >= max.structure) {
        m.hp.shield = max.shield; m.hp.armor = max.armor; m.hp.structure = max.structure;
        m.status = (m.assignment && m.assignment.type === "station") ? "stationed" : "idle"; // 驻舱的人修好回 stationed，不能变 idle
      }
    }
    // 2) 空出格位后，从排队/待命的受损成员中按残损度优先补位
    const free = bays - active;
    if (free > 0) {
      const waiting = state.members
        .filter(m => needsRepair(m) && m.status !== "repairing")
        .sort((a, b) => damageRatio(b) - damageRatio(a))
        .slice(0, free);
      for (const m of waiting) m.status = "repairing";
    }
  }

  function totalMaxHp(m) {
    const max = Data.Ships.maxHp(m.shipId, m.enhancementLevel);
    return max.shield + max.armor + max.structure;
  }

  // UI 辅助：舰基修复坞总览（泊位占用 + 在修/排队列表 + 每舰 ETA）。模型 C：保留并发泊位队列，同时每舰显示独立倒计时。
  function repairInfo(state) {
    const bays = repairBays(state);
    const repairing = [];
    const waiting = [];
    for (const m of (state.members || [])) {
      if (m.status === "repairing") {
        repairing.push({ id: m.id, name: m.name, shipId: m.shipId, ratio: damageRatio(m), eta: repairETA(m, state) });
      } else if (needsRepair(m)) {
        waiting.push({ id: m.id, name: m.name, shipId: m.shipId, ratio: damageRatio(m), eta: repairETA(m, state) });
      }
    }
    waiting.sort((a, b) => b.ratio - a.ratio); // 与 tick 补位一致：越残越优先
    // 排队舰的「预计开始修复」= 前面所有在修剩余 + 排在自己前面的待修完整时长
    let acc = repairing.reduce((s, e) => s + e.eta, 0);
    for (const e of waiting) { e.startEta = acc; acc += repairDuration(e.shipId, state); }
    return { bays: bays, used: repairing.length, repairing: repairing, waiting: waiting };
  }

  return {
    REPAIR_TIME_BASE, repairDuration, repairBays, needsRepair, damageRatio, repairETA, tick, repairInfo,
  };
});
