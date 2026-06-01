/* ===================================================================
   grid.js — court availability grid (time x courts) for a given date.
   =================================================================== */
(function () {
  'use strict';
  window.PMGR = window.PMGR || {}; window.PMGR.pages = window.PMGR.pages || {};

  var gridDate = null;
  var SLOT_START = 360;   // 06:00
  var SLOT_END = 1560;    // 02:00 next day
  var STEP = 30;

  function normStart(t) { var m = window.fmt.t2min(t); if (m < SLOT_START) m += 1440; return m; }

  function render(container) {
    if (!gridDate) gridDate = window.fmt.ymd(new Date());
    var s = window.db.getSettings();
    var courts = s.courts || 2;

    var bookings = window.db.bookings.filter(function (b) { return b.date === gridDate && b.status !== 'cancelled'; });

    var slots = [];
    for (var m = SLOT_START; m <= SLOT_END; m += STEP) slots.push(m);

    // occupancy: occ[court][slotIndex] = {type:'start',booking,rowspan} | {type:'covered'} | undefined
    var occ = {};
    for (var c = 1; c <= courts; c++) occ[c] = {};
    bookings.forEach(function (b) {
      var startNorm = normStart(b.startTime);
      var idx = Math.round((startNorm - SLOT_START) / STEP);
      if (idx < 0 || idx >= slots.length) return;
      var span = Math.max(1, Math.ceil((parseInt(b.duration, 10) || STEP) / STEP));
      if (idx + span > slots.length) span = slots.length - idx;
      if (!occ[b.courtNumber]) occ[b.courtNumber] = {};
      occ[b.courtNumber][idx] = { type: 'start', booking: b, rowspan: span };
      for (var k = 1; k < span; k++) occ[b.courtNumber][idx + k] = { type: 'covered' };
    });

    var head = '<tr class="grid-header-row"><th class="grid-time-col grid-corner">الوقت</th>';
    for (var cc = 1; cc <= courts; cc++) head += '<th>ملعب ' + cc + '</th>';
    head += '</tr>';

    var body = '';
    slots.forEach(function (mm, si) {
      var t = window.fmt.min2t(mm % 1440);
      body += '<tr><th class="grid-time-col">' + window.fmt.time12(t) + '</th>';
      for (var court = 1; court <= courts; court++) {
        var cell = occ[court][si];
        if (cell && cell.type === 'covered') continue; // skipped due to rowspan
        if (cell && cell.type === 'start') {
          var b = cell.booking;
          var cls = b.status === 'pending' ? 'grid-cell-pending' : 'grid-cell-booked';
          body += '<td class="' + cls + '" rowspan="' + cell.rowspan + '" data-booking="' + b.id + '">' +
            '<div class="grid-booking-name">' + ui.esc(b.clientName || 'عميل') + '</div>' +
            '<div class="grid-booking-duration">' + (b.duration / 60) + ' س</div></td>';
        } else {
          body += '<td class="grid-cell-empty" data-court="' + court + '" data-time="' + t + '"></td>';
        }
      }
      body += '</tr>';
    });

    container.innerHTML =
      '<div class="page-header"><div class="page-title">📊 الجريد</div></div>' +
      '<div class="date-nav">' +
        '<button class="nav-arrow" data-nav="prev">→</button>' +
        '<div class="date-label">' + window.fmt.dateLabel(gridDate) + '</div>' +
        '<button class="btn btn-secondary today-btn" data-nav="today">اليوم</button>' +
        '<button class="nav-arrow" data-nav="next">←</button>' +
      '</div>' +
      '<div class="grid-legend"><span>🟢 متاح</span><span>🔵 محجوز</span><span>🟡 معلق</span></div>' +
      '<div class="grid-container"><table class="grid-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';

    wire(container);
  }

  function wire(container) {
    container.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var n = btn.getAttribute('data-nav');
        if (n === 'prev') gridDate = window.fmt.addDays(gridDate, -1);
        else if (n === 'next') gridDate = window.fmt.addDays(gridDate, 1);
        else gridDate = window.fmt.ymd(new Date());
        render(container);
      });
    });
    container.querySelectorAll('.grid-cell-empty').forEach(function (td) {
      td.addEventListener('click', function () {
        window.PMGR.openBookingModal({
          date: gridDate,
          startTime: td.getAttribute('data-time'),
          courtNumber: parseInt(td.getAttribute('data-court'), 10)
        });
      });
    });
    container.querySelectorAll('[data-booking]').forEach(function (td) {
      td.addEventListener('click', function (e) { showPopover(e, td.getAttribute('data-booking')); });
    });
  }

  function showPopover(e, id) {
    var existing = document.querySelector('.grid-popover');
    if (existing) existing.remove();
    var b = window.db.bookings.getById(id);
    if (!b) return;
    var calc = window.PMGR.calcBooking(b.startTime, b.duration);
    var paid = (parseFloat(b.cash) || 0) + (parseFloat(b.visa) || 0);
    var pop = document.createElement('div');
    pop.className = 'grid-popover';
    pop.innerHTML =
      '<div style="font-weight:700;margin-bottom:6px">' + ui.esc(b.clientName || 'عميل') + '</div>' +
      '<div class="muted" style="margin-bottom:4px">🕒 ' + window.fmt.time12(b.startTime) + ' – ' + window.fmt.time12(calc.endTime) + '</div>' +
      '<div class="muted" style="margin-bottom:4px">⏱ ' + (b.duration / 60) + ' س · 🎾 ملعب ' + b.courtNumber + '</div>' +
      '<div style="font-weight:700;color:var(--primary);margin-bottom:8px">' + window.fmt.money(paid || calc.expected) + '</div>' +
      '<button class="btn btn-primary btn-sm btn-block" id="popDetails">تفاصيل / تعديل</button>';
    document.body.appendChild(pop);
    var x = Math.min(e.clientX, window.innerWidth - 220);
    var y = Math.min(e.clientY, window.innerHeight - 180);
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top = Math.max(8, y) + 'px';
    pop.querySelector('#popDetails').addEventListener('click', function () { pop.remove(); window.PMGR.openBookingModal({ editId: id }); });
    setTimeout(function () {
      document.addEventListener('mousedown', function close(ev) {
        if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', close); }
      });
    }, 0);
  }

  // Re-render grid after a booking is saved while on grid page
  document.addEventListener('pageChanged', function (e) { if (e.detail === 'grid') gridDate = gridDate || window.fmt.ymd(new Date()); });

  window.PMGR.pages.grid = render;
})();
