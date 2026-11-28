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
  // 战术材料掉落：band N 的据点掉落 tactic:tN（1 代 special:战术残液 等 5 档 → 本作 tactic:t1..t5）。
  // 这是 tactic 的唯一获取途径，喂给对应 tier 的增强剂配方。与 credits/rep 同口径按 waves 缩放。
  // ⚠️ 量级待标定：1 代每条增强剂配方消耗 special:xx:2，本作 0.08/波 → 低安战斗约每小时数十个，量级匹配「数小时攒一波高阶制造」。
  const DROP_TACTIC_BASE = 0.08;
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
  // ★ 2026-11-27 P0 波次系统：一轮波数（1 代 maxWave=20，全据点统一；19 普通 + 第 20 波 boss）。
  //   打穿第 20 波 ≠ 结束：发肃清功勋、combatClears++、wave 回 1，然后立刻继续（1 代 combat.js:1395-1407）。
  const MAX_WAVE = 20;
  // 单次 advance 的波循环上限：余数 ≤20 波 + 折叠前的当前波，留余量。
  // 这是「成本与 dt 无关」的硬保证，不要按 dt 调大。
  const WAVE_GUARD = 48;
  // 燃料唯一写入口（2026-11-26）：与 settle / 剧情 / 燃料制造共用 Base.setFuel，保证 res.fuel 镜像同步。
  function setCombatFuel(state, v) {
    const B = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.Base : null;
    if (B && B.setFuel) return B.setFuel(state, v);
    if (!state || !state.base) return 0;
    state.base.fuel = Math.max(0, Number(v) || 0);   // 无容量上限，仅钳非负
    return state.base.fuel;
  }

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
  // ⚠️ 闪避唯一技能来源 = 驾驶（piloting，1 代同：每级 +1 闪避）；defense 归减伤、其余技能不碰闪避，避免双源。
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
      repair: 0, dmgRed: 0, fuelPerVolley: 0,
    };
    const fit = m && m.fitted;
    if (!fit) return out;
    // 舰船级战斗加成（1 代 STARTER_SHIPS.bonuses，仅搬引擎真读活键）：
    //   weaponType+Damage → 乘进该型武器伤害；hitBonus → 加进命中；structure/armorRepair → 乘进维修池；
    //   structureEmergencyRepair → 留待 advance 按我方结构比<0.7 触发。
    const _D = _Data();
    const shipB = (_D && _D.Ships && _D.Ships.shipById && m.shipId)
      ? ((_D.Ships.shipById(m.shipId) || {}).bonuses || {})
      : {};
    // ② 强化系统：成员舰船强化等级的伤害倍率（damageMultiplier）。惰性取 ShipEnhancement（晚注册安全）。
    const SE = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine.ShipEnhancement : null;
    const enhDmg = (SE && m && m.enhancementLevel) ? SE.getBonuses(m.shipId, m.enhancementLevel).damageMultiplier : 1;
    const slots = ["high", "mid", "low", "rig"];
    for (const slot of slots) {
      const arr = fit[slot] || [];
      for (const id of arr) {
        const eq = Eq ? Eq.byId(id) : null;
        if (!eq || !eq.combat) continue;
        const c = eq.combat;
        out.fuelPerVolley += (c.fuelCost || 0);   // 1 代每齐射燃料 = Σ参战装备 combat.fuelCost（武器+维修+损伤控制）
        if (c.kind === "weapon") {
          const skKey = SKILL_OF_WEAPON[c.weaponType];
          const lv = (Settle && m.skills && skKey) ? Settle.levelOf(m.skills[skKey]) : 1;
          const ht = (c.baseHit || 100) + lv * 4 + hitAdd + techHit + (shipB.hitBonus || 0);           // 1 代命中加值（selectors.js:2575）+ 指挥塔 + 科技树 + 舰船 hitBonus
          const hitChance = hitCoeff(ht, evasion);                  // 1 代命中公式 hit^1.4/(hit^1.4+dodge^1.4)
          // 增强剂武器伤害乘区（忠实 1 代 combat.js:1788-1792：按主武器 weaponType 查 weaponDamageMultiplier 表）
          const wbm = (eff && eff.weaponDamageMultiplier && eff.weaponDamageMultiplier[c.weaponType]) ? eff.weaponDamageMultiplier[c.weaponType] : 1;
          const dmg = (c.baseDamage || 0) * (1 + lv * 0.02) * dmgMult * wbm * (1 + (shipB[c.weaponType + "Damage"] || 0)) * enhDmg; // 1 代伤害乘区 × 指挥塔 × 增强剂 × 舰船武器伤害加成 × 强化伤害倍率
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
    // 舰船级维修加成（1 代 structureRepair/armorRepair，与装备维修平行乘区）
    out.repair *= (1 + (shipB.structureRepair || 0) + (shipB.armorRepair || 0));
    out.emergencyRepair = out.repair > 0 ? (shipB.structureEmergencyRepair || 0) : 0;
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

  // 成员战斗装配的「每齐射燃料」（对回 1 代 getVolleyFuelCostState / 考古 getArchaeologyFuelCostState 的 baseFuel）。
  // 船绑定成员：m.fitted 即该成员舰的装配，与 1 代「考古舰装载装备」完全等价，无需区分舰/成员。
  function fittedFuelCost(m) {
    const Eq = _Eq();
    let sum = 0;
    if (!m || !m.fitted || !Eq) return sum;
    for (const slot of ["high", "mid", "low", "rig"]) {
      for (const id of (m.fitted[slot] || [])) {
        const eq = Eq.byId(id);
        const c = eq && eq.combat;
        if (!c) continue;
        sum += (c.fuelCost || 0);
      }
    }
    return sum;
  }

  // 舰队最高电容管理等级（1 代 squad 取最优电容管理成员统筹能效）。
  function maxCapacitorLevel(state) {
    const S = _Settle();
    let lv = 0;
    if (!state || !state.members || !S) return lv;
    for (const m of state.members) {
      if (!m || m.destroyed || !m.skills) continue;
      const x = m.skills.capacitor;
      if (typeof x === "number") { const l = S.levelOf(x); if (l > lv) lv = l; }  // xp=0 → levelOf=1（Lv1 电容即有 2% 折扣）
    }
    return lv;
  }

  // 预聚合某节点战斗参数（O(成员) 一次）。无参战成员返回 null。
  // ★ 2026-11-27 P0：第三参 compId 指定本波编队（"2_normal" / "3_normal_1_elite" / "boss" …）。
  //   省略时 pirates.fleetFor 退回 BAND_COMPOSITION 默认编队 —— 保证探针与旧调用点行为不变。
  // ★ 2026-11-27 死亡空间：`override` 为可选注入（仅 deathspace.js 传），普通调用不传 → 零影响。
  //   { fleet, band, faction, iskMult, repMult, noLoot } —— 用来替换据点默认的 band/faction 编队与掉落。
  function prepareNode(state, nodeId, compId, override) {
    const Data = _Data(), Settle = _Settle(), Pirates = _Pirates();
    if (!Data || !Settle) return null;
    const Tch = (typeof window !== "undefined" && window.NSK && window.NSK.Engine && window.NSK.Engine.Tech) ? window.NSK.Engine.Tech : null;
    // 战斗只发生在星图上的具名据点（node.raid，见 data/raids.js）。
    // 普通采矿节点不再产战斗：否则「去哪个节点打」不构成决策，207 个节点等于难度自选菜单。
    const Raids = (Data && Data.Raids) ? Data.Raids : null;
    const raid = (Raids && state.starMap) ? Raids.raidAt(state.starMap, nodeId) : null;
    if (!raid && !(override && override.fleet)) return null;

    // ★ 死亡空间注入：用自定义编队/档位/势力，跳过据点 band 编队池。
    //   dropCredits/dropRep 由 deathspace 引擎自己结算（LP 走 waveLp/clearLpBonus），这里置 0 避免双发。
    const ov = override || {};
    const band = ov.band || (raid && raid.band) || 1;
    const fleet = ov.fleet || (Pirates ? Pirates.fleetFor(band, (raid && raid.faction), compId) : null);
    if (!fleet) return null;
    const faction = ov.faction || (raid && raid.faction);

    // ⚠️ 2026-11-01：这里原本算过一个 masteryYield（精通点 combat 节点 +8% 赏金/级），
    //    但既没乘进掉落也没别的用处 —— 纯死变量，已删。精通点 combat 节点目前**未接线**。
    let cnt = 0;
    const members = [];
    const combatants = [];   // 战斗经验归属：每成员装配了哪些武器技能键（按舰归驾驶成员）
    let dpsByType = { laser: 0, missile: 0, cannon: 0 };
    let ammoRate = { laser: 0, missile: 0, cannon: 0 };
    let weapons = [];
    let repairRaw = 0, dmgRedRaw = 0, modCreditSum = 0, fuelPerVolley = 0, emergencyRepairSum = 0;
    // 指挥塔全局加成只算一次（驻塔者不参战，是远程指挥）
    const cmdBuff = stationCommandBuff(state);

    for (const m of state.members) {
      if (m.destroyed || !m.assignment || m.assignment.type !== "combat" || m.assignment.nodeId !== nodeId) continue;
      members.push(m);
      cnt++;
      modCreditSum += (m.mods && m.mods.creditMult && m.mods.creditMult.combat) || 1;

      // 装配战斗贡献（每门武器按自己的类型取技能：命中 +lv×4、伤害 ×(1+lv×0.02)，见 scanFit）
      const f = scanFit(m, fleet.evasion, fleet.split, cmdBuff, state);
      fuelPerVolley += f.fuelPerVolley;
      emergencyRepairSum += f.emergencyRepair || 0;
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
      // 减伤：只来自装配（损伤控制单元 globalDamageReduction，1 代同）。
      // ⚠️ 2026-11-27 定案 A：defense 技能**不再进减伤**。1 代四个防御技能中
      //    shieldOperation/armorReinforcement/hullEngineering 是三层容量、defense 是维修量，
      //    没有任何一个产生减伤（selectors.js:2532/2544/2555/2705）；本作三合一后
      //    由 Data.Ships.maxHpOf → Settle.defenseCapBonus 接为三围容量上限。
      dmgRedRaw += f.dmgRed;
    }
    if (!cnt) return null;

    // 我方每秒伤害 = 所有装配武器的伤害之和。
    // ⚠️ 伤害 100% 来自武器：没有武器 = 没有伤害（1 代同规则）。
    //    此前这里有一项自创的「本能输出」，已整段删除（见文件头说明）。
    let weaponDps = 0;
    for (const t of AMMO_TYPES) weaponDps += dpsByType[t];
    const squadDps = weaponDps;

    // 我方闪避（对回 1 代 getCombatPlayerDodgeFromState：ship.dodge + piloting 等级）：
    // 取参战成员「舰船闪避 + 驾驶等级」均值（1 代 piloting 每级 +1 闪避，selectors.js:2619）。
    // ★ P1b：顺带取队内最高 classTier —— 索敌模式解锁门禁（1 代 capital-only 的本作映射）。
    let dodgeSum = 0, maxTier = 0;
    for (const m of members) {
      const shp = (Data.Ships && Data.Ships.shipById) ? Data.Ships.shipById(m.shipId) : null;
      const shipDodge = (shp && typeof shp.dodge === "number") ? shp.dodge : 20;
      const pilotLv = Settle.levelOf((m.skills || {}).piloting || 0);   // 驾驶：每级 +1 闪避
      dodgeSum += shipDodge + pilotLv;
      const tier = (shp && Number(shp.classTier)) || 1;
      if (tier > maxTier) maxTier = tier;
    }
    const playerDodge = cnt > 0 ? dodgeSum / cnt : 20;

    // 敌方每秒伤害 = Σ 每艘敌舰 baseDamage × 命中系数（1 代 calcCombatDamage 逐敌判定）
    //   baseDamage 是「每轮」量，一轮 ROUND_SEC 秒 ⇒ 除 ROUND_SEC 得每秒。
    // ★ P1b 编队光环（1 代 combat.js:1967）：指挥舰在场时其余敌舰伤害 ×auraDamage（自身不吃）。
    // ⚠️ 这里算的是「**满编**起手值」，只用于 UI 展示与探针；
    //   真正结算的承伤走 fireLedger（逐段只统计存活者，见 P1c 段）。
    //   两者不等是正常的：敌舰陆续阵亡后实际火力低于此值。
    const auraMult = fleetAuraMult(fleet);
    let incomingRaw = 0;
    for (const s of (fleet.ships || [])) {
      const base = (Number(s.baseDamage) || 0) * (Number(s.auraDamage) ? 1 : auraMult);
      incomingRaw += base * hitCoeff(s.hit, playerDodge) / ROUND_SEC;
    }

    // 敌方对我方的压力（维修器每轮恢复绝对值，1 代 kind:"repair" 的 amount 直接用）
    const dmgReduction = Math.min(DMG_RED_CAP, dmgRedRaw);
    // ★ P1b 抑制修理（1 代 combat.js:284-290）：存活 boss 带 repairSuppr ⇒ 我方回复 ×(1 - repairSuppr)
    const repairSuppr = fleetRepairSuppr(fleet);
    const repairRawEff = repairRaw * (1 - repairSuppr);
    const repairPerSec = Math.min(REPAIR_CAP * incomingRaw, repairRawEff);
    const incomingDps = Math.max(0, incomingRaw * (1 - dmgReduction) - repairPerSec);

    // 每波掉落（成员星币倍率进掉落，声望不吃）
    // ⚠️ 科技树·战利品协议是赏金**唯一**活乘区；精通点的 combatYieldMult 是死代码（本作不接）。
    const bountyMult = (Tch && Tch.bountyMult) ? Tch.bountyMult(state) : 1;
    const dropCredits = ov.noLoot ? 0 : DROP_CREDIT_BASE * (ov.iskMult !== undefined ? ov.iskMult : (raid ? raid.iskMult : 1)) * modCreditSum * bountyMult;
    const dropRep = ov.noLoot ? 0 : DROP_REP_BASE * (ov.repMult !== undefined ? ov.repMult : (raid ? raid.repMult : 1)) * cnt;

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
      fuelPerVolley: fuelPerVolley,
      repairPerSec: repairPerSec,
      dmgReduction: dmgReduction,
      repairRaw: repairRaw,
      repairRawEff: repairRawEff,      // P1b：已扣抑制修理（emergencyRepair 分支要用这个）
      repairSuppr: repairSuppr,        // P1b：boss 抑制修理强度（UI 提示用）
      auraMult: auraMult,              // P1b：编队光环倍率（UI 提示用）
      incomingRaw: incomingRaw,
      emergencyRepair: emergencyRepairSum,
      incomingDps: incomingDps,

      // ★ P1b：索敌模式门禁（1 代 capital-only 的本作映射：队内最高 classTier >= 3）
      targetTier: maxTier,
      targetUnlocked: maxTier >= TARGET_UNLOCK_TIER,

      dropCredits: dropCredits,
      dropRep: dropRep,

      fleet: fleet,
      fleetHp: fleetHp,
      fleetDps: fleet.dps,
      evasion: fleet.evasion,
      split: fleet.split,
      band: band,
      compId: compId || "default",
      faction: faction,
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

  // ================================================================
  // 逐敌实例（2026-11-27 P1a，用户拍板 D1 = 路线 B）
  // ----------------------------------------------------------------
  // 1 代 combat.js 敌方是 c.enemies[]，每只独立三防、独立判死（defeated）。
  // 本作 P0 之前只有一条聚合血条（state.combatWaveHp 一个数字），UI 的三张敌舰卡
  // 是按「总进度百分比」线性摊算的 —— 后果是「谁先死」恒等于 ships[] 数组顺序，
  // 克制 ×1.25 也只能作用在整队总量上，无法表达「第 2 只已在打结构、精英还满盾」。
  //
  // P1a 起真实状态 = state.combatEnemies[nodeId] = [{k, hp:[盾,甲,构]}]
  //   · k = "n" | "e" | "b"（kind 短码，存档省字节，同时用于「档期编队是否变了」的校验）
  //   · hp 下标与 LAYER_ORDER 对齐（0=shield 1=armor 2=structure）
  //   · 「已死」= 三层全 ≤ 0，不另存 defeated（避免脏档出现「hp>0 但 defeated」两本账）
  //   · 当前目标 = 第一个还活着的（P1a 不做玩家选目标，那是 P1b）
  //
  // ★ 耗时等价性（本轮最关键的推导，保证 P0 的整轮折叠一行都不用改）：
  //     聚合一波 = Σ_层 总血[层] / 该层DPS
  //     逐敌一波 = Σ_船 Σ_层 该船[层] / 该层DPS
  //   两者恒等（每只船的三层都要完整打穿，线性可加）。
  //   ⇒ waveSecFrom / fullWaveSec / expectedRound 全部沿用，离线折叠精度不变。
  //   层间「时序」不同（聚合是全队一起换层，逐敌是一船只一只船换层），但总时长相同。
  // ================================================================

  // ================================================================
  // P1b · 索敌模式（1 代 capital-combat.js:7-18 CAPITAL_TARGETING_MODES 逐项照搬）
  // ----------------------------------------------------------------
  // 1 代门禁：只有旗舰 / 超旗 / 泰坦（type = capital | supercapital | titan）能设索敌模式，
  //   其余船一律「按编队顺序」（`capital-combat.js:45 if (!isCapitalCombatShip) return living[0]`）。
  // 本作是**小队聚合**（没有单一一艘「本舰」）⇒ 映射为「队内最高 classTier >= 3」解锁。
  //   本作 classTier：3 = 战列/旗舰档（天穹/重垒/裂界/启明/山海），4 = 超级旗舰档（星冕/恒城/裁决），
  //   5 = 泰坦（渊灭级）⇒ 正好对齐 1 代 capital / supercapital / titan 三级。
  // ⚠️ 这是本作对 1 代「本舰是旗舰」门禁的**唯一映射**，不是 1 代原式（本作无「本舰」概念）。
  // ================================================================
  const TARGET_MODES = [
    { id: "formation",      name: "按编队顺序", desc: "永远打第一个还活着的（1 代默认）" },
    { id: "elite",          name: "优先精英",   desc: "先打精英，没有精英则回落到按编队顺序" },
    { id: "boss",           name: "优先BOSS",   desc: "先打 BOSS，没有 BOSS 则回落" },
    { id: "highest_damage", name: "优先最高攻击", desc: "先打 baseDamage 最高的那只" },
    { id: "lowest_hp",      name: "优先最低生命", desc: "先打剩余总血最少的，快速减员" },
    { id: "highest_hp",     name: "优先最高生命", desc: "先啃最硬的，配 AOE 时避免溢出浪费" },
  ];
  const TARGET_UNLOCK_TIER = 3;
  const KIND_OF_CODE = { n: "normal", e: "elite", b: "boss" };

  function normalizeTargetMode(mode) {
    const v = String(mode || "formation");
    for (const m of TARGET_MODES) if (m.id === v) return v;
    return "formation";                      // 非法值 → 1 代同规则 `normalizeCapitalTargetingMode`
  }

  function targetModeName(mode) {
    const m = normalizeTargetMode(mode);
    for (const x of TARGET_MODES) if (x.id === m) return x.name;
    return TARGET_MODES[0].name;
  }

  // 该节点当前的索敌模式。未解锁（队内无 classTier>=3 的船）→ 强制按编队顺序并忽略存档值。
  function targetModeOf(state, nodeId, unlocked) {
    if (!unlocked) return "formation";
    const raw = (state && state.combatTargeting) ? state.combatTargeting[nodeId] : "";
    return normalizeTargetMode(raw);
  }

  // 门禁判定：该据点参战成员里最高 classTier 是否够 Tier 3（战列/旗舰档）。
  // 与 prepareNode 里的 maxTier 同口径（同一个成员过滤条件），但不需要跑完整装配扫描 —— UI 点击时用。
  function targetUnlockedFor(state, nodeId) {
    for (const m of ((state && state.members) || [])) {
      if (!m || m.destroyed || !m.assignment) continue;
      if (m.assignment.type !== "combat" || m.assignment.nodeId !== nodeId) continue;
      const shp = (Data.Ships && Data.Ships.shipById) ? Data.Ships.shipById(m.shipId) : null;
      if (((shp && Number(shp.classTier)) || 1) >= TARGET_UNLOCK_TIER) return true;
    }
    return false;
  }

  // 写入索敌模式（UI 唯一入口）。非法值 / 未解锁 → 拒绝。
  //   · 选 "formation" = 删 key（存档不存默认值，保持干净）
  //   · 未解锁但存档里已有旧值（例如旗舰撤退了）→ 不在这里清，让 targetModeOf 强制回落，
  //     这样玩家把旗舰调回来时模式自动恢复。
  function setTargetMode(state, nodeId, mode) {
    const m = normalizeTargetMode(mode);
    if (m !== mode) return { ok: false, reason: "invalid" };
    if (!targetUnlockedFor(state, nodeId)) return { ok: false, reason: "locked" };
    if (!state.combatTargeting || typeof state.combatTargeting !== "object") state.combatTargeting = {};
    if (m === "formation") delete state.combatTargeting[nodeId];
    else state.combatTargeting[nodeId] = m;
    return { ok: true, mode: m };
  }

  function enemyTotalHp(e) {
    if (!e || !e.hp) return 0;
    return Math.max(0, e.hp[0] || 0) + Math.max(0, e.hp[1] || 0) + Math.max(0, e.hp[2] || 0);
  }

  // 从逐敌数组里挑目标 → 下标；全灭返回 -1。
  // ships = P.fleet.ships（**同序**，enemiesFromFleet 保序），只用来取 baseDamage。
  function pickTarget(list, mode, ships) {
    if (!Array.isArray(list) || !list.length) return -1;
    const m = normalizeTargetMode(mode);
    let firstAlive = -1, byKind = -1, bestIdx = -1, bestVal = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!enemyAlive(e)) continue;
      if (firstAlive < 0) firstAlive = i;
      if (m === "formation") return i;                    // 第一个活的，直接返回
      const kind = KIND_OF_CODE[e.k] || "normal";
      if (byKind < 0 && ((m === "elite" && kind === "elite") || (m === "boss" && kind === "boss"))) byKind = i;
      if (m === "highest_damage") {
        const v = (ships && ships[i] && Number(ships[i].baseDamage)) || 0;
        if (bestIdx < 0 || v > bestVal) { bestIdx = i; bestVal = v; }
      } else if (m === "lowest_hp") {
        const v = enemyTotalHp(e);
        if (bestIdx < 0 || v < bestVal) { bestIdx = i; bestVal = v; }
      } else if (m === "highest_hp") {
        const v = enemyTotalHp(e);
        if (bestIdx < 0 || v > bestVal) { bestIdx = i; bestVal = v; }
      }
    }
    if (firstAlive < 0) return -1;
    if (m === "elite" || m === "boss") return byKind >= 0 ? byKind : firstAlive;   // 1 代回落 living[0]
    return bestIdx >= 0 ? bestIdx : firstAlive;
  }

  // ================================================================
  // P1b · boss 特殊机制（1 代 combat.js 逐字段照搬）
  // ----------------------------------------------------------------
  // 1 代 ENEMY_DATABASE 里带这些字段的**只有两条**：
  //   precursor_warden（先驱守望者 lv95） / deathspace_10_overlord（亡灵统御者 lv110，死亡空间第 10 层）
  //   五字段：bossHealPct / bossHealEvery / enrageMul / enrageAt / repairSuppr
  // 本作现有 15 条据点 boss 在 1 代**全都没有**这些字段（已逐条核过），所以数据层保持不放，
  //   机制在此实装，供 P4 搬死亡空间 boss 时直接挂数据。
  // ================================================================

  // 编队光环：1 代 combat.js:1967 —— `maxAura = max(存活敌 auraDamage || 1)`，非 aura 单位伤害 ×maxAura。
  function fleetAuraMult(fleet) {
    let m = 1;
    for (const s of ((fleet && fleet.ships) || [])) {
      const a = Number(s && s.auraDamage) || 1;
      if (a > m) m = a;
    }
    return m;
  }

  // 抑制修理：1 代 combat.js:284-290 —— 存活 boss 带 repairSuppr 时，我方回复 ×(1 - repairSuppr)。
  function fleetRepairSuppr(fleet) {
    let s = 0;
    for (const sh of ((fleet && fleet.ships) || [])) {
      const v = Number(sh && sh.repairSuppr) || 0;
      if (v > s) s = v;
    }
    return Math.min(0.95, s);      // 1 代原值 0.4，这里只做兜底防止配成 1 变成「永不维修」
  }

  // 该编队是否含「相位重构」boss（每 N 轮回血）—— 回血让单波时长不再是解析式
  function fleetHasHealer(fleet) {
    for (const s of ((fleet && fleet.ships) || [])) if (s && Number(s.bossHealPct) > 0) return true;
    return false;
  }

  const REMAIN_PROBE_MAX = 3600;      // 有回血时「一波时长」试算上限（1 小时一波已属荒谬 → 打不穿）
  const INF_AMMO_RES = { ammo_laser: 1e15, ammo_missile: 1e15, ammo_cannon: 1e15 };

  const KIND_CODE = { normal: "n", elite: "e", boss: "b" };

  // ================================================================
  // P1c · 敌方火力变量化（2026-11-27，用户拍板 A：严格 1 代口径，不做平衡补偿）
  // ----------------------------------------------------------------
  // 1 代 `systems/combat.js` 每轮重算「存活敌舰」的火力，本作 P1b 之前是「按满编一次算」，
  // 后果：① 索敌模式只有进攻收益、打掉最凶的那只不减少挨打；② aura 持有者死后光环不消失；
  // ③ enrageMul 是「随自身血量变化」的量，火力不变量化就无处落脚。
  //
  // 关键约束（§14.5 红线）：敌方火力是**分段常数** —— 一套编队至多 6 舰，每死一舰变一次，
  // 所以一整波最多 6 段闭式，成本 O(6) 而非 O(dt)。**禁止逐 volley 模拟**。
  // 与耗时的等价性：段内火力恒定 ⇒ ∫DPS·dt = Σ(该段存活者火力 × 该段时长)，是精确值不是近似。
  // ================================================================

  // 每舰的静态系数（一次算，逐段复用）。hitCoeff 内含 Math.pow(hit^1.4)，
  // 放进逐段循环会让 6 舰 × 数十段 = 数百次 pow，故预计算。
  function enemyShotProfile(P, fleet) {
    const ships = (fleet && fleet.ships) || [];
    const out = [];
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i] || {};
      const mh = s.maxHp || {};
      const maxTotal = (Math.max(0, mh.shield || 0) + Math.max(0, mh.armor || 0) + Math.max(0, mh.structure || 0))
        || (Number(s.total) || 0);
      out.push({
        dps: (Number(s.baseDamage) || 0) * hitCoeff(s.hit, P.playerDodge) / ROUND_SEC,
        aura: Number(s.auraDamage) || 0,
        suppr: Number(s.repairSuppr) || 0,
        enrageMul: Number(s.enrageMul) || 0,
        enrageAt: Number(s.enrageAt) || 0,
        maxTotal: maxTotal,
      });
    }
    return out;
  }

  // 当前**存活者**的瞬时火力（含光环 / 狂暴）+ 抑制修理强度。
  // ★ 光环只由存活者提供（1 代 :1967），持有者被打死 → 其余敌舰立刻掉回原伤害。
  // ★ 狂暴按「自身」血量比判定（不是队伍均值），1 代 useEnrage 的语义。
  function aliveFire(profile, list) {
    const n = list ? list.length : 0;
    let aura = 1, suppr = 0;
    for (let i = 0; i < n; i++) {
      if (!enemyAlive(list[i])) continue;
      const p = profile[i];
      if (!p) continue;
      if (p.aura > aura) aura = p.aura;
      if (p.suppr > suppr) suppr = p.suppr;
    }
    let raw = 0;
    for (let i = 0; i < n; i++) {
      if (!enemyAlive(list[i])) continue;
      const p = profile[i];
      if (!p) continue;
      let d = p.dps * (p.aura > 0 ? 1 : aura);
      if (p.enrageMul > 1 && p.enrageAt > 0 && p.maxTotal > 0) {
        if (enemyTotalHp(list[i]) / p.maxTotal < p.enrageAt) d *= p.enrageMul;
      }
      raw += d;
    }
    return { raw: raw, suppr: Math.min(0.95, suppr) };
  }

  // 我方承伤账本。三段累计量足以精确还原净伤：
  //   net = Σ(raw×(1−减伤) − 维修) = rawSec×(1−减伤) − repSec   ← (1−减伤) 是常数，可提出求和号
  // hpPool：本次最多还能挨多少净伤（advance 逐段传 hpLeft）→ 打空即止，不再需要
  //   「先算出 fireSec 再按 pool/incoming 截断重推」那套（P1a 的旧办法在火力变量化后失效）。
  function fireLedgerNew(P, profile, opts) {
    const o = opts || {};
    const pool = o.hpPool;
    return {
      rawSec: 0, repSec: 0, net: 0, wiped: false,
      hpPool: (pool === undefined || pool === null || !isFinite(pool)) ? Infinity : Math.max(0, pool),
      shield: Math.max(0, o.shield || 0),
      armor: Math.max(0, o.armor || 0),
      structure: Math.max(0, o.structure || 0),
      emergency: Math.max(0, o.emergencyRepair || 0),
      red: Math.max(0, Math.min(1, (P && P.dmgReduction) || 0)),
      repairRaw: Math.max(0, (P && P.repairRaw) || 0),
      profile: profile,
    };
  }

  // 段首取一次：本段的瞬时火力与维修量。
  // 紧急维修用**当前累计净伤**推结构比（1 代 structureEmergencyRepair 的原意），
  //   而不是 P1a 那样「用满编火力乘总时长当上界」——那个上界在火力递减后偏大，会过早触发。
  function fireLedgerTick(led, list) {
    const st = aliveFire(led.profile, list);
    let mult = 1;
    if (led.emergency > 0 && led.structure > 0) {
      const eaten = Math.max(0, led.net - led.shield - led.armor);   // 穿透盾/甲打到结构的净伤
      if (Math.max(0, led.structure - eaten) / led.structure < 0.7) mult = 1 + led.emergency;
    }
    const rep = Math.min(REPAIR_CAP * st.raw, led.repairRaw * mult * (1 - st.suppr));
    return { raw: st.raw, rep: rep, netRate: st.raw * (1 - led.red) - rep };
  }

  function fireLedgerPost(led, raw, rep, sec) {
    if (!(sec > 0)) return;
    led.rawSec += raw * sec;
    led.repSec += rep * sec;
    led.net = led.rawSec * (1 - led.red) - led.repSec;
  }

  // 本段最多能走多久：血池先空就在中途截断
  function fireLedgerCap(led, netRate, sec) {
    if (!isFinite(led.hpPool) || !(netRate > 0)) return { sec: sec, cut: false };
    const avail = led.hpPool - led.net;
    if (!(avail > 0)) return { sec: 0, cut: true };
    const tE = avail / netRate;
    if (tE < sec) return { sec: Math.max(0, tE), cut: true };
    return { sec: sec, cut: false };
  }

  function enemiesFromFleet(fleet) {
    if (!fleet || !Array.isArray(fleet.ships)) return null;
    const list = [];
    for (const s of fleet.ships) {
      const m = s.maxHp || {};
      list.push({ k: KIND_CODE[s.kind] || "n", hp: [m.shield || 0, m.armor || 0, m.structure || 0] });
    }
    return list;
  }

  function enemyAlive(e) {
    return !!(e && e.hp && (e.hp[0] + e.hp[1] + e.hp[2]) > 0);
  }

  function enemiesAliveCount(list) {
    let n = 0;
    if (list) for (const e of list) if (enemyAlive(e)) n++;
    return n;
  }

  function enemiesRemainTotal(list) {
    let s = 0;
    if (list) for (const e of list) {
      if (!e || !e.hp) continue;
      s += Math.max(0, e.hp[0] || 0) + Math.max(0, e.hp[1] || 0) + Math.max(0, e.hp[2] || 0);
    }
    return s;
  }

  function cloneEnemies(list) {
    const out = [];
    for (const e of (list || [])) out.push({ k: e.k, hp: [e.hp[0], e.hp[1], e.hp[2]] });
    return out;
  }

  // 确保逐敌状态与「当前这一波的编队」一致。
  // 长度/种类不符（换波、换档、脏档）→ 重建满血。
  // legacyWaveHp：旧档只有 combatWaveHp（本波已打掉的累计伤害）→ 按进度摊成逐敌血量（一次性迁移）。
  function ensureEnemies(state, nodeId, fleet, legacyWaveHp) {
    if (!state.combatEnemies || typeof state.combatEnemies !== "object") state.combatEnemies = {};
    const want = enemiesFromFleet(fleet);
    if (!want) return { list: [], rebuilt: false };

    const cur = state.combatEnemies[nodeId];
    let ok = Array.isArray(cur) && cur.length === want.length;
    if (ok) {
      for (let i = 0; i < want.length; i++) {
        const c = cur[i];
        if (!c || c.k !== want[i].k || !Array.isArray(c.hp) || c.hp.length < 3) { ok = false; break; }
      }
    }
    if (ok) return { list: cur, rebuilt: false };

    const list = cloneEnemies(want);
    const total = enemiesRemainTotal(list);
    let left = Math.max(0, Math.min(total, Number(legacyWaveHp) || 0));
    if (left > 0) {
      for (const e of list) {
        for (let L = 0; L < 3 && left > 0; L++) {
          const take = Math.min(Math.max(0, e.hp[L]), left);
          e.hp[L] -= take;
          left -= take;
        }
      }
    }
    state.combatEnemies[nodeId] = list;
    return { list: list, rebuilt: true };
  }

  // 把一笔伤害按「当前目标 → 其余存活敌舰」顺序摊到三防上（sh→ar→st），返回死亡索引。
  // startIdx：本次伤害的**起点目标**（P1b 索敌模式决定）。从它开始向后扫，扫到尾再从头扫回
  //   到 startIdx 之前 —— 保证溢出不浪费（与 P1a「carry 到下一只」同口径）。
  //   ⚠️ 溢出目标按「数组顺序」而不是「重新按模式挑」，与 1 代一致：1 代一次齐射打在单一目标上，
  //   只有「本次伤害溢出」才顺延，不会为一发子弹重新算索敌。
  // ★ 溢出必须 carry 到下一只：闭式路径天然守恒（按层扣不浪费），焦点路径若丢弃溢出，
  //   两条路会算出两套结果，直接破坏 parity。
  function applyDamage(list, amount, startIdx) {
    let left = Math.max(0, amount || 0);
    const killed = [];
    const n = list ? list.length : 0;
    if (!n || left <= 1e-12) return { killed: killed, wasted: left };
    const from = (typeof startIdx === "number" && startIdx >= 0 && startIdx < n) ? startIdx : 0;
    for (let pass = 0; pass < 2 && left > 1e-12; pass++) {
      const lo = pass === 0 ? from : 0;
      const hi = pass === 0 ? n : from;          // 第二遍只补扫 startIdx 之前那几只，不重复
      for (let i = lo; i < hi && left > 1e-12; i++) {
        const e = list[i];
        if (!enemyAlive(e)) continue;
        for (let L = 0; L < 3 && left > 1e-12; L++) {
          if (!(e.hp[L] > 0)) continue;
          const take = Math.min(e.hp[L], left);
          e.hp[L] -= take;
          left -= take;
        }
        if (!enemyAlive(e) && killed.indexOf(i) < 0) killed.push(i);
      }
    }
    killed.sort(function (a, b) { return a - b; });
    return { killed: killed, wasted: left };
  }

  // ---- 闭式：逐敌按时间推进（替代 fireSegments 的主路径）----
  // 在副本上推，**不改入参** —— 因为外层还要按血池/燃料比例截断，确定后才能提交。
  // 成本 = 船数 × 3 层 × (弹尽段数 + 回血次数 + 1) 次除法，与 dt 完全无关。
  // mode：索敌模式（P1b），省略 = "formation"（1 代默认，行为与 P1a 完全一致）。
  function drainEnemies(P, list, dtSec, res, dryMaskIn, mode, opts) {
    const dt = Math.max(0, dtSec || 0);
    const next = cloneEnemies(list);
    const ships = (P.fleet && P.fleet.ships) || [];
    const tMode = normalizeTargetMode(mode);
    const profile = enemyShotProfile(P, P.fleet);     // ★ P1c：逐舰静态系数（一次算，逐段复用）
    const led = fireLedgerNew(P, profile, opts);      // ★ P1c：我方承伤账本（逐段累加存活者火力）
    const stock = {};
    let hasWeapon = false;
    for (const t of AMMO_TYPES) {
      if (P.dpsByType[t] > 0) hasWeapon = true;
      stock[t] = Math.max(0, (res && res[AMMO_OF[t]]) || 0);
    }
    if (!hasWeapon) {
      return { next: next, fireSec: 0, dmg: 0, killed: [], ammoUsed: null, allDry: false, noWeapon: true, ledger: led, wiped: false };
    }
    if (!(dt > 0)) {
      return { next: next, fireSec: 0, dmg: 0, killed: [], ammoUsed: null, allDry: false, noWeapon: false, ledger: led, wiped: led.hpPool <= 0 };
    }

    const dryMask = {
      laser: !!(dryMaskIn && dryMaskIn.laser),
      missile: !!(dryMaskIn && dryMaskIn.missile),
      cannon: !!(dryMaskIn && dryMaskIn.cannon),
    };
    const dryAt = {};
    for (const t of AMMO_TYPES) {
      const rate = P.ammoRate[t] || 0;
      if (!(P.dpsByType[t] > 0)) { dryAt[t] = Infinity; dryMask[t] = true; continue; }
      if (rate <= 0) { dryAt[t] = Infinity; continue; }
      if (stock[t] <= 0) dryMask[t] = true;
      dryAt[t] = dryMask[t] ? 0 : (stock[t] / rate);
    }

    // ★ P1b 相位重构（回血）：1 代按整场累计 roundSeq 计节拍（`c.roundSeq % every === 0`），
    //   本作无该字段 ⇒ 按「本波内已过秒数」计（每 every × ROUND_SEC 秒一次）。
    //   ⚠️ 已知差异：1 代的节拍跨波连续，本作每波重置；且 1Hz 焦点每条 tick 都从 t=0 起算，
    //   若真给 boss 配了回血，必须同时持久化「本波已过秒数」才会触发。现有 15 条 boss 无此字段 ⇒ 零影响。
    const healers = [];
    for (let i = 0; i < next.length; i++) {
      const s = ships[i];
      if (!s || !(Number(s.bossHealPct) > 0)) continue;
      const every = Math.max(1, Number(s.bossHealEvery) || 5);
      healers.push({ i: i, everySec: every * ROUND_SEC, pct: Number(s.bossHealPct), maxHp: s.maxHp || null, done: 0 });
    }

    let t = 0, dmg = 0, guard = 0;
    const killed = [];
    const usedAmmo = { laser: 0, missile: 0, cannon: 0 };
    const GUARD = 6 * 3 * 4 + 128;   // 船×层×弹尽段 + 回血段，防呆上界（远大于真实需要）

    function flipDry() {
      let flipped = false;
      for (const ty of AMMO_TYPES) {
        if (!dryMask[ty] && isFinite(dryAt[ty]) && dryAt[ty] <= t + 1e-9) { dryMask[ty] = true; flipped = true; }
      }
      return flipped;
    }

    // 下一个「存活回血 boss 的」回血时刻（未发生过的节拍）
    function nextHeal() {
      let at = Infinity, h = null;
      for (const x of healers) {
        if (!enemyAlive(next[x.i])) continue;
        const a = (x.done + 1) * x.everySec;
        if (a >= t - 1e-9 && a < at) { at = a; h = x; }
      }
      return { at: at, h: h };
    }

    while (t < dt - 1e-9 && guard++ < GUARD) {
      const ti = pickTarget(next, tMode, ships);      // ★ P1b：按索敌模式挑目标
      if (ti < 0) break;                       // 全灭 → 本波结束
      const target = next[ti];

      let L = -1;
      for (let i = 0; i < 3; i++) { if (target.hp[i] > 1e-9) { L = i; break; } }
      if (L < 0) { target.hp = [0, 0, 0]; continue; }

      const d = layerDps(P.dpsByType, LAYER_ORDER[L], dryMask);
      if (!(d > 0)) break;                     // 该层无火力 → 停（对回聚合「当前层打不动就停」）

      // 本段的时间上限：dt / 最近一个还没打空的弹种 / 下一次 boss 回血
      let tEnd = dt, why = "dt";
      for (const ty of AMMO_TYPES) {
        if (P.dpsByType[ty] > 0 && !dryMask[ty] && isFinite(dryAt[ty]) && dryAt[ty] > t + 1e-9) {
          if (dryAt[ty] < tEnd) { tEnd = dryAt[ty]; why = "dry"; }
        }
      }
      let healH = null;
      if (healers.length) {
        const hh = nextHeal();
        if (hh.at < tEnd) { tEnd = Math.max(t, hh.at); why = "heal"; healH = hh.h; }
      }

      const tLayer = target.hp[L] / d;
      // ★ P1c：本段先结算「存活者火力 → 我方承伤」，再看血池能撑多久。
      //   旧办法（先按满编算 fireSec，再 pool/incoming 截断）在火力变量化后不成立：
      //   敌舰陆续阵亡 ⇒ 后半段承伤速率更低，同一个 pool 能撑的秒数变长。
      const tick = fireLedgerTick(led, next);
      const cap = fireLedgerCap(led, tick.netRate, Math.max(0, tEnd - t));
      const step = cap.sec;

      if (tLayer <= step + 1e-12) {
        // 打空这一层（该层血量精确归零，避免 1e-12 残留让下一轮又选中它）
        t += tLayer;
        dmg += target.hp[L];
        for (const ty of AMMO_TYPES) if (P.dpsByType[ty] > 0 && !dryMask[ty]) usedAmmo[ty] += (P.ammoRate[ty] || 0) * tLayer;
        fireLedgerPost(led, tick.raw, tick.rep, tLayer);
        target.hp[L] = 0;
        if (!enemyAlive(target)) killed.push(ti);
        flipDry();
        continue;
      }

      const dd = d * step;
      t += step;
      dmg += dd;
      target.hp[L] = Math.max(0, target.hp[L] - dd);
      for (const ty of AMMO_TYPES) if (P.dpsByType[ty] > 0 && !dryMask[ty]) usedAmmo[ty] += (P.ammoRate[ty] || 0) * step;
      fireLedgerPost(led, tick.raw, tick.rep, step);
      if (!enemyAlive(target)) killed.push(ti);
      if (cap.cut) { led.wiped = true; break; }      // 血池在本段中途打空 → 当场撤离
      if (t >= dt - 1e-9) break;

      // 相位重构：按 maxTotal × bossHealPct 补血，盾→甲→构顺序，受各自上限（1 代 :2032-2043）
      if (why === "heal" && healH) {
        healH.done++;
        const mh = healH.maxHp;
        const maxTotal = mh ? (Math.max(0, mh.shield || 0) + Math.max(0, mh.armor || 0) + Math.max(0, mh.structure || 0)) : 0;
        let rem = maxTotal * healH.pct;
        const e2 = next[healH.i];
        for (let Li = 0; Li < 3 && rem > 1e-12; Li++) {
          const capHp = mh ? Math.max(0, (mh[LAYER_ORDER[Li]] || 0) - e2.hp[Li]) : 0;
          const add = Math.max(0, Math.min(capHp, rem));
          e2.hp[Li] += add;
          rem -= add;
        }
        continue;
      }

      if (!flipDry()) break;                   // 既没到 dt 也不是弹尽/回血 → 防呆退出
    }

    let allDry = true;
    for (const ty of AMMO_TYPES) { if (P.dpsByType[ty] > 0 && !dryMask[ty]) { allDry = false; break; } }

    const ammoUsed = {};
    for (const ty of AMMO_TYPES) {
      if (!(usedAmmo[ty] > 0)) continue;
      ammoUsed[AMMO_OF[ty]] = Math.min(stock[ty], usedAmmo[ty]);
    }
    return { next: next, fireSec: t, dmg: dmg, killed: killed, ammoUsed: ammoUsed, allDry: allDry, noWeapon: false, ledger: led, wiped: led.wiped };
  }

  // ---- 焦点：逐敌逐轮真掷骰（替代 simulateVolley 的主路径）----
  // 每轮按索敌模式挑目标、按它当前层判克制，再逐武器掷命中；
  // 一轮内打死后剩余伤害 carry 到下一只（与 applyDamage 同口径）。
  // 成本 = 轮数(≤2) × 武器数，与 dt 无关（SIM_MAX_ROUNDS 封顶）。
  function volleyEnemies(P, list, res, sec, mode, opts) {
    const span = Math.max(0, sec || 0);
    const next = cloneEnemies(list);
    const ships = (P.fleet && P.fleet.ships) || [];
    const tMode = normalizeTargetMode(mode);
    const profile = enemyShotProfile(P, P.fleet);      // ★ P1c
    const led = fireLedgerNew(P, profile, opts);       // ★ P1c
    const healers = [];
    for (let i = 0; i < next.length; i++) {
      const s = ships[i];
      if (!s || !(Number(s.bossHealPct) > 0)) continue;
      healers.push({ i: i, every: Math.max(1, Number(s.bossHealEvery) || 5), pct: Number(s.bossHealPct), maxHp: s.maxHp || null });
    }
    const roundsF = span / ROUND_SEC;
    const rounds = Math.max(1, Math.min(SIM_MAX_ROUNDS, Math.ceil(roundsF)));
    const roundSec = roundsF / rounds;      // 每轮占「几轮」（伤害与弹耗都按它折算，原 simulateVolley 口径）
    const roundSecTotal = roundSec * ROUND_SEC;   // ⚠️ 换算成「秒」才能累积 fireSec：
                                                  //    roundSec 是轮数比例（1s ≈ 0.333 轮），直接加到
                                                  //    秒数上会把战斗时长压成 1/ROUND_SEC（实测 1s tick 只记 0.333s）。
    const stock = {};
    for (const t of AMMO_TYPES) stock[t] = Math.max(0, (res && res[AMMO_OF[t]]) || 0);

    let dmg = 0, hits = 0, misses = 0, fireSec = 0;
    const killed = [];
    for (let r = 0; r < rounds; r++) {
      const ti = pickTarget(next, tMode, ships);          // ★ P1b：按索敌模式挑目标
      if (ti < 0) break;                                  // 全灭 → 提前收
      const target = next[ti];
      let L = 0;
      for (let i = 0; i < 3; i++) { if (target.hp[i] > 1e-9) { L = i; break; } }
      const layer = LAYER_ORDER[L];
      // ★ P1c：本轮承伤按「本轮开始时存活者」计（1 代逐轮重算存活者的本作映射）
      const tick = fireLedgerTick(led, next);

      let roundDmg = 0;
      for (const w of P.weapons) {
        const ty = w.type;
        const cost = (w.ammoCost || 0) * roundSec;
        if (cost > 1e-12 && stock[ty] < cost) { misses++; continue; }
        if (cost > 1e-12) stock[ty] -= cost;
        if (Math.random() < w.hitChance) {
          hits++;
          roundDmg += w.dmg * counterMult(ty, layer) * damageVariance() * roundSec;
        } else {
          misses++;
        }
      }
      dmg += roundDmg;
      const res2 = applyDamage(next, roundDmg, ti);        // 从当前目标起摊，溢出向后顺延
      for (const idx of res2.killed) killed.push(idx);
      fireSec += roundSecTotal;
      fireLedgerPost(led, tick.raw, tick.rep, roundSecTotal);

      // 血池打空：本条腿是随机路径，结果不作数 —— 交给 advanceCore 用解析式重推（保证确定性）
      if (isFinite(led.hpPool) && led.net >= led.hpPool - 1e-9) { led.wiped = true; break; }

      // 相位重构（焦点路径）：每 every 轮回一次。⚠️ 用**本段内**轮序，不是 1 代整场 roundSeq
      //   （本作无该字段）；详见 drainEnemies 同名注释。
      if (healers.length) {
        const roundSeq = r + 1;
        for (const h of healers) {
          if (roundSeq % h.every !== 0) continue;
          const e2 = next[h.i];
          if (!enemyAlive(e2)) continue;
          const mh = h.maxHp;
          const maxTotal = mh ? (Math.max(0, mh.shield || 0) + Math.max(0, mh.armor || 0) + Math.max(0, mh.structure || 0)) : 0;
          let rem = maxTotal * h.pct;
          for (let Li = 0; Li < 3 && rem > 1e-12; Li++) {
            const capHp = mh ? Math.max(0, (mh[LAYER_ORDER[Li]] || 0) - e2.hp[Li]) : 0;
            const add = Math.max(0, Math.min(capHp, rem));
            e2.hp[Li] += add;
            rem -= add;
          }
        }
      }
    }

    let anyLeft = false;
    for (const t of AMMO_TYPES) if (P.ammoRate[t] > 0 && stock[t] > 0) anyLeft = true;
    const ammoUsed = {};
    for (const t of AMMO_TYPES) {
      const before = Math.max(0, (res && res[AMMO_OF[t]]) || 0);
      const used = before - stock[t];
      if (used > 0) ammoUsed[AMMO_OF[t]] = used;
    }
    return {
      next: next, dmg: dmg, hits: hits, misses: misses, fireSec: fireSec,
      killed: killed, ammoUsed: ammoUsed, allDry: P.weapons.length > 0 && !anyLeft,
      ledger: led, wiped: led.wiped,
    };
  }

  // 本波「还剩多久打完」（逐敌版，与 remainingWaveSec 数学等价，见文件头推导）
  // ★ P1b：含「相位重构」回血 boss 时，血量不再单调 → 上式不成立，改让 drainEnemies 实算
  //   （弹药给足，回血与弹药无关）。实算仍未全灭 ⇒ 打不穿，返回 Infinity 让外层停。
  function enemiesRemainSec(P, list, dryMask, mode) {
    if (!list) return Infinity;
    if (fleetHasHealer(P.fleet)) {
      const rr = drainEnemies(P, list, REMAIN_PROBE_MAX, INF_AMMO_RES, dryMask, mode || "formation");
      if (enemiesAliveCount(rr.next) > 0) return Infinity;
      return rr.fireSec;
    }
    let s = 0;
    for (const e of list) {
      if (!enemyAlive(e)) continue;
      for (let L = 0; L < 3; L++) {
        if (!(e.hp[L] > 0)) continue;
        const d = layerDps(P.dpsByType, LAYER_ORDER[L], dryMask);
        if (!(d > 0)) return Infinity;
        s += e.hp[L] / d;
      }
    }
    return s;
  }

  // 结算某节点 dtSec 秒的战斗（**单波原语**）。
  // waveHp = 已打进当前这支编队的累计伤害（跨 tick 持久，切页签/离线都靠它衔接）。
  // focus = 该节点是否正被玩家注视（真仿真），返回 O(1)。
  // ★ 2026-11-27 P0：本函数被降级为「只负责推进当前这一波」的原语，由外层 advance() 做
  //   波次循环 / 整轮折叠 / 抽签。新增 compId 参数指定本轮编队（省略则走默认编队）。
  function advanceCore(state, nodeId, dtSec, waveHp, focus, compId, resOverride, hpBudget, siteOverride) {
    const dt = Math.max(0, dtSec || 0);
    let wHp = Math.max(0, waveHp || 0);
    // ★ 2026-11-27 P0：多波循环时外层要传「已扣过前几段弹药」的虚拟资源视图，
    //   否则第二段会读到未扣的存量而白打（本函数只读 res 的弹药，不写回）。
    const resView = resOverride || state.res;
    const P = prepareNode(state, nodeId, compId, siteOverride);
    if (!P) {
      return {
        waves: 0, credits: 0, rep: 0, waveHp: wHp, damage: 0, fightSec: 0,
        wiped: false, allDry: false, ammoUsed: null, simmed: false, hits: 0, misses: 0,
        waveSec: 0, progress: 0, fleet: null, fleetHp: 0,
        squadDps: 0, weaponDps: 0, fleetDps: 0, incomingDps: 0,
        repairPerSec: 0, dmgReduction: 0, band: 1,
        combatants: [],
        drops: null,
        killed: [], enemiesLeft: 0,
      };
    }

    // 血池：参战成员当前剩余三防分层统计（盾→甲→构，供紧急维修结构比判定）
    let pool = 0, shieldTotal = 0, armorTotal = 0, structureTotal = 0;
    for (const m of P.members) {
      const sh = (m.hp && m.hp.shield) || 0, ar = (m.hp && m.hp.armor) || 0, st = (m.hp && m.hp.structure) || 0;
      pool += Math.max(0, sh) + Math.max(0, ar) + Math.max(0, st);
      shieldTotal += Math.max(0, sh); armorTotal += Math.max(0, ar); structureTotal += Math.max(0, st);
    }

    // ★ P1c：承伤账本参数。hpBudget 由外层逐段传（多段循环里 hpLeft 已被前几段吃掉），
    //   缺省用本队满血池。紧急维修的结构比在账本内部按「累计净伤」动态判定，
    //   不再是 P1a 那套「满编火力 × 总时长当上界」的事后补算（火力递减后那个上界偏大）。
    const ledOpts = {
      hpPool: (typeof hpBudget === "number" && isFinite(hpBudget)) ? hpBudget : pool,
      shield: shieldTotal, armor: armorTotal, structure: structureTotal,
      emergencyRepair: P.emergencyRepair || 0,
    };

    let dmg = 0, fireSec = 0, ammoUsed = null, allDry = false, hits = 0, misses = 0, simmed = false, fuelStarved = false;
    let noWeapon = false;
    let led = null;
    let wiped = false;

    // ★ P1a：逐敌状态（缺失 / 与当前编队不符 → 重建；旧档 combatWaveHp 作一次性迁移源）
    //   ★ 死亡空间：siteOverride.stateKey 用独立键，与同节点普通据点完全隔离。
    const stKey = (siteOverride && siteOverride.stateKey) || nodeId;
    const ens = ensureEnemies(state, stKey, P.fleet, wHp);
    const enemies = ens.list;
    // ★ P1b：索敌模式（队内无 classTier>=3 的船 → 强制按编队顺序，与 1 代 capital-only 同规则）
    const tMode = targetModeOf(state, nodeId, P.targetUnlocked);
    let nextEnemies = enemies;
    let killed = [];

    if (focus && dt > 0 && dt <= SIM_MAX_SEC) {
      simmed = true;
      const sv = volleyEnemies(P, enemies, resView, dt, tMode, ledOpts);
      fireSec = P.weapons.length > 0 ? sv.fireSec : 0;   // 没武器 = 打不动（1 代同规则）
      dmg = sv.dmg;
      ammoUsed = sv.ammoUsed;
      allDry = sv.allDry;
      hits = sv.hits;
      misses = sv.misses;
      noWeapon = P.weapons.length === 0;
      nextEnemies = sv.next;
      killed = sv.killed;
      led = sv.ledger;
      wiped = sv.wiped;
    } else {
      const fp = drainEnemies(P, enemies, dt, resView, null, tMode, ledOpts);
      fireSec = fp.fireSec;
      ammoUsed = fp.ammoUsed;
      allDry = fp.allDry;
      noWeapon = fp.noWeapon;
      dmg = fp.dmg;
      nextEnemies = fp.next;
      killed = fp.killed;
      led = fp.ledger;
      wiped = fp.wiped;
    }

    // 血池在本段内被打空：当场撤离，剩余时间不再产出（离线 8 小时不会凭空吃伤害）。
    // ★ P1c：截断点已经由账本（fireLedgerCap）在闭式循环里精确求出，不再「先算 fireSec 再按
    //   pool/incoming 截断重推」——那个办法要求承伤速率恒定，火力变量化后不成立。
    //   焦点路径例外：掷骰结果不可复现，改用解析式重推一遍（同一 hpPool，截断点确定）。
    if (wiped && simmed) {
      const rr = drainEnemies(P, enemies, dt, resView, null, tMode, ledOpts);
      nextEnemies = rr.next;
      killed = rr.killed;
      dmg = rr.dmg;
      fireSec = rr.fireSec;
      ammoUsed = rr.ammoUsed;
      led = rr.ledger;
      wiped = rr.wiped;
      allDry = false;                       // 这次不是弹尽，是血尽
    }

    // 燃料截断（对回 1 代「燃料耗尽即停火」：战斗燃料按每齐射扣，烧光则本场停火）。
    // 本作唯一燃料池 = base.fuel（与跃迁共用，资源描述已声明「派遣小队与基地迁移」）。
    // perSec = 参战装备每齐射燃料 × 电容折扣 ÷ ROUND_SEC；capMult = 1/(1+最高电容等级×0.02)（1 代 selectors.js:2671）。
    const fuelPool = (state.base && typeof state.base.fuel === "number") ? state.base.fuel : 0;
    const fuelPerVolley = (P.fuelPerVolley || 0);
    if (fuelPerVolley > 0 && fuelPool > 0) {
      const capLv = maxCapacitorLevel(state);   // 舰队最高电容等级统筹能效（1 代 squad 取最优）
      const capMult = 1 / (1 + capLv * 0.02);
      const perSec = fuelPerVolley * capMult / ROUND_SEC;
      const fuelMaxSec = fuelPool / perSec;
      if (fuelMaxSec < fireSec - 1e-9) {
        const rr = drainEnemies(P, enemies, Math.max(0, fuelMaxSec), resView, null, tMode, ledOpts);
        nextEnemies = rr.next;
        killed = rr.killed;
        dmg = rr.dmg;
        fireSec = rr.fireSec;
        ammoUsed = rr.ammoUsed;
        led = rr.ledger;
        setCombatFuel(state, 0);      // 烧光（1 代 clamp 到 0 后门禁停火）
        fuelStarved = true;
        allDry = false;
        wiped = rr.wiped;             // 燃料先于血池打空 ⇒ 这不是战败
      } else {
        setCombatFuel(state, fuelPool - perSec * fireSec);
      }
    }

    // ★ P1a：提交逐敌状态；旧口径 combatWaveHp 彻底退役（不留两本账）
    //   ★ 死亡空间：stKey 在 ensureEnemies 处已按 siteOverride.stateKey 算好，写进独立键。
    state.combatEnemies[stKey] = nextEnemies;
    if (state.combatWaveHp) delete state.combatWaveHp[stKey];

    const remainTotal = enemiesRemainTotal(nextEnemies);
    const allDead = remainTotal <= 1e-9;
    const waves = allDead ? 1 : 0;                              // 单波原语：本段最多打穿 1 波
    wHp = allDead ? 0 : Math.max(0, P.fleetHp - remainTotal);   // 本波已打掉的伤害（兼容口径）

    // ★ P1c：damage 不再是「一个速率 × 总时长」，而是账本逐段累加的净伤
    //   （敌舰阵亡 → 火力递减 → 同样的秒数挨得更少）。这是本轮唯一的数值变化来源。
    const damage = led ? Math.max(0, led.net) : 0;
    // 面板显示的「敌方火力 /s」用本段平均（起手满编值会一直骗人）。无战斗时长时回落到满编值。
    const avgIncoming = fireSec > 1e-9 ? (damage / fireSec) : P.incomingDps;
    const progress = P.fleetHp > 0 ? Math.max(0, Math.min(1, wHp / P.fleetHp)) : 1;

    // 战术材料掉落（band N → tactic:tN）：与 credits/rep 同口径按 waves 缩放；这是 tactic 唯一获取途径。
    const tacticDrops = {};
    if (waves > 0) tacticDrops["tactic:t" + P.band] = DROP_TACTIC_BASE * waves;

    return {
      waves: waves,
      credits: P.dropCredits * waves,
      rep: P.dropRep * waves,
      waveHp: wHp,
      damage: damage,
      fightSec: fireSec,
      wiped: wiped,
      fuelStarved: fuelStarved,
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
      incomingDps: avgIncoming,
      repairPerSec: P.repairPerSec,
      dmgReduction: P.dmgReduction,
      band: P.band,
      combatants: P.combatants,
      // 参战装备每齐射燃料（未乘电容折扣）。settle 用它算电容管理经验（1 代 volleyFuel×0.3）。
      fuelPerVolley: P.fuelPerVolley || 0,
      drops: tacticDrops,
      // ★ P1a：本段击杀的敌舰索引（升序，对应当前波 fleet.ships 下标）；P2 掉落按它逐只结算
      killed: killed,
      enemiesLeft: enemiesAliveCount(nextEnemies),
    };
  }

  // ================================================================
  // 波次系统（2026-11-27 P0）
  // ----------------------------------------------------------------
  // 1 代 combat.js:318-322 / :1374-1408 原样：
  //   · 每个据点 maxWave = 20，一轮 = 19 个普通波 + 第 20 波 boss
  //   · 第 20 波编队固定 { boss:1, normal:bossEscortCount }，不抽签
  //   · 打穿第 20 波 → 发 clearLp、zoneClears++、c.wave = 1 → **立刻继续生成下一波（永不停）**
  // 本作：state.combatWave 记 1..20，state.combatClears 记肃清轮数。
  // 编队：每个 band 用不同的池（pirates.BAND_FORMATION_POOLS），只在「波开始时」抽一次
  //       并存进 state.combatWavePlan —— 绝不每 tick 重抽（否则同波血量两次刷新间会跳）。
  // ================================================================

  function _waveBand(state, nodeId) {
    const Data = _Data();
    const Raids = (Data && Data.Raids) ? Data.Raids : null;
    const raid = (Raids && state && state.starMap) ? Raids.raidAt(state.starMap, nodeId) : null;
    return raid ? (raid.band || 1) : 1;
  }

  // 该波次应有的编队：第 20 波固定 boss，其余按 band 抽签
  function planForWave(wave, band) {
    const Pirates = _Pirates();
    const w = Math.max(1, Math.min(MAX_WAVE, Math.round(wave || 1)));
    if (!Pirates) return { compId: "2_normal_1_elite" };
    if (w >= MAX_WAVE) return Pirates.bossFormation(band);   // 不抽签
    return Pirates.rollFormation(band);
  }

  // 确保当前波有合法编队。缺失/非法/与波次不符 → 重抽一次（幂等，可在每 tick 安全调用）。
  // 返回 compId。
  function ensureWavePlan(state, nodeId, band) {
    if (!state.combatWave || typeof state.combatWave !== "object") state.combatWave = {};
    if (!state.combatWavePlan || typeof state.combatWavePlan !== "object") state.combatWavePlan = {};
    if (!state.combatClears || typeof state.combatClears !== "object") state.combatClears = {};

    let w = Math.round(Number(state.combatWave[nodeId]) || 1);
    if (!isFinite(w)) w = 1;
    w = Math.min(MAX_WAVE, Math.max(1, w));
    state.combatWave[nodeId] = w;

    const cur = state.combatWavePlan[nodeId];
    let ok = !!(cur && cur.compId);
    if (ok) {
      // 第 20 波必须是 boss；非第 20 波不能是 boss（跨轮/脏档纠正）
      if (w >= MAX_WAVE && cur.compId !== "boss") ok = false;
      if (w < MAX_WAVE && cur.compId === "boss") ok = false;
    }
    if (!ok) {
      const p = planForWave(w, band);
      state.combatWavePlan[nodeId] = { compId: p.compId };
    }
    return state.combatWavePlan[nodeId].compId;
  }

  // 打穿 n 波后推进指针：wave++；从第 20 波跨出时 clears++（肃清一轮）并把 wave 归 1。
  // ⚠️ 不清空 combatWaveHp —— 调用方负责归零（新波从 0 血开始）。
  function advanceWavePointer(state, nodeId, band, n) {
    const steps = Math.max(1, Math.round(n || 1));
    let rounds = 0;
    for (let i = 0; i < steps; i++) {
      const w = Math.min(MAX_WAVE, Math.max(1, Math.round(Number(state.combatWave[nodeId]) || 1)));
      if (w >= MAX_WAVE) {
        state.combatClears[nodeId] = (state.combatClears[nodeId] || 0) + 1;   // 对应 1 代 zoneClears++
        state.combatWave[nodeId] = 1;                                         // 对应 1 代 c.wave = 1
        rounds++;
      } else {
        state.combatWave[nodeId] = w + 1;
      }
      const p = planForWave(state.combatWave[nodeId], band);
      state.combatWavePlan[nodeId] = { compId: p.compId };
    }
    return rounds;   // ★ P2：本次推进完成了几轮（0/1/…），用于发肃清功勋
  }

  // 一整波耗时（任意 dpsByType / 三防总量 / 弹种掩码）—— 折叠与逐波都用它
  function waveSecFrom(dpsByType, hpSum, dryMask) {
    const hs = hpSum || { shield: 0, armor: 0, structure: 0 };
    let s = 0;
    for (const L of LAYER_ORDER) {
      const d = layerDps(dpsByType, L, dryMask);
      if (!(d > 0)) return Infinity;
      s += (hs[L] || 0) / d;
    }
    return s;
  }

  // ★ 本波「还剩多久打完」——不能按血量比例折算！
  //   ⚠️ 血条是线性的，但时间是按层算的（各层 dps 不同：克制 ×1.25 只作用于对应层）。
  //   用 tf*(1-hp/fleetHp) 会系统性偏短：实测 1 秒 tick 下永远差一点点打不穿，
  //   于是「波次推进」全靠浮点兜底，waves 计数恒为 0（波在推进但战报不认）。
  function remainingWaveSec(P, waveHp, dryMask) {
    const hs = P.fleetHpSum || { shield: 0, armor: 0, structure: 0 };
    let hp = Math.max(0, waveHp || 0);
    let s = 0;
    for (const L of LAYER_ORDER) {
      const d = layerDps(P.dpsByType, L, dryMask);
      if (!(d > 0)) return Infinity;
      const layerHp = hs[L] || 0;
      const take = Math.min(layerHp, Math.max(0, hp));
      hp -= take;
      s += (layerHp - take) / d;
    }
    return s;
  }

  // 某个编队「打穿一次」的耗时 + **我方净承伤**（P1c 起两者一次算完）。
  // ★ 为什么不再用 waveSecFrom：承伤现在是逐段积分（敌舰阵亡 → 火力递减），
  //   「一次打穿的净伤」不再等于 速率 × 总时长，必须顺着同一个分段闭式走一遍。
  //   成本 = ≤6 舰 × 3 层 = 常数段（GUARD ≈200 是防呆上界，真实段数远小于它），与 dt 无关。
  //   dt 传 Infinity：走的分支与「打穿为止」完全一致；回血 boss 打不穿时由存活判定返回 null。
  function waveOutcomeOfFleet(Pc, f, dryMask, mode) {
    const list = enemiesFromFleet(f);
    if (!list) return null;
    const rr = drainEnemies(Pc, list, Infinity, INF_AMMO_RES, dryMask, normalizeTargetMode(mode), { hpPool: Infinity });
    if (enemiesAliveCount(rr.next) > 0) return null;    // 打不穿（无火力 / 某层打不动 / 回血抵过输出）
    if (!isFinite(rr.fireSec)) return null;
    return { sec: rr.fireSec, net: rr.ledger ? Math.max(0, rr.ledger.net) : 0 };
  }

  // 某个编队对我方的有效每秒伤害（与 prepareNode 同口径，但可对任意编队求值）
  function effIncomingOf(P, fleet) {
    const aura = fleetAuraMult(fleet);
    let raw = 0;
    for (const s of (fleet.ships || [])) {
      const base = (Number(s.baseDamage) || 0) * (Number(s.auraDamage) ? 1 : aura);
      raw += base * hitCoeff(s.hit, P.playerDodge) / ROUND_SEC;
    }
    const repRaw = (P.repairRawEff !== undefined ? P.repairRawEff : P.repairRaw);
    const repair = Math.min(REPAIR_CAP * raw, repRaw);
    return Math.max(0, raw * (1 - P.dmgReduction) - repair);
  }

  // 一轮的期望：**(MAX_WAVE-1) 个普通波 + 1 个 boss 波**。
  // ⚠️ 普通波必须乘 19 —— 只算一个普通波是「一波的期望」，整轮会小 19 倍（实测离线波数虚高 7 倍）。
  // 编队组合只有 4 种且概率已知 ⇒ 期望是**精确可算**的，不是抽样近似。
  //
  // ★ 2026-11-27 P1a 修：dpsByType 不是「我方火力」，而是「**对阵某支编队**的有效火力」
  //   （命中率分母含该编队按血量加权的闪避 evasion）。精英/boss 闪避更高 ⇒ 同一队人打不同编队
  //   dps 不同（band2 实测：普通 109.51 / 带精英 104.34 / boss 96.31）。原实现复用当前波的 P
  //   去算池里全部编队，导致整轮期望偏短 4~5%（表现为「离线比在线多算 4% 波数」）。
  //   ⇒ 传入 state + nodeId 后，逐编队 prepareNode 取各自 dps；不传则退回旧口径（仅兼容）。
  // ★ 2026-11-27 P1c：承伤也改成逐编队积分（第 7 参 mode = 索敌模式）。
  //   ⚠️ 之前折叠用「满编火力 × 时长」，在线逐波用同一条公式 ⇒ 两边一致但都高估。
  //   P1c 之后在线逐波按存活者递减，折叠若仍用满编公式，8h 离线会系统性多算承伤
  //   ⇒ 必须把 tMode 一起透传，让在线与离线走**同一条**分段路径。
  function expectedRound(P, band, faction, dryMask, state, nodeId, mode) {
    const Pirates = _Pirates();
    if (!Pirates) return null;
    const pool = Pirates.BAND_FORMATION_POOLS[band] || Pirates.BAND_FORMATION_POOLS[1];
    const np = MAX_WAVE - 1;                       // 普通波数量（第 20 波是 boss）
    const tMode = normalizeTargetMode(mode);
    let wSec = 0, wHp = 0, wDmg = 0;
    const wAmmo = { laser: 0, missile: 0, cannon: 0 };
    for (const c of pool) {
      const f = Pirates.fleetFor(band, faction, c.id);
      if (!f || !(f.totalHp > 0)) continue;
      const Pi = (state && nodeId) ? (prepareNode(state, nodeId, c.id) || P) : P;
      const o = waveOutcomeOfFleet(Pi, f, dryMask, tMode);
      if (!o) return null;                           // 打不动某组合 → 不能折叠
      wSec += c.chance * o.sec;
      wHp += c.chance * f.totalHp;
      wDmg += c.chance * o.net;
      for (const ty of AMMO_TYPES) {
        if (dryMask && dryMask[ty]) continue;
        wAmmo[ty] += c.chance * (Pi.ammoRate[ty] || 0) * o.sec;
      }
    }
    if (!(wSec > 0)) return null;

    let sec = wSec * np, hp = wHp * np, dmgTaken = wDmg * np;
    const ammo = { laser: 0, missile: 0, cannon: 0 };
    for (const ty of AMMO_TYPES) ammo[ty] = wAmmo[ty] * np;

    // ★ P2 货柜：折叠路径拿不到真实击坠，用「每轮期望击坠数（按 kind）」代替。
    //   与折叠本身同口径（整轮用期望、余数真抽签），误差量级同样是 CV/√轮数。
    const kills = { normal: 0, elite: 0, boss: 0 };
    for (const c of pool) {
      const f = Pirates.fleetFor(band, faction, c.id);
      for (const s of ((f && f.ships) || [])) {
        const k = (s.kind === "elite" || s.kind === "boss") ? s.kind : "normal";
        kills[k] += c.chance;
      }
    }
    for (const k in kills) kills[k] *= np;

    // 第 20 波：boss 固定编队（不抽签）
    const bf = Pirates.fleetFor(band, faction, "boss");
    if (bf && bf.totalHp > 0) {
      const Pb = (state && nodeId) ? (prepareNode(state, nodeId, "boss") || P) : P;
      const ob = waveOutcomeOfFleet(Pb, bf, dryMask, tMode);
      if (!ob) return null;
      sec += ob.sec;
      hp += bf.totalHp;
      dmgTaken += ob.net;
      for (const ty of AMMO_TYPES) {
        if (dryMask && dryMask[ty]) continue;
        ammo[ty] += (Pb.ammoRate[ty] || 0) * ob.sec;
      }
      for (const s of ((bf.ships) || [])) {
        const k = (s.kind === "elite" || s.kind === "boss") ? s.kind : "normal";
        kills[k] += 1;
      }
    }
    return { sec: sec, hp: hp, dmgTaken: dmgTaken, ammo: ammo, waves: MAX_WAVE, kills: kills };
  }

  // ------------------------------------------------------------------
  // advance：波次外壳（抽签 / 逐波 / 整轮折叠）
  //   · 焦点 + dt ≤ SIM_MAX_SEC → 真仿真（advanceCore 内部走 simulateVolley）
  //   · 非焦点 → 逐波闭式；处于「轮首」且 dt 很大时用期望折叠整轮
  //   返回值字段与旧版完全一致（settle.js 依赖），另外多带 wave / clears / compId。
  // ------------------------------------------------------------------
  function advance(state, nodeId, dtSec, waveHp, focus) {
    const dt = Math.max(0, dtSec || 0);
    const band = _waveBand(state, nodeId);
    let compId = ensureWavePlan(state, nodeId, band);

    const P0 = prepareNode(state, nodeId, compId);
    const EMPTY = {
      waves: 0, credits: 0, rep: 0, waveHp: Math.max(0, waveHp || 0), damage: 0, fightSec: 0,
      wiped: false, allDry: false, ammoUsed: null, simmed: false, hits: 0, misses: 0,
      waveSec: 0, progress: 0, fleet: null, fleetHp: 0,
      squadDps: 0, weaponDps: 0, fleetDps: 0, incomingDps: 0,
      repairPerSec: 0, dmgReduction: 0, band: band,
      combatants: [], drops: null, fuelStarved: false, noWeapon: false, fuelPerVolley: 0,
      wave: state.combatWave[nodeId] || 1, clears: state.combatClears[nodeId] || 0,
      compId: compId, isBossWave: compId === "boss",
      killed: [], kills: { normal: 0, elite: 0, boss: 0 }, enemiesLeft: 0,
    };
    if (!P0) return EMPTY;

    let wHp = Math.max(0, waveHp || 0);
    if (P0.fleetHp > 0 && wHp >= P0.fleetHp) wHp = wHp % P0.fleetHp;

    // ★ P1a：即使 dt = 0 也要把逐敌状态建好（含旧档迁移）。
    //   原因：settle 在 advance 返回后会丢弃 combatWaveHp（迁移源），若这里不迁移，
    //   「同一次结算里 dt=0」或者「首次读档立即暂停」的半截进度会白丢。
    ensureEnemies(state, nodeId, P0.fleet, wHp);
    // 迁移成功即作废旧口径（引擎层自洽：不依赖 settle 是否清理）
    if (state.combatWaveHp && state.combatWaveHp[nodeId] !== undefined
        && Array.isArray(state.combatEnemies && state.combatEnemies[nodeId])) {
      delete state.combatWaveHp[nodeId];
    }

    // 弹药虚拟视图（多段循环里逐段扣减；本函数不改 state.res，由 settle 统一扣）
    const resView = {};
    if (state.res) for (const k in state.res) resView[k] = state.res[k];
    for (const t of AMMO_TYPES) if (resView[AMMO_OF[t]] === undefined) resView[AMMO_OF[t]] = 0;

    const acc = {
      waves: 0, credits: 0, rep: 0, damage: 0, fightSec: 0, hits: 0, misses: 0,
      simmed: false, wiped: false, allDry: false, fuelStarved: false,
      killed: [],
      // ★ P2 货柜：按 kind 的击坠计数（折叠路径是浮点期望值，逐波路径是整数真实值）
      kills: { normal: 0, elite: 0, boss: 0 },
    };
    const ammoTotal = {};
    const dropsTotal = {};
    let lastFight = null;

    function absorb(r) {
      if (!r) return;
      acc.waves += r.waves || 0;
      acc.credits += r.credits || 0;
      acc.rep += r.rep || 0;
      acc.damage += r.damage || 0;
      acc.fightSec += r.fightSec || 0;
      acc.hits += r.hits || 0;
      acc.misses += r.misses || 0;
      if (r.simmed) acc.simmed = true;
      if (r.wiped) acc.wiped = true;
      if (r.allDry) acc.allDry = true;
      if (r.fuelStarved) acc.fuelStarved = true;
      if (r.ammoUsed) {
        for (const k in r.ammoUsed) {
          ammoTotal[k] = (ammoTotal[k] || 0) + r.ammoUsed[k];
          resView[k] = Math.max(0, (resView[k] || 0) - r.ammoUsed[k]);   // 下一段看到的是扣后余量
        }
      }
      if (r.drops) for (const k in r.drops) dropsTotal[k] = (dropsTotal[k] || 0) + r.drops[k];
      // ★ P1a：把「本段击杀的索引」翻成 kind 序列（P2 按 kind 逐只结算掉落，索引跨波会失效）
      if (r.killed && r.killed.length) {
        const fships = (r.fleet && r.fleet.ships) || [];
        for (const idx of r.killed) {
          const kd = fships[idx] ? (fships[idx].kind || "normal") : "normal";
          acc.killed.push(kd);
          acc.kills[kd === "elite" || kd === "boss" ? kd : "normal"] += 1;
        }
      }
      lastFight = r;
    }

    if (dt > 0) {
      // 燃料能撑多久（1 代「燃料耗尽即停火」）：唯一燃料池 base.fuel，与编队无关，一次算
      let remaining = dt;
      const fuelPool = (state.base && typeof state.base.fuel === "number") ? state.base.fuel : 0;
      let fuelStarvedAhead = false;
      const fuelPerVolley = P0.fuelPerVolley || 0;
      if (fuelPerVolley > 0) {
        const capLv = maxCapacitorLevel(state);
        const capMult = 1 / (1 + capLv * 0.02);
        const perSec = fuelPerVolley * capMult / ROUND_SEC;
        if (perSec > 0) {
          const maxByFuel = fuelPool / perSec;
          if (maxByFuel < remaining) { remaining = Math.max(0, maxByFuel); fuelStarvedAhead = true; }
        }
      }

      // 我方血池余量（三防总和）。多段循环必须逐段扣 —— 否则每段都以为自己满血，
      // 离线大 dt 会算出远超血池的总承伤（1 代不会，它逐波扣血）。
      let hpLeft = 0;
      for (const m of (P0.members || [])) {
        const h = m.hp || {};
        hpLeft += Math.max(0, h.shield || 0) + Math.max(0, h.armor || 0) + Math.max(0, h.structure || 0);
      }

      let guard = 0;
      let dryMask = null;   // 逐段由 fireSegments 自行处理；折叠时按全弹种有弹算
      while (remaining > 1e-9 && guard++ < WAVE_GUARD) {
        const curComp = state.combatWavePlan[nodeId] ? state.combatWavePlan[nodeId].compId : compId;
        const P = prepareNode(state, nodeId, curComp);
        if (!P) break;

        // ---- 整轮折叠：只允许在「轮首 + 满血 + 大 dt」发生 ----
        if (!focus && !acc.allDry && wHp <= 1e-9 && (state.combatWave[nodeId] || 1) === 1 && remaining > SIM_MAX_SEC) {
          const e = expectedRound(P, band, P.faction, dryMask, state, nodeId, targetModeOf(state, nodeId, P.targetUnlocked));
          if (e && isFinite(e.sec) && e.sec > 1e-9) {
            // 弹药约束：折叠不能跨过最早打空时刻
            let foldSec = remaining;
            for (const ty of AMMO_TYPES) {
              const rate = P.ammoRate[ty] || 0;
              if (!(rate > 0)) continue;
              const stock = Math.max(0, resView[AMMO_OF[ty]] || 0);
              const limit = stock / rate;
              if (limit < foldSec) foldSec = limit;
            }
            let k = Math.floor(foldSec / e.sec);
            // 血池约束：折叠不能打出超过我方血池的承伤
            if (e.dmgTaken > 0) k = Math.min(k, Math.floor(hpLeft / e.dmgTaken));
            if (k >= 2) {                                  // ≥2 轮才值得折叠（1 轮交给下面的逐波更准）
              acc.waves += k * e.waves;
              acc.credits += P.dropCredits * k * e.waves;
              acc.rep += P.dropRep * k * e.waves;
              acc.damage += e.dmgTaken * k;
              acc.fightSec += e.sec * k;
              hpLeft = Math.max(0, hpLeft - e.dmgTaken * k);
              for (const ty of AMMO_TYPES) {
                if (!(e.ammo[ty] > 0)) continue;
                const kk = AMMO_OF[ty];
                ammoTotal[kk] = (ammoTotal[kk] || 0) + e.ammo[ty] * k;
                resView[kk] = Math.max(0, (resView[kk] || 0) - e.ammo[ty] * k);
              }
              state.combatClears[nodeId] = (state.combatClears[nodeId] || 0) + k;
              state.combatWave[nodeId] = 1;
              // ★ P2 肃清功勋：折叠跨过的 k 轮各发一次 clearLp（与逐波口径一致）
              {
                const Pirates0 = _Pirates();
                const clp = (Pirates0 && Pirates0.clearLpOf) ? Pirates0.clearLpOf(P.band) : 0;
                if (clp > 0) acc.rep += clp * k;
              }
              // ★ P2 货柜：折叠跨过的 k 轮，其击坠按「每轮期望 × k」记账（浮点，settle 再抽样）
              if (e.kills) {
                acc.kills.normal += (e.kills.normal || 0) * k;
                acc.kills.elite += (e.kills.elite || 0) * k;
                acc.kills.boss += (e.kills.boss || 0) * k;
              }
              const np = planForWave(1, band);
              state.combatWavePlan[nodeId] = { compId: np.compId };
              // ★ P1a：整轮折叠跨过 k 轮 → 逐敌状态必须作废（下轮按新编队满血重建）
              if (state.combatEnemies) delete state.combatEnemies[nodeId];
              remaining -= k * e.sec;
              if (hpLeft <= 1e-9) { acc.wiped = true; break; }   // 血打空 → 当场撤离
              continue;
            }
          }
        }

        // ---- 逐波：只打到本波结束，绝不跨波（跨波编队不同，会算错）----
        // ★ P1a：本波还剩多久要按「逐敌血」算（与聚合版 remainingWaveSec 数学等价，见文件头推导）
        const ensW = ensureEnemies(state, nodeId, P.fleet, wHp);
        const need = enemiesRemainSec(P, ensW.list, dryMask, targetModeOf(state, nodeId, P.targetUnlocked));
        if (!isFinite(need) || need <= 1e-9) break;         // 打不穿（无武器/被弹种锁死）→ 停
        // ★ P1c：血池截断不再预判「hpLeft / incomingDps」（那要求承伤速率恒定，
        //   而敌舰陆续阵亡后速率是递减的）—— 改把 hpLeft 当预算交给账本，
        //   由 fireLedgerCap 在段内精确求出「打到第几秒血尽」。
        const segSec = Math.min(need, remaining);
        if (segSec <= 1e-9) break;

        const r = advanceCore(state, nodeId, segSec, wHp, focus, curComp, resView, hpLeft);
        absorb(r);
        wHp = r.waveHp || 0;
        remaining -= (r.fightSec || 0);
        hpLeft = Math.max(0, hpLeft - (r.damage || 0));
        if (acc.allDry || acc.wiped || acc.fuelStarved) break;
        if (hpLeft <= 1e-9) { acc.wiped = true; break; }

        const cleared = r.waves || 0;
        // 浮点兜底：分段误差可能让 wHp 差一点点没到 fleetHp，此时仍应判定打穿，
        // 否则会永远卡在这一波、离线剩余时间全部白丢。
        const nearly = P.fleetHp > 0 && wHp >= P.fleetHp - 1e-6;
        if (cleared >= 1 || nearly) {
          if (cleared < 1) {                              // 兜底打穿要自己记数，否则战报/掉落漏一波
            acc.waves += 1;
            acc.credits += P.dropCredits;
            acc.rep += P.dropRep;
            if (P.band > 0) {
              const tk = "tactic:t" + P.band;
              dropsTotal[tk] = (dropsTotal[tk] || 0) + DROP_TACTIC_BASE;
            }
          }
          wHp = 0;                                        // 新波从 0 血开始
          // ★ P1a：必须在这里作废逐敌状态。否则「旧波全灭 + 新波 kind 序列相同」
          //   （如 3_normal → 3_normal）会通过 ensureEnemies 的结构校验，留下全 0 血的编队，
          //   下一段 enemiesRemainSec 返回 0 → 永远卡在「打不动」，实测在线 8h 只推进 1 波。
          if (state.combatEnemies) delete state.combatEnemies[nodeId];
          const roundDone = advanceWavePointer(state, nodeId, band, 1);
          // ★ P2 肃清功勋：打穿第 20 波（= 完成一轮）额外发 clearLp（1 代 :1374-1380）
          if (roundDone > 0) {
            const Pirates0 = _Pirates();
            const clp = (Pirates0 && Pirates0.clearLpOf) ? Pirates0.clearLpOf(P.band) : 0;
            if (clp > 0) acc.rep += clp * roundDone;
          }
          continue;                                       // 继续下一波
        }
        break;                                            // 没打穿：时间用完了
      }

      if (fuelStarvedAhead && remaining <= 1e-9) acc.fuelStarved = true;
    }

    // 收尾用「当前波」的编队做展示（fleet/fleetHp/progress 等 UI 字段）
    const curC = state.combatWavePlan[nodeId] ? state.combatWavePlan[nodeId].compId : compId;
    const Pf = prepareNode(state, nodeId, curC) || P0;
    // ★ P1a：进度按逐敌真实剩余血算（wHp 只是兼容口径，波刚推进时会滞后一格）
    const ensF = ensureEnemies(state, nodeId, Pf.fleet, 0);
    const remainF = enemiesRemainTotal(ensF.list);
    const progress = Pf.fleetHp > 0 ? Math.max(0, Math.min(1, (Pf.fleetHp - remainF) / Pf.fleetHp)) : 1;

    const ammoOut = {};
    for (const k in ammoTotal) {
      if (!(ammoTotal[k] > 0)) continue;
      const have = Math.max(0, (state.res && state.res[k]) || 0);
      const v = Math.min(ammoTotal[k], have);
      if (v > 0) ammoOut[k] = v;
    }

    return {
      waves: acc.waves,
      credits: acc.credits,
      rep: acc.rep,
      waveHp: wHp,
      damage: acc.damage,
      fightSec: acc.fightSec,
      wiped: acc.wiped,
      fuelStarved: acc.fuelStarved,
      allDry: acc.allDry,
      noWeapon: (lastFight && lastFight.noWeapon) || false,
      ammoUsed: Object.keys(ammoOut).length ? ammoOut : null,
      simmed: acc.simmed,
      hits: acc.hits,
      misses: acc.misses,
      waveSec: Pf.waveSec,
      progress: progress,
      fleet: Pf.fleet,
      fleetHp: Pf.fleetHp,
      squadDps: Pf.squadDps,
      weaponDps: Pf.weaponDps,
      fleetDps: Pf.fleetDps,
      incomingDps: (lastFight && lastFight.incomingDps) || Pf.incomingDps,
      repairPerSec: Pf.repairPerSec,
      dmgReduction: Pf.dmgReduction,
      band: band,
      combatants: Pf.combatants,
      // 参战装备每齐射燃料（未乘电容折扣）：settle 用 r.fuelPerVolley × capMult × 0.3
      // 复刻 1 代电容管理经验（combat.js:1771 volleyFuel×0.3）。装配不变 ⇒ 取 P0 即可。
      fuelPerVolley: P0.fuelPerVolley || 0,
      drops: Object.keys(dropsTotal).length ? dropsTotal : null,
      wave: state.combatWave[nodeId] || 1,
      clears: state.combatClears[nodeId] || 0,
      compId: curC,
      isBossWave: curC === "boss",
      killed: acc.killed,
      kills: acc.kills,          // ★ P2 货柜：按 kind 的击坠数（折叠段为浮点期望）
      enemiesLeft: enemiesAliveCount(ensF.list),
    };
  }

  // 编队血条快照（UI 用）。第二参两种形态：
  //   · 逐敌数组 state.combatEnemies[nodeId]  → P1a 默认，**真实每只三防**（谁死了就是谁死了）
  //   · 数字 progress(0~1)                    → 旧口径，按总血线性摊算（保留给探针/对照）
  // 纯读、零副作用、O(艘数)；只在 UI 需要绘制时调用，不进结算热路径。
  function fleetSnapshot(fleet, progressOrEnemies, mode) {
    if (!fleet || !fleet.ships) return null;

    if (Array.isArray(progressOrEnemies)) {
      const arr = progressOrEnemies;
      let remainTotal = 0, cleared = 0;
      const ships = fleet.ships.map(function (s, i) {
        const e = arr[i];
        const hp = (e && e.hp)
          ? { shield: Math.max(0, e.hp[0] || 0), armor: Math.max(0, e.hp[1] || 0), structure: Math.max(0, e.hp[2] || 0) }
          : { shield: s.maxHp.shield, armor: s.maxHp.armor, structure: s.maxHp.structure };
        const remain = hp.shield + hp.armor + hp.structure;
        remainTotal += remain;
        const dead = remain <= 0;
        if (dead) cleared++;
        return {
          id: s.id, name: s.name, kind: s.kind, kindCn: s.kindCn,
          maxHp: s.maxHp, total: s.total, hp: hp, remaining: remain, cleared: dead,
        };
      });
      // ★ P1b：高亮框必须指向「按索敌模式真正在打的那只」，否则面板与结算两套目标
      const targetIdx = pickTarget(arr, mode, fleet.ships);
      const p = fleet.totalHp > 0 ? Math.max(0, Math.min(1, 1 - remainTotal / fleet.totalHp)) : 1;
      return {
        title: fleet.title, factionName: fleet.factionName, band: fleet.band,
        totalHp: fleet.totalHp, dps: fleet.dps, ships: ships,
        targetIdx: targetIdx, cleared: cleared, progress: p,
      };
    }

    const p = Math.max(0, Math.min(1, progressOrEnemies || 0));
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
    prepareNode, advance, advanceCore, fleetSnapshot, fireSegments, simulateVolley, drainHp, fittedFuelCost, scanFit,
    // ★ 2026-11-27 P0 波次系统
    MAX_WAVE, WAVE_GUARD, ensureWavePlan, advanceWavePointer, planForWave, waveSecFrom, remainingWaveSec, expectedRound, effIncomingOf,
    // ★ 2026-11-27 P1a 逐敌实例（D1 = 路线 B）
    KIND_CODE, enemiesFromFleet, ensureEnemies, enemyAlive, enemiesAliveCount, enemiesRemainTotal,
    drainEnemies, volleyEnemies, applyDamage, enemiesRemainSec,
    // ★ 2026-11-27 P1b 索敌模式 + boss 特殊机制
    TARGET_MODES, TARGET_UNLOCK_TIER, normalizeTargetMode, targetModeName, targetModeOf,
    targetUnlockedFor, setTargetMode, pickTarget,
    // ★ 2026-11-27 P1c 敌方火力变量化
    enemyShotProfile, aliveFire, waveOutcomeOfFleet,
    fleetAuraMult, fleetRepairSuppr, fleetHasHealer,
    maxCapacitorLevel, enemiesFromFleet,   // ★ 死亡空间 A3 折叠：燃料闸门 + 逐敌重建
  };
});
