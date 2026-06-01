/* ===================================================================
   academy.js — trainees, groups, weekly schedule + attendance.
   =================================================================== */
(function () {
  'use strict';
  window.PMGR = window.PMGR || {}; window.PMGR.pages = window.PMGR.pages || {};

  var tab = 'trainees';
  var traineeQuery = '';
  var traineeFilter = 'all';

  var LEVELS = { beginner: 'مبتدئ', intermediate: 'متوسط', advanced: 'متقدم', pro: 'محترف' };
  var DAYS = [
    { k: 'sat', l: 'س', full: 'السبت' }, { k: 'sun', l: 'ح', full: 'الأحد' },
    { k: 'mon', l: 'ن', full: 'الإثنين' }, { k: 'tue', l: 'ث', full: 'الثلاثاء' },
    { k: 'wed', l: 'ر', full: 'الأربعاء' }, { k: 'thu', l: 'خ', full: 'الخميس' },
    { k: 'fri', l: 'ج', full: 'الجمعة' }
  ];

  function render(container) {
    container.innerHTML =
      '<div class="page-header"><div class="page-title">🎓 الأكاديمية</div></div>' +
      '<div class="tabs">' +
        '<button class="tab' + (tab === 'trainees' ? ' active' : '') + '" data-tab="trainees">المتدربون</button>' +
        '<button class="tab' + (tab === 'groups' ? ' active' : '') + '" data-tab="groups">الجروبات</button>' +
        '<button class="tab' + (tab === 'schedule' ? ' active' : '') + '" data-tab="schedule">الجدول الأسبوعي</button>' +
      '</div><div id="acadBody"></div>';
    container.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); render(container); });
    });
    var body = container.querySelector('#acadBody');
    if (tab === 'trainees') renderTrainees(body);
    else if (tab === 'groups') renderGroups(body);
    else renderSchedule(body);
  }

  function trainerName(id) { var t = id && window.db.trainers.getById(id); return t ? t.name : '—'; }

  /* ---------- Trainees ---------- */
  function renderTrainees(body) {
    var all = window.db.trainees.getAll();
    var active = all.filter(function (t) { return t.active !== false; });
    var monthly = all.filter(function (t) { return t.subscriptionType === 'monthly'; });
    var perSession = all.filter(function (t) { return t.subscriptionType === 'perSession'; });

    var list = all.filter(function (t) {
      var q = traineeQuery.toLowerCase();
      var matchQ = !q || (t.name || '').toLowerCase().indexOf(q) !== -1 || (t.phone || '').indexOf(q) !== -1;
      var matchF = traineeFilter === 'all' || (traineeFilter === 'active' && t.active !== false) ||
        (traineeFilter.indexOf('trainer:') === 0 && t.trainerId === traineeFilter.slice(8));
      return matchQ && matchF;
    });

    var trainerChips = window.db.trainers.getAll().map(function (tr) {
      return '<button class="chip' + (traineeFilter === 'trainer:' + tr.id ? ' active' : '') + '" data-tf="trainer:' + tr.id + '">' + ui.esc(tr.name) + '</button>';
    }).join('');

    body.innerHTML =
      '<div class="grid-3 mb-12">' +
        statCard(active.length, 'نشطون') + statCard(monthly.length, 'شهري') + statCard(perSession.length, 'للجلسة') +
      '</div>' +
      '<div class="form-group"><input id="tSearch" placeholder="🔍 بحث بالاسم أو الهاتف" value="' + ui.esc(traineeQuery) + '"></div>' +
      '<div class="chip-row mb-12"><button class="chip' + (traineeFilter === 'all' ? ' active' : '') + '" data-tf="all">الكل</button>' +
        '<button class="chip' + (traineeFilter === 'active' ? ' active' : '') + '" data-tf="active">نشطون</button>' + trainerChips + '</div>' +
      '<div class="trainee-grid">' + (list.length ? list.map(traineeCard).join('') :
        '<div class="empty-state" style="grid-column:1/-1"><span class="icon">🎓</span>لا يوجد متدربون</div>') + '</div>' +
      '<button class="fab" id="addTrainee">＋ متدرب</button>';

    var search = body.querySelector('#tSearch');
    search.addEventListener('input', function () { traineeQuery = this.value; var p = this.selectionStart; renderTrainees(body); var ns = body.querySelector('#tSearch'); ns.focus(); ns.setSelectionRange(p, p); });
    body.querySelectorAll('[data-tf]').forEach(function (b) { b.addEventListener('click', function () { traineeFilter = b.getAttribute('data-tf'); renderTrainees(body); }); });
    body.querySelector('#addTrainee').addEventListener('click', function () { traineeModal(null); });
    body.querySelectorAll('[data-edit-t]').forEach(function (b) { b.addEventListener('click', function () { traineeModal(b.getAttribute('data-edit-t')); }); });
    body.querySelectorAll('[data-del-t]').forEach(function (b) {
      b.addEventListener('click', function () { if (confirm('حذف المتدرب؟')) { window.db.trainees.remove(b.getAttribute('data-del-t')); ui.toast('تم الحذف ✓'); renderTrainees(body); } });
    });
  }

  function traineeCard(t) {
    return '<div class="trainee-card">' +
      '<div class="t-name">' + ui.esc(t.name) + ' <span class="badge badge-info">' + (LEVELS[t.level] || '') + '</span></div>' +
      '<div class="t-meta">👤 ' + ui.esc(trainerName(t.trainerId)) + '</div>' +
      '<div class="t-meta">' + (t.subscriptionType === 'monthly' ? 'شهري · ' + window.fmt.money(t.monthlyPrice) : 'للجلسة') + '</div>' +
      (t.phone ? '<div class="t-meta">📞 ' + ui.esc(t.phone) + '</div>' : '') +
      '<div class="t-actions"><button class="btn btn-secondary btn-sm" data-edit-t="' + t.id + '">✏️</button>' +
        '<button class="btn btn-danger btn-sm" data-del-t="' + t.id + '">🗑️</button></div></div>';
  }

  function traineeModal(id) {
    var t = id ? window.db.trainees.getById(id) : null;
    var trainers = window.db.trainers.getAll();
    var html =
      '<div class="modal-header"><div class="modal-title">' + (t ? 'تعديل متدرب' : 'متدرب جديد') + '</div><button class="modal-close" data-close>✕</button></div>' +
      '<div class="form-group"><label>الاسم *</label><input id="tName" value="' + ui.esc(t ? t.name : '') + '"></div>' +
      '<div class="form-group"><label>رقم الهاتف</label><input id="tPhone" type="tel" value="' + ui.esc(t ? t.phone : '') + '"></div>' +
      '<div class="form-row"><div class="form-group"><label>المستوى</label><select id="tLevel">' +
        Object.keys(LEVELS).map(function (k) { return '<option value="' + k + '"' + (t && t.level === k ? ' selected' : '') + '>' + LEVELS[k] + '</option>'; }).join('') + '</select></div>' +
        '<div class="form-group"><label>الاشتراك</label><select id="tSub"><option value="monthly"' + (t && t.subscriptionType === 'monthly' ? ' selected' : '') + '>شهري</option><option value="perSession"' + (t && t.subscriptionType === 'perSession' ? ' selected' : '') + '>للجلسة</option></select></div></div>' +
      '<div class="form-group" id="tPriceWrap"><label>السعر الشهري</label><input id="tPrice" type="number" value="' + (t ? t.monthlyPrice || '' : '') + '"></div>' +
      '<div class="form-group"><label>المدرب المفضل</label><select id="tTrainer"><option value="">—</option>' +
        trainers.map(function (tr) { return '<option value="' + tr.id + '"' + (t && t.trainerId === tr.id ? ' selected' : '') + '>' + ui.esc(tr.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-row"><div class="form-group"><label>تاريخ البداية</label><input id="tStart" type="date" value="' + (t ? t.startDate : window.fmt.ymd(new Date())) + '"></div>' +
        '<div class="form-group"><label>الحالة</label><select id="tActive"><option value="1"' + (!t || t.active !== false ? ' selected' : '') + '>نشط</option><option value="0"' + (t && t.active === false ? ' selected' : '') + '>غير نشط</option></select></div></div>' +
      '<div class="form-group"><label>ملاحظات</label><textarea id="tNotes">' + ui.esc(t ? t.notes : '') + '</textarea></div>' +
      '<div class="modal-actions"><button class="btn btn-primary" id="tSave">حفظ ✓</button><button class="btn btn-secondary" data-close>إلغاء</button></div>';
    var ov = ui.openModal(html);
    function syncPrice() { ov.querySelector('#tPriceWrap').style.display = ov.querySelector('#tSub').value === 'monthly' ? 'flex' : 'none'; }
    ov.querySelector('#tSub').addEventListener('change', syncPrice); syncPrice();
    ov.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { ui.closeModal(ov); }); });
    ov.querySelector('#tSave').addEventListener('click', function () {
      var name = ov.querySelector('#tName').value.trim();
      if (!name) { ui.toast('أدخل اسم المتدرب ⚠️', '#e03131'); return; }
      var data = {
        name: name, phone: ov.querySelector('#tPhone').value.trim(),
        level: ov.querySelector('#tLevel').value, subscriptionType: ov.querySelector('#tSub').value,
        monthlyPrice: parseFloat(ov.querySelector('#tPrice').value) || 0,
        trainerId: ov.querySelector('#tTrainer').value || null,
        startDate: ov.querySelector('#tStart').value, active: ov.querySelector('#tActive').value === '1',
        notes: ov.querySelector('#tNotes').value.trim()
      };
      if (t) window.db.trainees.update(t.id, data); else window.db.trainees.add(data);
      ui.closeModal(ov); ui.toast('تم الحفظ ✓'); window.PMGR.refresh('academy');
    });
  }

  /* ---------- Groups ---------- */
  function renderGroups(body) {
    var groups = window.db.groups.getAll();
    body.innerHTML =
      '<div>' + (groups.length ? groups.map(groupCard).join('') :
        '<div class="empty-state"><span class="icon">👥</span>لا توجد جروبات</div>') + '</div>' +
      '<button class="fab" id="addGroup">＋ جروب</button>';
    body.querySelector('#addGroup').addEventListener('click', function () { groupModal(null); });
    body.querySelectorAll('[data-edit-g]').forEach(function (b) { b.addEventListener('click', function () { groupModal(b.getAttribute('data-edit-g')); }); });
    body.querySelectorAll('[data-del-g]').forEach(function (b) {
      b.addEventListener('click', function () { if (confirm('حذف الجروب؟')) { window.db.groups.remove(b.getAttribute('data-del-g')); ui.toast('تم الحذف ✓'); renderGroups(body); } });
    });
  }
  function groupCard(g) {
    var dayBadges = (g.days || []).map(function (d) { var info = DAYS.filter(function (x) { return x.k === d; })[0]; return '<span class="badge badge-gray">' + (info ? info.l : d) + '</span>'; }).join(' ');
    return '<div class="card"><div class="card-header"><div class="card-title">' + ui.esc(g.name) + '</div>' +
      '<div class="flex gap-8"><button class="btn btn-secondary btn-sm" data-edit-g="' + g.id + '">✏️</button>' +
      '<button class="btn btn-danger btn-sm" data-del-g="' + g.id + '">🗑️</button></div></div>' +
      '<div class="flex gap-8 mb-12">' + dayBadges + '</div>' +
      '<div class="t-meta">🕒 ' + window.fmt.time12(g.startTime) + ' · ⏱ ' + ((g.duration || 60) / 60) + ' س · 🎾 ملعب ' + g.courtNumber + '</div>' +
      '<div class="t-meta">👥 ' + (g.members || []).length + '/' + (g.maxMembers || 8) + ' · 👤 ' + ui.esc(trainerName(g.trainerId)) +
      ' · ' + (g.subscriptionType === 'monthly' ? 'شهري' : 'للجلسة') + ' ' + window.fmt.money(g.pricePerMember) + '</div></div>';
  }

  function groupModal(id) {
    var g = id ? window.db.groups.getById(id) : null;
    var trainers = window.db.trainers.getAll();
    var trainees = window.db.trainees.getAll();
    var selDays = g ? (g.days || []).slice() : [];
    var selMembers = g ? (g.members || []).slice() : [];
    var s = window.db.getSettings();
    var courtOpts = '';
    for (var i = 1; i <= (s.courts || 2); i++) courtOpts += '<option value="' + i + '"' + (g && g.courtNumber === i ? ' selected' : '') + '>ملعب ' + i + '</option>';

    var html =
      '<div class="modal-header"><div class="modal-title">' + (g ? 'تعديل جروب' : 'جروب جديد') + '</div><button class="modal-close" data-close>✕</button></div>' +
      '<div class="form-group"><label>الاسم *</label><input id="gName" value="' + ui.esc(g ? g.name : '') + '"></div>' +
      '<div class="form-group"><label>أيام الأسبوع</label><div class="day-checks">' +
        DAYS.map(function (d) { return '<label class="day-check"><input type="checkbox" data-day="' + d.k + '"' + (selDays.indexOf(d.k) !== -1 ? ' checked' : '') + '><span>' + d.l + '</span></label>'; }).join('') + '</div></div>' +
      '<div class="form-row"><div class="form-group"><label>وقت البداية</label><input id="gStart" type="time" value="' + (g ? g.startTime : '16:00') + '"></div>' +
        '<div class="form-group"><label>المدة (دقيقة)</label><input id="gDur" type="number" value="' + (g ? g.duration : 60) + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>الملعب</label><select id="gCourt">' + courtOpts + '</select></div>' +
        '<div class="form-group"><label>الاشتراك</label><select id="gSub"><option value="monthly"' + (g && g.subscriptionType === 'monthly' ? ' selected' : '') + '>شهري</option><option value="perSession"' + (g && g.subscriptionType === 'perSession' ? ' selected' : '') + '>للجلسة</option></select></div></div>' +
      '<div class="form-row"><div class="form-group"><label>سعر العضو</label><input id="gPrice" type="number" value="' + (g ? g.pricePerMember || '' : '') + '"></div>' +
        '<div class="form-group"><label>الحد الأقصى</label><input id="gMax" type="number" value="' + (g ? g.maxMembers : 8) + '"></div></div>' +
      '<div class="form-group"><label>المدرب</label><select id="gTrainer"><option value="">—</option>' +
        trainers.map(function (tr) { return '<option value="' + tr.id + '"' + (g && g.trainerId === tr.id ? ' selected' : '') + '>' + ui.esc(tr.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>الأعضاء</label><div class="member-pick">' +
        (trainees.length ? trainees.map(function (tr) { return '<label><input type="checkbox" data-member="' + tr.id + '"' + (selMembers.indexOf(tr.id) !== -1 ? ' checked' : '') + '> ' + ui.esc(tr.name) + '</label>'; }).join('') : '<span class="muted">أضف متدربين أولاً</span>') + '</div></div>' +
      '<div class="form-group"><label>ملاحظات</label><textarea id="gNotes">' + ui.esc(g ? g.notes : '') + '</textarea></div>' +
      '<div class="modal-actions"><button class="btn btn-primary" id="gSave">حفظ ✓</button><button class="btn btn-secondary" data-close>إلغاء</button></div>';
    var ov = ui.openModal(html);
    ov.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { ui.closeModal(ov); }); });
    ov.querySelector('#gSave').addEventListener('click', function () {
      var name = ov.querySelector('#gName').value.trim();
      if (!name) { ui.toast('أدخل اسم الجروب ⚠️', '#e03131'); return; }
      var days = []; ov.querySelectorAll('[data-day]:checked').forEach(function (c) { days.push(c.getAttribute('data-day')); });
      var members = []; ov.querySelectorAll('[data-member]:checked').forEach(function (c) { members.push(c.getAttribute('data-member')); });
      var data = {
        name: name, days: days, startTime: ov.querySelector('#gStart').value,
        duration: parseInt(ov.querySelector('#gDur').value, 10) || 60,
        courtNumber: parseInt(ov.querySelector('#gCourt').value, 10) || 1,
        subscriptionType: ov.querySelector('#gSub').value,
        pricePerMember: parseFloat(ov.querySelector('#gPrice').value) || 0,
        maxMembers: parseInt(ov.querySelector('#gMax').value, 10) || 8,
        trainerId: ov.querySelector('#gTrainer').value || null,
        members: members, notes: ov.querySelector('#gNotes').value.trim(), active: true
      };
      if (g) window.db.groups.update(g.id, data); else window.db.groups.add(data);
      ui.closeModal(ov); ui.toast('تم الحفظ ✓'); window.PMGR.refresh('academy');
    });
  }

  /* ---------- Weekly schedule ---------- */
  function renderSchedule(body) {
    var groups = window.db.groups.getAll();
    body.innerHTML = DAYS.map(function (d) {
      var dayGroups = groups.filter(function (g) { return (g.days || []).indexOf(d.k) !== -1; })
        .sort(function (a, b) { return (a.startTime || '') < (b.startTime || '') ? -1 : 1; });
      return '<div class="week-day"><div class="wd-title">' + d.full + '</div>' +
        (dayGroups.length ? dayGroups.map(function (g) {
          return '<div class="session-pill" data-attend="' + g.id + '"><span>' + ui.esc(g.name) + '</span>' +
            '<span class="muted">' + window.fmt.time12(g.startTime) + ' · ملعب ' + g.courtNumber + ' · ' + (g.members || []).length + ' عضو</span></div>';
        }).join('') : '<div class="muted" style="font-size:13px">لا توجد جلسات</div>') + '</div>';
    }).join('');
    body.querySelectorAll('[data-attend]').forEach(function (p) { p.addEventListener('click', function () { attendanceModal(p.getAttribute('data-attend')); }); });
  }

  function attendanceModal(groupId) {
    var g = window.db.groups.getById(groupId);
    if (!g) return;
    var members = (g.members || []).map(function (id) { return window.db.trainees.getById(id); }).filter(Boolean);
    var html =
      '<div class="modal-header"><div class="modal-title">حضور — ' + ui.esc(g.name) + '</div><button class="modal-close" data-close>✕</button></div>' +
      '<div class="form-group"><label>التاريخ</label><input type="date" id="atDate" value="' + window.fmt.ymd(new Date()) + '"></div>' +
      '<div class="form-group"><label>الأعضاء</label>' +
        (members.length ? members.map(function (m) { return '<label class="member-pick" style="display:flex;justify-content:space-between;border:none;padding:6px 0"><span><input type="checkbox" data-att="' + m.id + '" checked> ' + ui.esc(m.name) + '</span></label>'; }).join('') : '<span class="muted">لا يوجد أعضاء</span>') + '</div>' +
      '<div class="form-group"><label>حالة الدفع</label><select id="atPay"><option value="subscription">اشتراك</option><option value="paid">مدفوع</option><option value="unpaid">غير مدفوع</option></select></div>' +
      '<div class="modal-actions"><button class="btn btn-primary" id="atSave">حفظ الحضور ✓</button><button class="btn btn-secondary" data-close>إلغاء</button></div>';
    var ov = ui.openModal(html);
    ov.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { ui.closeModal(ov); }); });
    ov.querySelector('#atSave').addEventListener('click', function () {
      var date = ov.querySelector('#atDate').value;
      var pay = ov.querySelector('#atPay').value;
      var present = [];
      ov.querySelectorAll('[data-att]:checked').forEach(function (c) { present.push(c.getAttribute('data-att')); });
      present.forEach(function (tid) {
        window.db.sessions.add({
          date: date, traineeId: tid, groupId: g.id, courtNumber: g.courtNumber,
          startTime: g.startTime, duration: g.duration, type: 'group', trainerId: g.trainerId,
          paymentStatus: pay, amount: pay === 'paid' ? (g.pricePerMember || 0) : 0, notes: ''
        });
      });
      ui.closeModal(ov); ui.toast('تم تسجيل الحضور (' + present.length + ') ✓');
    });
  }

  function statCard(v, l) { return '<div class="stat-card"><div class="value">' + v + '</div><div class="label">' + l + '</div></div>'; }

  window.PMGR.pages.academy = render;
})();
