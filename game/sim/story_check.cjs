// 剧情运行时单测（Node，window 桩）—— 临时脚本，跑完即删
"use strict";
const path = require("path");

// ---- window 桩：能让 UMD 挂到 window.NSK，且 Story 能读到 StoryData ----
global.window = { NSK: {} };
const SR = require(path.join(__dirname, "../js/narrative/story-runtime.js"));
const SD = require(path.join(__dirname, "../js/narrative/story.js"));
window.NSK.Narrative = window.NSK.Narrative || {};
window.NSK.Narrative.Story = SR;
window.NSK.Narrative.StoryData = SD;

// 给运行时 special 动作准备依赖桩（addMembers 在 Node 下无真实引擎，用假 recruitMember 验证分发）
window.NSK.Engine = {
  State: {
    recruitMember(state) {
      state.members = state.members || [];
      state.members.push({ id: "stub_" + state.members.length });
      return { ok: true };
    },
  },
};
window.NSK.Data = {};
window.NSK.Core = { makeRng: () => () => 0.5 };

let PASS = 0, FAIL = 0;
function ok(name, cond, extra) {
  if (cond) { PASS++; console.log("[PASS] " + name); }
  else { FAIL++; console.log("[FAIL] " + name + (extra ? " | " + extra : "")); }
}

// ---------- 1. 数据完整性 ----------
ok("场景数 = 6", SR.scenes().length === 6, "实际 " + SR.scenes().length);
ok("说话人 = 3", Object.keys(SR.speakers()).length === 3, JSON.stringify(Object.keys(SR.speakers())));
ok("说话人 flora 改名 F.I.O.N.A", SR.speakerOf("flora").name === "F.I.O.N.A", SR.speakerOf("flora").name);
ok("说话人 registrar 改名 瑞瓦肖", SR.speakerOf("registrar").name === "瑞瓦肖", SR.speakerOf("registrar").name);
ok("byId 命中", !!SR.byId("prologue_registrar"));
ok("byId 未命中返回 null", SR.byId("nope") === null);

let badLines = [];
for (const sc of SR.scenes()) {
  if (!Array.isArray(sc.lines) || !sc.lines.length) badLines.push(sc.id + ":无台词");
  sc.lines.forEach((l, i) => {
    if (!l.text && !(l.choices && l.choices.length)) badLines.push(sc.id + "#" + i + ":空");
  });
}
ok("所有台词非空", badLines.length === 0, badLines.slice(0, 3).join(","));

// 分支跳转的目标场景必须存在（悬空跳转 = 播放中断）
let dangling = [];
for (const sc of SR.scenes()) {
  for (const l of sc.lines) {
    for (const ch of (l.choices || [])) {
      if (ch.next && !SR.byId(ch.next)) dangling.push(sc.id + "->" + ch.next);
    }
  }
}
ok("无悬空分支跳转", dangling.length === 0, dangling.join(","));

// 分支三选项 next 全部存在
const reg = SR.byId("prologue_registrar");
const regChoices = reg.lines[reg.lines.length - 1].choices;
ok("序章末句有 3 个选项", regChoices.length === 3, "实际 " + regChoices.length);
ok("选项1→prologue_origin_family", regChoices[0].next === "prologue_origin_family");
ok("选项2→prologue_origin_federation", regChoices[1].next === "prologue_origin_federation");
ok("选项3→prologue_origin_nosy", regChoices[2].next === "prologue_origin_nosy");

// ---------- 2. 头像解析 ----------
ok("guide:flora/bust", SR.resolveAvatar("guide:flora/bust") === "assets/portraits/guides/nsk_guide_flora_bust.webp", SR.resolveAvatar("guide:flora/bust"));
ok("guide:registrar（无 key 不带后缀）", SR.resolveAvatar("guide:registrar") === "assets/portraits/guides/nsk_guide_registrar.webp", SR.resolveAvatar("guide:registrar"));
ok("fac:settlers", SR.resolveAvatar("fac:settlers") === "assets/portraits/factions/nsk_fac_settlers_contact.webp", SR.resolveAvatar("fac:settlers"));
ok("裸文件名按根目录补全", SR.resolveAvatar("guides/x.webp") === "assets/portraits/guides/x.webp", SR.resolveAvatar("guides/x.webp"));
ok("assets/ 开头原样保留", SR.resolveAvatar("assets/portraits/a.webp") === "assets/portraits/a.webp");
ok("空串 → 空（旁白）", SR.resolveAvatar("") === "");
ok("npc:corp_heir/v2（无 Portraits 时走约定路径）", /npc\/corp_heir\/corp_heir_v2\.webp$/.test(SR.resolveAvatar("npc:corp_heir/v2")), SR.resolveAvatar("npc:corp_heir/v2"));
ok("npc:corp_heir/reveal", /corp_heir_reveal\.webp$/.test(SR.resolveAvatar("npc:corp_heir/reveal")), SR.resolveAvatar("npc:corp_heir/reveal"));
ok("头像解析带缓存（同 spec 同结果）", SR.resolveAvatar("guide:flora/bust") === SR.resolveAvatar("guide:flora/bust"));

