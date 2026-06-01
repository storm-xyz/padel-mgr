/* ===================================================================
   bookings.js — Bookings page + the shared booking/receipt/collect modals.
   Exposes window.PMGR.openBookingModal({date,startTime,courtNumber,editId}).
   =================================================================== */
(function () {
  'use strict';
  window.PMGR = window.PMGR || {}; window.PMGR.pages = window.PMGR.pages || {};

  var selectedDate = null;
  var activeFilter = 'all';

  var FILTERS = [
    { key: 'all', label: 'الكل' },
    { key: 'cash', label: '💵 كاش' },
    { key: 'visa', label: '💳 فيزا' },
    { key: 'mixed', label: '🔗 مختلط' },
    { key: 'pending', label: '⚠️ معلق' },
    { key: 'upcoming', label: '📅 قادم' }
  ];

  var DURATIONS = [
    { v: 30, l: '30د' }, { v: 60, l: '1س' }, { v: 90, l: '1.5س' },
    { v: 120, l: '2س' }, { v: 150, l: '2.5س' }, { v: 180, l: '3س' }
  ];

  /* ---------------- Pricing / overtime ---------------- */
  function normStart(t) {
    var m = window.fmt.t2min(t);
    if (m < 360) m += 1440; // before 06:00 → after-midnight session
    return m;
  }
  function bucketRate(startTime, s) {
    var h = parseInt(startTime.split(':')[0], 10);
    var morning = h >= 6 && h < 18;
    return morning ? (parseFloat(s.morningPrice) || 0) : (parseFloat(s.eveningPrice) || 0);
  }
  // Returns {expected, base, overtimeMinutes, overtimeAmount, hasOvertime, endTime}
  function calcBooking(startTime, durationMin) {
    var s = window.db.getSettings();
    durationMin = parseInt(durationMin, 10) || 0;
    var start = normStart(startTime);
    var end = start + durationMin;
    var threshold = 1440 + 60; // 01:00 next day
    var rate = bucketRate(startTime, s);
    var normalPerMin = rate / 60;

    var otMins = 0;
    if (s.overtimeEnabled) otMins = Math.max(0, end - threshold);
    if (otMins > durationMin) otMins = durationMin;
    var normalMins = durationMin - otMins;

    var otPerMin = (parseFloat(s.overtimePrice) > 0)
      ? (parseFloat(s.overtimePrice) / 60)
      : (1.5 * (parseFloat(s.eveningPrice) || 0) / 60);

    var base = normalMins * normalPerMin;
    var overtimeAmount = Math.round(otMins * otPerMin);
    var expected = Math.round(base + overtimeAmount);

    return {
      expected: expected,
      base: Math.round(base),
      overtimeMinutes: otMins,
      overtimeAmount: overtimeAmount,
      hasOvertime: otMins > 0,
      endTime: window.fmt.min2t(window.fmt.t2min(startTime) + durationMin)
    };
  }
  window.PMGR.calcBooking = calcBooking;

  function bookingsForDate(date) {
    return window.db.bookings.filter(function (b) { return b.date === date; })
      .sort(function (a, b) { return normStart(a.startTime) - normStart(b.startTime); });
  }

  function payBadge(b) {
    if (b.status === 'cancelled') return '<span class="badge badge-gray">ملغى</span>';
    var map = {
      cash: ['badge-success', '💵 كاش'], visa: ['badge-info', '💳 فيزا'],
      mixed: ['badge-warning', '🔗 مختلط'], pending: ['badge-warning', '⏳ معلق']
    };
    var m = map[b.paymentMethod] || map.pending;
    return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
  }
  function bookingAmount(b) { return (parseFloat(b.cash) || 0) + (parseFloat(b.visa) || 0); }

  /* ---------------- Page render ---------------- */
  function render(container) {
    if (!selectedDate) selectedDate = window.fmt.ymd(new Date());
    var s = window.db.getSettings();
    var list = bookingsForDate(selectedDate);

    var totalCash = 0, totalVisa = 0, totalHours = 0;
    list.forEach(function (b) {
      if (b.status === 'cancelled') return;
      totalCash += parseFloat(b.cash) || 0;
      totalVisa += parseFloat(b.visa) || 0;
      totalHours += (parseInt(b.duration, 10) || 0) / 60;
    });

    var today = window.fmt.ymd(new Date());
    var filtered = list.filter(function (b) {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'upcoming') return b.date >= today && b.status !== 'cancelled';
      if (activeFilter === 'pending') return b.status === 'pending';
      return b.paymentMethod === activeFilter;
    });

    var html = '' +
      '<div class="page-header"><div class="page-title">🏸 الحجوزات</div></div>' +
      dateNavHtml() +
      '<div class="grid-4 mb-12">' +
        statCard(list.filter(function (b) { return b.status !== 'cancelled'; }).length, 'عدد الحجوزات') +
        statCard(window.fmt.num(totalCash), 'كاش (' + s.currency + ')') +
        statCard(window.fmt.num(totalVisa), 'فيزا (' + s.currency + ')') +
        statCard(window.fmt.num(totalHours), 'ساعات') +
      '</div>' +
      '<div class="chip-row mb-12">' + FILTERS.map(function (f) {
        return '<button class="chip' + (activeFilter === f.key ? ' active' : '') + '" data-filter="' + f.key + '">' + f.label + '</button>';
      }).join('') + '</div>' +
      '<div id="bookingsList">' + (filtered.length ? filtered.map(bookingCardHtml).join('') :
        '<div class="empty-state"><span class="icon">🏸</span>لا توجد حجوزات لهذا اليوم</div>') + '</div>' +
      '<button class="fab" id="newBookingBtn">＋ حجز جديد</button>';

    container.innerHTML = html;
    wire(container);
  }

  function dateNavHtml() {
    return '<div class="date-nav">' +
      '<button class="nav-arrow" data-nav="prev">→</button>' +
      '<div class="date-label" id="dateLabel">' + window.fmt.dateLabel(selectedDate) + '</div>' +
      '<button class="btn btn-secondary today-btn" data-nav="today">اليوم</button>' +
      '<button class="nav-arrow" data-nav="next">←</button>' +
      '</div>';
  }
  function statCard(value, label) {
    return '<div class="stat-card"><div class="value">' + value + '</div><div class="label">' + label + '</div></div>';
  }

  function bookingCardHtml(b) {
    var c = calcBooking(b.startTime, b.duration);
    var amount = bookingAmount(b);
    var collect = b.status === 'pending'
      ? '<button class="btn btn-success btn-sm" data-act="collect" data-id="' + b.id + '">تحصيل</button>' : '';
    return '<div class="booking-card ' + (b.status || 'confirmed') + '">' +
      '<div class="bc-top">' +
        '<div>' +
          '<div class="bc-name">' + ui.esc(b.clientName || 'بدون اسم') + '</div>' +
          '<div class="bc-meta">' +
            '<span>🕒 ' + window.fmt.time12(b.startTime) + ' – ' + window.fmt.time12(c.endTime) + '</span>' +
            '<span>⏱ ' + (b.duration / 60) + ' س</span>' +
            '<span>🎾 ملعب ' + b.courtNumber + '</span>' +
            (b.phone ? '<span>📞 ' + ui.esc(b.phone) + '</span>' : '') +
          '</div>' +
          '<div class="mt-12">' + payBadge(b) + (c.hasOvertime ? ' <span class="badge badge-warning">⏱ OT ' + c.overtimeMinutes + 'د</span>' : '') + '</div>' +
        '</div>' +
        '<div class="bc-amount">' + window.fmt.money(amount || c.expected) + '</div>' +
      '</div>' +
      '<div class="bc-actions">' +
        collect +
        '<button class="btn btn-secondary btn-sm" data-act="edit" data-id="' + b.id + '">✏️ تعديل</button>' +
        '<button class="btn btn-secondary btn-sm" data-act="receipt" data-id="' + b.id + '">🧾 وصل</button>' +
        '<button class="btn btn-danger btn-sm" data-act="del" data-id="' + b.id + '">🗑️</button>' +
      '</div>' +
    '</div>';
  }

  function wire(container) {
    container.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var n = btn.getAttribute('data-nav');
        if (n === 'prev') selectedDate = window.fmt.addDays(selectedDate, -1);
        else if (n === 'next') selectedDate = window.fmt.addDays(selectedDate, 1);
        else selectedDate = window.fmt.ymd(new Date());
        render(container);
      });
    });
    container.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () { activeFilter = btn.getAttribute('data-filter'); render(container); });
    });
    container.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id'), act = btn.getAttribute('data-act');
        if (act === 'edit') openBookingModal({ editId: id });
        else if (act === 'del') deleteBooking(id, container);
        else if (act === 'receipt') openReceipt(id);
        else if (act === 'collect') openCollect(id);
      });
    });
    var nb = container.querySelector('#newBookingBtn');
    if (nb) nb.addEventListener('click', function () { openBookingModal({ date: selectedDate }); });
  }

  function deleteBooking(id, container) {
    if (!confirm('حذف هذا الحجز نهائياً؟')) return;
    window.db.bookings.remove(id);
    ui.toast('تم حذف الحجز ✓');
    render(container);
  }

  /* ---------------- Conflict detection ---------------- */
  function hasConflict(date, court, startTime, durationMin, excludeId) {
    var s = normStart(startTime), e = s + (parseInt(durationMin, 10) || 0);
    return window.db.bookings.filter(function (b) {
      return b.date === date && b.courtNumber === court && b.id !== excludeId && b.status !== 'cancelled';
    }).some(function (b) {
      var bs = normStart(b.startTime), be = bs + (parseInt(b.duration, 10) || 0);
      return s < be && e > bs;
    });
  }

  /* ---------------- Booking modal ---------------- */
  var draft = null;

  function timeOptions(selected) {
    var opts = '';
    for (var m = 360; m <= 1560; m += 15) { // 06:00 → 02:00 next day
      var t = window.fmt.min2t(m % 1440);
      opts += '<option value="' + t + '"' + (t === selected ? ' selected' : '') + '>' + window.fmt.time12(t) + '</option>';
    }
    return opts;
  }

  function openBookingModal(opts) {
    opts = opts || {};
    var s = window.db.getSettings();
    var existing = opts.editId ? window.db.bookings.getById(opts.editId) : null;

    draft = {
      editId: opts.editId || null,
      duration: existing ? existing.duration : 60,
      court: existing ? existing.courtNumber : (opts.courtNumber || 1),
      pay: existing ? existing.paymentMethod : 'cash',
      expenses: existing && Array.isArray(existing.expenses) ? existing.expenses.slice() : []
    };
    var date = existing ? existing.date : (opts.date || selectedDate || window.fmt.ymd(new Date()));
    var startTime = existing ? existing.startTime : (opts.startTime || '18:00');

    var courtsHtml = '';
    for (var i = 1; i <= (s.courts || 2); i++) {
      courtsHtml += '<button type="button" class="opt-btn' + (draft.court === i ? ' active' : '') + '" data-court="' + i + '">ملعب ' + i + '</button>';
    }
    var durHtml = DURATIONS.map(function (d) {
      return '<button type="button" class="opt-btn' + (draft.duration === d.v ? ' active' : '') + '" data-dur="' + d.v + '">' + d.l + '</button>';
    }).join('') + '<button type="button" class="opt-btn" data-dur="manual">يدوي</button>';

    var payHtml = [['pending', '⏳ معلق'], ['cash', '💵 كاش'], ['visa', '💳 فيزا'], ['mixed', '🔗 مختلط']].map(function (p) {
      return '<button type="button" class="opt-btn' + (draft.pay === p[0] ? ' active' : '') + '" data-pay="' + p[0] + '">' + p[1] + '</button>';
    }).join('');

    var html =
      '<div class="modal-header"><div class="modal-title">' + (existing ? 'تعديل حجز' : 'حجز جديد') + '</div>' +
        '<button class="modal-close" data-close>✕</button></div>' +
      '<div class="form-group"><label>اسم العميل *</label><input id="bName" autofocus value="' + ui.esc(existing ? existing.clientName : '') + '"></div>' +
      '<div class="form-group"><label>رقم الهاتف</label><input id="bPhone" type="tel" value="' + ui.esc(existing ? existing.phone : '') + '"></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label>التاريخ</label><input id="bDate" type="date" value="' + date + '"></div>' +
        '<div class="form-group"><label>وقت البداية</label><select id="bStart">' + timeOptions(startTime) + '</select></div>' +
      '</div>' +
      '<div class="form-group"><label>المدة</label><div class="duration-grid" id="durGrid">' + durHtml + '</div>' +
        '<input id="bDurManual" type="number" placeholder="دقائق" style="margin-top:8px;display:none" value="' + (existing ? existing.duration : '') + '"></div>' +
      '<div class="form-group"><label>الملعب</label><div class="court-grid" id="courtGrid">' + courtsHtml + '</div></div>' +
      '<div class="form-group"><label>طريقة الدفع</label><div class="pay-grid" id="payGrid">' + payHtml + '</div></div>' +
      '<div id="payAmounts"></div>' +
      '<div class="form-group"><label>عربون (اختياري)</label><input id="bDeposit" type="number" value="' + (existing ? existing.downPayment || '' : '') + '"></div>' +
      '<div class="form-group"><label>ملاحظات</label><textarea id="bNotes">' + ui.esc(existing ? existing.notes : '') + '</textarea></div>' +
      '<div class="form-group"><label>مصاريف مرتبطة</label><div id="expList"></div>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="addExp">＋ إضافة مصروف</button></div>' +
      '<div id="confWarn" class="text-danger mb-12" style="display:none;font-size:13px"></div>' +
      '<div class="booking-summary" id="bSummary"></div>' +
      '<div class="modal-actions"><button class="btn btn-primary" id="saveBooking">حفظ الحجز ✓</button>' +
        '<button class="btn btn-secondary" data-close>إلغاء</button></div>';

    var overlay = ui.openModal(html);
    var $ = function (id) { return overlay.querySelector('#' + id); };

    function renderExpenses() {
      $('expList').innerHTML = draft.expenses.map(function (ex, i) {
        return '<div class="expense-row"><input value="' + ui.esc(ex.label || '') + '" data-exp-label="' + i + '" placeholder="البيان">' +
          '<input class="amt" type="number" value="' + (ex.amount || '') + '" data-exp-amt="' + i + '" placeholder="مبلغ">' +
          '<button type="button" class="btn btn-danger btn-icon btn-sm" data-exp-del="' + i + '">✕</button></div>';
      }).join('');
      overlay.querySelectorAll('[data-exp-label]').forEach(function (el) {
        el.addEventListener('input', function () { draft.expenses[+el.getAttribute('data-exp-label')].label = el.value; });
      });
      overlay.querySelectorAll('[data-exp-amt]').forEach(function (el) {
        el.addEventListener('input', function () { draft.expenses[+el.getAttribute('data-exp-amt')].amount = parseFloat(el.value) || 0; updateSummary(); });
      });
      overlay.querySelectorAll('[data-exp-del]').forEach(function (el) {
        el.addEventListener('click', function () { draft.expenses.splice(+el.getAttribute('data-exp-del'), 1); renderExpenses(); updateSummary(); });
      });
    }

    function renderPayAmounts() {
      var calc = currentCalc();
      var rem = Math.max(0, calc.expected - (parseFloat($('bDeposit').value) || 0));
      var cashVal = existing ? existing.cash : rem;
      var visaVal = existing ? existing.visa : rem;
      var box = $('payAmounts');
      if (draft.pay === 'cash') box.innerHTML = '<div class="form-group"><label>المبلغ كاش</label><input id="payCash" type="number" value="' + (existing && existing.paymentMethod === 'cash' ? existing.cash : rem) + '"></div>';
      else if (draft.pay === 'visa') box.innerHTML = '<div class="form-group"><label>المبلغ فيزا</label><input id="payVisa" type="number" value="' + (existing && existing.paymentMethod === 'visa' ? existing.visa : rem) + '"></div>';
      else if (draft.pay === 'mixed') box.innerHTML = '<div class="form-row"><div class="form-group"><label>كاش</label><input id="payCash" type="number" value="' + (existing ? existing.cash || 0 : 0) + '"></div><div class="form-group"><label>فيزا</label><input id="payVisa" type="number" value="' + (existing ? existing.visa || 0 : 0) + '"></div></div>';
      else box.innerHTML = '';
      if (box.querySelector('#payCash')) box.querySelector('#payCash').addEventListener('input', updateSummary);
      if (box.querySelector('#payVisa')) box.querySelector('#payVisa').addEventListener('input', updateSummary);
    }

    function currentCalc() {
      return calcBooking($('bStart').value, draft.duration);
    }
    function updateSummary() {
      var calc = currentCalc();
      var deposit = parseFloat($('bDeposit').value) || 0;
      var rem = calc.expected - deposit;
      var html = '<div class="row"><span>المتوقع</span><b>' + window.fmt.money(calc.expected) + '</b></div>' +
        '<div class="row"><span>العربون</span><b>' + window.fmt.money(deposit) + '</b></div>' +
        '<div class="row"><span>الباقي</span><b>' + window.fmt.money(rem) + '</b></div>';
      if (calc.hasOvertime) html += '<div class="row ot"><span>⏱ أوفر تايم (' + calc.overtimeMinutes + 'د)</span><b>' + window.fmt.money(calc.overtimeAmount) + '</b></div>';
      $('bSummary').innerHTML = html;
      checkConflict();
    }
    function checkConflict() {
      var w = $('confWarn');
      var date2 = $('bDate').value, court = draft.court, st = $('bStart').value;
      if (hasConflict(date2, court, st, draft.duration, draft.editId)) {
        w.style.display = 'block';
        w.textContent = '⛔ تعارض: ملعب ' + court + ' محجوز في هذا الوقت';
      } else w.style.display = 'none';
    }

    // duration buttons
    overlay.querySelectorAll('[data-dur]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('[data-dur]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var v = btn.getAttribute('data-dur');
        if (v === 'manual') { $('bDurManual').style.display = 'block'; $('bDurManual').focus(); }
        else { $('bDurManual').style.display = 'none'; draft.duration = parseInt(v, 10); updateSummary(); renderPayAmounts(); }
      });
    });
    $('bDurManual').addEventListener('input', function () { draft.duration = parseInt(this.value, 10) || 0; updateSummary(); renderPayAmounts(); });
    // court
    overlay.querySelectorAll('[data-court]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('[data-court]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active'); draft.court = parseInt(btn.getAttribute('data-court'), 10); checkConflict();
      });
    });
    // pay
    overlay.querySelectorAll('[data-pay]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('[data-pay]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active'); draft.pay = btn.getAttribute('data-pay'); renderPayAmounts(); updateSummary();
      });
    });
    $('bStart').addEventListener('change', function () { updateSummary(); renderPayAmounts(); });
    $('bDate').addEventListener('change', checkConflict);
    $('bDeposit').addEventListener('input', function () { updateSummary(); renderPayAmounts(); });
    $('addExp').addEventListener('click', function () { draft.expenses.push({ label: '', amount: 0 }); renderExpenses(); });

    overlay.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { ui.closeModal(overlay); }); });
    $('saveBooking').addEventListener('click', function () { saveBooking(overlay, $, existing); });

    renderExpenses();
    renderPayAmounts();
    updateSummary();
  }
  window.PMGR.openBookingModal = openBookingModal;

  function saveBooking(overlay, $, existing) {
    var name = $('bName').value.trim();
    if (!name) { ui.toast('أدخل اسم العميل ⚠️', '#e03131'); return; }
    if (!draft.duration || draft.duration <= 0) { ui.toast('أدخل مدة الحجز ⚠️', '#e03131'); return; }

    var date = $('bDate').value, startTime = $('bStart').value;
    if (hasConflict(date, draft.court, startTime, draft.duration, draft.editId)) {
      if (!confirm('⛔ يوجد تعارض في الوقت. حفظ على أي حال؟')) return;
    }

    var calc = calcBooking(startTime, draft.duration);
    var cash = 0, visa = 0, status = 'confirmed';
    if (draft.pay === 'cash') cash = parseFloat($('payCash') ? $('payCash').value : 0) || 0;
    else if (draft.pay === 'visa') visa = parseFloat($('payVisa') ? $('payVisa').value : 0) || 0;
    else if (draft.pay === 'mixed') { cash = parseFloat($('payCash').value) || 0; visa = parseFloat($('payVisa').value) || 0; }
    else status = 'pending';

    var data = {
      date: date,
      clientName: name,
      phone: $('bPhone').value.trim(),
      courtNumber: draft.court,
      startTime: startTime,
      duration: draft.duration,
      paymentMethod: draft.pay,
      cash: cash,
      visa: visa,
      downPayment: parseFloat($('bDeposit').value) || 0,
      expenses: draft.expenses.filter(function (e) { return e.label || e.amount; }),
      notes: $('bNotes').value.trim(),
      status: status,
      hasOvertime: calc.hasOvertime,
      overtimeMinutes: calc.overtimeMinutes,
      overtimeAmount: calc.overtimeAmount
    };

    var saved;
    if (draft.editId) saved = window.db.bookings.update(draft.editId, data);
    else saved = window.db.bookings.add(data);

    ui.closeModal(overlay);
    ui.toast(draft.editId ? 'تم التحديث ✓' : 'تم حفظ الحجز ✓');
    selectedDate = date;
    if (window.router.getCurrentPage() === 'bookings') render(document.querySelector('.page[data-page="bookings"]'));
    else window.PMGR.refresh(window.router.getCurrentPage());

    if (!draft.editId) openReceipt(saved.id);
  }

  /* ---------------- Receipt modal ---------------- */
  function openReceipt(id) {
    var b = window.db.bookings.getById(id);
    if (!b) return;
    var s = window.db.getSettings();
    var calc = calcBooking(b.startTime, b.duration);
    var paid = (parseFloat(b.cash) || 0) + (parseFloat(b.visa) || 0);
    var methodLabel = { cash: 'كاش', visa: 'فيزا', mixed: 'مختلط', pending: 'معلق' }[b.paymentMethod] || '';

    var lines =
      '<div class="r-line"><span>التاريخ</span><span>' + window.fmt.dateLabel(b.date) + '</span></div>' +
      '<div class="r-line"><span>العميل</span><span>' + ui.esc(b.clientName) + '</span></div>' +
      (b.phone ? '<div class="r-line"><span>الهاتف</span><span>' + ui.esc(b.phone) + '</span></div>' : '') +
      '<div class="r-line"><span>الوقت</span><span>' + window.fmt.time12(b.startTime) + ' – ' + window.fmt.time12(calc.endTime) + '</span></div>' +
      '<div class="r-line"><span>الملعب</span><span>ملعب ' + b.courtNumber + '</span></div>' +
      '<div class="r-line"><span>المدة</span><span>' + (b.duration / 60) + ' ساعة</span></div>' +
      (calc.hasOvertime ? '<div class="r-line"><span>أوفر تايم</span><span>' + calc.overtimeMinutes + 'د (' + window.fmt.money(calc.overtimeAmount) + ')</span></div>' : '') +
      '<div class="r-line"><span>طريقة الدفع</span><span>' + methodLabel + '</span></div>' +
      (b.downPayment ? '<div class="r-line"><span>العربون</span><span>' + window.fmt.money(b.downPayment) + '</span></div>' : '') +
      '<div class="r-line r-total"><span>الإجمالي</span><span>' + window.fmt.money(paid || calc.expected) + '</span></div>';

    var html =
      '<div class="modal-header"><div class="modal-title">🧾 وصل</div><button class="modal-close" data-close>✕</button></div>' +
      '<div class="receipt" id="receiptBody">' +
        '<div class="r-club">🏸 ' + ui.esc(s.clubName) + '</div>' +
        '<div class="r-no">وصل رقم: ' + (b.id || '').slice(-8) + '</div>' +
        lines +
      '</div>' +
      '<div class="modal-actions mt-16">' +
        '<button class="btn btn-success" id="rWhats">واتساب</button>' +
        '<button class="btn btn-secondary" id="rPrint">طباعة</button>' +
        '<button class="btn btn-ghost" data-close>إغلاق</button>' +
      '</div>';
    var overlay = ui.openModal(html);
    overlay.querySelectorAll('[data-close]').forEach(function (b2) { b2.addEventListener('click', function () { ui.closeModal(overlay); }); });
    overlay.querySelector('#rPrint').addEventListener('click', function () { window.print(); });
    overlay.querySelector('#rWhats').addEventListener('click', function () {
      var txt = '🏸 ' + s.clubName + '\nوصل رقم: ' + (b.id || '').slice(-8) + '\n' +
        'العميل: ' + b.clientName + '\nالتاريخ: ' + window.fmt.dateLabel(b.date) + '\n' +
        'الوقت: ' + window.fmt.time12(b.startTime) + ' – ' + window.fmt.time12(calc.endTime) + '\n' +
        'ملعب ' + b.courtNumber + ' • ' + (b.duration / 60) + ' ساعة\n' +
        'الإجمالي: ' + window.fmt.money(paid || calc.expected);
      var phone = (b.phone || '').replace(/[^0-9]/g, '');
      window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(txt), '_blank');
    });
  }
  window.PMGR.openReceipt = openReceipt;

  /* ---------------- Collect modal (pending → confirmed) ---------------- */
  function openCollect(id) {
    var b = window.db.bookings.getById(id);
    if (!b) return;
    var calc = calcBooking(b.startTime, b.duration);
    var rem = calc.expected - (parseFloat(b.downPayment) || 0);
    var method = 'cash';
    var html =
      '<div class="modal-header"><div class="modal-title">تحصيل — ' + ui.esc(b.clientName) + '</div><button class="modal-close" data-close>✕</button></div>' +
      '<div class="booking-summary"><div class="row"><span>المطلوب</span><b>' + window.fmt.money(rem) + '</b></div></div>' +
      '<div class="form-group"><label>طريقة الدفع</label><div class="pay-grid" id="cPay">' +
        [['cash', '💵 كاش'], ['visa', '💳 فيزا'], ['mixed', '🔗 مختلط']].map(function (p, i) {
          return '<button type="button" class="opt-btn' + (i === 0 ? ' active' : '') + '" data-cpay="' + p[0] + '">' + p[1] + '</button>';
        }).join('') + '</div></div>' +
      '<div id="cAmounts"></div>' +
      '<div class="modal-actions"><button class="btn btn-primary" id="cSave">حفظ التحصيل ✓</button>' +
        '<button class="btn btn-secondary" data-close>إلغاء</button></div>';
    var overlay = ui.openModal(html);
    function renderAmts() {
      var box = overlay.querySelector('#cAmounts');
      if (method === 'cash') box.innerHTML = '<div class="form-group"><label>كاش</label><input id="cCash" type="number" value="' + rem + '"></div>';
      else if (method === 'visa') box.innerHTML = '<div class="form-group"><label>فيزا</label><input id="cVisa" type="number" value="' + rem + '"></div>';
      else box.innerHTML = '<div class="form-row"><div class="form-group"><label>كاش</label><input id="cCash" type="number" value="0"></div><div class="form-group"><label>فيزا</label><input id="cVisa" type="number" value="0"></div></div>';
    }
    overlay.querySelectorAll('[data-cpay]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        overlay.querySelectorAll('[data-cpay]').forEach(function (b2) { b2.classList.remove('active'); });
        btn.classList.add('active'); method = btn.getAttribute('data-cpay'); renderAmts();
      });
    });
    overlay.querySelectorAll('[data-close]').forEach(function (b2) { b2.addEventListener('click', function () { ui.closeModal(overlay); }); });
    overlay.querySelector('#cSave').addEventListener('click', function () {
      var cash = overlay.querySelector('#cCash') ? parseFloat(overlay.querySelector('#cCash').value) || 0 : 0;
      var visa = overlay.querySelector('#cVisa') ? parseFloat(overlay.querySelector('#cVisa').value) || 0 : 0;
      window.db.bookings.update(id, { cash: cash, visa: visa, paymentMethod: method, status: 'confirmed' });
      ui.closeModal(overlay);
      ui.toast('تم التحصيل ✓');
      window.PMGR.refresh('bookings');
    });
    renderAmts();
  }

  window.PMGR.pages.bookings = render;
})();
