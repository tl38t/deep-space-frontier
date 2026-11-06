// ================================================================
// 深空星疆 —— Engine.Combat：齐射战斗内核
// ----------------------------------------------------------------
// ⚠️ 铁则：能复用 1 代就复用，禁止自创战斗机制。
//
// 伤害 100% 来自装配的武器。没有武器 = 没有伤害（1 代同规则）。
//   2026-10-31 修正：此前有一个自创的「本能输出」（技能直接产生伤害、
//   不吃弹、不需武器），它只是 Phase 2-A 时没有武器数据可读留下的占位，
//   造成「武器只占一成伤害、弹药系统形同虚设」。已整段删除。
//
// 公式全部照搬 1 代 js/systems/combat.js：
//   命中率   hit^1.4 / (hit^1.4 + dodge^1.4)          ← calcCombatDamage
//   伤害浮动 0.90 + (r1+r2)*0.10                        ← calcCombatDamageVariance
//   克制     目标当前最外层对应武器 ×1.25，其余 ×1.0    ← calcWeaponCounterMultiplier
//   维修器   每轮恢复 amount 点绝对值（不乘任何系数）    ← kind:"repair" 的 amount
//   敌舰     hp/hit/dodge/baseDamage 全部 1 代原值      ← data/pirates.js
//
// 唯一真相 = 血量。我方伤害打敌方编队血量，编队血空即清场 → 结算掉落 → 下一队进场。
//
// 两条推进路径，共用同一个状态量 state.combatWaveHp[nodeId]（已打进的伤害）：
//   · 焦点战场（玩家正看着的节点）：逐轮真掷骰（命中/伤害浮动），1 轮 = ROUND_SEC 秒
//   · 非焦点 / 离线 / 大 dt：事件驱动分段闭式（按「换层」「弹尽」切段，最多 6 段）
//   两条路径读写同一个 waveHp 累加器，所以切页签不会白打，也不会重复结算。
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

  // ---- 常量 ----
  // 掉落基数：星币经济是深空星疆自己标定的（1 代 isk 与本作星币不等价），
  //   故掉落沿用本作口径，不搬 1 代 iskDrop 绝对值；敌舰 iskDrop 仅作 UI 展示参考。
  const DROP_CREDIT_BASE = 6;    // 每波每参战成员的基础星币掉落
  const DROP_REP_BASE = 1;       // 每波每参战成员的基础声望掉落
  // 以下四项为 1 代原式（见文件头），不是标定值：
  const COUNTER_MULT = 1.25;     // 1 代 calcWeaponCounterMultiplier：克制层 ×1.25
  const HIT_EXP = 1.4;           // 1 代 calcCombatDamage：hit^1.4 / (hit^1.4 + dodge^1.4)
  const DMG_VAR_MIN = 0.90;      // 1 代 calcCombatDamageVariance：0.90 + (r1+r2)*0.10
  const DMG_VAR_SPAN = 0.20;     // 浮动区间宽度（三角分布）
  // 以下为防溢出安全阀（不是数值标定，是保证不出负数/无敌）：
  const REPAIR_CAP = 0.50;       // 维修最多抵消敌方火力的比例
  const DMG_RED_CAP = 0.60;      // 损伤控制减伤总上限
  // ★ 时基：一轮 = 几秒。这是全文件唯一的时间刻度，改它等于整体时间膨胀。
  //   1 代 = setInterval(runScheduledGameTick, 1000) 每秒一回合（js/core/tick.js:172 → combatTick）。
  //   本作按「放慢到 1 代 1/3 节奏」的要求改成 3 秒一轮：
  //   单发伤害 / 命中 / 克制 / 浮动 / 维修绝对值 / 每轮弹耗 全部照 1 代原值一字不动，
  //   只是「一秒里能开几轮」变成 1/3 ⇒ 一波耗时 ×3、双方火力/秒 ÷3、弹耗/秒 ÷3、每波收益不变。
  //   ⚠️ 想再调快慢只改这一个数，不要另外乘任何伤害系数（那会同时改掉弹药经济）。
  const ROUND_SEC = 3;
  const SIM_MAX_ROUNDS = 2;      // 焦点仿真单 tick 最多掷几轮（成本封顶，与秒数无关）
  const SIM_MAX_SEC = ROUND_SEC * SIM_MAX_ROUNDS;   // = 6s；dt 超过它就退回闭式，保证成本恒定
  // 闭式分段的 guard 上限：3 层推进 + 1 次整波跳 + 3 层推进 + 3 次弹尽 = 10，取 14 留余量。
  // 这个常数是「O(1) 与 dt 无关」的硬保证，不要按 dt 调大。
  const SEG_GUARD = 14;

  const AMMO_TYPES = ["laser", "missile", "cannon"];
  const AMMO_OF = { laser: "ammo_laser", missile: "ammo_missile", cannon: "ammo_cannon" };
  const AMMO_CN = { laser: "聚能弹药", missile: "制导弹药", cannon: "射弹装药" };
  // 三防克制：激光打盾、导弹破甲、射弹拆结构（1 代 WEAPON_CONFIG.counterType）
  const COUNTER_OF = { laser: "shield", missile: "armor", cannon: "structure" };
  const LAYER_ORDER = ["shield", "armor", "structure"];

  function _Data() { return (typeof window !== "undefined" && window.NSK) ? window.NSK.Data : null; }
  function _Settle() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Settle : null; }
  function _Arch() { return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Archaeology : null; }
  function _Pirates() {
    const D = _Data();
    return (D && D.Pirates) ? D.Pirates : null;
  }
  function _Eq() {
    const D = _Data();
    return (D && D.Equipment) ? D.Equipment : null;
  }

  // ---- 据点编制（不是战斗公式）----
  // ⚠️ 2026-11-01 清理：删除 squadPower / squadPowerAtNode / resolveSquad（自创「战斗力标量」），
  //    并删除 getSquadCapacity / canJoinSquad（配合 state.squad 一起退役）。
  //    编制上限现在是科技解锁的：Engine.Tech.squadCapacity(state) = 1 + 已研究「战斗编制」级数。
  //    门禁真正生效的地方在 Engine.Dispatch.assign（唯一的派遣入口），不在这里。
  function squadCapacity(state) {
    const Tech = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Tech : null;
    return Tech ? Tech.squadCapacity(state) : 1;
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

  // ---- 1 代战斗公式（逐字照搬 js/systems/combat.js，禁止改写）----

  // 命中系数：hit^1.4 / (hit^1.4 + dodge^1.4)   ← 1 代 calcCombatDamage
  function hitCoeff(hit, dodge) {
    const hp = Math.pow(Math.max(1, hit), HIT_EXP);
    const dp = Math.pow(Math.max(0, dodge), HIT_EXP);
    return hp / (hp + dp);
  }

  // 伤害浮动 0.90 + (r1+r2)*0.10   ← 1 代 calcCombatDamageVariance
  function damageVariance() {
    return DMG_VAR_MIN + (Math.random() + Math.random()) * (DMG_VAR_SPAN / 2);
  }

  // 当前编队打到哪一层（按 shield → armor → structure 顺序消耗）
  // 传入「已打进本队的累计伤害」，返回当前最外层剩余的防线名。
  function layerAt(P, waveHp) {
    if (!P || !P.fleetHp) return "structure";
    const remain = Math.max(0, P.fleetHp - Math.max(0, waveHp || 0));
    const sum = P.fleetHpSum;   // { shield, armor, structure }
    if (remain > sum.armor + sum.structure) return "shield";
    if (remain > sum.structure) return "armor";
    return "structure";
  }

  // 武器克制倍率：目标当前最外层对应武器 ×1.25，其余 ×1.0
  // ← 1 代 calcWeaponCounterMultiplier（玩家与军团 NPC 共用唯一口径）
  function counterMult(weaponType, layer) {
    const c = COUNTER_OF[weaponType];
    return (c && c === layer) ? COUNTER_MULT : 1.0;
  }

  // 武器 → 技能键。1 代 WEAPON_CONFIG.skillKey（js/data/combat.js:89-91）原样：
  //   laser → laserOps / missile → missileOperations / cannon → cannonOps
  // 本作三个战斗技能对应：laser → combatLaser，cannon → combatTurret，missile → command。
  // 每门炮只吃自己类型的技能，不做跨类型平均（1 代 selectors.js:2575/2603 即如此）。
  // 2026-11-01：导弹不再借用 command（该技能已删除），改用独立的 missile 键。
  const SKILL_OF_WEAPON = { laser: "combatLaser", missile: "missile", cannon: "combatTurret" };

  function _Base() {
    return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Base : null;
  }

  // 指挥塔全局战斗加成（2026-11-01 用户定）。
  // 指挥值 cmdLv = 驻塔者三项战斗技能的算术平均；命中 +cmdLv×2、伤害 ×(1+cmdLv×1%)。
  // 两个系数都是 1 代单兵（+4 命中 / 2% 伤害）的一半 —— 受益的是全队 5 人而不是自己一人。
  // ⚠️ 明确不碰：减伤归 defense 技能、闪避归舰船 dodge。碰了就是双源。
  function stationCommandBuff(state) {
    const B = _Base(), S = _Settle();
    if (!B || !B.stationedOfType || !S || !state) return { hitAdd: 0, dmgMult: 1 };
    const m = B.stationedOfType(state, "command");
    if (!m) return { hitAdd: 0, dmgMult: 1 };
    const sk = m.skills || {};
    const lv = (S.levelOf(sk.combatLaser || 0) + S.levelOf(sk.combatTurret || 0) + S.levelOf(sk.missile || 0)) / 3;
    return { hitAdd: lv * 2, dmgMult: 1 + lv * 0.01 };
  }

  // 扫某成员的装配，汇总「武器 / 维修 / 减伤」三类战斗贡献。
  // 返回 { weapons:[{type,dmg,hitChance,ammoCost}], dpsByType, ammoRate, repair, dmgRed }
  //   dpsByType 为「未计克制」的基础 DPS；克制按当前层在 dpsAt() 里实时乘。
  // 技能加成按 1 代原样**逐门武器取自己类型的技能**（selectors.js:2575 / 2603）：
  //   命中 = baseHit + lv×4     伤害 = baseDamage × (1 + lv×0.02)
  // ⚠️ 旧实现是「三技能 skillBonus 取算术平均」再统一乘到所有武器：既不按类型分，
  //    练指挥也会让激光炮变强，与 1 代不符，已删（见架构设计「六次修订」之前的一节）。
  function scanFit(m, evasion, split, cmd, state) {
    const Eq = _Eq(), Arch = _Arch(), Settle = _Settle();
    const Bm = (state && window.NSK && window.NSK.Engine && window.NSK.Engine.Booster) ? window.NSK.Engine.Booster : null;
    const eff = (Bm && Bm.getEffectState) ? Bm.getEffectState(state) : null;
    const hitAdd = (cmd && cmd.hitAdd) || 0;      // 指挥塔给全队的命中加成
    const dmgMult = (cmd && cmd.dmgMult) || 1;    // 指挥塔给全队的伤害乘区
    const Th = (state && typeof window !== "undefined" && window.NSK && window.NSK.Engine && window.NSK.Engine.Tech) ? window.NSK.Engine.Tech : null;
    const techHit = (Th && Th.hitBonus) ? Th.hitBonus(state) : 0;   // 科技树·精准瞄准（加性，独立于指挥塔）
    const out = {
      weapons: [], dpsByType: { laser: 0, missile: 0, cannon: 0 },
      ammoRate: { laser: 0, missile: 0, cannon: 0 },
      repair: 0, dmgRed: 0,
    };
    const fit = m && m.fitted;
    if (!fit) return out;
    const slots = ["high", "mid", "low", "rig"];
    for (const slot of slots) {
      const arr = fit[slot] || [];
      for (const id of arr) {
        const eq = Eq ? Eq.byId(id) : null;
        if (!eq || !eq.combat) continue;
        const c = eq.combat;
        if (c.kind === "weapon") {
          const skKey = SKILL_OF_WEAPON[c.weaponType];
          const lv = (Settle && m.skills && skKey) ? Settle.levelOf(m.skills[skKey]) : 1;
          const ht = (c.baseHit || 100) + lv * 4 + hitAdd + techHit;           // 1 代命中加值（selectors.js:2575）+ 指挥塔 + 科技树
          const hitChance = hitCoeff(ht, evasion);                  // 1 代命中公式 hit^1.4/(hit^1.4+dodge^1.4)
          // 增强剂武器伤害乘区（忠实 1 代 combat.js:1788-1792：按主武器 weaponType 查 weaponDamageMultiplier 表）
          const wbm = (eff && eff.weaponDamageMultiplier && eff.weaponDamageMultiplier[c.weaponType]) ? eff.weaponDamageMultiplier[c.weaponType] : 1;
          const dmg = (c.baseDamage || 0) * (1 + lv * 0.02) * dmgMult * wbm; // 1 代伤害乘区（selectors.js:2603）× 指挥塔 × 增强剂
          out.weapons.push({ type: c.weaponType, dmg: dmg, hitChance: hitChance, ammoCost: c.ammoCost || 0 });
          // 每轮 → 每秒：一轮占 ROUND_SEC 秒，故「每秒」量一律再除一次 ROUND_SEC。
          out.dpsByType[c.weaponType] = (out.dpsByType[c.weaponType] || 0) + dmg * hitChance / ROUND_SEC;
          out.ammoRate[c.weaponType] = (out.ammoRate[c.weaponType] || 0) + (c.ammoCost || 0) / ROUND_SEC;
        } else if (c.kind === "repair") {
          // 增强剂维修乘区：1 代 repairMultiplier 分 shield/armor/structure 三层；本作维修为单一池（不分层），
          // 故取三层平均值作为整池乘区（与 1 代「维修器按层恢复」语义近似，且任一维修增强剂都生效）。
          const rpm = (eff && eff.repairMultiplier) ? (eff.repairMultiplier.shield + eff.repairMultiplier.armor + eff.repairMultiplier.structure) / 3 : 1;
          out.repair += (c.amount || 0) / ROUND_SEC * rpm;          // 1 代每轮恢复绝对值 → 每秒，再乘增强剂
        }
      }
    }
    if (Arch && Arch.fittedBonuses) {
      const b = Arch.fittedBonuses(m);
      out.dmgRed = b.globalDamageReduction || 0;
    }
    return out;
  }

  // UI 用：成员装配的「主武器技能」（1 代玩家看的就是「我 laserOps 多少级」）。
  // 按 high → mid → low → rig 找第一门武器，返回 { key, weaponType, level }；没武器返回 null。
  function weaponSkillOf(m) {
    const Eq = _Eq(), Settle = _Settle();
    if (!m || !m.fitted) return null;
    for (const slot of ["high", "mid", "low", "rig"]) {
      for (const id of (m.fitted[slot] || [])) {
        const eq = Eq ? Eq.byId(id) : null;
        const c = eq && eq.combat;
        if (!c || c.kind !== "weapon") continue;
        const key = SKILL_OF_WEAPON[c.weaponType];
        if (!key) continue;
        return { key: key, weaponType: c.weaponType,
                 level: (Settle && m.skills) ? Settle.levelOf(m.skills[key]) : 1 };
      }
    }
    return null;
  }

  // 预聚合某节点战斗参数（O(成员) 一次）。无参战成员返回 null。
  function prepareNode(state, nodeId) {
    const Data = _Data(), Settle = _Settle(), Pirates = _Pirates();
    if (!Data || !Settle) return null;
    const Tch = (typeof window !== "undefined" && window.NSK && window.NSK.Engine && window.NSK.Engine.Tech) ? window.NSK.Engine.Tech : null;
    // 战斗只发生在星图上的具名据点（node.raid，见 data/raids.js）。
    // 普通采矿节点不再产战斗：否则「去哪个节点打」不构成决策，207 个节点等于难度自选菜单。
    const Raids = (Data && Data.Raids) ? Data.Raids : null;
    const raid = (Raids && state.starMap) ? Raids.raidAt(state.starMap, nodeId) : null;
    if (!raid) return null;

    const band = raid.band || 1;
    const fleet = Pirates ? Pirates.fleetFor(band, raid.faction) : null;
    if (!fleet) return null;

    // ⚠️ 2026-11-01：这里原本算过一个 masteryYield（精通点 combat 节点 +8% 赏金/级），
    //    但既没乘进掉落也没别的用处 —— 纯死变量，已删。精通点 combat 节点目前**未接线**。
    let cnt = 0;
    const members = [];
    const combatants = [];   // 战斗经验归属：每成员装配了哪些武器技能键（按舰归驾驶成员）
    let dpsByType = { laser: 0, missile: 0, cannon: 0 };
    let ammoRate = { laser: 0, missile: 0, cannon: 0 };
    let weapons = [];
    let repairRaw = 0, dmgRedRaw = 0, modCreditSum = 0;
    // 指挥塔全局加成只算一次（驻塔者不参战，是远程指挥）
    const cmdBuff = stationCommandBuff(state);

    for (const m of state.members) {
      if (m.destroyed || !m.assignment || m.assignment.type !== "combat" || m.assignment.nodeId !== nodeId) continue;
      members.push(m);
      cnt++;
      modCreditSum += (m.mods && m.mods.creditMult && m.mods.creditMult.combat) || 1;

      // 装配战斗贡献（每门武器按自己的类型取技能：命中 +lv×4、伤害 ×(1+lv×0.02)，见 scanFit）
      const f = scanFit(m, fleet.evasion, fleet.split, cmdBuff, state);
      for (const t of AMMO_TYPES) {
        dpsByType[t] += f.dpsByType[t] || 0;
        ammoRate[t] += f.ammoRate[t] || 0;
      }
      for (const w of f.weapons) weapons.push(w);
      // 战斗经验归属（按舰归驾驶成员）：记录该成员装配了哪些武器技能键（去重）
      const keys = [];
      for (const w of f.weapons) { const k = SKILL_OF_WEAPON[w.type]; if (k && keys.indexOf(k) < 0) keys.push(k); }
      combatants.push({ id: m.id, keys: keys });
      repairRaw += f.repair;
      // 减伤：装配（损伤控制）+ defense 技能「统合护盾/装甲/结构」。
      // 走同一个 dmgRedRaw 累积、同一个 DMG_RED_CAP 上限 —— 不另起变量，否则两套上限互不知情。
      dmgRedRaw += f.dmgRed + Settle.levelOf((m.skills || {}).defense || 0) * 0.02;
    }
    if (!cnt) return null;

    // 我方每秒伤害 = 所有装配武器的伤害之和。
    // ⚠️ 伤害 100% 来自武器：没有武器 = 没有伤害（1 代同规则）。
    //    此前这里有一项自创的「本能输出」，已整段删除（见文件头说明）。
    let weaponDps = 0;
    for (const t of AMMO_TYPES) weaponDps += dpsByType[t];
    const squadDps = weaponDps;

    // 我方闪避（1 代 getCombatPlayerDodgeFromState：ship.dodge）：取参战成员舰船闪避均值
    let dodgeSum = 0;
    for (const m of members) {
      const shp = (Data.Ships && Data.Ships.shipById) ? Data.Ships.shipById(m.shipId) : null;
      dodgeSum += (shp && typeof shp.dodge === "number") ? shp.dodge : 20;
    }
    const playerDodge = cnt > 0 ? dodgeSum / cnt : 20;

    // 敌方每秒伤害 = Σ 每艘敌舰 baseDamage × 命中系数（1 代 calcCombatDamage 逐敌判定）
    //   baseDamage 是「每轮」量，一轮 ROUND_SEC 秒 ⇒ 除 ROUND_SEC 得每秒。
    let incomingRaw = 0;
    for (const s of (fleet.ships || [])) incomingRaw += s.baseDamage * hitCoeff(s.hit, playerDodge) / ROUND_SEC;

    // 敌方对我方的压力（维修器每轮恢复绝对值，1 代 kind:"repair" 的 amount 直接用）
    const dmgReduction = Math.min(DMG_RED_CAP, dmgRedRaw);
    const repairPerSec = Math.min(REPAIR_CAP * incomingRaw, repairRaw);
    const incomingDps = Math.max(0, incomingRaw * (1 - dmgReduction) - repairPerSec);

    // 每波掉落（成员星币倍率进掉落，声望不吃）
    // ⚠️ 科技树·战利品协议是赏金**唯一**活乘区；精通点的 combatYieldMult 是死代码（本作不接）。
    const bountyMult = (Tch && Tch.bountyMult) ? Tch.bountyMult(state) : 1;
    const dropCredits = DROP_CREDIT_BASE * raid.iskMult * modCreditSum * bountyMult;
    const dropRep = DROP_REP_BASE * raid.repMult * cnt;

    const fleetHp = fleet.totalHp;
    // 一波真实耗时 = 盾段 + 甲段 + 构段，每段含该层克制（与 fireSegments 同一口径）。
    // ⚠️ 旧写法 `fleetHp / squadDps` 是「无克制」的，会让 UI 的一波时长比实际偏长
    //    （ROUND_SEC=1 时实测激光队：无克制 2.12s vs 真实 1.86s；改时基后两者同比例放大）。
    let waveSec = 0;
    for (const L of LAYER_ORDER) {
      const d = layerDps(dpsByType, L, null);
      if (!(d > 0)) { waveSec = Infinity; break; }
      waveSec += (fleet.hpSum[L] || 0) / d;
    }

    return {
      nodeId: nodeId,
      members: members,
      combatants: combatants,
      cnt: cnt,

      weaponDps: weaponDps,
      squadDps: squadDps,
      playerDodge: playerDodge,
      fleetHpSum: fleet.hpSum,   // 三防总量（layerAt 判定当前层用）
      dpsByType: dpsByType,
      ammoRate: ammoRate,
      weapons: weapons,
      repairPerSec: repairPerSec,
      dmgReduction: dmgReduction,
      incomingDps: incomingDps,

      dropCredits: dropCredits,
      dropRep: dropRep,

      fleet: fleet,
      fleetHp: fleetHp,
      fleetDps: fleet.dps,
      evasion: fleet.evasion,
      split: fleet.split,
      band: band,
      waveSec: waveSec,
    };
  }

  // 当前「有弹 + 该层克制」下的实际 DPS
  //   dryMask 省略 = 全部弹种有弹（用于 prepareNode 预算「一波真实耗时」）
  function layerDps(dpsByType, layer, dryMask) {
    let d = 0;
    for (const t of AMMO_TYPES) {
      const v = dpsByType[t] || 0;
      if (v <= 0) continue;
      if (dryMask && dryMask[t]) continue;
      d += v * counterMult(t, layer);
    }
    return d;
  }

  function dpsAtLayer(P, layer, dryMask) {
    return layerDps(P.dpsByType, layer, dryMask);
  }

  // 一整波的耗时 = 盾段 + 甲段 + 构段（每段按该层克制后的 DPS 算）。
  // 这是闭式跳波的基础量：同一 dryMask 下它恒定，所以可以整除跳过 n 波。
  // 任意一层无火力（不可能有武器却 dps=0，只有「一件武器都没装」）→ Infinity。
  function fullWaveSec(P, dryMask) {
    const hs = P.fleetHpSum || { shield: 0, armor: 0, structure: 0 };
    let s = 0;
    for (const L of LAYER_ORDER) {
      const d = layerDps(P.dpsByType, L, dryMask);
      if (!(d > 0)) return Infinity;
      s += (hs[L] || 0) / d;
    }
    return s;
  }

  // ---- 闭式：把 dt 切成「换层」「某弹种打尽」「整波跳过」为界的若干段 ----
  // 事件上限 = 3 次换层 + 1 次整波跳 + 3 次换层 + 3 次弹尽 ≈ 10 段（SEG_GUARD=14），
  // 成本与 dt 完全无关（§14.5 红线）。
  //
  // ★ 2026-11-01 修「层不回卷」：旧实现在一次 dt 内 hp 单调增长且从不取模，
  //   一旦 hp ≥ fleetHp，layerAt 里的 remain 被 Math.max(0,…) 夹成 0，
  //   于是永久返回 "structure" —— 打穿第一支编队之后，新编队的护盾再也不会被考虑。
  //   后果：克制对「打盾」的武器（激光/导弹）永久失效、对「打结构」的武器（射弹）永久生效。
  //   修法两条：① 打穿一波立刻把刻度回卷（hp -= fleetHp）；
  //             ② 波首时三段耗时是恒定的，直接整除跳过 n 波，段数仍是常数。
  // 返回 { segs:[{sec,dps,layer,waves?}], dmg, waves, fireSec, ammoUsed, allDry, noWeapon }
  function fireSegments(P, res, dt, waveHp) {
    const stock = {};
    let hasWeapon = false;
    for (const t of AMMO_TYPES) {
      if (P.dpsByType[t] > 0) hasWeapon = true;
      stock[t] = Math.max(0, (res && res[AMMO_OF[t]]) || 0);
    }
    // 没武器 = 打不动（1 代同规则：无武器无伤害）
    if (!hasWeapon) return { segs: [], dmg: 0, waves: 0, fireSec: 0, ammoUsed: null, allDry: false, noWeapon: true };
    if (!(dt > 0)) return { segs: [], dmg: 0, waves: 0, fireSec: 0, ammoUsed: null, allDry: false, noWeapon: false };

    const dryMask = { laser: false, missile: false, cannon: false };
    const dryAt = {};
    for (const t of AMMO_TYPES) {
      const rate = P.ammoRate[t] || 0;
      dryAt[t] = (P.dpsByType[t] > 0 && rate > 0) ? (stock[t] / rate) : Infinity;
    }

    // 三防层边界（累计伤害刻度）：shield → armor → structure
    const b = P.fleetHpSum || { shield: 0, armor: 0, structure: 0 };
    const hpOf = [b.shield || 0, b.armor || 0, b.structure || 0];
    const bound = [hpOf[0], hpOf[0] + hpOf[1], P.fleetHp];

    // 传入刻度已经是「本队累计伤害」，理论上应在 [0, fleetHp)；越界则先折算成完整波
    let hp = Math.max(0, waveHp || 0);
    let waves = 0;
    if (P.fleetHp > 0 && hp >= P.fleetHp) {
      const k = Math.floor(hp / P.fleetHp);
      hp -= k * P.fleetHp;
      waves += k;
    }

    let t = 0, dmg = 0;
    const segs = [];
    const usedAmmo = { laser: 0, missile: 0, cannon: 0 };
    let allDry = false;

    // 波首整波跳除：同一 dryMask 下每波耗时恒定 → 一次整除跨过任意多波
    function skipWholeWaves() {
      const tf = fullWaveSec(P, dryMask);
      if (!isFinite(tf) || tf <= 1e-9) return 0;
      let k = Math.floor((dt - t) / tf);
      if (k < 1) return 0;
      // 弹药约束：跳过的波不能跨过任何弹种的打空时刻
      for (const ty of AMMO_TYPES) {
        if (P.dpsByType[ty] > 0 && !dryMask[ty] && isFinite(dryAt[ty])) {
          const ka = Math.floor(Math.max(0, dryAt[ty] - t) / tf);
          if (ka < k) k = ka;
        }
      }
      if (k < 1) return 0;
      waves += k;
      dmg += k * P.fleetHp;
      t += k * tf;
      for (const L of LAYER_ORDER) {
        const d = layerDps(P.dpsByType, L, dryMask);
        const sec = (hpOf[LAYER_ORDER.indexOf(L)] || 0) / d;
        if (!(sec > 0)) continue;
        segs.push({ sec: sec * k, dps: d, layer: L, waves: k });
        for (const ty of AMMO_TYPES) {
          if (P.dpsByType[ty] > 0 && !dryMask[ty]) usedAmmo[ty] += (P.ammoRate[ty] || 0) * sec * k;
        }
      }
      // 跳完必须补做「打空翻转」：t 可能正好落在 dryAt 上，不翻的话下一段会拿已耗尽的
      // 弹种继续开火（实测：弹药只够 3 波时会白打一段盾，开火 6.615s 而非 5.571s）。
      for (const ty of AMMO_TYPES) {
        if (!dryMask[ty] && isFinite(dryAt[ty]) && dryAt[ty] <= t + 1e-9) dryMask[ty] = true;
      }
      return k;
    }

    for (let guard = 0; guard < SEG_GUARD && t < dt - 1e-9; guard++) {
      // A) 波首 → 尝试整波跳除
      if (hp < 1e-9 && skipWholeWaves() > 0) continue;

      const layer = layerAt(P, hp);
      const dps = dpsAtLayer(P, layer, dryMask);
      if (dps <= 0) { allDry = true; break; }

      const li = LAYER_ORDER.indexOf(layer);
      const needDmg = Math.max(0, bound[li] - hp);
      // ⚠️ hp 必须吸到层边界上再继续：needDmg/dps 的除法往返会让 hp 停在边界下方 1e-12 处，
      //    那时 layerAt 仍判「当前层」而 needDmg≈0 —— 若把 tLayer 当 Infinity，整段剩余时间都会
      //    按这一层算。实测：dt=900 的纯导弹一场因此少算 19 波（−1.26%），段里出现 898 秒的 shield。
      if (needDmg <= 1e-9) {
        if (li < 2) { hp = bound[li]; continue; }   // 空层 / 贴合边界 → 跨到下一层
        hp = 0; waves++; continue;                   // 已经打穿 → 回卷
      }
      const tLayer = needDmg / dps;

      let tDry = Infinity;
      for (const ty of AMMO_TYPES) {
        if (P.dpsByType[ty] > 0 && !dryMask[ty] && isFinite(dryAt[ty]) && dryAt[ty] > t + 1e-9) {
          if (dryAt[ty] < tDry) tDry = dryAt[ty];
        }
      }

      const step = Math.max(0, Math.min(dt - t, tLayer, tDry - t));
      if (step <= 1e-9) {
        // 事件正好落在当前时刻：先结算弹尽，避免空转
        let flipped = false;
        for (const ty of AMMO_TYPES) {
          if (!dryMask[ty] && isFinite(dryAt[ty]) && dryAt[ty] <= t + 1e-9) { dryMask[ty] = true; flipped = true; }
        }
        if (!flipped) break;
        continue;
      }

      const d = dps * step;
      dmg += d;
      hp += d;
      for (const ty of AMMO_TYPES) {
        if (P.dpsByType[ty] > 0 && !dryMask[ty]) usedAmmo[ty] += (P.ammoRate[ty] || 0) * step;
      }
      segs.push({ sec: step, dps: dps, layer: layer });
      t += step;

      for (const ty of AMMO_TYPES) {
        if (!dryMask[ty] && isFinite(dryAt[ty]) && dryAt[ty] <= t + 1e-9) dryMask[ty] = true;
      }

      // ★ 回卷：本波打穿 → 刻度归零，下一轮 layerAt 从 shield 重新开始
      if (P.fleetHp > 0 && hp >= bound[2] - 1e-9) {
        hp -= P.fleetHp;
        if (hp < 1e-9) hp = 0;
        waves++;
      }
    }

    if (!allDry) {
      let anyLive = false;
      for (const ty of AMMO_TYPES) if (P.dpsByType[ty] > 0 && !dryMask[ty]) anyLive = true;
      allDry = !anyLive;
    }

    const ammoUsed = {};
    for (const ty of AMMO_TYPES) {
      if (usedAmmo[ty] > 0) ammoUsed[AMMO_OF[ty]] = Math.min(stock[ty], usedAmmo[ty]);
    }
    return { segs: segs, dmg: dmg, waves: waves, fireSec: t, ammoUsed: ammoUsed, allDry: allDry, noWeapon: false };
  }

  // ---- 焦点战场：逐轮真掷骰（1 轮 = ROUND_SEC 秒）。成本 = 轮数 × 武器数，有封顶 ----
  // 公式与 1 代 combatTick 一致：逐武器判命中（hit^1.4 系数）→ 乘当前层克制 → 乘伤害浮动。
  // 与闭式同量纲：E[单轮伤害] = Σ 单发伤害 × 命中率 × 克制 = dpsByType × 克制，故两路长期收益一致。
  function simulateVolley(P, res, sec, waveHp) {
    const span = Math.max(0, sec || 0);
    const roundsF = span / ROUND_SEC;                                  // 这段时长等于多少轮
    const rounds = Math.max(1, Math.min(SIM_MAX_ROUNDS, Math.ceil(roundsF)));
    const roundSec = roundsF / rounds;         // 每轮实际占比（<1 = 本 tick 只够打零点几轮）
    const stock = {};
    for (const t of AMMO_TYPES) stock[t] = Math.max(0, (res && res[AMMO_OF[t]]) || 0);
    let dmg = 0, hits = 0, misses = 0, hp = Math.max(0, waveHp || 0);
    if (P.fleetHp > 0) hp %= P.fleetHp;
    for (let r = 0; r < rounds; r++) {
      const layer = layerAt(P, hp);
      let roundDmg = 0;
      for (const w of P.weapons) {
        const t = w.type;
        // 一轮打一发；本 tick 只覆盖零点几轮时，伤害与弹耗都按 roundSec 折算（两者同步，弹药经济不漂）
        const cost = (w.ammoCost || 0) * roundSec;
        if (cost > 1e-12 && stock[t] < cost) { misses++; continue; }   // 该弹种打空 → 这门炮哑火
        if (cost > 1e-12) stock[t] -= cost;
        if (Math.random() < w.hitChance) {
          hits++;
          roundDmg += w.dmg * counterMult(t, layer) * damageVariance() * roundSec;
        } else {
          misses++;
        }
      }
      dmg += roundDmg;
      hp += roundDmg;
      // ★ 回卷（与闭式同一规则）：打穿本波 → 刻度归零，下一轮 layerAt 从 shield 重新开始。
      //   不修的话跨波后 layer 永远锁死 structure，焦点战场与非焦点战场会算出两套结果。
      if (P.fleetHp > 0) {
        hp %= P.fleetHp;
        // 层边界吸附（同闭式）：停在边界下方会被 layerAt 判成上一层
        const hs2 = P.fleetHpSum || {};
        const b0 = hs2.shield || 0, b1 = b0 + (hs2.armor || 0);
        if (Math.abs(hp - b0) < 1e-6) hp = b0;
        else if (Math.abs(hp - b1) < 1e-6) hp = b1;
      }
    }
    const ammoUsed = {};
    for (const t of AMMO_TYPES) {
      const before = Math.max(0, (res && res[AMMO_OF[t]]) || 0);
      const used = before - stock[t];
      if (used > 0) ammoUsed[AMMO_OF[t]] = used;
    }
    let anyLeft = false;
    for (const t of AMMO_TYPES) if (P.ammoRate[t] > 0 && stock[t] > 0) anyLeft = true;
    return { dmg: dmg, hits: hits, misses: misses, ammoUsed: ammoUsed, allDry: P.weapons.length > 0 && !anyLeft };
  }

  // 结算某节点 dtSec 秒的战斗。
  // waveHp = 已打进当前这支编队的累计伤害（跨 tick 持久，切页签/离线都靠它衔接）。
  // focus = 该节点是否正被玩家注视（真仿真）；返回 O(1)。
  function advance(state, nodeId, dtSec, waveHp, focus) {
    const dt = Math.max(0, dtSec || 0);
    let wHp = Math.max(0, waveHp || 0);
    const P = prepareNode(state, nodeId);
    if (!P) {
      return {
        waves: 0, credits: 0, rep: 0, waveHp: wHp, damage: 0, fightSec: 0,
        wiped: false, allDry: false, ammoUsed: null, simmed: false, hits: 0, misses: 0,
        waveSec: 0, progress: 0, fleet: null, fleetHp: 0,
        squadDps: 0, weaponDps: 0, fleetDps: 0, incomingDps: 0,
        repairPerSec: 0, dmgReduction: 0, band: 1,
        combatants: [],
      };
    }

    // 血池：参战成员当前剩余三防总和
    let pool = 0;
    for (const m of P.members) pool += Math.max(0, (m.hp && m.hp.shield) || 0) + Math.max(0, (m.hp && m.hp.armor) || 0) + Math.max(0, (m.hp && m.hp.structure) || 0);
    const maxFightSec = P.incomingDps > 0 ? (pool / P.incomingDps) : dt;

    let dmg = 0, fireSec = 0, ammoUsed = null, allDry = false, hits = 0, misses = 0, simmed = false;
    let noWeapon = false;

    if (focus && dt > 0 && dt <= SIM_MAX_SEC) {
      simmed = true;
      const sv = simulateVolley(P, state.res, dt, wHp);
      fireSec = P.weapons.length > 0 ? dt : 0;   // 没武器 = 打不动（1 代同规则）
      dmg = sv.dmg;
      ammoUsed = sv.ammoUsed;
      allDry = sv.allDry;
      hits = sv.hits;
      misses = sv.misses;
      noWeapon = P.weapons.length === 0;
    } else {
      const fp = fireSegments(P, state.res, dt, wHp);
      fireSec = fp.fireSec;
      ammoUsed = fp.ammoUsed;
      allDry = fp.allDry;
      noWeapon = fp.noWeapon;
      dmg = fp.dmg;   // 精确值：整波跳按 k×fleetHp 累加，不用 segs 回乘（避免舍入少算一波）
    }

    // 血池封顶：被打穿就当场撤离，剩余时间不再产出（离线 8 小时不会凭空吃伤害）
    const wiped = fireSec > maxFightSec + 1e-9;
    if (wiped && fireSec > 0) {
      const ratio = maxFightSec / fireSec;
      dmg *= ratio;
      fireSec = maxFightSec;
      if (ammoUsed) for (const k in ammoUsed) ammoUsed[k] *= ratio;
      allDry = false;                       // 这次不是弹尽，是血尽
    }

    wHp += dmg;
    const waves = P.fleetHp > 0 ? Math.floor(wHp / P.fleetHp) : 0;
    if (P.fleetHp > 0) wHp -= waves * P.fleetHp;
    else wHp = 0;

    const damage = P.incomingDps * fireSec;
    const progress = P.fleetHp > 0 ? Math.max(0, Math.min(1, wHp / P.fleetHp)) : 1;

    return {
      waves: waves,
      credits: P.dropCredits * waves,
      rep: P.dropRep * waves,
      waveHp: wHp,
      damage: damage,
      fightSec: fireSec,
      wiped: wiped,
      allDry: allDry,
      noWeapon: noWeapon,
      ammoUsed: ammoUsed,
      simmed: simmed,
      hits: hits,
      misses: misses,
      waveSec: P.waveSec,
      progress: progress,
      fleet: P.fleet,
      fleetHp: P.fleetHp,
      squadDps: P.squadDps,
      weaponDps: P.weaponDps,
      fleetDps: P.fleetDps,
      incomingDps: P.incomingDps,
      repairPerSec: P.repairPerSec,
      dmgReduction: P.dmgReduction,
      band: P.band,
      combatants: P.combatants,
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
    squadCapacity,
    DROP_CREDIT_BASE, DROP_REP_BASE,
    // 1 代原式常量（不是标定值）
    COUNTER_MULT, HIT_EXP, DMG_VAR_MIN, DMG_VAR_SPAN,
    // 安全阀
    REPAIR_CAP, DMG_RED_CAP, ROUND_SEC, SIM_MAX_ROUNDS, SIM_MAX_SEC, SEG_GUARD,
    AMMO_TYPES, AMMO_OF, AMMO_CN, COUNTER_OF, LAYER_ORDER,
    SKILL_OF_WEAPON, weaponSkillOf,
    hitCoeff, counterMult, layerAt, layerDps, fullWaveSec,
    prepareNode, advance, fleetSnapshot, fireSegments, simulateVolley, drainHp,
  };
});
