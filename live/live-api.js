/* bolla® live — collegamento al backend (Apps Script) o, con ?demo, a un finto backend nel browser.
   In demo telefono e schermo si parlano tramite localStorage: aprili nello stesso browser
   (live/?demo e live/schermo.html?demo) per provare tutto senza toccare il foglio vero. */
(function () {
  var C = window.BOLLA;
  var DEMO = !C.apiUrl;
  var CHIAVE_DEMO = "bolla-live-demo-2";


  function leggiDemo() {
    try { return JSON.parse(localStorage.getItem(CHIAVE_DEMO)) || { ultimo: 0, voci: [] }; } catch (e) { return { ultimo: 0, voci: [] }; }
  }

  function demo(body) {
    var feed = leggiDemo();
    if (body.action === "live_invia") {
      if (!body.nickname) return { ok: false, errore: "nickname", messaggio: "Scegli un nickname." };
      if (!/^[\p{L}\p{N}'’ \-]{1,24}$/u.test(body.emozione || "")) return { ok: false, errore: "emozione", messaggio: "Scrivi cosa provi, solo lettere e spazi." };
      var voce = { id: feed.ultimo + 1, nickname: body.nickname, colore: body.colore, emozione: body.emozione, t: Date.now() };
      feed.ultimo = voce.id;
      feed.voci = feed.voci.concat(voce).slice(-80);
      try { localStorage.setItem(CHIAVE_DEMO, JSON.stringify(feed)); } catch (e) { /* storage pieno o bloccato */ }
      return { ok: true, attesa: 5 };
    }
    if (body.action === "live_feed") {
      var dopo = Number(body.dopo) || 0;
      return { ok: true, codice: "demo", ultimo: feed.ultimo, voci: feed.voci.filter(function (v) { return v.id > dopo; }) };
    }
    return { ok: false, errore: "dati", messaggio: "Azione sconosciuta." };
  }

  window.BOLLA_LIVE = {
    demo: DEMO,
    api: function (action, dati) {
      var body = Object.assign({ action: action }, dati || {});
      if (DEMO) {
        return new Promise(function (ok) { setTimeout(function () { ok(demo(body)); }, 250 + Math.random() * 300); });
      }
      return fetch(C.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body)
      }).then(function (r) { return r.json(); });
    }
  };
})();