// ---------- 3. 状态与自动开播 ----------
const state = { res: { credits: 1000, fuel: 50 }, factions: [{ id: "federation", relation: 0 }] };
const st = SR.ensure(state);
ok("ensure 建出 story 结构", !!st && Array.isArray(st.seen) && st.cur === null && typeof st.flags === "object");
const auto = SR.autoStart(state);
ok("autoStart 开播序章", auto.started && auto.sceneId === "prologue_registrar", JSON.stringify(auto));
ok("hasActive = true", SR.hasActive(state) === true);

const c0 = SR.current(state);
ok("current 拿到第 1 句（菲欧娜开场）", c0 && c0.index === 0 && c0.total === 6, c0 ? c0.index + "/" + c0.total : "null");
ok("第 1 句是菲欧娜（全息开场）", c0.line.who === "flora", c0.line.who);
ok("菲欧娜头像命中引导图", SR.avatarOf(c0.line) === "assets/portraits/guides/nsk_guide_flora_bust.webp", SR.avatarOf(c0.line));
const narrLine = SR.byId("prologue_registrar").lines[1];
ok("第 2 句是旁白（无头像）", narrLine.who === "narrator" && SR.avatarOf(narrLine) === "");

// ---------- 4. 推进到带选项的台词 ----------
let guard = 0;
while (guard++ < 50) {
  const r = SR.advance(state);
  if (!r.ok) break;
}
ok("推进到选项句被拦（need-choice）", SR.current(state) && Array.isArray(SR.current(state).line.choices));
const cur1 = SR.current(state);
ok("停在最后一句（选项句，索引5）", cur1.index === 5, cur1.index + "/" + cur1.total);
ok("advance 在有选项时返回 need-choice", SR.advance(state).err === "need-choice");

// ---------- 5. 选项1：家里人给的 → 联邦声望+500、星币+100,000 ----------
const before = state.res.credits;
const cr = SR.choose(state, 0);
ok("选「家里人给的」跳到 prologue_origin_family", cr.ok && cr.next === "prologue_origin_family", JSON.stringify(cr));
ok("星币 +100,000", state.res.credits === before + 100000, before + " -> " + state.res.credits);
ok("联邦声望 +500（封顶100）", state.factions[0].relation === 100, "relation=" + state.factions[0].relation);
ok("flag origin_family 已写", state.story.flags.origin_family === true);

// 支线播完 → 交还菲欧娜 → prologue_flora
guard = 0;
while (guard++ < 50) { const r = SR.advance(state); if (!r.ok || r.done) break; }
const famEnd = SR.current(state);
ok("分支末句带「继续」选项", famEnd && Array.isArray(famEnd.line.choices), famEnd ? String(famEnd.line.text).slice(0, 8) : "null");
const crCont = SR.choose(state, 0);
ok("「继续」→ prologue_flora", crCont.ok && crCont.next === "prologue_flora", JSON.stringify(crCont));

// ---------- 6. 菲欧娜幕：追问 → 自述支线 → 收尾 ----------
guard = 0;
while (guard++ < 50) { const r = SR.advance(state); if (!r.ok) break; }
const fNow = SR.current(state);
ok("菲欧娜幕停在选项句", fNow && Array.isArray(fNow.line.choices), fNow ? String(fNow.line.text).slice(0, 12) : "null");
const crAsk = SR.choose(state, 1);
ok("追问 → prologue_flora_what", crAsk.next === "prologue_flora_what", JSON.stringify(crAsk));
ok("asked_flora flag", state.story.flags.asked_flora === true);
guard = 0;
while (guard++ < 50) { const r = SR.advance(state); if (!r.ok) break; }
const crDone = SR.choose(state, 0);
ok("自述支线收尾 done", crDone.ok && crDone.done === true, JSON.stringify(crDone));
ok("credits +300 只加一次", state.res.credits === before + 100000 + 300, state.res.credits);
ok("fuel +20 只加一次", state.res.fuel === 50 + 20, state.res.fuel);
ok("prologue_done flag", state.story.flags.prologue_done === true);
ok("无播放时 current = null", SR.current(state) === null);
ok("无播放时 hasActive = false", SR.hasActive(state) === false);
ok("无播放时 advance 报错不崩", SR.advance(state).ok === false);

