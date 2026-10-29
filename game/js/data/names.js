// ================================================================
// 深空星疆 —— Data.Names：成员名生成（中文姓+名，确定性）
// 每个 NPC 是一个类玩家自主体；无评级（§13，多技能字典）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Data = window.NSK.Data || {};
    window.NSK.Data.Names = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Data = root.NSK.Data || {};
    root.NSK.Data.Names = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SUR = ["林", "沈", "江", "顾", "谢", "萧", "楚", "苏", "陆", "卫", "叶", "裴", "宋", "韩", "云", "程"];
  const GIVEN = ["昭", "砚", "澈", "屿", "曜", "姚", "妧", "翎", "骁", "澜", "骁", "霁", "珩", "晏", "聿", "珞", "湛", "骁", "宁", "昀"];

  function makeName(rng) {
    const s = SUR[Math.floor(rng() * SUR.length)];
    const g1 = GIVEN[Math.floor(rng() * GIVEN.length)];
    const g2 = rng() > 0.4 ? GIVEN[Math.floor(rng() * GIVEN.length)] : "";
    return s + g1 + g2;
  }

  // 12 性格（仅文案，不参与数值，自研文案）
  const PERSONALITIES = [
    { id: "stoic",   name: "沉静", line: "任务结束前，我不会多说一句话。" },
    { id: "eager",   name: "热忱", line: "又有活干了？太好了。" },
    { id: "grumpy",  name: "冷面", line: "别在我校准火控的时候说话。" },
    { id: "witty",   name: "机敏", line: "这星系的风景，抵得上三倍佣金。" },
    { id: "loyal",   name: "笃忠", line: "军团在哪，我就在哪。" },
    { id: "reckless",name: "莽撞", line: "冲就完了，分析留给别人。" },
    { id: "calm",    name: "持重", line: "先观望，再决策。" },
    { id: "ambitious",name: "野心", line: "我要的不是星币，是名号。" },
    { id: "kind",    name: "温厚", line: "新兵犯错，我替他扛。" },
    { id: "cynical", name: "讥诮", line: "又一个会画饼的老板。" },
    { id: "brave",   name: "无畏", line: "炮口对准哪里，我就去哪里。" },
    { id: "quiet",   name: "缄默", line: "……（点头）" },
  ];
  function personalityById(id) { return PERSONALITIES.find(p => p.id === id) || PERSONALITIES[0]; }

  return { makeName, PERSONALITIES, personalityById };
});
