// ==UserScript==
// @name         Don't block my NVIDIA Instant Replay（NIR Guard）
// @name:zh      别碰我的即时重放
// @namespace    local.shadowplay.guard
// @version      1.0
// @description  禁止网页调用 EME API，从而阻止 Chrome 加载 Widevine CDM，避免NVIDIA即时重放被关闭。被拦截站点的 DRM 视频无法播放。
// @match        *://*/*
// @run-at       document-start
// @grant        none
// @noframes     false
// ==/UserScript==
/* jshint esversion: 6 */

(function () {
  'use strict';

  // ============================== 配置区 ==============================
  var CONFIG = {
    // reject : 直接抛错，播放器立刻降级/报错（默认）
    // hang   : 返回永不 settle 的 Promise，页面拿不到 MediaKeys 也不报错，更像"不支持"
    mode: 'reject',

    // 脚本级永久放行名单：
    allowHosts: [],

    // 黑名单模式，留空 = 对所有站点生效：
    denyHosts: [],

    // 隐藏角标且依旧拦截：
    quietHosts: [],

    hotkeyAltE: true,     // 按下 Alt+E 强制唤出面板（站点尚未请求 DRM 时也能管理）
    consoleHint: false
  };
  // ====================================================================

  var K_ALWAYS = 'emeguard.always';    // localStorage   - 永久放行名单
  var K_ONCE   = 'emeguard.once';      // sessionStorage - 放行一次（仅本次导航）
  var K_RELOAD = 'emeguard.reloading'; // sessionStorage - 标记"这是自己的刷新"

  var host = (location.hostname || '').toLowerCase();

  // ---------------------------------------------------- 存储
  function memStore() {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  }
  function pick(name) {
    try {
      var s = window[name];
      if (!s) return null;
      s.getItem('__emeguard_probe__');
      return s;
    } catch (e) { return null; }
  }
  var LS = pick('localStorage') || memStore();
  var SS = pick('sessionStorage') || memStore();

  function readList(store, key) {
    try {
      var raw = store.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function writeList(store, key, arr) {
    try { store.setItem(key, JSON.stringify(arr)); return true; } catch (e) { return false; }
  }
  function toggleList(store, key, h, add) {
    var list = readList(store, key);
    var i = list.indexOf(h);
    if (add && i < 0) list.push(h);
    if (!add && i >= 0) list.splice(i, 1);
    writeList(store, key, list);
  }
  function matchAny(list, h) {
    for (var i = 0; i < list.length; i++) {
      var it = String(list[i]).toLowerCase();
      if (h === it || h === 'www.' + it || h.slice(-('.' + it).length) === '.' + it) return true;
    }
    return false;
  }

  var alwaysList = readList(LS, K_ALWAYS);
  var onceList   = readList(SS, K_ONCE);

  // ---------------------------------------------------- 放行判定
  if (CONFIG.denyHosts.length && !matchAny(CONFIG.denyHosts, host)) return;

  var quietHere = matchAny(CONFIG.quietHosts, host);
  var allowed   = matchAny(CONFIG.allowHosts, host) || matchAny(alwaysList, host) || matchAny(onceList, host);
  var allowKind = (matchAny(onceList, host) && !matchAny(alwaysList, host) && !matchAny(CONFIG.allowHosts, host))
    ? 'once' : (allowed ? 'always' : 'none');

  if (window.__EME_GUARD_INSTALLED__) return;
  window.__EME_GUARD_INSTALLED__ = true;

  // "放行一次" 语义：只在这次放行后的那一次页面加载生效；
  // 之后的刷新/跳转/关闭标签都会恢复拦截。K_RELOAD 用来区分"为了放行而做的刷新"。
  window.addEventListener('pagehide', function () {
    var own = null;
    try { own = SS.getItem(K_RELOAD); } catch (e) {}
    if (own === '1') { try { SS.removeItem(K_RELOAD); } catch (e) {} return; }
    toggleList(SS, K_ONCE, host, false);
  });

  function reload() {
    try { SS.setItem(K_RELOAD, '1'); } catch (e) {}
    location.reload();
  }

  // ---------------------------------------------------- 拦截 EME
  var reason = 'EME/Widevine blocked by userscript (keep ShadowPlay recording)';

  function def(obj, prop, fn) {
    try { Object.defineProperty(obj, prop, { value: fn, writable: false, configurable: false }); } catch (e) {}
  }

  if (!allowed) {
    [
      [Navigator.prototype, 'requestMediaKeySystemAccess'],
      [Navigator.prototype, 'webkitRequestMediaKeySystemAccess'],
      [HTMLMediaElement.prototype, 'setMediaKeys'],
      [HTMLMediaElement.prototype, 'webkitSetMediaKeys'],
      [HTMLMediaElement.prototype, 'generateKeyRequest'],
      [HTMLMediaElement.prototype, 'webkitGenerateKeyRequest'],
      [HTMLMediaElement.prototype, 'addKey'],
      [HTMLMediaElement.prototype, 'cancelKeyRequest'],
      [HTMLMediaElement.prototype, 'webkitCancelKeyRequest']
    ].forEach(function (t) { def(t[0], t[1], function () { return blockedResult(); }); });

    try {
      def(window, 'MediaKeySystemAccess', undefined);
      def(window, 'WebKitMediaKeys', undefined);
    } catch (e) {}

    if (CONFIG.consoleHint) console.warn('[EME-Guard] ' + reason + ' (host: ' + host + ')');
  }

  var lastTs = null;
  function blockedResult() {
    lastTs = new Date();
    if (window.top !== window) {
      try { parent.postMessage({ __emeguard: true, host: host }, '*'); } catch (e) {}
    }
    UI.onBlock(host);
    if (CONFIG.mode === 'hang') return new Promise(function () {});
    try { return Promise.reject(new DOMException(reason, 'NotSupportedError')); }
    catch (e) { return Promise.reject(new Error(reason)); }
  }

  // ---------------------------------------------------- UI
  var UI = {
    el: null, open: false, manageOpen: false, blockHosts: {}, total: 0, forced: false,

    onBlock: function (h) {
      if (quietHere) return;
      if (window.top !== window) return;
      this.blockHosts[h] = true;
      this.total++;
      this.render();
    },

    shouldExist: function () {
      if (quietHere) return false;
      if (this.forced) return true;
      if (allowed) return true;
      return Object.keys(this.blockHosts).length > 0;
    },

    css: function () {
      return [
        '#emeguard-root{',
        '--eg-bg:oklch(17% 0.012 255);',
        '--eg-bg-2:oklch(21% 0.012 255);',
        '--eg-line:oklch(31% 0.012 255);',
        '--eg-line-soft:oklch(27% 0.012 255);',
        '--eg-fg:oklch(93% 0.004 255);',
        '--eg-fg-2:oklch(72% 0.008 255);',
        '--eg-fg-3:oklch(58% 0.008 255);',
        '--eg-accent:oklch(80% 0.13 78);',
        '--eg-ok:oklch(78% 0.11 152);',
        '--eg-mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;',
        '--eg-ui:system-ui,-apple-system,"Segoe UI","Helvetica Neue","Microsoft YaHei",sans-serif;',
        '}',
        '#emeguard-root,#emeguard-root *{box-sizing:border-box;margin:0;padding:0;',
        'font-family:var(--eg-ui);line-height:1.45;text-align:left;letter-spacing:normal;',
        'text-transform:none;overflow-wrap:normal;-webkit-font-smoothing:antialiased;}',
        '#emeguard-root{position:fixed;right:14px;bottom:14px;z-index:2147483646;',
        'display:flex;flex-direction:column;align-items:flex-end;',
        'font-size:12px;color:var(--eg-fg);}',
        '#emeguard-root.hidden{display:none;}',

        '#egc{display:flex;align-items:center;gap:7px;height:26px;padding:0 9px 0 8px;',
        'background:var(--eg-bg);border:1px solid var(--eg-line);border-radius:4px;',
        'color:var(--eg-fg);font-size:11.5px;cursor:pointer;opacity:.82;',
        'box-shadow:0 6px 18px -10px rgba(0,0,0,.66);transition:opacity .16s ease-out,border-color .16s ease-out;}',
        '#egc:hover{opacity:1;border-color:oklch(42% 0.014 255);}',
        '#egc:focus-visible{outline:2px solid var(--eg-accent);outline-offset:2px;}',
        '#egc .dot{width:5px;height:5px;border-radius:50%;background:var(--eg-accent);flex:none;}',
        '#egc[data-state="allowed"] .dot{background:var(--eg-ok);}',
        '#egc .lbl{letter-spacing:.06em;text-transform:uppercase;font-size:10px;',
        'font-weight:500;color:var(--eg-fg-2);}',
        '#egc .num{font-family:var(--eg-mono);font-variant-numeric:tabular-nums;font-size:11px;}',

        '#egp{display:none;width:214px;margin-bottom:8px;padding:10px 11px 11px;',
        'background:var(--eg-bg);border:1px solid var(--eg-line);border-radius:5px;',
        'box-shadow:0 14px 34px -16px rgba(0,0,0,.72);}',
        '#egp.on{display:block;animation:egIn .16s cubic-bezier(.16,1,.3,1) both;}',
        '@keyframes egIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
        '@media (prefers-reduced-motion:reduce){#egp.on{animation:none}#egc{transition:none}}',

        '#egp .hd{display:flex;align-items:center;justify-content:space-between;',
        'padding-bottom:9px;border-bottom:1px solid var(--eg-line-soft);}',
        '#egp .brand{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;',
        'font-weight:600;color:var(--eg-fg-3);}',
        '#eg-collapse{background:none;border:0;color:var(--eg-fg-3);cursor:pointer;',
        'display:flex;padding:2px;border-radius:3px;}',
        '#eg-collapse:hover{color:var(--eg-fg);}',
        '#eg-collapse:focus-visible{outline:2px solid var(--eg-accent);outline-offset:2px;}',

        '#eg-host{font-family:var(--eg-mono);font-size:11.5px;color:var(--eg-fg);',
        'margin-top:9px;word-break:break-all;}',
        '#eg-status{margin-top:3px;font-size:11px;color:var(--eg-fg-2);',
        'font-variant-numeric:tabular-nums;}',
        '#eg-status b{font-family:var(--eg-mono);font-weight:500;color:var(--eg-fg);}',
        '#egp[data-state="allowed"] #eg-status b{color:var(--eg-ok);}',

        '#eg-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}',
        '#egp button{font-family:inherit;font-size:11.5px;cursor:pointer;border-radius:3px;}',
        '#egp button.pri{padding:5px 10px;border:1px solid var(--eg-accent);',
        'background:var(--eg-accent);color:oklch(22% 0.045 78);font-weight:500;}',
        '#egp button.pri:hover{background:oklch(86% 0.13 78);border-color:oklch(86% 0.13 78);}',
        '#egp button.sec{padding:5px 10px;border:1px solid var(--eg-line);',
        'background:transparent;color:var(--eg-fg);}',
        '#egp button.sec:hover{border-color:oklch(48% 0.014 255);background:var(--eg-bg-2);}',
        '#egp button.link{padding:5px 4px;margin-left:auto;border:0;background:none;',
        'color:var(--eg-fg-3);text-decoration:underline;text-underline-offset:2px;}',
        '#egp button.link:hover{color:var(--eg-fg-2);}',
        '#egp button:focus-visible{outline:2px solid var(--eg-accent);outline-offset:2px;}',

        '#eg-manage:not(:empty){margin-top:11px;padding-top:9px;',
        'border-top:1px solid var(--eg-line-soft);}',
        '#eg-manage .cap{display:flex;justify-content:space-between;align-items:baseline;',
        'font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--eg-fg-3);',
        'margin-bottom:5px;}',
        '#eg-manage .row{display:flex;align-items:center;gap:8px;padding:2.5px 0;}',
        '#eg-manage .nm{flex:1;font-family:var(--eg-mono);font-size:11px;color:var(--eg-fg-2);',
        'word-break:break-all;}',
        '#eg-manage .rm{background:none;border:0;color:var(--eg-fg-3);font-size:11px;',
        'padding:2px 3px;border-radius:3px;}',
        '#eg-manage .rm:hover{color:oklch(80% 0.09 30);}',
        '#eg-manage .none{font-size:11px;color:var(--eg-fg-3);padding:2px 0;}',
        '#eg-manage .clear{margin-top:7px;width:100%;padding:5px;background:none;',
        'border:1px dashed var(--eg-line);color:var(--eg-fg-3);}',
        '#eg-manage .clear:hover{color:var(--eg-fg);border-color:oklch(42% 0.014 255);}'
      ].join('');
    },

    root: function () {
      if (this.el && document.documentElement.contains(this.el)) return this.el;
      if (!document.getElementById('eg-style')) {
        var st = document.createElement('style');
        st.id = 'eg-style';
        st.textContent = this.css();
        (document.head || document.documentElement).appendChild(st);
      }
      var box = document.createElement('div');
      box.id = 'emeguard-root';
      box.innerHTML =
        '<div id="egp">' +
        '  <div class="hd"><span class="brand" title="Don\'t block my NVIDIA Instant Replay">Don’t block my NIR</span>' +
        '    <button id="eg-collapse" aria-label="收起面板">' +
        '      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">' +
        '      <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>' +
        '    </button>' +
        '  </div>' +
        '  <div id="eg-host"></div>' +
        '  <div id="eg-status"></div>' +
        '  <div id="eg-acts"></div>' +
        '  <div id="eg-manage"></div>' +
        '</div>' +
        '<button id="egc" aria-expanded="false"><span class="dot"></span>' +
        '  <span class="lbl">NIR</span><span class="num"></span>' +
        '</button>';
      (document.body || document.documentElement).appendChild(box);
      var self = this;
      box.querySelector('#egc').addEventListener('click', function () { self.toggle(); });
      box.querySelector('#eg-collapse').addEventListener('click', function () { self.toggle(false); });
      this.el = box;
      return box;
    },

    toggle: function (force) {
      this.open = force === false ? false : !this.open;
      this.render();
    },

    render: function () {
      if (window.top !== window) return;
      if (!this.shouldExist()) {
        if (this.el) this.el.classList.add('hidden');
        return;
      }
      var root = this.root();
      root.classList.remove('hidden');

      var chip = root.querySelector('#egc');
      var num = chip.querySelector('.num');
      var panel = root.querySelector('#egp');
      var n = this.total;

      chip.setAttribute('data-state', allowed ? 'allowed' : 'blocked');
      chip.setAttribute('aria-expanded', this.open ? 'true' : 'false');
      chip.title = allowed ? '本站已放行 DRM 播放' : '本站正在请求 DRM，已被拦截（点击展开）';
      num.textContent = allowed ? '' : (n > 1 ? String(n) : '');

      panel.className = this.open ? 'on' : '';
      panel.setAttribute('data-state', allowed ? 'allowed' : 'blocked');

      root.querySelector('#eg-host').textContent = host;

      var st = root.querySelector('#eg-status');
      if (allowed) {
        st.innerHTML = allowKind === 'once'
          ? '本次放行 · <b>离开本页后恢复拦截</b>'
          : '永久放行 · <b>DRM 可播放</b>';
      } else if (n) {
        var t = lastTs ? String(lastTs.getHours()).padStart(2, '0') + ':' +
          String(lastTs.getMinutes()).padStart(2, '0') + ':' +
          String(lastTs.getSeconds()).padStart(2, '0') : '';
        st.innerHTML = '已拦截 <b>' + n + '</b> 次请求' + (t ? ' · 最近 ' + t : '');
      } else {
        st.innerHTML = '拦截中 · <b>尚无 DRM 请求</b>';
      }

      var acts = root.querySelector('#eg-acts');
      acts.innerHTML = '';
      var self = this;
      function btn(label, cls, cb) {
        var b = document.createElement('button');
        b.textContent = label;
        b.className = cls;
        b.addEventListener('click', cb);
        acts.appendChild(b);
        return b;
      }

      if (allowed) {
        btn('停止放行', 'sec', function () {
          toggleList(LS, K_ALWAYS, host, false);
          toggleList(SS, K_ONCE, host, false);
          reload();
        });
        btn('名单', 'link', function () { self.manageOpen = !self.manageOpen; self.renderManage(); });
      } else {
        btn('放行一次', 'pri', function () {
          toggleList(SS, K_ONCE, host, true);
          reload();
        }).title = '只对本次导航生效，刷新或跳转后自动恢复拦截';
        btn('永久放行', 'sec', function () {
          toggleList(LS, K_ALWAYS, host, true);
          reload();
        });
        btn('名单', 'link', function () { self.manageOpen = !self.manageOpen; self.renderManage(); });
      }

      this.renderManage();
    },

    renderManage: function () {
      var wrap = this.el && this.el.querySelector('#eg-manage');
      if (!wrap) return;
      wrap.innerHTML = '';
      if (!this.manageOpen) return;
      var self = this;

      var always = readList(LS, K_ALWAYS);
      var once = readList(SS, K_ONCE);

      function cap(text, count) {
        var c = document.createElement('div');
        c.className = 'cap';
        var s1 = document.createElement('span');
        s1.textContent = text;
        var s2 = document.createElement('span');
        s2.textContent = String(count);
        c.appendChild(s1); c.appendChild(s2);
        wrap.appendChild(c);
      }
      function row(list, store, key, h, labels) {
        var r = document.createElement('div');
        r.className = 'row';
        var nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = h;
        var rm = document.createElement('button');
        rm.className = 'rm';
        rm.textContent = labels;
        rm.addEventListener('click', function () {
          toggleList(store, key, h, false);
          self.renderManage();
          if (h === host) reload();
        });
        r.appendChild(nm); r.appendChild(rm);
        wrap.appendChild(r);
      }

      cap('永久放行', always.length);
      if (!always.length) {
        var none = document.createElement('div');
        none.className = 'none';
        none.textContent = '空';
        wrap.appendChild(none);
      } else {
        always.forEach(function (h) { row(always, LS, K_ALWAYS, h, '移除'); });
      }

      if (once.length) {
        cap('本次放行', once.length);
        once.forEach(function (h) { row(once, SS, K_ONCE, h, '取消'); });
      }

      var clear = document.createElement('button');
      clear.className = 'clear';
      clear.textContent = '清空永久名单';
      clear.addEventListener('click', function () {
        writeList(LS, K_ALWAYS, []);
        self.renderManage();
      });
      wrap.appendChild(clear);
    }
  };

  // ---------------------------------------------------- 装载
  function mount() { UI.render(); }
  if (document.body || document.documentElement) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });

  // 子 frame 的拦截计数上报到顶层
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d && d.__emeguard && typeof d.host === 'string') UI.onBlock(d.host);
  });

  if (CONFIG.hotkeyAltE && window.top === window) {
    window.addEventListener('keydown', function (e) {
      if (!e.altKey || (e.key !== 'e' && e.key !== 'E')) return;
      UI.forced = true;
      UI.open = !UI.open;
      UI.render();
    });
  }
})();
