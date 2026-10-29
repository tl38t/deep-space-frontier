// ================================================================
// 深空星疆 —— Core.Store：localStorage 存档（浏览器）；Node 直操内存态
// 单一真相源 = state。所有写盘走这里，便于将来接服务端校验/云存档。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Core = window.NSK.Core || {};
    Object.assign(window.NSK.Core, mod);
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Core = Object.assign(root.NSK.Core || {}, mod);
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SAVE_KEY = "nsk_save_v7";
  // v7：星域安全等级改 EVE 式 secLevel 分档（弃用旧 sec 浮点）；新增玩家持久战斗小队 squad + base.squadTier。
  //     旧 v6 存档 region 无 secLevel、无 squad，作废重开。
  const STATE_VERSION = 8;

  // 本地存档 NSK2：轻量混淆 + 完整性摘要。仅用于阻止误改/随手改，不等同于服务端防作弊签名。
  // 与 EVE 的 DSI2 同算法，前缀 / 掩码解耦为本作字面。无 NSK2 前缀的旧明文档走 JSON.parse 兼容。
  const LOCAL_SAVE_PREFIX = "NSK2.";
  const LOCAL_SAVE_MASK = "shenkong-xingjiang-local-v2";
  const Codec = (typeof window !== "undefined" && window.NSK && window.NSK.Core) ? window.NSK.Core.Codec : null;
  function _bytesToB64(bytes) { return Codec ? Codec.bytesToBase64Url(bytes) : ""; }
  function _b64ToBytes(v) { return Codec ? Codec.base64UrlToBytes(v) : new Uint8Array(0); }
  function _digest(text) { return Codec ? Codec.fnv1a32(text) : ""; }
  function _utf8Encode(t) { return Codec ? Codec.utf8Encode(t) : new Uint8Array(0); }
  function _utf8Decode(b) { return Codec ? Codec.utf8Decode(b) : ""; }
  function encodeLocalSave(data) {
    const text = JSON.stringify(data);
    const bytes = _utf8Encode(text);
    for (let i = 0; i < bytes.length; i++) bytes[i] ^= LOCAL_SAVE_MASK.charCodeAt(i % LOCAL_SAVE_MASK.length) ^ (i & 0xff);
    return LOCAL_SAVE_PREFIX + _digest(text) + "." + _bytesToB64(bytes);
  }
  function decodeLocalSave(value) {
    const text = String(value || "").trim();
    if (text.indexOf(LOCAL_SAVE_PREFIX) !== 0) return JSON.parse(text); // 兼容旧版明文存档
    const parts = text.split(".");
    if (parts.length !== 3 || parts[1].length !== 8) throw new Error("本地存档格式无效");
    const bytes = _b64ToBytes(parts[2]);
    for (let i = 0; i < bytes.length; i++) bytes[i] ^= LOCAL_SAVE_MASK.charCodeAt(i % LOCAL_SAVE_MASK.length) ^ (i & 0xff);
    const payloadText = _utf8Decode(bytes);
    if (_digest(payloadText) !== parts[1]) throw new Error("本地存档校验失败（可能已被修改或损坏）");
    return JSON.parse(payloadText);
  }

  // 10 技能键（与 state.js SKILL_KEYS 对齐，防御旧档缺字段）
  const SKILL_KEYS = ["mining", "scanning", "archaeology", "refine", "manufacture", "invent", "combatLaser", "combatTurret", "command", "defense"];

  // 成员字段规范化（防御旧档/半成品档缺字段导致 UI 报错）
  function normalizeMembers(s) {
    if (!s || !Array.isArray(s.members)) return s;
    // MVP 周六/周日新增字段兜底（旧档迁移）：精通点 / 待决事件 / 成员里程碑
    if (!s.mastery || typeof s.mastery !== "object") s.mastery = { points: 0, earned: 0, spent: 0, nodes: {} };
    if (!Array.isArray(s.pendingEvents)) s.pendingEvents = [];
    // 行星采集设施（EVE 式收菜，2026-10-27 方案 B）字段兜底
    if (!s.sites || typeof s.sites !== "object") s.sites = {};
    const Ships = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data.Ships : null;
    for (const m of s.members) {
      // develop 岗已退役（行星产出走 Engine.Sites 设施）：旧档驻留行星的成员召回待命
      if (m.assignment && m.assignment.type === "develop") { m.assignment = null; m.status = "idle"; }
      if (m.origin === undefined) m.origin = "人才市场";
      if (!Array.isArray(m.milestones)) m.milestones = [];
      if (!m.passion) m.passion = {};
      for (const k of SKILL_KEYS) if (m.passion[k] === undefined) m.passion[k] = "none";
      if (!m.skills) m.skills = {};
      for (const k of SKILL_KEYS) if (typeof m.skills[k] !== "number") m.skills[k] = 0;
      if (!m.shipId) m.shipId = "frigate";
      if (m.wage === undefined) m.wage = 0;
      if (m.merit === undefined) m.merit = 0;
      if (!m.hp) {
        const hp = Ships ? Ships.maxHp(m.shipId) : { shield: 100, armor: 100, structure: 100 };
        m.hp = { shield: hp.shield, armor: hp.armor, structure: hp.structure };
      }
      if (!m.backstory) m.backstory = null;
      if (!m.trait) m.trait = null;
      if (m.destroyed === undefined) m.destroyed = false;
      if (!m.mods) {
        const State = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.State : null;
        m.mods = State && State.EMPTY_MODS ? State.EMPTY_MODS : { xpMult: {}, yieldMult: {}, creditMult: {}, learnMult: 1 };
      }
      // 出身势力亲和（按 childhood.id 从 BACKSTORY_DEFS 重算，兼容旧档缺字段）
      if (m.factionAffinity === undefined || !m.affinity) {
        const State = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.State : null;
        const defs = State && State.BACKSTORY_DEFS ? State.BACKSTORY_DEFS : null;
        const cd = (m.backstory && m.backstory.childhood && defs) ? defs.find(d => d.id === m.backstory.childhood.id) : null;
        m.factionAffinity = (cd && cd.factionAffinity) || null;
        m.affinity = (cd && cd.affinity) || { repMult: 1, creditMult: 1, urgentSuccess: 0 };
      }
      // 人生目的系统（⑤）：老档补全 goals + 重算 goalXp（确定性，按 member id 派生）
      const Npc = (typeof window !== "undefined" && window.NSK && window.NSK.Engine && window.NSK.Engine.Npc) || null;
      if (Npc) {
        if (m.goals === undefined) m.goals = Npc.rollGoalsFor(m.id);
        if (m.mods) Npc.recomputeGoalXp(m);
      }
    }
    // 星系内部天体回填（旧档 node 可能无 bodies；ensureBodies 幂等，按 node.id 确定性生成）
    if (s.starMap && s.starMap.nodes && window.NSK.Data && window.NSK.Data.StarMap && window.NSK.Data.StarMap.ensureBodies) {
      window.NSK.Data.StarMap.ensureBodies(s.starMap);
    }
    // 持久战斗小队归一化（幂等；缺字段补默认值）
    if (!s.squad || typeof s.squad !== "object") {
      const State = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.State : null;
      s.squad = State && State.createDefaultSquad ? State.createDefaultSquad() : { enabled: false, members: [], capacity: 1, targetId: null };
    }
    if (!Array.isArray(s.squad.members)) s.squad.members = [];
    if (typeof s.squad.capacity !== "number") s.squad.capacity = 1;
    if (s.squad.targetId === undefined) s.squad.targetId = null;
    if (typeof s.base.squadTier !== "number") s.base.squadTier = 0;
    // 势力任务板迁移（幂等）：老档补齐新增的 questGiver 势力（questGiver:false 的野怪势力不补）。
    // 放在 normalize 里，load / 云档合并都会过这里；some() 去重保证多次调用不重复派任务。
    try {
      const F = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data.Factions : null;
      const mkRng = (typeof window !== "undefined" && window.NSK && window.NSK.Core && window.NSK.Core.makeRng) ? window.NSK.Core.makeRng : null;
      if (F && F.FACTIONS && F.generateQuest && mkRng && Array.isArray(s.factions)) {
        for (const f of F.FACTIONS) {
          if (f.questGiver === false) continue;
          if (s.factions.some(x => x.id === f.id)) continue;
          s.factions.push({
            id: f.id,
            relation: 0,
            quests: [F.generateQuest(mkRng((Math.random() * 4294967296) >>> 0), f, 1)],
            nextRefreshAt: Date.now() + 6 * 3600 * 1000,
          });
        }
      }
    } catch (e) { /* 势力迁移失败不阻断读档 */ }
    return s;
  }

  // 存储后端：优先走 Core.Storage 抽象（浏览器 localStorage / TapTap 沙盒 tap.setStorage / 内存兜底）。
  // 注释：TapTap 小游戏沙盒里没有 localStorage，必须走 tap.setStorage，否则每次启动都是新档。
  function _Storage() {
    return (typeof window !== "undefined" && window.NSK && window.NSK.Core) ? window.NSK.Core.Storage : null;
  }
  function hasLocal() {
    const S = _Storage();
    if (S && S.backend) return S.backend() !== "memory";
    try { return typeof localStorage !== "undefined"; } catch (e) { return false; }
  }

  function save(state) {
    if (!hasLocal()) return false;
    try {
      if (state && typeof state === "object") state.lastSeen = Date.now();
      const val = encodeLocalSave(state);
      const S = _Storage();
      if (S) return S.setItem(SAVE_KEY, val);
      localStorage.setItem(SAVE_KEY, val);
      return true;
    } catch (e) { return false; }
  }

  function load() {
    if (!hasLocal()) return null;
    try {
      const S = _Storage();
      const raw = S ? S.getItem(SAVE_KEY) : localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = decodeLocalSave(raw); // 处理 NSK2 + 旧明文兼容
      // 版本兼容：接受 ≤ 当前版本的旧档（normalizeMembers 补新字段后升版），拒绝更高版本（未知存档格式）。
      if (!s || typeof s.version !== "number" || s.version > STATE_VERSION) return null;
      const n = normalizeMembers(s);
      n.version = STATE_VERSION;
      return n;
    } catch (e) { return null; }
  }

  function wipe() {
    const S = _Storage();
    if (S) { S.removeItem(SAVE_KEY); return; }
    if (hasLocal()) localStorage.removeItem(SAVE_KEY);
  }

  return { SAVE_KEY, STATE_VERSION, save, load, wipe, hasLocal, normalize: normalizeMembers, encodeLocalSave, decodeLocalSave };
});
