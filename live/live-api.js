/* bolla® live — collegamento al backend (Apps Script) o, con ?demo, a un finto backend nel browser.
   In demo telefono, schermo e regia si parlano tramite localStorage: aprili nello stesso browser
   (live/?demo, live/schermo.html?demo, live/regia.html?demo) per provare tutto senza toccare il foglio vero. */
(function () {
  var C = window.BOLLA;
  var DEMO = !C.apiUrl;
  var CHIAVE_DEMO = "bolla-live-demo-2";
  var CHIAVE_ACCESSO = "bolla-visuals-accesso";

  function leggiLocale(k, vuoto) {
    try { return JSON.parse(localStorage.getItem(k)) || vuoto; } catch (e) { return vuoto; }
  }
  function scriviLocale(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage pieno o bloccato */ }
  }

  function demo(body) {
    var feed = leggiLocale(CHIAVE_DEMO, { ultimo: 0, voci: [] });
    if (body.action === "live_invia") {
      if (!body.nickname) return { ok: false, errore: "nickname", messaggio: "Scegli un nickname." };
      if (!/^[\p{L}\p{N}'’ \-]{1,24}$/u.test(body.emozione || "")) return { ok: false, errore: "emozione", messaggio: "Scrivi cosa provi, solo lettere e spazi." };
      var voce = { id: feed.ultimo + 1, nickname: body.nickname, colore: body.colore, emozione: body.emozione, t: Date.now() };
      feed.ultimo = voce.id;
      feed.voci = feed.voci.concat(voce).slice(-80);
      scriviLocale(CHIAVE_DEMO, feed);
      return { ok: true, attesa: 5 };
    }
    var regia = leggiLocale(CHIAVE_DEMO + "-regia", null);
    if (body.action === "live_feed") {
      if (body.stato) scriviLocale(CHIAVE_DEMO + "-schermo", { t: Date.now(), stato: body.stato });
      var dopo = Number(body.dopo) || 0;
      return { ok: true, codice: "demo", ultimo: feed.ultimo, voci: feed.voci.filter(function (v) { return v.id > dopo; }), regia: regia };
    }
    if (body.action === "live_regia") {
      if (body.regia && (!regia || body.regia.rev > regia.rev)) { regia = body.regia; scriviLocale(CHIAVE_DEMO + "-regia", regia); }
      return { ok: true, regia: regia, schermo: leggiLocale(CHIAVE_DEMO + "-schermo", null), ora: Date.now(), codice: "demo", voci: feed.voci.slice(-40) };
    }
    return { ok: false, errore: "dati", messaggio: "Azione sconosciuta." };
  }

  // Link segreto visuals (#k=...): si salva nel browser e sparisce dalla barra degli indirizzi.
  // Schermo e regia aperti nello stesso browser lo condividono.
  function accesso() {
    var dalLink = (location.hash.match(/[#&]k=([A-Za-z0-9]+)/) || [])[1];
    if (dalLink) {
      try { localStorage.setItem(CHIAVE_ACCESSO, dalLink); } catch (e) { /* storage non disponibile */ }
      history.replaceState(null, "", location.pathname + location.search);
      return dalLink;
    }
    try { return localStorage.getItem(CHIAVE_ACCESSO) || (DEMO ? "demo" : null); } catch (e) { return DEMO ? "demo" : null; }
  }

  window.BOLLA_LIVE = {
    demo: DEMO,
    // impostazioni delle visuals decise dalla regia (rev = quando sono cambiate: vince la più recente)
    regiaIniziale: function () {
      return { rev: 0, tipo: 0, auto: false, velocita: 1, bassi: 1, audioId: "",
        qr: { x: 1, y: 1, visibile: true }, chat: { x: 0, y: 1, visibile: true }, nascoste: [], comandi: [] };
    },
    accesso: accesso,
    dimentica: function () { try { localStorage.removeItem(CHIAVE_ACCESSO); } catch (e) { /* niente */ } },
    // schermo e regia nello stesso computer si parlano subito, senza passare dal server
    canale: window.BroadcastChannel ? new BroadcastChannel("bolla-visuals") : null,
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
