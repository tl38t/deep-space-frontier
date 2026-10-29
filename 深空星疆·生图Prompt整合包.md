# 深空星疆 · 生图 Prompt 整合包

> 由 `game/js/data/asset-prompts.js`（单一真相源）自动生成。
> 编辑请在可视化后台 `game/asset-admin.html` 修改，再重新导出本文件，避免多份文档漂移。

## 一、势力联络人 / 中小型势力（10）

**共享基底**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral confident expression, soft studio lighting with one colored key light, plain dark gradient background with no environment, composed as a holographic communications feed with a thin HUD line frame and subtle corner signal ticks, high detail on face and outfit, game-key-art quality, polished, cinematic.
```

**共享负向**

```
extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```

每张 = 基底 + 对应 accent + 负向。比例 3:4，落盘 `game/assets/portraits/factions/`。

### 各势力 accent + 落盘名

**苍穹劫团 (`angel`) → `nsk_fac_angel_contact.webp`**

```
Teal-cyan key light (#5ad1a0). Weathered freebooter look: patched leather flight jacket with a small faction insignia pin, one subtle cybernetic eye implant, mid-age charismatic veteran quartermaster, relaxed confident smirk, salvaged-but-stylish gear, roguish charm.
```


**赤誓教团 (`blood`) → `nsk_fac_blood_contact.webp`**

```
Rose-pink and dark-silver key light (#e879a8). Austere ecclesiastical-military vestments with ceremonial pauldrons, crimson-covenant holy emblem on chest, stern monk-warrior commander, tied-back hair, solemn devout expression, upright posture, disciplined.
```


**静默集群 (`sansha`) → `nsk_fac_sansha_contact.webp`**

```
Amber-gold key light (#e8b45a). Heavily cybernetically augmented post-human: partial facial armor plating, one eye an optical lens, faint glowing circuit lines under skin, neutral androgynous, extremely restrained calm expression, uncanny silent stillness.
```


**银河联盟 (`alliance`) → `nsk_fac_alliance_contact.webp`（仅美术，不派任务）**

```
Azure-blue key light (#4d8fe0). Crisp standardized federation fleet uniform with star insignia shoulder marks and thin gold trim, polished federal commissioner, neat hair, upright professional posture, calm impartial authoritative expression, tidy blue command-center light bands behind.
```


**边陲矿业公会 (`mining_guild`) → `nsk_fac_mining_guild_contact.webp`**

```
Warm earthy brown key light (#b5793f). Burly veteran miner foreman, worn hard hat with a mounted lamp, ochre work uniform, broad shoulders, weathered face and hands, pragmatic blue-collar demeanor, faint dust on jacket.
```


**拾荒者联合体 (`salvage_union`) → `nsk_fac_salvage_union_contact.webp`**

```
Rust-orange key light (#c9772e). Chief salvage officer, tool-laden utility belt and harness, eyepatch, patched rust-orange salvage coat made of scavenged panels, scrappy resourceful look, grease-smudged cheek.
```


**孤星商社 (`lone_star`) → `nsk_fac_lone_star_contact.webp`**

```
Champagne-gold key light (#d8c07a). Sharp trading company quartermaster, silk cravat, electronic ledger tablet in hand, long champagne-gold robe, clever merchant expression, polished and composed.
```


**深空研究院 (`abyssal_inst`) → `nsk_fac_abyssal_inst_contact.webp`**

```
Pale violet key light (#9b8fd0). Stern chief researcher, white lab coat, holographic data tablet, calm detached scholarly expression, faint violet data-glow on glasses, immaculate and precise.
```


**悬赏者同盟 (`bounty_league`) → `nsk_fac_bounty_league_contact.webp`**

```
Deep crimson key light (#b02a1f). Bounty broker, lean practical intermediary, leather jerkin, stack of wanted posters, deep-crimson travel cloak, cool professional stare, no-nonsense attitude.
```


**拓殖议会 (`settlers`) → `nsk_fac_settlers_contact.webp`**

```
Wheat-green key light (#b5c46a). Frontier town councilor, plain agrarian leader, crop-colored apron over simple clothes, colony insignia pin, warm earnest expression, humble frontier practicality.
```


## 二、军团 NPC 头像（21 原型 × 4 变体 + 清凉版 + 义体组合）

**共享基底**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.
```

**共享负向**

```
extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```

**清凉版兜底（某原型未写专属 reveal 时用）**

```
revealing sci-fi outfit variant: form-fitting bodysuit with strategic cutouts and an exposed midriff, confident alluring pose, glamour-ready styling, fabric with subtle tech detailing and a single accent seam.
```

**义眼片段**

```
Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.
```

**义肢片段**

```
Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.
```

基础版每张 = 基底 + 原型 accent + 变体 token + 负向。比例 3:4。
落盘**按原型分文件夹**：`game/assets/portraits/npc/<原型id>/`（如 `npc/corp_heir/`），避免几百张图堆在一个目录里。
文件名：`<原型id>_<variantToken>[_augToken][_<draw>].webp`（**文件名始终带原型前缀**，图被拷出文件夹也能一眼看出属于哪个原型）。`variantToken` = `v1`/`v2`/`v3`/`v4`；**V1 清凉版固定为 `reveal`**（清凉版因此有独立名，如 `corp_heir_reveal.webp`）；`augToken` = `_eye`/`_limb`/`_eye_limb`；`<draw>` 为「同一 combo 的第几张」：**第 1 张省略**，第 2 张起 `_2`/`_3`…（最多 `NPC_DRAW_MAX` 张）。
例：`npc/corp_heir/corp_heir_v1.webp`（V1 基础第 1 张）· `npc/corp_heir/corp_heir_reveal.webp`（V1 清凉版第 1 张）· `npc/corp_heir/corp_heir_reveal_2.webp`（清凉版第 2 张）· `npc/corp_heir/corp_heir_v3_eye_limb.webp`（V3 双改造）· `npc/corp_heir/corp_heir_reveal_eye_2.webp`（清凉+义眼第 2 张）。

**清凉版 = 随机服装库**：每个原型的 V1 清凉版不是单一穿搭，而是一组「清凉 + 露肩颈锁骨 + 身份感」的服装池（`NPC_REVEAL_OUTFIT_POOLS`）。后台「服装风格」下拉选哪套就拼哪套 Prompt，生成后存成同一 `reveal` combo 的第 2/3… 张（`_2`/`_3`…），游戏运行时在同 combo 已存张里随机抽一张。下方每个原型的「V1 清凉版」会列出它的全部服装选项，按编号逐一生成即可铺满随机池。
**挑染（发色高光）**：每个变体的发色描述可叠加一款挑染（`NPC_HAIR_HIGHLIGHTS`，如银白 / 霓虹青紫 / 暖金 / 暗紫 / 冰蓝 / 玫瑰），后台「挑染」下拉选款或 🎲 随机抽一款。纯生成期修饰，不影响落盘 combo（与服装池、义体同级）。
**男性特征（墨镜 / 光头）**：仅对男性变体（V2 年长男 / V4 年轻男）生效，叠加到发色描述之后（`NPC_MALE_FACIALS`）。后台切到男性变体时会出现「男性特征」下拉，选墨镜或光头、或 🎲 随机抽一款，右侧 Prompt 即时重拼。生成多张带不同男性特征的同变体图、存进同一 combo 的不同 draw（`_2`/`_3`…），即「男性随机词条」随机池。⚠ 光头会覆盖变体自带发色，生图前以光头条为准。
**战术目镜（电子作战目镜）**：对所有变体（V1–V4）生效，叠加到变体描述之后（`NPC_TACTICAL_OPTICS`：单眼战术目镜 / 双眼全息护目 / 战术面甲目镜）。后台「战术目镜」下拉选款或 🎲 随机抽一款，纯生成期修饰，不影响落盘 combo（与挑染同级）。生成多张带不同目镜的同变体图、存进同一 combo 的不同 draw，即随机池。
游戏运行时读取 `assets/portraits/npc/manifest.json`（由可视化后台 `game/asset-admin.html` 在每次存图后自动维护；也可用后台「重建清单」按钮从磁盘恢复），键为 `<原型id>/<comboStem>`、值为相对路径数组；在同 combo 已存的若干张里**随机抽一张**显示，避免同一原型千篇一律。


**原型 `belt_nomad`** — 小行星带游牧

外貌关键词：耐磨保温采矿夹克、工具挂带、尘垢、实用拾荒感

**accent**

```
Dusty asteroid-belt nomad look: worn insulated mining jacket, utility harness, grime and dust on clothes, practical scavenger vibe, frontier miner aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Dusty asteroid-belt nomad look: worn insulated mining jacket, utility harness, grime and dust on clothes, practical scavenger vibe, frontier miner aesthetic.

young woman, short practical soft pastel-peach hair, sun-kissed skin, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 采矿背心+工字背心**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Dusty asteroid-belt nomad look: unzipped cropped mining vest worn loosely over a fitted low-cut tank top, bare shoulders and collarbone visible with light smudge of dust, light utility straps, frontier scavenger aesthetic.

young woman, short practical soft pastel-peach hair, sun-kissed skin, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 露肩沙漠披裹**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frayed strappy desert poncho slipped off one sun-baked shoulder over a dusty bandeau, bare collarbone with grime smudge, woven tool-belt across chest, frontier scavenger aesthetic.

young woman, short practical soft pastel-peach hair, sun-kissed skin, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 网纱求生露肩**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Open lightweight survival harness over a tied-off cropped mesh undershirt, both shoulders bare and dust-streaked, salvaged goggle strap at neck, pragmatic asteroid-belt nomad look.

young woman, short practical soft pastel-peach hair, sun-kissed skin, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Dusty asteroid-belt nomad look: worn insulated mining jacket, utility harness, grime and dust on clothes, practical scavenger vibe, frontier miner aesthetic.

older man, sun-bleached golden-blonde hair, weathered golden-grey beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Dusty asteroid-belt nomad look: worn insulated mining jacket, utility harness, grime and dust on clothes, practical scavenger vibe, frontier miner aesthetic.

person of ambiguous gender, mid-age, muted lavender-grey hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Dusty asteroid-belt nomad look: worn insulated mining jacket, utility harness, grime and dust on clothes, practical scavenger vibe, frontier miner aesthetic.

young man, clean-cut copper-red hair with golden-blonde tips, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `fleet_brat`** — 舰队子弟

外貌关键词：挺括舰队制服+军衔徽、纪律姿态、海军军官感

**accent**

```
Military-academy officer look: crisp fleet uniform with rank insignia, disciplined posture, naval officer aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Military-academy officer look: crisp fleet uniform with rank insignia, disciplined posture, naval officer aesthetic.

young woman, short practical champagne-blonde hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 无袖军官上衣**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Military-academy officer look: tailored sleeveless fleet officer top with a deep open collar, bare shoulders and collarbone visible, metallic rank insignia on collar strap, sleek naval aesthetic.

young woman, short practical champagne-blonde hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 露肩海军白领礼裙**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Off-shoulder dress-white naval gown with a single bare shoulder and a thin gold aiguillette, bare collarbone, crisp fleet ball aesthetic.

young woman, short practical champagne-blonde hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 敞怀军官夹克**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Open-front officer jacket slipped off both shoulders over a low-cut silk camisole, bare collarbone with rank pin, disciplined-yet-revealing naval cadet look.

young woman, short practical champagne-blonde hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Military-academy officer look: crisp fleet uniform with rank insignia, disciplined posture, naval officer aesthetic.

older man, swept-back silver-white hair, weathered iron-grey beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Military-academy officer look: crisp fleet uniform with rank insignia, disciplined posture, naval officer aesthetic.

person of ambiguous gender, mid-age, sleek rose-gold hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Military-academy officer look: crisp fleet uniform with rank insignia, disciplined posture, naval officer aesthetic.

young man, clean-cut icy silver-blue hair, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `orphan_void`** — 虚空孤儿

外貌关键词：拼凑义体植入、拾荒虚空服、诡静、后人类

**accent**

```
Salvaged half-machine orphan look: patchwork augmented implants, scavenged void-suit, eerie calm, post-human scavenger.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvaged half-machine orphan look: patchwork augmented implants, scavenged void-suit, eerie calm, post-human scavenger.

young woman, short practical platinum-white hair with cyan tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 无袖虚空服网纱**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvaged half-machine orphan look: lightweight sleeveless void-suit harness over a fitted cropped mesh top, exposed pale shoulders and collarbone with delicate cybernetic port seams, post-human scavenger.

young woman, short practical platinum-white hair with cyan tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 斜肩拼凑义体裙**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Asymmetrical salvage-cloth wrap dress held by a cybernetic limb, one bare shoulder exposed with glowing port seams, eerie calm post-human look.

young woman, short practical platinum-white hair with cyan tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 镂空后人类束身**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Sheer wired mesh bodysuit with cut-out shoulders, chrome dermal seams along bare collarbone, salvaged half-machine orphan, uncanny stillness.

young woman, short practical platinum-white hair with cyan tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvaged half-machine orphan look: patchwork augmented implants, scavenged void-suit, eerie calm, post-human scavenger.

older man, closely cropped stark-white buzzcut, weathered white beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvaged half-machine orphan look: patchwork augmented implants, scavenged void-suit, eerie calm, post-human scavenger.

person of ambiguous gender, mid-age, muted dusty-peach and lilac hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvaged half-machine orphan look: patchwork augmented implants, scavenged void-suit, eerie calm, post-human scavenger.

young man, clean-cut crimson-red hair with a bright gold streak, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `relic_kid`** — 遗迹猎人之后

外貌关键词：轻量探险装、文物挎包、好奇自信、淘宝客

**accent**

```
Frontier relic-hunter look: light explorer gear, satchel of artifacts, curious confident expression, treasure-seeker vibe.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier relic-hunter look: light explorer gear, satchel of artifacts, curious confident expression, treasure-seeker vibe.

young woman, short practical bright honey-gold hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 探险露脐上衣**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier relic-hunter look: fitted sleeveless explorer crop top with open neckline, leather artifact satchel strap across bare sun-kissed shoulders and collarbone, treasure-seeker vibe.

young woman, short practical bright honey-gold hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 波西米亚露肩**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Bohemian off-shoulder explorer blouse with knotted ties, one bare shoulder and sun-kissed collarbone, artifact satchel strap, treasure-seeker aesthetic.

young woman, short practical bright honey-gold hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 垂坠寻宝长罩衫**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Draped open relic-hunter tunic over a tied bandeau, both shoulders bare, antique medallion resting on collarbone, frontier treasure-seeker look.

young woman, short practical bright honey-gold hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier relic-hunter look: light explorer gear, satchel of artifacts, curious confident expression, treasure-seeker vibe.

older man, swept-back amber-gold hair, weathered golden-brown beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier relic-hunter look: light explorer gear, satchel of artifacts, curious confident expression, treasure-seeker vibe.

person of ambiguous gender, mid-age, pale mint-silver hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier relic-hunter look: light explorer gear, satchel of artifacts, curious confident expression, treasure-seeker vibe.

young man, clean-cut warm peach-blonde hair, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `defector`** — 叛逃者

外貌关键词：褪色作战服、扯掉的部队臂章、警惕硬朗、前军人

**accent**

```
Disgraced defector soldier look: faded combat fatigues, removed unit patches, wary hardened expression, ex-military.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Disgraced defector soldier look: faded combat fatigues, removed unit patches, wary hardened expression, ex-military.

young woman, short practical dusty-peach hair with natural dark roots, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 橄榄绿露脐背心+狗牌**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Disgraced defector soldier look: fitted olive combat crop tank top with dog tags resting on bare collarbone, open lightweight harness, bare toned shoulders, ex-military vibe.

young woman, short practical dusty-peach hair with natural dark roots, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 扯开作战服**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Half-unbuttoned combat jacket slipped off one shoulder over a low-cut olive tank, dog tags on bare collarbone, wary ex-military look.

young woman, short practical dusty-peach hair with natural dark roots, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 绷带露肩便装**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Field-wrap bandage top with one shoulder bared and a faded unit patch, bare collarbone, hardened defector soldier aesthetic.

young woman, short practical dusty-peach hair with natural dark roots, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Disgraced defector soldier look: faded combat fatigues, removed unit patches, wary hardened expression, ex-military.

older man, sandy golden-blonde hair, weathered ash-gold beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Disgraced defector soldier look: faded combat fatigues, removed unit patches, wary hardened expression, ex-military.

person of ambiguous gender, mid-age, muted steel-blue hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Disgraced defector soldier look: faded combat fatigues, removed unit patches, wary hardened expression, ex-military.

young man, clean-cut sunlit golden-blonde hair, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `corp_heir`** — 财团继承人

外貌关键词：定制贵价衣着、低调财富符号、从容、精英贸易感

**accent**

```
Corporate heir look: tailored expensive outfit, subtle wealth signals, composed smug expression, elite trader aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Corporate heir look: tailored expensive outfit, subtle wealth signals, composed smug expression, elite trader aesthetic.

young woman, short practical soft pastel-peach hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 露肩真丝礼上衣**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Corporate heir look: glamorous off-shoulder high-fashion silk top with a sleek plunging neckline, bare shoulders and collarbone adorned with a minimalist gold choker, elite luxury aesthetic.

young woman, short practical soft pastel-peach hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 无袖高定西装套装**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Bespoke sleeveless tuxedo suit with a deep plunging satin lapel, completely bare shoulders and sleek arms, sharp prominent collarbone, minimalist platinum-and-gold lapel pin, high-society executive couture.

young woman, short practical soft pastel-peach hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 不对称露肩缎面礼裙**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Opulent asymmetrical off-shoulder silk evening gown with geometric metallic embroidery, bare decolletage and single bare shoulder, minimalist platinum collar necklace, gala aristocratic aesthetic.

young woman, short practical soft pastel-peach hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 4 · 挂脖真丝礼服**（存为 `reveal_4.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Daring minimalist halter-neck liquid-silk evening dress with delicate chain straps, open sweetheart silhouette, completely exposed shoulders and radiant skin, languid private-luxe aesthetic.

young woman, short practical soft pastel-peach hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 5 · 深V心形领束身衣**（存为 `reveal_5.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Daring deep sweetheart halter corset with sheer lace trim and delicate strap details, completely bare smooth shoulders and prominent collarbone, avant-garde couture.

young woman, short practical soft pastel-peach hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Corporate heir look: tailored expensive outfit, subtle wealth signals, composed smug expression, elite trader aesthetic.

older man, swept-back platinum-blonde hair, neatly trimmed golden-grey beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Corporate heir look: tailored expensive outfit, subtle wealth signals, composed smug expression, elite trader aesthetic.

person of ambiguous gender, mid-age, sleek silver-violet hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Corporate heir look: tailored expensive outfit, subtle wealth signals, composed smug expression, elite trader aesthetic.

young man, clean-cut champagne-blonde hair with a subtle peach-pink streak, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `station_rat`** — 空间站鼠辈

外貌关键词：油污工装连体服、工具腰带、机灵、船坞技师

**accent**

```
Station tinker look: grease-stained work jumpsuit, tool belt, clever scrappy expression, shipyard mechanic vibe.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Station tinker look: grease-stained work jumpsuit, tool belt, clever scrappy expression, shipyard mechanic vibe.

young woman, short practical coral-peach hair, confident playful smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 油污工字背心**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Station tinker look: fitted white racerback crop tank top with a smudge of engine grease, work overalls unbuttoned and pulled down off bare shoulders, light tool strap on collarbone, shipyard mechanic vibe.

young woman, short practical coral-peach hair, confident playful smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 霓虹机库背心**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Neon-trimmed racerback tank with overalls slung off both shoulders, grease smudge on bare collarbone, tool strap, scrappy shipyard mechanic look.

young woman, short practical coral-peach hair, confident playful smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 敞怀连体工装**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Open canvas work shirt over a tied bandeau, one bare greasy shoulder, dangling wrench loop at collarbone, clever station-tinker aesthetic.

young woman, short practical coral-peach hair, confident playful smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Station tinker look: grease-stained work jumpsuit, tool belt, clever scrappy expression, shipyard mechanic vibe.

older man, weathered copper-red hair, salt-and-pepper ginger beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Station tinker look: grease-stained work jumpsuit, tool belt, clever scrappy expression, shipyard mechanic vibe.

person of ambiguous gender, mid-age, pale golden-blonde hair with teal tips, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Station tinker look: grease-stained work jumpsuit, tool belt, clever scrappy expression, shipyard mechanic vibe.

young man, clean-cut ash-silver hair with a vibrant peach streak, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `signal_orphan`** — 信号弃儿

外貌关键词：头戴通讯耳麦、脸上映着暗屏光、专注内向、监听站

**accent**

```
Signal analyst look: headset and comms gear, dim monitor glow on face, focused introverted expression, listening-post aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Signal analyst look: headset and comms gear, dim monitor glow on face, focused introverted expression, listening-post aesthetic.

young woman, short practical rose-gold peach hair, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 露肩黑科技针织**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Signal analyst look: sleek off-shoulder black tech-knit top with bare shoulders and collarbone visible, lightweight comms headset resting around neck, dim monitor glow on skin, listening-post aesthetic.

young woman, short practical rose-gold peach hair, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 斜肩监听站便装**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

One-shoulder slate tech-knit slip with a thin glowing data-line trim, bare collarbone, comms earpiece, dim monitor glow, listening-post aesthetic.

young woman, short practical rose-gold peach hair, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 极简发光圈裙**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Minimalist black halter tech-top with a soft luminous ring at the neck, completely bare shoulders, faint screen-glow on skin, focused signal-analyst look.

young woman, short practical rose-gold peach hair, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Signal analyst look: headset and comms gear, dim monitor glow on face, focused introverted expression, listening-post aesthetic.

older man, muted lavender-silver hair, weathered silver beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Signal analyst look: headset and comms gear, dim monitor glow on face, focused introverted expression, listening-post aesthetic.

person of ambiguous gender, mid-age, sleek champagne-blonde hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Signal analyst look: headset and comms gear, dim monitor glow on face, focused introverted expression, listening-post aesthetic.

young man, clean-cut dark hair with bright mint-cyan front streaks, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `frontier`** — 边陲平民（9 星域通用）

外貌关键词：朴素耐用殖民便装、风吹日晒、务实、边境殖民

**accent**

```
Frontier settler look: simple rugged colony clothes, sun-weathered skin, pragmatic expression, border colonist aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier settler look: simple rugged colony clothes, sun-weathered skin, pragmatic expression, border colonist aesthetic.

young woman, short practical sunlit honey-gold hair, confident warm smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 亚麻露脐系带**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier settler look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic.

young woman, short practical sunlit honey-gold hair, confident warm smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 边陲露肩罩裙**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Off-shoulder border sundress with a knotted shoulder tie, sun-weathered bare collarbone, pragmatic frontier settler look.

young woman, short practical sunlit honey-gold hair, confident warm smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 日晒工装露肩**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Open woven overshirt over a tied bandeau, both shoulders bared to the sun, simple colony bead necklace on collarbone, border colonist aesthetic.

young woman, short practical sunlit honey-gold hair, confident warm smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier settler look: simple rugged colony clothes, sun-weathered skin, pragmatic expression, border colonist aesthetic.

older man, strawberry-gold hair, weathered ginger-grey beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier settler look: simple rugged colony clothes, sun-weathered skin, pragmatic expression, border colonist aesthetic.

person of ambiguous gender, mid-age, soft peach-blonde hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier settler look: simple rugged colony clothes, sun-weathered skin, pragmatic expression, border colonist aesthetic.

young man, clean-cut sandy ash-blonde hair, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `merc_veteran`** — 通用老兵

外貌关键词：战损装备、可见伤疤、自信致命姿态、老练赏金客

**accent**

```
Veteran mercenary look: combat-worn gear, visible scars, confident lethal posture, hardened gun-for-hire.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Veteran mercenary look: combat-worn gear, visible scars, confident lethal posture, hardened gun-for-hire.

young woman, short practical dusty-peach pink hair, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 黑色无袖战术背心**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Veteran mercenary look: sleek black sleeveless tactical crop top with light chest rig straps, bare toned shoulders and collarbone with a faint healed scar, confident lethal posture.

young woman, short practical dusty-peach pink hair, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 敞怀作战夹克**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Open tactical jacket off both shoulders over a low-cut mesh undershirt, chest rig straps across bare collarbone, faint healed scar, lethal mercenary look.

young woman, short practical dusty-peach pink hair, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 战损露肩绑带**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Strapped battle-bondage top with one shoulder bared and webbing across collarbone, healed scar visible, hardened gun-for-hire aesthetic.

young woman, short practical dusty-peach pink hair, confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Veteran mercenary look: combat-worn gear, visible scars, confident lethal posture, hardened gun-for-hire.

older man, closely cropped silver-blonde hair, weathered golden-grey beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Veteran mercenary look: combat-worn gear, visible scars, confident lethal posture, hardened gun-for-hire.

person of ambiguous gender, mid-age, burgundy-red hair with subtle gold tips, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Veteran mercenary look: combat-worn gear, visible scars, confident lethal posture, hardened gun-for-hire.

young man, clean-cut platinum-blonde hair, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `augmented`** — 通用重改造

外貌关键词：显眼义体臂/眼/肢、铬与皮、跨人类审美

**accent**

```
Heavy cyber-augmented look: prominent cybernetic arm or eye or limbs, sleek chrome and skin, transhuman aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Heavy cyber-augmented look: prominent cybernetic arm or eye or limbs, sleek chrome and skin, transhuman aesthetic.

young woman, short practical pastel-peach hair with silver streaks, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 极简无袖义体服**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Heavy cyber-augmented look: minimalist sleeveless cyber-bodysuit with an open cutout neckline, bare shoulders and collarbone showing sleek chrome dermal plating seams, transhuman aesthetic.

young woman, short practical pastel-peach hair with silver streaks, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 镂空铬皮束身衣**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Hollow-cut chrome-mesh corset bodysuit with bare shoulders exposing dermal plating seams, glowing conduit lines on collarbone, transhuman aesthetic.

young woman, short practical pastel-peach hair with silver streaks, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 发光线路露肩装**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Luminous-circuit crop-top with open shoulders and chrome seam-glow along bare collarbone, prominent cybernetic limb, sleek transhuman look.

young woman, short practical pastel-peach hair with silver streaks, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Heavy cyber-augmented look: prominent cybernetic arm or eye or limbs, sleek chrome and skin, transhuman aesthetic.

older man, closely cropped metallic-silver hair, weathered grey beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Heavy cyber-augmented look: prominent cybernetic arm or eye or limbs, sleek chrome and skin, transhuman aesthetic.

person of ambiguous gender, mid-age, pale cyan-silver hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Heavy cyber-augmented look: prominent cybernetic arm or eye or limbs, sleek chrome and skin, transhuman aesthetic.

young man, clean-cut bright amber-gold hair, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `pilot`** — 通用飞行员

外貌关键词：飞行服、腋下夹头盔、航空感、痞帅可靠

**accent**

```
Starship pilot look: flight suit, helmet tucked under arm, aviator aesthetic, cocky competent expression.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Starship pilot look: flight suit, helmet tucked under arm, aviator aesthetic, cocky competent expression.

young woman, short practical warm peach-blonde hair, cocky confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 飞行服滑落露肩**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Starship pilot look: flight suit unzipped low and slipped off shoulders over a fitted low-cut cropped flight tank top, bare shoulders and collarbone visible, aviator aesthetic.

young woman, short practical warm peach-blonde hair, cocky confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 运动工字背心**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Sporty racerback flight tank with sleeves shoved down, bare shoulders and collarbone, helmet tucked under arm, cocky aviator look.

young woman, short practical warm peach-blonde hair, cocky confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 敞怀飞行皮夹克**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Open leather aviator jacket off one shoulder over a low-cut silk tee, bare collarbone, confident pilot aesthetic.

young woman, short practical warm peach-blonde hair, cocky confident smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Starship pilot look: flight suit, helmet tucked under arm, aviator aesthetic, cocky competent expression.

older man, swept-back ash-golden hair, weathered beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Starship pilot look: flight suit, helmet tucked under arm, aviator aesthetic, cocky competent expression.

person of ambiguous gender, mid-age, muted lavender-grey hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Starship pilot look: flight suit, helmet tucked under arm, aviator aesthetic, cocky competent expression.

young man, clean-cut golden-blonde hair with a coral-red streak, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `actress`** — 女演员 / 星际艺人

外貌关键词：舞台灵感科幻戏服、优雅垂坠、张扬气场、明星感

**accent**

```
Glamorous interstellar performer look: stage-costume inspired sci-fi attire with elegant draping, a signature accent color, confident alluring stage presence, poised expressive face, celebrity aura.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Glamorous interstellar performer look: stage-costume inspired sci-fi attire with elegant draping, a signature accent color, confident alluring stage presence, poised expressive face, celebrity aura.

young woman, short practical rose-gold hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 亮片露肩舞台装**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Interstellar performer look: sleek off-shoulder sequined stage top with a deep neckline, bare shoulders and collarbone, dramatic stage presence, celebrity aesthetic.

young woman, short practical rose-gold hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 铬丝前卫礼裙**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Avant-garde chrome-mesh gown with a single bare shoulder and a metallic drape, bare collarbone, dramatic stage presence, celebrity aesthetic.

young woman, short practical rose-gold hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 流动金属披肩**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Flowing metallic capelet over a strapless liquid-silk gown, bare shoulders and collarbone, poised expressive face, interstellar performer look.

young woman, short practical rose-gold hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Glamorous interstellar performer look: stage-costume inspired sci-fi attire with elegant draping, a signature accent color, confident alluring stage presence, poised expressive face, celebrity aura.

older man, swept-back silver-blonde hair, trimmed beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Glamorous interstellar performer look: stage-costume inspired sci-fi attire with elegant draping, a signature accent color, confident alluring stage presence, poised expressive face, celebrity aura.

person of ambiguous gender, mid-age, sleek champagne-blonde hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Glamorous interstellar performer look: stage-costume inspired sci-fi attire with elegant draping, a signature accent color, confident alluring stage presence, poised expressive face, celebrity aura.

young man, clean-cut golden-blonde hair with a coral-red streak, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `noble`** — 贵族 / 世家子弟

外貌关键词：华贵定制科幻礼服、精细刺绣、家徽胸针、从容贵气

**accent**

```
Hereditary aristocrat look: opulent tailored sci-fi noble attire with fine embroidery and a house-crest brooch, refined composed demeanor, luxury fabric with subtle metallic thread, elevated posture, old-money elegance.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Hereditary aristocrat look: opulent tailored sci-fi noble attire with fine embroidery and a house-crest brooch, refined composed demeanor, luxury fabric with subtle metallic thread, elevated posture, old-money elegance.

young woman, short practical platinum-silver hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 露肩真丝礼裙**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Noble house heir look: elegant off-shoulder silk gown with a plunging neckline, bare shoulders adorned with a family jeweled collar, aristocratic aesthetic.

young woman, short practical platinum-silver hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 高领宝石束身衣**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

High-collared jeweled corset gown with a deep open front, bare collarbone and a house-crest brooch, old-money elegance.

young woman, short practical platinum-silver hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 世家披挂式长裙**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Draped hereditary stole worn off one shoulder over a silk slip, bare collarbone with a family jeweled collar, refined aristocratic aesthetic.

young woman, short practical platinum-silver hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Hereditary aristocrat look: opulent tailored sci-fi noble attire with fine embroidery and a house-crest brooch, refined composed demeanor, luxury fabric with subtle metallic thread, elevated posture, old-money elegance.

older man, swept-back ash-golden hair, weathered beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Hereditary aristocrat look: opulent tailored sci-fi noble attire with fine embroidery and a house-crest brooch, refined composed demeanor, luxury fabric with subtle metallic thread, elevated posture, old-money elegance.

person of ambiguous gender, mid-age, sleek silver-violet hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Hereditary aristocrat look: opulent tailored sci-fi noble attire with fine embroidery and a house-crest brooch, refined composed demeanor, luxury fabric with subtle metallic thread, elevated posture, old-money elegance.

young man, clean-cut bright honey-gold hair, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `smelter_apprentice`** — 冶炼学徒

外貌关键词：在矿冶殖民星的炉火边长大，闻得懂合金味。

**accent**

```
Smelter-apprentice look: heat-scorched refinery colony workwear, soot-smudged sleeves rolled to the forearms, faint orange furnace glow reflecting on the face, pragmatic young apprentice vibe, molten-metal aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Smelter-apprentice look: heat-scorched refinery colony workwear, soot-smudged sleeves rolled to the forearms, faint orange furnace glow reflecting on the face, pragmatic young apprentice vibe, molten-metal aesthetic.

young woman, short practical ash-copper hair with ember-orange tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 冶炉背心+工装带**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Smelter-apprentice look: cropped heat-resistant tank top with rolled work straps, bare shoulders and collarbone dusted with fine soot, a faint furnace glow on skin, molten-metal aesthetic.

young woman, short practical ash-copper hair with ember-orange tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 露肩石棉围裙**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Open asbestos-style apron over a tied bandeau, one bare soot-streaked shoulder, ember glow on collarbone, apprentice smelter vibe.

young woman, short practical ash-copper hair with ember-orange tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 斜肩耐热罩衫**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

One-shoulder heat-resistant overshirt off the other shoulder over a fitted bandeau, bare collarbone with a faint ember shimmer, pragmatic apprentice look.

young woman, short practical ash-copper hair with ember-orange tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Smelter-apprentice look: heat-scorched refinery colony workwear, soot-smudged sleeves rolled to the forearms, faint orange furnace glow reflecting on the face, pragmatic young apprentice vibe, molten-metal aesthetic.

older man, salt-and-pepper auburn hair, weathered rust-brown beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Smelter-apprentice look: heat-scorched refinery colony workwear, soot-smudged sleeves rolled to the forearms, faint orange furnace glow reflecting on the face, pragmatic young apprentice vibe, molten-metal aesthetic.

person of ambiguous gender, mid-age, muted bronze-teal hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Smelter-apprentice look: heat-scorched refinery colony workwear, soot-smudged sleeves rolled to the forearms, faint orange furnace glow reflecting on the face, pragmatic young apprentice vibe, molten-metal aesthetic.

young man, clean-cut warm ochre hair with ember-red tips, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `salvage_waif`** — 拾荒遗孤

外貌关键词：在残骸带长大的拆解童子，什么破烂都能拼回原型。

**accent**

```
Salvage-waif look: patched oversized salvage jacket made of reclaimed ship panels, mismatched gloves, a toolkit on a strap, scrappy underfed kid vibe, debris-belt scavenger aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvage-waif look: patched oversized salvage jacket made of reclaimed ship panels, mismatched gloves, a toolkit on a strap, scrappy underfed kid vibe, debris-belt scavenger aesthetic.

young woman, short practical muddy-auburn hair, confident playful smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 拼凑露肩夹克**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvage-waif look: oversized reclaimed-panel crop jacket slipping off one shoulder over a fitted bandeau, bare collarbone with a grease smudge, scrappy scavenger aesthetic.

young woman, short practical muddy-auburn hair, confident playful smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 拆解工字背心**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Fitted reclaimed-mesh tank top with tool straps across bare shoulders and collarbone, a loose bolt necklace, debris-belt scavenger look.

young woman, short practical muddy-auburn hair, confident playful smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 斜肩破布罩衫**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

One-shoulder frayed salvage cloth over a tied bandeau, both shoulders bare, a salvaged goggle strap at the neck, pragmatic waif aesthetic.

young woman, short practical muddy-auburn hair, confident playful smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvage-waif look: patched oversized salvage jacket made of reclaimed ship panels, mismatched gloves, a toolkit on a strap, scrappy underfed kid vibe, debris-belt scavenger aesthetic.

older man, weathered ash-brown hair, scrappy stubble beard, facial scar, wary gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvage-waif look: patched oversized salvage jacket made of reclaimed ship panels, mismatched gloves, a toolkit on a strap, scrappy underfed kid vibe, debris-belt scavenger aesthetic.

person of ambiguous gender, mid-age, pale rust-grey hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvage-waif look: patched oversized salvage jacket made of reclaimed ship panels, mismatched gloves, a toolkit on a strap, scrappy underfed kid vibe, debris-belt scavenger aesthetic.

young man, clean-cut soot-dark hair with copper streaks, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `gas_drifter`** — 气井游商

外貌关键词：跟着气态巨行星的勘探船跑单帮，识得湍流里的门道。

**accent**

```
Gas-well drifter look: wind-worn trader's layered tunic, brass pressure-gauge trinkets, a faint storm-light sheen on the fabric, agile roaming merchant vibe, gas-giant frontier aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Gas-well drifter look: wind-worn trader's layered tunic, brass pressure-gauge trinkets, a faint storm-light sheen on the fabric, agile roaming merchant vibe, gas-giant frontier aesthetic.

young woman, short practical tidewave teal hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 斜肩风蚀长罩**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Gas-well drifter look: off-shoulder layered tunic slipping off one shoulder, bare collarbone with a faint storm-glow sheen, wind-tousled look, roaming merchant aesthetic.

young woman, short practical tidewave teal hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 露脐探险上衣**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Fitted drift-trader crop top with an open neckline, a brass gauge pendant resting on bare collarbone, wind-blown hair, frontier merchant vibe.

young woman, short practical tidewave teal hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 系带露肩披裹**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Knotted shoulder-wrap tunic baring one shoulder and sun-kissed collarbone, a brass trinket strand, pragmatic gas-giant drifter look.

young woman, short practical tidewave teal hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Gas-well drifter look: wind-worn trader's layered tunic, brass pressure-gauge trinkets, a faint storm-light sheen on the fabric, agile roaming merchant vibe, gas-giant frontier aesthetic.

older man, wind-blown sandy hair, weathered tan beard, facial scar, shrewd gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Gas-well drifter look: wind-worn trader's layered tunic, brass pressure-gauge trinkets, a faint storm-light sheen on the fabric, agile roaming merchant vibe, gas-giant frontier aesthetic.

person of ambiguous gender, mid-age, muted storm-grey hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Gas-well drifter look: wind-worn trader's layered tunic, brass pressure-gauge trinkets, a faint storm-light sheen on the fabric, agile roaming merchant vibe, gas-giant frontier aesthetic.

young man, clean-cut sea-glass hair with teal streaks, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `abyss_acolyte`** — 深空研习生

外貌关键词：研究院附属学校的优等生，泡在先驱造物数据库里。

**accent**

```
Abyssal-acolyte look: pristine academy uniform with a thin research-covenant trim, a holographic textbook tablet, a faint violet data-glow on the glasses, brilliant focused student vibe, deep-space institute aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Abyssal-acolyte look: pristine academy uniform with a thin research-covenant trim, a holographic textbook tablet, a faint violet data-glow on the glasses, brilliant focused student vibe, deep-space institute aesthetic.

young woman, short practical pale-lilac hair with violet tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 学院露肩上衣**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Abyssal-acolyte look: off-shoulder academy crop top with a deep laced neckline, bare shoulders and collarbone, a faint violet data-glow, scholarly aesthetic.

young woman, short practical pale-lilac hair with violet tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 斜肩研究罩衫**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

One-shoulder research overshirt off the other shoulder over a fitted bandeau, bare collarbone with a faint data-glow, academy acolyte vibe.

young woman, short practical pale-lilac hair with violet tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 露脐制服**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Fitted academy crop uniform with an open front placket, bare toned shoulders and collarbone, a holographic tablet glint, deep-space institute look.

young woman, short practical pale-lilac hair with violet tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Abyssal-acolyte look: pristine academy uniform with a thin research-covenant trim, a holographic textbook tablet, a faint violet data-glow on the glasses, brilliant focused student vibe, deep-space institute aesthetic.

older man, swept-back ash-violet hair, a neatly trimmed beard, calm scholarly gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Abyssal-acolyte look: pristine academy uniform with a thin research-covenant trim, a holographic textbook tablet, a faint violet data-glow on the glasses, brilliant focused student vibe, deep-space institute aesthetic.

person of ambiguous gender, mid-age, sleek silver-violet hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Abyssal-acolyte look: pristine academy uniform with a thin research-covenant trim, a holographic textbook tablet, a faint violet data-glow on the glasses, brilliant focused student vibe, deep-space institute aesthetic.

young man, clean-cut bright lilac hair with cyan streaks, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `bounty_foundling`** — 赏金猎徒

外貌关键词：在悬赏船上长大的孩子，炮塔比摇篮还熟。

**accent**

```
Bounty-foundling look: lightweight combat-scarred jacket with bounty pins, a slung rifle strap, confident lethal kid vibe, mercenary-child aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Bounty-foundling look: lightweight combat-scarred jacket with bounty pins, a slung rifle strap, confident lethal kid vibe, mercenary-child aesthetic.

young woman, short practical dusty-rose hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 无袖战术背心**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Bounty-foundling look: cropped combat tank top with light chest-rig straps, bare shoulders and collarbone with a faint healed scar, confident lethal posture.

young woman, short practical dusty-rose hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 敞怀作战夹克**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Open combat jacket off both shoulders over a low-cut mesh undershirt, chest-rig straps across bare collarbone, a faint scar, lethal bounty look.

young woman, short practical dusty-rose hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 战损露肩绑带**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Strapped battle-bondage top with one shoulder bared and webbing across collarbone, a healed scar visible, hardened gun-for-hire aesthetic.

young woman, short practical dusty-rose hair, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Bounty-foundling look: lightweight combat-scarred jacket with bounty pins, a slung rifle strap, confident lethal kid vibe, mercenary-child aesthetic.

older man, closely cropped silver-blonde hair, weathered golden-grey beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Bounty-foundling look: lightweight combat-scarred jacket with bounty pins, a slung rifle strap, confident lethal kid vibe, mercenary-child aesthetic.

person of ambiguous gender, mid-age, burgundy hair with gold tips, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Bounty-foundling look: lightweight combat-scarred jacket with bounty pins, a slung rifle strap, confident lethal kid vibe, mercenary-child aesthetic.

young man, clean-cut platinum-blonde hair with crimson streaks, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `settler_scion`** — 拓殖农裔

外貌关键词：边境拓殖星的第二代，从小跟着开矿拓荒。

**accent**

```
Settler-scion look: simple rugged colony clothes, sun-weathered skin, a farming-and-mining tool on the shoulder, pragmatic second-generation frontiersman vibe, border colonist aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Settler-scion look: simple rugged colony clothes, sun-weathered skin, a farming-and-mining tool on the shoulder, pragmatic second-generation frontiersman vibe, border colonist aesthetic.

young woman, short practical sunlit wheat-blonde hair, confident warm smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 亚麻露脐系带**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Settler-scion look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic.

young woman, short practical sunlit wheat-blonde hair, confident warm smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 边陲露肩罩裙**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Off-shoulder frontier sundress with a knotted shoulder tie, sun-weathered bare collarbone, pragmatic settler look.

young woman, short practical sunlit wheat-blonde hair, confident warm smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 日晒工装露肩**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Open woven overshirt over a tied bandeau, both shoulders bared to the sun, a simple colony bead necklace on collarbone, border colonist aesthetic.

young woman, short practical sunlit wheat-blonde hair, confident warm smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Settler-scion look: simple rugged colony clothes, sun-weathered skin, a farming-and-mining tool on the shoulder, pragmatic second-generation frontiersman vibe, border colonist aesthetic.

older man, strawberry-gold hair, weathered ginger-grey beard, facial scar, stern gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Settler-scion look: simple rugged colony clothes, sun-weathered skin, a farming-and-mining tool on the shoulder, pragmatic second-generation frontiersman vibe, border colonist aesthetic.

person of ambiguous gender, mid-age, soft sage-blonde hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Settler-scion look: simple rugged colony clothes, sun-weathered skin, a farming-and-mining tool on the shoulder, pragmatic second-generation frontiersman vibe, border colonist aesthetic.

young man, clean-cut sandy ash-blonde hair with grass-green tips, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**原型 `turret_child`** — 激光炮手之子

外貌关键词：舰队炮战学校的子弟，激光校准刻进肌肉记忆。

**accent**

```
Turret-child look: crisp cadet fleet uniform with gunnery insignia, disciplined posture, calm focused marksman vibe, naval gunnery-school aesthetic.
```


**V1 · 年轻女性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Turret-child look: crisp cadet fleet uniform with gunnery insignia, disciplined posture, calm focused marksman vibe, naval gunnery-school aesthetic.

young woman, short practical champagne-blonde hair with ruby tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V1 清凉版（露肩 / 露腰 · 随机服装库）**


**服装 1 · 无袖炮手军官上衣**（存为 `reveal.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Turret-child look: tailored sleeveless gunnery cadet top with a deep open collar, bare shoulders and collarbone visible, a metallic gunnery insignia on the collar strap, sleek naval aesthetic.

young woman, short practical champagne-blonde hair with ruby tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 2 · 露肩海军白领礼裙**（存为 `reveal_2.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Off-shoulder dress-white gunnery gown with a single bare shoulder and a thin gold aiguillette, bare collarbone, crisp fleet gunnery-ball aesthetic.

young woman, short practical champagne-blonde hair with ruby tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**服装 3 · 敞怀炮手夹克**（存为 `reveal_3.webp`）
```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Open-front gunnery jacket slipped off both shoulders over a low-cut silk camisole, bare collarbone with a rank pin, disciplined-yet-revealing naval cadet look.

young woman, short practical champagne-blonde hair with ruby tips, confident alluring smirk

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V2 · 年长男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Turret-child look: crisp cadet fleet uniform with gunnery insignia, disciplined posture, calm focused marksman vibe, naval gunnery-school aesthetic.

older man, swept-back iron-grey hair, weathered steel beard, facial scar, stern marksman gaze

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V3 · 中性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Turret-child look: crisp cadet fleet uniform with gunnery insignia, disciplined posture, calm focused marksman vibe, naval gunnery-school aesthetic.

person of ambiguous gender, mid-age, sleek rose-steel hair, calm neutral expression, understated

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**V4 · 年轻男性**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Turret-child look: crisp cadet fleet uniform with gunnery insignia, disciplined posture, calm focused marksman vibe, naval gunnery-school aesthetic.

young man, clean-cut icy silver-blue hair with ruby-red streaks, eager alert expression

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


### 义眼 / 义肢 / 双改造 组合（叠加到各原型 V1 清凉版，14 × 3 = 42）

**`belt_nomad` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Dusty asteroid-belt nomad look: unzipped cropped mining vest worn loosely over a fitted low-cut tank top, bare shoulders and collarbone visible with light smudge of dust, light utility straps, frontier scavenger aesthetic.

young woman, short practical soft pastel-peach hair, sun-kissed skin, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`belt_nomad` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Dusty asteroid-belt nomad look: unzipped cropped mining vest worn loosely over a fitted low-cut tank top, bare shoulders and collarbone visible with light smudge of dust, light utility straps, frontier scavenger aesthetic.

young woman, short practical soft pastel-peach hair, sun-kissed skin, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`belt_nomad` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Dusty asteroid-belt nomad look: unzipped cropped mining vest worn loosely over a fitted low-cut tank top, bare shoulders and collarbone visible with light smudge of dust, light utility straps, frontier scavenger aesthetic.

young woman, short practical soft pastel-peach hair, sun-kissed skin, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`fleet_brat` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Military-academy officer look: tailored sleeveless fleet officer top with a deep open collar, bare shoulders and collarbone visible, metallic rank insignia on collar strap, sleek naval aesthetic.

young woman, short practical champagne-blonde hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`fleet_brat` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Military-academy officer look: tailored sleeveless fleet officer top with a deep open collar, bare shoulders and collarbone visible, metallic rank insignia on collar strap, sleek naval aesthetic.

young woman, short practical champagne-blonde hair, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`fleet_brat` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Military-academy officer look: tailored sleeveless fleet officer top with a deep open collar, bare shoulders and collarbone visible, metallic rank insignia on collar strap, sleek naval aesthetic.

young woman, short practical champagne-blonde hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`orphan_void` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvaged half-machine orphan look: lightweight sleeveless void-suit harness over a fitted cropped mesh top, exposed pale shoulders and collarbone with delicate cybernetic port seams, post-human scavenger.

young woman, short practical platinum-white hair with cyan tips, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`orphan_void` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvaged half-machine orphan look: lightweight sleeveless void-suit harness over a fitted cropped mesh top, exposed pale shoulders and collarbone with delicate cybernetic port seams, post-human scavenger.

young woman, short practical platinum-white hair with cyan tips, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`orphan_void` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvaged half-machine orphan look: lightweight sleeveless void-suit harness over a fitted cropped mesh top, exposed pale shoulders and collarbone with delicate cybernetic port seams, post-human scavenger.

young woman, short practical platinum-white hair with cyan tips, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`relic_kid` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier relic-hunter look: fitted sleeveless explorer crop top with open neckline, leather artifact satchel strap across bare sun-kissed shoulders and collarbone, treasure-seeker vibe.

young woman, short practical bright honey-gold hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`relic_kid` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier relic-hunter look: fitted sleeveless explorer crop top with open neckline, leather artifact satchel strap across bare sun-kissed shoulders and collarbone, treasure-seeker vibe.

young woman, short practical bright honey-gold hair, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`relic_kid` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier relic-hunter look: fitted sleeveless explorer crop top with open neckline, leather artifact satchel strap across bare sun-kissed shoulders and collarbone, treasure-seeker vibe.

young woman, short practical bright honey-gold hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`defector` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Disgraced defector soldier look: fitted olive combat crop tank top with dog tags resting on bare collarbone, open lightweight harness, bare toned shoulders, ex-military vibe.

young woman, short practical dusty-peach hair with natural dark roots, confident smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`defector` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Disgraced defector soldier look: fitted olive combat crop tank top with dog tags resting on bare collarbone, open lightweight harness, bare toned shoulders, ex-military vibe.

young woman, short practical dusty-peach hair with natural dark roots, confident smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`defector` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Disgraced defector soldier look: fitted olive combat crop tank top with dog tags resting on bare collarbone, open lightweight harness, bare toned shoulders, ex-military vibe.

young woman, short practical dusty-peach hair with natural dark roots, confident smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`corp_heir` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Corporate heir look: glamorous off-shoulder high-fashion silk top with a sleek plunging neckline, bare shoulders and collarbone adorned with a minimalist gold choker, elite luxury aesthetic.

young woman, short practical soft pastel-peach hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`corp_heir` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Corporate heir look: glamorous off-shoulder high-fashion silk top with a sleek plunging neckline, bare shoulders and collarbone adorned with a minimalist gold choker, elite luxury aesthetic.

young woman, short practical soft pastel-peach hair, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`corp_heir` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Corporate heir look: glamorous off-shoulder high-fashion silk top with a sleek plunging neckline, bare shoulders and collarbone adorned with a minimalist gold choker, elite luxury aesthetic.

young woman, short practical soft pastel-peach hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`station_rat` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Station tinker look: fitted white racerback crop tank top with a smudge of engine grease, work overalls unbuttoned and pulled down off bare shoulders, light tool strap on collarbone, shipyard mechanic vibe.

young woman, short practical coral-peach hair, confident playful smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`station_rat` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Station tinker look: fitted white racerback crop tank top with a smudge of engine grease, work overalls unbuttoned and pulled down off bare shoulders, light tool strap on collarbone, shipyard mechanic vibe.

young woman, short practical coral-peach hair, confident playful smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`station_rat` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Station tinker look: fitted white racerback crop tank top with a smudge of engine grease, work overalls unbuttoned and pulled down off bare shoulders, light tool strap on collarbone, shipyard mechanic vibe.

young woman, short practical coral-peach hair, confident playful smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`signal_orphan` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Signal analyst look: sleek off-shoulder black tech-knit top with bare shoulders and collarbone visible, lightweight comms headset resting around neck, dim monitor glow on skin, listening-post aesthetic.

young woman, short practical rose-gold peach hair, confident smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`signal_orphan` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Signal analyst look: sleek off-shoulder black tech-knit top with bare shoulders and collarbone visible, lightweight comms headset resting around neck, dim monitor glow on skin, listening-post aesthetic.

young woman, short practical rose-gold peach hair, confident smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`signal_orphan` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Signal analyst look: sleek off-shoulder black tech-knit top with bare shoulders and collarbone visible, lightweight comms headset resting around neck, dim monitor glow on skin, listening-post aesthetic.

young woman, short practical rose-gold peach hair, confident smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`frontier` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier settler look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic.

young woman, short practical sunlit honey-gold hair, confident warm smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`frontier` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier settler look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic.

young woman, short practical sunlit honey-gold hair, confident warm smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`frontier` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Frontier settler look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic.

young woman, short practical sunlit honey-gold hair, confident warm smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`merc_veteran` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Veteran mercenary look: sleek black sleeveless tactical crop top with light chest rig straps, bare toned shoulders and collarbone with a faint healed scar, confident lethal posture.

young woman, short practical dusty-peach pink hair, confident smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`merc_veteran` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Veteran mercenary look: sleek black sleeveless tactical crop top with light chest rig straps, bare toned shoulders and collarbone with a faint healed scar, confident lethal posture.

young woman, short practical dusty-peach pink hair, confident smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`merc_veteran` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Veteran mercenary look: sleek black sleeveless tactical crop top with light chest rig straps, bare toned shoulders and collarbone with a faint healed scar, confident lethal posture.

young woman, short practical dusty-peach pink hair, confident smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`augmented` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Heavy cyber-augmented look: minimalist sleeveless cyber-bodysuit with an open cutout neckline, bare shoulders and collarbone showing sleek chrome dermal plating seams, transhuman aesthetic.

young woman, short practical pastel-peach hair with silver streaks, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`augmented` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Heavy cyber-augmented look: minimalist sleeveless cyber-bodysuit with an open cutout neckline, bare shoulders and collarbone showing sleek chrome dermal plating seams, transhuman aesthetic.

young woman, short practical pastel-peach hair with silver streaks, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`augmented` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Heavy cyber-augmented look: minimalist sleeveless cyber-bodysuit with an open cutout neckline, bare shoulders and collarbone showing sleek chrome dermal plating seams, transhuman aesthetic.

young woman, short practical pastel-peach hair with silver streaks, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`pilot` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Starship pilot look: flight suit unzipped low and slipped off shoulders over a fitted low-cut cropped flight tank top, bare shoulders and collarbone visible, aviator aesthetic.

young woman, short practical warm peach-blonde hair, cocky confident smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`pilot` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Starship pilot look: flight suit unzipped low and slipped off shoulders over a fitted low-cut cropped flight tank top, bare shoulders and collarbone visible, aviator aesthetic.

young woman, short practical warm peach-blonde hair, cocky confident smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`pilot` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Starship pilot look: flight suit unzipped low and slipped off shoulders over a fitted low-cut cropped flight tank top, bare shoulders and collarbone visible, aviator aesthetic.

young woman, short practical warm peach-blonde hair, cocky confident smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`actress` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Interstellar performer look: sleek off-shoulder sequined stage top with a deep neckline, bare shoulders and collarbone, dramatic stage presence, celebrity aesthetic.

young woman, short practical rose-gold hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`actress` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Interstellar performer look: sleek off-shoulder sequined stage top with a deep neckline, bare shoulders and collarbone, dramatic stage presence, celebrity aesthetic.

young woman, short practical rose-gold hair, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`actress` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Interstellar performer look: sleek off-shoulder sequined stage top with a deep neckline, bare shoulders and collarbone, dramatic stage presence, celebrity aesthetic.

young woman, short practical rose-gold hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`noble` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Noble house heir look: elegant off-shoulder silk gown with a plunging neckline, bare shoulders adorned with a family jeweled collar, aristocratic aesthetic.

young woman, short practical platinum-silver hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`noble` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Noble house heir look: elegant off-shoulder silk gown with a plunging neckline, bare shoulders adorned with a family jeweled collar, aristocratic aesthetic.

young woman, short practical platinum-silver hair, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`noble` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Noble house heir look: elegant off-shoulder silk gown with a plunging neckline, bare shoulders adorned with a family jeweled collar, aristocratic aesthetic.

young woman, short practical platinum-silver hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`smelter_apprentice` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Smelter-apprentice look: cropped heat-resistant tank top with rolled work straps, bare shoulders and collarbone dusted with fine soot, a faint furnace glow on skin, molten-metal aesthetic.

young woman, short practical ash-copper hair with ember-orange tips, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`smelter_apprentice` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Smelter-apprentice look: cropped heat-resistant tank top with rolled work straps, bare shoulders and collarbone dusted with fine soot, a faint furnace glow on skin, molten-metal aesthetic.

young woman, short practical ash-copper hair with ember-orange tips, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`smelter_apprentice` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Smelter-apprentice look: cropped heat-resistant tank top with rolled work straps, bare shoulders and collarbone dusted with fine soot, a faint furnace glow on skin, molten-metal aesthetic.

young woman, short practical ash-copper hair with ember-orange tips, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`salvage_waif` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvage-waif look: oversized reclaimed-panel crop jacket slipping off one shoulder over a fitted bandeau, bare collarbone with a grease smudge, scrappy scavenger aesthetic.

young woman, short practical muddy-auburn hair, confident playful smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`salvage_waif` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvage-waif look: oversized reclaimed-panel crop jacket slipping off one shoulder over a fitted bandeau, bare collarbone with a grease smudge, scrappy scavenger aesthetic.

young woman, short practical muddy-auburn hair, confident playful smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`salvage_waif` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Salvage-waif look: oversized reclaimed-panel crop jacket slipping off one shoulder over a fitted bandeau, bare collarbone with a grease smudge, scrappy scavenger aesthetic.

young woman, short practical muddy-auburn hair, confident playful smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`gas_drifter` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Gas-well drifter look: off-shoulder layered tunic slipping off one shoulder, bare collarbone with a faint storm-glow sheen, wind-tousled look, roaming merchant aesthetic.

young woman, short practical tidewave teal hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`gas_drifter` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Gas-well drifter look: off-shoulder layered tunic slipping off one shoulder, bare collarbone with a faint storm-glow sheen, wind-tousled look, roaming merchant aesthetic.

young woman, short practical tidewave teal hair, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`gas_drifter` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Gas-well drifter look: off-shoulder layered tunic slipping off one shoulder, bare collarbone with a faint storm-glow sheen, wind-tousled look, roaming merchant aesthetic.

young woman, short practical tidewave teal hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`abyss_acolyte` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Abyssal-acolyte look: off-shoulder academy crop top with a deep laced neckline, bare shoulders and collarbone, a faint violet data-glow, scholarly aesthetic.

young woman, short practical pale-lilac hair with violet tips, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`abyss_acolyte` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Abyssal-acolyte look: off-shoulder academy crop top with a deep laced neckline, bare shoulders and collarbone, a faint violet data-glow, scholarly aesthetic.

young woman, short practical pale-lilac hair with violet tips, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`abyss_acolyte` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Abyssal-acolyte look: off-shoulder academy crop top with a deep laced neckline, bare shoulders and collarbone, a faint violet data-glow, scholarly aesthetic.

young woman, short practical pale-lilac hair with violet tips, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`bounty_foundling` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Bounty-foundling look: cropped combat tank top with light chest-rig straps, bare shoulders and collarbone with a faint healed scar, confident lethal posture.

young woman, short practical dusty-rose hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`bounty_foundling` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Bounty-foundling look: cropped combat tank top with light chest-rig straps, bare shoulders and collarbone with a faint healed scar, confident lethal posture.

young woman, short practical dusty-rose hair, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`bounty_foundling` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Bounty-foundling look: cropped combat tank top with light chest-rig straps, bare shoulders and collarbone with a faint healed scar, confident lethal posture.

young woman, short practical dusty-rose hair, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`settler_scion` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Settler-scion look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic.

young woman, short practical sunlit wheat-blonde hair, confident warm smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`settler_scion` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Settler-scion look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic.

young woman, short practical sunlit wheat-blonde hair, confident warm smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`settler_scion` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Settler-scion look: light sleeveless linen crop top with an open laced neckline, sun-weathered bare shoulders and collarbone, pragmatic border colonist aesthetic.

young woman, short practical sunlit wheat-blonde hair, confident warm smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`turret_child` + 义眼**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Turret-child look: tailored sleeveless gunnery cadet top with a deep open collar, bare shoulders and collarbone visible, a metallic gunnery insignia on the collar strap, sleek naval aesthetic.

young woman, short practical champagne-blonde hair with ruby tips, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`turret_child` + 义肢**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Turret-child look: tailored sleeveless gunnery cadet top with a deep open collar, bare shoulders and collarbone visible, a metallic gunnery insignia on the collar strap, sleek naval aesthetic.

young woman, short practical champagne-blonde hair with ruby tips, confident alluring smirk

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


**`turret_child` + 双改造(眼+肢)**

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.

Turret-child look: tailored sleeveless gunnery cadet top with a deep open collar, bare shoulders and collarbone visible, a metallic gunnery insignia on the collar strap, sleek naval aesthetic.

young woman, short practical champagne-blonde hair with ruby tips, confident alluring smirk

Augmented eye: one of the subject's eyes is replaced by a sleek cybernetic optic with a glowing lens iris and a thin chrome ring around the socket, faint inner light, integrated naturally into the face without obscuring identity.

Augmented limb: one visible arm and bare shoulder is a cybernetic prosthetic — brushed-chrome mechanical limb with articulated fingers raised near chest and visible hydraulic joints, blended at the collarbone with realistic synthetic skin, subtle power-line glow.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```


## 三、义体改造生图需求（2）

**共享基底**

```
Stylized sci-fi cyberware hero shot, clean concept-art style, semi-realistic painterly rendering, extreme close-up of a single cybernetic augmentation on a human subject, dramatic colored rim light, plain dark gradient background, game-key-art quality, polished, cinematic.
```

**共享负向**

```
extra people, full body, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, blurry, low quality, photo grain, anime, cartoon, deformed, extra limbs
```

每张 = 基底 + accent + 变体 + 负向。比例 3:4，落盘 `game/assets/portraits/augments/`。


**义眼 (`aug_eye`) → `nsk_aug_eye.webp`**

**accent**

```
Single cybernetic eye: a polished optical lens replacing one natural eye, faint inner glow, integrated into a weathered mercenary face, extreme close-up, high detail on the implant mechanism and iris.
```


**变体 V1**

```
Stylized sci-fi cyberware hero shot, clean concept-art style, semi-realistic painterly rendering, extreme close-up of a single cybernetic augmentation on a human subject, dramatic colored rim light, plain dark gradient background, game-key-art quality, polished, cinematic.

Single cybernetic eye: a polished optical lens replacing one natural eye, faint inner glow, integrated into a weathered mercenary face, extreme close-up, high detail on the implant mechanism and iris.

sleek optical eye implant, glowing cyan iris lens, subtle chrome ring around the eye socket

extra people, full body, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, blurry, low quality, photo grain, anime, cartoon, deformed, extra limbs
```


**变体 V2**

```
Stylized sci-fi cyberware hero shot, clean concept-art style, semi-realistic painterly rendering, extreme close-up of a single cybernetic augmentation on a human subject, dramatic colored rim light, plain dark gradient background, game-key-art quality, polished, cinematic.

Single cybernetic eye: a polished optical lens replacing one natural eye, faint inner glow, integrated into a weathered mercenary face, extreme close-up, high detail on the implant mechanism and iris.

military-grade targeting eye, amber HUD reticle projected, scarred socket

extra people, full body, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, blurry, low quality, photo grain, anime, cartoon, deformed, extra limbs
```


**变体 V3**

```
Stylized sci-fi cyberware hero shot, clean concept-art style, semi-realistic painterly rendering, extreme close-up of a single cybernetic augmentation on a human subject, dramatic colored rim light, plain dark gradient background, game-key-art quality, polished, cinematic.

Single cybernetic eye: a polished optical lens replacing one natural eye, faint inner glow, integrated into a weathered mercenary face, extreme close-up, high detail on the implant mechanism and iris.

archotech eye, violet luminescent iris, faint circuit traces under the surrounding skin

extra people, full body, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, blurry, low quality, photo grain, anime, cartoon, deformed, extra limbs
```


**义肢 (`aug_limb`) → `nsk_aug_limb.webp`**

**accent**

```
Single cybernetic limb: a mechanical arm with visible actuators and a synthetic-skin blend at the shoulder, worn by a mercenary, dramatic rim light, extreme close-up of the augmentation.
```


**变体 V1**

```
Stylized sci-fi cyberware hero shot, clean concept-art style, semi-realistic painterly rendering, extreme close-up of a single cybernetic augmentation on a human subject, dramatic colored rim light, plain dark gradient background, game-key-art quality, polished, cinematic.

Single cybernetic limb: a mechanical arm with visible actuators and a synthetic-skin blend at the shoulder, worn by a mercenary, dramatic rim light, extreme close-up of the augmentation.

bionic arm, brushed chrome plating, articulated fingers, visible hydraulic joints

extra people, full body, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, blurry, low quality, photo grain, anime, cartoon, deformed, extra limbs
```


**变体 V2**

```
Stylized sci-fi cyberware hero shot, clean concept-art style, semi-realistic painterly rendering, extreme close-up of a single cybernetic augmentation on a human subject, dramatic colored rim light, plain dark gradient background, game-key-art quality, polished, cinematic.

Single cybernetic limb: a mechanical arm with visible actuators and a synthetic-skin blend at the shoulder, worn by a mercenary, dramatic rim light, extreme close-up of the augmentation.

powered exo-limb, matte gunmetal with orange accent lines, heavy servos

extra people, full body, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, blurry, low quality, photo grain, anime, cartoon, deformed, extra limbs
```


**变体 V3**

```
Stylized sci-fi cyberware hero shot, clean concept-art style, semi-realistic painterly rendering, extreme close-up of a single cybernetic augmentation on a human subject, dramatic colored rim light, plain dark gradient background, game-key-art quality, polished, cinematic.

Single cybernetic limb: a mechanical arm with visible actuators and a synthetic-skin blend at the shoulder, worn by a mercenary, dramatic rim light, extreme close-up of the augmentation.

archotech limb, pearlescent white-and-gold, seamless energy conduits

extra people, full body, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, blurry, low quality, photo grain, anime, cartoon, deformed, extra limbs
```


## 四、新手引导角色（2）

**共享基底（真人角色）**

```
Stylized sci-fi character portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, soft studio lighting with one colored key light, high detail on face and outfit, game-key-art quality, polished, cinematic.
```

**共享基底（全息投影角色）**

```
Stylized sci-fi holographic character portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, semi-transparent volumetric light figure with soft cyan-teal glow, subtle scanline shimmer and faint chromatic light edges, high detail, game-key-art quality, polished, cinematic.
```

**共享负向**

```
extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon
```

每张 = 基底（全息 / 真人按角色取）+ 造型 accent + 变体构图 + 负向。比例 3:4，落盘 `game/assets/portraits/guides/`。
文件名：`nsk_guide_<id>[_<key>].webp`（第 1 套 `key` 为空 → 不带后缀）。


**Flora (`flora`)** — 全息 AI 引导员 · 舰基核心 · 全息助手

造型说明：全息投影 AI，女性形象。半透明体积光身体 + 青绿辉光 + 扫描线微闪；发丝带数字渐变；极简高领助手制服、细电路滚边；脚下有发光投影发射环，周围漂浮数据微粒。气质：耐心、清晰、可靠，偶尔一本正经地挖苦。用途：新手引导的主叙述者 / 系统解释。

**造型 accent**

```
Female-presenting holographic AI assistant, sleek semi-transparent volumetric light-body with soft cyan-teal glow, subtle scanline shimmer and faint chromatic light edges, flowing luminous shoulder-length hair with a digital gradient, calm friendly and helpful expression with a gentle smile, minimalist high-collar assistant uniform with subtle circuit trim, small data motes drifting around her, hard-light hologram aesthetic, approachable onboarding-guide presence.
```


**立绘（站立引导） → `nsk_guide_flora.webp`**

```
Stylized sci-fi holographic character portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, semi-transparent volumetric light figure with soft cyan-teal glow, subtle scanline shimmer and faint chromatic light edges, high detail, game-key-art quality, polished, cinematic.

Female-presenting holographic AI assistant, sleek semi-transparent volumetric light-body with soft cyan-teal glow, subtle scanline shimmer and faint chromatic light edges, flowing luminous shoulder-length hair with a digital gradient, calm friendly and helpful expression with a gentle smile, minimalist high-collar assistant uniform with subtle circuit trim, small data motes drifting around her, hard-light hologram aesthetic, approachable onboarding-guide presence.

Full-body standing three-quarter view, one hand raised in a calm welcoming gesture, legs dissolving into soft light below the knee, projected from a glowing emitter ring at her feet, plain dark gradient background, serene and reassuring.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon
```


**对话头像（半身） → `nsk_guide_flora_bust.webp`**

```
Stylized sci-fi holographic character portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, semi-transparent volumetric light figure with soft cyan-teal glow, subtle scanline shimmer and faint chromatic light edges, high detail, game-key-art quality, polished, cinematic.

Female-presenting holographic AI assistant, sleek semi-transparent volumetric light-body with soft cyan-teal glow, subtle scanline shimmer and faint chromatic light edges, flowing luminous shoulder-length hair with a digital gradient, calm friendly and helpful expression with a gentle smile, minimalist high-collar assistant uniform with subtle circuit trim, small data motes drifting around her, hard-light hologram aesthetic, approachable onboarding-guide presence.

Head-and-shoulders bust, speaking warmly with an attentive smile, eyes meeting the viewer, holographic translucency most visible at the shoulders and hair tips, plain dark gradient background.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon
```


**引导指向（全息面板） → `nsk_guide_flora_point.webp`**

```
Stylized sci-fi holographic character portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, semi-transparent volumetric light figure with soft cyan-teal glow, subtle scanline shimmer and faint chromatic light edges, high detail, game-key-art quality, polished, cinematic.

Female-presenting holographic AI assistant, sleek semi-transparent volumetric light-body with soft cyan-teal glow, subtle scanline shimmer and faint chromatic light edges, flowing luminous shoulder-length hair with a digital gradient, calm friendly and helpful expression with a gentle smile, minimalist high-collar assistant uniform with subtle circuit trim, small data motes drifting around her, hard-light hologram aesthetic, approachable onboarding-guide presence.

Three-quarter bust, gesturing toward a floating translucent holographic interface panel beside her, explaining with a patient confident expression, faint UI glow reflecting on her face, plain dark gradient background.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon
```


**边疆拓殖民公社·本地登记人 (`registrar`)** — 序章登记官 · 边疆拓殖民公社 · 登记处

造型说明：边疆登记站的光头中年登记官：浓密灰褐胡须、右眼换成一枚猩红电子眼（细铬圈）、促狭揶揄的笑、油亮红润的脸。穿褪色打补丁的公社制服、袖子卷起；立绘坐油腻合金桌后，桌上堆盖过章的单据 / 橡皮图章 / 搪瓷杯。气质：油滑、懒散、爱挖苦，但守规矩。用途：序章引导 + 交付/报销类任务。

**造型 accent**

```
Middle-aged heavy-set frontier registration officer of the colonization commune, completely bald with a smooth scalp, thick bushy grey-brown beard, one glowing crimson cybernetic eye replacing his right eye with a thin chrome socket ring, sly knowing smirk, weathered ruddy face, worn faded colonial-commune jacket with peeling patches and rolled-up sleeves.
```


**立绘（坐姿·含桌） → `nsk_guide_registrar.webp`**

```
Stylized sci-fi character portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, soft studio lighting with one colored key light, high detail on face and outfit, game-key-art quality, polished, cinematic.

Middle-aged heavy-set frontier registration officer of the colonization commune, completely bald with a smooth scalp, thick bushy grey-brown beard, one glowing crimson cybernetic eye replacing his right eye with a thin chrome socket ring, sly knowing smirk, weathered ruddy face, worn faded colonial-commune jacket with peeling patches and rolled-up sleeves.

Three-quarter seated composition behind a scuffed greasy alloy desk cluttered with stamped forms, a rubber stamp, a clipboard and a chipped enamel mug, both hands resting on a stack of paperwork, leaning back with a wry appraising look, grimy frontier registration office with a dim overhead lamp and stacked paper files.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon
```


**对话头像（半身） → `nsk_guide_registrar_bust.webp`**

```
Stylized sci-fi character portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, soft studio lighting with one colored key light, high detail on face and outfit, game-key-art quality, polished, cinematic.

Middle-aged heavy-set frontier registration officer of the colonization commune, completely bald with a smooth scalp, thick bushy grey-brown beard, one glowing crimson cybernetic eye replacing his right eye with a thin chrome socket ring, sly knowing smirk, weathered ruddy face, worn faded colonial-commune jacket with peeling patches and rolled-up sleeves.

Head-and-shoulders bust, sly knowing smirk, one eyebrow slightly raised, the crimson cybernetic eye catching a glint of light, softly blurred grimy office clutter behind him, plain dark gradient background.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon
```


**盖章姿态（递单） → `nsk_guide_registrar_stamp.webp`**

```
Stylized sci-fi character portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, soft studio lighting with one colored key light, high detail on face and outfit, game-key-art quality, polished, cinematic.

Middle-aged heavy-set frontier registration officer of the colonization commune, completely bald with a smooth scalp, thick bushy grey-brown beard, one glowing crimson cybernetic eye replacing his right eye with a thin chrome socket ring, sly knowing smirk, weathered ruddy face, worn faded colonial-commune jacket with peeling patches and rolled-up sleeves.

Three-quarter view mid-action, pressing a worn rubber stamp onto a form with one hand while sliding a clipboard toward the viewer with the other, impatient but amused expression, grimy frontier registration office behind.

extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon
```
