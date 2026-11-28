/* 深空星疆 · 死亡空间引擎（engine/deathspace.js）
 *
 * 2026-11-27：1 代死亡空间（DED 2/10~10/10，16 副本）复刻。A3 方案 = 独立状态机 +
 *   自动续本 + 整本闭式折叠。核心原则：
 *
 * ① 完全独立于普通 20 波引擎：普通据点走 Combat.advance（state.combatWave[nodeId] 循环），
 *    死亡空间走本文件的 dsRuns[nodeId]（3~6 波有限副本，打穿 final 出本）。两套状态零交叉。
 * ② O(1) 离线契约：一本期望 = 3~6 波的闭式之和（waveOutcomeOfFleet），k 本一次乘除算完，
 *    循环次数与离线时长无关。受钥匙数 / 血池 / 弹药 / 燃料四道闸门约束。
 * ③ 逐波真仿真只在焦点 + dt≤6s 时发生（复用 advanceCore 单波原语，注入自定义 fleet）。
 * ④ 逐敌状态写进独立键 stateKey = "ds@" + nodeId，绝不污染同节点普通据点。
 *
 * 数据来源：data/deathspace.js（16 副本，逐值照搬 1 代 combat.js DEATHSPACE_DATABASE）。
 * 编队：data/pirates.js fleetForSite()（1 代 systems/combat.js buildDeathspaceWave 原式）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else {
    var NSK = root.NSK || (root.NSK = {});
    NSK.Engine = NSK.Engine || {};
    NSK.Engine.DeathSpace = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const RESERVE_DEFAULT = 1;        // 钥匙保留阈值：默认留 1 把（防止刷光后连最低档都进不去）
  const DS_GUARD = 64;              // 单本逐波硬闸（3~6 波，64 远够）
  const MAX_RESUME = 512;           // A3 自动续本单次结算的副本数上限（成本硬顶）

  function _D() {
    return (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data : null;
  }
  function _E() {
    return (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine : null;
  }
  function _siteById(id) {
    const D = _D();
    return (D && D.DeathSpace && D.DeathSpace.byId) ? D.DeathSpace.byId(id) : null;
  }
  function _siteForNode(state, nodeId) {
    const D = _D();
    if (!D || !D.Raids || !state.starMap) return null;
    const raid = D.Raids.raidAt(state.starMap, nodeId);
    if (!raid) return null;
    return (D.DeathSpace && D.DeathSpace.siteFor)
      ? D.DeathSpace.siteFor(raid.band, raid.faction) : null;
  }

  function ensure(state) {
    if (!state.dsRuns || typeof state.dsRuns !== "object") state.dsRuns = {};
    if (!state.dsClears || typeof state.dsClears !== "object") state.dsClears = {};
    if (typeof state.dsTicketReserve !== "number") state.dsTicketReserve = RESERVE_DEFAULT;
    if (!state.stats) state.stats = {};
    if (!state.stats.deathspace) state.stats.deathspace = { clears: 0, waves: 0, lastSite: null };
    return state;
  }

  function ticketCount(state, ticket) {
    return Math.max(0, Number(state.res && state.res[ticket]) || 0);
  }
  function reserveOf(state) {
    return Math.max(0, Math.floor(Number(state.dsTicketReserve) || 0));
  }
  function setReserve(state, n) {
    ensure(state);
    state.dsTicketReserve = Math.max(0, Math.min(99, Math.round(Number(n) || 0)));
    return state.dsTicketReserve;
  }
  function spendTicket(state, ticket) {
    if (!state.res) return false;
    if (ticketCount(state, ticket) <= 0) return false;
    state.res[ticket] = ticketCount(state, ticket) - 1;
    return true;
  }

  // 某星系是否能进死亡空间：有副本 + 有成员派在该据点 + 钥匙超过保留阈值
  function canEnter(state, nodeId) {
    ensure(state);
    const site = _siteForNode(state, nodeId);
    if (!site || !site.ticket) return { ok: false, reason: "本星系无对应死亡空间" };
    const have = ticketCount(state, site.ticket);
    const need = 1 + reserveOf(state);
    if (have < need) return { ok: false, reason: "通行密钥不足（需 " + need + "，保留 " + reserveOf(state) + "）", site: site, have: have, need: need };
    const workers = (state.members || []).filter(function (m) {
      return !m.destroyed && m.assignment && m.assignment.type === "combat" && m.assignment.nodeId === nodeId && !m.assignment.mode;
    });
    if (!workers.length) return { ok: false, reason: "该据点无空闲参战成员", site: site };
    return { ok: true, site: site, workers: workers };
  }

  // 进入副本：扣 1 钥匙，成员标记 mode:"deathspace"，建 dsRun。
  function enter(state, nodeId) {
    const chk = canEnter(state, nodeId);
    if (!chk.ok) return chk;
    const site = chk.site;
    ensure(state);
    if (state.dsRuns[nodeId]) return { ok: false, reason: "本星系已在死亡空间中" };
    if (!spendTicket(state, site.ticket)) return { ok: false, reason: "扣密钥失败" };
    for (const m of chk.workers) m.assignment.mode = "deathspace";
    state.dsRuns[nodeId] = {
      siteId: site.id,
      ticket: site.ticket,
      wave: 1,
      startedAt: Date.now(),
    };
    if (state.stats.deathspace) state.stats.deathspace.lastSite = site.id;
    return { ok: true, site: site };
  }

  // 主动撤离：退还**未打波次**不现实（逐波已结算），按 1 代「失败/撤离不返还」——只清状态、成员回据点。
  function leave(state, nodeId, reason) {
    ensure(state);
    const run = state.dsRuns[nodeId];
    if (!run) return null;
    delete state.dsRuns[nodeId];
    const dk = "ds@" + nodeId;
    if (state.combatEnemies) delete state.combatEnemies[dk];
    for (const m of (state.members || [])) {
      if (m.assignment && m.assignment.nodeId === nodeId && m.assignment.mode === "deathspace") {
        delete m.assignment.mode;   // type 仍是 combat、nodeId 不变 → 自动回据点继续挂机
      }
    }
    return { reason: reason || "撤离", siteId: run.siteId, wave: run.wave };
  }

  // 据点精英/BOSS 掉落通行密钥（1 代 ticketChances 各 5%）。
  // kills: {normal, elite, boss}；faction/band 用于只掉「本 band 本势力」的那一种副本钥匙。
  // ⚠️ 掉率逐值照搬 1 代，不入 ALL 之外的键；掉落直接写 state.res。
  function dropTickets(state, kills, faction, band, rng) {
    ensure(state);
    const D = _D();
    if (!D || !D.DeathSpace || !D.DeathSpace.SITES || !kills) return 0;
    const roll = (typeof rng === "function") ? rng : Math.random;
    let got = 0;
    for (const site of D.DeathSpace.SITES) {
      if (site.band !== band || site.faction !== faction) continue;
      if (!site.ticket) continue;
      const ch = site.ticketChances || {};
      let n = 0;
      const ek = Math.max(0, Number(kills.elite) || 0);
      const bk = Math.max(0, Number(kills.boss) || 0);
      for (let i = 0; i < ek; i++) if (roll() < (ch.elite || 0)) n++;
      for (let i = 0; i < bk; i++) if (roll() < (ch.boss || 0)) n++;
      if (n > 0) {
        state.res[site.ticket] = ticketCount(state, site.ticket) + n;
        got += n;
      }
    }
    return got;
  }

  // 二项抽样：把「期望件数」按 n 次伯努利还原成真实件数（保签名装/校准核心的真实分布）。
  function binomial(expected, p, rng) {
    const mu = Math.max(0, Number(expected) || 0);
    if (mu <= 0) return 0;
    const prob = Math.max(1e-9, Math.min(1, Number(p) || 0));
    const n = Math.max(1, Math.round(mu / prob));
    const roll = (typeof rng === "function") ? rng : Math.random;
    let k = 0;
    for (let i = 0; i < n; i++) if (roll() < prob) k++;
    return k;
  }

  // 结算一次掉落（校准核心按 wave.coreChance、协议按 site.protocolChance）。
  // 真抽路径传 wavesDone（整数波序号数组）逐波掷；折叠路径传期望。
  function rollSiteDrops(state, site, waveIdxList, rng, mult) {
    const roll = (typeof rng === "function") ? rng : Math.random;
    const m = Math.max(1, Number(mult) || 1);
    let core = 0, proto = 0;
    for (const wi of waveIdxList) {
      const w = site.waves[wi];
      if (!w) continue;
      if (roll() < (w.coreChance || 0)) core++;
      if (roll() < (site.protocolChance || 0)) proto++;
    }
    core = Math.round(core * m);
    proto = Math.round(proto * m);
    if (core > 0 && site.coreMaterial) state.res[site.coreMaterial] = (state.res[site.coreMaterial] || 0) + core;
    if (proto > 0 && site.protocolMaterial) state.res[site.protocolMaterial] = (state.res[site.protocolMaterial] || 0) + proto;
    return { core: core, proto: proto };
  }

  // 折叠路径掉落：期望件数 × 二项抽样，保真实分布。
  function foldSiteDrops(state, site, booksFolded, rng) {
    const E = _E();
    const roll = (typeof rng === "function") ? rng : Math.random;
    let coreExp = 0, protoExp = 0;
    for (const w of site.waves) coreExp += (w.coreChance || 0);
    protoExp = (site.protocolChance || 0) * site.waves.length;
    coreExp *= booksFolded;
    protoExp *= booksFolded;
    const core = binomial(coreExp, 0.25, roll);
    const proto = binomial(protoExp, site.protocolChance || 0.02, roll);
    if (core > 0 && site.coreMaterial) state.res[site.coreMaterial] = (state.res[site.coreMaterial] || 0) + core;
    if (proto > 0 && site.protocolMaterial) state.res[site.protocolMaterial] = (state.res[site.protocolMaterial] || 0) + proto;
    return { core: core, proto: proto };
  }

  // ===== 探针掉落（2026-11-27 P6）=====
  // 1 代 rollDeathspaceProbeDrops：boss 用 bossChance、其余用 normalChance(=boss×0.25)，
  // 每只击杀独立掷骰，中则入 probe:<id> qty 支。本作探针存 state.archaeology.probes[id]
  // （不是 state.res，resources.js 的 probe: 只做显示名解析）。
  // kills: { normal, elite, boss }；site 决定掉哪种探针。返回 { probeId: 支数 } 供账本/战报。
  function rollProbeDrops(state, site, kills, rng) {
    const roll = (typeof rng === "function") ? rng : Math.random;
    const got = {};
    if (!state || !site || !kills) return got;
    const D = _D();
    const cfgs = (D && D.DeathSpace && D.DeathSpace.probeDropsFor) ? D.DeathSpace.probeDropsFor(site) : [];
    if (!cfgs.length) return got;
    if (!state.archaeology || typeof state.archaeology !== "object") {
      // 引擎侧兜底：正常启动 store.ensure 已建，这里只防探针模块被独立调用。
      state.archaeology = { probes: {}, artifacts: {}, vouchers: {}, protocols: {} };
    }
    if (!state.archaeology.probes || typeof state.archaeology.probes !== "object") state.archaeology.probes = {};
    const probes = state.archaeology.probes;
    const bk = Math.max(0, Math.floor(Number(kills.boss) || 0));
    // 1 代普通小怪才是数量主体：非 boss 一律按 normalChance（含 elite，1 代此处无 elite 档）。
    const nk = Math.max(0, Math.floor(Number(kills.normal) || 0))
      + Math.max(0, Math.floor(Number(kills.elite) || 0));
    for (const c of cfgs) {
      if (!c || !c.probe) continue;
      let n = 0;
      for (let i = 0; i < bk; i++) if (roll() < (c.bossChance || 0)) n += (c.qty || 1);
      for (let i = 0; i < nk; i++) if (roll() < (c.normalChance || 0)) n += (c.qty || 1);
      if (n > 0) {
        probes[c.probe] = (probes[c.probe] || 0) + n;
        got[c.probe] = (got[c.probe] || 0) + n;
      }
    }
    return got;
  }

  // 折叠路径探针掉落：整本击杀构成 = ΣescortNormal 小怪 + waves.length 个 boss，
  // k 本期望件数 → binomial 二项抽样，保真实分布且与 k（离线时长）线性、循环次数不随 dt 增长
  // （binomial 的 n = 期望/概率，副本最多 6 波、k 受 512 本硬顶，恒定有界）。
  function foldProbeDrops(state, site, booksFolded, rng) {
    const roll = (typeof rng === "function") ? rng : Math.random;
    const got = {};
    if (!state || !site || !(booksFolded > 0)) return got;
    const D = _D();
    const cfgs = (D && D.DeathSpace && D.DeathSpace.probeDropsFor) ? D.DeathSpace.probeDropsFor(site) : [];
    if (!cfgs.length) return got;
    if (!state.archaeology || typeof state.archaeology !== "object") state.archaeology = { probes: {} };
    if (!state.archaeology.probes || typeof state.archaeology.probes !== "object") state.archaeology.probes = {};
    const probes = state.archaeology.probes;
    let mobsPerBook = 0;
    for (const w of site.waves) mobsPerBook += Math.max(0, Math.round(w.escortNormal || 0));
    const bossPerBook = Math.max(0, (site.waves || []).length);   // 每波 1 个 leader
    for (const c of cfgs) {
      if (!c || !c.probe) continue;
      const nBoss = binomial(bossPerBook * booksFolded * (c.bossChance || 0), c.bossChance || 0, roll);
      const nMob = binomial(mobsPerBook * booksFolded * (c.normalChance || 0), c.normalChance || 0, roll);
      const n = (nBoss + nMob) * (c.qty || 1);
      if (n > 0) {
        probes[c.probe] = (probes[c.probe] || 0) + n;
        got[c.probe] = (got[c.probe] || 0) + n;
      }
    }
    return got;
  }

  // 一本的闭式期望：Σ每波 waveOutcomeOfFleet + 弹药/承伤/耗时。
  // ⚠️ P 只 prepare 一次（成员装配不变），每波只换 fleet（1 代 buildDeathspaceWave）。
  function expectedBook(P, site, mode) {
    const E = _E();
    const Combat = E && E.Combat;
    const Pirates = _D() && _D().Pirates;
    if (!Combat || !Pirates || !Combat.waveOutcomeOfFleet) return null;
    let sec = 0, net = 0, ammo = { laser: 0, missile: 0, cannon: 0 };
    for (let i = 0; i < site.waves.length; i++) {
      const fleet = Pirates.fleetForSite(site, i + 1);
      if (!fleet || !(fleet.totalHp > 0)) return null;
      const o = Combat.waveOutcomeOfFleet(P, fleet, null, mode);
      if (!o || !(o.sec > 0)) return null;
      sec += o.sec;
      net += o.net;
      for (const ty of Combat.AMMO_TYPES) {
        ammo[ty] += (P.ammoRate[ty] || 0) * o.sec;
      }
    }
    return { sec: sec, net: net, ammo: ammo, waves: site.waves.length };
  }

  // 我方满血池（每本之间回血 → 每本独立预算，不受上一本承伤影响）
  function poolOf(P) {
    let pool = 0;
    for (const m of (P && P.members) || []) {
      const h = m.hp || {};
      pool += Math.max(0, h.shield || 0) + Math.max(0, h.armor || 0) + Math.max(0, h.structure || 0);
    }
    return pool;
  }

  // 主入口：推进某节点的死亡空间。返回与 Combat.advance 同风格的账本，供 settle 统一入账。
  // focus = 玩家注视该节点（逐波真仿真）；非焦点走 A3 整本闭式折叠。
  function advance(state, nodeId, dtSec, focus) {
    const E = _E();
    const Combat = E && E.Combat;
    ensure(state);
    const run = state.dsRuns[nodeId];
    const EMPTY = {
      waves: 0, credits: 0, rep: 0, damage: 0, fightSec: 0, fuelUsed: 0,
      ammoUsed: null, drops: null, probeDrops: null, kills: { normal: 0, elite: 0, boss: 0 },
      wiped: false, allDry: false, simmed: false,
      dsClears: 0, dsTickets: 0, dsSpent: 0, siteId: run ? run.siteId : null,
      // 战斗技能经验账本（settle 的 grantCombatSkillXp 消费）：
      //   1 代副本战斗与普通战斗共用同一段经验循环，故这里必须与 Combat.advance 同形暴露。
      combatants: null, fuelPerVolley: 0, band: 0,
    };
    if (!run || !Combat) return EMPTY;
    const site = _siteById(run.siteId);
    if (!site) return EMPTY;
    const dt = Math.max(0, dtSec || 0);
    const dk = "ds@" + nodeId;
    const mode = Combat.normalizeTargetMode
      ? Combat.normalizeTargetMode((state.combatTargeting && state.combatTargeting[nodeId]) || "formation")
      : "formation";

    // 用真实 nodeId prepare（成员筛选按 assignment.nodeId），注入首波 fleet 让 prepareNode 不依赖 raid 编队
    const firstFleet = (_D().Pirates && _D().Pirates.fleetForSite) ? _D().Pirates.fleetForSite(site, run.wave) : null;
    if (!firstFleet) return EMPTY;
    const ovBase = { fleet: firstFleet, band: site.band, faction: site.faction, noLoot: true, stateKey: dk };
    const P = Combat.prepareNode(state, nodeId, "ds_wave_" + run.wave, ovBase);
    if (!P) return EMPTY;

    const acc = {
      waves: 0, credits: 0, rep: 0, damage: 0, fightSec: 0, fuelUsed: 0,
      ammoUsed: {}, drops: {}, probeDrops: {}, kills: { normal: 0, elite: 0, boss: 0 },
      wiped: false, allDry: false, simmed: false,
      dsClears: 0, dsTickets: 0, dsSpent: 0, siteId: site.id,
      // 与 Combat.advance 同形：参战成员技能键 + 每齐射燃料 + 安等（供 settle 统一发战斗经验）
      combatants: P.combatants || null, fuelPerVolley: P.fuelPerVolley || 0, band: site.band,
    };
    const absorb = function (r) {
      if (!r) return;
      acc.waves += r.waves || 0;
      acc.damage += r.damage || 0;
      acc.fightSec += r.fightSec || 0;
      if (r.simmed) acc.simmed = true;
      if (r.wiped) acc.wiped = true;
      if (r.allDry) acc.allDry = true;
      if (r.ammoUsed) for (const k in r.ammoUsed) acc.ammoUsed[k] = (acc.ammoUsed[k] || 0) + r.ammoUsed[k];
      if (r.killed && r.fleet) {
        // 探针掉落按本段真实击杀逐只掷（1 代原式）；账本只记数量，探针另有分支写 state.archaeology.probes。
        const segKills = { normal: 0, elite: 0, boss: 0 };
        for (const idx of r.killed) {
          const s = r.fleet.ships[idx];
          const k = s && s.kind === "boss" ? "boss" : (s && s.kind === "elite" ? "elite" : "normal");
          acc.kills[k]++;
          segKills[k]++;
        }
        const pd = rollProbeDrops(state, site, segKills, Math.random);
        for (const pid in pd) acc.probeDrops[pid] = (acc.probeDrops[pid] || 0) + pd[pid];
      }
    };
    const finishBook = function () {
      acc.dsClears++;
      acc.rep += (site.waveLp || 1) * site.waves.length + (site.clearLpBonus || 0);
      state.dsClears[site.id] = (state.dsClears[site.id] || 0) + 1;
      if (state.stats.deathspace) {
        state.stats.deathspace.clears++;
        state.stats.deathspace.waves += site.waves.length;
      }
    };

    if (dt <= 0) return acc;

    // ---- 逐波真仿真：焦点 + 短 dt（在线看血条）----
    if (focus && dt <= Combat.SIM_MAX_SEC) {
      let remaining = dt;
      let guard = 0;
      while (remaining > 1e-9 && guard++ < DS_GUARD && run.wave <= site.waves.length) {
        const fleet = _D().Pirates.fleetForSite(site, run.wave);
        if (!fleet) break;
        const ov = {
          fleet: fleet, band: site.band, faction: site.faction,
          noLoot: true, stateKey: dk,
        };
        // 单波原语一次只推进一段：焦点 dt≤6s 直接整段喂进去，advanceCore 内部走
        //   volleyEnemies 真抽签，波打穿由 r.waves 判定（无需预探测 remainSec，首次逐敌状态还没建）。
        const segSec = remaining;
        const r = Combat.advanceCore(state, nodeId, segSec, 0, true,
          "ds_wave_" + run.wave, state.res, poolOf(P), ov);
        absorb(r);
        remaining -= (r.fightSec || 0);
        if (r.wiped || r.allDry) break;
        if ((r.waves || 0) >= 1 || (P.fleetHp > 0 && (r.waveHp || 0) >= P.fleetHp - 1e-6)) {
          run.wave++;
          if (state.combatEnemies) delete state.combatEnemies[dk];
          if (run.wave > site.waves.length) finishBook();
        }
      }
      if (run.wave > site.waves.length) leave(state, nodeId, "全通出本");
      return acc;
    }

    // ---- A3 整本闭式折叠：非焦点（含离线大 dt）----
    const book = expectedBook(P, site, mode);
    if (!book || !(book.sec > 0)) return acc;

    // 四道闸门：钥匙数 / 血池 / 弹药 / 燃料 / 时间
    let have = ticketCount(state, site.ticket);
    const reserve = reserveOf(state);
    let kTickets = Math.max(0, have - reserve);       // 保留阈值：留 reserve 把不刷
    let k = Math.floor(dt / book.sec);
    k = Math.min(k, kTickets, MAX_RESUME);
    if (book.net > 0) k = Math.min(k, Math.floor(poolOf(P) / book.net));   // 每本回血 → 单本承伤不能打死本队
    for (const ty of Combat.AMMO_TYPES) {
      const rate = book.ammo[ty] || 0;
      if (!(rate > 0)) continue;
      const stock = Math.max(0, Number(state.res && state.res[Combat.AMMO_OF[ty]]) || 0);
      k = Math.min(k, Math.floor(stock / rate));
    }
    if (Combat.fittedFuelCost && state.base && typeof state.base.fuel === "number") {
      const fuelPerVolley = P.fuelPerVolley || 0;
      if (fuelPerVolley > 0) {
        const capLv = Combat.maxCapacitorLevel ? Combat.maxCapacitorLevel(state) : 1;
        const perSec = fuelPerVolley / (1 + capLv * 0.02) / Combat.ROUND_SEC;
        if (perSec > 0) k = Math.min(k, Math.floor(state.base.fuel / (perSec * book.sec)));
      }
    }
    if (k <= 0) return acc;

    // 一次算完 k 本：纯乘除，与 dt 大小无关（O(1)）
    acc.waves += k * book.waves;
    // ⚠️ 承伤只记**一本**的净伤，不是 ×k：1 代每本之间回满血（见 poolOf 注释），
    //   所以打完 k 本后成员的剩余血量 = 血池 − 最后一本的承伤。曾经写成 book.net×k，
    //   会让离线折叠把整队当场打穿（k 本伤害累加），与「副本内每本回血」直接矛盾。
    acc.damage += book.net;
    acc.fightSec += book.sec * k;
    for (const ty of Combat.AMMO_TYPES) {
      if (book.ammo[ty] > 0) acc.ammoUsed[Combat.AMMO_OF[ty]] = book.ammo[ty] * k;
    }
    acc.dsClears = k;
    acc.rep += ((site.waveLp || 1) * site.waves.length + (site.clearLpBonus || 0)) * k;
    acc.dsSpent = k;
    state.res[site.ticket] = ticketCount(state, site.ticket) - k;   // 扣 k 把（已含保留阈值约束）
    state.dsClears[site.id] = (state.dsClears[site.id] || 0) + k;
    if (state.stats.deathspace) {
      state.stats.deathspace.clears += k;
      state.stats.deathspace.waves += k * site.waves.length;
    }
    // 二项抽样掉落（保真实分布）
    const dr = foldSiteDrops(state, site, k, Math.random);
    acc.drops[site.coreMaterial] = dr.core;
    acc.drops[site.protocolMaterial] = dr.proto;
    // 探针掉落：折叠整本一次算（写 state.archaeology.probes），账本单独记供 UI 显示。
    const pdr = foldProbeDrops(state, site, k, Math.random);
    for (const pid in pdr) acc.probeDrops[pid] = (acc.probeDrops[pid] || 0) + pdr[pid];
    // 逐敌状态作废（折叠跨过 k 本，下一本按新编队满血重建）
    if (state.combatEnemies) delete state.combatEnemies[dk];
    run.wave = 1;
    // A3 自动续本后仍在副本中：成员保持 mode，下一次 tick 继续；钥匙见底则自动出本
    if (ticketCount(state, site.ticket) <= reserve) leave(state, nodeId, "密钥见底出本");
    return acc;
  }

  return {
    RESERVE_DEFAULT: RESERVE_DEFAULT,
    ensure: ensure,
    canEnter: canEnter,
    enter: enter,
    leave: leave,
    advance: advance,
    dropTickets: dropTickets,
    rollProbeDrops: rollProbeDrops,
    foldProbeDrops: foldProbeDrops,
    reserveOf: reserveOf,
    setReserve: setReserve,
    ticketCount: ticketCount,
    binomial: binomial,
    expectedBook: expectedBook,
    siteForNode: _siteForNode,
  };
});
