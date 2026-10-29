// ================================================================
// 深空星疆 —— Engine.State：初始状态 schema（§9 状态模型）
// 单一真相源。无 DOM 依赖（Node 探针可 require）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Engine = window.NSK.Engine || {};
    window.NSK.Engine.State = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Engine = root.NSK.Engine || {};
    root.NSK.Engine.State = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 战斗小队默认结构（复用 EVE-IDLE legion-combat-squad.createDefaultSquad 约定）：
  //   enabled / members[](成员 id) / capacity(容量，由 base.squadTier 升级解锁 1→2→3) / targetId(出击星系)。
  //   成员仅存引用 id；权威战斗状态在 member 本体（status/assignment/destroyed）。
  function createDefaultSquad() {
    return { enabled: false, members: [], capacity: 1, targetId: null };
  }

  function defaultState(now, Data) {
    const rng = (window.NSK.Core.makeRng)((Math.random() * 4294967296) >>> 0);
    const map = Data.StarMap.generateStarMap(rng);   // 固定 207 节点全量星图

    // 起始 6 名成员（名册上限 20，见 §13/§14）
    const members = [];
    for (let i = 0; i < 6; i++) {
      members.push(makeMember(Data, rng, "node_0"));
    }

    // 势力任务板（每势力 1 个初始任务）
    const factions = Data.Factions.FACTIONS.map(f => ({
      id: f.id,
      relation: 0,
      quests: [Data.Factions.generateQuest(rng, f, 1)],
      nextRefreshAt: now + 6 * 3600 * 1000, // 6 小时后刷新
    }));
    const baseIdentity = Data.Ships.createInitialBase();

    return {
      version: 8,
      createdAt: now,
      lastSeen: now,
      rngSeed: (Math.random() * 4294967296) >>> 0,
      legionName: "深空星疆军团",
      res: Data.Resources.startingResources(),
      base: Object.assign(baseIdentity, {
        nodeId: map.startId,
        fuel: 100,
        fuelMax: 200,
        bodyLevel: 0,          // 0=空间站(Lv1 本体)，见 ships.BODY_LEVELS
        squadTier: 0,          // 小队协议等级（0/1/2）：容量 = 1 + squadTier，升级解锁双人/三人小队
        industry: { smeltQueue: [], manufactureQueue: [], inventQueue: [], buildQueue: [] },
        boosters: [],          // 增强剂（整舱生效）：[{type, level, expiresAt}]，见 engine/booster.js
      }),
      starMap: map,
      members: members,
      squad: createDefaultSquad(),   // 玩家自行组建的剿匪小队（持久状态）
      ships: [],               // {id, shipId, name, status:'idle'|'mission', nodeId}
      factions: factions,
      reports: [
        { ts: now, title: "序章 · 拓荒启航", lines: [
          "边疆拓荒协议已激活，唯一舰基核心「" + baseIdentity.coreId + "」上线运行。",
          "居住舱完成部署，首批人口容量已开放（名册上限 20）；成员名册就绪。",
          "可派遣成员采矿 / 勘探，或在行星部署采集装置持续产出（回星系回收）；母舰精炼与总装已可运转。",
          "升级舰基核心可解锁更大电网、更多工业槽与更高级舰种。",
        ] },
      ],             // [{ts, title, lines:[str]}] 最多 30
      logistics: { compensation: 0 },  // 物流补偿（pp），由 logistics 岗累积，软顶见 Logistics.COMP_CAP
      sites: {},                       // 行星采集设施（EVE 式收菜）：bodyId → {nodeId, level, buffer}，见 engine/sites.js
      mastery: { points: 0, earned: 0, spent: 0, nodes: {} }, // 精通点与全局强化（见 engine/mastery.js）
      pendingEvents: [],               // 待决事件（含 options / chain）→ 玩家在「日报」页决策
      counters: { builtShips: 0, doneJobs: 0, recruited: 6, delivered: 0 },
    };
  }

  // 技能 = 轻量化复用 EVE-IDLE 玩家技能树（采集 / 工业 / 战斗攻击 / 战斗防御 四类），共 10 项。
  // 战斗攻击拆为 combatLaser/combatTurret/command（EVE-IDLE 实测三键，导弹类归 command）；
  // 勘探拆为 scanning（探针/破解）+ archaeology（遗迹，新增）。无 NPC 等级；技能等级无上限。
  const SKILL_KEYS = ["mining", "scanning", "archaeology", "refine", "manufacture", "invent", "combatLaser", "combatTurret", "command", "defense"];
  function freshSkills() {
    return { mining: 0, scanning: 0, archaeology: 0, refine: 0, manufacture: 0, invent: 0, combatLaser: 0, combatTurret: 0, command: 0, defense: 0 };
  }

  // 招募来源池：9 星域 + 3 势力 + 人才市场
  function originPool(Data) {
    const regions = (Data.StarMap.REGION_DEFS || []).map(r => r.name);
    const factions = (Data.Factions.FACTIONS || []).map(f => f.name);
    return regions.concat(factions).concat(["人才市场"]);
  }

  // RimWorld 式 passion 分配：Major 1~2 / Minor 2~3 / 其余 None（经验倍率 0.35/1.0/1.5）
  function rollPassion(rng) {
    const keys = SKILL_KEYS.slice();
    for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = keys[i]; keys[i] = keys[j]; keys[j] = t; }
    const nMajor = 1 + Math.floor(rng() * 2);  // 1~2
    const nMinor = 2 + Math.floor(rng() * 2);  // 2~3
    const p = {};
    keys.forEach((k, i) => { p[k] = i < nMajor ? "major" : i < nMajor + nMinor ? "minor" : "none"; });
    return p;
  }

  // 初始经验种子：让成员一出场就有可见等级差异（major 高 / minor 中 / none 低）
  function seedSkills(rng, passion) {
    const sk = freshSkills();
    for (const k of SKILL_KEYS) {
      const pf = passion[k];
      const base = pf === "major" ? 250 + rng() * 550 : pf === "minor" ? 80 + rng() * 220 : rng() * 40;
      sk[k] = Math.round(base);
    }
    return sk;
  }

  // ============================================================
  // 招募技能钳制（2026-10-27 周六，F 决策：生成后 clamp，保 major 专精）
  //   · 单项等级 ≤ 10，十项等级总和 ≤ 30 —— 防止新候选一出场就碾压老成员；
  //   · 削减顺序：none → minor → major（同优先级取当前等级最高者），
  //     即优先砍「无关技能」，尽量保住 major 的专精手感；
  //   · 等级曲线与 Engine.Settle.levelOf 同一闭式（此处本地实现，避免 state ↔ settle 依赖）。
  // ============================================================
  const SKILL_LEVEL_CAP = 10;
  const SKILL_LEVEL_SUM_CAP = 30;
  const SKILL_MIN_LEVEL = 1;

  // 与 Settle.levelOf 一致：levelOf(xp) = 1 + floor(log(x/1000 + 1)/log(1.1))
  function skillLevel(xp) {
    const x = Number(xp) || 0;
    if (x <= 0) return 1;
    return 1 + Math.floor(Math.log(x / 1000 + 1) / Math.log(1.1));
  }
  // 达到某等级所需的最低 xp（累计），用于把等级写回经验累加器
  function xpAtLevel(lv) {
    if (lv <= 1) return 0;
    return Math.ceil(1000 * (Math.pow(1.1, lv - 1) - 1));
  }
  function clampSkills(skills, passion) {
    if (!skills) return skills;
    const lv = {};
    for (const k of SKILL_KEYS) lv[k] = skillLevel(skills[k]);
    // 1) 单项封顶
    for (const k of SKILL_KEYS) if (lv[k] > SKILL_LEVEL_CAP) lv[k] = SKILL_LEVEL_CAP;
    // 2) 总和封顶（逐级削减，保 major）
    const rank = k => (passion && passion[k] === "major") ? 2 : (passion && passion[k] === "minor") ? 1 : 0;
    let guard = 0;
    const sum = () => SKILL_KEYS.reduce((a, k) => a + lv[k], 0);
    while (sum() > SKILL_LEVEL_SUM_CAP && guard++ < 500) {
      let pick = null;
      for (const k of SKILL_KEYS) {
        if (lv[k] <= SKILL_MIN_LEVEL) continue;
        if (!pick) { pick = k; continue; }
        if (rank(k) < rank(pick) || (rank(k) === rank(pick) && lv[k] > lv[pick])) pick = k;
      }
      if (!pick) break; // 全在最低等级仍超（理论不可能：10×1=10 ≤ 30）
      lv[pick] -= 1;
    }
    for (const k of SKILL_KEYS) skills[k] = xpAtLevel(lv[k]);
    return skills;
  }

  // ============================================================
  // 经历词条系统（RimWorld 式 出身/经历 双槽，2026-10-15 落地）
  // 出身 childhood：纯人设文案 + 可选 forcePassion（强制某技能专精，RimWorld 童年背景手感）。
  // 经历 adulthood：带一个「词条 trait」，trait.effects = 类型化 O(1) 修正（乘子/加值），
  //   结算热路径只乘预聚合成 member.mods，绝不遍历词条 → 不踩 §14.5 红线。
  // effects schema（穷举，便于 §14.6 守卫静态校验）：
  //   xpMult:{skillKey:mult}        某技能经验 ×mult（"all" 展开到 10 技能）
  //   yieldMult:{activity:mult}      某工作产出 ×mult（mine/combat/...）
  //   creditMult:{activity:mult}     某活动星币 ×mult
  //   learnMult:number               全局学习速度 ×mult（叠到 passion 上）
  //   startXp:{skillKey:amount}       一次性初始经验加值（生成时撒入，不进 mods）
  // ============================================================
  const EMPTY_MODS = { xpMult: {}, yieldMult: {}, creditMult: {}, learnMult: 1 };

  // 出身（childhood）绑定势力亲和（用户 2026-10-15 要求）：特定出身绑特定势力，也有不绑的。
  // factionAffinity = 势力 id（angel/blood/sansha）或 null（无亲和）。
  // affinity = 该势力任务的加成（预聚合，O(1)）：
  //   repMult/creditMult → 缴纳该势力任务时声望/收入倍率；urgentSuccess → 该势力突发任务成功率加值。
  const A_NEUTRAL = { repMult: 1, creditMult: 1, urgentSuccess: 0 };
  const A_BONDED = { repMult: 1.15, creditMult: 1.15, urgentSuccess: 0.2 };
  const BACKSTORY_DEFS = [
    { id: "orphan_void", title: "虚空孤儿", desc: "在废弃空间站长大，靠 scavenge 维生。", forcePassion: "scanning", factionAffinity: "sansha", affinity: A_BONDED },
    { id: "fleet_brat", title: "舰队子弟", desc: "将门之后，从小泡在舰桥。", forcePassion: "command", factionAffinity: "blood", affinity: A_BONDED },
    { id: "belt_nomad", title: "小行星带游牧", desc: "逐矿而居的流浪采矿家族。", forcePassion: "mining", factionAffinity: "angel", affinity: A_BONDED },
    { id: "station_rat", title: "空间站鼠辈", desc: "在船坞缝隙里偷学了一手装配。", forcePassion: "manufacture", factionAffinity: "sansha", affinity: A_BONDED },
    { id: "relic_kid", title: "遗迹猎人之后", desc: "父辈以倒卖先驱遗物为生。", forcePassion: "archaeology", factionAffinity: "angel", affinity: A_BONDED },
    { id: "corp_heir", title: "财团继承人", desc: "被家族放逐的旁支，识得市道。", forcePassion: "invent", factionAffinity: null, affinity: A_NEUTRAL },
    { id: "defector", title: "叛逃者", desc: "从某势力舰队叛出，懂自保。", forcePassion: "defense", factionAffinity: "blood", affinity: A_BONDED },
    { id: "signal_orphan", title: "信号弃儿", desc: "在干扰带里长大的监听天才。", forcePassion: "scanning", factionAffinity: null, affinity: A_NEUTRAL },
    // —— 2026-10-22 补 7 个出身：覆盖余下技能(refine/combatLaser/combatTurret) + 新建 6 家中型势力亲和 ——
    { id: "smelter_apprentice", title: "冶炼学徒", desc: "在矿冶殖民星的炉火边长大，闻得懂合金味。", forcePassion: "refine", factionAffinity: "mining_guild", affinity: A_BONDED },
    { id: "salvage_waif", title: "拾荒遗孤", desc: "在残骸带长大的拆解童子，什么破烂都能拼回原型。", forcePassion: "manufacture", factionAffinity: "salvage_union", affinity: A_BONDED },
    { id: "gas_drifter", title: "气井游商", desc: "跟着气态巨行星的勘探船跑单帮，识得湍流里的门道。", forcePassion: "scanning", factionAffinity: "lone_star", affinity: A_BONDED },
    { id: "abyss_acolyte", title: "深空研习生", desc: "研究院附属学校的优等生，泡在先驱造物数据库里。", forcePassion: "archaeology", factionAffinity: "abyssal_inst", affinity: A_BONDED },
    { id: "bounty_foundling", title: "赏金猎徒", desc: "在悬赏船上长大的孩子，炮塔比摇篮还熟。", forcePassion: "combatTurret", factionAffinity: "bounty_league", affinity: A_BONDED },
    { id: "settler_scion", title: "拓殖农裔", desc: "边境拓殖星的第二代，从小跟着开矿拓荒。", forcePassion: "mining", factionAffinity: "settlers", affinity: A_BONDED },
    { id: "turret_child", title: "激光炮手之子", desc: "舰队炮战学校的子弟，激光校准刻进肌肉记忆。", forcePassion: "combatLaser", factionAffinity: "blood", affinity: A_BONDED },
  ];

  const TRAIT_DEFS = [
    { id: "vet_gunner", title: "退役舰队炮手", desc: "曾在巡逻线打满服役期，炮台手感极佳。", trait: { id: "vet_gunner", name: "炮台专精", desc: "炮台经验 ×1.3", effects: { xpMult: { combatTurret: 1.3 } } } },
    { id: "vein_guide", title: "矿脉向导", desc: "能凭岩层纹路预判富集矿囊。", trait: { id: "vein_guide", name: "矿脉直觉", desc: "采矿产出 ×1.15", effects: { yieldMult: { mine: 1.15 } } } },
    { id: "fast_learner", title: "速学者", desc: "记性奇好，干啥都上手快。", trait: { id: "fast_learner", name: "速学", desc: "全局学习 ×1.25", effects: { learnMult: 1.25 } } },
    { id: "ghost_signals", title: "幽灵信号员", desc: "擅长从噪声里抠出异常信号。", trait: { id: "ghost_signals", name: "信号敏感", desc: "扫描经验 ×1.3", effects: { xpMult: { scanning: 1.3 } } } },
    { id: "relic_fanatic", title: "残骸考古迷", desc: "对先驱造物有病态执着。", trait: { id: "relic_fanatic", name: "考古底子", desc: "考古初始经验 +200", effects: { startXp: { archaeology: 200 } } } },
    { id: "iron_wall", title: "铁壁护卫", desc: "几次死里逃生，深知怎么扛。", trait: { id: "iron_wall", name: "铁壁", desc: "防御经验 ×1.3", effects: { xpMult: { defense: 1.3 } } } },
    { id: "black_broker", title: "黑市掮客", desc: "战场缴获总能卖出好价。", trait: { id: "black_broker", name: "销赃能手", desc: "战斗星币 ×1.2", effects: { creditMult: { combat: 1.2 } } } },
    { id: "war_surgeon", title: "战地医师", desc: "在交火中学会保人保己。", trait: { id: "war_surgeon", name: "战术素养", desc: "指挥经验 ×1.2 · 战斗星币 ×1.1", effects: { xpMult: { command: 1.2 }, creditMult: { combat: 1.1 } } } },
    { id: "deep_diver", title: "深空潜行者", desc: "长的航时里专啃遗迹。", trait: { id: "deep_diver", name: "遗迹嗅觉", desc: "考古经验 ×1.3", effects: { xpMult: { archaeology: 1.3 } } } },
    { id: "forge_master", title: "冶炼宗师", desc: "摸过半条船的炉子。", trait: { id: "forge_master", name: "冶炼宗师", desc: "冶炼经验 ×1.3", effects: { xpMult: { refine: 1.3 } } } },
    { id: "assembly_ace", title: "装配能手", desc: "闭眼能装出整船部件。", trait: { id: "assembly_ace", name: "装配能手", desc: "制造经验 ×1.3", effects: { xpMult: { manufacture: 1.3 } } } },
    { id: "inventor_wind", title: "发明奇才", desc: "拆解样机常有顿悟。", trait: { id: "inventor_wind", name: "发明奇才", desc: "发明经验 ×1.3", effects: { xpMult: { invent: 1.3 } } } },
    // —— 2026-10-23 增补：义体改造词条（用户要求「加进词条 + 生图需求」）——
    { id: "aug_eye", title: "义眼", desc: "视觉增强义体，机械光学替代原生眼球。", tbd: true, trait: { id: "aug_eye", name: "义眼", desc: "义体·视觉增强（效果待定）", effects: {} } },
    { id: "aug_limb", title: "义肢", desc: "动力/外骨骼义体，替代原生肢体。", tbd: true, trait: { id: "aug_limb", name: "义肢", desc: "义体·肢体增强（效果待定）", effects: {} } },
    // —— 2026-10-23 增补：环世界（RimWorld）可借鉴词条，仅录入中文名，具体效果待定 ——
    { id: "rw_tough", title: "硬骨头", desc: "RimWorld Tough：减伤方向（效果待定）。", tbd: true, trait: { id: "rw_tough", name: "硬骨头", desc: "减伤向（待定）", effects: {} } },
    { id: "rw_industrious", title: "勤务标兵", desc: "RimWorld Industrious：工作速度 +（效果待定）。", tbd: true, trait: { id: "rw_industrious", name: "勤务标兵", desc: "工作速度 +（待定）", effects: {} } },
    { id: "rw_hardworker", title: "勤恳", desc: "RimWorld Hard Worker：工作速度 +（效果待定）。", tbd: true, trait: { id: "rw_hardworker", name: "勤恳", desc: "工作速度 +（待定）", effects: {} } },
    { id: "rw_jogger", title: "疾行", desc: "RimWorld Jogger：移动速度 +（效果待定）。", tbd: true, trait: { id: "rw_jogger", name: "疾行", desc: "移动速度 +（待定）", effects: {} } },
    { id: "rw_fastwalker", title: "快步", desc: "RimWorld Fast Walker：移动速度 +（效果待定）。", tbd: true, trait: { id: "rw_fastwalker", name: "快步", desc: "移动速度 +（待定）", effects: {} } },
    { id: "rw_carefulshooter", title: "稳枪手", desc: "RimWorld Careful Shooter：精度↑射速↓（效果待定）。", tbd: true, trait: { id: "rw_carefulshooter", name: "稳枪手", desc: "精度↑射速↓（待定）", effects: {} } },
    { id: "rw_triggerhappy", title: "连射狂", desc: "RimWorld Trigger-happy：射速↑精度↓（效果待定）。", tbd: true, trait: { id: "rw_triggerhappy", name: "连射狂", desc: "射速↑精度↓（待定）", effects: {} } },
    { id: "rw_sanguine", title: "乐天派", desc: "RimWorld Sanguine：心情 +（效果待定）。", tbd: true, trait: { id: "rw_sanguine", name: "乐天派", desc: "心情 +（待定）", effects: {} } },
    { id: "rw_optimist", title: "乐观", desc: "RimWorld Optimist：心情 +（效果待定）。", tbd: true, trait: { id: "rw_optimist", name: "乐观", desc: "心情 +（待定）", effects: {} } },
    { id: "rw_pessimist", title: "悲观", desc: "RimWorld Pessimist：心情 −（效果待定）。", tbd: true, trait: { id: "rw_pessimist", name: "悲观", desc: "心情 −（待定）", effects: {} } },
    { id: "rw_depressive", title: "抑郁", desc: "RimWorld Depressive：心情 −（效果待定）。", tbd: true, trait: { id: "rw_depressive", name: "抑郁", desc: "心情 −（待定）", effects: {} } },
    { id: "rw_ironwilled", title: "铁意志", desc: "RimWorld Iron-willed：精神阈值 −（效果待定）。", tbd: true, trait: { id: "rw_ironwilled", name: "铁意志", desc: "精神阈值 −（待定）", effects: {} } },
    { id: "rw_steadfast", title: "坚毅", desc: "RimWorld Steadfast：精神阈值 −（效果待定）。", tbd: true, trait: { id: "rw_steadfast", name: "坚毅", desc: "精神阈值 −（待定）", effects: {} } },
    { id: "rw_kind", title: "亲和", desc: "RimWorld Kind：社交 +（效果待定）。", tbd: true, trait: { id: "rw_kind", name: "亲和", desc: "社交 +（待定）", effects: {} } },
    { id: "rw_abrasive", title: "刻薄", desc: "RimWorld Abrasive：社交 −（效果待定）。", tbd: true, trait: { id: "rw_abrasive", name: "刻薄", desc: "社交 −（待定）", effects: {} } },
    { id: "rw_beautiful", title: "俊美", desc: "RimWorld Beautiful：外貌/魅惑 +（效果待定）。", tbd: true, trait: { id: "rw_beautiful", name: "俊美", desc: "魅惑 +（待定）", effects: {} } },
    { id: "rw_bloodlust", title: "嗜血", desc: "RimWorld Bloodlust：杀戮无罚/战斗增益（效果待定）。", tbd: true, trait: { id: "rw_bloodlust", name: "嗜血", desc: "战斗增益（待定）", effects: {} } },
    { id: "rw_psychopath", title: "冷血", desc: "RimWorld Psychopath：无情绪成本（效果待定）。", tbd: true, trait: { id: "rw_psychopath", name: "冷血", desc: "无情绪成本（待定）", effects: {} } },
    { id: "rw_bodymodder", title: "躯体改造狂热者", desc: "RimWorld Body Modder：装义体 +buff（效果待定）。", tbd: true, trait: { id: "rw_bodymodder", name: "躯体改造狂热者", desc: "义体 +buff（待定）", effects: {} } },
    { id: "rw_bodypurist", title: "躯体纯粹主义者", desc: "RimWorld Body Purist：装义体 −buff（效果待定）。", tbd: true, trait: { id: "rw_bodypurist", name: "躯体纯粹主义者", desc: "义体 −buff（待定）", effects: {} } },
    { id: "rw_nimble", title: "灵巧", desc: "RimWorld Nimble：闪避/近战（效果待定）。", tbd: true, trait: { id: "rw_nimble", name: "灵巧", desc: "闪避/近战（待定）", effects: {} } },
  ];

  // 把 trait.effects 预聚合成 settle 热路径只读的 mods（O(1)，生成时算一次）
  function compileMods(trait) {
    const e = (trait && trait.effects) || {};
    const xp = {};
    if (e.xpMult) {
      for (const k in e.xpMult) {
        if (k === "all") { for (const s of SKILL_KEYS) xp[s] = (xp[s] || 1) * e.xpMult.all; }
        else xp[k] = (xp[k] || 1) * e.xpMult[k];
      }
    }
    return { xpMult: xp, yieldMult: Object.assign({}, e.yieldMult || {}), creditMult: Object.assign({}, e.creditMult || {}), learnMult: e.learnMult || 1 };
  }

  // 抽 出身(童年) + 经历(成年，带词条)；childhood 可能强制某技能 passion 为 major
  function rollBackstory(rng) {
    const childhood = BACKSTORY_DEFS[Math.floor(rng() * BACKSTORY_DEFS.length)];
    // 2026-10-23：tbd 词条（环世界候选 / 义体改造）效果未定前不参与随机；定效果后即可进入随机池
    const pool = TRAIT_DEFS.filter(t => !t.tbd);
    const adulthood = pool[Math.floor(rng() * pool.length)];
    return { childhood: childhood, adulthood: adulthood };
  }

  function makeMember(Data, rng, nodeId) {
    const pid = Data.Names.PERSONALITIES[Math.floor(rng() * Data.Names.PERSONALITIES.length)].id;
    const pool = originPool(Data);
    const origin = pool[Math.floor(rng() * pool.length)];
    const passion = rollPassion(rng);
    // 抽经历（RimWorld 式 出身+经历 双槽）
      const bs = rollBackstory(rng);
      if (bs.childhood && bs.childhood.forcePassion) passion[bs.childhood.forcePassion] = "major";
      const affinity = (bs.childhood && bs.childhood.affinity) || { repMult: 1, creditMult: 1, urgentSuccess: 0 };
      const skills = seedSkills(rng, passion);
    // 词条一次性初始经验加值（startXp，生成时撒入，不进 mods）
    const te = bs.adulthood && bs.adulthood.trait && bs.adulthood.trait.effects;
    if (te && te.startXp) { for (const k in te.startXp) skills[k] = (skills[k] || 0) + te.startXp[k]; }
    // 招募钳制（F 决策，2026-10-27）：单项≤10 / 总和≤30，生成后 clamp 且保 major 专精
    clampSkills(skills, passion);
    const mods = compileMods(bs.adulthood ? bs.adulthood.trait : null);
    mods.goalXp = 1; // 人生目的全局经验乘区（O(1)，由 Engine.Npc 累乘 done 目的）
    // 人生目的系统（设计草案 ⑤）：入职确定性抽 3 个目的
    const Npc = (typeof window !== "undefined" && window.NSK && window.NSK.Engine && window.NSK.Engine.Npc) || null;
    const goals = Npc ? Npc.rollGoals(rng) : [];
    // 初始舰船：多数启程级，约 1/3 星矛级（绑定舰船 → hp 上限来自舰船）
    const shipId = rng() < 0.34 ? "destroyer" : "frigate";
    const hp = Data.Ships.maxHp(shipId);
    return {
      id: "m_" + Date.now().toString(36) + "_" + Math.floor(rng() * 1e6).toString(36),
      name: Data.Names.makeName(rng),
      personalityId: pid,
      origin: origin,                               // 招募来源（星域/势力/人才市场）
      skills: skills,                              // 经验累加器（升级通道）
      passion: passion,                            // RimWorld 式学习偏好（只加速成长）
      backstory: bs,                               // { childhood, adulthood } RimWorld 式双槽
      factionAffinity: (bs.childhood && bs.childhood.factionAffinity) || null, // 出身绑定势力（突发任务+成功率/缴纳+声望收入）
      affinity: affinity,                          // 预聚合势力任务加成（O(1)）
      trait: bs.adulthood ? bs.adulthood.trait : null, // 经历词条（机械修正）
      mods: mods,                                  // 预聚合修正（settle 热路径只读，O(1)）
      assignment: null,                            // {type, nodeId, startedAt} 见 dispatch
      status: "idle",                              // idle | dispatched | traveling | repairing
      shipId: shipId,                              // 绑定舰船（EVE-IDLE 解耦名）
      hp: { shield: hp.shield, armor: hp.armor, structure: hp.structure }, // 上限 = 舰船三防
      destroyed: false,
      wage: 0,                                     // 星币/周期（初值占位，平衡数值待定）
      merit: 0,                                    // 个人功勋（晋升/薪资档，映射待定）
      milestones: [],                              // 行为里程碑（称号/勋章 id 列表，见 Engine.Npc.MILESTONES）
      repUntil: 0,
      memoryTags: [],
      goals: goals,                                // 人生目的（设计草案 ⑤）：[{type,target,targetName,targetTier,reward,done}]
    };
  }

  // 招募一名新成员（名册 < 20）。cost 暂为 0（经济平衡待架构跑通后标定）
  function recruitMember(state, Data, rng) {
    if (state.members.length >= 20) return { ok: false, err: "名册已满（20）" };
    const m = makeMember(Data, rng, state.base.nodeId);
    state.members.push(m);
    state.counters.recruited = (state.counters.recruited || 0) + 1;
    return { ok: true, member: m };
  }

  // 解雇一名成员：必须同步清理三处对成员的引用，否则结算/战斗会悬空崩。
  // 1) assignment（若有派遣，先 recall 取消，避免悬挂任务）2) 战斗小队 members 里的 id 引用 3) members 数组本体。
  // destroyed（已阵亡）成员也允许解雇，用于清理名册。
  function fireMember(state, id) {
    if (!state || !state.members) return { ok: false, err: "state" };
    const idx = state.members.findIndex(m => m.id === id);
    if (idx < 0) return { ok: false, err: "not-found" };
    const m = state.members[idx];
    // 1) 取消派遣（Dispatch.recall 对 destroyed 也安全：仅置 assignment=null/status=idle）
    const Dispatch = (typeof window !== "undefined" && window.NSK && window.NSK.Engine && window.NSK.Engine.Dispatch) || null;
    if (Dispatch && m.assignment) Dispatch.recall(state, id);
    // 2) 从战斗小队移除 id 引用（squad.members 仅存 id，权威状态在 member 本体）
    if (state.squad && Array.isArray(state.squad.members)) {
      const si = state.squad.members.indexOf(id);
      if (si >= 0) state.squad.members.splice(si, 1);
    }
    // 3) 从名册移除
    state.members.splice(idx, 1);
    if (state.counters) state.counters.fired = (state.counters.fired || 0) + 1;
    return { ok: true, member: m };
  }

  return {
    defaultState, freshSkills, makeMember, recruitMember, fireMember, createDefaultSquad, EMPTY_MODS, BACKSTORY_DEFS, TRAIT_DEFS,
    SKILL_KEYS, SKILL_LEVEL_CAP, SKILL_LEVEL_SUM_CAP, clampSkills, skillLevel, xpAtLevel,
  };
});
