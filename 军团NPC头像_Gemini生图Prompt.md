# 深空星疆 · 军团 NPC 头像 — 批量生图方案 & Gemini Prompt 包

> 用途：批量生成军团成员（NPC）头像，喂给 Gemini（图像生成）。
> 核心策略：**预生成「肖像池」+ 招募时按 seed 分配**——所有图在**离线**用 Gemini 生成，运行时零 API（不违反零 API 铁律）。
> 与势力联络人同一美术家族（风格化科幻立绘），但**改用「人员档案卡 / ID 照」构图**（无通讯框），与「接收任务的联络人」在视觉上区分。

---

## 一、批量策略（为什么这么干）

1. **原型矩阵**：NPC 外貌由「出身原型 × 变体」驱动，避免「每张都纯随机 → 互不相关、RPG 感为零」。
2. **预生成池**：按矩阵离线生成一批（默认 12 原型 × 4 变体 = 48 张），存为静态资产。
3. **招募分配**：成员创建时按 `seed(member.id)` 从池中挑一张（可按出身偏置到对应原型）。图与成员解耦，**运行时不生成、不联网**。
4. **一致性**：共享基底 prompt + 每原型 accent + 共享负向 + 统一比例/打光，保证 48 张成套。

> 规模可调：想要更省就 12×3=36，想要更丰富就 12×5=60。池子越大、名册复用率越低。

---

## 二、原型矩阵（12 原型，源自游戏真实出身体系）

| # | 原型 id | 来源（出生/出身） | 主调 | 外貌关键词（喂 accent） |
|---|---|---|---|---|
| 1 | `belt_nomad` | 小行星带游牧 | 风尘矿工 | 耐磨保温采矿夹克、工具挂带、尘垢、实用拾荒感 |
| 2 | `fleet_brat` | 舰队子弟 | 军装军官 | 挺括舰队制服+军衔徽、纪律姿态、海军军官感 |
| 3 | `orphan_void` | 虚空孤儿 | 半机械拾荒 | 拼凑义体植入、拾荒虚空服、诡静、后人类 |
| 4 | `relic_kid` | 遗迹猎人之后 | 探险家 | 轻量探险装、文物挎包、好奇自信、淘宝客 |
| 5 | `defector` | 叛逃者 | 落魄军人 | 褪色作战服、扯掉的部队臂章、警惕硬朗、前军人 |
| 6 | `corp_heir` | 财团继承人 | 精英商人 | 定制贵价衣着、低调财富符号、从容、精英贸易感 |
| 7 | `station_rat` | 空间站鼠辈 | 技工 | 油污工装连体服、工具腰带、机灵、船坞技师 |
| 8 | `signal_orphan` | 信号弃儿 | 监听分析师 | 头戴通讯耳麦、脸上映着暗屏光、专注内向、监听站 |
| 9 | `frontier` | 边陲平民（9 星域通用）| 拓荒民 | 朴素耐用殖民便装、风吹日晒、务实、边境殖民 |
| 10 | `merc_veteran` | 通用老兵 | 硬核佣兵 | 战损装备、可见伤疤、自信致命姿态、老练赏金客 |
| 11 | `augmented` | 通用重改造 | 改造人 | 显眼义体臂/眼/肢、铬与皮、跨人类审美 |
| 12 | `pilot` | 通用飞行员 | 舰桥飞行员 | 飞行服、腋下夹头盔、航空感、痞帅可靠 |

> 原型 1–8 直接对应 `state.js` 的 `BACKSTORY_DEFS` 出身 id（招募时出身→原型偏置最自然）；9–12 为通用兜底桶，覆盖无名背景成员。
> 命名/IP：id 全 ASCII 稳定键，无 EVE 裸名。

---

## 三、美术风格规范（与联络人同族，构图区分）

- **画风**：风格化科幻立绘，概念设定稿质感，半写实 painterly 渲染但形状清晰可读。
- **构图**：头肩 bust，平视镜头微 3/4 转，中性打光，**纯中性暗背景无环境**——做成「人员档案卡 / ID 照」感（**无通讯框**，与联络人的全息通讯帧区分）。
- **比例**：3:4 竖构图（bust 细节足，后续裁圆做头像也可）。
- **分辨率**：取 Gemini 原生最大，再压到长边 1024；PNG→WebP(q≈84)。
- **一致性铁律**：共享基底 prompt + 每原型 accent + 每变体 token + 共享负向 + 统一比例/打光。

---

## 四、Gemini Prompt 包（复制即用）

### ① 共享基底 prompt（所有图先接这段）

```
Stylized sci-fi character bust portrait, clean concept-art style, semi-realistic painterly rendering with crisp readable shapes, head-and-shoulders only, subject facing camera with slight three-quarter turn, neutral expressive face, soft studio lighting with neutral key light, plain dark neutral background with no environment, personnel dossier / ID-portrait feel, high detail on face and outfit, game-key-art quality, polished, cinematic.
```

### ② 每原型 accent（拼在基底后面，12 选 1）

