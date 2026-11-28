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

  // ★ S4 科技乘区访问器（全走 Tech.bonusSum 的「每级增量×等级」口径）
  function _techSum(state, key) {
    const T = (window.NSK && window.NSK.Engine) ? window.NSK.Engine.Tech : null;
    return (T && T.bonusSum) ? T.bonusSum(state, key) : 0;
  }
  // 1 代 getArchaeologyCycleSeconds：researchMult = 1 + Σ archEff（arch 与 deeparch 同组相加）
  function archResearchMult(state) { return 1 + _techSum(state, "archEff"); }
  function successBonus(state) { return _techSum(state, "archSuccess"); }   // pp，小数（0.006/级）
  function backlashReduction(state) { return Math.min(0.95, _techSum(state, "backlash")); }
  function archExpMult(state) { return 1 + _techSum(state, "archExp"); }

  // 单次遗址周期成功率（0–1）。difficulty = 遗址难度(band) + 焦点修正
  function successChance(m, body, focusId, preFit, state) {
    const profile = Data.Archaeology.profileById(focusId);
    const band = body.band || 1;
    const difficulty = Data.Archaeology.difficultyFor(band) + (profile.difficultyMod || 0);
    const ss = scanStrength(m, preFit);
    const pp = state ? successBonus(state) : 0;
    return Math.max(0.05, Math.min(0.95, 0.50 + (ss - difficulty) * 0.01 + pp));
  }

  // 对成员三防船体施加比例伤害（shield→armor→structure 顺序）。返回是否阵亡。
  function applyHullDamage(m, frac) {
    // 用含防御技能容量的上限算总血池：frac 是「满血的比例」，取错上限会让实际扣血比例失真。
    const maxHp = Data.Ships.maxHpOf(m);
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

  // ================================================================
  // ★ 2026-11-27 考古复刻 S3：探针 / 文物 / 货柜 / 稀有发现 / 协议
  //   真值：1 代 systems/archaeology.js + data/archaeology.js（逐值见 data/archaeology-content.js）
  //   所有掉落走确定性 RNG（state.archCounter 派生），在线逐 tick / 离线一次同核
  // ================================================================
  function _AC() { return (Data && Data.ArchaeologyContent) ? Data.ArchaeologyContent : null; }
  function _Cargo() { return (window.NSK && window.NSK.Engine) ? window.NSK.Engine.Cargo : null; }
  function ensureArch(state) {
    if (!state.archaeology || typeof state.archaeology !== "object") state.archaeology = {};
    const A = state.archaeology;
    if (!A.probes || typeof A.probes !== "object") A.probes = {};
    if (!A.artifacts || typeof A.artifacts !== "object") A.artifacts = {};
    if (!A.vouchers || typeof A.vouchers !== "object") A.vouchers = {};
    if (!A.protocols || typeof A.protocols !== "object") A.protocols = { autosell: false, autoconv: false };
    return A;
  }

  // 探针成本：确定性小数节省累计器（1 代 getArchaeologyProbeCostState 同式）。
  // reduction 来自 Tech.bonusSum(state,"probe")，上限 0.95；每周期攒 reduction 支，
  // 攒满 1 支免扣 1 支，余数存档，无随机、防 save-scumming。
  function probeCostState(state) {
    const AC = _AC();
    const Tech = (window.NSK && window.NSK.Engine) ? window.NSK.Engine.Tech : null;
    const raw = (Tech && Tech.bonusSum) ? Tech.bonusSum(state, "probe") : 0;
    const reduction = Math.max(0, Math.min(0.95, Number(raw) || 0));
    const A = ensureArch(state);
    const prev = Number(A.probeSavingRemainder);
    const previousRemainder = (isFinite(prev) && prev > 0) ? (prev - Math.floor(prev)) : 0;
    const balance = previousRemainder + reduction;              // baseProbe = 1
    let saved = Math.floor(balance + 1e-9);
    saved = Math.max(0, Math.min(1, saved));
    const charged = Math.max(0, 1 - saved);
    let remainder = balance - saved;
    if (!isFinite(remainder) || remainder < 0) remainder = 0;
    remainder -= Math.floor(remainder);
    return { charged: charged, remainder: remainder, reduction: reduction };
  }

  // 当前选择探针：未选 / 非法 / 缺货 → 依次回退到「库存里 scanBonus 最高且够级」的探针，
  // 全无 → null（停摆）。旧档零库存即 null（用户拍板：照搬停摆）。
  function selectedProbeOf(state) {
    const AC = _AC();
    if (!AC) return null;
    const A = ensureArch(state);
    const want = A.selectedProbe || AC.DEFAULT_PROBE;
    const p = AC.probeById(want);
    if (p && (A.probes[want] || 0) >= 1) return p;
    // 回退：库存中按 scanBonus 降序（同级比 cycleReduction）
    let best = null;
    for (const id in A.probes) {
      if (!(A.probes[id] >= 1)) continue;
      const q = AC.probeById(id);
      if (!q) continue;
      if (!best || (q.scanBonus || 0) > (best.scanBonus || 0)
        || ((q.scanBonus || 0) === (best.scanBonus || 0) && (q.cycleReduction || 0) > (best.cycleReduction || 0))) best = q;
    }
    return best;
  }

  // 扣探针（含节省累计器）。返回 {ok, probeId, probe, consumed}。
  // ⚠️ 必须在 cycle 成功判定**之前**调用：1 代缺货是「本周期不推进」，不是「推进但不掉」。
  function chargeProbe(state) {
    const A = ensureArch(state);
    const cost = probeCostState(state);
    A.probeSavingRemainder = cost.remainder;
    if (cost.charged < 0.5) return { ok: true, probeId: null, consumed: false, probe: null };
    const p = selectedProbeOf(state);
    if (!p) return { ok: false, probeId: null, consumed: false, probe: null };
    A.probes[p.id] = (A.probes[p.id] || 1) - 1;
    if (A.probes[p.id] <= 0) delete A.probes[p.id];
    return { ok: true, probeId: p.id, probe: p, consumed: true };
  }

  // 加权抽取（1 代 weightedPick 同式：权重非负、总和 >0）
  function weightedPick(list, rng) {
    let total = 0;
    for (const it of list) total += Math.max(0, Number(it.weight) || 0);
    if (!(total > 0)) return null;
    let r = rng() * total;
    for (const it of list) {
      r -= Math.max(0, Number(it.weight) || 0);
      if (r < 0) return it;
    }
    return list[list.length - 1];
  }

  // 焦点常规收益（1 代 resolveArchaeologyRegularYield 同式）：
  //   coin → 按 profile.commonWeights 抽 1 件普通文物
  //   merit → 该档 lp 文物 1 件
  //   cargo → 按地点 cargoWeights 抽尺寸，发 special:货柜X（走 Cargo ID_MAP → cargo_X）
  function resolveRegularYield(state, band, focusId, loc, fit, rng) {
    const AC = _AC();
    if (!AC) return { chosen: "", found: [] };
    const weights = AC.FOCUS_WEIGHTS[focusId] || AC.FOCUS_WEIGHTS.salvage;
    const roll = rng();
    let chosen = "cargo";
    if (roll < weights.coin) chosen = "coin";
    else if (roll < weights.coin + weights.merit) chosen = "merit";
    const found = [];
    const tier = AC.tierOfBand(band);
    const arts = AC.artifactsOfTier(tier);
    if (chosen === "coin") {
      const commons = arts.filter(a => a.category === "common_isk");
      const cw = AC.profileOf(focusId).commonWeights || [0.45, 0.35, 0.20];
      const idx = weightedPick(commons.map((a, i) => ({ a: a, weight: cw[i] || 0 })), rng);
      if (idx) {
        const A = ensureArch(state);
        A.artifacts[idx.a.id] = (A.artifacts[idx.a.id] || 0) + 1;
        found.push({ kind: "artifact", id: idx.a.id, name: idx.a.name, category: "common_isk" });
      }
    } else if (chosen === "merit") {
      const lp = arts.find(a => a.category === "lp");
      if (lp) {
        const A = ensureArch(state);
        A.artifacts[lp.id] = (A.artifacts[lp.id] || 0) + 1;
        found.push({ kind: "artifact", id: lp.id, name: lp.name, category: "lp" });
      }
    } else {
      const pick = weightedPick(loc.cargoWeights, rng);
      if (pick) {
        const resId = "cargo_" + pick.size;
        state.res[resId] = (state.res[resId] || 0) + 1;
        found.push({ kind: "cargo", id: resId, size: pick.size });
        // 装配 copyChance：额外复制一个（1 代 fitted.copyChance）
        const copy = (fit && fit.archaeologyCopyChance) || 0;
        if (copy > 0 && rng() < copy) {
          state.res[resId] = (state.res[resId] || 0) + 1;
          found.push({ kind: "cargo", id: resId, size: pick.size, copied: true });
        }
      }
    }
    return { chosen: chosen, found: found };
  }

  // 校准材料（1 代 resolveArchaeologyCalibration 同式）：
  // 概率 = tier.calibrationRate × profile.calibrationMultiplier；数量 = tier.calibrationAmount
  function resolveCalibration(state, band, focusId, rng) {
    const AC = _AC();
    if (!AC) return null;
    const tier = AC.tierConfig(band);
    const rate = Math.min(0.99, tier.calibrationRate * AC.profileOf(focusId).calibrationMultiplier);
    if (!(rng() < rate)) return null;
    const art = AC.artifactsOfTier(tier.tier).find(a => a.category === "calibration");
    if (!art) return null;
    const A = ensureArch(state);
    const qty = Math.max(1, Math.round(tier.calibrationAmount));
    A.artifacts[art.id] = (A.artifacts[art.id] || 0) + qty;
    return { kind: "calibration", id: art.id, name: art.name, qty: qty };
  }

  // 稀有发现（1 代 resolveArchaeologyRare 同式）：每次成功最多一次。
  // rate = location.rareRate × decoderMul × rareShift × labMult，封顶 0.99；
  // 本作无脑插/军团/增强剂 rareShift 字段 → 后两者取 1（decoder 走装配）。
  function resolveRare(state, band, loc, fit, rng, tier) {
    const AC = _AC();
    if (!AC || !loc) return null;
    const decoderMul = 1 + ((fit && fit.archaeologyDecoder) || 0);
    const booster = (window.NSK && window.NSK.Engine && window.NSK.Engine.Booster)
      ? window.NSK.Engine.Booster : null;
    const bEff = (booster && booster.getEffectState) ? booster.getEffectState(state) : null;
    const rareShift = (bEff && Number(bEff.rareShiftMultiplier)) ? bEff.rareShiftMultiplier : 1;
    const rate = Math.min(0.99, loc.rareRate * decoderMul * rareShift);
    if (!(rng() < rate)) return null;
    const rw = loc.rareWeights || {};
    const cats = [
      { key: "equipment", weight: rw.blueprint || 0 },
      { key: "booster",   weight: rw.booster || 0 },
      { key: "probe",     weight: rw.probe || 0 },
      { key: "credential",weight: rw.credential || 0 },
    ];
    const picked = weightedPick(cats, rng);
    if (!picked) return null;
    const A = ensureArch(state);
    const owned = state.ownedBlueprints || (state.ownedBlueprints = []);
    const ownedSet = {};
    for (const k of owned) ownedSet[k] = 1;
    function compensate() {
      const c = Number(loc.compensation) || 0;
      state.res.credits = (state.res.credits || 0) + c;
      return { kind: "compensation", credits: c };
    }
    if (picked.key === "equipment" || picked.key === "booster") {
      const pool = (picked.key === "equipment" ? loc.equipmentBlueprints : loc.boosterBlueprints) || [];
      const avail = pool.filter(id => !ownedSet[picked.key === "equipment" ? "equipment:" + id : "booster:" + id]);
      if (!avail.length) return compensate();
      const id = avail[Math.floor(rng() * avail.length) % avail.length];
      owned.push(picked.key === "equipment" ? "equipment:" + id : "booster:" + id);
      return { kind: "blueprint", blueprintType: picked.key, id: id };
    }
    if (picked.key === "probe") {
      const pool = loc.probeBlueprints || [];
      if (!pool.length) return compensate();
      const id = pool[Math.floor(rng() * pool.length) % pool.length];
      if (!AC.probeById(id)) return compensate();
      // 1 代 rollProbeDropQuantity 逐值：I[1,1] / II[2,4] / III[4,8] / IV[2,4] / V[5,10]
      const ranges = { I:[1,1], II:[2,4], III:[4,8], IV:[2,4], V:[5,10] };
      const r = ranges[tier] || [1,1];
      const qty = r[0] + Math.floor(rng() * (r[1] - r[0] + 1));
      A.probes[id] = (A.probes[id] || 0) + qty;
      return { kind: "probe", id: id, qty: qty };
    }
    if (picked.key === "credential") {
      const id = loc.credential;
      if (!id || !AC.VOUCHERS[id] || A.vouchers[id]) return compensate();
      A.vouchers[id] = 1;
      return { kind: "credential", id: id, name: AC.VOUCHERS[id].name };
    }
    return compensate();
  }

  // 文物回收（1 代统一回收入口同式）：
  //   common_isk / unique → credits = iskValue × voucherMult(credits)
  //   lp → rep = lpValue × voucherMult(rep)
  //   calibration 永不自动回收（S7 消费点）
  function voucherMult(state, effect) {
    const AC = _AC();
    if (!AC) return 1;
    const A = ensureArch(state);
    let m = 1;
    for (const id in A.vouchers) {
      const v = AC.VOUCHERS[id];
      if (v && v.effect === effect) m *= 1.10;
    }
    return m;
  }
  function recycleArtifact(state, artId, qty) {
    const AC = _AC();
    if (!AC) return null;
    const art = AC.artifactById(artId);
    const A = ensureArch(state);
    const n = Math.min(A.artifacts[artId] || 0, Math.max(1, Math.floor(qty || 1)));
    if (!art || n <= 0) return null;
    A.artifacts[artId] -= n;
    if (A.artifacts[artId] <= 0) delete A.artifacts[artId];
    if (art.category === "lp") {
      const rep = Math.round((art.lpValue || 0) * n * voucherMult(state, "rep"));
      state.res.rep = (state.res.rep || 0) + rep;
      return { kind: "rep", qty: rep };
    }
    if (art.category === "common_isk" || art.category === "unique") {
      const credits = Math.round((art.iskValue || 0) * n * voucherMult(state, "credits"));
      state.res.credits = (state.res.credits || 0) + credits;
      return { kind: "credits", qty: credits };
    }
    return null;                         // calibration 不回收
  }
  function recycleAll(state, kind) {
    const AC = _AC();
    if (!AC) return { credits: 0, rep: 0, count: 0 };
    const A = ensureArch(state);
    const out = { credits: 0, rep: 0, count: 0 };
    for (const artId in A.artifacts) {
      const art = AC.artifactById(artId);
      if (!art) continue;
      // kind="all" = 手动「一键回收」：星币类 + 功勋信标一次清；calibration 永不回收（S7 消费点）
      const isSell = ((kind === "all" || kind === "autosell") && (art.category === "common_isk" || art.category === "unique"));
      const isConv = ((kind === "all" || kind === "autoconv") && art.category === "lp");
      if (!isSell && !isConv) continue;
      const n = A.artifacts[artId];
      const r = recycleArtifact(state, artId, n);
      if (!r) continue;
      out[r.kind] += r.qty;
      out.count += n;
    }
    return out;
  }

  // 单次遗址周期结算。确定性 RNG 种子 = rngSeed ^ (0xA21C * archCounter)。
  // preFit：调用方在「成员装配不变」的循环外预计算的 fittedBonuses，避免每周期重复扫装备（离线大批量结算性能）。
  //   成功率仍每周期按当前技能重算（scanStrength 内 skillScore 读 m.skills.archaeology），保证 1 代保真。
  function cycle(state, m, body, focusId, preFit) {
    const profile = Data.Archaeology.profileById(focusId);
    const band = body.band || 1;
    const AC = _AC();
    const fit = preFit || fittedBonuses(m);
    const drops = { credits: 0, bp: 0, rep: 0, artifacts: [], cargo: [], rare: null, calibration: null, probe: null };

    // ★ 探针门禁（1 代照搬「缺货停摆」）：先扣探针，扣不到就本周期不推进。
    //   ⚠️ 必须在 state.archCounter++ **之前**返回，否则停摆还会烧 RNG 序号（离线/在线不同步）。
    const charge = chargeProbe(state);
    if (!charge.ok) {
      return {
        success: false, blocked: true, probeBlocked: true,
        profileId: profile.id, drops: drops, hullDamage: { frac: 0, avoided: false },
        destroyed: false, lines: [m.name + " 缺少可用的考古探针，遗址解析停摆（需先在总装船坞制造探针）。"],
      };
    }

    state.archCounter = (state.archCounter || 0) + 1;
    const rng = Core.makeRng((state.rngSeed ^ Math.imul(0xA21C, state.archCounter)) >>> 0);
    const p = successChance(m, body, focusId, fit, state);
    const success = m.destroyed ? false : rng() < p;
    const hullDamage = { frac: 0, avoided: false };
    let destroyed = false;
    const lines = [];
    if (success) {
      // 保留本作原有的星币/图纸/功勋直发（老档经济不倒退）
      drops.credits = profile.credits(band);
      if (focusId === "salvage") drops.credits = Math.round(drops.credits * (1 + (fit.salvageEfficiency || 0)));
      if (profile.bpChance > 0 && rng() < profile.bpChance) drops.bp += profile.bp(band);
      if (profile.repChance > 0 && rng() < profile.repChance) drops.rep += profile.rep(band);
      lines.push(m.name + " 在「" + body.name + "」完成「" + profile.name + "」遗址解析，获得 " + drops.credits + "⛁");
      if (drops.bp) lines.push("并寻获 " + drops.bp + " 份改装图纸（📐）。");
      if (drops.rep) lines.push("因英勇探勘获 " + drops.rep + " 功勋。");

      // ★ S3 新增：地点稀有池（1 代五地点表，band→tier 1:1）
      if (AC) {
        const loc = AC.locationOfBand(band);
        const tier = AC.tierOfBand(band);
        const reg = resolveRegularYield(state, band, focusId, loc, fit, rng);
        drops.artifacts = reg.found.filter(x => x.kind === "artifact");
        drops.cargo = reg.found.filter(x => x.kind === "cargo");
        drops.calibration = resolveCalibration(state, band, focusId, rng);
        drops.rare = resolveRare(state, band, loc, fit, rng, tier);
        drops.probe = charge;

        const artNames = drops.artifacts.map(x => x.name).join("、");
        if (artNames) lines.push("寻获文物：" + artNames + "（入库，可在仓库回收）。");
        for (const c of drops.cargo) lines.push("发现未开启的货柜 " + c.size + "（📦，去仓库开启）。");
        if (drops.calibration) lines.push("取得 " + drops.calibration.name + " ×" + drops.calibration.qty + "（校准基体，待改造件强化使用）。");
        if (drops.rare) {
          if (drops.rare.kind === "blueprint") lines.push("★ 稀有发现：" + (drops.rare.blueprintType === "equipment" ? "装备" : "增强剂") + "蓝图「" + drops.rare.id + "」已登记。");
          else if (drops.rare.kind === "credential") lines.push("★ 稀有发现：唯一凭证「" + drops.rare.name + "」已入库（回收收益 +10%）。");
          else if (drops.rare.kind === "probe") lines.push("★ 稀有发现：探针「" + drops.rare.id + "」×" + drops.rare.qty + " 已入库。");
          else if (drops.rare.kind === "compensation") lines.push("稀有池已空，折为 " + drops.rare.credits + "⛁ 补偿。");
        }
      }

      // ★ 文物自动协议（1 代 §5.1）：每个成功周期后各调用一次
      const A = ensureArch(state);
      if (A.protocols.autosell) {
        const r = recycleAll(state, "autosell");
        if (r.count) { drops.credits += r.credits; lines.push("自动出售 " + r.count + " 件文物，+ " + r.credits + "⛁。"); }
      }
      if (A.protocols.autoconv) {
        const r = recycleAll(state, "autoconv");
        if (r.count) { drops.rep += r.rep; lines.push("自动兑换 " + r.count + " 件信标，+ " + r.rep + " 功勋。"); }
      }
    } else if (!m.destroyed) {
      // 反噬：先判非致命免伤，再判稳定器减免后的船体损伤
      const fit = preFit || fittedBonuses(m);
      const avoidChance = Math.min(0.90, fit.archaeologyNonFatalAvoid || 0);
      if (avoidChance > 0 && rng() < avoidChance) {
        hullDamage.avoided = true;
        lines.push(m.name + " 在「" + body.name + "」的「" + profile.name + "」触发反噬，舰载稳定系统险险规避了船体损伤。");
      } else {
        const stabRed = Math.min(0.80, fit.archaeologyStabilizer || 0);
        // 舰船级失败损伤减免（1 代 archaeologyFailureDamageReduction）：与装配稳定器平行乘区；
        // 双读 flat 字段 / bonuses 对象，与 scanStrength 口径一致（archaeology.js:63）。
        const shipCfg2 = Data && Data.Ships ? Data.Ships.shipById(m.shipId) : null;
        const shipFdr = (shipCfg2 && (shipCfg2.archaeologyFailureDamageReduction || (shipCfg2.bonuses && shipCfg2.bonuses.archaeologyFailureDamageReduction))) || 0;
        // ★ S4 backlash 科技（1 代 research.js:172）：与稳定器/舰船减免平行乘区，只乘一次
        const frac = profile.hullDamageFrac(band) * (1 - stabRed) * (1 - shipFdr) * (1 - backlashReduction(state));
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
    // ★ S3 考古复刻
    ensureArch, probeCostState, selectedProbeOf, chargeProbe,
    resolveRegularYield, resolveCalibration, resolveRare,
    voucherMult, recycleArtifact, recycleAll,
    // ★ S4 科技乘区
    archResearchMult, successBonus, backlashReduction, archExpMult,
    protocolUnlocked: function (state, kind) {
      const T = (window.NSK && window.NSK.Engine) ? window.NSK.Engine.Tech : null;
      if (!T || !T.levelOf) return true;              // 探针缺门时按解锁处理，避免挡住 UI
      const lv = T.levelOf(state, kind);
      return (lv || 0) >= 1;
    },
  };
});
