// ================================================================
// 深空星疆 —— Core.Storage：存储后端抽象（浏览器 localStorage / TapTap 沙盒 / 内存兜底）
// ----------------------------------------------------------------
// 为什么需要这层：
//   · 普通浏览器 / file:// → localStorage 可用，直接读写（旧行为）。
//   · TapTap 小游戏沙盒 → 沙盒里**没有 localStorage**，官方给的是：
//       - 本地缓存：tap.setStorage / tap.getStorage（单 key ≤1MB，总量 ≤10MB，可 encrypt）
//       - 本地文件：tap.getFileSystemManager() + tapfile://usr（tap.env.USER_DATA_PATH）
//       - 云存档：tap.getCloudSaveManager()（createArchive/updateArchive/getArchiveList/
//                 getArchiveData/deleteArchive；单档 ≤10MB、每分钟最多上传 1 次）
//     不接这层 → 沙盒里 hasLocal() 恒 false，每次启动都是新档。
//   · 两者都没有（Node 探针 / 极端环境）→ 内存兜底：本会话内可读写，刷新即丢。
//
// 接口设计（同步 get 的前提）：
//   TapTap 的 getStorage 是异步的，而 Core.load() 是同步的。
//   故启动时先 await preload(key) 把存档读进内存镜像，之后 getItem 直接读镜像（同步）。
//   写入走 write-through：先更新镜像，再异步 tap.setStorage（失败只记录，不阻塞）。
// ================================================================
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Core = window.NSK.Core || {};
    window.NSK.Core.Storage = mod;
  } else if (root) {
    root.NSK = root.NSK || {};
    root.NSK.Core = root.NSK.Core || {};
    root.NSK.Core.Storage = mod;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const mem = Object.create(null);   // 内存镜像（tap / memory 后端共用）
  let backendName = null;            // "localStorage" | "tap" | "memory"
  let lastError = null;
  let preloaded = false;

  function tapObj() {
    try {
      if (typeof tap !== "undefined" && tap) return tap;
      if (typeof window !== "undefined" && window.tap) return window.tap;
    } catch (e) { /* ignore */ }
    return null;
  }
  function hasLS() {
    try { return typeof localStorage !== "undefined" && !!localStorage.getItem; } catch (e) { return false; }
  }
  function hasTap() {
    const t = tapObj();
    return !!(t && typeof t.setStorage === "function" && typeof t.getStorage === "function");
  }
  function detect() {
    if (hasLS()) return "localStorage";
    if (hasTap()) return "tap";
    return "memory";
  }
  function backend() {
    if (!backendName) backendName = detect();
    return backendName;
  }
  function backendLabel() {
    return backend() === "localStorage" ? "浏览器 localStorage"
      : backend() === "tap" ? "TapTap 本地缓存（tap.setStorage）"
      : "内存（仅本次会话，刷新即丢）";
  }
  function status() {
    return {
      backend: backend(),
      label: backendLabel(),
      preloaded: preloaded,
      lastError: lastError,
      bytes: (function () { let n = 0; for (const k in mem) n += String(mem[k] || "").length; return n; })(),
    };
  }

  // 启动预载：把指定 key 读进内存镜像（tap 后端必需；localStorage 直接可用，无需预载）
  function preload(key) {
    backendName = detect();
    if (backendName !== "tap") { preloaded = true; return Promise.resolve(backendName); }
    return new Promise(function (resolve) {
      let done = false;
      const finish = function () { if (!done) { done = true; preloaded = true; resolve(backendName); } };
      try {
        tapObj().getStorage({
          key: key,
          success: function (res) {
            if (res && res.data != null && res.data !== "") mem[key] = String(res.data);
            finish();
          },
          fail: function (e) { lastError = e || "tap.getStorage fail"; finish(); },
        });
      } catch (e) { lastError = e; finish(); }
      setTimeout(finish, 3000); // 兜底：不让存储层卡住启动
    });
  }

  function getItem(key) {
    const b = backend();
    if (b === "localStorage") {
      try { return localStorage.getItem(key); } catch (e) { lastError = e; return null; }
    }
    return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
  }

  function setItem(key, value) {
    const v = String(value == null ? "" : value);
    const b = backend();
    if (b === "localStorage") {
      try { localStorage.setItem(key, v); return true; } catch (e) { lastError = e; return false; }
    }
    mem[key] = v;
    const t = tapObj();
    if (b === "tap" && t && typeof t.setStorage === "function") {
      try {
        t.setStorage({
          key: key,
          data: v,
          success: function () { lastError = null; },
          fail: function (e) { lastError = e || "tap.setStorage fail"; },
        });
      } catch (e) { lastError = e; }
    }
    return true; // 至少内存镜像成功
  }

  function removeItem(key) {
    const b = backend();
    delete mem[key];
    if (b === "localStorage") {
      try { localStorage.removeItem(key); return true; } catch (e) { lastError = e; return false; }
    }
    const t = tapObj();
    if (b === "tap" && t) {
      try {
        if (typeof t.removeStorage === "function") {
          t.removeStorage({ key: key, fail: function (e) { lastError = e || "tap.removeStorage fail"; } });
        } else if (typeof t.setStorage === "function") {
          t.setStorage({ key: key, data: "" }); // 退路：置空
        }
      } catch (e) { lastError = e; }
    }
    return true;
  }

  // 仅内存镜像读写（导出/诊断用，不落盘）
  function peek(key) { return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; }

  // 测试/环境切换用：清空缓存并重新探测后端
  function reset() {
    for (const k in mem) delete mem[k];
    backendName = null;
    preloaded = false;
    lastError = null;
  }

  return { backend, backendLabel, status, preload, getItem, setItem, removeItem, peek, detect, reset };
});