```
[belt_nomad]
Dusty asteroid-belt nomad look: worn insulated mining jacket, utility harness, grime and dust on clothes, practical scavenger vibe, frontier miner aesthetic.

[fleet_brat]
Military-academy officer look: crisp fleet uniform with rank insignia, disciplined posture, naval officer aesthetic.

[orphan_void]
Salvaged half-machine orphan look: patchwork augmented implants, scavenged void-suit, eerie calm, post-human scavenger.

[relic_kid]
Frontier relic-hunter look: light explorer gear, satchel of artifacts, curious confident expression, treasure-seeker vibe.

[defector]
Disgraced defector soldier look: faded combat fatigues, removed unit patches, wary hardened expression, ex-military.

[corp_heir]
Corporate heir look: tailored expensive outfit, subtle wealth signals, composed smug expression, elite trader aesthetic.

[station_rat]
Station tinker look: grease-stained work jumpsuit, tool belt, clever scrappy expression, shipyard mechanic vibe.

[signal_orphan]
Signal analyst look: headset and comms gear, dim monitor glow on face, focused introverted expression, listening-post aesthetic.

[frontier]
Frontier settler look: simple rugged colony clothes, sun-weathered skin, pragmatic expression, border colonist aesthetic.

[merc_veteran]
Veteran mercenary look: combat-worn gear, visible scars, confident lethal posture, hardened gun-for-hire.

[augmented]
Heavy cyber-augmented look: prominent cybernetic arm or eye or limbs, sleek chrome and skin, transhuman aesthetic.

[pilot]
Starship pilot look: flight suit, helmet tucked under arm, aviator aesthetic, cocky competent expression.
```

### ③ 每变体 token（4 选 1，拼在 accent 之后，制造脸/性别/年龄差异）

```
[V1] young woman, short practical hair, confident smirk
[V2] older man, weathered beard, facial scar, stern gaze
[V3] person of ambiguous gender, mid-age, calm neutral expression, understated
[V4] young man, clean-cut, eager alert expression
```

### ④ 共享负向 prompt（所有图都用）

```
extra people, crowd, complex background, environment clutter, text, letters, numbers, logos, watermark, signature, extra limbs, deformed hands, blurry, low quality, photo grain, anime, cartoon, full body
```

### ⑤ 拼接方式

每张 = **① 基底 + ② 对应原型 accent + ③ 一个变体 token + ④ 负向**。
例（belt_nomad 第 2 变体）：
```
<① 基底 prompt>
<② [belt_nomad] accent>
<③ [V2] token>
<④ 负向 prompt>
```

### ⑥ 输出 & 落盘

- 比例：**3:4**；分辨率取原生最大后再压到长边 **1024**。
- 目录：`game/assets/portraits/npc/`
- 文件名（ASCII 稳定键，`<arch>` 取上表 id，`<n>`=1..4）：
  - `nsk_npc_belt_nomad_1.webp` … `nsk_npc_belt_nomad_4.webp`
  - `nsk_npc_fleet_brat_1..4.webp`、`nsk_npc_orphan_void_1..4.webp`、`nsk_npc_relic_kid_1..4.webp`、`nsk_npc_defector_1..4.webp`、`nsk_npc_corp_heir_1..4.webp`、`nsk_npc_station_rat_1..4.webp`、`nsk_npc_signal_orphan_1..4.webp`、`nsk_npc_frontier_1..4.webp`、`nsk_npc_merc_veteran_1..4.webp`、`nsk_npc_augmented_1..4.webp`、`nsk_npc_pilot_1..4.webp`
- PNG → WebP（本机无 ffmpeg/magick，用已建好的 Pillow venv，按原型批量转）：
  ```bat
  "C:/Users/Administrator/.workbuddy/binaries/python/envs/default/Scripts/python.exe" -c "
  from PIL import Image, os
  archs=['belt_nomad','fleet_brat','orphan_void','relic_kid','defector','corp_heir','station_rat','signal_orphan','frontier','merc_veteran','augmented','pilot']
  out='game/assets/portraits/npc'
  os.makedirs(out, exist_ok=True)
  for a in archs:
      for n in range(1,5):
          src='%s_%d.png'%(a,n); im=Image.open(src).convert('RGB'); im.save('%s/nsk_npc_%s_%d.webp'%(out,a,n),'WEBP',quality=84,method=6)
  "
  ```
  （或 ffmpeg：`ffmpeg -i in.png -quality 84 out.webp`；或 ImageMagick：`magick in.png -quality 84 out.webp`。）

---

## 五、落盘后的接入（招募分配，运行时零 API）

1. 生成完写一份清单 `game/assets/portraits/npc/pool.json`：
   ```json
   { "archetypes": {
     "belt_nomad": ["nsk_npc_belt_nomad_1.webp", "..._2.webp", "..._3.webp", "..._4.webp"],
     "fleet_brat": [ ... ], "...": [ ... ]
   } }
   ```
2. 招募时分配（代码侧，后续实现）：成员 `origin` 命中某原型 → 在该原型桶内按 `seed(member.id)` 取一张；未命中的出身 → 全池随机取。头像即 `state.members[i].portrait = 路径`，UI 直接 `<img>`。
3. 全程不调 LLM / 不联网，符合零 API 铁律。

---

## 六、使用步骤

1. 把 ① 基底 prompt 复制到 Gemini。
2. 追加 ② 里对应原型 accent。
3. 追加 ③ 里一个变体 token。
4. 追加 ④ 负向 prompt。
5. 设比例 3:4，生成 4 张（V1–V4）。
6. 换下一个原型，重复 2–5，直到 12 原型 × 4 张 = 48 张。
7. 导出 PNG → 按 ⑥ 批量转 WebP 并命名 → 写 pool.json。
