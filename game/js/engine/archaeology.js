// ================================================================
// 深空星疆 —— Engine.Archaeology：残骸场考古结算（§13 扩展，§14 接舰船装配）
// 机制复刻 1 代（EVE-IDLE）扫描强度模型；纯函数 + 确定性 RNG（state.archCounter + state.rngSeed），
// 存档重载可复现。全部中文解耦（IP 铁律）。
//
// 成功率 = clamp(0.50 + (扫描强度 − 难度) × 0.01, 0.05, 0.95)
//   扫描强度 = 考古技能等级 + 舰船扫描×强化倍率 + 装配 archaeologyScan
// 周期缩短 = 装配 archaeologyCycleReduction（封顶 0.50）
// 稀有掉率 = 装配 archaeologyDecoder（1 代通用键）
// 反噬：失败按档位比例扣成员三防船体（shield→armor→structure），受稳定器减免；
//   非致命免伤（archaeologyNonFatalAvoid）概率完全规避；扣空置 destroyed。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.Archaeology = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.Archaeology = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const Data = (typeof window !== "undefined" ? window.NSK.Data : null);
  const Core = (typeof window !== "undefined" ? window.NSK.Core : null);
  const Settle = (typeof window !== "undefined" ? window.NSK.Engine ? window.NSK.Engine.Settle : null : null);
  const ShipEnh = (typeof window !== "undefined" && window.NSK.Engine) ? window.NSK.Engine.ShipEnhancement : null;

  // 考古评分：等级 + 热忱加成（major +0.6 / minor +0.2 等效等级）
  function skillScore(m) {
    const lvl = Settle ? Settle.levelOf(m.skills.archaeology || 0) : Math.floor((m.skills.archaeology || 0) / 1000);
    const p = m && m.passion && m.passion.archaeology;
    const bonus = p === "major" ? 0.6 : p === "minor" ? 0.2 : 0;
    return lvl + bonus;
  }

  // 聚合成员装配的全部装备加成（按 bonus 键求和）。返回 { archaeologyScan, archaeologyStabilizer, ... }
  function fittedBonuses(m) {
    const out = {};
    if (!m || !m.fitted) return out;
    const Eq = (typeof window !== "undefined" && window.NSK.Data) ? window.NSK.Data.Equipment : null;
    for (const slot of ["high", "mid", "low", "rig"]) {
      const arr = m.fitted[slot] || [];
      for (const id of arr) {
        const eq = Eq ? Eq.byId(id) : null;
        if (!eq || !eq.bonuses) continue;
        for (const k in eq.bonuses) out[k] = (out[k] || 0) + eq.bonuses[k];
      }
    }
    return out;
  }

  // 扫描强度（成功率分子）：技能 + 舰船扫描×强化倍率 + 装配扫描
  function scanStrength(m, preFit) {
    const score = skillScore(m);
    let shipScan = 0, shipMul = 1;
    if (m && m.shipId) {
      const shipCfg = Data && Data.Ships ? Data.Ships.shipById(m.shipId) : null;
      shipScan = (shipCfg && (shipCfg.archaeologyScanStrength || (shipCfg.bonuses && shipCfg.bonuses.archaeologyScanStrength))) || 0;
      if (ShipEnh) {
        const enh = ShipEnh.getBonuses(m.shipId, m.enhancementLevel || 0);
        shipMul = (enh && enh.archaeologyScanMultiplier) || 1;
      }
    }
    const fit = preFit || fittedBonuses(m);
    return score + shipScan * shipMul + (fit.archaeologyScan || 0);
  }

  // 周期缩短（装配 analyzer 的 archaeologyCycleReduction，封顶 0.50）
  function cycleReduction(m) {
    const fit = fittedBonuses(m);
    return Math.min(0.50, fit.archaeologyCycleReduction || 0);
  }

  // 单次遗址周期成功率（0–1）。difficulty = 遗址难度(band) + 焦点修正
  function successChance(m, body, focusId, preFit) {
    const profile = Data.Archaeology.profileById(focusId);
    const band = body.band || 1;
    const difficulty = Data.Archaeology.difficultyFor(band) + (profile.difficultyMod || 0);
    const ss = scanStrength(m, preFit);
    return Math.max(0.05, Math.min(0.95, 0.50 + (ss - difficulty) * 0.01));
  }

  // 对成员三防船体施加比例伤害（shield→armor→structure 顺序）。返回是否阵亡。
  function applyHullDamage(m, frac) {
    const maxHp = Data.Ships.maxHp(m.shipId);
    const total = maxHp.shield + maxHp.armor + maxHp.structure;
    let dmg = Math.max(0, frac) * total;
    const order = ["shield", "armor", "structure"];
    for (const key of order) {
      if (dmg <= 0) break;
      const take = Math.min(m.hp[key], dmg);
      m.hp[key] -= take;
      dmg -= take;
    }
    if (m.hp.structure <= 0) {
      m.hp.structure = 0;
      m.destroyed = true;
      m.assignment = null;
      m.status = "idle";
      return true;
    }
    return false;
  }

  // 单次遗址周期结算。确定性 RNG 种子 = rngSeed ^ (0xA21C * archCounter)。
  // preFit：调用方在「成员装配不变」的循环外预计算的 fittedBonuses，避免每周期重复扫装备（离线大批量结算性能）。
  //   成功率仍每周期按当前技能重算（scanStrength 内 skillScore 读 m.skills.archaeology），保证 1 代保真。
  function cycle(state, m, body, focusId, preFit) {
    const profile = Data.Archaeology.profileById(focusId);
    const band = body.band || 1;
    state.archCounter = (state.archCounter || 0) + 1;
    const rng = Core.makeRng((state.rngSeed ^ Math.imul(0xA21C, state.archCounter)) >>> 0);
    const p = successChance(m, body, focusId, preFit);
    const success = m.destroyed ? false : rng() < p;
    const drops = { credits: 0, bp: 0, rep: 0 };
    const hullDamage = { frac: 0, avoided: false };
    let destroyed = false;
    const lines = [];
    if (success) {
      drops.credits = profile.credits(band);
      // 装配加成（Phase 2）：打捞焦点吃 salvageEfficiency（1 代 11 条打捞装备）。
      // 只在 salvage 焦点生效——research/cache 是遗址解析与货柜窃取，不吃打捞效率。
      if (focusId === "salvage") {
        const fitS = preFit || fittedBonuses(m);
        drops.credits = Math.round(drops.credits * (1 + (fitS.salvageEfficiency || 0)));
      }
      if (profile.bpChance > 0 && rng() < profile.bpChance) drops.bp += profile.bp(band);
      if (profile.repChance > 0 && rng() < profile.repChance) drops.rep += profile.rep(band);
      lines.push(m.name + " 在「" + body.name + "」完成「" + profile.name + "」遗址解析，获得 " + drops.credits + "⛁");
      if (drops.bp) lines.push("并寻获 " + drops.bp + " 份改装图纸（📐）。");
      if (drops.rep) lines.push("因英勇探勘获 " + drops.rep + " 功勋。");
    } else if (!m.destroyed) {
      // 反噬：先判非致命免伤，再判稳定器减免后的船体损伤
      const fit = preFit || fittedBonuses(m);
      const avoidChance = Math.min(0.90, fit.archaeologyNonFatalAvoid || 0);
      if (avoidChance > 0 && rng() < avoidChance) {
        hullDamage.avoided = true;
        lines.push(m.name + " 在「" + body.name + "」的「" + profile.name + "」触发反噬，舰载稳定系统险险规避了船体损伤。");
      } else {
        const stabRed = Math.min(0.80, fit.archaeologyStabilizer || 0);
        const frac = profile.hullDamageFrac(band) * (1 - stabRed);
        hullDamage.frac = frac;
        destroyed = applyHullDamage(m, frac);
        if (destroyed) {
          lines.push(m.name + " 在「" + body.name + "」的「" + profile.name + "」遇险，舰体结构崩解，成员阵亡。");
        } else {
          lines.push(m.name + " 在「" + body.name + "」的「" + profile.name + "」遇险，舰体受损（" + Math.round(frac * 100) + "%）。");
        }
      }
    }
    return { success: success, profileId: profile.id, drops: drops, hullDamage: hullDamage, destroyed: destroyed, lines: lines };
  }

  return {
    skillScore, fittedBonuses, scanStrength, cycleReduction, successChance, applyHullDamage, cycle,
  };
});
