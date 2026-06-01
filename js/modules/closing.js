/* ===================================================================
   closing.js — Daily closing, period closing, and history.
   =================================================================== */
(function () {
  'use strict';
  window.PMGR = window.PMGR || {}; window.PMGR.pages = window.PMGR.pages || {};

  var tab = 'daily';
  var dailyMode = 'bookings';
  var dExpenses = [];
  var manual = { am: 0, pm: 0 };
  var calc = { expr: '' };

  function render(container) {
    container.innerHTML =
      '<div class="page-header"><div class="page-title">💰 التقفيل</div></div>' +
      '<div class="tabs">' +
        '<button class="tab' + (tab === 'daily' ? ' active' : '') + '" data-tab="daily">📋 التقفيل اليومي</button>' +
        '<button class="tab' + (tab === 'period' ? ' active' : '') + '" data-tab="period">📆 تقفيل الفترة</button>' +
        '<button class="tab' + (tab === 'history' ? ' active' : '') + '" data-tab="history">🗂️ السجل</button>' +
      '</div>' +
      '<div id="closingBody"></div>';
    container.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); render(container); });
    });
    var body = container.querySelector('#closingBody');
    if (tab === 'daily') renderDaily(body);
    else if (tab === 'period') renderPeriod(body);
    else renderHistory(body);
  }

  /* ---------- expected from bookings ---------- */
  function expectedFor(date) {
    var bs = window.db.bookings.filter(function (b) { return b.date === date && b.status !== 'cancelled'; });
    var cash = 0, visa = 0, ot = 0, hours = 0, expected = 0;
    bs.forEach(function (b) {
      var c = window.PMGR.calcBooking(b.startTime, b.duration);
      cash += parseFloat(b.cash) || 0;
      visa += parseFloat(b.visa) || 0;
      ot += parseFloat(b.overtimeAmount) || 0;
      hours += (parseInt(b.duration, 10) || 0) / 60;
      expected += c.expected;
    });
    return { cash: cash, visa: visa, ot: ot, hours: hours, expected: expected, count: bs.length };
  }

  /* ---------- Tab 1: Daily ---------- */
  function renderDaily(body) {
    var today = window.fmt.ymd(new Date());
    body.innerHTML =
      '<div class="tabs" style="max-width:320px">' +
        '<button class="tab' + (dailyMode === 'bookings' ? ' active' : '') + '" data-dmode="bookings">📋 من الحجوزات</button>' +
        '<button class="tab' + (dailyMode === 'manual' ? ' active' : '') + '" data-dmode="manual">🧮 حساب يدوي</button>' +
      '</div>' +
      '<div class="card">' +
        '<div class="form-group"><label>التاريخ</label><input type="date" id="clDate" value="' + today + '"></div>' +
        '<div id="expectedBox"></div>' +
        (dailyMode === 'manual' ? manualInputs() : '') +
        '<div class="divider"></div>' +
        '<div class="ss-title">الإدخال الفعلي</div>' +
        '<div class="form-row">' +
          '<div class="form-group"><label>كاش الدرج</label><input type="number" id="actCash" value="0"></div>' +
          '<div class="form-group"><label>فيزا</label><input type="number" id="actVisa" value="0"></div>' +
        '</div>' +
        '<div class="form-group"><label>المصاريف</label><div id="clExpList"></div>' +
          '<button class="btn btn-secondary btn-sm" id="clAddExp">＋ إضافة مصروف</button></div>' +
        '<div class="booking-summary" id="analysisBox"></div>' +
        '<div class="form-group"><label>ملاحظات</label><textarea id="clNotes"></textarea></div>' +
        '<button class="btn btn-primary btn-block" id="saveClosing">💾 حفظ التقفيل</button>' +
      '</div>' +
      calcHtml();

    wireDaily(body);
  }

  function manualInputs() {
    return '<div class="closing-section"><label>ساعات صباحية</label>' + counter('am') + '</div>' +
      '<div class="closing-section"><label>ساعات مسائية</label>' + counter('pm') + '</div>';
  }
  function counter(key) {
    return '<div class="counter-row" data-counter="' + key + '">' +
      '<button class="btn btn-secondary btn-icon" data-step="-1">−</button>' +
      '<span class="cval" id="cval-' + key + '">' + manual[key] + '</span>' +
      '<button class="btn btn-secondary btn-sm" data-step="0.5">+½</button>' +
      '<button class="btn btn-secondary btn-sm" data-step="1">+1</button>' +
      '<button class="btn btn-secondary btn-sm" data-step="2">+2</button>' +
      '<button class="btn btn-secondary btn-sm" data-step="3">+3</button>' +
      '<input type="number" class="amt" data-manualval="' + key + '" value="' + manual[key] + '" style="max-width:90px">' +
      '</div>';
  }

  function wireDaily(body) {
    body.querySelectorAll('[data-dmode]').forEach(function (b) {
      b.addEventListener('click', function () { dailyMode = b.getAttribute('data-dmode'); renderDaily(body); });
    });
    var dateEl = body.querySelector('#clDate');
    dateEl.addEventListener('change', updateExpected);
    body.querySelector('#actCash').addEventListener('input', updateAnalysis);
    body.querySelector('#actVisa').addEventListener('input', updateAnalysis);
    body.querySelector('#clAddExp').addEventListener('click', function () { dExpenses.push({ label: '', amount: 0 }); renderClExp(); });

    body.querySelectorAll('[data-counter]').forEach(function (row) {
      var key = row.getAttribute('data-counter');
      row.querySelectorAll('[data-step]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var step = parseFloat(btn.getAttribute('data-step'));
          if (step === -1) manual[key] = Math.max(0, manual[key] - 0.5);
          else manual[key] += step;
          body.querySelector('#cval-' + key).textContent = manual[key];
          row.querySelector('[data-manualval]').value = manual[key];
          updateExpected();
        });
      });
      row.querySelector('[data-manualval]').addEventListener('input', function () {
        manual[key] = parseFloat(this.value) || 0;
        body.querySelector('#cval-' + key).textContent = manual[key];
        updateExpected();
      });
    });

    body.querySelector('#saveClosing').addEventListener('click', function () { saveClosing(body); });
    wireCalc(body);
    renderClExp();
    updateExpected();

    function updateExpected() { renderExpected(body); updateAnalysis(); }
  }

  function renderExpected(body) {
    var s = window.db.getSettings();
    var box = body.querySelector('#expectedBox');
    if (dailyMode === 'bookings') {
      var ex = expectedFor(body.querySelector('#clDate').value);
      box.innerHTML = '<div class="booking-summary">' +
        '<div class="row"><span>عدد الحجوزات</span><b>' + ex.count + '</b></div>' +
        '<div class="row"><span>إجمالي الساعات</span><b>' + window.fmt.num(ex.hours) + ' س</b></div>' +
        '<div class="row"><span>متوقع كاش</span><b>' + window.fmt.money(ex.cash) + '</b></div>' +
        '<div class="row"><span>متوقع فيزا</span><b>' + window.fmt.money(ex.visa) + '</b></div>' +
        (ex.ot ? '<div class="row ot"><span>أوفر تايم</span><b>' + window.fmt.money(ex.ot) + '</b></div>' : '') +
        '<div class="row r-total"><span>الإجمالي المتوقع</span><b>' + window.fmt.money(ex.expected) + '</b></div></div>';
    } else {
      var exp = manual.am * (parseFloat(s.morningPrice) || 0) + manual.pm * (parseFloat(s.eveningPrice) || 0);
      box.innerHTML = '<div class="booking-summary"><div class="row"><span>المتوقع (يدوي)</span><b>' + window.fmt.money(exp) + '</b></div></div>';
    }
  }

  function expensesTotal() { return dExpenses.reduce(function (s, e) { return s + (parseFloat(e.amount) || 0); }, 0); }

  function updateAnalysis() {
    var body = document.querySelector('.page[data-page="closing"]');
    if (!body) return;
    var actCash = parseFloat((body.querySelector('#actCash') || {}).value) || 0;
    var actVisa = parseFloat((body.querySelector('#actVisa') || {}).value) || 0;
    var box = body.querySelector('#analysisBox');
    if (!box) return;
    var s = window.db.getSettings();
    var expected;
    if (dailyMode === 'bookings') expected = expectedFor(body.querySelector('#clDate').value).expected;
    else expected = manual.am * (parseFloat(s.morningPrice) || 0) + manual.pm * (parseFloat(s.eveningPrice) || 0);

    var exp = expensesTotal();
    var totalRevenue = actCash + actVisa;
    var net = totalRevenue - exp;
    var diff = totalRevenue - expected;
    var vClass = diff === 0 ? 'ok' : (diff > 0 ? 'over' : 'under');
    box.innerHTML =
      '<div class="row"><span>إجمالي الإيراد</span><b>' + window.fmt.money(totalRevenue) + '</b></div>' +
      '<div class="row"><span>المصاريف</span><b>' + window.fmt.money(exp) + '</b></div>' +
      '<div class="row"><span>الصافي</span><b>' + window.fmt.money(net) + '</b></div>' +
      '<div class="row"><span>الفرق عن المتوقع</span><b class="verdict ' + vClass + '">' + (diff > 0 ? '+' : '') + window.fmt.money(diff) + '</b></div>';
  }

  function renderClExp() {
    var body = document.querySelector('.page[data-page="closing"]');
    var list = body && body.querySelector('#clExpList');
    if (!list) return;
    list.innerHTML = dExpenses.map(function (e, i) {
      return '<div class="expense-row"><input value="' + ui.esc(e.label || '') + '" data-cle-label="' + i + '" placeholder="البيان">' +
        '<input class="amt" type="number" value="' + (e.amount || '') + '" data-cle-amt="' + i + '" placeholder="مبلغ">' +
        '<button class="btn btn-danger btn-icon btn-sm" data-cle-del="' + i + '">✕</button></div>';
    }).join('');
    list.querySelectorAll('[data-cle-label]').forEach(function (el) {
      el.addEventListener('input', function () { dExpenses[+el.getAttribute('data-cle-label')].label = el.value; });
    });
    list.querySelectorAll('[data-cle-amt]').forEach(function (el) {
      el.addEventListener('input', function () { dExpenses[+el.getAttribute('data-cle-amt')].amount = parseFloat(el.value) || 0; updateAnalysis(); });
    });
    list.querySelectorAll('[data-cle-del]').forEach(function (el) {
      el.addEventListener('click', function () { dExpenses.splice(+el.getAttribute('data-cle-del'), 1); renderClExp(); updateAnalysis(); });
    });
  }

  function saveClosing(body) {
    var s = window.db.getSettings();
    var date = body.querySelector('#clDate').value;
    var actCash = parseFloat(body.querySelector('#actCash').value) || 0;
    var actVisa = parseFloat(body.querySelector('#actVisa').value) || 0;
    var expected, hours = 0;
    if (dailyMode === 'bookings') { var ex = expectedFor(date); expected = ex.expected; hours = ex.hours; }
    else { expected = manual.am * (parseFloat(s.morningPrice) || 0) + manual.pm * (parseFloat(s.eveningPrice) || 0); hours = manual.am + manual.pm; }
    var exp = expensesTotal();
    window.db.closings.add({
      date: date,
      type: dailyMode === 'bookings' ? 'fromBookings' : 'manual',
      expectedRevenue: expected,
      actualCash: actCash,
      actualVisa: actVisa,
      expenses: dExpenses.filter(function (e) { return e.label || e.amount; }),
      netRevenue: (actCash + actVisa) - exp,
      totalHours: hours,
      notes: body.querySelector('#clNotes').value.trim()
    });
    dExpenses = [];
    ui.toast('تم حفظ التقفيل ✓');
    render(body.closest('.page') || document.querySelector('.page[data-page="closing"]'));
  }

  /* ---------- Calculator ---------- */
  function calcHtml() {
    return '<details class="card mt-12"><summary style="cursor:pointer;font-weight:700">🧮 آلة حاسبة</summary>' +
      '<div class="calc-display" id="calcDisp">0</div>' +
      '<div class="calc-pad">' +
        ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+'].map(function (k) {
          return '<button class="btn btn-secondary" data-calc="' + k + '">' + k + '</button>';
        }).join('') +
      '</div>' +
      '<div class="grid-3 mt-12"><button class="btn btn-danger" data-calc="AC">AC</button>' +
        '<button class="btn btn-secondary" data-calc="back">←</button>' +
        '<button class="btn btn-secondary" data-calc="paren">( )</button></div>' +
      '<div class="grid-3 mt-12">' +
        '<button class="btn btn-primary" data-calc-to="cash">→ كاش</button>' +
        '<button class="btn btn-primary" data-calc-to="visa">→ فيزا</button>' +
        '<button class="btn btn-primary" data-calc-to="exp">→ مصاريف</button></div>' +
      '</details>';
  }
  function wireCalc(body) {
    var disp = body.querySelector('#calcDisp');
    function show() { disp.textContent = calc.expr || '0'; }
    body.querySelectorAll('[data-calc]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var k = btn.getAttribute('data-calc');
        if (k === 'AC') calc.expr = '';
        else if (k === 'back') calc.expr = calc.expr.slice(0, -1);
        else if (k === '=') {
          try {
            var e = calc.expr.replace(/÷/g, '/').replace(/×/g, '*').replace(/−/g, '-');
            if (/^[0-9+\-*/.() ]+$/.test(e)) calc.expr = String(Math.round(eval(e) * 100) / 100);
          } catch (er) { calc.expr = 'خطأ'; }
        } else calc.expr += k;
        show();
      });
    });
    body.querySelectorAll('[data-calc-to]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var val = parseFloat(calc.expr) || 0;
        var to = btn.getAttribute('data-calc-to');
        if (to === 'cash') { body.querySelector('#actCash').value = val; updateAnalysis(); }
        else if (to === 'visa') { body.querySelector('#actVisa').value = val; updateAnalysis(); }
        else { dExpenses.push({ label: 'حاسبة', amount: val }); renderClExp(); updateAnalysis(); }
        ui.toast('تم النقل ✓');
      });
    });
    show();
  }

  /* ---------- Tab 2: Period ---------- */
  function renderPeriod(body) {
    var today = window.fmt.ymd(new Date());
    body.innerHTML =
      '<div class="card">' +
        '<div class="form-row">' +
          '<div class="form-group"><label>من</label><input type="date" id="pFrom" value="' + window.fmt.addDays(today, -30) + '"></div>' +
          '<div class="form-group"><label>إلى</label><input type="date" id="pTo" value="' + today + '"></div>' +
        '</div>' +
        '<button class="btn btn-primary btn-block" id="pShow">عرض</button>' +
      '</div><div id="periodResult"></div>';
    body.querySelector('#pShow').addEventListener('click', function () { showPeriod(body); });
  }
  function showPeriod(body) {
    var from = body.querySelector('#pFrom').value, to = body.querySelector('#pTo').value;
    var rows = window.db.closings.filter(function (c) { return c.date >= from && c.date <= to; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var tCash = 0, tVisa = 0, tExp = 0, tHours = 0, tNet = 0;
    rows.forEach(function (c) {
      tCash += c.actualCash || 0; tVisa += c.actualVisa || 0; tHours += c.totalHours || 0;
      tExp += (c.expenses || []).reduce(function (s, e) { return s + (parseFloat(e.amount) || 0); }, 0);
      tNet += c.netRevenue || 0;
    });
    var res = body.querySelector('#periodResult');
    res.innerHTML =
      '<div class="grid-3 mt-12">' +
        statCard(window.fmt.num(tHours) + ' س', 'ساعات') +
        statCard(window.fmt.money(tCash), 'كاش') +
        statCard(window.fmt.money(tVisa), 'فيزا') +
        statCard(window.fmt.money(tExp), 'مصاريف') +
        statCard(window.fmt.money(tCash + tVisa), 'إجمالي') +
        statCard(window.fmt.money(tNet), 'صافي') +
      '</div>' +
      '<div class="card mt-12"><div class="table-wrap"><table class="data-table"><thead><tr>' +
        '<th>التاريخ</th><th>النوع</th><th>كاش</th><th>فيزا</th><th>صافي</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (c) {
          return '<tr><td>' + window.fmt.dateShort(c.date) + '</td><td>' + typeLabel(c.type) + '</td><td>' +
            window.fmt.num(c.actualCash) + '</td><td>' + window.fmt.num(c.actualVisa) + '</td><td>' + window.fmt.num(c.netRevenue) + '</td></tr>';
        }).join('') : '<tr><td colspan="5" class="muted">لا توجد تقفيلات في هذه الفترة</td></tr>') +
        '</tbody></table></div>' +
        '<div class="modal-actions mt-16"><button class="btn btn-secondary" id="pPrint">🖨️ PDF / طباعة</button></div></div>';
    var pp = res.querySelector('#pPrint');
    if (pp) pp.addEventListener('click', function () { window.print(); });
  }

  /* ---------- Tab 3: History ---------- */
  function renderHistory(body) {
    var month = window.fmt.ymd(new Date()).substring(0, 7);
    body.innerHTML =
      '<div class="card"><div class="form-row">' +
        '<div class="form-group"><label>الشهر</label><input type="month" id="hMonth" value="' + month + '"></div>' +
        '<div class="form-group" style="justify-content:flex-end"><button class="btn btn-success" id="hExcel">📊 تصدير Excel</button></div>' +
      '</div></div><div id="historyTable"></div>';
    body.querySelector('#hMonth').addEventListener('change', function () { drawHistory(body); });
    body.querySelector('#hExcel').addEventListener('click', function () { exportExcel(body); });
    drawHistory(body);
  }
  function drawHistory(body) {
    var month = body.querySelector('#hMonth').value;
    var rows = window.db.closings.filter(function (c) { return !month || (c.date || '').startsWith(month); })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    body.querySelector('#historyTable').innerHTML =
      '<div class="card"><div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>التاريخ</th><th>النوع</th><th>ساعات</th><th>كاش</th><th>فيزا</th><th>مصاريف</th><th>صافي</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (c) {
        var exp = (c.expenses || []).reduce(function (s, e) { return s + (parseFloat(e.amount) || 0); }, 0);
        return '<tr><td>' + window.fmt.dateShort(c.date) + '</td><td>' + typeLabel(c.type) + '</td><td>' + window.fmt.num(c.totalHours) +
          '</td><td>' + window.fmt.num(c.actualCash) + '</td><td>' + window.fmt.num(c.actualVisa) + '</td><td>' + window.fmt.num(exp) +
          '</td><td>' + window.fmt.num(c.netRevenue) + '</td><td><button class="btn btn-danger btn-sm" data-del-cl="' + c.id + '">🗑️</button></td></tr>';
      }).join('') : '<tr><td colspan="8" class="muted">لا توجد تقفيلات</td></tr>') +
      '</tbody></table></div></div>';
    body.querySelectorAll('[data-del-cl]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('حذف هذا التقفيل؟')) return;
        window.db.closings.remove(b.getAttribute('data-del-cl'));
        ui.toast('تم الحذف ✓'); drawHistory(body);
      });
    });
  }

  function exportExcel(body) {
    var month = body.querySelector('#hMonth').value;
    var rows = window.db.closings.filter(function (c) { return !month || (c.date || '').startsWith(month); });
    if (!rows.length) { ui.toast('لا توجد بيانات للتصدير', '#e03131'); return; }
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', function () {
      if (!window.XLSX) { ui.toast('فشل تحميل مكتبة Excel', '#e03131'); return; }
      var data = rows.map(function (c) {
        return {
          'التاريخ': c.date, 'النوع': typeLabel(c.type), 'ساعات': c.totalHours,
          'كاش': c.actualCash, 'فيزا': c.actualVisa,
          'مصاريف': (c.expenses || []).reduce(function (s, e) { return s + (parseFloat(e.amount) || 0); }, 0),
          'صافي': c.netRevenue
        };
      });
      var ws = window.XLSX.utils.json_to_sheet(data);
      var wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'التقفيلات');
      window.XLSX.writeFile(wb, 'closings-' + (month || 'all') + '.xlsx');
      ui.toast('تم التصدير ✓');
    });
  }

  function loadScript(src, cb) {
    if (document.querySelector('script[data-src="' + src + '"]')) { cb(); return; }
    var s = document.createElement('script');
    s.src = src; s.setAttribute('data-src', src);
    s.onload = cb; s.onerror = function () { ui.toast('تعذّر تحميل المكتبة (تحقق من الاتصال)', '#e03131'); };
    document.head.appendChild(s);
  }
  function typeLabel(t) { return t === 'manual' ? 'يدوي' : t === 'period' ? 'فترة' : 'حجوزات'; }
  function statCard(v, l) { return '<div class="stat-card"><div class="value">' + v + '</div><div class="label">' + l + '</div></div>'; }

  window.PMGR.pages.closing = render;
})();
