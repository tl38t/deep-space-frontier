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
    if (!s || typeof s !== "object") return s;
    // 蓝图所有权（1 代同义，state.ownedBlueprints）：旧档补字段；
    // 势力商店未实装期间按 Data.Equipment.BP_GRANT_ALL 全量授予（幂等，已授予的不重复 push）。
    // 放在 members 校验之前，避免 members 异常时整段规范化被提前 return 掉。
    if (!Array.isArray(s.ownedBlueprints)) s.ownedBlueprints = [];
    const EqData = (typeof window !== "undefined" && window.NSK && window.NSK.Data)
      ? window.NSK.Data.Equipment : null;
    if (EqData && EqData.grantAllBlueprints) EqData.grantAllBlueprints(s);

    // —— 2026-11-01：战斗小队改为「具名据点 + 科技编制」，旧档迁移 ——
    // ① 星图补据点（幂等重算，覆盖旧值）：raid 挂在 node.raid 上，见 data/raids.js
    const RaidsData = (typeof window !== "undefined" && window.NSK && window.NSK.Data)
      ? window.NSK.Data.Raids : null;
    if (RaidsData && s.starMap) RaidsData.attach(s.starMap);
    // ② state.squad（持久名册 + enabled/targetId）已退役，直接丢弃
    if (s.squad !== undefined) delete s.squad;
    // ③ base.squadTier（花钱升级的小队协议 0/1/2）折算成科技等级：
    //    老玩家花掉的 5000/25000 星币不能白扔，按「已研究」补齐对应科技节点。
    const TechEngine = (typeof window !== "undefined" && window.NSK && window.NSK.Engine)
      ? window.NSK.Engine.Tech : null;
    if (TechEngine) {
      TechEngine.ensure(s);
      const tier = (s.base && typeof s.base.squadTier === "number") ? s.base.squadTier : 0;
      if (tier >= 1) s.tech.levels.combat_squad_1 = 1;
      if (tier >= 2) s.tech.levels.combat_squad_2 = 1;
      // 只有「迁移得来的」等级才回填；如果玩家自己研究完了也保持 1（都是 1 级封顶）
    }
    if (s.base && s.base.squadTier !== undefined) delete s.base.squadTier;

    if (!Array.isArray(s.members)) return s;
    // MVP 周六/周日新增字段兜底（旧档迁移）：精通点 / 待决事件 / 成员里程碑
    if (!s.mastery || typeof s.mastery !== "object") s.mastery = { points: 0, earned: 0, spent: 0, nodes: {} };
    if (!Array.isArray(s.pendingEvents)) s.pendingEvents = [];
    // 行星采集设施（EVE 式收菜，2026-10-27 方案 B）字段兜底
    if (!s.sites || typeof s.sites !== "object") s.sites = {};
    // 舰船装备库存（2026-10-31 总装船坞制造）：旧档补 equipment
    if (!s.equipment || typeof s.equipment !== "object") s.equipment = {};
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
      // 舰船装配（2026-10-31）：旧档成员补 fitted/enhancementLevel，避免 UI 读 undefined
      if (!m.fitted || typeof m.fitted !== "object") m.fitted = { high: [], mid: [], low: [], rig: [] };
      for (const slot of ["high", "mid", "low", "rig"]) if (!Array.isArray(m.fitted[slot])) m.fitted[slot] = [];
      if (typeof m.enhancementLevel !== "number") m.enhancementLevel = 0;
      // 装配槽数不得超过该舰槽位布局（防御手改/旧档越界）；溢出按 1 代「越界回收」退回库存
      if (Ships && Ships.slotLayout) {
        const layout = Ships.slotLayout(m.shipId);
        for (const slot of ["high", "mid", "low", "rig"]) {
          const cap = layout[slot] || 0;
          if (m.fitted[slot].length > cap) {
            const overflow = m.fitted[slot].splice(cap);
            for (const id of overflow) s.equipment[id] = (s.equipment[id] || 0) + 1;
          }
        }
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
    // ⚠️ 2026-11-01：持久战斗小队（s.squad）与 base.squadTier 已退役，此处不再补默认值。
    //    迁移在上方 normalizeMembers 开头做（squadTier → 科技等级，然后删字段）。
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

    // 资源键清洗（2026-10-31）：历史 bug（配方 in 曾是字符串，production.canAfford/spend 用
    // for...in 遍历 → 拿到字符下标 "0".."7"）曾往 state.res 写入 NaN 键并随存档落盘。
    // 这里按资源注册表白名单清掉非法键，并给新资源（弹药）补默认值，旧档可直接进新战斗系统。
    try {
      const R = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data.Resources : null;
      if (R && R.ALL && s.res && typeof s.res === "object") {
        for (const k in s.res) {
          if (!R.ALL[k] || typeof s.res[k] !== "number" || !isFinite(s.res[k])) delete s.res[k];
        }
        for (const k in R.ALL) if (typeof s.res[k] !== "number") s.res[k] = 0;
      }
    } catch (e) { /* 资源清洗失败不阻断读档 */ }

    // 战斗状态字段补齐（不升 STATE_VERSION：旧字段 combatCarry 语义已废弃，直接丢弃即可）
    if (!s.combatWaveHp || typeof s.combatWaveHp !== "object") s.combatWaveHp = {};
    if (s.combatFocus === undefined) s.combatFocus = null;
    if (s.combatCarry !== undefined) delete s.combatCarry;

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