// ---------- 7. 列表 / 重置 ----------
const list = SR.list(state);
ok("列表排除 hidden 支线（只剩 2 条）", list.length === 2, JSON.stringify(list.map(x => x.id)));
ok("列表标记已看 prologue_flora", list.find(x => x.id === "prologue_flora").seen === true);
ok("列表标记开局自动 prologue_registrar", list.find(x => x.id === "prologue_registrar").auto === true);
SR.resetProgress(state);
ok("resetProgress 清空 seen", state.story.seen.length === 0);
ok("resetProgress 后 autoStart 会重播序章", SR.autoStart(state).started === true);

// ---------- 8. 旧档兼容 ----------
const oldSave = { res: {} };          // 完全没有 story 字段
SR.ensure(oldSave);
ok("旧档 ensure 补齐 story", !!oldSave.story && oldSave.story.cur === null);
const broken = { story: { seen: "bad", flags: null } };
SR.ensure(broken);
ok("story 字段类型错也能修好", Array.isArray(broken.story.seen) && typeof broken.story.flags === "object");

// ---------- 9. 资源不为负 ----------
const neg = { res: { credits: 10 } };
SR.applyEffect(neg, { delta: { credits: -999 } });
ok("扣成负数被夹到 0", neg.res.credits === 0, String(neg.res.credits));

// ---------- 10. special 动作分发（独立 state）----------
// factionRep 封顶 100
const sFR = { res: {}, factions: [{ id: "federation", relation: 80 }] };
SR.applyEffect(sFR, { special: [{ type: "factionRep", faction: "federation", amount: 500 }] });
ok("factionRep +500 在 80 基础上封顶 100", sFR.factions[0].relation === 100, "relation=" + sFR.factions[0].relation);
const sFR2 = { res: {}, factions: [{ id: "federation", relation: 0 }] };
SR.applyEffect(sFR2, { special: [{ type: "factionRep", faction: "federation", amount: 30 }] });
ok("factionRep +30 → 30", sFR2.factions[0].relation === 30, "relation=" + sFR2.factions[0].relation);
// 未知势力 no-op 不崩
const sFR3 = { res: {}, factions: [{ id: "federation", relation: 0 }] };
SR.applyEffect(sFR3, { special: [{ type: "factionRep", faction: "ghost", amount: 50 }] });
ok("factionRep 未知势力 no-op", sFR3.factions[0].relation === 0);

// addMembers 真加 2 名（依赖桩）
const sAM = { res: {}, members: [] };
SR.applyEffect(sAM, { special: [{ type: "addMembers", count: 2 }] });
ok("addMembers count=2 → 名册 +2", sAM.members.length === 2, "len=" + sAM.members.length);

// learnTech 暂记 flag
const sLT = { res: {}, story: { seen: [], cur: null, flags: {} } };
SR.applyEffect(sLT, { special: [{ type: "learnTech", tech: "harvest3" }] });
ok("learnTech 记 learnedTech_harvest3 flag", sLT.story.flags.learnedTech_harvest3 === true);

// special 缺失依赖时安全 no-op（模拟无引擎环境）
const realWin = global.window;
global.window = { NSK: {} };           // 去掉 Engine/Data/Core
const SR2 = require(path.join(__dirname, "../js/narrative/story-runtime.js"));
const sNoDep = { res: {}, members: [], factions: [{ id: "federation", relation: 0 }] };
let threw = false;
try { SR2.applyEffect(sNoDep, { special: [{ type: "addMembers", count: 2 }, { type: "factionRep", faction: "federation", amount: 500 }] }); } catch (e) { threw = true; }
ok("special 无依赖时不抛错", !threw);
ok("special 无依赖时 factionRep 仍生效（不依赖引擎）", sNoDep.factions[0].relation === 100);
ok("special 无依赖时 addMembers no-op（无 Engine）", sNoDep.members.length === 0);
global.window = realWin;

// ---------- 11. 编辑器导出保留 special（模拟 genStoryJs 行为）----------
// genStoryJs 在编辑器 HTML 内，这里仅校验数据层 special 结构完整、resolveAvatar 命中引导图
ok("序章选项1 effect 含 special.factionRep", JSON.stringify(regChoices[0].effect.special).indexOf("factionRep") >= 0);
ok("序章选项2 effect 含 special.learnTech", JSON.stringify(regChoices[1].effect.special).indexOf("learnTech") >= 0);
ok("序章选项3 effect 含 special.addMembers", JSON.stringify(regChoices[2].effect.special).indexOf("addMembers") >= 0);

console.log("\n======== RESULT: PASS=" + PASS + " FAIL=" + FAIL + " ========");
process.exit(FAIL ? 1 : 0);
