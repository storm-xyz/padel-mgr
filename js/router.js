/* ===================================================================
   router.js — SPA navigation between the .page sections.
   =================================================================== */
(function () {
  'use strict';

  var pages = ['bookings', 'grid', 'closing', 'customers', 'academy', 'inventory', 'stats', 'ai', 'settings'];
  var currentPage = 'bookings';

  function showPage(pageName) {
    if (pages.indexOf(pageName) === -1) pageName = 'bookings';

    document.querySelectorAll('.page').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-page') === pageName);
    });

    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-page') === pageName);
    });

    currentPage = pageName;

    try {
      window.history.pushState({ page: pageName }, '', '#' + pageName);
    } catch (e) { /* file:// may block pushState */ }

    document.dispatchEvent(new CustomEvent('pageChanged', { detail: pageName }));

    var main = document.querySelector('.main-content');
    if (main) main.scrollTop = 0;
  }

  function initRouter() {
    var hash = (window.location.hash || '').replace('#', '');
    var initialPage = pages.indexOf(hash) !== -1 ? hash : 'bookings';

    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var target = el.getAttribute('data-page');
        if (target) showPage(target);
      });
    });

    window.addEventListener('popstate', function (e) {
      var page = (e.state && e.state.page) || (window.location.hash || '').replace('#', '') || 'bookings';
      // Update DOM without pushing a new history entry
      if (pages.indexOf(page) === -1) page = 'bookings';
      document.querySelectorAll('.page').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-page') === page);
      });
      document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-page') === page);
      });
      currentPage = page;
      document.dispatchEvent(new CustomEvent('pageChanged', { detail: page }));
    });

    showPage(initialPage);
  }

  window.router = {
    showPage: showPage,
    getCurrentPage: function () { return currentPage; },
    initRouter: initRouter
  };
})();
