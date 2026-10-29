// ================================================================
// 深空星疆 —— Narrative.Story：剧情运行时（播放状态机 + 头像解析 + 分支结算）
// ----------------------------------------------------------------
// 数据源：Narrative.StoryData（js/narrative/story.js，由 story-editor.html 生成）
// 状态：state.story = { seen:[sceneId], cur:{sceneId,i}|null, flags:{flagId:true} }
//   · 存在 state 里 → 自动随存档持久化，跨设备/离线继续
//   · 每次读写都先 ensure()，旧档缺字段自动补齐（不需要升 STATE_VERSION）
//
// 对外 API（全部同步，无 Promise）：
//   ensure(state)                补齐 state.story，返回它
//   scenes()/byId(id)            场景表
//   speakers()/speakerOf(id)     说话人预设
//   resolveAvatar(spec)          头像写法 → 真实相对路径（带缓存，防每秒换脸）
//   start(state, sceneId)        从某场景第 0 句开始播
//   current(state)               { scene, line, index, total } | null
//   advance(state)               下一句；本句有 choices 则拒绝
//   choose(state, idx)           选一个选项 → 结算 effect → 跳 next 或结束
//   finish(state, scene)         标记已看 + 清空 cur
//   autoStart(state)             找 trigger:"firstBoot" 且未看过的场景自动开播
//   list(state)                  给「剧情」页签用的场景清单（含 seen / locked）
//   hasActive(state)             是否有正在播放的剧情（页签红点用）
//   resetProgress(state)         清空已看记录（调试/重看序章）
//
// 设计取舍：
//   · 不用 fetch 读 JSON（file:// 被拦），直接读已加载的全局数据
//   · 不依赖 Data.AssetPrompts（那是后台专用、~700 行 prompt 文案，不进游戏包），
//     头像路径约定硬编码在本文件里，保持游戏包瘦身
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Narrative = window.NSK.Narrative || {};
    window.NSK.Narrative.Story = mod;   // 命名空间子键（不做 flat assign）
  }
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PORTRAIT_ROOT = "assets/portraits";
  const avatarCache = {};   // spec -> 解析后的相对路径（同一 spec 稳定，避免重渲染换脸）

  function win() { return (typeof window !== "undefined") ? window : null; }

  function data() {
    const w = win();
    const n = w && w.NSK;
    return (n && n.Narrative && n.Narrative.StoryData) || (w && w.NSK_STORY) || null;
  }

  function scenes() {
    const d = data();
    return (d && Array.isArray(d.scenes)) ? d.scenes : [];
  }

  function byId(id) {
    if (!id) return null;
    const list = scenes();
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  function speakers() {
    const d = data();
    return (d && d.speakers) || {};
  }

  function speakerOf(id) {
    const sp = speakers();
    return sp[id] || { name: id ? String(id) : "", avatar: "", color: "" };
  }

  // ---------------- 头像解析 ----------------
  // 约定：game/ 为根，相对路径不带前导斜杠
  function resolveAvatar(spec) {
    if (spec === undefined || spec === null) return "";
    const s = String(spec).trim();
    if (!s) return "";
    if (avatarCache[s] !== undefined) return avatarCache[s];

    let out = "";
    if (/^npc:/i.test(s)) {
      const body = s.slice(4);
      const seg = body.split("/");
      const archId = (seg[0] || "").trim();
      const stem = ((seg[1] || "v1") + "").trim().toLowerCase();
      const P = win() && win().NSK && win().NSK.UI && win().NSK.UI.Portraits;
      if (archId) {
        if (P) {
          const vi = stem === "v2" ? 1 : stem === "v3" ? 2 : stem === "v4" ? 3 : 0;
          const opts = (stem === "reveal") ? { revealing: true } : {};
          out = P.pick(archId, vi, opts) || "";
        }
        if (!out) {
          const vi = stem === "v2" ? 2 : stem === "v3" ? 3 : stem === "v4" ? 4 : 1;
          const nm = (stem === "reveal") ? "reveal" : ("v" + vi);
          out = PORTRAIT_ROOT + "/npc/" + archId + "/" + archId + "_" + nm + ".webp";
        }
      }
    } else if (/^guide:/i.test(s)) {
      const seg = s.slice(6).split("/");
      const id = (seg[0] || "").trim();
      const key = (seg[1] || "").trim();
      if (id) out = PORTRAIT_ROOT + "/guides/nsk_guide_" + id + (key ? "_" + key : "") + ".webp";
    } else if (/^fac:/i.test(s)) {
      const id = s.slice(4).trim();
      if (id) out = PORTRAIT_ROOT + "/factions/nsk_fac_" + id + "_contact.webp";
    } else if (/^(https?:|data:|\.\/|\/)/i.test(s) || s.indexOf("assets/") === 0) {
      out = s;
    } else {
      // 裸文件名：按头像根目录解析（如 "guides/nsk_guide_flora.webp"）
      out = PORTRAIT_ROOT + "/" + s.replace(/^\/+/, "");
    }

    avatarCache[s] = out;
    return out;
  }

  function clearAvatarCache() {
    for (const k in avatarCache) delete avatarCache[k];
  }

  // 说话人默认头像（line.avatar 优先）
  function avatarOf(line) {
    if (!line) return "";
    if (line.avatar) return resolveAvatar(line.avatar);
    const sp = speakerOf(line.who);
    return resolveAvatar(sp.avatar || "");
  }

  // ---------------- 状态 ----------------
  function ensure(state) {
    if (!state || typeof state !== "object") return null;
    if (!state.story || typeof state.story !== "object") {
      state.story = { seen: [], cur: null, flags: {} };
    }
    const s = state.story;
    if (!Array.isArray(s.seen)) s.seen = [];
    if (!s.flags || typeof s.flags !== "object") s.flags = {};
    if (s.cur === undefined) s.cur = null;
    return s;
  }

  function hasActive(state) {
    const s = ensure(state);
    return !!(s && s.cur && byId(s.cur.sceneId));
  }

  // ---------------- 播放 ----------------
  function start(state, sceneId) {
    const s = ensure(state);
    if (!s) return { ok: false, err: "状态无效" };
    const sc = byId(sceneId);
    if (!sc) return { ok: false, err: "场景不存在：" + sceneId };
    if (!Array.isArray(sc.lines) || !sc.lines.length) return { ok: false, err: "场景没有台词：" + sceneId };
    s.cur = { sceneId: sc.id, i: 0 };
    return { ok: true, scene: sc };
  }

  function current(state) {
    const s = ensure(state);
    if (!s || !s.cur) return null;
    const sc = byId(s.cur.sceneId);
    if (!sc || !Array.isArray(sc.lines) || !sc.lines.length) { s.cur = null; return null; }
    const total = sc.lines.length;
    let i = Number(s.cur.i) || 0;
    if (i < 0) i = 0;
    if (i > total - 1) i = total - 1;
    s.cur.i = i;
    return { scene: sc, line: sc.lines[i], index: i, total: total };
  }

  function markSeen(state, sceneId) {
    const s = ensure(state);
    if (!s || !sceneId) return;
    if (s.seen.indexOf(sceneId) < 0) s.seen.push(sceneId);
  }

  function finish(state, scene) {
    const s = ensure(state);
    if (!s) return;
    markSeen(state, scene && scene.id);
    s.cur = null;
  }

  function advance(state) {
    const c = current(state);
    if (!c) return { ok: false, err: "没有正在播放的剧情" };
    const line = c.line || {};
    if (Array.isArray(line.choices) && line.choices.length) {
      return { ok: false, err: "need-choice" };
    }
    if (c.index + 1 < c.total) {
      const s = ensure(state);
      s.cur.i = c.index + 1;
      return { ok: true, done: false, index: c.index + 1 };
    }
    finish(state, c.scene);
    return { ok: true, done: true, ended: c.scene.id };
  }

  // ---------------- 效果结算 ----------------
  function applyEffect(state, ef) {
    if (!ef || !state) return;
    if (ef.delta && typeof ef.delta === "object") {
      if (!state.res) state.res = {};
      for (const k in ef.delta) {
        const v = Number(ef.delta[k]) || 0;
        if (!v) continue;
        state.res[k] = Math.max(0, (Number(state.res[k]) || 0) + v);
      }
    }
    if (Array.isArray(ef.special) && ef.special.length) applySpecial(state, ef.special);
    if (ef.flag) {
      const s = ensure(state);
      if (s) s.flags[String(ef.flag)] = true;
    }
  }

  // 引擎级特殊效果（剧情奖励里引用游戏系统，而非单纯资源增减）：
  //   factionRep  某势力关系值 +n（state.factions[].relation，封顶 100，与势力引擎一致）
  //   addMembers  随机招募 n 名初始团员（名册 < 20 时；调用 Engine.State.recruitMember）
  //   learnTech   暂记 flag，待科技树系统建成后接（state.story.flags.learnedTech_<tech>）
  // 注意：addMembers 依赖浏览器全局 NSK.Engine.State / NSK.Data / NSK.Core；
  //       Node 单测环境无这些依赖时安全 no-op（不抛错），由测试自行桩入验证。
  function applySpecial(state, special) {
    if (!state) return;
    const w = win();
    const S = w && w.NSK && w.NSK.Engine && w.NSK.Engine.State;
    const D = w && w.NSK && w.NSK.Data;
    const C = w && w.NSK && w.NSK.Core;
    for (const a of special) {
      if (!a || typeof a !== "object") continue;
      if (a.type === "factionRep") {
        const fid = a.faction || "federation";
        const f = state.factions && state.factions.find(x => x.id === fid);
        if (f) f.relation = Math.min(100, (Number(f.relation) || 0) + (Number(a.amount) || 0));
      } else if (a.type === "addMembers") {
        const n = Number(a.count) || 0;
        if (S && S.recruitMember && D && C) {
          for (let i = 0; i < n; i++) {
            const rng = C.makeRng((state.rngSeed ^ (Date.now() >>> 0) ^ Math.floor(Math.random() * 4294967296)) >>> 0);
            S.recruitMember(state, D, rng);
          }
        }
      } else if (a.type === "learnTech") {
        const s = ensure(state);
        if (s) s.flags["learnedTech_" + (a.tech || "unknown")] = true;
      }
    }
  }

  function choose(state, idx) {
    const c = current(state);
    if (!c) return { ok: false, err: "没有正在播放的剧情" };
    const list = (c.line && Array.isArray(c.line.choices)) ? c.line.choices : [];
    const n = parseInt(idx, 10);
    const ch = list[n];
    if (!ch) return { ok: false, err: "选项不存在" };
    if (ch.effect) applyEffect(state, ch.effect);
    if (ch.next) {
      const nx = byId(ch.next);
      if (nx && Array.isArray(nx.lines) && nx.lines.length) {
        const s = ensure(state);
        // 选了跳转分支 = 本场景已经播到离开点，按「已看」记（否则回列表还会显示「播放」）
        markSeen(state, c.scene.id);
        s.cur = { sceneId: nx.id, i: 0 };
        return { ok: true, next: nx.id, label: ch.label, effect: ch.effect || null };
      }
    }
    finish(state, c.scene);
    return { ok: true, done: true, label: ch.label, effect: ch.effect || null };
  }

  // ---------------- 自动/列表 ----------------
  function autoStart(state) {
    const s = ensure(state);
    if (!s) return { started: false };
    if (s.cur) return { started: false, reason: "playing" };
    const list = scenes();
    for (let i = 0; i < list.length; i++) {
      const sc = list[i];
      if (!sc || sc.trigger !== "firstBoot") continue;
      if (s.seen.indexOf(sc.id) >= 0) continue;
      const r = start(state, sc.id);
      return r.ok ? { started: true, sceneId: sc.id } : { started: false };
    }
    return { started: false };
  }

  // 页签清单：隐藏场景不出现；可播放 = 已看过 或 有 firstBoot 且未看
  function list(state) {
    const s = ensure(state);
    const seen = (s && s.seen) || [];
    return scenes()
      .filter(sc => sc && sc.id && !sc.hidden)
      .map(sc => ({
        id: sc.id,
        title: sc.title || sc.id,
        note: sc.note || "",
        total: Array.isArray(sc.lines) ? sc.lines.length : 0,
        seen: seen.indexOf(sc.id) >= 0,
        auto: sc.trigger === "firstBoot",
      }));
  }

  function resetProgress(state) {
    const s = ensure(state);
    if (!s) return;
    s.seen = [];
    s.cur = null;
    s.flags = {};
  }

  return {
    PORTRAIT_ROOT,
    ensure, data, scenes, byId, speakers, speakerOf,
    resolveAvatar, clearAvatarCache, avatarOf,
    start, current, advance, choose, finish, markSeen, applyEffect,
    autoStart, list, hasActive, resetProgress,
  };
});
