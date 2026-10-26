/* bolla® — modalità DEMO (solo quando apiUrl in config.js è vuoto).
   Esegue nel browser lo stesso apps-script/Code.gs, con fogli ed email finti salvati in localStorage.
   Le email "inviate" compaiono nella casella demo in basso a sinistra. */
(function () {
  "use strict";
  if (window.BOLLA.apiUrl) return;

  var KEY = "bolla-demo-v2";
  var db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
  if (!db) db = { sheets: {}, mail: [], cache: {} };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage non disponibile */ } }

  function revive(v) { return typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v) ? new Date(v) : v; }
  function sheet(name) {
    var rows = db.sheets[name];
    return {
      appendRow: function (r) { rows.push(r.map(function (v) { return typeof v === "string" && v.charAt(0) === "'" ? v.slice(1) : v; })); },
      getLastRow: function () { return rows.length; },
      getLastColumn: function () { return rows[0] ? rows[0].length : 0; },
      getMaxRows: function () { return 1000; },
      setFrozenRows: function () {},
      clearContents: function () { rows.length = 0; },
      getDataRange: function () { return { getValues: function () { return rows.map(function (r) { return r.map(revive); }); } }; },
      getRange: function (r, c, nr, nc) {
        return {
          setNumberFormat: function () {},
          getValues: function () { return rows.slice(r - 1, r - 1 + (nr || 1)).map(function (x) { return x.slice(c - 1, c - 1 + (nc || 1)).map(revive); }); },
          setValue: function (v) { rows[r - 1][c - 1] = v; },
          setValues: function (vs) { vs.forEach(function (row, i) { rows[r - 1 + i] = row.slice(); }); }
        };
      }
    };
  }
  var base = location.origin + location.pathname.replace(/[^/]*$/, "");
  function locale(s) { return String(s).split("https://bbbbolla.it/").join(base); }
  function hex() { return crypto.randomUUID(); }

  // SHA-256 sincrono (Apps Script lo è; WebCrypto no), solo per la demo
  function sha256Bytes(msg) {
    var K = [], H = [], i, j;
    var primi = 0, n = 2;
    function frac(x) { return ((x - Math.floor(x)) * 4294967296) | 0; }
    while (primi < 64) {
      var primo = true;
      for (j = 2; j * j <= n; j++) if (n % j === 0) { primo = false; break; }
      if (primo) { if (primi < 8) H[primi] = frac(Math.pow(n, 1 / 2)); K[primi] = frac(Math.pow(n, 1 / 3)); primi++; }
      n++;
    }
    var bytes = Array.from(new TextEncoder().encode(msg));
    var l = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (l >>> (i * 8)) & 255);
    function r(x, y) { return (x >>> y) | (x << (32 - y)); }
    for (i = 0; i < bytes.length; i += 64) {
      var w = [], a = H.slice();
      for (j = 0; j < 64; j++) {
        if (j < 16) w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3];
        else {
          var s0 = r(w[j - 15], 7) ^ r(w[j - 15], 18) ^ (w[j - 15] >>> 3);
          var s1 = r(w[j - 2], 17) ^ r(w[j - 2], 19) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        var t1 = (a[7] + (r(a[4], 6) ^ r(a[4], 11) ^ r(a[4], 25)) + ((a[4] & a[5]) ^ (~a[4] & a[6])) + K[j] + w[j]) | 0;
        var t2 = ((r(a[0], 2) ^ r(a[0], 13) ^ r(a[0], 22)) + ((a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]))) | 0;
        a = [(t1 + t2) | 0, a[0], a[1], a[2], (a[3] + t1) | 0, a[4], a[5], a[6]];
      }
      for (j = 0; j < 8; j++) H[j] = (H[j] + a[j]) | 0;
    }
    var out = [];
    H.forEach(function (x) { out.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); });
    return out;
  }

  var env = {
    SpreadsheetApp: {
      getActive: function () {
        return {
          getSheetByName: function (n) { return db.sheets[n] ? sheet(n) : null; },
          insertSheet: function (n) { db.sheets[n] = []; return sheet(n); }
        };
      },
      flush: function () {}
    },
    MailApp: {
      getRemainingDailyQuota: function () { return 100; },
      sendEmail: function (a, oggetto, testo, opt) {
        db.mail.unshift({ a: a, oggetto: oggetto, html: locale(opt.htmlBody), qr: !!(opt.inlineImages && opt.inlineImages.qr), quando: new Date().toISOString() });
      }
    },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    CacheService: {
      getScriptCache: function () {
        return {
          get: function (k) { return db.cache[k] || null; },
          put: function (k, v) { db.cache[k] = v; },
          getAll: function (ks) { var o = {}; ks.forEach(function (k) { if (k in db.cache) o[k] = db.cache[k]; }); return o; },
          putAll: function (o) { Object.assign(db.cache, o); }
        };
      }
    },
    PropertiesService: {
      getScriptProperties: function () {
        db.props = db.props || {};
        return { getProperty: function (k) { return db.props[k] || null; }, setProperty: function (k, v) { db.props[k] = v; } };
      }
    },
    // nel browser niente rete sincrona: Code.gs usa la lista di riserva e salta il controllo DNS
    UrlFetchApp: { fetch: function () { throw new Error("demo: rete non disponibile"); } },
    Utilities: {
      getUuid: hex,
      parseDate: function (s) { return new Date(s.replace(" ", "T") + ":00+01:00"); },
      formatDate: function (d, tz, f) {
        var p = function (n) { return ("0" + n).slice(-2); };
        return f === "dd.MM.yyyy" ? p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear() : d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
      },
      base64Decode: function (s) { return s; },
      DigestAlgorithm: { SHA_256: "SHA_256" },
      computeDigest: function (alg, testo) { return sha256Bytes(testo); },
      sleep: function () {},
      // firma finta, solo per la demo: in Apps Script è un vero HMAC-SHA256
      computeHmacSha256Signature: function (v, k) {
        var h = 2166136261, out = [], s = k + "|" + v;
        for (var i = 0; i < 32; i++) { for (var j = 0; j < s.length; j++) h = Math.imul(h ^ s.charCodeAt(j) ^ i, 16777619); out.push(h & 255); }
        return out;
      },
      base64EncodeWebSafe: function (b) { return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, "-").replace(/\//g, "_"); },
      newBlob: function () { return {}; }
    },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: function (s) { return { setMimeType: function () { return s; } }; } }
  };

  var gs = fetch("apps-script/Code.gs", { cache: "no-cache" }).then(function (r) { return r.text(); }).then(function (src) {
    var names = Object.keys(env);
    var make = new Function(names.join(","), src + "\nreturn { doPost: doPost, setup: setup, appendi_: appendi_ };");
    var api = make.apply(null, names.map(function (n) { return env[n]; }));
    if (!db.sheets.Serate) {
      api.setup();
      // serate del sito e un invito di prova: ?invito=demoinvito01
      db.sheets.Serate.length = 1;
      window.BOLLA.serate.forEach(function (s) { db.sheets.Serate.push([s.id, "bolla® — " + s.lineup.map(function (a) { return a.nome.it || a.nome; }).join(", "), s.data, "150", "TRUE"]); });
      api.appendi_("Inviti", { token: "demoinvito01", etichetta: "Invito di prova", serata: "", max: 3, scadenza: "", attivo: "TRUE", creato: new Date() });
      db.props = db.props || {};
      save();
    }
    // link segreto staff della demo: staff.html?demo entra da solo
    db.props = db.props || {};
    if (!db.props.LINK_STAFF) { db.props.LINK_STAFF = "demostaff"; save(); }
    return api;
  });

  window.BOLLA_DEMO = {
    call: function (body) {
      return gs.then(function (api) {
        var out = JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }));
        save();
        renderInbox();
        return out;
      });
    },
    reset: function () { try { localStorage.removeItem(KEY); } catch (e) { /* niente */ } location.href = base; }
  };

  /* ---------- casella email demo ---------- */
  var box;
  function renderInbox() {
    if (!box) {
      box = document.createElement("details");
      box.className = "demo-inbox";
      document.body.appendChild(box);
    }
    var aperta = box.open;
    box.innerHTML = "";
    var sum = document.createElement("summary");
    sum.textContent = "Email demo (" + db.mail.length + ")";
    box.appendChild(sum);
    var p = document.createElement("p");
    p.className = "demo-inbox__hint";
    p.textContent = "Nessuna email vera: qui vedi cosa riceverebbe ogni persona. Invito di prova: ?invito=demoinvito01";
    box.appendChild(p);
    db.mail.slice(0, 30).forEach(function (m) {
      var item = document.createElement("div");
      item.className = "demo-inbox__item";
      var h = document.createElement("strong"); h.textContent = m.oggetto; item.appendChild(h);
      var to = document.createElement("span"); to.textContent = "a " + m.a + (m.qr ? " · con QR" : ""); item.appendChild(to);
      var tmp = document.createElement("div"); tmp.innerHTML = m.html;
      var links = tmp.querySelectorAll("a[href*='?pass='], a[href*='?gruppo=']");
      Array.prototype.forEach.call(links, function (l, i) {
        if (i > 1) return;
        var a = document.createElement("a"); a.href = l.getAttribute("href");
        a.textContent = /pass=/.test(a.href) ? "Apri link personale" : "Link del gruppo";
        item.appendChild(a);
      });
      box.appendChild(item);
    });
    var reset = document.createElement("button");
    reset.type = "button"; reset.textContent = "Azzera demo";
    reset.addEventListener("click", window.BOLLA_DEMO.reset);
    box.appendChild(reset);
    box.open = aperta;
  }
  document.addEventListener("DOMContentLoaded", renderInbox);
})();
