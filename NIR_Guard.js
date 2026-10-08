// ==UserScript==
// @name         Don't block my NVIDIA Instant Replay（NIR Guard）
// @name:zh      别碰我的即时重放
// @namespace    local.shadowplay.guard
// @version      2.0
// @description  网页请求 Widevine 等受保护内容（EME）时，在页面右上角弹出提示卡片，由用户当场决定是否放行；未放行则阻止 CDM 加载，避免 NVIDIA 即时重放被关闭。
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

    autoHideMs: 9000,     // 无操作后自动收起卡片（毫秒）；超时视同关闭，不写入任何状态。填 0 = 不自动收起

    // 脚本级永久放行名单：
    allowHosts: [],

    // 黑名单模式，留空 = 对所有站点生效：
    denyHosts: [],

    // 隐藏触发按钮且依旧拦截：
    quietHosts: [],

    hotkeyAltE: true,     // 按下 Alt+E 直接唤出提示卡片
    consoleHint: false
  };
  // ====================================================================

  // 五种权限状态：
  //   blank       置空（默认）：等同于拒绝，且每次请求都会弹出询问
  //   allowOnce   一次允许：本次访问放行，不再弹窗，下次访问恢复置空
  //   denyOnce    一次拒绝：本次访问拒绝，不再弹窗，下次访问恢复置空
  //   allowAlways 记住允许：以后都放行，不再弹窗
  //   denyAlways  记住拒绝：以后都拒绝，不再弹窗
  var K_ALWAYS = 'emeguard.always';    // localStorage   - 记住允许
  var K_DENY   = 'emeguard.deny';      // localStorage   - 记住拒绝
  var K_ONCE   = 'emeguard.once';      // sessionStorage - 一次允许
  var K_ONCED  = 'emeguard.onceDeny';  // sessionStorage - 一次拒绝
  var K_RELOAD = 'emeguard.reloading'; // sessionStorage - 标记"这是脚本自己的刷新"

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
  function readFlag(store, key) {
    try { return store.getItem(key) === '1'; } catch (e) { return false; }
  }
  function writeFlag(store, key, on) {
    try { if (on) store.setItem(key, '1'); else store.removeItem(key); } catch (e) {}
  }
  function matchAny(list, h) {
    for (var i = 0; i < list.length; i++) {
      var it = String(list[i]).toLowerCase();
      if (h === it || h === 'www.' + it || h.slice(-('.' + it).length) === '.' + it) return true;
    }
    return false;
  }
  // 清空本站所有已记录的状态，回到置空
  function clearAll() {
    toggleList(LS, K_ALWAYS, host, false);
    toggleList(LS, K_DENY, host, false);
    toggleList(SS, K_ONCE, host, false);
    toggleList(SS, K_ONCED, host, false);
  }

  // ---------------------------------------------------- 放行判定
  if (CONFIG.denyHosts.length && !matchAny(CONFIG.denyHosts, host)) return;

  var quietHere = matchAny(CONFIG.quietHosts, host);

  // 用户已做出的决定优先；CONFIG.allowHosts 只在没有决定时作为初始预设
  var userAllow = matchAny(readList(LS, K_ALWAYS), host);
  var userDeny = matchAny(readList(LS, K_DENY), host);
  var onceAllow = matchAny(readList(SS, K_ONCE), host);
  var onceDeny = matchAny(readList(SS, K_ONCED), host);

  var state = 'blank';
  if (userAllow) state = 'allowAlways';
  else if (onceAllow) state = 'allowOnce';
  else if (userDeny) state = 'denyAlways';
  else if (onceDeny) state = 'denyOnce';
  else if (matchAny(CONFIG.allowHosts, host)) state = 'allowAlways';

  var allowed = (state === 'allowAlways' || state === 'allowOnce');
  var isBlank = (state === 'blank');

  if (window.__EME_GUARD_INSTALLED__) return;
  window.__EME_GUARD_INSTALLED__ = true;

  // 消费掉"本次刷新是脚本触发的"标记，避免残留影响后续判断
  if (readFlag(SS, K_RELOAD)) writeFlag(SS, K_RELOAD, false);

  // "一次允许/一次拒绝" 只对本次访问生效：
  // 真正的离开（刷新、跳转、关闭标签）会清空，下次访问回到置空。
  // K_RELOAD 用来区分"脚本为了生效而做的自动刷新"，它不应被当作一次新的访问。
  window.addEventListener('pagehide', function () {
    if (readFlag(SS, K_RELOAD)) {
      writeFlag(SS, K_RELOAD, false);
      return;
    }
    toggleList(SS, K_ONCE, host, false);
    toggleList(SS, K_ONCED, host, false);
  });

  function reload() {
    writeFlag(SS, K_RELOAD, true);
    location.reload();
  }

  // ---------------------------------------------------- 文案
  var STRINGS = {
    zh: {
      title: '网页尝试播放受保护内容',
      detail: '网页尝试加载 Widevine CDM 以播放受保护内容，这可能阻止 NVIDIA 即时重放等屏幕录制。',
      deny: '拒绝',
      allow: '允许',
      remember: '记住我对该网站的选择',
      close: '关闭',
      chip: '权限申请',
      chipBlank: '等待决定',
      chipAllowOnce: '本次访问已允许',
      chipDenyOnce: '本次访问已拒绝',
      chipAllowAlways: '已记住允许',
      chipDenyAlways: '已记住拒绝'
    },
    en: {
      title: 'This page wants to play protected content',
      detail: 'The page is trying to load the Widevine CDM to play protected content. This can turn off NVIDIA Instant Replay and other screen recording.',
      deny: 'Block',
      allow: 'Allow',
      remember: 'Remember my choice for this site',
      close: 'Close',
      chip: 'Permission request',
      chipBlank: 'Waiting...',
      chipAllowOnce: 'Allowed for this visit',
      chipDenyOnce: 'Blocked for this visit',
      chipAllowAlways: 'Remembered as allowed',
      chipDenyAlways: 'Remembered as blocked'
    }
  };

  function detectLang() {
    var list = [];
    try { if (navigator.languages && navigator.languages.length) list = [].slice.call(navigator.languages); } catch (e) {}
    try { if (!list.length && navigator.language) list = [navigator.language]; } catch (e) {}
    try { if (!list.length && navigator.userLanguage) list = [navigator.userLanguage]; } catch (e) {}
    for (var i = 0; i < list.length; i++) {
      var t = String(list[i] || '').toLowerCase();
      if (t.indexOf('zh') === 0) return 'zh';
      if (t.indexOf('en') === 0) return 'en';
    }
    return 'en';
  }

  var LANG = detectLang();
  function tt(key) {
    var s = STRINGS[LANG] || STRINGS.en;
    return (s && s[key]) || (STRINGS.en[key] || '');
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

  function blockedResult() {
    if (window.top !== window) {
      try { parent.postMessage({ __emeguard: true, host: host }, '*'); } catch (e) {}
    }
    UI.onBlock(host);
    if (CONFIG.mode === 'hang') return new Promise(function () {});
    try { return Promise.reject(new DOMException(reason, 'NotSupportedError')); }
    catch (e) { return Promise.reject(new Error(reason)); }
  }

  // ---------------------------------------------------- 矢量图形
  function checkPath() {
    return '<path d="M2 6.2 4.8 9 10 3.2" stroke="#fff" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>';
  }

  // ---------------------------------------------------- UI
  var UI = {
    el: null, total: 0,
    ask: { show: false, remember: false },
    hideTimer: 0, docBound: false,

    onBlock: function () {
      if (quietHere) return;
      if (window.top !== window) return;
      this.total++;
      // 只有"置空"状态才每次请求都弹窗；已做过决定的状态不再打扰
      if (!isBlank) return;
      if (this.ask.show) return;
      this.openPrompt();
    },

    openPrompt: function () {
      this.ask.remember = false;
      this.ask.show = true;
      this.render(true);
    },

    // 关闭 / 超时：不做任何处理，不写入状态
    closePrompt: function () {
      this.ask.show = false;
      this.render();
    },

    // 点击触发按钮：直接再次询问（已打开则收起）
    toggle: function () {
      if (this.ask.show) this.closePrompt();
      else this.openPrompt();
    },

    shouldShow: function () {
      return this.ask.show && !quietHere && window.top === window;
    },

    shouldExist: function () {
      return !quietHere && window.top === window;
    },

    fonts: function () {
      var ui = '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
      var mono = 'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace';
      return { ui: ui, mono: mono };
    },

    css: function () {
      return [
        '#emeguard-root{',
        '--eg-bg:oklch(99.2% 0.001 255);',
        '--eg-bg-2:oklch(97.4% 0.003 255);',
        '--eg-line:oklch(90% 0.006 255);',
        '--eg-fg:oklch(28% 0.012 255);',
        '--eg-fg-2:oklch(46% 0.01 255);',
        '--eg-fg-3:oklch(60% 0.008 255);',
        '--eg-glyph-stroke:oklch(48% 0.02 255);',
        '--eg-glyph-fill-soft:oklch(62% 0.06 255 / .18);',
        '--eg-glyph-key:oklch(46% 0.14 255);',
        '--eg-alert:oklch(54% 0.18 28);',
        '--eg-pill:oklch(93.5% 0.022 258);',
        '--eg-pill-hover:oklch(90.5% 0.032 258);',
        '--eg-pill-fg:oklch(33% 0.075 258);',
        '--eg-pill-solid:oklch(56% 0.148 258);',
        '--eg-pill-solid-hover:oklch(51% 0.152 258);',
        '--eg-sel:oklch(68% 0.13 252);',
        '--eg-ok:oklch(52% 0.13 150);',
        '--eg-ui:' + this.fonts().ui + ';',
        '--eg-mono:' + this.fonts().mono + ';',
        '--eg-radius:14px;',
        '}',
        '@media (prefers-color-scheme:dark){#emeguard-root{',
        '--eg-bg:oklch(22% 0.008 255);',
        '--eg-bg-2:oklch(25.5% 0.009 255);',
        '--eg-line:oklch(32% 0.009 255);',
        '--eg-fg:oklch(94% 0.004 255);',
        '--eg-fg-2:oklch(76% 0.006 255);',
        '--eg-fg-3:oklch(63% 0.007 255);',
        '--eg-glyph-stroke:oklch(82% 0.02 255);',
        '--eg-glyph-fill-soft:oklch(72% 0.09 255 / .22);',
        '--eg-glyph-key:oklch(84% 0.11 255);',
        '--eg-alert:oklch(72% 0.15 28);',
        '--eg-pill:oklch(31% 0.028 258);',
        '--eg-pill-hover:oklch(35% 0.034 258);',
        '--eg-pill-fg:oklch(86% 0.05 258);',
        '--eg-pill-solid:oklch(64% 0.135 258);',
        '--eg-pill-solid-hover:oklch(69% 0.13 258);',
        '--eg-sel:oklch(70% 0.12 252);',
        '--eg-ok:oklch(72% 0.12 150);',
        '}}',

        '#emeguard-root,#emeguard-root *{box-sizing:border-box;margin:0;padding:0;',
        'font-family:var(--eg-ui);font-size:inherit;font-weight:inherit;line-height:1.45;',
        'text-align:left;letter-spacing:normal;text-transform:none;overflow-wrap:normal;',
        'border:0;background:none;color:inherit;-webkit-font-smoothing:antialiased;',
        '-webkit-tap-highlight-color:transparent;}',
        '#emeguard-root{position:fixed;top:8px;right:8px;z-index:2147483646;',
        'display:flex;flex-direction:column;align-items:flex-end;gap:8px;',
        'width:360px;max-width:calc(100vw - 16px);',
        'font-family:var(--eg-ui);font-size:13px;color:var(--eg-fg);',
        'pointer-events:none;}',
        '#emeguard-root.hidden{display:none;}',
        '#emeguard-root>*{pointer-events:auto;}',

        '#egchip{display:flex;align-items:center;gap:7px;height:30px;padding:0 13px;',
        'border-radius:999px;border:1px solid var(--eg-line);background:var(--eg-bg);',
        'color:var(--eg-fg-2);font-size:12px;cursor:pointer;flex:none;',
        'box-shadow:0 4px 14px -8px oklch(30% 0.02 255 / .4);transition:color .14s ease-out;}',
        '@media (prefers-color-scheme:dark){#egchip{',
        'box-shadow:0 6px 18px -8px oklch(0% 0 0 / .55);}}',
        '#egchip:hover{color:var(--eg-fg);}',
        '#egchip:focus-visible{outline:2px solid var(--eg-sel);outline-offset:2px;}',
        '#egchip .eg-dot{width:6px;height:6px;border-radius:50%;background:var(--eg-alert);flex:none;}',
        '#egchip[data-state="allowOnce"] .eg-dot,#egchip[data-state="allowAlways"] .eg-dot{',
        'background:var(--eg-ok);}',
        '#egchip[data-state="denyOnce"] .eg-dot,#egchip[data-state="denyAlways"] .eg-dot{',
        'background:var(--eg-fg-3);}',
        '#egchip .eg-num{font-family:var(--eg-mono);font-size:11.5px;}',

        '#eg-prompt{width:100%;background:var(--eg-bg);border:1px solid var(--eg-line);',
        'border-radius:var(--eg-radius);overflow:hidden;',
        'box-shadow:0 14px 34px -10px oklch(30% 0.02 255 / .32),0 2px 6px -2px oklch(30% 0.02 255 / .16);}',
        '@media (prefers-color-scheme:dark){#eg-prompt{',
        'box-shadow:0 18px 40px -12px oklch(0% 0 0 / .6),0 2px 6px -2px oklch(0% 0 0 / .4);}}',
        '#eg-prompt[hidden]{display:none;}',
        '#eg-prompt[data-anim="in"]{animation:egPromptIn .34s cubic-bezier(.16,1,.3,1) both;}',
        '@keyframes egPromptIn{from{opacity:0;transform:translateY(-12px) scale(.985)}',
        'to{opacity:1;transform:none}}',
        '@media (prefers-reduced-motion:reduce){#eg-prompt[data-anim="in"]{animation:none;}}',

        '#eg-prompt .eg-hd{display:flex;align-items:center;gap:10px;',
        'padding:14px 14px 4px 16px;}',
        '#eg-prompt .eg-title{flex:1;font-size:15px;font-weight:600;line-height:1.35;',
        'color:var(--eg-fg);}',
        '#eg-close{flex:none;width:26px;height:26px;display:grid;place-items:center;',
        'border-radius:50%;color:var(--eg-fg-2);cursor:pointer;transition:background .14s ease-out;}',
        '#eg-close:hover{background:var(--eg-bg-2);color:var(--eg-fg);}',

        '#eg-prompt .eg-body{display:flex;gap:12px;padding:4px 16px 0;}',
        '#eg-prompt .eg-glyph{flex:none;display:block;}',
        '#eg-prompt .eg-detail{font-size:13px;line-height:1.55;color:var(--eg-fg-2);}',
        '#eg-prompt .eg-host{margin-top:6px;font-family:var(--eg-mono);font-size:11.5px;',
        'color:var(--eg-fg-3);word-break:break-all;}',

        '#eg-remember{display:inline-flex;align-items:center;gap:7px;margin-top:11px;',
        'font-size:12.5px;color:var(--eg-fg-2);cursor:pointer;}',
        '#eg-remember input{position:absolute;opacity:0;width:0;height:0;}',
        '#eg-remember .eg-box{flex:none;width:15px;height:15px;border-radius:4px;',
        'border:1.5px solid var(--eg-line);background:var(--eg-bg);display:grid;place-items:center;',
        'transition:background .14s ease-out,border-color .14s ease-out;}',
        '#eg-remember input:checked+.eg-box{background:var(--eg-sel);border-color:var(--eg-sel);}',
        '#eg-remember .eg-box svg{opacity:0;transition:opacity .12s ease-out;}',
        '#eg-remember input:checked+.eg-box svg{opacity:1;}',
        '#eg-remember input:focus-visible+.eg-box{outline:2px solid var(--eg-sel);outline-offset:2px;}',

        '#eg-prompt .eg-acts{display:flex;justify-content:flex-end;gap:8px;',
        'padding:12px 14px 14px;}',
        '.eg-pill{flex:none;min-width:84px;padding:8px 18px;border-radius:999px;',
        'font-size:13.5px;font-weight:500;text-align:center;cursor:pointer;',
        'background:var(--eg-pill);color:var(--eg-pill-fg);',
        'transition:background .14s ease-out,color .14s ease-out;}',
        '.eg-pill:hover{background:var(--eg-pill-hover);}',
        '.eg-pill.eg-primary{background:var(--eg-pill-solid);color:oklch(99% 0 0);}',
        '.eg-pill.eg-primary:hover{background:var(--eg-pill-solid-hover);}',
        '.eg-pill:focus-visible{outline:2px solid var(--eg-sel);outline-offset:2px;}'
      ].join('');
    },

    glyphHtml: function () {
      return '<svg width="20" height="22" viewBox="0 0 20 22" fill="none" ' +
        'aria-hidden="true" class="eg-glyph">' +
        '<circle cx="11" cy="10" r="7.4" fill="var(--eg-glyph-fill-soft)"/>' +
        '<path d="M10 1.6 17.2 4.3v5.4c0 4.3-2.9 8.2-7.2 9.7-4.3-1.5-7.2-5.4-7.2-9.7V4.3L10 1.6Z" ' +
        'fill="none" stroke="var(--eg-glyph-stroke)" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<path d="M9.98 7.6v3.1" stroke="var(--eg-glyph-key)" stroke-width="1.6" stroke-linecap="round"/>' +
        '<circle cx="9.98" cy="13.5" r="1.15" fill="var(--eg-glyph-key)"/></svg>';
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
        '<button id="egchip" type="button" aria-haspopup="dialog">' +
        '  <span class="eg-dot"></span><span id="eg-chip-text"></span>' +
        '  <span class="eg-num"></span>' +
        '</button>' +
        '<div id="eg-prompt" role="dialog" aria-modal="false" hidden>' +
        '  <div class="eg-hd">' +
        '    <div class="eg-title" id="eg-title"></div>' +
        '    <button id="eg-close" type="button">' +
        '      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">' +
        '      <path d="M1.6 1.6l8.8 8.8M10.4 1.6l-8.8 8.8" stroke="currentColor" ' +
        'stroke-width="1.5" stroke-linecap="round"/></svg>' +
        '    </button>' +
        '  </div>' +
        '  <div class="eg-body">' +
        '    <div class="eg-mark" id="eg-mark"></div>' +
        '    <div>' +
        '      <div class="eg-detail" id="eg-detail"></div>' +
        '      <div class="eg-host" id="eg-phost"></div>' +
        '      <label id="eg-remember" for="eg-remember-box">' +
        '        <input type="checkbox" id="eg-remember-box">' +
        '        <span class="eg-box">' +
        '          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" ' +
        'aria-hidden="true">' + checkPath() + '</svg>' +
        '        </span>' +
        '        <span id="eg-remember-text"></span>' +
        '      </label>' +
        '    </div>' +
        '  </div>' +
        '  <div class="eg-acts">' +
        '    <button class="eg-pill" id="eg-deny" type="button"></button>' +
        '    <button class="eg-pill eg-primary" id="eg-allow" type="button"></button>' +
        '  </div>' +
        '</div>';
      (document.body || document.documentElement).appendChild(box);

      var self = this;
      box.querySelector('#egchip').addEventListener('click', function () { self.toggle(); });
      box.querySelector('#eg-close').addEventListener('click', function () { self.closePrompt(); });
      box.querySelector('#eg-deny').addEventListener('click', function () { self.answer(false); });
      box.querySelector('#eg-allow').addEventListener('click', function () { self.answer(true); });
      box.querySelector('#eg-remember-box').addEventListener('change', function (e) {
        self.ask.remember = !!e.target.checked;
      });
      this.el = box;
      return box;
    },

    clearHide: function () {
      if (!this.hideTimer) return;
      try { clearTimeout(this.hideTimer); } catch (e) {}
      this.hideTimer = 0;
    },

    armHide: function () {
      var self = this;
      this.clearHide();
      if (!CONFIG.autoHideMs) return;
      this.hideTimer = setTimeout(function () {
        self.hideTimer = 0;
        if (self.ask.show) self.closePrompt();
      }, CONFIG.autoHideMs);
    },

    // ok = true 允许 / false 拒绝
    answer: function (ok) {
      // 重新唤出后做的任何新操作，都先抹掉旧的状态与"记住"，视同从置空开始
      clearAll();

      var target = this.ask.remember
        ? (ok ? 'allowAlways' : 'denyAlways')
        : (ok ? 'allowOnce' : 'denyOnce');

      if (target === 'allowAlways') toggleList(LS, K_ALWAYS, host, true);
      else if (target === 'denyAlways') toggleList(LS, K_DENY, host, true);
      else if (target === 'allowOnce') toggleList(SS, K_ONCE, host, true);
      else toggleList(SS, K_ONCED, host, true);

      this.ask.show = false;
      this.clearHide();

      // 只在目标状态与当前生效状态不同（放行与否翻转）时才刷新
      var targetAllowed = (target === 'allowAlways' || target === 'allowOnce');
      if (targetAllowed !== allowed) reload();
      else this.render();
    },

    render: function (fresh) {
      if (window.top !== window) return;
      if (!this.shouldExist()) {
        if (this.el) this.el.classList.add('hidden');
        return;
      }
      var root = this.root();
      root.classList.remove('hidden');
      this.bindDoc();

      var showAsk = this.shouldShow();
      var prompt = root.querySelector('#eg-prompt');
      var chip = root.querySelector('#egchip');

      if (showAsk) {
        prompt.removeAttribute('hidden');
        if (!prompt.__egBound) {
          prompt.__egBound = true;
          prompt.addEventListener('mouseenter', clearHideRef);
          prompt.addEventListener('focusin', clearHideRef);
        }
        root.querySelector('#eg-title').textContent = tt('title');
        root.querySelector('#eg-detail').textContent = tt('detail');
        root.querySelector('#eg-phost').textContent = host;
        root.querySelector('#eg-mark').innerHTML = this.glyphHtml();
        root.querySelector('#eg-remember-text').textContent = tt('remember');
        root.querySelector('#eg-remember-box').checked = !!this.ask.remember;
        root.querySelector('#eg-close').setAttribute('aria-label', tt('close'));
        root.querySelector('#eg-deny').textContent = tt('deny');
        root.querySelector('#eg-allow').textContent = tt('allow');

        if (fresh) {
          prompt.setAttribute('data-anim', 'in');
          var p = prompt;
          setTimeout(function () { try { p.removeAttribute('data-anim'); } catch (e) {} }, 400);
        }
        this.armHide();
      } else {
        prompt.setAttribute('hidden', '');
        this.clearHide();
      }

      chip.setAttribute('data-state', state);
      chip.setAttribute('aria-expanded', showAsk ? 'true' : 'false');
      chip.title = tt('chip' + state.charAt(0).toUpperCase() + state.slice(1));
      root.querySelector('#eg-chip-text').textContent = tt('chip');
      root.querySelector('#egchip .eg-num').textContent = (!allowed && this.total > 1) ? String(this.total) : '';
    },

    bindDoc: function () {
      if (this.docBound) return;
      this.docBound = true;
      var self = this;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && self.ask.show) {
          self.closePrompt();
          return;
        }
        if (!CONFIG.hotkeyAltE) return;
        if (!e.altKey) return;
        if (e.key !== 'e' && e.key !== 'E') return;
        self.toggle();
      }, true);
    }
  };

  var clearHideRef = function () { UI.clearHide(); };

  // ---------------------------------------------------- 装载
  function mount() { UI.render(); }
  if (document.body || document.documentElement) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });

  // 子 frame 的拦截计数上报到顶层
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d && d.__emeguard && typeof d.host === 'string') UI.onBlock(d.host);
  });

  UI.bindDoc();
})();
