/* ===================================================================
   stats.js — KPIs + charts (Chart.js lazy-loaded from CDN).
   =================================================================== */
(function () {
  'use strict';
  window.PMGR = window.PMGR || {}; window.PMGR.pages = window.PMGR.pages || {};

  var CHART_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
  var period = 'month';
  var customFrom = null, customTo = null;
  var charts = [];

  function range() {
    var today = new Date();
    var to = window.fmt.ymd(today), from;
    if (period === 'week') from = window.fmt.addDays(to, -6);
    else if (period === 'month') from = window.fmt.addDays(to, -29);
    else if (period === 'custom') { from = customFrom || window.fmt.addDays(to, -29); to = customTo || to; }
    else from = window.fmt.addDays(to, -29);
    return { from: from, to: to };
  }

  function render(container) {
    destroyCharts();
    var r = range();
    var bookings = window.db.bookings.filter(function (b) { return b.date >= r.from && b.date <= r.to && b.status !== 'cancelled'; });

    var totalRevenue = 0, totalCash = 0, totalVisa = 0, totalHours = 0;
    var methodCount = { cash: 0, visa: 0, mixed: 0, pending: 0 };
    var byCourt = {}, byHour = {}, byClient = {}, byDate = {};
    bookings.forEach(function (b) {
      var amt = (parseFloat(b.cash) || 0) + (parseFloat(b.visa) || 0);
      totalRevenue += amt; totalCash += parseFloat(b.cash) || 0; totalVisa += parseFloat(b.visa) || 0;
      totalHours += (parseInt(b.duration, 10) || 0) / 60;
      methodCount[b.paymentMethod] = (methodCount[b.paymentMethod] || 0) + 1;
      byCourt[b.courtNumber] = (byCourt[b.courtNumber] || 0) + (parseInt(b.duration, 10) || 0) / 60;
      var h = parseInt((b.startTime || '0').split(':')[0], 10); byHour[h] = (byHour[h] || 0) + 1;
      if (b.clientName) byClient[b.clientName] = (byClient[b.clientName] || 0) + amt;
      byDate[b.date] = (byDate[b.date] || 0) + amt;
    });

    var s = window.db.getSettings();
    container.innerHTML =
      '<div class="page-header"><div class="page-title">📈 إحصائيات</div></div>' +
      '<div class="chip-row mb-12">' +
        chip('week', 'هذا الأسبوع') + chip('month', 'آخر 30 يوم') + chip('custom', 'مخصص') +
      '</div>' +
      (period === 'custom' ? '<div class="form-row mb-12"><div class="form-group"><label>من</label><input type="date" id="stFrom" value="' + r.from + '"></div>' +
        '<div class="form-group"><label>إلى</label><input type="date" id="stTo" value="' + r.to + '"></div></div>' : '') +
      '<div class="grid-4 mb-12">' +
        statCard(window.fmt.money(totalRevenue), 'إجمالي الإيراد') +
        statCard(bookings.length, 'عدد الحجوزات') +
        statCard(window.fmt.num(totalHours) + ' س', 'ساعات اللعب') +
        statCard(window.fmt.money(bookings.length ? totalRevenue / bookings.length : 0), 'متوسط الحجز') +
      '</div>' +
      chartCard('revChart', '💰 الإيراد عبر الزمن') +
      chartCard('methodChart', '💳 توزيع طرق الدفع') +
      chartCard('courtChart', '🎾 استغلال الملاعب (ساعات)') +
      chartCard('hourChart', '🕒 ساعات الذروة') +
      topClientsCard(byClient);

    wire(container);

    loadChart(function (ok) {
      if (!ok) { markChartsUnavailable(container); return; }
      drawRevenue(container, byDate, r);
      drawMethods(container, methodCount);
      drawCourts(container, byCourt);
      drawHours(container, byHour);
    });
  }

  function wire(container) {
    container.querySelectorAll('[data-period]').forEach(function (b) {
      b.addEventListener('click', function () { period = b.getAttribute('data-period'); render(container); });
    });
    var f = container.querySelector('#stFrom'), t = container.querySelector('#stTo');
    if (f) f.addEventListener('change', function () { customFrom = f.value; render(container); });
    if (t) t.addEventListener('change', function () { customTo = t.value; render(container); });
  }

  function drawRevenue(container, byDate, r) {
    var labels = [], data = [], cur = r.from;
    var guard = 0;
    while (cur <= r.to && guard < 400) { labels.push(window.fmt.dateShort(cur)); data.push(Math.round(byDate[cur] || 0)); cur = window.fmt.addDays(cur, 1); guard++; }
    newChart(container, 'revChart', { type: 'line', data: { labels: labels, datasets: [{ label: 'الإيراد', data: data, borderColor: '#185FA5', backgroundColor: 'rgba(24,95,165,0.1)', fill: true, tension: 0.3 }] }, options: baseOpts() });
  }
  function drawMethods(container, mc) {
    newChart(container, 'methodChart', { type: 'doughnut', data: { labels: ['كاش', 'فيزا', 'مختلط', 'معلق'], datasets: [{ data: [mc.cash || 0, mc.visa || 0, mc.mixed || 0, mc.pending || 0], backgroundColor: ['#27500A', '#185FA5', '#633806', '#94a3b8'] }] }, options: baseOpts(true) });
  }
  function drawCourts(container, byCourt) {
    var labels = Object.keys(byCourt).sort(), data = labels.map(function (k) { return Math.round((byCourt[k]) * 10) / 10; });
    newChart(container, 'courtChart', { type: 'bar', data: { labels: labels.map(function (k) { return 'ملعب ' + k; }), datasets: [{ label: 'ساعات', data: data, backgroundColor: '#185FA5' }] }, options: baseOpts() });
  }
  function drawHours(container, byHour) {
    var labels = [], data = [];
    for (var h = 6; h <= 25; h++) { var hh = h % 24; labels.push(window.fmt.time12(String(hh).padStart(2, '0') + ':00')); data.push(byHour[hh] || 0); }
    newChart(container, 'hourChart', { type: 'bar', data: { labels: labels, datasets: [{ label: 'حجوزات', data: data, backgroundColor: '#633806' }] }, options: baseOpts() });
  }

  function topClientsCard(byClient) {
    var arr = Object.keys(byClient).map(function (k) { return { name: k, total: byClient[k] }; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 5);
    return '<div class="chart-card"><div class="chart-title">🏆 أفضل العملاء</div>' +
      (arr.length ? '<div class="table-wrap"><table class="data-table"><tbody>' + arr.map(function (c, i) {
        return '<tr><td>' + (i + 1) + '</td><td style="text-align:right">' + ui.esc(c.name) + '</td><td>' + window.fmt.money(c.total) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="muted">لا توجد بيانات</div>') + '</div>';
  }

  /* ---- chart helpers ---- */
  function baseOpts(legend) {
    return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: !!legend, labels: { font: { family: 'Cairo' } } } }, scales: legend ? {} : { x: { ticks: { font: { family: 'Cairo' } } }, y: { beginAtZero: true, ticks: { font: { family: 'Cairo' } } } } };
  }
  function newChart(container, id, cfg) {
    var canvas = container.querySelector('#' + id); if (!canvas || !window.Chart) return;
    try { charts.push(new window.Chart(canvas.getContext('2d'), cfg)); } catch (e) { console.error('chart ' + id, e); }
  }
  function destroyCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) {} }); charts = []; }
  function markChartsUnavailable(container) {
    container.querySelectorAll('.chart-box').forEach(function (box) { box.innerHTML = '<div class="empty-state">الرسوم البيانية تحتاج اتصال بالإنترنت</div>'; });
  }
  function loadChart(cb) {
    if (window.Chart) { cb(true); return; }
    if (document.querySelector('script[data-chart]')) { document.querySelector('script[data-chart]').addEventListener('load', function () { cb(!!window.Chart); }); return; }
    var sc = document.createElement('script'); sc.src = CHART_SRC; sc.setAttribute('data-chart', '1');
    sc.onload = function () { cb(!!window.Chart); }; sc.onerror = function () { cb(false); };
    document.head.appendChild(sc);
  }

  function chip(key, label) { return '<button class="chip' + (period === key ? ' active' : '') + '" data-period="' + key + '">' + label + '</button>'; }
  function statCard(v, l) { return '<div class="stat-card"><div class="value">' + v + '</div><div class="label">' + l + '</div></div>'; }
  function chartCard(id, title) { return '<div class="chart-card"><div class="chart-title">' + title + '</div><div class="chart-box"><canvas id="' + id + '"></canvas></div></div>'; }

  document.addEventListener('pageChanged', function (e) { if (e.detail !== 'stats') destroyCharts(); });

  window.PMGR.pages.stats = render;
})();
