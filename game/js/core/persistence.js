/* ================================================================
   存档管理器（SaveManager）—— 深空星疆

   仿 EVE-IDLE 的 persistence 层（去 EVE 字面），作为「单一存档入口」统管：
   - 本地存档：Core.Store（NSK2 轻混淆 + 摘要）。
   - 云存档：CloudSaveService + Provider（TapTap / 未来 Steam 契约位）。
   - 存档码：NSK1.（混淆）/ NSK1P.（明文）自校验信封，可复制粘贴互传。
   - 文件导出 / 导入：信封 JSON（含 checksum，自校验）。
   - 启动三方冲突决策（本地 / 云端 / lastCloud 基线），冲突交 UI 手动选。

   设计纪律（与 EVE-IDLE 对齐）：
   - 任何云错误绝不清空本地档；fail-closed。
   - 冲突检测只用摘要判等，绝不靠时间戳猜测「谁更新」。
   - 上传频控 / 并发锁在 CloudSaveService 内部，本层只负责触发 markDirty + maybeUpload。
   - revision 仅在真实保存成功后由 CloudSaveService 内部递增；本层信封 revision 仅作快照序号。
   ================================================================ */
(function (root) {
  "use strict";

  const Core = (typeof window !== "undefined" && window.NSK && window.NSK.Core) ? window.NSK.Core : (root.NSK && root.NSK.Core) || {};
  const Store = Core; // 别名：Core.Store 的 save/load/normalize/decodeLocalSave
  const Envelope = (typeof SaveEnvelope !== "undefined") ? SaveEnvelope
    : (root.SaveEnvelope || (Core && Core.SaveEnvelope) || null);
  const CloudSaveService = (typeof window !== "undefined" && window.CloudSaveService) ? window.CloudSaveService
    : (root.CloudSaveService || (Core && Core.CloudSaveService) || null);
  const Contract = (typeof CloudSaveContract !== "undefined") ? CloudSaveContract
    : (root.CloudSaveContract || (Core && Core.CloudSaveContract) || null);
  const Codec = (Core && Core.Codec) ? Core.Codec
    : ((typeof window !== "undefined" && window.NSK && window.NSK.Core && window.NSK.Core.Codec) ? window.NSK.Core.Codec : null);
  const createCloudProvider = (Core && Core.createCloudProvider) ? Core.createCloudProvider
    : ((root.NSK && root.NSK.Core && root.NSK.Core.createCloudProvider) || null);

  const LOCAL_SAVE_PREFIX = (Store && Store.LOCAL_SAVE_PREFIX) || "NSK2.";
  const SAVE_CODE_PREFIX = "NSK1.";
  const SAVE_CODE_PLAIN_PREFIX = "NSK1P.";
  // 存档码混淆掩码（与 NSK2 不同前缀/掩码，互不串用）
  const SAVE_CODE_MASK = "shenkong-xingjiang-share-v1";
  const SYNC_META_KEY = "nsk_sync_meta_v1";
  const DEVICE_ID_KEY = "nsk_device_id";

  // ---------- 设备 ID（顶层，绝不进入 gameState） ----------
  function getDeviceId() {
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem) {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
          id = "dev-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
          localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
      }
    } catch (e) { /* 忽略 */ }
    return "dev-fallback-" + Math.random().toString(36).slice(2);
  }

  // ---------- 同步元数据存储器（localStorage 适配） ----------
  const metaStore = {
    load: function () {
      try {
        if (typeof localStorage === "undefined" || !localStorage.getItem) return null;
        const raw = localStorage.getItem(SYNC_META_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    save: function (obj) {
      try {
        if (typeof localStorage !== "undefined" && localStorage.setItem) {
          localStorage.setItem(SYNC_META_KEY, JSON.stringify(obj));
          return true;
        }
      } catch (e) { /* 非致命 */ }
      return false;
    }
  };

  // ---------- 存档码编解码 ----------
  function _xorBytes(bytes, mask) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ mask.charCodeAt(i % mask.length) ^ (i & 0xff);
    return out;
  }

  function encodeSaveCode(state, plain) {
    if (!Envelope) throw new Error("存档信封模块未加载");
    const env = Envelope.create({
      payload: state,
      revision: Math.max(1, Persistence._rev || 1),
      deviceId: Persistence.deviceId || "",
      savedAt: Date.now(),
      gameSaveVersion: (Envelope.GAME_SAVE_SCHEMA_VERSION || 1)
    });
    const json = JSON.stringify(env);
    const bytes = Codec.utf8Encode(json);
    if (plain) {
      return SAVE_CODE_PLAIN_PREFIX + Codec.bytesToBase64Url(bytes);
    }
    return SAVE_CODE_PREFIX + Codec.bytesToBase64Url(_xorBytes(bytes, SAVE_CODE_MASK));
  }

  function decodeSaveCode(text, plain) {
    const prefix = plain ? SAVE_CODE_PLAIN_PREFIX : SAVE_CODE_PREFIX;
    const body = String(text || "").trim().slice(prefix.length);
    if (!body) throw new Error("存档码内容为空");
    let bytes = Codec.base64UrlToBytes(body);
    if (!plain) bytes = _xorBytes(bytes, SAVE_CODE_MASK);
    const json = Codec.utf8Decode(bytes);
    return Envelope.decode(json).payload; // 信封自校验，失败抛错
  }

  // 统一解析外部存档文本：NSK1. / NSK1P. / NSK2. / 信封JSON / 裸 state JSON
  function importFromText(text) {
    text = String(text || "").trim();
    if (!text) throw new Error("存档内容为空");
    try {
      if (text.indexOf(SAVE_CODE_PREFIX) === 0) return decodeSaveCode(text, false);
      if (text.indexOf(SAVE_CODE_PLAIN_PREFIX) === 0) return decodeSaveCode(text, true);
      if (text.indexOf(LOCAL_SAVE_PREFIX) === 0) return Store.decodeLocalSave(text); // 旧本地明文也会在此分支的 JSON.parse 兜底
      const obj = JSON.parse(text);
      if (Envelope && Envelope.isEnvelope(obj)) return Envelope.decode(text).payload;
      return obj; // 裸 state
    } catch (e) {
      // 兜底：试着当旧版明文 JSON 直接解析（不带任何前缀）
      try {
        if (text.charAt(0) === "{" || text.charAt(0) === "[") {
          const obj = JSON.parse(text);
          if (Envelope && Envelope.isEnvelope(obj)) return Envelope.decode(text).payload;
          return obj;
        }
      } catch (e2) { /* 忽略 */ }
      throw new Error("存档格式无法识别或已损坏：" + (e && e.message ? e.message : e));
    }
  }

  // 文件导出文本（信封 JSON，自校验）
  function exportFileText(state) {
    if (!Envelope) throw new Error("存档信封模块未加载");
    const env = Envelope.create({
      payload: state,
      revision: Math.max(1, Persistence._rev || 1),
      deviceId: Persistence.deviceId || "",
      savedAt: Date.now(),
      gameSaveVersion: (Envelope.GAME_SAVE_SCHEMA_VERSION || 1)
    });
    return JSON.stringify(env, null, 2);
  }

  // ---------- 冲突暂存 ----------
  const Pending = { payload: null, meta: null };

  // ---------- 主管理器 ----------
  const Persistence = {
    state: null,
    cloud: null,
    deviceId: "",
    _rev: 1,
    _pending: Pending,

    // 启动：本地加载 → 云初始化 → 三方决策 → 返回结果（可能含冲突待选）
    bootstrap: function (opts) {
      opts = opts || {};
      const self = this;
      self.deviceId = getDeviceId();
      return Promise.resolve().then(function () {
        let local = null;
        try { local = Store.load(); } catch (e) { local = null; }

        const provider = (typeof createCloudProvider === "function") ? createCloudProvider() : null;
        self.cloud = (typeof CloudSaveService === "function")
          ? new CloudSaveService({
              provider: provider,
              deviceId: self.deviceId,
              metaStore: metaStore,
              gameSaveVersion: (Envelope && Envelope.GAME_SAVE_SCHEMA_VERSION) || 1
            })
          : null;

        let cloudAvail = false;
        if (self.cloud) {
          try { cloudAvail = !!(self.cloud.init && self.cloud.init()); } catch (e) { cloudAvail = false; }
          if (cloudAvail && self.cloud.init && self.cloud.init.length <= 0) {
            // init 同步返回（极少）：已是布尔；否则下面 await 兜底
          }
        }

        const finish = function (avail) {
          cloudAvail = avail;
          const result = { state: local, needsChoice: false, cloudAvailable: cloudAvail, cloudState: self.cloud ? self.cloud.status() : { available: false }, conflict: null };

          if (cloudAvail && self.cloud) {
            return Promise.resolve(self.cloud.fetchCloudEnvelope({ timeoutMs: 15000 })).then(function (c) {
              const hasLocal = !!local;
              const hasCloud = c.status === "ok";
              const localChecksum = hasLocal ? Envelope.checksum(local) : "";
              const cloudChecksum = (c.status === "ok") ? c.envelope.checksum : "";
              const lastCloud = self.cloud.getSyncMeta().lastCloudChecksum;
              const decision = self.cloud.decideResolution({
                hasLocal: hasLocal, hasCloud: hasCloud,
                localChecksum: localChecksum, cloudChecksum: cloudChecksum, lastCloudChecksum: lastCloud
              });

              if (decision.decision === "use-cloud") {
                local = Core.normalize ? Core.normalize(c.envelope.payload) : c.envelope.payload;
                Store.save(local);
                self.cloud.recordLocal(cloudChecksum, Date.now());
                self.cloud.recordCloudBaseline(c.envelope.checksum, c.meta.archiveId);
                result.state = local;
              } else if (decision.decision === "conflict") {
                self._pending.payload = Core.normalize ? Core.normalize(c.envelope.payload) : c.envelope.payload;
                self._pending.meta = {
                  checksum: c.envelope.checksum,
                  archiveId: c.meta.archiveId,
                  savedAt: c.envelope.savedAt
                };
                result.needsChoice = true;
                result.conflict = {
                  localSavedAt: local && typeof local.lastSeen === "number" ? local.lastSeen : 0,
                  cloudSavedAt: c.envelope.savedAt || 0
                };
                result.state = local; // 暂保留本地
              } else {
                // new / use-local / identical → 保留本地
                result.state = local;
              }
              result.cloudState = self.cloud.status();
              return finalize(result);
            }).catch(function () {
              result.cloudState = self.cloud ? self.cloud.status() : { available: false };
              return finalize(result);
            });
          }
          return finalize(result);
        };

        function finalize(result) {
          if (!result.state) {
            const Engine = (typeof window !== "undefined" && window.NSK && window.NSK.Engine) ? window.NSK.Engine : null;
            const Data = (typeof window !== "undefined" && window.NSK && window.NSK.Data) ? window.NSK.Data : null;
            if (Engine && Engine.State && Engine.State.defaultState) {
              result.state = Engine.State.defaultState(opts.now || Date.now(), Data);
              Store.save(result.state);
              if (cloudAvail && self.cloud) {
                self.cloud.recordLocal(Envelope.checksum(result.state), Date.now());
                self.cloud.markDirty();
                self.cloud.maybeUpload(result.state);
              }
            }
          }
          self.state = result.state;
          self._rev = Math.max(1, (self.cloud && self.cloud.getSyncMeta && self.cloud.getSyncMeta().localRevision) || 1);
          return result;
        }

        // init 可能是异步（TapTap）或同步（Noop 返回 Promise.resolve(false)）
        if (self.cloud && self.cloud.init) {
          return Promise.resolve(self.cloud.init()).then(finish).catch(function () { return finish(false); });
        }
        return finish(cloudAvail);
      });
    },

    // 冲突解决：choice = 'local' | 'cloud'
    resolveConflict: function (choice) {
      const self = this;
      if (choice === "cloud" && self._pending.payload) {
        const st = self._pending.payload;
        self.state = st;
        Store.save(st);
        if (self.cloud && self.cloud.isAvailable()) {
          const cs = Envelope.checksum(st);
          self.cloud.recordLocal(cs, Date.now());
          if (self._pending.meta) self.cloud.recordCloudBaseline(self._pending.meta.checksum, self._pending.meta.archiveId);
          self.cloud.markDirty();
          self.cloud.maybeUpload(st);
        }
        self._pending.payload = null; self._pending.meta = null;
        return Promise.resolve(st);
      }
      // 'local'：保留当前本地，并把本地推上云以建立基线
      if (self.cloud && self.cloud.isAvailable() && self._pending.payload) {
        const cs = Envelope.checksum(self.state);
        self.cloud.recordLocal(cs, Date.now());
        self.cloud.markDirty();
        self.cloud.maybeUpload(self.state);
      }
      self._pending.payload = null; self._pending.meta = null;
      return Promise.resolve(self.state);
    },

    // 常规保存：写本地 NSK2 + 标记云脏
    save: function (state) {
      this.state = state || this.state;
      if (!this.state) return false;
      try { Store.save(this.state); } catch (e) { return false; }
      this._rev += 1;
      if (this.cloud && this.cloud.isAvailable()) {
        try {
          const cs = Envelope.checksum(this.state);
          this.cloud.recordLocal(cs, Date.now());
          this.cloud.markDirty();
          this.cloud.maybeUpload(this.state);
        } catch (e) { /* 云失败不影响本地 */ }
      }
      return true;
    },

    load: function () { return Store.load(); },
    wipe: function () { Store.wipe(); },

    // 删除：清本地 + 删云端
    deleteSave: function () {
      const self = this;
      Store.wipe();
      self.state = null;
      self._pending.payload = null; self._pending.meta = null;
      if (self.cloud && self.cloud.isAvailable() && typeof self.cloud.deleteCloud === "function") {
        return Promise.resolve(self.cloud.deleteCloud()).catch(function () { /* 云端删除失败不致命 */ });
      }
      return Promise.resolve(true);
    },

    getCloudStatus: function () {
      return this.cloud ? this.cloud.status() : { available: false, state: "local-only" };
    },

    exportCode: function (plain) { return encodeSaveCode(this.state, !!plain); },
    exportFileText: function () { return exportFileText(this.state); },
    importFromText: function (text) {
      const st = importFromText(text);
      return Core.normalize ? Core.normalize(st) : st;
    }
  };

  const api = Persistence;
  if (typeof window !== "undefined") window.Persistence = api;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Core = window.NSK.Core || {};
    window.NSK.Core.Persistence = api;
  }
  root.NSK = root.NSK || {};
  root.NSK.Core = root.NSK.Core || {};
  root.NSK.Core.Persistence = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
