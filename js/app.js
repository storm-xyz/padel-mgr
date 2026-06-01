/* ===================================================================
   app.js — entry point. Boots migration, router, shared helpers,
   password gate, sidebar club name, and the page render registry.
   =================================================================== */
(function () {
  'use strict';

  window.PMGR = window.PMGR || {};
  window.PMGR.pages = window.PMGR.pages || {};

  /* ---------------- Shared formatting helpers ---------------- */
  var AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  var fmt = {
    ymd: function (d) {
      d = d || new Date();
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    },
    parse: function (s) { return new Date(s + 'T12:00:00'); },
    addDays: function (ymd, n) {
      var d = fmt.parse(ymd);
      d.setDate(d.getDate() + n);
      return fmt.ymd(d);
    },
    dateLabel: function (s) {
      try {
        var d = fmt.parse(s);
        return AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + AR_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
      } catch (e) { return s; }
    },
    dateShort: function (s) {
      try { var d = fmt.parse(s); return d.getDate() + ' ' + AR_MONTHS[d.getMonth()]; } catch (e) { return s; }
    },
    money: function (n) {
      var s = window.db.getSettings();
      var v = Math.round((parseFloat(n) || 0) * 100) / 100;
      return v.toLocaleString('en-US') + ' ' + (s.currency || 'ج');
    },
    num: function (n) { return (Math.round((parseFloat(n) || 0) * 100) / 100).toLocaleString('en-US'); },
    t2min: function (t) { if (!t) return 0; var p = t.split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); },
    min2t: function (mins) {
      mins = ((mins % 1440) + 1440) % 1440;
      var h = Math.floor(mins / 60), m = mins % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    },
    addMinutes: function (t, mins) { return fmt.min2t(fmt.t2min(t) + mins); },
    time12: function (t) {
      if (!t) return '--:--';
      var p = t.split(':'), h = parseInt(p[0], 10), m = p[1];
      var ap = h >= 12 ? 'م' : 'ص';
      var h12 = h % 12; if (h12 === 0) h12 = 12;
      return h12 + ':' + m + ' ' + ap;
    }
  };
  window.fmt = fmt;

  /* ---------------- Shared UI helpers ---------------- */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var ui = {
    esc: escapeHtml,
    toast: function (msg, color) {
      var root = document.getElementById('toast-root');
      if (!root) return;
      var el = document.createElement('div');
      el.className = 'toast';
      if (color) el.style.background = color;
      el.textContent = msg;
      root.appendChild(el);
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2600);
    },
    openModal: function (innerHtml, opts) {
      opts = opts || {};
      var root = document.getElementById('modal-root');
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = '<div class="modal">' + innerHtml + '</div>';
      root.appendChild(overlay);
      overlay.addEventListener('mousedown', function (e) {
        if (e.target === overlay && opts.dismissable !== false) ui.closeModal(overlay);
      });
      return overlay;
    },
    closeModal: function (overlay) {
      var root = document.getElementById('modal-root');
      if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); return; }
      // close the last modal
      if (root && root.lastElementChild) root.removeChild(root.lastElementChild);
    },
    closeAllModals: function () {
      var root = document.getElementById('modal-root');
      if (root) root.innerHTML = '';
    }
  };
  window.ui = ui;

  /* ---------------- Page registry + rendering ---------------- */
  function renderPage(name) {
    var container = document.querySelector('.page[data-page="' + name + '"]');
    if (!container) return;
    var renderer = window.PMGR.pages[name];
    if (typeof renderer === 'function') {
      try { renderer(container); }
      catch (e) { console.error('render ' + name + ' failed', e); container.innerHTML = '<div class="empty-state">حدث خطأ في تحميل الصفحة</div>'; }
    }
  }
  window.PMGR.renderPage = renderPage;
  window.PMGR.refresh = function (name) {
    if (window.router && window.router.getCurrentPage() === name) renderPage(name);
  };

  function updateClubName() {
    var s = window.db.getSettings();
    document.querySelectorAll('[data-club-name]').forEach(function (el) { el.textContent = s.clubName || 'نادي البادل'; });
    if (s.clubName) document.title = s.clubName + ' — Padel MGR';
  }
  window.PMGR.updateClubName = updateClubName;

  /* ---------------- Password gate ---------------- */
  var PWD_KEY = 'pmgr_password';
  function hashPwd(p) { return btoa(unescape(encodeURIComponent(p + 'pmgr_salt'))); }
  window.PMGR.hashPwd = hashPwd;
  window.PMGR.pwdKey = PWD_KEY;

  function showLogin(onSuccess) {
    var stored = localStorage.getItem(PWD_KEY);
    if (!stored) { onSuccess(); return; }
    var screen = document.createElement('div');
    screen.className = 'login-screen';
    screen.innerHTML =
      '<div class="login-box">' +
        '<div class="lb-logo">🏸</div>' +
        '<div class="lb-title">Padel MGR</div>' +
        '<div class="form-group"><input type="password" id="loginPwd" placeholder="أدخل الباسورد" autofocus></div>' +
        '<button class="btn btn-primary btn-block" id="loginBtn">دخول</button>' +
        '<div id="loginErr" class="text-danger mt-12" style="font-size:13px;display:none">باسورد غير صحيح</div>' +
      '</div>';
    document.body.appendChild(screen);
    function attempt() {
      var val = document.getElementById('loginPwd').value;
      if (hashPwd(val) === stored) { document.body.removeChild(screen); onSuccess(); }
      else { document.getElementById('loginErr').style.display = 'block'; }
    }
    document.getElementById('loginBtn').addEventListener('click', attempt);
    document.getElementById('loginPwd').addEventListener('keydown', function (e) { if (e.key === 'Enter') attempt(); });
  }

  /* ---------------- Theme toggle ---------------- */
  var THEME_KEY = 'pmgr_theme';
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    var btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0e1626' : '#f4f7fb');
  }
  window.PMGR.applyTheme = applyTheme;
  function setupHeader() {
    applyTheme(currentTheme());
    var tb = document.getElementById('themeBtn');
    if (tb) tb.addEventListener('click', function () {
      var next = currentTheme() === 'light' ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
    var lb = document.getElementById('langBtn');
    if (lb) lb.addEventListener('click', function () { ui.toast('الإنجليزي قريباً 🇬🇧'); });
  }

  /* ---------------- Service worker ---------------- */
  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW register failed', e); });
    }
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    window.db.migrate();
    updateClubName();
    setupHeader();
    window.router.initRouter();
    renderPage(window.router.getCurrentPage());

    document.addEventListener('pageChanged', function (e) { renderPage(e.detail); });

    registerSW();
  }

  document.addEventListener('DOMContentLoaded', function () {
    showLogin(boot);
  });
})();
