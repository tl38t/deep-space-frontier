// ================================================================
// 深空星疆 —— Core.EquipInstances：舰船装备实例层
// ----------------------------------------------------------------
// 2026-11-28「装备实例化」：成员 fitted 数组从「裸 itemId 字符串」升级为「实例 uid」，
// 每件装备成为独立实例 { itemId, affixes }，为后续改装件词条（rig 强化）提供落点。
//
// 设计要点：
//   · 实例表放独立顶层字段 state.equipInstances，**不塞进 state.equipment**——
//     后者是平铺计数库存，被 UI 用 Object.entries 遍历（app.js 已存装备面板），
//     塞入 instances 键会产生 [object Object] ×NaN 的幽灵条目。
//   · uid 格式 eq_<N>（1 代同款），由 state.nextEquipUid 确定性分配。
//   · 存档形态：normalize 迁移后所有 fitted 元素都是 uid（完全式）。
//   · 解析层对裸 itemId 保留防御性回退：探针直接构造的 fitted 数组、脏档悬空 uid
//     都能安全处理，不改变「真实存档全 uid」的形态。
//   · affixes 本阶段恒空；bonusesOf 预留词条叠加接口，等②rig 谐振接线。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Core = window.NSK.Core || {};
    window.NSK.Core.EquipInstances = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Core = root.NSK.Core || {};
    root.NSK.Core.EquipInstances = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SLOTS = ["high", "mid", "low", "rig"];
  const UID_RE = /^eq_\d+$/;

  function looksLikeUid(ref) { return typeof ref === "string" && UID_RE.test(ref); }

  function defOf(itemId) {
    const NSK = (typeof window !== "undefined" && window.NSK) ? window.NSK : null;
    const Eq = NSK && NSK.Data ? NSK.Data.Equipment : null;
    return (Eq && Eq.byId && itemId) ? Eq.byId(itemId) : null;
  }

  // 幂等补实例表。旧档缺字段时建空表，不动 fitted（迁移另做）。
  function ensure(s) {
    if (!s || typeof s !== "object") return s;
    if (!s.equipInstances || typeof s.equipInstances !== "object" || Array.isArray(s.equipInstances))
      s.equipInstances = {};
    if (typeof s.nextEquipUid !== "number" || !isFinite(s.nextEquipUid) || s.nextEquipUid < 1)
      s.nextEquipUid = 1;
    return s;
  }

  // 建一件实例，返回 uid。affixes 深拷贝一份，避免外部数组共享。
  function create(s, itemId, affixes) {
    ensure(s);
    const uid = "eq_" + (s.nextEquipUid++);
    s.equipInstances[uid] = {
      itemId: String(itemId),
      affixes: Array.isArray(affixes) ? affixes.map(a => Object.assign({}, a)) : []
    };
    return uid;
  }

  // 删除实例（卸下且无词条时调用）。悬空 uid 静默忽略。
  function remove(s, uid) {
    if (!s || !s.equipInstances || !looksLikeUid(uid)) return false;
    if (!Object.prototype.hasOwnProperty.call(s.equipInstances, uid)) return false;
    delete s.equipInstances[uid];
    return true;
  }

  // 解析 fitted 里的值 → { uid, itemId, affixes, def }。
  //   · 合法 uid → 实例表查找；
  //   · 裸 itemId（探针/脏档）→ 回退，uid=null、affixes=[];
  //   · 悬空 uid → null（调用方按「装备不存在」处理，不崩溃）。
  function resolve(s, ref) {
    if (typeof ref !== "string") return null;
    if (looksLikeUid(ref)) {
      const inst = (s && s.equipInstances) ? s.equipInstances[ref] : null;
      if (!inst) return null;
      return { uid: ref, itemId: inst.itemId, affixes: inst.affixes || [], def: defOf(inst.itemId) };
    }
    return { uid: null, itemId: ref, affixes: [], def: defOf(ref) };
  }

  // 只取 itemId（大部分旧引用点只需这个）。解析失败返回 null。
  function itemIdOf(s, ref) {
    const r = resolve(s, ref);
    return r ? r.itemId : null;
  }

  // 取装备加成。本阶段 affixes 恒空，直接返回定义 bonuses（浅拷贝，避免调用方改写定义表）。
  // 预留：词条接入时在此按 affixes[].bonusKey/value 叠加（与 1 代 rigs.js 同口径）。
  function bonusesOf(s, ref) {
    const r = resolve(s, ref);
    if (!r || !r.def) return {};
    const out = Object.assign({}, r.def.bonuses || {});
    return out;
  }

  // 旧档迁移：遍历所有成员四槽，把裸 itemId 字符串转成实例 uid。
  // 幂等：已是合法且存在的 uid 跳过；悬空 uid 视为脏数据剔除并回收到库存。
  // 返回 { created, dropped }，便于探针断言。
  function migrateFitted(s) {
    ensure(s);
    const out = { created: 0, dropped: 0 };
    if (!s || !Array.isArray(s.members)) return out;
    const inv = (s.equipment && typeof s.equipment === "object") ? s.equipment : (s.equipment = {});
    for (const m of s.members) {
      if (!m || !m.fitted || typeof m.fitted !== "object") continue;
      for (const slot of SLOTS) {
        const arr = m.fitted[slot];
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < arr.length; i++) {
          const ref = arr[i];
          if (looksLikeUid(ref)) {
            if (s.equipInstances[ref]) continue;      // 已是合法实例，幂等跳过
            inv[ref] = (inv[ref] || 0) + 1;            // 悬空 uid：回收到库存（键为 uid，后续按 itemIdOf 无法解析）
            // 悬空且无法还原 itemId，直接丢弃该槽位，避免幽灵装备
            arr.splice(i, 1); i--; out.dropped++;
            continue;
          }
          if (typeof ref !== "string" || !ref) { arr.splice(i, 1); i--; out.dropped++; continue; }
          arr[i] = create(s, ref, []);
          out.created++;
        }
      }
    }
    return out;
  }

  return {
    SLOTS, UID_RE, ensure, create, remove, resolve, itemIdOf, bonusesOf,
    migrateFitted, looksLikeUid, defOf
  };
});
