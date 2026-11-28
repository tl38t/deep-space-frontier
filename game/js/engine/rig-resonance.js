// ================================================================
// 深空星疆 —— Engine.RigResonance：改装件谐振聚合（1 代 rigs.js 逐值照搬）
// ----------------------------------------------------------------
// 规则（1 代 js/systems/rigs.js:14-88）：
//   · 同 stackGroup（系列）可重复装配，但按 EVE 谐振惩罚递减：
//       S(n) = 0.5 ^ ( ((n-1) / 2.22292081)^2 )    n = 组内降序排位，n=1 吃满效
//     S(1)=1.000  S(2)≈0.869  S(3)≈0.570  S(4)≈0.283  S(5)≈0.106
//   · 组内按基础值降序，同值按装配序（fitted 数组下标）稳定占位——先装者占优。
//   · 每件有效值 = 基础值 × S(idx)；按 bonusKey 跨组累加。
//   · 词条值（affixes）在谐振**之外**直加，不参与降序排位（1 代 :61-63,73-86）。
//
// 本作适配：1 代实例在 ship.fitting.rig[]，本装在 m.fitted.rig[]（存 uid）；
//   实例本体 state.equipInstances[uid]。解析器一律走 EquipInstances，
//   探针裸 itemId 也能回退（def 存在、affixes 空）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.RigResonance = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.RigResonance = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const RIG_RESONANCE_DIVISOR = 2.22292081;
  function stackPenalty(position0) {
    const n = position0 + 1;
    return Math.pow(0.5, Math.pow((n - 1) / RIG_RESONANCE_DIVISOR, 2));
  }

  function _EI() {
    const NSK = (typeof window !== "undefined" && window.NSK) ? window.NSK : null;
    return (NSK && NSK.Core && NSK.Core.EquipInstances) ? NSK.Core.EquipInstances : null;
  }

  // 取成员已装的所有 rig（解析 uid → { def, base, affixes, seq }）。
  // 槽位固定为 rig（1 代装配也只在 rig 槽吃谐振）；非 rig 槽的装备加成走普通 fittedBonuses。
  function fittedRigs(state, m) {
    const EI = _EI();
    const out = [];
    if (!m || !m.fitted || !Array.isArray(m.fitted.rig)) return out;
    m.fitted.rig.forEach((ref, seq) => {
      if (!ref) return;
      const r = EI ? EI.resolve(state, ref) : null;
      if (!r || !r.def || r.def.slot !== "rig") return;
      out.push({
        def: r.def,
        stackGroup: r.def.stackGroup || r.def.id,
        bonuses: r.def.bonuses || {},
        affixes: Array.isArray(r.affixes) ? r.affixes : [],
        seq: seq,
      });
    });
    return out;
  }

  // 聚合已装 rig 的加成：基础值吃谐振惩罚，词条值直加。
  // 返回 { bonusKey: number }，可直接并进 fittedBonuses 的结果。
  function modifiersOf(state, m) {
    const rigs = fittedRigs(state, m);
    const groups = {};
    for (const rig of rigs) {
      for (const key of Object.keys(rig.bonuses)) {
        const v = Number(rig.bonuses[key]);
        if (!isFinite(v)) continue;
        (groups[rig.stackGroup] = groups[rig.stackGroup] || []).push({
          key: key, value: v, seq: rig.seq
        });
      }
    }
    const out = {};
    for (const list of Object.values(groups)) {
      list.sort((a, b) => b.value - a.value || a.seq - b.seq);
      list.forEach((e, idx) => {
        const effective = e.value * stackPenalty(idx);
        out[e.key] = (out[e.key] || 0) + effective;
      });
    }
    // 词条谐振外直加（与 1 代一致）
    for (const rig of rigs) {
      for (const a of rig.affixes) {
        const key = a && a.bonusKey, v = Number(a && a.value);
        if (key && isFinite(v) && v !== 0) out[key] = (out[key] || 0) + v;
      }
    }
    return out;
  }

  // 预览：新增一件 rig 后的逐件贡献（UI 用，1 代 getRigResonancePreview 同口径）。
  // 同值新件排在旧件之后吃更高惩罚；词条不计入降序队列。
  function previewOf(state, m, candidateItemId, candidateAffixes) {
    const EI = _EI();
    const def = EI ? EI.defOf(candidateItemId) : null;
    if (!def || def.slot !== "rig") return null;
    const sg = def.stackGroup || def.id;
    const rigs = fittedRigs(state, m);
    const rows = [];
    for (const rig of rigs) {
      for (const key of Object.keys(rig.bonuses)) {
        const v = Number(rig.bonuses[key]);
        if (isFinite(v)) rows.push({ key: key, value: v, seq: rig.seq, existing: true });
      }
    }
    for (const key of Object.keys(def.bonuses || {})) {
      const v = Number(def.bonuses[key]);
      if (isFinite(v)) rows.push({ key: key, value: v, seq: 1e9, existing: false });
    }
    const relevant = rows.filter(r => r.key && (Object.keys(def.bonuses || {}).includes(r.key)));
    relevant.sort((a, b) => b.value - a.value || a.seq - b.seq);
    const idx = relevant.findIndex(r => !r.existing);
    return {
      stackGroup: sg,
      bonusKeys: Object.keys(def.bonuses || {}),
      newPosition: idx + 1,
      newPenalty: stackPenalty(Math.max(0, idx)),
      perRow: relevant.map((r, i) => ({
        key: r.key, value: r.value, existing: r.existing, penalty: stackPenalty(i),
        effective: r.value * stackPenalty(i)
      })),
      affixes: Array.isArray(candidateAffixes) ? candidateAffixes.slice() : [],
    };
  }

  return { RIG_RESONANCE_DIVISOR, stackPenalty, fittedRigs, modifiersOf, previewOf };
});
