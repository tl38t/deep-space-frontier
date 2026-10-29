// ================================================================
// 深空星疆 —— Narrative.StoryData：剧情数据（单一真相源）
// ----------------------------------------------------------------
// ⚠ 本文件由可视化编辑器 game/story-editor.html 生成/维护；
//   手改也能跑，但改完请回编辑器里点一次「校验」以防字段写错。
//
// 为什么是 .js 而不是 .json：
//   file:// 下浏览器禁止 fetch 本地 JSON（CORS），但 <script src> 仍可直读 →
//   数据挂 window.NSK_STORY，零构建、双击 index.html 就能跑。
//
// schema：
//   speakers: { <speakerId>: { name, avatar, color, fx? } }
//     · name   显示名（空串 = 旁白，不显示名字）
//     · avatar 头像写法见下
//     · color  名字与边框强调色（十六进制）
//   scenes: [ scene ]
//   scene:
//     { id, title, trigger?: "firstBoot"|null, hidden?: bool, note?: string, lines: [ line ] }
//     · trigger:"firstBoot" → 新开局/未看过时自动播放一次
//     · hidden:true         → 只作为分支落点，不出现在「剧情」页签列表里
//   line:
//     { who, text, avatar?: 覆盖说话人默认头像, fx?: "holo"|"static"|"",
//       choices?: [ { label, next?: sceneId|null, effect?: eff, note?: string } ] }
//     · 带 choices 的台词：必须先选，不能「下一句」跳过
//     · next 为空 = 选完即结束；next 为场景 id = 跳到那个场景继续
//   eff:
//     { delta?: { <resKey>: ±n }, flag?: "flagId",
//       special?: [ { type, ... } ] }
//     · delta   普通资源增减（state.res 顶层键，如 credits/fuel/rep）
//     · flag    记录关键选择（state.story.flags）
//     · special 引擎级特殊效果（见下），编辑器不提供 UI 但导出时原样保留
//   special 动作（由 story-runtime applyEffect 分发）：
//     { type:"factionRep", faction:"federation", amount:500 }  某势力关系值 +n（封顶 100）
//     { type:"addMembers", count:2 }                           随机招募 n 名初始团员（名册<20 时）
//     { type:"learnTech", tech:"harvest3" }                    暂记 flag（科技树未建，待接）
//
// 头像写法（Story.resolveAvatar 解析）：
//   "guide:flora/bust"        → assets/portraits/guides/nsk_guide_flora_bust.webp
//   "guide:registrar"         → assets/portraits/guides/nsk_guide_registrar.webp
//   "npc:corp_heir/reveal"    → 走 Portraits 多张随机（reveal / v1..v4）
//   "fac:settlers"             → assets/portraits/factions/nsk_fac_settlers_contact.webp
//   "assets/portraits/xx.webp"→ 原样使用
//   ""                        → 无头像，纯旁白条
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Narrative = window.NSK.Narrative || {};
    window.NSK.Narrative.StoryData = mod;   // 命名空间子键（不做 flat assign）
    window.NSK_STORY = mod;                  // 编辑器/外部工具也读这个全局
  }
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  return {
    version: 2,

    speakers: {
      narrator: { name: "", avatar: "", color: "" },
      flora: { name: "F.I.O.N.A", avatar: "guide:flora/bust", color: "#62d5af", fx: "holo" },
      registrar: { name: "瑞瓦肖", avatar: "guide:registrar/bust", color: "#e2bd68" },
    },

    scenes: [
      {
        id: "prologue_registrar",
        title: "序章 · 边疆登记处",
        trigger: "firstBoot",
        note: "新手引导第一幕：F.I.O.N.A 开场被登记人瑞瓦肖打断，瑞瓦肖定调「联邦照不到这里」，并盘问你的来历（三选项分支）。",
        lines: [
          { who: "flora", text: "您好，指挥官，我是隶属于联邦拓殖公社的边疆区统括助理AI，全称为 Frontier Integrated Operations and Networking Assistant，通称 F.I.O.N.A，欢迎来到边疆区，接下来，我将——" },
          { who: "narrator", text: "[一个装着电子眼的男人强行打断了AI的介绍]" },
          { who: "registrar", text: "行了，这活还是让我来吧，菲欧娜。" },
          { who: "registrar", text: "菜鸟，我是联邦拓殖公社的登记人瑞瓦肖。但我劝你还是忘掉什么「联邦拓殖公社」比较好，联邦的光可照不到这里。" },
          { who: "registrar", text: "明白吗，菜鸟，这儿不归联邦管，或者说，至少大部分地区不归联邦管，你最好记住这一点。" },
          {
            who: "registrar",
            text: "[瑞瓦肖敲了敲桌子] 行了，我们来说点正事吧，我看到入港信息，你带着一艘改装后的山海级工业母舰，这玩意你怎么搞到的？",
            choices: [
              {
                label: "来之前家里人给的（联邦声望+500，星币+100,000）",
                next: "prologue_origin_family",
                effect: {
                  delta: { credits: 100000 },
                  special: [{ type: "factionRep", faction: "federation", amount: 500 }],
                  flag: "origin_family",
                },
                note: "联邦声望+500、星币+100,000",
              },
              {
                label: "在联邦星区打拼出来的（自动学习产物采集3科技）",
                next: "prologue_origin_federation",
                effect: {
                  special: [{ type: "learnTech", tech: "harvest3", note: "产物采集3（科技树未建，暂记flag）" }],
                  flag: "origin_federation",
                },
                note: "自动学习产物采集3科技（待科技树）",
              },
              {
                label: "问东问西对你没好处（获得额外随机两名初始军团团员）",
                next: "prologue_origin_nosy",
                effect: {
                  special: [{ type: "addMembers", count: 2 }],
                  flag: "origin_nosy",
                },
                note: "获得额外随机两名初始军团团员",
              },
            ],
          },
        ],
      },

      {
        id: "prologue_origin_family",
        title: "序章 · 公子哥儿",
        hidden: true,
        note: "分支1（家里人给的）：瑞瓦肖不屑，收尾交还 F.I.O.N.A。联邦声望+500、星币+100,000。",
        lines: [
          { who: "registrar", text: "[瑞瓦肖浓密的胡须下闪过一丝不屑] 公子哥儿？别在这把命丢了就成。" },
          { who: "registrar", text: "不管怎么说吧，你的登记完成了。[瑞瓦肖摊了摊手]" },
          { who: "registrar", text: "菲欧娜，送这位菜鸟回他的大玩具上去吧，接下来的引导就交给你了。", choices: [{ label: "（继续）", next: "prologue_flora" }] },
        ],
      },

      {
        id: "prologue_origin_federation",
        title: "序章 · 联邦打拼",
        hidden: true,
        note: "分支2（联邦星区打拼）：瑞瓦肖笑了笑，收尾交还 F.I.O.N.A。自动学习产物采集3科技（待科技树）。",
        lines: [
          { who: "registrar", text: "[瑞瓦肖笑了笑] 这儿可不是联邦星区，跑来打拼可得想想自己这条命值不值。" },
          { who: "registrar", text: "不管怎么说吧，你的登记完成了。[瑞瓦肖摊了摊手]" },
          { who: "registrar", text: "菲欧娜，送这位菜鸟回他的大玩具上去吧，接下来的引导就交给你了。", choices: [{ label: "（继续）", next: "prologue_flora" }] },
        ],
      },

      {
        id: "prologue_origin_nosy",
        title: "序章 · 不问就是",
        hidden: true,
        note: "分支3（问东问西没好处）：瑞瓦肖沉默一会，收尾交还 F.I.O.N.A。获得额外随机两名初始军团团员。",
        lines: [
          { who: "registrar", text: "[瑞瓦肖盯着你，沉默了一会] 行，不问就是。" },
          { who: "registrar", text: "不管怎么说吧，你的登记完成了。[瑞瓦肖摊了摊手]" },
          { who: "registrar", text: "菲欧娜，送这位菜鸟回他的大玩具上去吧，接下来的引导就交给你了。", choices: [{ label: "（继续）", next: "prologue_flora" }] },
        ],
      },

      {
        id: "prologue_flora",
        title: "序章 · 舰基唤醒",
        note: "新手引导第二幕：F.I.O.N.A 接管，交代三条纪律（对应电网 / 成员体力 / 星图丰度三个系统）。",
        lines: [
          { who: "narrator", text: "舰基核心的舷桥舱。冷白光从脚下亮起，一圈一圈往外推，把你的影子推回自己脚下。" },
          { who: "flora", text: "登记完成。我是 F.I.O.N.A，舰基核心的全息界面。你可以把我理解成这艘船的账本，加一张脸。" },
          { who: "flora", text: "居住舱里有六个人。他们不是配给你的礼物，他们现在就在你的名册上。" },
          { who: "flora", text: "三条纪律。第一，能源永远是负的，先修电网，再谈产能。" },
          { who: "flora", text: "第二，人会累。把成员当矿机排满日程，第一周很好看，第二周名册就会空一半。" },
          { who: "flora", text: "第三，矿会挖完。别把整支军团押在一个节点上——安等越低，东西越好，人也越容易死。" },
          {
            who: "flora",
            text: "这三条你可以不听。我只是提前把账单念给你听。",
            choices: [
              {
                label: "明白了。开工。",
                next: null,
                effect: { delta: { credits: 300, fuel: 20 }, flag: "prologue_done" },
                note: "收尾 → 给起始资源，序章结束",
              },
              {
                label: "你到底是什么？",
                next: "prologue_flora_what",
                effect: { flag: "asked_flora" },
                note: "追问 → F.I.O.N.A 的自述支线，答完同样结束",
              },
            ],
          },
        ],
      },

      {
        id: "prologue_flora_what",
        title: "序章 · 一段会算账的程序",
        hidden: true,
        note: "支线：F.I.O.N.A 自述。为后续「F.I.O.N.A 是不是人」的长线埋钩子。",
        lines: [
          { who: "flora", text: "一段会算账的程序，被授权使用一个女人的声音。" },
          { who: "flora", text: "你失望了吗。" },
          { who: "narrator", text: "舱内的扫描线慢了半拍。你分不清那是渲染延迟，还是她在等。" },
          { who: "flora", text: "没关系。上一个问这个问题的人，后来把我当成了人。那是个更糟的误会。" },
          {
            who: "flora",
            text: "开工吧，负责人。你的电网现在只有 42% 余量。",
            choices: [
              {
                label: "（沉默地点头）",
                next: null,
                effect: { delta: { credits: 300, fuel: 20 }, flag: "prologue_done" },
                note: "收尾 → 给起始资源，序章结束",
              },
            ],
          },
        ],
      },
    ],
  };
});
