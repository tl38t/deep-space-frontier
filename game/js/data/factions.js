// ================================================================
// 深空星疆 —— Data.Factions：势力定义 + questBoard 任务生成
// 势力周期性派发「提交物品」任务（矿石/矿材/部件/图纸），交付换星币+声望。
// 这是工业链的外部消费者（§10 C-1 / §11），链感总开关。
// 势力名复用 EVE-IDLE 解耦显示名（苍穹劫团/赤誓教团/静默集群）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Factions = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Factions = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 势力两层：
  //   tier:"major"  大型委托势力（苍穹劫团/赤誓教团，任务板置顶）
  //   tier:"minor"  中小型委托势力（6 家，都会发任务，任务类型按 bias 加权）
  //   questGiver:false 野怪势力（静默集群：只出现在战斗/海盗据点，不发布任务、不上任务板）
  // contact = 联络人（name 代号 / title 职务 / img 头像路径，UI 任务板展示）
  // bias = 任务类型权重（ore/mineral/component/blueprint/gas；缺省走旧随机逻辑）
  // dispatchChance = 派遣类突发任务概率（缺省 0.34）
  const FACTIONS = [
    {
      id: "angel", name: "苍穹劫团", color: "#5ad1a0", tier: "major",
      blurb: "游走星区边缘的劫掠者集群，乐见佣兵团壮大以分一杯羹。",
      contact: { name: "隼眼·凯", title: "前线军需谈判官", img: "assets/portraits/factions/nsk_fac_angel_contact.webp" },
    },
    {
      id: "blood", name: "赤誓教团", color: "#e879a8", tier: "major",
      blurb: "军事化狂信守备，只信任肯交付军备与矿材的佣兵。",
      contact: { name: "赤誓·薇拉", title: "宣令官", img: "assets/portraits/factions/nsk_fac_blood_contact.webp" },
    },
    // ---- 中小型委托势力（tier minor）----
    {
      id: "mining_guild", name: "边陲矿业公会", color: "#b5793f", tier: "minor", scale: "中型",
      blurb: "务实蓝领工会，讲批量不讲情面；矿石与矿材的最大买家。",
      contact: { name: "凿岩·戈登", title: "工头", img: "assets/portraits/factions/nsk_fac_mining_guild_contact.webp" },
      bias: { ore: 4, mineral: 3, component: 0.5, blueprint: 0.3, gas: 0.5 }, dispatchChance: 0.25,
    },
    {
      id: "salvage_union", name: "拾荒者联合体", color: "#c9772e", tier: "minor", scale: "中型",
      blurb: "残骸回收老炮，什么都收；部件与打捞物资的主要去向。",
      contact: { name: "废铁·玛拉", title: "首席回收官", img: "assets/portraits/factions/nsk_fac_salvage_union_contact.webp" },
      bias: { ore: 1, mineral: 1, component: 3, blueprint: 0.5, gas: 0.5 }, dispatchChance: 0.3,
    },
    {
      id: "lone_star", name: "孤星商社", color: "#d8c07a", tier: "minor", scale: "中型",
      blurb: "精明独立商队，价高者得；要部件、气体与稀缺贸易品。",
      contact: { name: "金秤·洛", title: "商队总管", img: "assets/portraits/factions/nsk_fac_lone_star_contact.webp" },
      bias: { ore: 0.5, mineral: 1, component: 2.5, blueprint: 1, gas: 2 }, dispatchChance: 0.3,
    },
    {
      id: "abyssal_inst", name: "深空研究院", color: "#9b8fd0", tier: "minor", scale: "中型",
      blurb: "冷峻科研机构，为样本与数据付星币；气体与图纸的大主顾。",
      contact: { name: "静析·伊", title: "首席研究员", img: "assets/portraits/factions/nsk_fac_abyssal_inst_contact.webp" },
      bias: { ore: 0.3, mineral: 0.5, component: 1, blueprint: 1.5, gas: 4 }, dispatchChance: 0.25,
    },
    {
      id: "bounty_league", name: "悬赏者同盟", color: "#b02a1f", tier: "minor", scale: "小型",
      blurb: "赏金猎人网络，专接脏活；突发派遣任务远多于缴纳。",
      contact: { name: "血契·雷", title: "赏金经纪", img: "assets/portraits/factions/nsk_fac_bounty_league_contact.webp" },
      dispatchChance: 0.65,
    },
    {
      id: "settlers", name: "拓殖议会", color: "#b5c46a", tier: "minor", scale: "小型",
      blurb: "边境殖民镇议会，求生优先；需要补给、部件与人力。",
      contact: { name: "新禾·安", title: "镇长", img: "assets/portraits/factions/nsk_fac_settlers_contact.webp" },
      bias: { ore: 1, mineral: 1, component: 2, blueprint: 0.3, gas: 0.5 }, dispatchChance: 0.2,
    },
    // ---- 联邦拓殖公社（序章新增背景势力；玩家继承的家族关系使其初始关系值极高）----
    {
      id: "federation", name: "联邦拓殖公社", color: "#4d8fe0", tier: "minor", scale: "中小型",
      blurb: "统辖内星区的庞大官僚机器，名义上管辖边疆。你继承的家族关系让它在你档案里关系值很高——尽管登记人瑞瓦肖会说，它的光根本照不到这里。",
      contact: { name: "F.I.O.N.A", title: "边疆区统括助理AI", img: "assets/portraits/factions/nsk_fac_federation_contact.webp" },
      bias: { ore: 1, mineral: 1, component: 1, blueprint: 0.5, gas: 1 }, dispatchChance: 0.3,
    },
    // ---- 野怪势力（不发布任务，仅战斗/海盗据点身份）----
    {
      id: "sansha", name: "静默集群", color: "#e8b45a", tier: "major", questGiver: false,
      blurb: "高度同化的机械教团，用星币与资源衡量一切忠诚。（野怪势力，不发布任务）",
      contact: { name: "欧米伽", title: "同步枢机" },
    },
  ];

  // 任务模板：按 tier 决定要哪种产物（越高级越偏向部件/图纸）；矿种/矿材名复用 EVE-IDLE 解耦名
  const TEMPLATES = [
    { kind: "ore",      items: ["fe_ore", "ni_ore", "bo_ore", "mx_ore", "no_ore", "zr_ore", "px_ore"], baseQty: 40 },
    { kind: "mineral",  items: ["fe_alloy", "ni_alloy", "bo_alloy", "mx_alloy", "no_alloy", "zr_alloy", "px_alloy", "morph_alloy"], baseQty: 20 },
    { kind: "component",items: ["struct", "prop", "weapon"],         baseQty: 8 },
    { kind: "blueprint",items: ["bp"],                              baseQty: 1 },
    { kind: "gas",      items: ["crude_fullerene", "he_gas", "stable_fullerene", "hy_gas", "high_purity_fullerene", "poly_gas", "ultra_pure_poly_gas"], baseQty: 30 },
  ];

  function factionById(id) { return FACTIONS.find(f => f.id === id) || null; }

  // 派遣任务（突发任务）可指向的技能 + 任务标题（成功率按该技能等级，§13.7）
  const DISPATCH_SKILLS = ["mining", "scanning", "archaeology", "refine", "manufacture", "invent", "combatLaser", "combatTurret", "command", "defense"];
  const DISPATCH_TITLE = {
    mining: "矿脉抢救", scanning: "信号溯源", archaeology: "遗迹发掘", refine: "炉况抢修", manufacture: "产线救急",
    invent: "图纸攻坚", combatLaser: "激光突袭", combatTurret: "炮台压制", command: "指挥调度", defense: "防线死守",
  };

  // 资源中文名（数据层运行时查 Resources，避免文案裸露 id）
  function itemName(id) {
    const R = (typeof window !== "undefined" && window.NSK.Data) ? window.NSK.Data.Resources : null;
    const m = R && R.meta ? R.meta(id) : null;
    return m ? m.name : id;
  }

  // 按势力 bias 加权挑任务模板（bias 缺省返回 null → 走旧随机链，老势力行为不变）。
  // 图纸在 tierHint<3 时不进池（与旧逻辑一致：低级星系不出图纸单）。
  function weightedTpl(rng, faction, tierHint) {
    const bias = faction && faction.bias;
    if (!bias) return null;
    const pool = [];
    for (const t of TEMPLATES) {
      let w = bias[t.kind] || 0;
      if (t.kind === "blueprint" && tierHint < 3) w = 0;
      if (w > 0) pool.push([t, w]);
    }
    if (!pool.length) return null;
    let total = 0;
    for (const p of pool) total += p[1];
    let r = rng() * total;
    for (const p of pool) { r -= p[1]; if (r <= 0) return p[0]; }
    return pool[pool.length - 1][0];
  }

  // 生成一个任务（确定性 rng）。派遣概率按势力 dispatchChance（缺省 0.34），其余为「提交类」。
  // tier 越高，越可能要部件/图纸、奖励越肥；有 bias 的势力按权重挑提交类型。
  function generateQuest(rng, faction, tierHint) {
    const isDispatch = rng() < ((faction && faction.dispatchChance) || 0.34);
    if (isDispatch) {
      const skill = DISPATCH_SKILLS[Math.floor(rng() * DISPATCH_SKILLS.length)];
      const fat = (tierHint >= 3 ? 1.6 : tierHint >= 2 ? 1.3 : 1.1);
      const reward = {
        credits: Math.round((400 + rng() * 500) * fat),
        rep: Math.round((6 + rng() * 6) * fat),
      };
      return {
        id: "q_" + Date.now().toString(36) + "_" + Math.floor(rng() * 1e6).toString(36),
        factionId: faction.id,
        mode: "dispatch",
        skill: skill,
        title: DISPATCH_TITLE[skill] || "突发任务",
        reward: reward,
        desc: faction.name + " 发布「" + (DISPATCH_TITLE[skill] || "突发") + "」：需派遣擅长「" + skill + "」的团员执行（成功率按技能+舰船+出身）。",
      };
    }
    let tpl = weightedTpl(rng, faction, tierHint);
    if (!tpl) {
      const roll = rng();
      if (tierHint <= 2 && rng() < 0.28) tpl = TEMPLATES[4]; // 气体（低级星系常见，气云产物有去处）
      else if (tierHint >= 3 && roll > 0.4) tpl = TEMPLATES[2 + Math.floor(rng() * 2)]; // 部件/图纸
      else if (tierHint >= 2 && roll > 0.25) tpl = TEMPLATES[1 + Math.floor(rng() * 2)];
      else tpl = TEMPLATES[Math.floor(rng() * 2)]; // 矿石/矿材
    }
    const item = tpl.items[Math.floor(rng() * tpl.items.length)];
    const qty = tpl.baseQty + Math.floor(rng() * tpl.baseQty);
    const fat = tpl.kind === "component" ? 2.2 : tpl.kind === "blueprint" ? 4 : 1;
    // 熔炼增产任务（周六）：矿材类提交任务有概率标记 smeltBoost → 酬劳 ×2（星币与声望同倍）
    const smeltBoost = tpl.kind === "mineral" && rng() < 0.6;
    const boostMult = smeltBoost ? 2 : 1;
    const reward = {
      credits: Math.round(qty * 30 * fat * (0.8 + rng() * 0.4) * boostMult),
      rep: Math.round((qty * 0.4 + 4) * fat * boostMult),
    };
    return {
      id: "q_" + Date.now().toString(36) + "_" + Math.floor(rng() * 1e6).toString(36),
      factionId: faction.id,
      mode: "submit",
      item: item,
      qty: qty,
      smeltBoost: smeltBoost,
      reward: reward,
      desc: faction.name + " 需要 " + qty + " 单位「" + itemName(item) + "」，交付以换取酬劳。"
        + (smeltBoost ? "（熔炼增产 · 双倍酬劳）" : ""),
    };
  }

  return { FACTIONS, factionById, generateQuest, TEMPLATES };
});
