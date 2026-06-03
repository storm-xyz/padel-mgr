/* ===================================================================
   grid.js — court availability grid (time x courts) for a given date.
   =================================================================== */
(function () {
  'use strict';
  window.PMGR = window.PMGR || {}; window.PMGR.pages = window.PMGR.pages || {};

  var gridDate = null;
  var SLOT_START = 360;   // 06:00
  var SLOT_END = 1800;    // 06:00 next day
  var STEP = 30;
  var gridState = null;   // { occ, courts, slotsLen, slots } — shared with selection wiring

  function normStart(t) { var m = window.fmt.t2min(t); if (m < SLOT_START) m += 1440; return m; }

  function render(container) {
    if (!gridDate) gridDate = window.fmt.ymd(new Date());
    var s = window.db.getSettings();
    var courts = s.courts || 2;

    // Preserve scroll position so saving a booking doesn't jump back to the start.
    var prevGC = container.querySelector('.grid-container');
    var savedLeft = prevGC ? prevGC.scrollLeft : 0;
    var savedTop = prevGC ? prevGC.scrollTop : 0;
    var main = document.querySelector('.main-content');
    var savedMainTop = main ? main.scrollTop : 0;

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

    gridState = { occ: occ, courts: courts, slotsLen: slots.length, slots: slots };

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
          body += '<td class="grid-cell-empty" data-court="' + court + '" data-time="' + t + '" data-idx="' + si + '"></td>';
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
      '<div class="grid-hint muted">💡 اسحب أو اضغط على الخانات لاختيار فترة الحجز</div>' +
      '<div class="grid-container"><table class="grid-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';

    wire(container);

    // Restore scroll position captured before the re-render.
    var gc = container.querySelector('.grid-container');
    if (gc) { gc.scrollLeft = savedLeft; gc.scrollTop = savedTop; }
    if (main) main.scrollTop = savedMainTop;
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
    setupSelection(container);
    container.querySelectorAll('[data-booking]').forEach(function (td) {
      td.addEventListener('click', function (e) { showPopover(e, td.getAttribute('data-booking')); });
    });
  }

  /* ---------------- Drag / tap selection on empty cells ----------------
     Press (or click) an empty cell and drag across adjacent empty cells in
     the same court to select a time range, then the booking modal opens
     pre-filled with the start time and duration. A single tap selects one
     30-minute slot. The range is clamped to contiguous empty slots. */
  function setupSelection(container) {
    var sel = null; // { court, anchor, focus }

    function cellAt(court, idx) {
      return container.querySelector('.grid-cell-empty[data-court="' + court + '"][data-idx="' + idx + '"]');
    }
    function isEmpty(court, idx) {
      return idx >= 0 && gridState && idx < gridState.slotsLen &&
        gridState.occ[court] && !gridState.occ[court][idx];
    }
    function clampRange(court, anchor, focus) {
      var lo = Math.min(anchor, focus), hi = Math.max(anchor, focus);
      var start = anchor, end = anchor;
      for (var i = anchor - 1; i >= lo; i--) { if (isEmpty(court, i)) start = i; else break; }
      for (var j = anchor + 1; j <= hi; j++) { if (isEmpty(court, j)) end = j; else break; }
      return { start: start, end: end };
    }
    function clearPaint() {
      container.querySelectorAll('.grid-cell-selecting').forEach(function (c) { c.classList.remove('grid-cell-selecting'); });
    }
    function paint(court, start, end) {
      clearPaint();
      for (var i = start; i <= end; i++) { var c = cellAt(court, i); if (c) c.classList.add('grid-cell-selecting'); }
    }

    function onMove(ev) {
      if (!sel) return;
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      var td = el && el.closest ? el.closest('.grid-cell-empty') : null;
      if (td && parseInt(td.getAttribute('data-court'), 10) === sel.court) {
        sel.focus = parseInt(td.getAttribute('data-idx'), 10);
        var r = clampRange(sel.court, sel.anchor, sel.focus);
        paint(sel.court, r.start, r.end);
      }
      if (ev.cancelable) ev.preventDefault();
    }
    function onUp() {
      if (!sel) return;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      var r = clampRange(sel.court, sel.anchor, sel.focus);
      var court = sel.court;
      sel = null;
      clearPaint();
      var count = r.end - r.start + 1;
      var startMin = gridState.slots[r.start];
      window.PMGR.openBookingModal({
        date: gridDate,
        startTime: window.fmt.min2t(startMin % 1440),
        courtNumber: court,
        duration: count * STEP
      });
    }

    container.querySelectorAll('.grid-cell-empty').forEach(function (td) {
      td.addEventListener('pointerdown', function (ev) {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        sel = {
          court: parseInt(td.getAttribute('data-court'), 10),
          anchor: parseInt(td.getAttribute('data-idx'), 10),
          focus: parseInt(td.getAttribute('data-idx'), 10)
        };
        paint(sel.court, sel.anchor, sel.anchor);
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
        if (ev.cancelable) ev.preventDefault();
      });
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
