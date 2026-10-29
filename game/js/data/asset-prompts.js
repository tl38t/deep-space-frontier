// ================================================================
// 深空星疆 —— Data.AssetPrompts：美术生图 Prompt 单一机器可读源
// 收敛自三份 md（势力联络人 / 中小型势力 / 军团 NPC 头像），供 asset-admin.html
// 可视化编辑 + 一键拼装完整 prompt（base + accent + 变体 + 负向）。
// 零 DOM 依赖，可 require（Node 探针）。
// 命名/IP：全部 ASCII 稳定键 + 自研文案，无外部作品裸名/商标。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.AssetPrompts = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.AssetPrompts = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // —— 共享基底 / 负向（与 game 美术家族一致）——
  const CONTACT_BASE =
    "Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral confident expression, soft studio lighting with one colored key light, plain dark gradient background with no environment, composed as a holographic communications feed with a thin HUD line frame and subtle corner signal ticks, high detail on face and outfit, game-key-art quality, polished, cinematic.";
  const CONTACT_NEGATIVE =
    "extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body";

  const NPC_BASE =
    "Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.";
  const NPC_NEGATIVE = CONTACT_NEGATIVE;

  // —— 「清凉版」修饰层（用户 2026-10-24 要求：女角色穿清凉点 / 卖肉向）——
  // 逐原型在 NPC_ARCHETYPES[].reveal 里手写专属清凉穿搭（更贴合各职业审美）；
  // 此处 NPC_REVEALING 仅作未写 reveal 时的兜底。风格保持硬科幻概念图，不走暴露/色情。
  const NPC_REVEALING =
    "revealing sci-fi outfit variant: form-fitting bodysuit with strategic cutouts and an exposed midriff, confident alluring pose, glamour-ready styling, fabric with subtle tech detailing and a single accent seam.";

  // —— 义体特征片段（叠加到 NPC 头图「变体」行之后，与出身/变体自由组合）——
  const NPC_AUG_EYE =
    "Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.";
  const NPC_AUG_LIMB =
    "Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.";

  // —— 变体标签（仅用于后台下拉显示；实际发色/性别/年龄 token 存在各原型 variants[]）——
  const NPC_VARIANT_LABELS = ["V1 · 年轻女性", "V2 · 年长男性", "V3 · 中性", "V4 · 年轻男性"];

  // —— 势力联络人 accent（4 巨头 + 6 中小 + 野怪静默集群 + 联盟占位）——
  // outName 沿用 factions.js 的 ASCII 稳定键；ratio 固定 3:4；落盘目录 assets/portraits/factions/
  const CONTACT_OUT_DIR = "assets/portraits/factions";
  const FACTION_CONTACTS = [
    {
      factionId: "angel", name: "苍穹劫团", color: "#5ad1a0",
      outName: "nsk_fac_angel_contact.webp", ratio: "3:4",
      accent: "Teal-cyan key light (#5ad1a0). Weathered freebooter look: patched leather flight jacket with a small faction insignia pin, one subtle cybernetic eye implant, mid-age charismatic veteran quartermaster, relaxed confident smirk, salvaged-but-stylish gear, roguish charm.",
    },
    {
      factionId: "blood", name: "赤誓教团", color: "#e879a8",
      outName: "nsk_fac_blood_contact.webp", ratio: "3:4",
      accent: "Rose-pink and dark-silver key light (#e879a8). Austere ecclesiastical-military vestments with ceremonial pauldrons, crimson-covenant holy emblem on chest, stern monk-warrior commander, tied-back hair, solemn devout expression, upright posture, disciplined.",
    },
    {
      factionId: "sansha", name: "静默集群", color: "#e8b45a",
      outName: "nsk_fac_sansha_contact.webp", ratio: "3:4",
      accent: "Amber-gold key light (#e8b45a). Heavily cybernetically augmented post-human: partial facial armor plating, one eye an optical lens, faint glowing circuit lines under skin, neutral androgynous, extremely restrained calm expression, uncanny silent stillness.",
    },
    {
      factionId: "alliance", name: "银河联盟", color: "#4d8fe0",
      outName: "nsk_fac_alliance_contact.webp", ratio: "3:4", visualOnly: true,
      accent: "Azure-blue key light (#4d8fe0). Crisp standardized federation fleet uniform with star insignia shoulder marks and thin gold trim, polished federal commissioner, neat hair, upright professional posture, calm impartial authoritative expression, tidy blue command-center light bands behind.",
    },
    {
      factionId: "mining_guild", name: "边陲矿业公会", color: "#b5793f",
      outName: "nsk_fac_mining_guild_contact.webp", ratio: "3:4",
      accent: "Warm earthy brown key light (#b5793f). Burly veteran miner foreman, worn hard hat with a mounted lamp, ochre work uniform, broad shoulders, weathered face and hands, pragmatic blue-collar demeanor, faint dust on jacket.",
    },
    {
      factionId: "salvage_union", name: "拾荒者联合体", color: "#c9772e",
      outName: "nsk_fac_salvage_union_contact.webp", ratio: "3:4",
      accent: "Rust-orange key light (#c9772e). Chief salvage officer, tool-laden utility belt and harness, eyepatch, patched rust-orange salvage coat made of scavenged panels, scrappy resourceful look, grease-smudged cheek.",
    },
    {
      factionId: "lone_star", name: "孤星商社", color: "#d8c07a",
      outName: "nsk_fac_lone_star_contact.webp", ratio: "3:4",
      accent: "Champagne-gold key light (#d8c07a). Sharp trading company quartermaster, silk cravat, electronic ledger tablet in hand, long champagne-gold robe, clever merchant expression, polished and composed.",
    },
    {
      factionId: "abyssal_inst", name: "深空研究院", color: "#9b8fd0",
      outName: "nsk_fac_abyssal_inst_contact.webp", ratio: "3:4",
      accent: "Pale violet key light (#9b8fd0). Stern chief researcher, white lab coat, holographic data tablet, calm detached scholarly expression, faint violet data-glow on glasses, immaculate and precise.",
    },
    {
      factionId: "bounty_league", name: "悬赏者同盟", color: "#b02a1f",
      outName: "nsk_fac_bounty_league_contact.webp", ratio: "3:4",
      accent: "Deep crimson key light (#b02a1f). Bounty broker, lean practical intermediary, leather jerkin, stack of wanted posters, deep-crimson travel cloak, cool professional stare, no-nonsense attitude.",
    },
    {
      factionId: "settlers", name: "拓殖议会", color: "#b5c46a",
      outName: "nsk_fac_settlers_contact.webp", ratio: "3:4",
      accent: "Wheat-green key light (#b5c46a). Frontier town councilor, plain agrarian leader, crop-colored apron over simple clothes, colony insignia pin, warm earnest expression, humble frontier practicality.",
    },
  ];

  // —— NPC 原型（14；落盘目录 assets/portraits/npc/）——
  // scheme 仅作文档分组标签（A 常规/边陲/军方 · B 高科/底层/改造 · C 精英/探险家）。
  // 发色/性别/年龄 = 逐原型手挑 variants[4]（2026-10-24 用户升级版：同原型 4 变体发色互不重复）。
  // reveal = V1（年轻女性）专属清凉穿搭（卖肉向）；buildNpcPrompt 仅在 {revealing:true, variant:0} 时启用。
  const NPC_ARCHETYPES = [
    { id: "belt_nomad", scheme: "A", source: "小行星带游牧", look: "耐磨保温采矿夹克、工具挂带、尘垢、实用拾荒感",
      accent: "Dusty asteroid-belt nomad look: worn insulated mining jacket, utility harness, grime and dust on clothes, practical scavenger vibe, frontier miner aesthetic.",
      reveal: "Dusty asteroid-belt nomad look: unzipped cropped mining vest worn loosely over a fitted low-cut tank top, bare shoulders and collarbone visible with light smudge of dust, light utility straps, frontier scavenger aesthetic.",
      variants: [
        "young woman, short practical soft pastel-peach hair, sun-kissed skin, confident alluring smirk",
        "older man, sun-bleached golden-blonde hair, weathered golden-grey beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, muted lavender-grey hair, calm neutral expression, understated",
        "young man, clean-cut copper-red hair with golden-blonde tips, eager alert expression",
      ] },
    { id: "fleet_brat", scheme: "A", source: "舰队子弟", look: "挺括舰队制服+军衔徽、纪律姿态、海军军官感",
      accent: "Military-academy officer look: crisp fleet uniform with rank insignia, disciplined posture, naval officer aesthetic.",
      reveal: "Military-academy officer look: tailored sleeveless fleet officer top with a deep open collar, bare shoulders and collarbone visible, metallic rank insignia on collar strap, sleek naval aesthetic.",
      variants: [
        "young woman, short practical champagne-blonde hair, confident alluring smirk",
        "older man, swept-back silver-white hair, weathered iron-grey beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, sleek rose-gold hair, calm neutral expression, understated",
        "young man, clean-cut icy silver-blue hair, eager alert expression",
      ] },
    { id: "orphan_void", scheme: "B", source: "虚空孤儿", look: "拼凑义体植入、拾荒虚空服、诡静、后人类",
      accent: "Salvaged half-machine orphan look: patchwork augmented implants, scavenged void-suit, eerie calm, post-human scavenger.",
      reveal: "Salvaged half-machine orphan look: lightweight sleeveless void-suit harness over a fitted cropped mesh top, exposed pale shoulders and collarbone with delicate cybernetic port seams, post-human scavenger.",
      variants: [
        "young woman, short practical platinum-white hair with cyan tips, confident alluring smirk",
        "older man, closely cropped stark-white buzzcut, weathered white beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, muted dusty-peach and lilac hair, calm neutral expression, understated",
        "young man, clean-cut crimson-red hair with a bright gold streak, eager alert expression",
      ] },
    { id: "relic_kid", scheme: "C", source: "遗迹猎人之后", look: "轻量探险装、文物挎包、好奇自信、淘宝客",
      accent: "Frontier relic-hunter look: light explorer gear, satchel of artifacts, curious confident expression, treasure-seeker vibe.",
      reveal: "Frontier relic-hunter look: fitted sleeveless explorer crop top with open neckline, leather artifact satchel strap across bare sun-kissed shoulders and collarbone, treasure-seeker vibe.",
      variants: [
        "young woman, short practical bright honey-gold hair, confident alluring smirk",
        "older man, swept-back amber-gold hair, weathered golden-brown beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, pale mint-silver hair, calm neutral expression, understated",
        "young man, clean-cut warm peach-blonde hair, eager alert expression",
      ] },
    { id: "defector", scheme: "A", source: "叛逃者", look: "褪色作战服、扯掉的部队臂章、警惕硬朗、前军人",
      accent: "Disgraced defector soldier look: faded combat fatigues, removed unit patches, wary hardened expression, ex-military.",
      reveal: "Disgraced defector soldier look: fitted olive combat crop tank top with dog tags resting on bare collarbone, open lightweight harness, bare toned shoulders, ex-military vibe.",
      variants: [
        "young woman, short practical dusty-peach hair with natural dark roots, confident smirk",
        "older man, sandy golden-blonde hair, weathered ash-gold beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, muted steel-blue hair, calm neutral expression, understated",
        "young man, clean-cut sunlit golden-blonde hair, eager alert expression",
      ] },
    { id: "corp_heir", scheme: "C", source: "财团继承人", look: "定制贵价衣着、低调财富符号、从容、精英贸易感",
      accent: "Corporate heir look: tailored expensive outfit, subtle wealth signals, composed smug expression, elite trader aesthetic.",
      reveal: "Corporate heir look: glamorous off-shoulder high-fashion silk top with a sleek plunging neckline, bare shoulders and collarbone adorned with a minimalist gold choker, elite luxury aesthetic.",
      variants: [
        "young woman, short practical soft pastel-peach hair, confident alluring smirk",
        "older man, swept-back platinum-blonde hair, neatly trimmed golden-grey beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, sleek silver-violet hair, calm neutral expression, understated",
        "young man, clean-cut champagne-blonde hair with a subtle peach-pink streak, eager alert expression",
      ] },
    { id: "station_rat", scheme: "B", source: "空间站鼠辈", look: "油污工装连体服、工具腰带、机灵、船坞技师",
      accent: "Station tinker look: grease-stained work jumpsuit, tool belt, clever scrappy expression, shipyard mechanic vibe.",
      reveal: "Station tinker look: fitted white racerback crop tank top with a smudge of engine grease, work overalls unbuttoned and pulled down off bare shoulders, light tool strap on collarbone, shipyard mechanic vibe.",
      variants: [
        "young woman, short practical coral-peach hair, confident playful smirk",
        "older man, weathered copper-red hair, salt-and-pepper ginger beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, pale golden-blonde hair with teal tips, calm neutral expression, understated",
        "young man, clean-cut ash-silver hair with a vibrant peach streak, eager alert expression",
      ] },
    { id: "signal_orphan", scheme: "B", source: "信号弃儿", look: "头戴通讯耳麦、脸上映着暗屏光、专注内向、监听站",
      accent: "Signal analyst look: headset and comms gear, dim monitor glow on face, focused introverted expression, listening-post aesthetic.",
      reveal: "Signal analyst look: sleek off-shoulder black tech-knit top with bare shoulders and collarbone visible, lightweight comms headset resting around neck, dim monitor glow on skin, listening-post aesthetic.",
      variants: [
        "young woman, short practical rose-gold peach hair, confident smirk",
        "older man, muted lavender-silver hair, weathered silver beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, sleek champagne-blonde hair, calm neutral expression, understated",
        "young man, clean-cut dark hair with bright mint-cyan front streaks, eager alert expression",
      ] },
    { id: "frontier", scheme: "A", source: "边陲平民（9 星域通用）", look: "朴素耐用殖民便装、风吹日晒、务实、边境殖民",
      accent: "Frontier settler look: simple rugged colony clothes, sun-weathered skin, pragmatic expression, border colonist aesthetic.",
      reveal: "Frontier settler look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic.",
      variants: [
        "young woman, short practical sunlit honey-gold hair, confident warm smirk",
        "older man, strawberry-gold hair, weathered ginger-grey beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, soft peach-blonde hair, calm neutral expression, understated",
        "young man, clean-cut sandy ash-blonde hair, eager alert expression",
      ] },
    { id: "merc_veteran", scheme: "A", source: "通用老兵", look: "战损装备、可见伤疤、自信致命姿态、老练赏金客",
      accent: "Veteran mercenary look: combat-worn gear, visible scars, confident lethal posture, hardened gun-for-hire.",
      reveal: "Veteran mercenary look: sleek black sleeveless tactical crop top with light chest rig straps, bare toned shoulders and collarbone with a faint healed scar, confident lethal posture.",
      variants: [
        "young woman, short practical dusty-peach pink hair, confident smirk",
        "older man, closely cropped silver-blonde hair, weathered golden-grey beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, burgundy-red hair with subtle gold tips, calm neutral expression, understated",
        "young man, clean-cut platinum-blonde hair, eager alert expression",
      ] },
    { id: "augmented", scheme: "B", source: "通用重改造", look: "显眼义体臂/眼/肢、铬与皮、跨人类审美",
      accent: "Heavy cyber-augmented look: prominent cybernetic arm or eye or limbs, sleek chrome and skin, transhuman aesthetic.",
      reveal: "Heavy cyber-augmented look: minimalist sleeveless cyber-bodysuit with an open cutout neckline, bare shoulders and collarbone showing sleek chrome dermal plating seams, transhuman aesthetic.",
      variants: [
        "young woman, short practical pastel-peach hair with silver streaks, confident alluring smirk",
        "older man, closely cropped metallic-silver hair, weathered grey beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, pale cyan-silver hair, calm neutral expression, understated",
        "young man, clean-cut bright amber-gold hair, eager alert expression",
      ] },
    { id: "pilot", scheme: "C", source: "通用飞行员", look: "飞行服、腋下夹头盔、航空感、痞帅可靠",
      accent: "Starship pilot look: flight suit, helmet tucked under arm, aviator aesthetic, cocky competent expression.",
      reveal: "Starship pilot look: flight suit unzipped low and slipped off shoulders over a fitted low-cut cropped flight tank top, bare shoulders and collarbone visible, aviator aesthetic.",
      variants: [
        "young woman, short practical warm peach-blonde hair, cocky confident smirk",
        "older man, swept-back ash-golden hair, weathered beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, muted lavender-grey hair, calm neutral expression, understated",
        "young man, clean-cut golden-blonde hair with a coral-red streak, eager alert expression",
      ] },
    { id: "actress", scheme: "C", source: "女演员 / 星际艺人", look: "舞台灵感科幻戏服、优雅垂坠、张扬气场、明星感",
      accent: "Glamorous interstellar performer look: stage-costume inspired sci-fi attire with elegant draping, a signature accent color, confident alluring stage presence, poised expressive face, celebrity aura.",
      reveal: "Interstellar performer look: sleek off-shoulder sequined stage top with a deep neckline, bare shoulders and collarbone, dramatic stage presence, celebrity aesthetic.",
      variants: [
        "young woman, short practical rose-gold hair, confident alluring smirk",
        "older man, swept-back silver-blonde hair, trimmed beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, sleek champagne-blonde hair, calm neutral expression, understated",
        "young man, clean-cut golden-blonde hair with a coral-red streak, eager alert expression",
      ] },
    { id: "noble", scheme: "C", source: "贵族 / 世家子弟", look: "华贵定制科幻礼服、精细刺绣、家徽胸针、从容贵气",
      accent: "Hereditary aristocrat look: opulent tailored sci-fi noble attire with fine embroidery and a house-crest brooch, refined composed demeanor, luxury fabric with subtle metallic thread, elevated posture, old-money elegance.",
      reveal: "Noble house heir look: elegant off-shoulder silk gown with a plunging neckline, bare shoulders adorned with a family jeweled collar, aristocratic aesthetic.",
      variants: [
        "young woman, short practical platinum-silver hair, confident alluring smirk",
        "older man, swept-back ash-golden hair, weathered beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, sleek silver-violet hair, calm neutral expression, understated",
        "young man, clean-cut bright honey-gold hair, eager alert expression",
      ] },
    { id: "smelter_apprentice", scheme: "B", source: "冶炼学徒", look: "在矿冶殖民星的炉火边长大，闻得懂合金味。",
      accent: "Smelter-apprentice look: heat-scorched refinery colony workwear, soot-smudged sleeves rolled to the forearms, faint orange furnace glow reflecting on the face, pragmatic young apprentice vibe, molten-metal aesthetic.",
      reveal: "Smelter-apprentice look: cropped heat-resistant tank top with rolled work straps, bare shoulders and collarbone dusted with fine soot, faint furnace glow on skin, molten-metal aesthetic.",
      variants: [
        "young woman, short practical ash-copper hair with ember-orange tips, confident alluring smirk",
        "older man, salt-and-pepper auburn hair, weathered rust-brown beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, muted bronze-teal hair, calm neutral expression, understated",
        "young man, clean-cut warm ochre hair with ember-red tips, eager alert expression",
      ] },
    { id: "salvage_waif", scheme: "B", source: "拾荒遗孤", look: "在残骸带长大的拆解童子，什么破烂都能拼回原型。",
      accent: "Salvage-waif look: patched oversized salvage jacket made of reclaimed ship panels, mismatched gloves, a toolkit on a strap, scrappy underfed kid vibe, debris-belt scavenger aesthetic.",
      reveal: "Salvage-waif look: oversized reclaimed-panel crop jacket slipping off one shoulder over a fitted bandeau, bare collarbone with a grease smudge, scrappy scavenger aesthetic.",
      variants: [
        "young woman, short practical muddy-auburn hair, confident playful smirk",
        "older man, weathered ash-brown hair, scrappy stubble beard, facial scar, wary gaze",
        "person of ambiguous gender, mid-age, pale rust-grey hair, calm neutral expression, understated",
        "young man, clean-cut soot-dark hair with copper streaks, eager alert expression",
      ] },
    { id: "gas_drifter", scheme: "A", source: "气井游商", look: "跟着气态巨行星的勘探船跑单帮，识得湍流里的门道。",
      accent: "Gas-well drifter look: wind-worn trader's layered tunic, brass pressure-gauge trinkets, a faint storm-light sheen on the fabric, agile roaming merchant vibe, gas-giant frontier aesthetic.",
      reveal: "Gas-well drifter look: off-shoulder layered tunic slipping off one shoulder, bare collarbone with a faint storm-glow sheen, wind-tousled look, roaming merchant aesthetic.",
      variants: [
        "young woman, short practical tidewave teal hair, confident alluring smirk",
        "older man, wind-blown sandy hair, weathered tan beard, facial scar, shrewd gaze",
        "person of ambiguous gender, mid-age, muted storm-grey hair, calm neutral expression, understated",
        "young man, clean-cut sea-glass hair with teal streaks, eager alert expression",
      ] },
    { id: "abyss_acolyte", scheme: "C", source: "深空研习生", look: "研究院附属学校的优等生，泡在先驱造物数据库里。",
      accent: "Abyssal-acolyte look: pristine academy uniform with a thin research-covenant trim, a holographic textbook tablet, a faint violet data-glow on the glasses, brilliant focused student vibe, deep-space institute aesthetic.",
      reveal: "Abyssal-acolyte look: off-shoulder academy crop top with a deep laced neckline, bare shoulders and collarbone, a faint violet data-glow, scholarly aesthetic.",
      variants: [
        "young woman, short practical pale-lilac hair with violet tips, confident alluring smirk",
        "older man, swept-back ash-violet hair, a neatly trimmed beard, calm scholarly gaze",
        "person of ambiguous gender, mid-age, sleek silver-violet hair, calm neutral expression, understated",
        "young man, clean-cut bright lilac hair with cyan streaks, eager alert expression",
      ] },
    { id: "bounty_foundling", scheme: "A", source: "赏金猎徒", look: "在悬赏船上长大的孩子，炮塔比摇篮还熟。",
      accent: "Bounty-foundling look: lightweight combat-scarred jacket with bounty pins, a slung rifle strap, confident lethal kid vibe, mercenary-child aesthetic.",
      reveal: "Bounty-foundling look: cropped combat tank top with light chest-rig straps, bare shoulders and collarbone with a faint healed scar, confident lethal posture.",
      variants: [
        "young woman, short practical dusty-rose hair, confident alluring smirk",
        "older man, closely cropped silver-blonde hair, weathered golden-grey beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, burgundy hair with gold tips, calm neutral expression, understated",
        "young man, clean-cut platinum-blonde hair with crimson streaks, eager alert expression",
      ] },
    { id: "settler_scion", scheme: "A", source: "拓殖农裔", look: "边境拓殖星的第二代，从小跟着开矿拓荒。",
      accent: "Settler-scion look: simple rugged colony clothes, sun-weathered skin, a farming-and-mining tool on the shoulder, pragmatic second-generation frontiersman vibe, border colonist aesthetic.",
      reveal: "Settler-scion look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic.",
      variants: [
        "young woman, short practical sunlit wheat-blonde hair, confident warm smirk",
        "older man, strawberry-gold hair, weathered ginger-grey beard, facial scar, stern gaze",
        "person of ambiguous gender, mid-age, soft sage-blonde hair, calm neutral expression, understated",
        "young man, clean-cut sandy ash-blonde hair with grass-green tips, eager alert expression",
      ] },
    { id: "turret_child", scheme: "A", source: "激光炮手之子", look: "舰队炮战学校的子弟，激光校准刻进肌肉记忆。",
      accent: "Turret-child look: crisp cadet fleet uniform with gunnery insignia, disciplined posture, calm focused marksman vibe, naval gunnery-school aesthetic.",
      reveal: "Turret-child look: tailored sleeveless gunnery cadet top with a deep open collar, bare shoulders and collarbone visible, a metallic gunnery insignia on the collar strap, sleek naval aesthetic.",
      variants: [
        "young woman, short practical champagne-blonde hair with ruby tips, confident alluring smirk",
        "older man, swept-back iron-grey hair, weathered steel beard, facial scar, stern marksman gaze",
        "person of ambiguous gender, mid-age, sleek rose-steel hair, calm neutral expression, understated",
        "young man, clean-cut icy silver-blue hair with ruby-red streaks, eager alert expression",
      ] },
  ];

  // —— 清凉版「随机服装库」：每个原型 V1 清凉版的服装池（方案 A：后台「服装风格」下拉 + 🎲随机）——
  // 池第 0 条 = 该原型现有 reveal 文案（向后兼容，对应磁盘 _reveal.webp）；后续条目为该服装的「清凉 + 露肩颈锁骨 + 身份感」变体。
  // 选哪套只在「生成期拼 Prompt」时决定；存盘仍进同一 reveal combo 的不同 draw（_2/_3…），运行时 Portraits.pick() 照旧随机抽。
  const NPC_REVEAL_OUTFIT_POOLS = {
    belt_nomad: [
      { name: "采矿背心+工字背心", text: "Dusty asteroid-belt nomad look: unzipped cropped mining vest worn loosely over a fitted low-cut tank top, bare shoulders and collarbone visible with light smudge of dust, light utility straps, frontier scavenger aesthetic." },
      { name: "露肩沙漠披裹", text: "Frayed strappy desert poncho slipped off one sun-baked shoulder over a dusty bandeau, bare collarbone with grime smudge, woven tool-belt across chest, frontier scavenger aesthetic." },
      { name: "网纱求生露肩", text: "Open lightweight survival harness over a tied-off cropped mesh undershirt, both shoulders bare and dust-streaked, salvaged goggle strap at neck, pragmatic asteroid-belt nomad look." },
    ],
    fleet_brat: [
      { name: "无袖军官上衣", text: "Military-academy officer look: tailored sleeveless fleet officer top with a deep open collar, bare shoulders and collarbone visible, metallic rank insignia on collar strap, sleek naval aesthetic." },
      { name: "露肩海军白领礼裙", text: "Off-shoulder dress-white naval gown with a single bare shoulder and a thin gold aiguillette, bare collarbone, crisp fleet ball aesthetic." },
      { name: "敞怀军官夹克", text: "Open-front officer jacket slipped off both shoulders over a low-cut silk camisole, bare collarbone with rank pin, disciplined-yet-revealing naval cadet look." },
    ],
    orphan_void: [
      { name: "无袖虚空服网纱", text: "Salvaged half-machine orphan look: lightweight sleeveless void-suit harness over a fitted cropped mesh top, exposed pale shoulders and collarbone with delicate cybernetic port seams, post-human scavenger." },
      { name: "斜肩拼凑义体裙", text: "Asymmetrical salvage-cloth wrap dress held by a cybernetic limb, one bare shoulder exposed with glowing port seams, eerie calm post-human look." },
      { name: "镂空后人类束身", text: "Sheer wired mesh bodysuit with cut-out shoulders, chrome dermal seams along bare collarbone, salvaged half-machine orphan, uncanny stillness." },
    ],
    relic_kid: [
      { name: "探险露脐上衣", text: "Frontier relic-hunter look: fitted sleeveless explorer crop top with open neckline, leather artifact satchel strap across bare sun-kissed shoulders and collarbone, treasure-seeker vibe." },
      { name: "波西米亚露肩", text: "Bohemian off-shoulder explorer blouse with knotted ties, one bare shoulder and sun-kissed collarbone, artifact satchel strap, treasure-seeker aesthetic." },
      { name: "垂坠寻宝长罩衫", text: "Draped open relic-hunter tunic over a tied bandeau, both shoulders bare, antique medallion resting on collarbone, frontier treasure-seeker look." },
    ],
    defector: [
      { name: "橄榄绿露脐背心+狗牌", text: "Disgraced defector soldier look: fitted olive combat crop tank top with dog tags resting on bare collarbone, open lightweight harness, bare toned shoulders, ex-military vibe." },
      { name: "扯开作战服", text: "Half-unbuttoned combat jacket slipped off one shoulder over a low-cut olive tank, dog tags on bare collarbone, wary ex-military look." },
      { name: "绷带露肩便装", text: "Field-wrap bandage top with one shoulder bared and a faded unit patch, bare collarbone, hardened defector soldier aesthetic." },
    ],
    corp_heir: [
      { name: "露肩真丝礼上衣", text: "Corporate heir look: glamorous off-shoulder high-fashion silk top with a sleek plunging neckline, bare shoulders and collarbone adorned with a minimalist gold choker, elite luxury aesthetic." },
      { name: "无袖高定西装套装", text: "Bespoke sleeveless tuxedo suit with a deep plunging satin lapel, completely bare shoulders and sleek arms, sharp prominent collarbone, minimalist platinum-and-gold lapel pin, high-society executive couture." },
      { name: "不对称露肩缎面礼裙", text: "Opulent asymmetrical off-shoulder silk evening gown with geometric metallic embroidery, bare decolletage and single bare shoulder, minimalist platinum collar necklace, gala aristocratic aesthetic." },
      { name: "挂脖真丝礼服", text: "Daring minimalist halter-neck liquid-silk evening dress with delicate chain straps, open sweetheart silhouette, completely exposed shoulders and radiant skin, languid private-luxe aesthetic." },
      { name: "深V心形领束身衣", text: "Daring deep sweetheart halter corset with sheer lace trim and delicate strap details, completely bare smooth shoulders and prominent collarbone, avant-garde couture." },
    ],
    station_rat: [
      { name: "油污工字背心", text: "Station tinker look: fitted white racerback crop tank top with a smudge of engine grease, work overalls unbuttoned and pulled down off bare shoulders, light tool strap on collarbone, shipyard mechanic vibe." },
      { name: "霓虹机库背心", text: "Neon-trimmed racerback tank with overalls slung off both shoulders, grease smudge on bare collarbone, tool strap, scrappy shipyard mechanic look." },
      { name: "敞怀连体工装", text: "Open canvas work shirt over a tied bandeau, one bare greasy shoulder, dangling wrench loop at collarbone, clever station-tinker aesthetic." },
    ],
    signal_orphan: [
      { name: "露肩黑科技针织", text: "Signal analyst look: sleek off-shoulder black tech-knit top with bare shoulders and collarbone visible, lightweight comms headset resting around neck, dim monitor glow on skin, listening-post aesthetic." },
      { name: "斜肩监听站便装", text: "One-shoulder slate tech-knit slip with a thin glowing data-line trim, bare collarbone, comms earpiece, dim monitor glow, listening-post aesthetic." },
      { name: "极简发光圈裙", text: "Minimalist black halter tech-top with a soft luminous ring at the neck, completely bare shoulders, faint screen-glow on skin, focused signal-analyst look." },
    ],
    frontier: [
      { name: "亚麻露脐系带", text: "Frontier settler look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic." },
      { name: "边陲露肩罩裙", text: "Off-shoulder border sundress with a knotted shoulder tie, sun-weathered bare collarbone, pragmatic frontier settler look." },
      { name: "日晒工装露肩", text: "Open woven overshirt over a tied bandeau, both shoulders bared to the sun, simple colony bead necklace on collarbone, border colonist aesthetic." },
    ],
    merc_veteran: [
      { name: "黑色无袖战术背心", text: "Veteran mercenary look: sleek black sleeveless tactical crop top with light chest rig straps, bare toned shoulders and collarbone with a faint healed scar, confident lethal posture." },
      { name: "敞怀作战夹克", text: "Open tactical jacket off both shoulders over a low-cut mesh undershirt, chest rig straps across bare collarbone, faint healed scar, lethal mercenary look." },
      { name: "战损露肩绑带", text: "Strapped battle-bondage top with one shoulder bared and webbing across collarbone, healed scar visible, hardened gun-for-hire aesthetic." },
    ],
    augmented: [
      { name: "极简无袖义体服", text: "Heavy cyber-augmented look: minimalist sleeveless cyber-bodysuit with an open cutout neckline, bare shoulders and collarbone showing sleek chrome dermal plating seams, transhuman aesthetic." },
      { name: "镂空铬皮束身衣", text: "Hollow-cut chrome-mesh corset bodysuit with bare shoulders exposing dermal plating seams, glowing conduit lines on collarbone, transhuman aesthetic." },
      { name: "发光线路露肩装", text: "Luminous-circuit crop-top with open shoulders and chrome seam-glow along bare collarbone, prominent cybernetic limb, sleek transhuman look." },
    ],
    pilot: [
      { name: "飞行服滑落露肩", text: "Starship pilot look: flight suit unzipped low and slipped off shoulders over a fitted low-cut cropped flight tank top, bare shoulders and collarbone visible, aviator aesthetic." },
      { name: "运动工字背心", text: "Sporty racerback flight tank with sleeves shoved down, bare shoulders and collarbone, helmet tucked under arm, cocky aviator look." },
      { name: "敞怀飞行皮夹克", text: "Open leather aviator jacket off one shoulder over a low-cut silk tee, bare collarbone, confident pilot aesthetic." },
    ],
    actress: [
      { name: "亮片露肩舞台装", text: "Interstellar performer look: sleek off-shoulder sequined stage top with a deep neckline, bare shoulders and collarbone, dramatic stage presence, celebrity aesthetic." },
      { name: "铬丝前卫礼裙", text: "Avant-garde chrome-mesh gown with a single bare shoulder and a metallic drape, bare collarbone, dramatic stage presence, celebrity aesthetic." },
      { name: "流动金属披肩", text: "Flowing metallic capelet over a strapless liquid-silk gown, bare shoulders and collarbone, poised expressive face, interstellar performer look." },
    ],
    noble: [
      { name: "露肩真丝礼裙", text: "Noble house heir look: elegant off-shoulder silk gown with a plunging neckline, bare shoulders adorned with a family jeweled collar, aristocratic aesthetic." },
      { name: "高领宝石束身衣", text: "High-collared jeweled corset gown with a deep open front, bare collarbone and a house-crest brooch, old-money elegance." },
      { name: "世家披挂式长裙", text: "Draped hereditary stole worn off one shoulder over a silk slip, bare collarbone with a family jeweled collar, refined aristocratic aesthetic." },
    ],
    smelter_apprentice: [
      { name: "冶炉背心+工装带", text: "Smelter-apprentice look: cropped heat-resistant tank top with rolled work straps, bare shoulders and collarbone dusted with fine soot, a faint furnace glow on skin, molten-metal aesthetic." },
      { name: "露肩石棉围裙", text: "Open asbestos-style apron over a tied bandeau, one bare soot-streaked shoulder, ember glow on collarbone, apprentice smelter vibe." },
      { name: "斜肩耐热罩衫", text: "One-shoulder heat-resistant overshirt off the other shoulder over a fitted bandeau, bare collarbone with a faint ember shimmer, pragmatic apprentice look." },
    ],
    salvage_waif: [
      { name: "拼凑露肩夹克", text: "Salvage-waif look: oversized reclaimed-panel crop jacket slipping off one shoulder over a fitted bandeau, bare collarbone with a grease smudge, scrappy scavenger aesthetic." },
      { name: "拆解工字背心", text: "Fitted reclaimed-mesh tank top with tool straps across bare shoulders and collarbone, a loose bolt necklace, debris-belt scavenger look." },
      { name: "斜肩破布罩衫", text: "One-shoulder frayed salvage cloth over a tied bandeau, both shoulders bare, a salvaged goggle strap at the neck, pragmatic waif aesthetic." },
    ],
    gas_drifter: [
      { name: "斜肩风蚀长罩", text: "Gas-well drifter look: off-shoulder layered tunic slipping off one shoulder, bare collarbone with a faint storm-glow sheen, wind-tousled look, roaming merchant aesthetic." },
      { name: "露脐探险上衣", text: "Fitted drift-trader crop top with an open neckline, a brass gauge pendant resting on bare collarbone, wind-blown hair, frontier merchant vibe." },
      { name: "系带露肩披裹", text: "Knotted shoulder-wrap tunic baring one shoulder and sun-kissed collarbone, a brass trinket strand, pragmatic gas-giant drifter look." },
    ],
    abyss_acolyte: [
      { name: "学院露肩上衣", text: "Abyssal-acolyte look: off-shoulder academy crop top with a deep laced neckline, bare shoulders and collarbone, a faint violet data-glow, scholarly aesthetic." },
      { name: "斜肩研究罩衫", text: "One-shoulder research overshirt off the other shoulder over a fitted bandeau, bare collarbone with a faint data-glow, academy acolyte vibe." },
      { name: "露脐制服", text: "Fitted academy crop uniform with an open front placket, bare toned shoulders and collarbone, a holographic tablet glint, deep-space institute look." },
    ],
    bounty_foundling: [
      { name: "无袖战术背心", text: "Bounty-foundling look: cropped combat tank top with light chest-rig straps, bare shoulders and collarbone with a faint healed scar, confident lethal posture." },
      { name: "敞怀作战夹克", text: "Open combat jacket off both shoulders over a low-cut mesh undershirt, chest-rig straps across bare collarbone, a faint scar, lethal bounty look." },
      { name: "战损露肩绑带", text: "Strapped battle-bondage top with one shoulder bared and webbing across collarbone, a healed scar visible, hardened gun-for-hire aesthetic." },
    ],
    settler_scion: [
      { name: "亚麻露脐系带", text: "Settler-scion look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic." },
      { name: "边陲露肩罩裙", text: "Off-shoulder frontier sundress with a knotted shoulder tie, sun-weathered bare collarbone, pragmatic settler look." },
      { name: "日晒工装露肩", text: "Open woven overshirt over a tied bandeau, both shoulders bared to the sun, a simple colony bead necklace on collarbone, border colonist aesthetic." },
    ],
    turret_child: [
      { name: "无袖炮手军官上衣", text: "Turret-child look: tailored sleeveless gunnery cadet top with a deep open collar, bare shoulders and collarbone visible, a metallic gunnery insignia on the collar strap, sleek naval aesthetic." },
      { name: "露肩海军白领礼裙", text: "Off-shoulder dress-white gunnery gown with a single bare shoulder and a thin gold aiguillette, bare collarbone, crisp fleet gunnery-ball aesthetic." },
      { name: "敞怀炮手夹克", text: "Open-front gunnery jacket slipped off both shoulders over a low-cut silk camisole, bare collarbone with a rank pin, disciplined-yet-revealing naval cadet look." },
    ],
  };
  // 取某原型的清凉版服装池（无定义则回退单元素默认池，保证 selector 永远有内容）
  function npcRevealOutfitPool(archId) {
    const pool = NPC_REVEAL_OUTFIT_POOLS[archId];
    if (pool && pool.length) return pool;
    const a = NPC_ARCHETYPES.find(x => x.id === archId);
    return [{ name: "默认清凉", text: (a && a.reveal) || NPC_REVEALING }];
  }

  // —— 挑染（发色高光）修饰层：独立的「生成期」修饰，叠加到每个变体发色描述之后 ——
  // 选哪款只在「生成期拼 Prompt」时决定；不影响落盘 combo（与清凉版服装池、义体同理）。
  // 索引 0 = 无（不挑染）。后台「挑染」下拉给中文标签，🎲 可随机抽一款。
  const NPC_HAIR_HIGHLIGHTS = [
    { name: "无（不挑染）",   text: "" },
    { name: "银白挑染",       text: "with subtle platinum-silver highlight streaks woven through the hair" },
    { name: "霓虹青紫挑染",   text: "with vivid neon cyan-and-violet highlight streaks in the hair" },
    { name: "暖金挑染",       text: "with warm golden-blonde highlight streaks framing the face" },
    { name: "暗紫挑染",       text: "with deep amethyst-violet highlight streaks through the hair" },
    { name: "冰蓝挑染",       text: "with icy pale-blue highlight streaks in the hair" },
    { name: "玫瑰挑染",       text: "with rosy-pink highlight streaks through the hair" },
  ];
  function npcHairHighlight(idx) {
    const i = Math.max(0, Math.min((idx | 0), NPC_HAIR_HIGHLIGHTS.length - 1));
    return NPC_HAIR_HIGHLIGHTS[i] || { name: "无（不挑染）", text: "" };
  }

  // —— 男性随机特征（墨镜 / 光头）：独立的「生成期」修饰，仅对男性变体（V2 年长男 / V4 年轻男）生效 ——
  // 与挑染同理：选哪款只在「生成期拼 Prompt」时决定；不影响落盘 combo、不改文件名。
  // 生成多张带不同男性特征的同变体图，存进同一 combo 的不同 draw，运行时 Portraits.pick() 随机抽，即「随机词条」。
  // 索引 0 = 无（常规）。后台「男性特征」下拉给中文标签，🎲 可随机抽一款（🎲 也会跳过「无」）。
  // 注：光头会覆盖变体自带发色描述——生图前请优先采用本条（生图模型通常遵循 "bald, no hair" 覆盖前文发色）。
  const NPC_MALE_FACIALS = [
    { name: "无（常规）",   text: "" },
    { name: "墨镜",         text: "wearing sleek reflective wraparound sunglasses, cool detached expression" },
    { name: "光头",         text: "completely bald with a smooth clean-shaven scalp, no hair on the head" },
  ];
  function npcMaleTrait(idx) {
    const i = Math.max(0, Math.min((idx | 0), NPC_MALE_FACIALS.length - 1));
    return NPC_MALE_FACIALS[i] || { name: "无（常规）", text: "" };
  }
  // 哪些变体索引是「男性」（墨镜/光头仅在这些变体生效）
  function npcIsMaleVariant(variantIdx) {
    const vi = variantIdx || 0;
    return vi === 1 || vi === 3; // V2 年长男 / V4 年轻男
  }

  // —— 战术目镜（电子作战目镜）：独立的「生成期」修饰，对所有变体（V1–V4）生效 ——
  // 与挑染同理：选哪款只在「生成期拼 Prompt」时决定；不影响落盘 combo、不改文件名。
  // 生成多张带不同目镜的同变体图，存进同一 combo 的不同 draw，运行时 Portraits.pick() 随机抽，即随机池。
  // 索引 0 = 无（常规）。后台「战术目镜」下拉给中文标签，🎲 可随机抽一款（🎲 也会跳过「无」）。
  const NPC_TACTICAL_OPTICS = [
    { name: "无（常规）",   text: "" },
    { name: "单眼战术目镜", text: "wearing a single-eye tactical eyepiece over one eye — a sleek angular optic with a faint cyan HUD glow and a thin alloy frame, combat-ready techwear" },
    { name: "双眼全息护目", text: "wearing low-profile dual-eye holographic tactical goggles with a soft amber HUD shimmer and matte tactical housing" },
    { name: "战术面甲目镜", text: "wearing a lightweight tactical half-face visor covering the eyes, with a thin glowing scan-line and armored side mounts" },
  ];
  function npcTacticalOptic(idx) {
    const i = Math.max(0, Math.min((idx | 0), NPC_TACTICAL_OPTICS.length - 1));
    return NPC_TACTICAL_OPTICS[i] || { name: "无（常规）", text: "" };
  }

  // —— 义体改造生图需求（义眼 / 义肢；用户 2026-10-23 要求：加进词条 + 生图需求）——
  const AUGMENT_BASE =
    "Stylized sci-fi cyberware hero shot, clean concept-art style, semi-realistic painterly rendering, extreme close-up of a single cybernetic augmentation on a human subject, dramatic colored rim light, plain dark gradient background, game-key-art quality, polished, cinematic.";
  const AUGMENT_NEGATIVE =
    "extra people, full body, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, blurry, low quality, photo grain, anime, cartoon, deformed, extra limbs";
  const AUGMENT_OUT_DIR = "assets/portraits/augments";
  const AUGMENT_PROMPTS = [
    { id: "aug_eye", name: "义眼", color: "#3fd0e0", outName: "nsk_aug_eye.webp", ratio: "3:4",
      variants: [
        "sleek optical eye implant, glowing cyan iris lens, subtle chrome ring around the eye socket",
        "military-grade targeting eye, amber HUD reticle projected, scarred socket",
        "archotech eye, violet luminescent iris, faint circuit traces under the surrounding skin",
      ],
      accent: "Single cybernetic eye: a polished optical lens replacing one natural eye, faint inner glow, integrated into a weathered mercenary face, extreme close-up, high detail on the implant mechanism and iris." },
    { id: "aug_limb", name: "义肢", color: "#c0c6cf", outName: "nsk_aug_limb.webp", ratio: "3:4",
      variants: [
        "bionic arm, brushed chrome plating, articulated fingers, visible hydraulic joints",
        "powered exo-limb, matte gunmetal with orange accent lines, heavy servos",
        "archotech limb, pearlescent white-and-gold, seamless energy conduits",
      ],
      accent: "Single cybernetic limb: a mechanical arm with visible actuators and a synthetic-skin blend at the shoulder, worn by a mercenary, dramatic rim light, extreme close-up of the augmentation." },
  ];

  function buildAugmentPrompt(augId, variantIdx) {
    const a = AUGMENT_PROMPTS.find(x => x.id === augId);
    if (!a) return "";
    const v = a.variants[variantIdx || 0];
    return [AUGMENT_BASE, a.accent, v, AUGMENT_NEGATIVE].join("\n\n");
  }
  function augOutName(augId) {
    const a = AUGMENT_PROMPTS.find(x => x.id === augId);
    return a ? a.outName : ("nsk_aug_" + augId + ".webp");
  }

  // —— 新手引导角色（2）：全息 AI Flora + 边疆拓殖民公社本地登记人 ——
  // 造型依据旧作新手任务（教程序章 P1）：序章「边疆调度员」= 光头男人、
  // 一只猩红的电子眼、浓密的胡须、促狭的笑容、坐在油腻的合金桌后。本作将其落为「本地登记人」。
  // Flora 为全新角色（旧作教程中不存在），设定为舰基核心投放的全息 AI 引导员。
  // 每个角色 3 套：立绘（站立/坐姿含环境）· 对话头像（半身）· 姿态（引导指向 / 盖章递单）。
  // 落盘目录 assets/portraits/guides/，文件名 nsk_guide_<id>[_<key>].webp（key 缺省省略 = 第 1 套）。
  const GUIDE_OUT_DIR = "assets/portraits/guides";
  // 基底不写背景，由各变体自行指定（登记人立绘要办公室环境，头像要纯色渐变）——
  // 避免「基底说纯色背景、变体又说办公室」的自相矛盾。
  const GUIDE_BASE =
    "Stylized sci-fi character portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, soft studio lighting with one colored key light, high detail on face and outfit, game-key-art quality, polished, cinematic.";
  const GUIDE_HOLO_BASE =
    "Stylized sci-fi holographic character portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, semi-transparent volumetric light figure with soft cyan-teal glow, subtle scanline shimmer and faint chromatic light edges, high detail, game-key-art quality, polished, cinematic.";
  const GUIDE_NEGATIVE =
    "extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon";

  const GUIDE_CHARACTERS = [
    {
      id: "flora",
      name: "Flora",
      role: "全息 AI 引导员",
      affiliation: "舰基核心 · 全息助手",
      color: "#5fe0d0",
      ratio: "3:4",
      holo: true,
      designNote: "全息投影 AI，女性形象。半透明体积光身体 + 青绿辉光 + 扫描线微闪；发丝带数字渐变；极简高领助手制服、细电路滚边；脚下有发光投影发射环，周围漂浮数据微粒。气质：耐心、清晰、可靠，偶尔一本正经地挖苦。用途：新手引导的主叙述者 / 系统解释。",
      accent: "Female-presenting holographic AI assistant, sleek semi-transparent volumetric light-body with soft cyan-teal glow, subtle scanline shimmer and faint chromatic light edges, flowing luminous shoulder-length hair with a digital gradient, calm friendly and helpful expression with a gentle smile, minimalist high-collar assistant uniform with subtle circuit trim, small data motes drifting around her, hard-light hologram aesthetic, approachable onboarding-guide presence.",
      variants: [
        { key: "",      name: "立绘（站立引导）", text: "Full-body standing three-quarter view, one hand raised in a calm welcoming gesture, legs dissolving into soft light below the knee, projected from a glowing emitter ring at her feet, plain dark gradient background, serene and reassuring." },
        { key: "bust",  name: "对话头像（半身）", text: "Head-and-shoulders bust, speaking warmly with an attentive smile, eyes meeting the viewer, holographic translucency most visible at the shoulders and hair tips, plain dark gradient background." },
        { key: "point", name: "引导指向（全息面板）", text: "Three-quarter bust, gesturing toward a floating translucent holographic interface panel beside her, explaining with a patient confident expression, faint UI glow reflecting on her face, plain dark gradient background." },
      ],
    },
    {
      id: "registrar",
      name: "边疆拓殖民公社·本地登记人",
      role: "序章登记官",
      affiliation: "边疆拓殖民公社 · 登记处",
      color: "#c8442f",
      ratio: "3:4",
      holo: false,
      designNote: "边疆登记站的光头中年登记官：浓密灰褐胡须、右眼换成一枚猩红电子眼（细铬圈）、促狭揶揄的笑、油亮红润的脸。穿褪色打补丁的公社制服、袖子卷起；立绘坐油腻合金桌后，桌上堆盖过章的单据 / 橡皮图章 / 搪瓷杯。气质：油滑、懒散、爱挖苦，但守规矩。用途：序章引导 + 交付/报销类任务。",
      accent: "Middle-aged heavy-set frontier registration officer of the colonization commune, completely bald with a smooth scalp, thick bushy grey-brown beard, one glowing crimson cybernetic eye replacing his right eye with a thin chrome socket ring, sly knowing smirk, weathered ruddy face, worn faded colonial-commune jacket with peeling patches and rolled-up sleeves.",
      variants: [
        { key: "",      name: "立绘（坐姿·含桌）", text: "Three-quarter seated composition behind a scuffed greasy alloy desk cluttered with stamped forms, a rubber stamp, a clipboard and a chipped enamel mug, both hands resting on a stack of paperwork, leaning back with a wry appraising look, grimy frontier registration office with a dim overhead lamp and stacked paper files." },
        { key: "bust",  name: "对话头像（半身）", text: "Head-and-shoulders bust, sly knowing smirk, one eyebrow slightly raised, the crimson cybernetic eye catching a glint of light, softly blurred grimy office clutter behind him, plain dark gradient background." },
        { key: "stamp", name: "盖章姿态（递单）", text: "Three-quarter view mid-action, pressing a worn rubber stamp onto a form with one hand while sliding a clipboard toward the viewer with the other, impatient but amused expression, grimy frontier registration office behind." },
      ],
    },
  ];

  // 拼装引导角色 Prompt：基底（全息 / 真人）+ 造型 accent + 变体构图 + 负向
  function buildGuidePrompt(guideId, variantIdx) {
    const g = GUIDE_CHARACTERS.find(x => x.id === guideId);
    if (!g) return "";
    const v = (g.variants && g.variants[variantIdx || 0]) || {};
    const base = g.holo ? GUIDE_HOLO_BASE : GUIDE_BASE;
    const parts = [base, g.accent, v.text, GUIDE_NEGATIVE].filter(Boolean);
    return parts.join("\n\n");
  }
  // 落盘文件名：nsk_guide_<id>[_<key>].webp（第 1 套 key 为空 → 不带后缀）
  function guideOutName(guideId, variantIdx) {
    const g = GUIDE_CHARACTERS.find(x => x.id === guideId);
    if (!g) return "nsk_guide_" + guideId + ".webp";
    const v = (g.variants && g.variants[variantIdx || 0]) || {};
    return "nsk_guide_" + guideId + (v.key ? "_" + v.key : "") + ".webp";
  }
  function guideOutPath(guideId, variantIdx) {
    return GUIDE_OUT_DIR + "/" + guideOutName(guideId, variantIdx);
  }

  const NPC_OUT_DIR = "assets/portraits/npc";
  const NPC_VARIANT_COUNT = 4;
  // 同一 combo（原型+变体+清凉/义体）最多允许存的变体张数；游戏运行时在其中随机抽一张
  const NPC_DRAW_MAX = 9;

  // —— 拼装完整 prompt ——
  function buildContactPrompt(factionId) {
    const f = FACTION_CONTACTS.find(x => x.factionId === factionId);
    if (!f) return "";
    return [CONTACT_BASE, f.accent, CONTACT_NEGATIVE].join("\n\n");
  }
  function buildNpcPrompt(archId, variantIdx, opts) {
    const a = NPC_ARCHETYPES.find(x => x.id === archId);
    if (!a) return "";
    const vi = variantIdx || 0;
    const v = (a.variants && a.variants[vi]) || "";
    let look = a.accent;
    if (opts && opts.revealing && vi === 0) {
      const pool = npcRevealOutfitPool(archId);
      const idx = Math.max(0, Math.min((opts.outfit | 0), pool.length - 1));
      look = pool[idx].text;
    }
    let subj = v || "";
    if (opts && opts.hairHighlight) {
      const hl = npcHairHighlight(opts.hairHighlight).text;
      if (hl) subj = subj + ", " + hl;
    }
    // 男性特征（墨镜/光头）仅对男性变体生效；非男性变体忽略，避免误加到女/中性身上
    if (opts && opts.maleTrait && npcIsMaleVariant(vi)) {
      const mt = npcMaleTrait(opts.maleTrait).text;
      if (mt) subj = subj + ", " + mt;
    }
    // 战术目镜（对所有变体生效；纯生成期修饰，不影响落盘 combo）
    if (opts && opts.tacticalOptic) {
      const to = npcTacticalOptic(opts.tacticalOptic).text;
      if (to) subj = subj + ", " + to;
    }
    const parts = [NPC_BASE, look, subj];
    if (opts && opts.augment === "eye") parts.push(NPC_AUG_EYE);
    else if (opts && opts.augment === "limb") parts.push(NPC_AUG_LIMB);
    else if (opts && opts.augment === "both") { parts.push(NPC_AUG_EYE); parts.push(NPC_AUG_LIMB); }
    parts.push(NPC_NEGATIVE);
    return parts.join("\n\n");
  }
  // —— NPC 落盘命名（按原型分文件夹 + 原型前缀 + 同 combo 多张）——
  // 目录：assets/portraits/npc/<archId>/            ← 每个原型一个文件夹，避免几百张图混在一个目录
  // 文件：<archId>_<variantToken>[_augToken][_<draw>].webp   ← 文件名始终带原型前缀，拷出文件夹也能自证身份
  //   <archId>     = 原型 id（如 corp_heir / belt_nomad）
  //   variantToken = v1 / v2 / v3 / v4；V1「清凉版」固定为 reveal（清凉版因此拥有独立名）
  //   augToken     = _eye / _limb / _eye_limb（义眼 / 义肢 / 双改造）
  //   <draw>       = 同 combo 的第几张：第 1 张省略，第 2 张起 _2 / _3 …（封顶 NPC_DRAW_MAX）
  // 例：npc/corp_heir/corp_heir_v1.webp · npc/corp_heir/corp_heir_reveal.webp · npc/corp_heir/corp_heir_reveal_2.webp · npc/corp_heir/corp_heir_v3_eye_limb.webp
  // manifest.json 键 = "<archId>/<comboStem>"（如 "corp_heir/reveal"），值 = 相对 npc/ 的路径数组（如 "corp_heir/corp_heir_reveal_2.webp"）。
  function npcVariantToken(variantIdx, opts) {
    if ((variantIdx | 0) === 0 && opts && opts.revealing) return "reveal";
    return "v" + ((variantIdx | 0) + 1);
  }
  function npcAugToken(opts) {
    const a = opts && opts.augment;
    if (a === "eye") return "_eye";
    if (a === "limb") return "_limb";
    if (a === "both") return "_eye_limb";
    return "";
  }
  // 原型子目录名（= 原型 id）
  function npcSubDir(archId) { return archId; }
  // combo 稳定键（不含 draw / 扩展名）："corp_heir/reveal"
  function npcComboKey(archId, variantIdx, opts) {
    return npcSubDir(archId) + "/" + npcVariantToken(variantIdx, opts) + npcAugToken(opts);
  }
  // 裸文件名（写入 <archId>/ 目录时用）："corp_heir_reveal_2.webp" —— 始终带原型前缀
  function npcOutName(archId, variantIdx, opts) {
    const stem = archId + "_" + npcVariantToken(variantIdx, opts) + npcAugToken(opts);
    const draw = (opts && opts.draw) ? Math.max(1, opts.draw | 0) : 1;
    return stem + (draw <= 1 ? "" : "_" + draw) + ".webp";
  }
  // 相对 game/ 的完整路径（后台预览 / 运行时加载 / manifest 存值）
  function npcOutPath(archId, variantIdx, opts) {
    return NPC_OUT_DIR + "/" + npcSubDir(archId) + "/" + npcOutName(archId, variantIdx, opts);
  }
  // 反查：文件名 -> { variantIdx, revealing, augment, draw }（重建清单用；不认识返回 null）
  // 文件名带原型前缀（如 corp_heir_reveal_2.webp）：archId 已知时优先按它剥前缀；
  // 未知时按全部原型 id（长的优先）试剥；仍不匹配则兜底解析「无前缀」旧名（兼容手工放入的图）。
  function npcParseName(file, archId) {
    let base = String(file || "").replace(/^.*[\/\\]/, "");
    const stripId = (id) => {
      id = String(id || "");
      return (id && base.toLowerCase().indexOf(id.toLowerCase() + "_") === 0) ? base.slice(id.length + 1) : null;
    };
    let rest = archId ? stripId(archId) : null;
    if (rest === null) {
      const ids = NPC_ARCHETYPES.map(a => a.id).sort((a, b) => b.length - a.length);
      for (let i = 0; i < ids.length; i++) { const r = stripId(ids[i]); if (r !== null) { rest = r; break; } }
    }
    if (rest === null) rest = base; // 兜底：无前缀（旧/手工命名）
    const m = /^(v[1-4]|reveal)(_eye_limb|_eye|_limb)?(?:_(\d+))?\.webp$/i.exec(rest);
    if (!m) return null;
    const tok = m[1].toLowerCase();
    const revealing = tok === "reveal";
    const at = m[2] || "";
    return {
      variantIdx: revealing ? 0 : ((tok.slice(1) | 0) - 1),
      revealing,
      augment: at === "_eye" ? "eye" : at === "_limb" ? "limb" : at === "_eye_limb" ? "both" : null,
      draw: m[3] ? (m[3] | 0) : 1,
    };
  }
  // 旧版「扁平目录 + 长名」命名，仅用于迁移旧图：nsk_npc_<id>_<1..4>[_reveal][_eye|_limb|_eye_limb][_<draw>].webp
  function npcLegacyOutName(archId, variantIdx, opts) {
    let suf = "";
    if (opts && opts.revealing && (variantIdx | 0) === 0) suf += "_reveal";
    suf += npcAugToken(opts);
    const draw = (opts && opts.draw) ? Math.max(1, opts.draw | 0) : 1;
    return "nsk_npc_" + archId + "_" + ((variantIdx | 0) + 1) + suf + (draw <= 1 ? ".webp" : "_" + draw + ".webp");
  }

  // —— 整合 Markdown 文档（供后台导出 / Node 脚本生成，单一真相源）——
  // 取代原先散落在仓库根的 6 份 .md（势力联络人 / 中小型势力 / 军团NPC头像 /
  // NPC头图 / 清凉版 / 义眼义肢），全部由本函数从自身数据生成，避免文档漂移。
  function buildPromptDoc(){
    const L = [];
    const line = s => L.push(s);
    const fence = b => { L.push("```"); L.push(b); L.push("```"); L.push(""); };
    const H = (n,p) => { L.push("**" + n + "**" + (p ? " — " + p : "")); L.push(""); };

    line("# 深空星疆 · 生图 Prompt 整合包");
    line("");
    line("> 由 `game/js/data/asset-prompts.js`（单一真相源）自动生成。");
    line("> 编辑请在可视化后台 `game/asset-admin.html` 修改，再重新导出本文件，避免多份文档漂移。");
    line("");

    // —— 一、势力联络人 / 中小型势力 ——
    line("## 一、势力联络人 / 中小型势力（" + FACTION_CONTACTS.length + "）");
    line("");
    H("共享基底"); fence(CONTACT_BASE);
    H("共享负向"); fence(CONTACT_NEGATIVE);
    line("每张 = 基底 + 对应 accent + 负向。比例 3:4，落盘 `game/assets/portraits/factions/`。");
    line("");
    line("### 各势力 accent + 落盘名");
    FACTION_CONTACTS.forEach(f=>{
      line("");
      H("" + f.name + " (`" + f.factionId + "`) → `" + f.outName + "`" + (f.visualOnly ? "（仅美术，不派任务）" : ""));
      fence(f.accent || "");
    });

    // —— 二、军团 NPC 头像 ——
    line("");
    line("## 二、军团 NPC 头像（" + NPC_ARCHETYPES.length + " 原型 × " + NPC_VARIANT_COUNT + " 变体 + 清凉版 + 义体组合）");
    line("");
    H("共享基底"); fence(NPC_BASE);
    H("共享负向"); fence(NPC_NEGATIVE);
    H("清凉版兜底（某原型未写专属 reveal 时用）"); fence(NPC_REVEALING);
    H("义眼片段"); fence(NPC_AUG_EYE);
    H("义肢片段"); fence(NPC_AUG_LIMB);
    line("基础版每张 = 基底 + 原型 accent + 变体 token + 负向。比例 3:4。");
    line("落盘**按原型分文件夹**：`game/assets/portraits/npc/<原型id>/`（如 `npc/corp_heir/`），避免几百张图堆在一个目录里。");
    line("文件名：`<原型id>_<variantToken>[_augToken][_<draw>].webp`（**文件名始终带原型前缀**，图被拷出文件夹也能一眼看出属于哪个原型）。`variantToken` = `v1`/`v2`/`v3`/`v4`；**V1 清凉版固定为 `reveal`**（清凉版因此有独立名，如 `corp_heir_reveal.webp`）；`augToken` = `_eye`/`_limb`/`_eye_limb`；`<draw>` 为「同一 combo 的第几张」：**第 1 张省略**，第 2 张起 `_2`/`_3`…（最多 `NPC_DRAW_MAX` 张）。");
    line("例：`npc/corp_heir/corp_heir_v1.webp`（V1 基础第 1 张）· `npc/corp_heir/corp_heir_reveal.webp`（V1 清凉版第 1 张）· `npc/corp_heir/corp_heir_reveal_2.webp`（清凉版第 2 张）· `npc/corp_heir/corp_heir_v3_eye_limb.webp`（V3 双改造）· `npc/corp_heir/corp_heir_reveal_eye_2.webp`（清凉+义眼第 2 张）。");
    line("");
    line("**清凉版 = 随机服装库**：每个原型的 V1 清凉版不是单一穿搭，而是一组「清凉 + 露肩颈锁骨 + 身份感」的服装池（`NPC_REVEAL_OUTFIT_POOLS`）。后台「服装风格」下拉选哪套就拼哪套 Prompt，生成后存成同一 `reveal` combo 的第 2/3… 张（`_2`/`_3`…），游戏运行时在同 combo 已存张里随机抽一张。下方每个原型的「V1 清凉版」会列出它的全部服装选项，按编号逐一生成即可铺满随机池。");
    line("**挑染（发色高光）**：每个变体的发色描述可叠加一款挑染（`NPC_HAIR_HIGHLIGHTS`，如银白 / 霓虹青紫 / 暖金 / 暗紫 / 冰蓝 / 玫瑰），后台「挑染」下拉选款或 🎲 随机抽一款。纯生成期修饰，不影响落盘 combo（与服装池、义体同级）。");
    line("**男性特征（墨镜 / 光头）**：仅对男性变体（V2 年长男 / V4 年轻男）生效，叠加到发色描述之后（`NPC_MALE_FACIALS`）。后台切到男性变体时会出现「男性特征」下拉，选墨镜或光头、或 🎲 随机抽一款，右侧 Prompt 即时重拼。生成多张带不同男性特征的同变体图、存进同一 combo 的不同 draw（`_2`/`_3`…），即「男性随机词条」随机池。⚠ 光头会覆盖变体自带发色，生图前以光头条为准。");
    line("**战术目镜（电子作战目镜）**：对所有变体（V1–V4）生效，叠加到变体描述之后（`NPC_TACTICAL_OPTICS`：单眼战术目镜 / 双眼全息护目 / 战术面甲目镜）。后台「战术目镜」下拉选款或 🎲 随机抽一款，纯生成期修饰，不影响落盘 combo（与挑染同级）。生成多张带不同目镜的同变体图、存进同一 combo 的不同 draw，即随机池。");
    line("游戏运行时读取 `assets/portraits/npc/manifest.json`（由可视化后台 `game/asset-admin.html` 在每次存图后自动维护；也可用后台「重建清单」按钮从磁盘恢复），键为 `<原型id>/<comboStem>`、值为相对路径数组；在同 combo 已存的若干张里**随机抽一张**显示，避免同一原型千篇一律。");
    line("");
    NPC_ARCHETYPES.forEach(a=>{
      line("");
      H("原型 `" + a.id + "`", a.source);
      line("外貌关键词：" + a.look);
      line("");
      H("accent"); fence(a.accent);
      (a.variants||[]).forEach((_,k)=>{
        line("");
        H(NPC_VARIANT_LABELS[k] || ("V"+(k+1)));
        fence(buildNpcPrompt(a.id,k,{}));
        if(k===0 && a.reveal){
          line("");
          H("V1 清凉版（露肩 / 露腰 · 随机服装库）");
          const pool = npcRevealOutfitPool(a.id);
          pool.forEach((o,oi)=>{
            line("");
            line("**服装 " + (oi+1) + " · " + o.name + "**（存为 `reveal" + (oi===0?"":("_"+(oi+1))) + ".webp`）");
            fence(buildNpcPrompt(a.id,0,{revealing:true, outfit:oi}));
          });
        }
      });
    });
    line("");
    line("### 义眼 / 义肢 / 双改造 组合（叠加到各原型 V1 清凉版，14 × 3 = 42）");
    NPC_ARCHETYPES.forEach(a=>{
      line("");
      H("`" + a.id + "` + 义眼");
      fence(buildNpcPrompt(a.id,0,{revealing:true, augment:"eye"}));
      line("");
      H("`" + a.id + "` + 义肢");
      fence(buildNpcPrompt(a.id,0,{revealing:true, augment:"limb"}));
      line("");
      H("`" + a.id + "` + 双改造(眼+肢)");
      fence(buildNpcPrompt(a.id,0,{revealing:true, augment:"both"}));
    });

    // —— 三、义体改造 ——
    line("");
    line("## 三、义体改造生图需求（" + AUGMENT_PROMPTS.length + "）");
    line("");
    H("共享基底"); fence(AUGMENT_BASE);
    H("共享负向"); fence(AUGMENT_NEGATIVE);
    line("每张 = 基底 + accent + 变体 + 负向。比例 3:4，落盘 `game/assets/portraits/augments/`。");
    line("");
    AUGMENT_PROMPTS.forEach(ag=>{
      line("");
      H("" + ag.name + " (`" + ag.id + "`) → `" + ag.outName + "`");
      H("accent"); fence(ag.accent || "");
      (ag.variants||[]).forEach((_,k)=>{
        line("");
        H("变体 V" + (k+1));
        fence(buildAugmentPrompt(ag.id,k));
      });
    });

    // —— 四、新手引导角色 ——
    line("");
    line("## 四、新手引导角色（" + GUIDE_CHARACTERS.length + "）");
    line("");
    H("共享基底（真人角色）"); fence(GUIDE_BASE);
    H("共享基底（全息投影角色）"); fence(GUIDE_HOLO_BASE);
    H("共享负向"); fence(GUIDE_NEGATIVE);
    line("每张 = 基底（全息 / 真人按角色取）+ 造型 accent + 变体构图 + 负向。比例 3:4，落盘 `game/" + GUIDE_OUT_DIR + "/`。");
    line("文件名：`nsk_guide_<id>[_<key>].webp`（第 1 套 `key` 为空 → 不带后缀）。");
    line("");
    GUIDE_CHARACTERS.forEach(g=>{
      line("");
      H("" + g.name + " (`" + g.id + "`)", g.role + (g.affiliation ? " · " + g.affiliation : ""));
      line("造型说明：" + (g.designNote || ""));
      line("");
      H("造型 accent"); fence(g.accent || "");
      (g.variants || []).forEach((v, k) => {
        line("");
        H("" + (v.name || ("变体 " + (k + 1))) + " → `" + guideOutName(g.id, k) + "`");
        fence(buildGuidePrompt(g.id, k));
      });
    });

    return L.join("\n");
  }

  return {
    CONTACT_BASE, CONTACT_NEGATIVE, CONTACT_OUT_DIR, NPC_BASE, NPC_NEGATIVE, NPC_REVEALING,
    NPC_AUG_EYE, NPC_AUG_LIMB, NPC_VARIANT_LABELS, NPC_VARIANT_COUNT, NPC_OUT_DIR, NPC_DRAW_MAX,
    FACTION_CONTACTS, NPC_ARCHETYPES,
    AUGMENT_BASE, AUGMENT_NEGATIVE, AUGMENT_OUT_DIR, AUGMENT_PROMPTS,
    GUIDE_OUT_DIR, GUIDE_BASE, GUIDE_HOLO_BASE, GUIDE_NEGATIVE, GUIDE_CHARACTERS,
    buildGuidePrompt, guideOutName, guideOutPath,
    buildContactPrompt, buildNpcPrompt, npcOutName, npcOutPath, npcComboKey,
    npcVariantToken, npcAugToken, npcSubDir, npcParseName, npcLegacyOutName,
    npcRevealOutfitPool, NPC_REVEAL_OUTFIT_POOLS, NPC_HAIR_HIGHLIGHTS, npcHairHighlight,
    NPC_MALE_FACIALS, npcMaleTrait, npcIsMaleVariant,
    NPC_TACTICAL_OPTICS, npcTacticalOptic,
    buildAugmentPrompt, augOutName, buildPromptDoc,
  };
});
