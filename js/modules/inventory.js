/* ===================================================================
   inventory.js — Stock/buffet management. Track items (qty, cost, sell
   price), record quick sales (decrement stock), and flag low stock.
   =================================================================== */
(function () {
  'use strict';
  window.PMGR = window.PMGR || {}; window.PMGR.pages = window.PMGR.pages || {};

  var LOW = 5;

  function render(container) {
    var items = window.db.inventory.getAll();
    var stockValue = items.reduce(function (s, it) { return s + (parseFloat(it.qty) || 0) * (parseFloat(it.cost) || 0); }, 0);
    var soldRevenue = items.reduce(function (s, it) { return s + (parseFloat(it.sold) || 0) * (parseFloat(it.price) || 0); }, 0);
    var lowCount = items.filter(function (it) { return (parseFloat(it.qty) || 0) <= LOW; }).length;

    container.innerHTML =
      '<div class="page-header"><div class="page-title">📦 المخزن</div>' +
        '<div class="page-actions"><button class="btn btn-primary btn-sm" id="addItem">＋ صنف</button></div></div>' +
      '<div class="grid-3 mb-12">' +
        '<div class="stat-card"><div class="value">' + items.length + '</div><div class="label">عدد الأصناف</div></div>' +
        '<div class="stat-card"><div class="value">' + window.fmt.num(stockValue) + '</div><div class="label">قيمة المخزون</div></div>' +
        '<div class="stat-card"><div class="value">' + window.fmt.num(soldRevenue) + '</div><div class="label">إيراد المبيعات</div></div>' +
      '</div>' +
      (lowCount ? '<div class="badge badge-warning mb-12">⚠️ ' + lowCount + ' صنف على وشك النفاد</div>' : '') +
      '<div id="invList">' + (items.length ? items.map(rowHtml).join('') :
        '<div class="empty-state"><span class="icon">📦</span>لا توجد أصناف — اضغط ＋ لإضافة صنف</div>') + '</div>';

    wire(container);
  }

  function rowHtml(it) {
    var qty = parseFloat(it.qty) || 0;
    var low = qty <= LOW;
    return '<div class="card" style="margin-bottom:8px">' +
      '<div class="bc-top">' +
        '<div>' +
          '<div class="bc-name">' + ui.esc(it.name) + (low ? ' <span class="badge badge-warning">منخفض</span>' : '') + '</div>' +
          '<div class="bc-meta">' +
            '<span>📦 المتاح: <b>' + qty + '</b></span>' +
            '<span>💵 بيع: ' + window.fmt.money(it.price) + '</span>' +
            (it.cost ? '<span>🏷️ تكلفة: ' + window.fmt.money(it.cost) + '</span>' : '') +
            (it.sold ? '<span>✅ مباع: ' + it.sold + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="bc-actions">' +
        '<button class="btn btn-success btn-sm" data-sell="' + it.id + '"' + (qty <= 0 ? ' disabled' : '') + '>🛒 بيع</button>' +
        '<button class="btn btn-secondary btn-sm" data-restock="' + it.id + '">➕ توريد</button>' +
        '<button class="btn btn-secondary btn-sm" data-edit="' + it.id + '">✏️ تعديل</button>' +
        '<button class="btn btn-danger btn-sm" data-del="' + it.id + '">🗑️</button>' +
      '</div>' +
    '</div>';
  }

  function wire(container) {
    var add = container.querySelector('#addItem');
    if (add) add.addEventListener('click', function () { itemModal(null, container); });

    container.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () { itemModal(window.db.inventory.getById(b.getAttribute('data-edit')), container); });
    });
    container.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () { if (confirm('حذف الصنف؟')) { window.db.inventory.remove(b.getAttribute('data-del')); ui.toast('تم الحذف ✓'); render(container); } });
    });
    container.querySelectorAll('[data-sell]').forEach(function (b) {
      b.addEventListener('click', function () { changeQty(b.getAttribute('data-sell'), -1, true, container); });
    });
    container.querySelectorAll('[data-restock]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = parseInt(prompt('الكمية الموردة:', '10'), 10);
        if (n && n > 0) changeQty(b.getAttribute('data-restock'), n, false, container);
      });
    });
  }

  function changeQty(id, delta, isSale, container) {
    var it = window.db.inventory.getById(id);
    if (!it) return;
    var qty = (parseFloat(it.qty) || 0) + delta;
    if (qty < 0) qty = 0;
    var upd = { qty: qty };
    if (isSale) upd.sold = (parseFloat(it.sold) || 0) + 1;
    window.db.inventory.update(id, upd);
    ui.toast(isSale ? ('تم بيع ' + it.name + ' ✓') : 'تم التوريد ✓');
    render(container);
  }

  function itemModal(it, container) {
    var isEdit = !!it;
    var ov = ui.openModal(
      '<div class="modal-header"><div class="modal-title">' + (isEdit ? 'تعديل صنف' : 'صنف جديد') + '</div>' +
        '<button class="modal-close" data-close>×</button></div>' +
      '<div class="form-group"><label>اسم الصنف</label><input id="iName" value="' + ui.esc(it ? it.name : '') + '"></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label>الكمية</label><input id="iQty" type="number" value="' + (it ? it.qty : 0) + '"></div>' +
        '<div class="form-group"><label>سعر البيع</label><input id="iPrice" type="number" value="' + (it ? it.price : '') + '"></div>' +
      '</div>' +
      '<div class="form-group"><label>سعر التكلفة (اختياري)</label><input id="iCost" type="number" value="' + (it ? (it.cost || '') : '') + '"></div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-primary" data-save>حفظ</button>' +
        '<button class="btn btn-secondary" data-close>إلغاء</button></div>'
    );
    ov.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { ui.closeModal(ov); }); });
    ov.querySelector('[data-save]').addEventListener('click', function () {
      var name = ov.querySelector('#iName').value.trim();
      if (!name) { ui.toast('اكتب اسم الصنف', '#e03131'); return; }
      var data = {
        name: name,
        qty: parseFloat(ov.querySelector('#iQty').value) || 0,
        price: parseFloat(ov.querySelector('#iPrice').value) || 0,
        cost: parseFloat(ov.querySelector('#iCost').value) || 0
      };
      if (isEdit) window.db.inventory.update(it.id, data);
      else { data.sold = 0; window.db.inventory.add(data); }
      ui.closeModal(ov); ui.toast('تم الحفظ ✓'); render(container);
    });
  }

  window.PMGR.pages.inventory = render;
})();
