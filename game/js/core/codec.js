/* ================================================================
   小型编解码工具（平台无关）—— 深空星疆
   提供 UTF-8 ↔ 字节、字节 ↔ base64url、FNV-1a(32) 摘要。
   被本地存档封装（NSK2）与存档码（NSK1）共用，避免各文件重复实现。
   不依赖 btoa/atob（手写 base64），保证 file:// 与 Node 探针零依赖。
   ================================================================ */
(function (root) {
  "use strict";

  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function utf8Encode(str) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(str);
    // 兜底（极老环境）：手写 UTF-8 编码
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else if (c < 0xd800 || c >= 0xe000) { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
      else { // 代理对
        i++; const c2 = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
        out.push(0xf0 | (c2 >> 18), 0x80 | ((c2 >> 12) & 0x3f), 0x80 | ((c2 >> 6) & 0x3f), 0x80 | (c2 & 0x3f));
      }
    }
    return new Uint8Array(out);
  }

  function utf8Decode(bytes) {
    if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
    let out = "", i = 0;
    while (i < bytes.length) {
      const c = bytes[i++];
      if (c < 0x80) out += String.fromCharCode(c);
      else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
      else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
      else {
        const cp = ((c & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      }
    }
    return out;
  }

  function bytesToBase64Url(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const b1 = (i + 1 < bytes.length) ? bytes[i + 1] : NaN;
      const b2 = (i + 2 < bytes.length) ? bytes[i + 2] : NaN;
      out += B64[b0 >> 2];
      out += B64[((b0 & 3) << 4) | (isNaN(b1) ? 0 : b1 >> 4)];
      out += isNaN(b1) ? "=" : B64[((b1 & 15) << 2) | (isNaN(b2) ? 0 : b2 >> 6)];
      out += isNaN(b2) ? "=" : B64[b2 & 63];
    }
    return out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64UrlToBytes(s) {
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const clean = s.replace(/=+$/, "");
    const len = Math.floor(clean.length * 3 / 4);
    const bytes = new Uint8Array(len);
    let p = 0, o = 0;
    while (p < clean.length) {
      const e0 = B64.indexOf(clean[p++]);
      const e1 = B64.indexOf(clean[p++]);
      const e2 = B64.indexOf(clean[p++]);
      const e3 = B64.indexOf(clean[p++]);
      bytes[o++] = (e0 << 2) | (e1 >> 4);
      if (e2 !== -1) bytes[o++] = ((e1 & 15) << 4) | (e2 >> 2);
      if (e3 !== -1) bytes[o++] = ((e2 & 3) << 6) | e3;
    }
    return bytes;
  }

  // FNV-1a（32 位）→ 8 位十六进制。用于存档摘要（判等，非密码学）。
  function fnv1a32(str) {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  const api = { B64, utf8Encode, utf8Decode, bytesToBase64Url, base64UrlToBytes, fnv1a32 };

  if (typeof window !== "undefined") {
    window.NSK = window.NSK || {};
    window.NSK.Core = window.NSK.Core || {};
    window.NSK.Core.Codec = api;
  }
  root.NSK = root.NSK || {};
  root.NSK.Core = root.NSK.Core || {};
  root.NSK.Core.Codec = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
