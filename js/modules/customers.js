/* ===================================================================
   customers.js — Customers directory. Aggregates clients from bookings
   (visits, total spent, last visit) merged with a manual customers
   store (extra contacts + notes). Click a customer for their history.
   =================================================================== */
(function () {
  'use strict';
  window.PMGR = window.PMGR || {}; window.PMGR.pages = window.PMGR.pages || {};

  var search = '';

  function keyFor(name, phone) {
    return (phone && phone.trim()) ? 'p:' + phone.trim() : 'n:' + (name || '').trim().toLowerCase();
  }

  /* Build the merged customer list: bookings-derived + manual store. */
  function buildList() {
    var map = {};

    window.db.bookings.getAll().forEach(function (b) {
      if (b.status === 'cancelled') return;
      var name = b.clientName || 'بدون اسم';
      var phone = b.phone || '';
      var k = keyFor(name, phone);
      if (!map[k]) map[k] = { key: k, name: name, phone: phone, visits: 0, spent: 0, lastVisit: '', manual: false, notes: '' };
      var c = map[k];
      c.visits += 1;
      c.spent += (parseFloat(b.cash) || 0) + (parseFloat(b.visa) || 0);
      if (b.date > c.lastVisit) c.lastVisit = b.date;
      if (!c.name && name) c.name = name;
      if (!c.phone && phone) c.phone = phone;
    });

    window.db.customers.getAll().forEach(function (m) {
      var k = keyFor(m.name, m.phone);
      if (!map[k]) map[k] = { key: k, name: m.name || 'بدون اسم', phone: m.phone || '', visits: 0, spent: 0, lastVisit: '', manual: true, notes: m.notes || '', id: m.id };
      else { map[k].notes = m.notes || map[k].notes; map[k].id = m.id; }
    });

    var arr = Object.keys(map).map(function (k) { return map[k]; });
    arr.sort(function (a, b) {
      if (b.lastVisit !== a.lastVisit) return b.lastVisit > a.lastVisit ? 1 : -1;
      return b.visits - a.visits;
    });
    return arr;
  }

  function render(container) {
    var all = buildList();
    var q = search.trim().toLowerCase();
    var list = q ? all.filter(function (c) {
      return (c.name || '').toLowerCase().indexOf(q) !== -1 || (c.phone || '').indexOf(q) !== -1;
    }) : all;

    var totalSpent = all.reduce(function (s, c) { return s + c.spent; }, 0);

    container.innerHTML =
      '<div class="page-header"><div class="page-title">👥 العملاء</div>' +
        '<div class="page-actions"><button class="btn btn-primary btn-sm" id="addCust">＋ عميل</button></div></div>' +
      '<div class="grid-3 mb-12">' +
        '<div class="stat-card"><div class="value">' + all.length + '</div><div class="label">إجمالي العملاء</div></div>' +
        '<div class="stat-card"><div class="value">' + window.fmt.num(totalSpent) + '</div><div class="label">إجمالي الإنفاق</div></div>' +
        '<div class="stat-card"><div class="value">' + all.filter(function (c) { return c.visits >= 3; }).length + '</div><div class="label">عملاء دائمون</div></div>' +
      '</div>' +
      '<div class="form-group"><input id="custSearch" placeholder="🔍 بحث بالاسم أو الموبايل" value="' + ui.esc(search) + '"></div>' +
      '<div id="custList">' + (list.length ? list.map(rowHtml).join('') :
        '<div class="empty-state"><span class="icon">👥</span>لا يوجد عملاء بعد</div>') + '</div>';

    wire(container);
  }

  function rowHtml(c) {
    return '<div class="card cust-card" data-key="' + ui.esc(c.key) + '" style="margin-bottom:8px;cursor:pointer">' +
      '<div class="bc-top">' +
        '<div>' +
          '<div class="bc-name">' + ui.esc(c.name) + (c.visits >= 3 ? ' <span class="badge badge-info">دائم</span>' : '') + '</div>' +
          '<div class="bc-meta">' +
            (c.phone ? '<span>📞 ' + ui.esc(c.phone) + '</span>' : '') +
            '<span>🎾 ' + c.visits + ' حجز</span>' +
            (c.lastVisit ? '<span>📅 آخر زيارة ' + window.fmt.dateShort(c.lastVisit) + '</span>' : '') +
          '</div>' +
          (c.notes ? '<div class="bc-meta" style="margin-top:4px">📝 ' + ui.esc(c.notes) + '</div>' : '') +
        '</div>' +
        '<div class="bc-amount">' + window.fmt.money(c.spent) + '</div>' +
      '</div>' +
    '</div>';
  }

  function wire(container) {
    var s = container.querySelector('#custSearch');
    if (s) s.addEventListener('input', function () {
      search = this.value;
      var pos = this.selectionStart;
      render(container);
      var ns = container.querySelector('#custSearch');
      if (ns) { ns.focus(); try { ns.setSelectionRange(pos, pos); } catch (e) {} }
    });

    var add = container.querySelector('#addCust');
    if (add) add.addEventListener('click', function () { custModal(null, container); });

    container.querySelectorAll('.cust-card').forEach(function (el) {
      el.addEventListener('click', function () {
        var key = el.getAttribute('data-key');
        var c = buildList().filter(function (x) { return x.key === key; })[0];
        if (c) detailModal(c, container);
      });
    });
  }

  /* ---- Customer history / detail ---- */
  function detailModal(c, container) {
    var books = window.db.bookings.filter(function (b) {
      return b.status !== 'cancelled' && keyFor(b.clientName || 'بدون اسم', b.phone || '') === c.key;
    }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var rows = books.length ? books.map(function (b) {
      var amount = (parseFloat(b.cash) || 0) + (parseFloat(b.visa) || 0);
      return '<div class="r-line"><span>' + window.fmt.dateShort(b.date) + ' · ' + window.fmt.time12(b.startTime) +
        ' · ملعب ' + b.courtNumber + '</span><span>' + window.fmt.money(amount) + '</span></div>';
    }).join('') : '<div class="muted">لا توجد حجوزات مسجلة لهذا العميل.</div>';

    var ov = ui.openModal(
      '<div class="modal-header"><div class="modal-title">' + ui.esc(c.name) + '</div>' +
        '<button class="modal-close" data-close>×</button></div>' +
      '<div class="bc-meta mb-12">' + (c.phone ? '📞 ' + ui.esc(c.phone) + ' · ' : '') +
        '🎾 ' + c.visits + ' حجز · 💰 ' + window.fmt.money(c.spent) + '</div>' +
      '<div class="receipt">' + rows + '</div>' +
      '<div class="modal-actions mt-16">' +
        '<button class="btn btn-secondary" data-edit>✏️ تعديل البيانات</button>' +
        '<button class="btn btn-secondary" data-close>إغلاق</button></div>'
    );
    ov.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { ui.closeModal(ov); }); });
    ov.querySelector('[data-edit]').addEventListener('click', function () { ui.closeModal(ov); custModal(c, container); });
  }

  /* ---- Add / edit a manual customer record ---- */
  function custModal(c, container) {
    var isEdit = !!(c && c.id);
    var ov = ui.openModal(
      '<div class="modal-header"><div class="modal-title">' + (c ? 'تعديل عميل' : 'عميل جديد') + '</div>' +
        '<button class="modal-close" data-close>×</button></div>' +
      '<div class="form-group"><label>الاسم</label><input id="cName" value="' + ui.esc(c ? c.name : '') + '"></div>' +
      '<div class="form-group"><label>الموبايل</label><input id="cPhone" type="tel" value="' + ui.esc(c ? c.phone : '') + '"></div>' +
      '<div class="form-group"><label>ملاحظات</label><textarea id="cNotes">' + ui.esc(c ? c.notes : '') + '</textarea></div>' +
      '<div class="modal-actions">' +
        (isEdit ? '<button class="btn btn-danger" data-del>حذف</button>' : '') +
        '<button class="btn btn-primary" data-save>حفظ</button>' +
        '<button class="btn btn-secondary" data-close>إلغاء</button></div>'
    );
    ov.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { ui.closeModal(ov); }); });
    ov.querySelector('[data-save]').addEventListener('click', function () {
      var name = ov.querySelector('#cName').value.trim();
      if (!name) { ui.toast('اكتب اسم العميل', '#e03131'); return; }
      var data = { name: name, phone: ov.querySelector('#cPhone').value.trim(), notes: ov.querySelector('#cNotes').value.trim() };
      if (isEdit) window.db.customers.update(c.id, data);
      else window.db.customers.add(data);
      ui.closeModal(ov); ui.toast('تم الحفظ ✓'); render(container);
    });
    var del = ov.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      if (confirm('حذف بيانات العميل؟ (الحجوزات لن تُحذف)')) { window.db.customers.remove(c.id); ui.closeModal(ov); ui.toast('تم الحذف ✓'); render(container); }
    });
  }

  window.PMGR.pages.customers = render;
})();
