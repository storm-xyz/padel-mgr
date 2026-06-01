/* ===================================================================
   ai.js — assistant. Uses Anthropic API with a client-side key
   (stored only in localStorage). Falls back to local data answers
   when no key is set.
   =================================================================== */
(function () {
  'use strict';
  window.PMGR = window.PMGR || {}; window.PMGR.pages = window.PMGR.pages || {};

  var AI_KEY = 'pmgr_ai_key';
  var MODEL = 'claude-3-5-sonnet-20241022';
  var API = 'https://api.anthropic.com/v1/messages';
  var history = []; // {role:'user'|'assistant', text}

  var SUGGESTIONS = [
    'كام حجز عندي النهاردة؟',
    'إيرادات الشهر ده كام؟',
    'إيه أكتر الأوقات ازدحاماً؟',
    'مين أكتر العملاء حجزاً؟'
  ];

  function render(container) {
    var hasKey = !!localStorage.getItem(AI_KEY);
    container.innerHTML =
      '<div class="page-header"><div class="page-title">🤖 المساعد الذكي</div></div>' +
      (hasKey ? '' : '<div class="card mb-12" style="background:var(--warning-bg);color:var(--warning-text)">لتفعيل الذكاء الاصطناعي الكامل، أضف مفتاح Anthropic من <b>الإعدادات</b>. بدونه هرد على الأسئلة الأساسية من بياناتك مباشرة.</div>') +
      '<div class="ai-page">' +
        '<div class="ai-messages" id="aiMessages"></div>' +
        '<div class="ai-suggestions" id="aiSuggestions">' +
          SUGGESTIONS.map(function (s) { return '<button class="chip" data-suggest="' + ui.esc(s) + '">' + ui.esc(s) + '</button>'; }).join('') +
        '</div>' +
        '<div class="ai-input-bar"><input id="aiInput" placeholder="اكتب سؤالك..."><button class="btn btn-primary" id="aiSend">إرسال</button></div>' +
      '</div>';

    var messages = container.querySelector('#aiMessages');
    function paint() {
      messages.innerHTML = history.length
        ? history.map(function (m) { return '<div class="ai-msg ' + (m.role === 'user' ? 'user' : 'bot') + '">' + ui.esc(m.text) + '</div>'; }).join('')
        : '<div class="empty-state"><span class="icon">🤖</span>اسألني عن حجوزاتك، إيراداتك، أو أكاديميتك</div>';
      messages.scrollTop = messages.scrollHeight;
    }
    paint();

    function send(text) {
      text = (text || container.querySelector('#aiInput').value).trim();
      if (!text) return;
      history.push({ role: 'user', text: text });
      container.querySelector('#aiInput').value = '';
      paint();
      var typing = document.createElement('div');
      typing.className = 'ai-msg bot'; typing.innerHTML = '<span class="ai-typing"><i></i><i></i><i></i></span>';
      messages.appendChild(typing); messages.scrollTop = messages.scrollHeight;

      answer(text).then(function (reply) {
        typing.remove(); history.push({ role: 'assistant', text: reply }); paint();
      }).catch(function (err) {
        typing.remove(); history.push({ role: 'assistant', text: '⚠️ ' + (err && err.message ? err.message : 'حصل خطأ') }); paint();
      });
    }

    container.querySelector('#aiSend').addEventListener('click', function () { send(); });
    container.querySelector('#aiInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
    container.querySelectorAll('[data-suggest]').forEach(function (b) { b.addEventListener('click', function () { send(b.getAttribute('data-suggest')); }); });
  }

  /* ---------------- Data context ---------------- */
  function buildContext() {
    var s = window.db.getSettings();
    var today = window.fmt.ymd(new Date());
    var month = today.substring(0, 7);
    var all = window.db.bookings.getAll();
    var todayB = all.filter(function (b) { return b.date === today && b.status !== 'cancelled'; });
    var monthB = all.filter(function (b) { return (b.date || '').startsWith(month) && b.status !== 'cancelled'; });
    var monthRevenue = monthB.reduce(function (sum, b) { return sum + (parseFloat(b.cash) || 0) + (parseFloat(b.visa) || 0); }, 0);
    var byHour = {}, byClient = {};
    all.forEach(function (b) {
      var h = parseInt((b.startTime || '0').split(':')[0], 10); byHour[h] = (byHour[h] || 0) + 1;
      if (b.clientName) byClient[b.clientName] = (byClient[b.clientName] || 0) + 1;
    });
    var peak = Object.keys(byHour).sort(function (a, b) { return byHour[b] - byHour[a]; }).slice(0, 3);
    var topClients = Object.keys(byClient).sort(function (a, b) { return byClient[b] - byClient[a]; }).slice(0, 5);
    return {
      club: s.clubName, currency: s.currency, today: today,
      todayCount: todayB.length,
      monthCount: monthB.length, monthRevenue: monthRevenue,
      totalBookings: all.length, trainees: window.db.trainees.getAll().length,
      groups: window.db.groups.getAll().length,
      peakHours: peak, topClients: topClients,
      todayList: todayB.map(function (b) { return { name: b.clientName, time: b.startTime, court: b.courtNumber, dur: b.duration }; })
    };
  }

  /* ---------------- Local fallback answers ---------------- */
  function localAnswer(q) {
    var ctx = buildContext();
    var s = window.db.getSettings();
    if (/النهاردة|اليوم|today/i.test(q) && /حجز|booking/i.test(q))
      return 'عندك ' + ctx.todayCount + ' حجز النهاردة' + (ctx.todayList.length ? ':\n' + ctx.todayList.map(function (b) { return '• ' + b.name + ' — ' + window.fmt.time12(b.time) + ' (ملعب ' + b.court + ')'; }).join('\n') : '.');
    if (/إيراد|revenue|فلوس|دخل/i.test(q))
      return 'إيرادات شهر ' + ctx.today.substring(0, 7) + ': ' + window.fmt.money(ctx.monthRevenue) + ' من ' + ctx.monthCount + ' حجز.';
    if (/ذروة|ازدحام|peak|أوقات/i.test(q))
      return ctx.peakHours.length ? 'أكثر الأوقات ازدحاماً: ' + ctx.peakHours.map(function (h) { return window.fmt.time12(String(h).padStart(2, '0') + ':00'); }).join('، ') + '.' : 'لا توجد بيانات كافية بعد.';
    if (/عملاء|عميل|client|زبون/i.test(q))
      return ctx.topClients.length ? 'أكثر العملاء حجزاً: ' + ctx.topClients.join('، ') + '.' : 'لا يوجد عملاء مسجلون بعد.';
    if (/متدرب|أكاديمي|trainee/i.test(q))
      return 'عندك ' + ctx.trainees + ' متدرب في ' + ctx.groups + ' جروب.';
    return 'لرد أذكى وتحليلات أعمق، فعّل مفتاح Anthropic من الإعدادات. حالياً أقدر أجاوب عن: حجوزات اليوم، إيرادات الشهر، أوقات الذروة، وأفضل العملاء.';
  }

  /* ---------------- Anthropic call ---------------- */
  function answer(q) {
    var key = localStorage.getItem(AI_KEY);
    if (!key) return Promise.resolve(localAnswer(q));

    var ctx = buildContext();
    var system = 'أنت مساعد ذكي لتطبيق إدارة ملاعب بادل اسمه "' + ctx.club + '". ' +
      'جاوب بالعربي المصري بإيجاز ووضوح. استخدم البيانات التالية للإجابة بدقة (العملة: ' + ctx.currency + '):\n' +
      JSON.stringify(ctx);
    var msgs = history.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
      .slice(-10).map(function (m) { return { role: m.role, content: m.text }; });
    msgs.push({ role: 'user', content: q });

    return fetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: system, messages: msgs })
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) {
        if (res.status === 401) throw new Error('مفتاح API غير صحيح — راجع الإعدادات');
        throw new Error('خطأ من الخادم (' + res.status + ')');
      });
      return res.json();
    }).then(function (data) {
      if (data && data.content && data.content[0] && data.content[0].text) return data.content[0].text;
      return localAnswer(q);
    }).catch(function (err) {
      if (err && /Failed to fetch|NetworkError/i.test(err.message || '')) return localAnswer(q) + '\n\n(تعذّر الاتصال بالإنترنت — رد محلي)';
      throw err;
    });
  }

  window.PMGR.pages.ai = render;
})();
