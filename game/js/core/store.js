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

  const SAVE_KEY = "nsk_save_v9";
  // v7：星域安全等级改 EVE 式 secLevel 分档（弃用旧 sec 浮点）；新增玩家持久战斗小队 squad + base.squadTier。
  //     旧 v6 存档 region 无 secLevel、无 squad，作废重开。
  // v8（2026-11-27，STATE_VERSION 9）：星图 9→12 星域（4 安等×3 势力）+ 据点 band 改节点级。
  //     旧档 9 域固定星图无法平移到 12 域（节点坐标/归属/band 全变），用户授权强制升级 ⇒ 旧档作废重开。
  // v9（2026-11-28，STATE_VERSION 10）：星图布局改「径向分层 + 先驱遗迹居中」（用户定案）。
  //     4×3 等距阵列作废：12 域坐标、域归属、区域间星门、每跳燃料全部重排，
  //     节点 id 与名字的对应关系也变（node_0 起仍按 高安→边境→低安→00 顺序分配），
  //     ⇒ 旧档作废重开（用户当次授权）。
  // v10（2026-11-28，STATE_VERSION 11）：装备实例化。成员 fitted 从裸 itemId 字符串
  //     升级为实例 uid（eq_<N>），实例本体存独立顶层字段 state.equipInstances。
  //     旧档 fitted 逐件幂等迁移（affixes 空）， wardrobe 计数库存不变 ⇒ 可平移，不重开。
  const STATE_VERSION = 11;

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

  // 12 技能键（与 state.js SKILL_KEYS 对齐）。2026-11-01 技能体系重构，旧键迁移见 SKILL_MIGRATE。
  const SKILL_KEYS = ["mining", "gas", "archaeology", "combatLaser", "combatTurret", "missile", "defense", "refine", "manufacture", "research", "capacitor", "piloting"];
  // 旧键 → 新键：scanning 并入采气、command 由导弹取代、invent 改名科研、logistics 改名驾驶(1代 piloting)。
  // ⚠️ 迁移必须删除旧键：否则每次 load 都会把同一个 xp 再加一遍（存档越读越强）。
  const SKILL_MIGRATE = { scanning: "gas", command: "missile", invent: "research", logistics: "piloting" };
  function migrateSkillKeys(m) {
    if (!m) return;
    if (m.skills && typeof m.skills === "object") {
      for (const oldK in SKILL_MIGRATE) {
        if (typeof m.skills[oldK] !== "number") continue;
        const nk = SKILL_MIGRATE[oldK];
        m.skills[nk] = (m.skills[nk] || 0) + m.skills[oldK];
        delete m.skills[oldK];
      }
    }
    if (m.passion && typeof m.passion === "object") {
      for (const oldK in SKILL_MIGRATE) {
        const pv = m.passion[oldK];
        if (pv === undefined) continue;
        const nk = SKILL_MIGRATE[oldK];
        // 新键已有实质档位就不覆盖（"none" 视为空位，可继承旧天赋）
        if (m.passion[nk] === undefined || m.passion[nk] === "none") m.passion[nk] = pv;
        delete m.passion[oldK];
      }
    }
  }

  // 成员字段规范化（防御旧档/半成品档缺字段导致 UI 报错）
  function normalizeMembers(s) {
    if (!s || typeof s !== "object") return s;
    // 蓝图所有权（1 代同义，state.ownedBlueprints）：旧档补字段。
    // 放在 members 校验之前，避免 members 异常时整段规范化被提前 return 掉。
    if (!Array.isArray(s.ownedBlueprints)) s.ownedBlueprints = [];
    const EqData = (typeof window !== "undefined" && window.NSK && window.NSK.Data)
      ? window.NSK.Data.Equipment : null;
    // BP_GRANT_ALL 已于 2026-11-28 关掉（势力商店上线），调用点保留、函数内部短路。
    if (EqData && EqData.grantAllBlueprints) EqData.grantAllBlueprints(s);

    // —— 2026-11-28 势力商店一次性回落（设计稿 §3，幂等，不升 STATE_VERSION）——
    //   老档被 BP_GRANT_ALL 全量污染 → 清空 → 发初始免费集 → 打 shopMigrated 标记。
    //   Engine.FactionShop 由引擎层提供；未就绪时用同形兜底（免费集键只从 EqData 取，不写字面量）。
    try {
      const FS = (typeof window !== "undefined" && window.NSK && window.NSK.Engine)
        ? window.NSK.Engine.FactionShop : null;
      if (FS && FS.migrate) FS.migrate(s);
      else if (s.shopMigrated !== true) {
        s.ownedBlueprints = (EqData && EqData.FREE_BLUEPRINT_KEYS) ? EqData.FREE_BLUEPRINT_KEYS.slice() : [];
        s.shopMigrated = true;
      }
    } catch (e) { /* 迁移失败不阻断读档（下一轮会重试） */ }

    // 蓝图效率研究状态（2026-11-08）：旧档无 state.invention 时幂等补齐，
    // **不升 STATE_VERSION**（沿用 ensure*() 既有模式）。放在 members 校验之前，
    // 避免成员异常时整段规范化被提前 return 掉。
    // store 层先于 engine 层加载，故惰性取 Engine.Invention；未就绪时用同形兜底，
    // 运行期 Invention.ensure 会再次清洗（幂等，脏计数归 0）。
    try {
      const IE = (typeof window !== "undefined" && window.NSK && window.NSK.Engine)
        ? window.NSK.Engine.Invention : null;
      if (IE && IE.ensure) IE.ensure(s);
      else {
        if (!s.invention || typeof s.invention !== "object") s.invention = { schemaVersion: 1, blueprints: {} };
        if (s.invention.schemaVersion !== 1) s.invention.schemaVersion = 1;
        if (!s.invention.blueprints || typeof s.invention.blueprints !== "object" || Array.isArray(s.invention.blueprints))
          s.invention.blueprints = {};
      }
    } catch (e) { /* 发明状态迁移失败不阻断读档 */ }

    // 泰坦门禁状态（④ 泰坦子系统，2026-11-10）：旧档补 legion.formed / starMapDone
    if (!s.legion || typeof s.legion !== "object") s.legion = { formed: false };
    if (typeof s.legion.formed !== "boolean") s.legion.formed = false;
    if (typeof s.starMapDone !== "boolean") s.starMapDone = false;

    // —— 2026-11-27：星域定义幂等刷新（REGION_DEFS 为唯一真值）——
    //   SAVE_KEY v8 已让 9 域旧档作废重开；此段对新档幂等无害（region 本就等于定义），
    //   仅作保险：覆盖 secLevel/stage/pirate/rich/trialOpen，不碰坐标/size。
    //   刷新必须在 RaidsData.attach 之前：attach 按 region.secLevel/pirate 重算据点 band/势力。
    const SData = (typeof window !== "undefined" && window.NSK && window.NSK.Data)
      ? window.NSK.Data.StarMap : null;
    if (SData && SData.REGION_DEFS && s.starMap && Array.isArray(s.starMap.regions)) {
      SData.REGION_DEFS.forEach((def, i) => {
        const reg = s.starMap.regions[i];
        if (!reg || reg.name !== def.name) return;   // 按名称对齐，防序错位改
        reg.secLevel = def.secLevel;
        reg.stage = def.stage;
        reg.pirate = def.pirate;
        reg.rich = def.rich;
        reg.trialOpen = def.stage <= 1;
      });
      // 只刷试玩门禁（由 stage 派生、无副作用）；节点 richness/abundance/bodies 是生成时
      // 烘焙的内容，重算要动主 PRNG 且会改玩家既有产出，本次范围外 —— 旧档保持原值。
      for (const n of (s.starMap.nodes || [])) {
        const reg = s.starMap.regions.find(r => r.id === n.region);
        if (reg) n.trialOpen = reg.trialOpen !== false;
      }
    }

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
    // ★ 2026-11-27 S5 维护费字段（1 代 data/planets.js：每 24h 付费，到期停产）
    //   ⚠️ deployedAt 缺失必须补成「现在」：若补 0，`now - 0` 早已超过 duration，
    //      所有旧档装置在读档瞬间集体停产；若永远 undefined，引擎兜底成 now 则永不到期、
    //      等于永久免费。两个极端都是 bug，只有「从现在开始计 24h」是玩家能接受的迁移。
    //   ⚠️ 不升 STATE_VERSION：纯 additive，旧档读入后即带全部新字段。
    {
      const nowMs = Date.now();
      for (const bid in s.sites) {
        const st = s.sites[bid];
        if (!st || typeof st !== "object") { delete s.sites[bid]; continue; }
        let dep = Number(st.deployedAt);
        if (!isFinite(dep) || dep <= 0) dep = nowMs;
        st.deployedAt = dep;
        let dur = Number(st.duration);
        if (!isFinite(dur) || dur <= 0) dur = 86400;          // 1 代 maintenanceDuration
        st.duration = dur;
        if (st.active === undefined) st.active = (dep + dur * 1000) > nowMs;
        st.active = !!st.active;
        if (!st.autoRenew || typeof st.autoRenew !== "object") st.autoRenew = { enabled: false, minIskReserve: 0 };
        st.autoRenew.enabled = !!st.autoRenew.enabled;
        let minRes = Math.floor(Number(st.autoRenew.minIskReserve) || 0);
        if (!isFinite(minRes) || minRes < 0) minRes = 0;
        st.autoRenew.minIskReserve = minRes;
        if (st.lastRenewFail !== undefined && typeof st.lastRenewFail !== "string") delete st.lastRenewFail;
      }
    }

    // ★ 2026-11-27 P3 战斗统计（幂等补字段，不升 STATE_VERSION）
    //   全部按「有限非负整数」清洗；非法一律归零（1 代 statistics.js 同一口径）
    if (!s.stats || typeof s.stats !== "object") s.stats = {};
    if (!s.stats.combat || typeof s.stats.combat !== "object") s.stats.combat = {};
    {
      const KEYS = ["maxWave", "waves", "rounds", "bossKills", "eliteKills", "defeats"];
      for (const k of KEYS) {
        let v = Number(s.stats.combat[k]);
        if (!isFinite(v) || v < 0) v = 0;
        s.stats.combat[k] = Math.floor(v);
      }
      if (s.stats.combat.maxWave > 20) s.stats.combat.maxWave = 20;   // 一轮只有 20 波
    }

    // ★ 2026-11-27 S1 货柜：具名战利品背包（1 代 state.cargoLoot，cargo.js 的 cargoGrantLoot 会懒建）
    //   这里提前补空数组，保证旧档字段齐全；元素结构 {id,name,kind,value}，非法条目直接丢。
    if (!Array.isArray(s.cargoLoot)) s.cargoLoot = [];
    else {
      s.cargoLoot = s.cargoLoot.filter(function (it) {
        return it && typeof it === "object" && (it.kind === "isk" || it.kind === "lp")
          && isFinite(Number(it.value)) && Number(it.value) > 0;
      });
    }
    // 舰船装备库存（2026-10-31 总装船坞制造）：旧档补 equipment
    if (!s.equipment || typeof s.equipment !== "object") s.equipment = {};
    // 装备实例层（2026-11-28，STATE_VERSION 11）：ensure 实例表须在成员循环之前，
    // 因为下方 fitted 迁移会分配 uid。store 层先于 engine 层加载，惰性取 Core.EquipInstances。
    let _EI = null;
    try {
      _EI = (typeof window !== "undefined" && window.NSK && window.NSK.Core)
        ? window.NSK.Core.EquipInstances : null;
      if (_EI && _EI.ensure) _EI.ensure(s);
      else {
        if (!s.equipInstances || typeof s.equipInstances !== "object" || Array.isArray(s.equipInstances)) s.equipInstances = {};
        if (typeof s.nextEquipUid !== "number" || !isFinite(s.nextEquipUid) || s.nextEquipUid < 1) s.nextEquipUid = 1;
      }
    } catch (e) { /* 实例表迁移失败不阻断读档 */ }
    const Ships = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data.Ships : null;
    for (const m of s.members) {
      // develop 岗已退役（行星产出走 Engine.Sites 设施）：旧档驻留行星的成员召回待命
      if (m.assignment && m.assignment.type === "develop") { m.assignment = null; m.status = "idle"; }
      if (m.origin === undefined) m.origin = "人才市场";
      if (!Array.isArray(m.milestones)) m.milestones = [];
      if (!m.passion) m.passion = {};
      // 旧键迁移必须先于下面的「补默认」：否则 scanning/command/invent 会被当成缺失字段补成 0，
      // 旧玩家的技能进度就白丢了。
      migrateSkillKeys(m);
      for (const k of SKILL_KEYS) if (m.passion[k] === undefined) m.passion[k] = "none";
      if (!m.skills) m.skills = {};
      for (const k of SKILL_KEYS) if (typeof m.skills[k] !== "number") m.skills[k] = 0;
      if (!m.shipId) m.shipId = "rookie_corvette";
      if (m.wage === undefined) m.wage = 0;
      if (m.merit === undefined) m.merit = 0;
      if (!m.hp) {
        // 用 maxHpOf 而非 maxHp：缺失 hp 的旧档也应按「舰船 + 防御技能容量」建池，
        // 否则会被填成不含技能容量的旧值（虽然 refreshHpCaps 会补，但读档当帧 UI 会先闪一下）。
        const hp = Ships ? (Ships.maxHpOf ? Ships.maxHpOf(m) : Ships.maxHp(m.shipId)) : { shield: 100, armor: 100, structure: 100 };
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
            for (const ref of overflow) {
              // 新档 uid → 取 itemId 退回 + 销毁实例；旧档裸 id → 原样退回。
              const itemId = (_EI && _EI.itemIdOf) ? _EI.itemIdOf(s, ref) : ref;
              const key = itemId || ref;
              s.equipment[key] = (s.equipment[key] || 0) + 1;
              if (_EI && _EI.looksLikeUid && _EI.looksLikeUid(ref)) _EI.remove(s, ref);
            }
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
    // 装备实例迁移（2026-11-28，STATE_VERSION 11）：成员 fitted 裸 itemId → 实例 uid。
    // 必须在上面的「越界回收」之后——回收退回库存的是 itemId 字符串，若先转 uid 会退错键。
    // migrateFitted 幂等：已是合法 uid 跳过；重复 normalize 不重复建实例。
    try {
      if (_EI && _EI.migrateFitted) _EI.migrateFitted(s);
    } catch (e) { /* fitted 迁移失败不阻断读档（下一轮重试） */ }
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
          // ⚠️ 增强剂瓶身（booster:<id>）存在 state.res 但不进 R.ALL 静态白名单
          // （见 data/resources.js 注释：避免与 1 代增强剂数据重复维护）。
          // 若在此按「非注册键」删除，会在每次读档时清空玩家全部瓶身库存 → 增强剂系统失效。
          // 故对 booster: 前缀的有限数值键予以保留（非有限数值仍清除，防御脏数据）。
          const isBooster = (typeof k === "string" && k.indexOf("booster:") === 0);
          const validNum = typeof s.res[k] === "number" && isFinite(s.res[k]);
          if (isBooster) { if (!validNum) delete s.res[k]; continue; }
          if (!R.ALL[k] || !validNum) delete s.res[k];
        }
        for (const k in R.ALL) if (typeof s.res[k] !== "number") s.res[k] = 0;
      }
    } catch (e) { /* 资源清洗失败不阻断读档 */ }

    // 燃料口径统一（2026-11-26）：base.fuel 为唯一真相源，res.fuel 退为镜像；燃料无容量上限。
    // 旧档两本账开局同为 100、之后只有 base.fuel 随回复/消耗变化 → 取 base.fuel 为准，
    // 并清掉历史 fuelMax 字段，避免旧 UI / 探针误读成容量墙。幂等，不升 STATE_VERSION。
    if (s.base) {
      const mirror = Number(s.res && s.res.fuel);
      let v = Number(s.base.fuel);
      if (!isFinite(v)) v = isFinite(mirror) ? mirror : 100;
      s.base.fuel = Math.max(0, v);
      if (s.res) s.res.fuel = s.base.fuel;
      if (s.base.fuelMax !== undefined) delete s.base.fuelMax;
    }

    // 燃料队列归属迁移（2026-11-27）：燃料从总装船坞迁回制造车间（对齐 1 代「装备工程」面板）。
    // 11-26 的旧档里可能还排着 outType:"fuel" 的总装队列项 → 整体平移到 equipQueue，
    // 否则它继续占着总装槽位、而新入队的燃料又进制造车间，两处槽位账各算一半。
    // 幂等：搬完 manufactureQueue 中不再有 outType:"fuel"，重复读档不动作；不升 STATE_VERSION。
    if (s.base && s.base.industry && Array.isArray(s.base.industry.manufactureQueue)) {
      const mq = s.base.industry.manufactureQueue;
      const carried = mq.filter(function (it) { return it && it.outType === "fuel"; });
      if (carried.length) {
        s.base.industry.manufactureQueue = mq.filter(function (it) { return !(it && it.outType === "fuel"); });
        const eq = s.base.industry.equipQueue || (s.base.industry.equipQueue = []);
        for (const it of carried) eq.push(it);
      }
    }

    // 战斗状态字段补齐（不升 STATE_VERSION：旧字段 combatCarry 语义已废弃，直接丢弃即可）
    if (!s.combatWaveHp || typeof s.combatWaveHp !== "object") s.combatWaveHp = {};
    if (s.combatFocus === undefined) s.combatFocus = null;
    if (s.combatCarry !== undefined) delete s.combatCarry;

    // ★ 2026-11-27 P0 波次系统（幂等补字段，不升 STATE_VERSION）
    //   · combatWave：钳到 [1,20]，脏档夹回而不是重置（保留玩家进度）
    //   · combatWavePlan：只校验 compId 是否在合法集合内；非法/缺失一律删 key，
    //     由 combat.js 在下次波开始时按该据点 band 重新抽签（不在读档里抽，读档必须纯幂等）
    //   · combatClears：非负整数，缺失补 0
    if (!s.combatWave || typeof s.combatWave !== "object") s.combatWave = {};
    for (const nid in s.combatWave) {
      let w = Math.round(Number(s.combatWave[nid]) || 1);
      if (!isFinite(w)) w = 1;
      s.combatWave[nid] = Math.min(20, Math.max(1, w));
    }
    const VALID_COMPS = { "2_normal": 1, "3_normal": 1, "2_normal_1_elite": 1, "3_normal_1_elite": 1, "boss": 1 };
    if (!s.combatWavePlan || typeof s.combatWavePlan !== "object") s.combatWavePlan = {};
    for (const nid in s.combatWavePlan) {
      const p = s.combatWavePlan[nid];
      if (!p || typeof p !== "object" || !VALID_COMPS[p.compId]) delete s.combatWavePlan[nid];
    }
    if (!s.combatClears || typeof s.combatClears !== "object") s.combatClears = {};
    for (const nid in s.combatClears) {
      let c = Math.floor(Number(s.combatClears[nid]) || 0);
      if (!isFinite(c) || c < 0) c = 0;
      s.combatClears[nid] = c;
    }

    // ★ 2026-11-27 P1a 逐敌实例（D1 = 路线 B，幂等补字段，不升 STATE_VERSION）
    //   · combatEnemies：nodeId → [{k, hp:[盾,甲,构]}]，长度 1..6、hp 三项有限非负
    //   · 结构非法整条删掉 → combat.js 下次按当前波编队满血重建（不在这里抽签/不碰 prepareNode）
    //   · ⚠️ combatWaveHp 故意**保留不清**：它是旧档唯一进度来源，由 combat.js 首次 ensureEnemies
    //     摊成逐敌血量后自行删除。在这里删会让老玩家的半截进度白丢。
    if (!s.combatEnemies || typeof s.combatEnemies !== "object") s.combatEnemies = {};
    for (const nid in s.combatEnemies) {
      const arr = s.combatEnemies[nid];
      let bad = !Array.isArray(arr) || arr.length < 1 || arr.length > 6;
      if (!bad) {
        for (const e of arr) {
          if (!e || typeof e !== "object" || !Array.isArray(e.hp) || e.hp.length < 3) { bad = true; break; }
          for (let i = 0; i < 3; i++) {
            const v = Number(e.hp[i]);
            if (!isFinite(v) || v < 0) { bad = true; break; }
            e.hp[i] = v;
          }
          if (bad) break;
          if (e.k !== "n" && e.k !== "e" && e.k !== "b") e.k = "n";
        }
      }
      if (bad) delete s.combatEnemies[nid];
    }

    // ★ 2026-11-27 P1b 索敌模式（幂等补字段，不升 STATE_VERSION）
    //   · 只认白名单六个 id；非法/未知一律删 key（回落 formation = 「按编队顺序」，1 代默认）
    //   · "formation" 是默认值，落盘的也删掉，存档里只留非默认模式
    //   · 不在这里判「有没有解锁」：解锁状态随编制变动，读档时必须纯幂等
    if (!s.combatTargeting || typeof s.combatTargeting !== "object") s.combatTargeting = {};
    const VALID_TARGET_MODES = {
      elite: 1, boss: 1, highest_damage: 1, lowest_hp: 1, highest_hp: 1,
    };
    for (const nid in s.combatTargeting) {
      if (!VALID_TARGET_MODES[s.combatTargeting[nid]]) delete s.combatTargeting[nid];
    }

    // ★ 2026-11-27 死亡空间（幂等补字段，不升 STATE_VERSION）
    //   · dsRuns: nodeId → {siteId,ticket,wave}；siteId 非法/波次越界 → 删（自动出本）
    //   · dsClears: siteId → 非负整数；dsTicketReserve 钳到 [0,99]
    //   · 成员 mode:"deathspace" 与 dsRuns 必须一致：无 run 的悬挂标记清掉，防幽灵锁定
    const DSD = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data.DeathSpace : null;
    if (!s.dsRuns || typeof s.dsRuns !== "object" || Array.isArray(s.dsRuns)) s.dsRuns = {};
    if (!s.dsClears || typeof s.dsClears !== "object" || Array.isArray(s.dsClears)) s.dsClears = {};
    s.dsTicketReserve = Math.max(0, Math.min(99, Math.round(Number(s.dsTicketReserve) || 0)));
    for (const nid in s.dsRuns) {
      const run = s.dsRuns[nid];
      const site = (DSD && DSD.byId) ? DSD.byId(run && run.siteId) : null;
      if (!run || !site || !(site.waves && site.waves.length)) { delete s.dsRuns[nid]; continue; }
      run.siteId = site.id;
      run.ticket = site.ticket;
      const w = Math.round(Number(run.wave) || 1);
      run.wave = Math.max(1, Math.min(site.waves.length, w));
    }
    for (const sid in s.dsClears) {
      let c = Math.floor(Number(s.dsClears[sid]) || 0);
      if (c <= 0 || (DSD && DSD.byId && !DSD.byId(sid))) delete s.dsClears[sid];
      else s.dsClears[sid] = c;
    }
    for (const m of (s.members || [])) {
      if (m.assignment && m.assignment.mode === "deathspace" && !s.dsRuns[m.assignment.nodeId]) {
        delete m.assignment.mode;
      }
    }
    if (!s.stats) s.stats = {};
    if (!s.stats.deathspace || typeof s.stats.deathspace !== "object") s.stats.deathspace = { clears: 0, waves: 0, lastSite: null };
    for (const k of ["clears", "waves"]) s.stats.deathspace[k] = Math.max(0, Math.floor(Number(s.stats.deathspace[k]) || 0));

    // ★ 2026-11-27 打捞臂主动打捞开关（1 代 settings.salvageArmActive）
    //   · 幂等：旧档没有就补 { active:false }；非对象整段重建；active 强制布尔
    //   · 不在这里判「队里有没有打捞臂」：装备会拆会换，读档必须纯幂等，
    //     引擎侧 hasArm() 每次结算现算（salvage.js:rollComponents 有 no_arm 提前退出）
    if (!s.salvage || typeof s.salvage !== "object" || Array.isArray(s.salvage)) s.salvage = { active: false };
    s.salvage.active = !!s.salvage.active;

    // ★ 2026-11-27 考古复刻 S2（幂等补字段，不升 STATE_VERSION）
    //   · 三个库存子对象按注册键白名单清洗：未知 key 删除、数量非正删除（防幽灵库存）
    //   · 不在这里判「有没有探针/解锁」：读档必须纯幂等，玩家读了档再决定
    //   · 旧档没有 state.archaeology → 全零库存 = 探针缺货停摆（用户拍板 1 代原样）
    const AC = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data.ArchaeologyContent : null;
    if (!s.archaeology || typeof s.archaeology !== "object" || Array.isArray(s.archaeology)) {
      s.archaeology = {};
    }
    const A = s.archaeology;
    const validKeys = (kind) => {
      const table = !AC ? null : (kind === "probes" ? AC.PROBES : kind === "artifacts" ? AC.ARTIFACTS : null);
      if (!table) return null;
      const out = {};
      for (const it of table) out[it.id] = 1;
      return out;
    };
    function cleanInv(obj, kind) {
      const allow = validKeys(kind);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
      const out = {};
      for (const k in obj) {
        if (allow && !allow[k]) continue;
        const q = Math.floor(Number(obj[k]) || 0);
        if (q > 0 && isFinite(q)) out[k] = q;
      }
      return out;
    }
    A.probes = cleanInv(A.probes, "probes");
    A.artifacts = cleanInv(A.artifacts, "artifacts");
    if (!A.vouchers || typeof A.vouchers !== "object" || Array.isArray(A.vouchers)) A.vouchers = {};
    for (const k in A.vouchers) {
      if (!AC || !AC.VOUCHERS[k]) delete A.vouchers[k];
      else A.vouchers[k] = 1;                 // 唯一凭证，只认 1
    }
    if (!A.protocols || typeof A.protocols !== "object" || Array.isArray(A.protocols)) A.protocols = {};
    A.protocols.autosell = !!A.protocols.autosell;
    A.protocols.autoconv = !!A.protocols.autoconv;
    // 手动探针选择：非法 id 删掉，交给引擎 selectedProbeOf 自动回退（不升 STATE_VERSION）
    if (typeof A.selectedProbe === "string" && (!AC || !AC.probeById || !AC.probeById(A.selectedProbe))) delete A.selectedProbe;
    else if (typeof A.selectedProbe !== "string") delete A.selectedProbe;
    const rem = Number(A.probeSavingRemainder);
    A.probeSavingRemainder = (isFinite(rem) && rem > 0) ? (rem - Math.floor(rem)) : 0;

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
      // 布局改版硬门槛（STATE_VERSION 10，2026-11-28 径向分层）：
      // 旧 4×3 阵列的星图没有 region.ring，坐标/域归属/燃料无法平移到新布局，只能作废重开。
      // 本地档靠 SAVE_KEY 换名（v8→v9）已经挡掉；这里再挡云端存档、存档码导入、外部夹具等旁路。
      const _regs = (s.starMap && s.starMap.regions) || [];
      if (!_regs.length || _regs.some(r => r.ring == null)) return null;
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
