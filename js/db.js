/* ===================================================================
   db.js — the single localStorage layer for Padel MGR v2.
   Every module reads/writes data ONLY through window.db.
   =================================================================== */
(function () {
  'use strict';

  var PREFIX = 'pmgr_';
  var ENTITIES = ['bookings', 'closings', 'trainees', 'groups', 'trainers', 'sessions'];

  var DEFAULTS = {
    settings: {
      clubName: 'نادي البادل',
      courts: 2,
      morningPrice: 150,
      eveningPrice: 200,
      overtimeEnabled: false,
      overtimePrice: 0,
      currency: 'ج'
    },
    bookings: [],
    closings: [],
    trainees: [],
    groups: [],
    trainers: [],
    sessions: []
  };

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function readKey(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error('db.readKey failed for', key, e);
      return fallback;
    }
  }

  function writeKey(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('db.writeKey failed for', key, e);
      return false;
    }
  }

  /* ---- Settings ---- */
  function getSettings() {
    return Object.assign({}, DEFAULTS.settings, readKey('settings', {}) || {});
  }
  function saveSettings(data) {
    writeKey('settings', Object.assign({}, getSettings(), data || {}));
  }

  /* ---- Generic entity store factory ---- */
  function makeStore(name) {
    return {
      getAll: function () {
        var arr = readKey(name, []);
        return Array.isArray(arr) ? arr : [];
      },
      getById: function (id) {
        var found = this.getAll().filter(function (x) { return x.id === id; });
        return found.length ? found[0] : null;
      },
      add: function (data) {
        var all = this.getAll();
        var item = Object.assign({}, data);
        if (!item.id) item.id = generateId();
        if (!item.createdAt) item.createdAt = new Date().toISOString();
        all.push(item);
        writeKey(name, all);
        return item;
      },
      update: function (id, updates) {
        var all = this.getAll();
        var result = null;
        for (var i = 0; i < all.length; i++) {
          if (all[i].id === id) {
            all[i] = Object.assign({}, all[i], updates);
            result = all[i];
            break;
          }
        }
        if (result) writeKey(name, all);
        return result;
      },
      remove: function (id) {
        var all = this.getAll();
        var next = all.filter(function (x) { return x.id !== id; });
        if (next.length === all.length) return false;
        writeKey(name, next);
        return true;
      },
      filter: function (fn) {
        return this.getAll().filter(fn);
      }
    };
  }

  var stores = {};
  ENTITIES.forEach(function (name) { stores[name] = makeStore(name); });

  /* ---- Export / Import ---- */
  function exportAll() {
    var payload = { _app: 'padel-mgr', _version: 2, _exportedAt: new Date().toISOString(), settings: getSettings() };
    ENTITIES.forEach(function (name) { payload[name] = stores[name].getAll(); });
    return JSON.stringify(payload);
  }

  function importAll(jsonString) {
    try {
      var data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') return false;
      if (!data.settings || !Array.isArray(data.bookings)) return false;

      saveSettings(data.settings);

      ENTITIES.forEach(function (name) {
        if (!Array.isArray(data[name])) return;
        var current = stores[name].getAll();
        var byId = {};
        current.forEach(function (x) { byId[x.id] = x; });
        data[name].forEach(function (incoming) {
          if (!incoming.id) incoming.id = generateId();
          byId[incoming.id] = Object.assign({}, byId[incoming.id] || {}, incoming);
        });
        var merged = Object.keys(byId).map(function (k) { return byId[k]; });
        writeKey(name, merged);
      });
      return true;
    } catch (e) {
      console.error('db.importAll failed', e);
      return false;
    }
  }

  /* ---- Migration ---- */
  function levelFromLegacy(lvl) {
    var map = { beg: 'beginner', beginner: 'beginner', int: 'intermediate', inter: 'intermediate',
      intermediate: 'intermediate', adv: 'advanced', advanced: 'advanced', pro: 'pro' };
    return map[lvl] || 'beginner';
  }

  function migrateBookingLegacy(b, date) {
    var pay = b.pay;
    var price = parseFloat(b.price) || 0;
    var splitCash = parseFloat(b.splitCash) || 0;
    var splitVisa = parseFloat(b.splitVisa) || 0;
    var method = pay === 'split' ? 'mixed' : (pay == null ? 'pending' : pay);
    var cash = pay === 'cash' ? price : (pay === 'split' ? splitCash : 0);
    var visa = pay === 'visa' ? price : (pay === 'split' ? splitVisa : 0);
    return {
      id: b.id || generateId(),
      date: b.date || date,
      clientName: b.cust || b.clientName || '',
      phone: b.phone || '',
      courtNumber: parseInt(b.court || b.courtNumber, 10) || 1,
      startTime: b.time || b.startTime || '10:00',
      duration: b.duration != null ? b.duration : Math.round((parseFloat(b.dur) || 1) * 60),
      paymentMethod: method,
      cash: cash,
      visa: visa,
      downPayment: parseFloat(b.deposit || b.downPayment) || 0,
      expenses: Array.isArray(b.expenses) ? b.expenses : [],
      notes: b.notes || '',
      status: pay == null ? 'pending' : 'confirmed',
      hasOvertime: !!b.hasOvertime,
      overtimeMinutes: b.overtimeMinutes || 0,
      overtimeAmount: b.overtimeAmount || 0,
      createdAt: b.createdAt || new Date().toISOString()
    };
  }

  function migrate() {
    if (localStorage.getItem(PREFIX + 'migrated') === '1') return;

    try {
      var didImport = false;

      // (A) Plan-described separate legacy keys: padelBookings, padelClosings, ...
      var legacyMap = {
        padelSettings: 'settings',
        padelBookings: 'bookings',
        padelClosings: 'closings',
        padelTrainees: 'trainees',
        padelGroups: 'groups',
        padelTrainers: 'trainers'
      };
      Object.keys(legacyMap).forEach(function (oldKey) {
        var raw = localStorage.getItem(oldKey);
        if (!raw) return;
        try {
          var parsed = JSON.parse(raw);
          var target = legacyMap[oldKey];
          if (target === 'settings') {
            saveSettings(parsed);
          } else if (target === 'bookings' && Array.isArray(parsed)) {
            writeKey('bookings', parsed.map(function (b) { return migrateBookingLegacy(b, b.date); }));
          } else if (Array.isArray(parsed)) {
            writeKey(target, parsed);
          }
          didImport = true;
        } catch (e) { /* ignore malformed legacy key */ }
        localStorage.removeItem(oldKey);
      });

      // (B) Actual current monolith format: single combined object under PADEL_MGR_V15
      var monolithKeys = ['PADEL_MGR_V15', 'PADEL_MGR_V14', 'PADEL_MGR_DATA_V13', 'padelmgr_v12'];
      var mono = null;
      for (var i = 0; i < monolithKeys.length; i++) {
        var rawM = localStorage.getItem(monolithKeys[i]);
        if (rawM) { try { mono = JSON.parse(rawM); } catch (e) { mono = null; } if (mono) break; }
      }

      if (mono) {
        // settings
        if (mono.settings) {
          saveSettings({
            clubName: mono.settings.clubName || DEFAULTS.settings.clubName,
            courts: parseInt(mono.settings.courts, 10) || DEFAULTS.settings.courts,
            morningPrice: parseFloat(mono.settings.priceAM) || DEFAULTS.settings.morningPrice,
            eveningPrice: parseFloat(mono.settings.pricePM) || DEFAULTS.settings.eveningPrice
          });
        }

        // bookings: { 'YYYY-MM-DD': [ {..} ] }
        if (mono.bookings && typeof mono.bookings === 'object') {
          var flatB = [];
          Object.keys(mono.bookings).forEach(function (date) {
            (mono.bookings[date] || []).forEach(function (b) {
              flatB.push(migrateBookingLegacy(b, date));
            });
          });
          if (flatB.length) writeKey('bookings', stores.bookings.getAll().concat(flatB));
        }

        // closings (best-effort copy, keep original shape if compatible)
        if (Array.isArray(mono.closings) && mono.closings.length) {
          var existC = stores.closings.getAll();
          var mc = mono.closings.map(function (c) {
            return Object.assign({ id: c.id || generateId(), createdAt: c.createdAt || new Date().toISOString() }, c);
          });
          writeKey('closings', existC.concat(mc));
        }

        // academy: { trainees:[], groups:[], sessions:{} }
        if (mono.academy) {
          if (Array.isArray(mono.academy.trainees) && mono.academy.trainees.length) {
            writeKey('trainees', mono.academy.trainees.map(function (t) {
              return {
                id: t.id || generateId(),
                name: t.name || '',
                phone: t.phone || '',
                level: levelFromLegacy(t.lvl || t.level),
                subscriptionType: t.sub || t.subscriptionType || 'monthly',
                monthlyPrice: parseFloat(t.price || t.monthlyPrice) || 0,
                trainerId: t.trainerId || null,
                notes: t.notes || '',
                active: t.active !== false,
                startDate: t.startDate || new Date().toISOString().split('T')[0]
              };
            }));
          }
          if (Array.isArray(mono.academy.groups) && mono.academy.groups.length) {
            writeKey('groups', mono.academy.groups);
          }
        }

        didImport = true;
      }

      // (C) Standalone pmgr_closings written by the older app (already namespaced)
      try {
        var legacyClosings = localStorage.getItem('pmgr_closings');
        if (legacyClosings && stores.closings.getAll().length === 0) {
          var lc = JSON.parse(legacyClosings);
          if (Array.isArray(lc) && lc.length) {
            writeKey('closings', lc.map(function (c) {
              return Object.assign({ id: c.id || generateId(), createdAt: c.createdAt || new Date().toISOString() }, c);
            }));
            didImport = true;
          }
        }
      } catch (e) { /* ignore */ }

      // (D) Nothing found → initialize defaults
      if (!didImport) {
        if (readKey('settings', null) === null) writeKey('settings', DEFAULTS.settings);
        ENTITIES.forEach(function (name) {
          if (readKey(name, null) === null) writeKey(name, []);
        });
      } else {
        // ensure settings + all entities exist
        if (readKey('settings', null) === null) writeKey('settings', DEFAULTS.settings);
        ENTITIES.forEach(function (name) {
          if (readKey(name, null) === null) writeKey(name, []);
        });
      }

      localStorage.setItem(PREFIX + 'migrated', '1');
    } catch (e) {
      console.error('db.migrate failed', e);
    }
  }

  window.db = {
    generateId: generateId,
    getSettings: getSettings,
    saveSettings: saveSettings,
    bookings: stores.bookings,
    closings: stores.closings,
    trainees: stores.trainees,
    groups: stores.groups,
    trainers: stores.trainers,
    sessions: stores.sessions,
    migrate: migrate,
    exportAll: exportAll,
    importAll: importAll,
    DEFAULTS: DEFAULTS
  };
})();
