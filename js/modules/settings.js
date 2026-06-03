/* ===================================================================
   settings.js — club settings, overtime, trainers, sync, backup,
   AI key, password protection, data management, about.
   =================================================================== */
(function () {
  'use strict';
  window.PMGR = window.PMGR || {}; window.PMGR.pages = window.PMGR.pages || {};

  var AI_KEY = 'pmgr_ai_key';
  var BACKUP_KEY = 'pmgr_last_backup';

  function render(container) {
    var s = window.db.getSettings();
    container.innerHTML =
      '<div class="page-header"><div class="page-title">⚙️ الإعدادات</div></div>' +
      clubSection(s) + overtimeSection(s) + trainersSection() + walletSection(s) + exportSection() + syncSection() +
      backupSection() + aiSection() + passwordSection() + dataSection() + aboutSection();
    wire(container);
  }

  /* 1. Club */
  function clubSection(s) {
    var courtOpts = '';
    for (var i = 1; i <= 6; i++) courtOpts += '<option value="' + i + '"' + (s.courts === i ? ' selected' : '') + '>' + i + '</option>';
    return card('🏠 إعدادات النادي',
      '<div class="form-group"><label>اسم النادي</label><input id="setClub" value="' + ui.esc(s.clubName) + '"></div>' +
      '<div class="form-group"><label>عدد الملاعب</label><select id="setCourts">' + courtOpts + '</select></div>' +
      '<div class="form-row"><div class="form-group"><label>سعر الصباح (6ص–6م)</label><input id="setAM" type="number" value="' + s.morningPrice + '"></div>' +
        '<div class="form-group"><label>سعر المساء (6م–1ص)</label><input id="setPM" type="number" value="' + s.eveningPrice + '"></div></div>' +
      '<button class="btn btn-primary btn-block" id="saveClub">حفظ إعدادات النادي</button>');
  }

  /* 2. Overtime */
  function overtimeSection(s) {
    return card('⏱ الأوفر تايم',
      '<div class="flex" style="justify-content:space-between;align-items:center"><label>تفعيل حساب الأوفر تايم</label>' +
        '<label class="switch"><input type="checkbox" id="setOT"' + (s.overtimeEnabled ? ' checked' : '') + '><span class="slider"></span></label></div>' +
      '<div class="form-group mt-12" id="otPriceWrap" style="display:' + (s.overtimeEnabled ? 'flex' : 'none') + '"><label>سعر ساعة الأوفر تايم</label>' +
        '<input id="setOTPrice" type="number" value="' + (s.overtimePrice || '') + '">' +
        '<small class="muted">لو سيبته فاضي → تلقائي 1.5× من سعر المساء</small></div>' +
      '<button class="btn btn-primary btn-block" id="saveOT">حفظ</button>');
  }

  /* 3. Trainers */
  function trainersSection() {
    var trainers = window.db.trainers.getAll();
    var SPEC = { general: 'عام', beginner: 'مبتدئين', advanced: 'متقدمين', kids: 'أطفال' };
    var PAY = { percentage: 'نسبة %', monthly: 'شهري', perSession: 'للجلسة' };
    return card('👤 المدربون',
      (trainers.length ? trainers.map(function (tr) {
        return '<div class="card" style="margin-bottom:8px"><div class="card-header"><div><b>' + ui.esc(tr.name) + '</b><div class="t-meta">' +
          (SPEC[tr.specialty] || '') + ' · ' + (PAY[tr.payType] || '') + ' ' + window.fmt.num(tr.payValue) + '</div></div>' +
          '<div class="flex gap-8"><button class="btn btn-secondary btn-sm" data-edit-tr="' + tr.id + '">✏️</button>' +
          '<button class="btn btn-danger btn-sm" data-del-tr="' + tr.id + '">🗑️</button></div></div></div>';
      }).join('') : '<div class="muted mb-12">لا يوجد مدربون</div>') +
      '<button class="btn btn-secondary btn-block" id="addTrainer">＋ إضافة مدرب</button>');
  }

  /* 4. Sync */
  function syncSection() {
    return card('🔄 مزامنة البيانات',
      '<div class="muted mb-12">صدّر كود من جهاز والصقه في جهاز آخر لدمج البيانات.</div>' +
      '<button class="btn btn-secondary btn-block" id="genSync">توليد كود التصدير</button>' +
      '<textarea id="syncOut" placeholder="الكود سيظهر هنا" style="margin-top:8px" readonly></textarea>' +
      '<button class="btn btn-secondary btn-block mt-12" id="copySync">نسخ الكود</button>' +
      '<div class="divider"></div>' +
      '<textarea id="syncIn" placeholder="الصق كود الاستيراد هنا"></textarea>' +
      '<button class="btn btn-primary btn-block mt-12" id="doImport">استيراد ودمج</button>');
  }

  /* 5. Backup */
  function backupSection() {
    var last = localStorage.getItem(BACKUP_KEY);
    return card('💾 النسخ الاحتياطي',
      '<div class="muted mb-12">آخر نسخة احتياطية: ' + (last ? last : 'لا يوجد') + '</div>' +
      '<button class="btn btn-secondary btn-block" id="exportBackup">تصدير نسخة احتياطية (JSON)</button>' +
      '<input type="file" id="importFile" accept="application/json" style="display:none">' +
      '<button class="btn btn-secondary btn-block mt-12" id="importBackup">استيراد نسخة احتياطية</button>');
  }

  /* Wallet / electronic payment (QR) */
  function walletSection(s) {
    var w = s.wallet || {};
    return card('💳 الدفع الإلكتروني (QR)',
      '<div class="muted mb-12">فعّل المحفظة الإلكترونية لعرض كود QR للدفع في الوصل.</div>' +
      '<div class="flex" style="justify-content:space-between;align-items:center"><label>تفعيل الدفع بـ QR</label>' +
        '<label class="switch"><input type="checkbox" id="setWalletOn"' + (w.enabled ? ' checked' : '') + '><span class="slider"></span></label></div>' +
      '<div id="walletFields" style="display:' + (w.enabled ? 'block' : 'none') + '">' +
        '<div class="form-group mt-12"><label>اسم المحفظة / المزوّد</label><input id="setWalletProvider" placeholder="مثال: InstaPay / فودافون كاش" value="' + ui.esc(w.provider || '') + '"></div>' +
        '<div class="form-group"><label>رقم المحفظة / المعرّف</label><input id="setWalletNumber" placeholder="01000000000" value="' + ui.esc(w.number || '') + '"></div>' +
      '</div>' +
      '<button class="btn btn-primary btn-block mt-12" id="saveWallet">حفظ</button>');
  }

  /* Export — Excel + iCal */
  function exportSection() {
    return card('📤 تصدير البيانات',
      '<div class="muted mb-12">صدّر الحجوزات لفتحها في Excel أو لإضافتها للتقويم (iCal).</div>' +
      '<button class="btn btn-secondary btn-block" id="exportExcel">📊 تصدير الحجوزات (Excel)</button>' +
      '<button class="btn btn-secondary btn-block mt-12" id="exportICal">📅 تصدير التقويم (iCal)</button>');
  }

  /* 6. AI */
  function aiSection() {
    var key = localStorage.getItem(AI_KEY);
    var inner = key
      ? '<div class="key-display mb-12">•••• ' + key.slice(-4) + '</div>' +
        '<div class="flex gap-8"><button class="btn btn-secondary" id="changeKey">تغيير</button><button class="btn btn-danger" id="clearKey">مسح</button></div>'
      : '<div class="form-group"><input id="aiKeyInput" type="password" placeholder="أدخل مفتاح Anthropic API"></div>' +
        '<button class="btn btn-primary btn-block" id="saveKey">حفظ المفتاح</button>';
    return card('🤖 إعدادات المساعد الذكي', inner +
      '<small class="muted">مفتاحك بيتحفظ على جهازك بس ومش بيُرسل لأي خادم.</small>');
  }

  /* 7. Password */
  function passwordSection() {
    var has = !!localStorage.getItem(window.PMGR.pwdKey);
    var inner = has
      ? '<button class="btn btn-secondary btn-block" id="changePwd">تغيير الباسورد</button>' +
        '<button class="btn btn-danger btn-block mt-12" id="removePwd">إلغاء الباسورد</button>'
      : '<div class="form-group"><label>باسورد جديد</label><input id="pwd1" type="password"></div>' +
        '<div class="form-group"><label>تأكيد الباسورد</label><input id="pwd2" type="password"></div>' +
        '<button class="btn btn-primary btn-block" id="setPwd">تعيين الباسورد</button>';
    return card('🔒 حماية التطبيق', inner +
      '<small class="muted">الباسورد بيتخزّن مشفّر (SHA-256) على جهازك بس، وبيتطلب كل ما تفتح التطبيق على نفس الجهاز.</small>');
  }

  /* 8. Data management */
  function dataSection() {
    return card('🗄️ إدارة البيانات',
      '<div class="muted mb-12">الحجوزات: ' + window.db.bookings.getAll().length +
        ' · التقفيلات: ' + window.db.closings.getAll().length +
        ' · المتدربون: ' + window.db.trainees.getAll().length + '</div>' +
      '<button class="btn btn-danger btn-block" id="delBookings">حذف جميع الحجوزات</button>' +
      '<button class="btn btn-danger btn-block mt-12" id="resetAll">إعادة ضبط كامل</button>');
  }

  /* 9. About */
  function aboutSection() {
    return card('ℹ️ حول التطبيق',
      '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:var(--primary)">Padel MGR v2.0</div>' +
      '<div class="muted mt-12">by Storm (Ibrahim Ahmed Hassan)</div>' +
      '<a href="https://github.com/storm-xyz/padel-mgr" target="_blank" class="text-primary-color">github.com/storm-xyz</a></div>');
  }

  function card(title, inner) {
    return '<div class="card settings-section"><div class="ss-title">' + title + '</div>' + inner + '</div>';
  }

  /* ---------------- Wiring ---------------- */
  function wire(container) {
    var $ = function (id) { return container.querySelector('#' + id); };

    $('saveClub').addEventListener('click', function () {
      window.db.saveSettings({
        clubName: $('setClub').value.trim() || 'نادي البادل',
        courts: parseInt($('setCourts').value, 10) || 2,
        morningPrice: parseFloat($('setAM').value) || 0,
        eveningPrice: parseFloat($('setPM').value) || 0
      });
      window.PMGR.updateClubName(); ui.toast('تم حفظ الإعدادات ✓');
    });

    $('setOT').addEventListener('change', function () { $('otPriceWrap').style.display = this.checked ? 'flex' : 'none'; });
    $('saveOT').addEventListener('click', function () {
      window.db.saveSettings({ overtimeEnabled: $('setOT').checked, overtimePrice: parseFloat($('setOTPrice').value) || 0 });
      ui.toast('تم الحفظ ✓');
    });

    $('addTrainer').addEventListener('click', function () { trainerModal(null, container); });
    container.querySelectorAll('[data-edit-tr]').forEach(function (b) { b.addEventListener('click', function () { trainerModal(b.getAttribute('data-edit-tr'), container); }); });
    container.querySelectorAll('[data-del-tr]').forEach(function (b) {
      b.addEventListener('click', function () { if (confirm('حذف المدرب؟')) { window.db.trainers.remove(b.getAttribute('data-del-tr')); ui.toast('تم الحذف ✓'); render(container); } });
    });

    $('genSync').addEventListener('click', function () { $('syncOut').value = btoa(unescape(encodeURIComponent(window.db.exportAll()))); ui.toast('تم توليد الكود ✓'); });
    $('copySync').addEventListener('click', function () {
      var ta = $('syncOut'); if (!ta.value) { ui.toast('ولّد الكود أولاً', '#e03131'); return; }
      ta.select(); try { document.execCommand('copy'); } catch (e) {}
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function () {});
      ui.toast('تم النسخ ✓');
    });
    $('doImport').addEventListener('click', function () {
      var code = $('syncIn').value.trim(); if (!code) { ui.toast('الصق الكود أولاً', '#e03131'); return; }
      var json; try { json = decodeURIComponent(escape(atob(code))); } catch (e) { json = code; }
      if (window.db.importAll(json)) { ui.toast('تم الاستيراد والدمج ✓'); render(container); window.PMGR.updateClubName(); }
      else ui.toast('كود غير صالح ⚠️', '#e03131');
    });

    $('exportBackup').addEventListener('click', function () {
      var blob = new Blob([window.db.exportAll()], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'padel-mgr-backup-' + window.fmt.ymd(new Date()) + '.json'; a.click();
      var now = new Date().toLocaleString('ar-EG'); localStorage.setItem(BACKUP_KEY, now); ui.toast('تم تصدير النسخة ✓'); render(container);
    });
    $('importBackup').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { if (window.db.importAll(reader.result)) { ui.toast('تم الاستيراد ✓'); render(container); window.PMGR.updateClubName(); } else ui.toast('ملف غير صالح ⚠️', '#e03131'); };
      reader.readAsText(file);
    });

    // Wallet
    if ($('setWalletOn')) $('setWalletOn').addEventListener('change', function () { $('walletFields').style.display = this.checked ? 'block' : 'none'; });
    if ($('saveWallet')) $('saveWallet').addEventListener('click', function () {
      window.db.saveSettings({ wallet: {
        enabled: $('setWalletOn').checked,
        provider: $('setWalletProvider') ? $('setWalletProvider').value.trim() : '',
        number: $('setWalletNumber') ? $('setWalletNumber').value.trim() : ''
      } });
      ui.toast('تم حفظ بيانات الدفع ✓');
    });

    // Export
    if ($('exportExcel')) $('exportExcel').addEventListener('click', exportExcel);
    if ($('exportICal')) $('exportICal').addEventListener('click', exportICal);

    // AI key
    if ($('saveKey')) $('saveKey').addEventListener('click', function () {
      var v = $('aiKeyInput').value.trim(); if (!v) { ui.toast('أدخل المفتاح', '#e03131'); return; }
      localStorage.setItem(AI_KEY, v); ui.toast('تم حفظ المفتاح ✓'); render(container);
    });
    if ($('changeKey')) $('changeKey').addEventListener('click', function () { localStorage.removeItem(AI_KEY); render(container); });
    if ($('clearKey')) $('clearKey').addEventListener('click', function () { localStorage.removeItem(AI_KEY); ui.toast('تم مسح المفتاح ✓'); render(container); });

    // Password
    if ($('setPwd')) $('setPwd').addEventListener('click', function () {
      var p1 = $('pwd1').value, p2 = $('pwd2').value;
      if (p1.length < 4) { ui.toast('الباسورد 4 أحرف على الأقل', '#e03131'); return; }
      if (p1 !== p2) { ui.toast('الباسورد غير متطابق', '#e03131'); return; }
      window.PMGR.hashPwd(p1).then(function (h) {
        localStorage.setItem(window.PMGR.pwdKey, h); ui.toast('تم تعيين الباسورد ✓'); render(container);
      });
    });
    if ($('changePwd')) $('changePwd').addEventListener('click', function () {
      var np = prompt('الباسورد الجديد (4 أحرف على الأقل):'); if (np == null) return;
      if (np.length < 4) { ui.toast('قصير جداً', '#e03131'); return; }
      window.PMGR.hashPwd(np).then(function (h) {
        localStorage.setItem(window.PMGR.pwdKey, h); ui.toast('تم التغيير ✓');
      });
    });
    if ($('removePwd')) $('removePwd').addEventListener('click', function () {
      if (confirm('إلغاء حماية الباسورد؟')) { localStorage.removeItem(window.PMGR.pwdKey); ui.toast('تم الإلغاء ✓'); render(container); }
    });

    // Data management
    $('delBookings').addEventListener('click', function () {
      if (!confirm('هل أنت متأكد من حذف جميع الحجوزات؟')) return;
      window.db.bookings.getAll().slice().forEach(function (b) { window.db.bookings.remove(b.id); });
      ui.toast('تم حذف الحجوزات ✓'); render(container);
    });
    $('resetAll').addEventListener('click', function () {
      var ans = prompt("اكتب 'تأكيد' للاستمرار في إعادة الضبط الكامل:");
      if (ans !== 'تأكيد') return;
      ['bookings', 'closings', 'trainees', 'groups', 'trainers', 'sessions', 'customers', 'inventory', 'settings', 'migrated'].forEach(function (k) {
        localStorage.removeItem('pmgr_' + k);
      });
      ui.toast('تمت إعادة الضبط ✓'); window.db.migrate(); window.PMGR.updateClubName(); render(container);
    });
  }

  /* ---------------- Export helpers ---------------- */
  function downloadFile(filename, content, mime) {
    var blob = new Blob(['\ufeff' + content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
  }

  var PAY_LABEL = { cash: 'كاش', visa: 'فيزا', mixed: 'مختلط', pending: 'معلق' };

  function sortedBookings() {
    return window.db.bookings.getAll().slice().sort(function (a, b) {
      return (a.date + a.startTime) < (b.date + b.startTime) ? -1 : 1;
    });
  }

  // Excel-compatible HTML table (.xls) — opens natively in Excel, no library needed.
  function exportExcel() {
    var rows = sortedBookings();
    if (!rows.length) { ui.toast('لا توجد حجوزات للتصدير', '#e03131'); return; }
    var head = ['التاريخ', 'الوقت', 'المدة (دقيقة)', 'الملعب', 'العميل', 'الهاتف', 'طريقة الدفع', 'كاش', 'فيزا', 'الإجمالي'];
    var body = rows.map(function (b) {
      var cash = parseFloat(b.cash) || 0, visa = parseFloat(b.visa) || 0;
      return '<tr>' + [
        b.date, b.startTime, (b.duration || ''), b.courtNumber,
        (b.clientName || ''), (b.phone || ''),
        (PAY_LABEL[b.paymentMethod] || b.paymentMethod || ''),
        cash, visa, (cash + visa)
      ].map(function (c) { return '<td>' + ui.esc(String(c)) + '</td>'; }).join('') + '</tr>';
    }).join('');
    var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>' +
      '<table border="1"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></body></html>';
    downloadFile('padel-bookings-' + window.fmt.ymd(new Date()) + '.xls', html, 'application/vnd.ms-excel');
    ui.toast('تم تصدير Excel ✓');
  }

  // iCalendar (.ics) — one VEVENT per booking (floating local time).
  function exportICal() {
    var rows = sortedBookings();
    if (!rows.length) { ui.toast('لا توجد حجوزات للتصدير', '#e03131'); return; }
    var s = window.db.getSettings();
    function stamp(date, time) { return date.replace(/-/g, '') + 'T' + (time || '00:00').replace(':', '') + '00'; }
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Padel MGR//AR//', 'CALSCALE:GREGORIAN'];
    rows.forEach(function (b) {
      if (b.status === 'cancelled') return;
      var startMin = window.fmt.t2min(b.startTime);
      var endT = window.fmt.min2t(startMin + (parseInt(b.duration, 10) || 60));
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + (b.id || Math.random()) + '@padel-mgr');
      lines.push('DTSTART:' + stamp(b.date, b.startTime));
      lines.push('DTEND:' + stamp(b.date, endT));
      lines.push('SUMMARY:' + (b.clientName || 'حجز') + ' — ملعب ' + b.courtNumber);
      lines.push('LOCATION:' + (s.clubName || 'نادي البادل'));
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    downloadFile('padel-calendar-' + window.fmt.ymd(new Date()) + '.ics', lines.join('\r\n'), 'text/calendar');
    ui.toast('تم تصدير التقويم ✓');
  }

  function trainerModal(id, container) {
    var tr = id ? window.db.trainers.getById(id) : null;
    var SPEC = { general: 'عام', beginner: 'مبتدئين', advanced: 'متقدمين', kids: 'أطفال' };
    var PAY = { percentage: 'نسبة %', monthly: 'شهري', perSession: 'للجلسة' };
    var html =
      '<div class="modal-header"><div class="modal-title">' + (tr ? 'تعديل مدرب' : 'مدرب جديد') + '</div><button class="modal-close" data-close>✕</button></div>' +
      '<div class="form-group"><label>الاسم *</label><input id="trName" value="' + ui.esc(tr ? tr.name : '') + '"></div>' +
      '<div class="form-group"><label>الهاتف</label><input id="trPhone" type="tel" value="' + ui.esc(tr ? tr.phone : '') + '"></div>' +
      '<div class="form-group"><label>التخصص</label><select id="trSpec">' +
        Object.keys(SPEC).map(function (k) { return '<option value="' + k + '"' + (tr && tr.specialty === k ? ' selected' : '') + '>' + SPEC[k] + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-row"><div class="form-group"><label>نوع الأجر</label><select id="trPayType">' +
        Object.keys(PAY).map(function (k) { return '<option value="' + k + '"' + (tr && tr.payType === k ? ' selected' : '') + '>' + PAY[k] + '</option>'; }).join('') + '</select></div>' +
        '<div class="form-group"><label>القيمة</label><input id="trPayVal" type="number" value="' + (tr ? tr.payValue || '' : '') + '"></div></div>' +
      '<div class="modal-actions"><button class="btn btn-primary" id="trSave">حفظ ✓</button><button class="btn btn-secondary" data-close>إلغاء</button></div>';
    var ov = ui.openModal(html);
    ov.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { ui.closeModal(ov); }); });
    ov.querySelector('#trSave').addEventListener('click', function () {
      var name = ov.querySelector('#trName').value.trim();
      if (!name) { ui.toast('أدخل اسم المدرب ⚠️', '#e03131'); return; }
      var data = {
        name: name, phone: ov.querySelector('#trPhone').value.trim(),
        specialty: ov.querySelector('#trSpec').value, payType: ov.querySelector('#trPayType').value,
        payValue: parseFloat(ov.querySelector('#trPayVal').value) || 0
      };
      if (tr) window.db.trainers.update(tr.id, data); else window.db.trainers.add(data);
      ui.closeModal(ov); ui.toast('تم الحفظ ✓'); render(container);
    });
  }

  window.PMGR.pages.settings = render;
})();
