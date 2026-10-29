/* ================================================================
   CloudSaveService — 平台无关的云存档同步状态机 —— 深空星疆版本

   仿 EVE-IDLE cloud-save-service，解耦平台字面。

   职责：
   - 持有统一 CloudSaveProvider，封装列表 / 下载 / 上传 / 删除。
   - 冲突判断（decideResolution）：依据本地、云端、上次云端 checksum 三方关系决策。
   - 上传频控：create/update 共用 60 秒严格门禁（dirty + debounce）。
   - 并发：同一时刻只允许一个 create/update/download 操作。
   - 错误分类与有限退避；任何错误都不得清空本地档。
   - 本地存档仍由 Store 负责；本服务只管“云”与“同步元数据”。

   本地同步元数据（sync_meta）结构（由 Persistence 持久化，与本地存档分离）：
   {
     deviceId, localRevision, localSavedAt, localChecksum,
     lastCloudChecksum, lastCloudArchiveId, lastSuccessfulSyncAt
   }
   ================================================================ */
(function (root) {
  "use strict";

  const Contract = (typeof CloudSaveContract !== "undefined") ? CloudSaveContract
    : (root.CloudSaveContract || { AUTO_SAVE_SLOT: "auto_save", CLOUD_UPLOAD_INTERVAL_MS: 60000 });
  const Envelope = (typeof SaveEnvelope !== "undefined") ? SaveEnvelope
    : (root.SaveEnvelope || null);

  // 默认内存元数据存储器（测试 / 无注入时使用）。生产由 Persistence 注入 localStorage 实现。
  function InMemoryMetaStore() {
    this._data = null;
  }
  InMemoryMetaStore.prototype.load = function () { return this._data; };
  InMemoryMetaStore.prototype.save = function (obj) { this._data = obj; return true; };

  function CloudSaveService(opts) {
    opts = opts || {};
    this.provider = opts.provider || null;
    this.deviceId = opts.deviceId || "";
    this.metaStore = opts.metaStore || new InMemoryMetaStore();
    this.slotName = Contract.AUTO_SAVE_SLOT;
    this._uploadGateMs = Contract.CLOUD_UPLOAD_INTERVAL_MS;
    this._available = false;
    this._busy = false;        // 并发锁：同一时刻仅一个云操作
    this._dirty = false;       // 本地有未同步变更
    this._dirtyVersion = 0;    // saves occurring during an upload must remain dirty
    this._pendingSummary = null;
    this._lastUploadAt = 0;    // 最近一次“发起”上传的时刻（门禁基准）
    this._lastError = null;
    this._cloudArchiveMeta = null;
    this._cloudRevision = 0;
    this._syncMeta = this._emptyMeta();
    this._state = "idle";      // idle | uploading | conflict | error | local-only
    this._gameSaveVersion = (typeof opts.gameSaveVersion === "number") ? opts.gameSaveVersion : 1;
  }

  CloudSaveService.prototype._emptyMeta = function () {
    return {
      deviceId: this.deviceId || "",
      localRevision: 0,
      localSavedAt: 0,
      localChecksum: "",
      lastCloudChecksum: "",
      lastCloudArchiveId: "",
      lastSuccessfulSyncAt: 0
    };
  };

  // 只存 64 位摘要（16 hex），绝不存整份校验和（避免 sync_meta 体积 ≈ 2× 存档本体）。
  // 三方比对（local / cloud / lastCloud）统一先归一化为摘要，语义完全等价（只判等）。
  // 摘要函数对「已是本摘要格式」的输入幂等返回自身，旧档（含全量串）读取/比较时无损迁移。
  const CHECKSUM_DIGEST_RE = /^[0-9a-f]{16}$/;
  CloudSaveService.checksumDigest = function (value) {
    if (typeof value !== "string" || !value) return "";
    if (CHECKSUM_DIGEST_RE.test(value)) return value; // 幂等：已经是摘要
    let h1 = 0x811c9dc5 >>> 0; // FNV-1a offset basis
    let h2 = 0x9e3779b9 >>> 0; // 独立种子 + 位置扰动，避免同长度不同内容撞车
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
      h2 = (h2 + (i & 0xff)) >>> 0;
    }
    const hex8 = function (n) { return ("0000000" + n.toString(16)).slice(-8); };
    return hex8(h1) + hex8(h2);
  };

  CloudSaveService.prototype._needsChecksumMigration = function (raw) {
    if (!raw || typeof raw !== "object") return false;
    const long = function (v) { return typeof v === "string" && v.length > 16; };
    return long(raw.localChecksum) || long(raw.lastCloudChecksum);
  };

  CloudSaveService.prototype.init = function () {
    const self = this;
    const rawMeta = this.metaStore.load();
    this._syncMeta = this._mergeMeta(rawMeta);
    if (this._needsChecksumMigration(rawMeta)) this._persistMeta();
    if (this.provider && typeof this.provider.initialize === "function") {
      return Promise.resolve(this.provider.initialize()).then(function (ok) {
        self._available = !!(self.provider && self.provider.isAvailable && self.provider.isAvailable());
        self._state = self._available ? "idle" : "local-only";
        return self._available;
      }).catch(function () {
        self._available = false;
        self._state = "local-only";
        return false;
      });
    }
    self._available = false;
    self._state = "local-only";
    return Promise.resolve(false);
  };

  CloudSaveService.prototype._mergeMeta = function (raw) {
    const base = this._emptyMeta();
    if (!raw || typeof raw !== "object") return base;
    if (typeof raw.deviceId === "string") base.deviceId = raw.deviceId;
    if (typeof raw.localRevision === "number") base.localRevision = raw.localRevision;
    if (typeof raw.localSavedAt === "number") base.localSavedAt = raw.localSavedAt;
    if (typeof raw.localChecksum === "string") base.localChecksum = CloudSaveService.checksumDigest(raw.localChecksum);
    if (typeof raw.lastCloudChecksum === "string") base.lastCloudChecksum = CloudSaveService.checksumDigest(raw.lastCloudChecksum);
    if (typeof raw.lastCloudArchiveId === "string") base.lastCloudArchiveId = raw.lastCloudArchiveId;
    if (typeof raw.lastSuccessfulSyncAt === "number") base.lastSuccessfulSyncAt = raw.lastSuccessfulSyncAt;
    return base;
  };

  CloudSaveService.prototype.isAvailable = function () { return this._available; };
  CloudSaveService.prototype.getState = function () { return this._state; };
  CloudSaveService.prototype.getLastError = function () { return this._lastError; };
  CloudSaveService.prototype.getSyncMeta = function () { return this._syncMeta; };
  CloudSaveService.prototype.setSyncMeta = function (meta) { this._syncMeta = this._mergeMeta(meta); return this._syncMeta; };
  CloudSaveService.prototype.getCloudArchiveMeta = function () { return this._cloudArchiveMeta; };

  CloudSaveService.prototype.status = function () {
    return {
      available: this._available,
      state: this._state,
      platform: (this.provider && this.provider.platform) || "none",
      lastSuccessfulSyncAt: this._syncMeta.lastSuccessfulSyncAt,
      lastCloudChecksum: this._syncMeta.lastCloudChecksum,
      lastCloudArchiveId: this._syncMeta.lastCloudArchiveId,
      dirty: this._dirty,
      busy: this._busy
    };
  };

  // 错误分类与有限退避。
  CloudSaveService.prototype._retryableCodes = { "400001": true, "400006": true, "400007": true, "400008": true };
  CloudSaveService.prototype._maxAttempts = 5;
  CloudSaveService.prototype._baseBackoffMs = 1000;
  CloudSaveService.prototype._sleep = function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };
  CloudSaveService.prototype._errorCode = function (err) {
    if (err && (typeof err.code === "string" || typeof err.code === "number")) return String(err.code);
    return "";
  };
  CloudSaveService.prototype._executeWithRetry = function (fn, label) {
    const self = this;
    label = label || "op";
    let attempt = 0;
    function run() {
      attempt += 1;
      return Promise.resolve(fn()).catch(function (err) {
        const code = self._errorCode(err);
        const retryable = !!self._retryableCodes[code];
        if (!retryable || attempt >= self._maxAttempts) throw err;
        let delay = self._baseBackoffMs * Math.pow(2, attempt - 1);
        if (code === "400001") delay = Math.max(delay, self._uploadGateMs);
        return self._sleep(delay).then(function () { return run(); });
      });
    }
    return run();
  };

  CloudSaveService.prototype.listCloudArchives = function () {
    if (!this._available || !this.provider) return Promise.resolve([]);
    return Promise.resolve(this.provider.listArchives());
  };

  // 查询并下载解码云端 auto_save，返回显式状态对象：
  //   { status:"none" } | { status:"ok", meta, envelope } | { status:"error", error }
  CloudSaveService.prototype.fetchCloudEnvelope = function (opts) {
    const self = this;
    if (!this._available || !this.provider) return Promise.resolve({ status: "none" });
    const DEFAULT_CLOUD_FETCH_TIMEOUT_MS = 15000;
    const requestedTimeout = opts && Number(opts.timeoutMs);
    const CLOUD_FETCH_TIMEOUT_MS = (requestedTimeout > 0) ? requestedTimeout : DEFAULT_CLOUD_FETCH_TIMEOUT_MS;
    const timeoutRace = function (promise, label) {
      return Promise.race([
        promise,
        new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error(label + " 超时未响应（" + CLOUD_FETCH_TIMEOUT_MS + "ms）")); }, CLOUD_FETCH_TIMEOUT_MS);
        })
      ]);
    };
    return timeoutRace(this._executeWithRetry(function () {
      return Promise.resolve(self.provider.listArchives());
    }, "listArchives"), "listArchives").then(function (archives) {
      const list = Array.isArray(archives) ? archives : [];
      const meta = list.filter(function (a) { return a && a.slotName === self.slotName; })[0] || null;
      if (!meta) {
        self._cloudArchiveMeta = null;
        self._state = "idle";
        self._lastError = null;
        return { status: "none" };
      }
      self._cloudArchiveMeta = meta;
      if (typeof meta.revision === "number") self._cloudRevision = meta.revision;
      return timeoutRace(self._executeWithRetry(function () {
        return Promise.resolve(self.provider.downloadArchive(meta));
      }, "downloadArchive"), "downloadArchive").then(function (envelope) {
        let parsed = null;
        try {
          parsed = (typeof envelope === "string") ? Envelope.decode(envelope) : Envelope.verify(envelope);
        } catch (e) {
          return { status: "error", error: e };
        }
        if (!parsed) return { status: "error", error: new Error("云端存档解码或校验失败") };
        if (typeof parsed.revision === "number") self._cloudRevision = parsed.revision;
        self._state = "idle";
        self._lastError = null;
        return { status: "ok", meta: meta, envelope: parsed };
      });
    }).catch(function (err) {
      self._lastError = err;
      self._state = "error";
      return { status: "error", error: err };
    });
  };

  // 冲突决策（纯函数）。ctx: { hasLocal, hasCloud, localChecksum, cloudChecksum, lastCloudChecksum }
  CloudSaveService.decideResolution = function (ctx) {
    const c = ctx || {};
    const hasLocal = !!c.hasLocal;
    const hasCloud = !!c.hasCloud;
    const localChecksum = CloudSaveService.checksumDigest(c.localChecksum);
    const cloudChecksum = CloudSaveService.checksumDigest(c.cloudChecksum);
    const lastCloudChecksum = CloudSaveService.checksumDigest(c.lastCloudChecksum);

    if (!hasLocal && !hasCloud) return { decision: "new" };
    if (hasLocal && !hasCloud) return { decision: "use-local" };
    if (!hasLocal && hasCloud) return { decision: "use-cloud" };

    if (localChecksum === cloudChecksum) return { decision: "identical" };
    if (cloudChecksum === lastCloudChecksum && localChecksum !== lastCloudChecksum) {
      return { decision: "use-local" }; // 只有本地变化
    }
    if (localChecksum === lastCloudChecksum && cloudChecksum !== lastCloudChecksum) {
      return { decision: "use-cloud" }; // 只有云端变化
    }
    return { decision: "conflict" }; // 双边都不等于 lastCloudChecksum → 真实冲突
  };

  CloudSaveService.prototype.decideResolution = CloudSaveService.decideResolution;

  CloudSaveService.prototype.markDirty = function (summary) {
    this._dirty = true;
    this._dirtyVersion += 1;
    if (summary) this._pendingSummary = summary;
  };

  CloudSaveService.prototype.maybeUpload = function (payload, summary) {
    if (!this._available || !this.provider) return Promise.resolve({ ok: false, reason: "unavailable" });
    if (!this._dirty) return Promise.resolve({ ok: true, reason: "clean" });
    const now = Date.now();
    if (this._busy) { this._dirty = true; this._pendingSummary = summary || this._pendingSummary; return Promise.resolve({ ok: false, reason: "concurrency" }); }
    if (now - this._lastUploadAt < this._uploadGateMs) { this._dirty = true; this._pendingSummary = summary || this._pendingSummary; return Promise.resolve({ ok: false, reason: "rate-limited" }); }
    return this.uploadNow(payload, summary);
  };

  CloudSaveService.prototype.uploadNow = function (payload, summary) {
    const self = this;
    if (!this._available || !this.provider) return Promise.resolve({ ok: false, reason: "unavailable" });
    if (this._busy) return Promise.resolve({ ok: false, reason: "concurrency" });
    this._busy = true;
    const uploadDirtyVersion = this._dirtyVersion;
    this._state = "uploading";
    this._lastUploadAt = Date.now();
    // 入口先 JSON 快照（值拷贝），checksum 与序列化基于同一冻结对象，避免重试期间活引用漂移。
    try { payload = JSON.parse(JSON.stringify(payload)); } catch (e) { /* 保持原样，由 Envelope.create 抛错 */ }
    const revision = Math.max(this._syncMeta.localRevision || 0, this._cloudRevision || 0) + 1;
    const savedAt = Date.now();
    const envelope = Envelope.create({
      payload: payload,
      revision: revision,
      deviceId: this.deviceId,
      savedAt: savedAt,
      gameSaveVersion: this._gameSaveVersion
    });
    const doUpload = function () {
      return Promise.resolve(self.provider.uploadArchive({
        slotName: self.slotName,
        envelope: envelope,
        summary: summary || self._pendingSummary || ""
      }));
    };
    return this._executeWithRetry(doUpload, "uploadArchive")
      .then(function (resultMeta) {
        const meta = resultMeta || {};
        self._cloudArchiveMeta = meta;
        if (typeof meta.archiveId === "string") self._syncMeta.lastCloudArchiveId = meta.archiveId;
        self._syncMeta.lastCloudChecksum = CloudSaveService.checksumDigest(envelope.checksum);
        self._syncMeta.lastSuccessfulSyncAt = savedAt;
        self._cloudRevision = revision;
        self._dirty = self._dirtyVersion !== uploadDirtyVersion;
        self._state = "idle";
        self._lastError = null;
        self._busy = false;
        self._persistMeta();
        return { ok: true, meta: meta, envelope: envelope };
      })
      .catch(function (err) {
        self._lastError = err;
        self._state = "error";
        self._dirty = true;
        self._busy = false;
        return { ok: false, reason: (err && err.code) || "error", error: err };
      });
  };

  CloudSaveService.prototype._persistMeta = function () {
    try {
      if (this.metaStore && typeof this.metaStore.save === "function") this.metaStore.save(this._syncMeta);
    } catch (e) { /* 元数据持久化失败不致命 */ }
  };

  CloudSaveService.prototype.recordLocal = function (localChecksum, savedAt, revision) {
    if (typeof localChecksum === "string") this._syncMeta.localChecksum = CloudSaveService.checksumDigest(localChecksum);
    if (typeof savedAt === "number") this._syncMeta.localSavedAt = savedAt;
    if (typeof revision === "number") this._syncMeta.localRevision = revision;
    if (this.deviceId && !this._syncMeta.deviceId) this._syncMeta.deviceId = this.deviceId;
    this._persistMeta();
  };

  CloudSaveService.prototype.recordCloudBaseline = function (checksum, archiveId) {
    if (typeof checksum === "string") this._syncMeta.lastCloudChecksum = CloudSaveService.checksumDigest(checksum);
    if (typeof archiveId === "string") this._syncMeta.lastCloudArchiveId = archiveId;
    this._persistMeta();
    return this._syncMeta;
  };

  CloudSaveService.prototype.deleteCloud = function () {
    const self = this;
    if (!this._available || !this.provider) return Promise.reject(new Error("云端不可用，无法删除"));
    const meta = this._cloudArchiveMeta;
    if (!meta) return Promise.reject(new Error("没有可删除的云端存档"));
    return Promise.resolve(this.provider.deleteArchive(meta)).then(function () {
      self._cloudArchiveMeta = null;
      self._cloudRevision = 0;
      self._syncMeta.lastCloudChecksum = "";
      self._syncMeta.lastCloudArchiveId = "";
      self._persistMeta();
      return true;
    });
  };

  const api = CloudSaveService;
  if (typeof window !== "undefined") window.CloudSaveService = api;
  root.CloudSaveService = api;
  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Core = window.NSK.Core || {};
    window.NSK.Core.CloudSaveService = api;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
