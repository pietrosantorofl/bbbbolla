/* bolla® — pagina nascosta della cena (bbbbolla.it/6nov-tavolacunzata/): prenotazione con nome, cognome, telefono e persone.
   Stesso schema della pagina workshop; i contenuti sono qui sotto, non in config.js. */
(function () {
  "use strict";

  var C = window.BOLLA;
  var CENA = {
    id: "tavolacunzata-2026-11-06",     // deve coincidere con CONFIG.cena.id in apps-script/Code.gs
    data: "2026-11-06",
    ora: "20:00",
    durata: 3,                          // ore, per il calendario
    titolo: "A cena con Marina",
    sottotitolo: "Marina e la sua cucina dell’Antojito Colombiano",
    luogo: {
      nome: "MONO",
      indirizzo: "Via Gornalunga, 12, 95129 Catania CT",
      mappa: "https://www.google.com/maps/search/?api=1&query=MONO+Via+Gornalunga+12+95129+Catania"
    }
  };
  var DEMO = !C.apiUrl;
  var GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  var MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function bind(nome, fn) { Array.prototype.forEach.call(document.querySelectorAll('[data-bind="' + nome + '"]'), fn); }
  function maiuscola(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  /* ---------- contenuti ---------- */
  var p = CENA.data.split("-");
  var giorno = new Date(+p[0], +p[1] - 1, +p[2]);
  var dataLunga = GIORNI[giorno.getDay()] + " " + giorno.getDate() + " " + MESI[giorno.getMonth()] + " " + giorno.getFullYear();

  bind("data", function (n) { n.textContent = maiuscola(dataLunga) + " · dalle " + CENA.ora; });
  bind("quando", function (n) {
    n.textContent = maiuscola(dataLunga);
    n.appendChild(document.createElement("br"));
    n.appendChild(document.createTextNode("Dalle " + CENA.ora));
  });
  bind("dove", function (n) {
    var nome = el("a", null, CENA.luogo.nome);
    nome.href = CENA.luogo.mappa; nome.target = "_blank"; nome.rel = "noopener";
    n.appendChild(nome);
    n.appendChild(document.createElement("br"));
    n.appendChild(document.createTextNode(CENA.luogo.indirizzo));
  });
  bind("demo", function (n) { n.hidden = !DEMO; });

  /* ---------- API (Apps Script, o demo nel browser) ---------- */
  function api(action, dati) {
    var body = Object.assign({ action: action }, dati || {});
    if (DEMO) return window.BOLLA_DEMO.call(body);
    // text/plain evita il preflight CORS, che Apps Script non gestisce
    return fetch(C.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  var form = $("#form");
  var result = $(".result");
  var lead = $(".card__lead");
  var cta = $(".mobile-cta");
  var errBox = $(".form__error");
  function errore(msg) { errBox.textContent = msg || ""; errBox.hidden = !msg; }

  // menu persone: 1..max (il massimo arriva dal backend, che conosce i coperti rimasti)
  function persone(max) {
    var sel = form.persone, prima = sel.value || "1";
    sel.textContent = "";
    for (var i = 1; i <= max; i++) sel.appendChild(el("option", null, String(i))).value = String(i);
    sel.value = +prima <= max ? prima : "1";
  }
  persone(6);

  function renderStato(testo, classe) {
    var box = $(".status");
    box.className = "status" + (classe ? " status--" + classe : "");
    $(".status__label", box).textContent = testo;
  }
  function blocca(msg) {
    form.hidden = true;
    lead.textContent = msg;
    cta.classList.add("is-hidden");
  }

  /* ---------- disponibilità + modulo firmato (anti-bot, con tempo minimo) ---------- */
  var modulo = null, moduloDa = 0;
  var SECONDI_MINIMI = 4.5;
  function nuovoModulo(r) { modulo = r.modulo; moduloDa = Date.now(); }

  function leggiStato(r) {
    if (!r || !r.ok) { renderStato("Non disponibile", "esaurito"); return blocca((r && r.messaggio) || "Qualcosa è andato storto. Riprova tra poco."); }
    nuovoModulo(r);
    if (!r.cena.aperta) { renderStato("Prenotazioni chiuse", "esaurito"); return blocca("Le prenotazioni per la cena sono chiuse."); }
    if (!r.cena.posti) { renderStato("Esaurito", "esaurito"); return blocca("I posti per la cena sono esauriti."); }
    persone(r.cena.maxPersone);
    renderStato("Disponibile", "ok");
  }

  // il modulo si compila subito; l'invio aspetta la risposta (serve il modulo firmato)
  var statoPronto = api("cena_stato").then(leggiStato, function () {
    renderStato("Non verificabile", "esaurito");
    errore("Connessione non riuscita. Ricarica la pagina tra poco.");
  });

  /* ---------- invio ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errore("");
    var primoErrato = null;
    ["nome", "cognome", "telefono"].forEach(function (c) {
      var i = form[c];
      i.value = i.value.trim();
      var ok = i.checkValidity() && i.value.length > 0;
      i.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok && !primoErrato) primoErrato = i;
    });
    if (primoErrato) { errore(primoErrato.name === "telefono" ? "Controlla il numero di telefono." : "Inserisci nome e cognome."); primoErrato.focus(); return; }
    if (form.website.value) return; // bot

    var btn = $("[type=submit]", form);
    var testo = btn.textContent;
    btn.textContent = "";
    btn.appendChild(el("span", "spinner"));
    btn.appendChild(el("span", null, "Un attimo…"));
    form.classList.add("is-loading");

    var dati = {
      nome: form.nome.value,
      cognome: form.cognome.value,
      telefono: form.telefono.value,
      persone: +form.persone.value,
      // niente caselle: cliccando il bottone si accetta l'informativa (testo sotto il bottone)
      privacy: true,
      website: form.website.value
    };

    // chi compila più in fretta del minimo aspetta in silenzio il tempo che manca
    statoPronto
      .then(function () {
        if (form.hidden || !modulo) throw new Error("modulo");
        var attesa = Math.max(0, SECONDI_MINIMI * 1000 - (Date.now() - moduloDa));
        return new Promise(function (ok) { setTimeout(ok, attesa); });
      })
      .then(function () { dati.modulo = modulo; return api("cena_prenota", dati); })
      .then(function (r) {
        if (!r || !r.ok) {
          errore((r && r.messaggio) || "Qualcosa è andato storto. Riprova tra poco.");
          // modulo scaduto o coperti cambiati nel frattempo: si ricarica lo stato (e il menu persone)
          if (r && (r.errore === "modulo" || r.errore === "posti")) {
            return api("cena_stato").then(function (s) {
              if (!s || !s.ok) return;
              leggiStato(s);
              if (r.errore === "modulo") errore("La sessione era scaduta: abbiamo ricaricato il modulo, premi di nuovo il bottone.");
            });
          }
          return;
        }
        fatto(dati);
      })
      .catch(function () { errore("Connessione non riuscita. Controlla la rete e riprova."); })
      .then(function () {
        form.classList.remove("is-loading");
        btn.textContent = testo;
      });
  });

  function fatto(dati) {
    form.hidden = true;
    lead.hidden = true;
    result.textContent = "";
    result.appendChild(el("p", "done__kicker", "Prenotazione ricevuta"));
    result.appendChild(el("p", "done__name", dati.nome + " " + dati.cognome));
    result.appendChild(el("p", "done__text", "Cena per " + (dati.persone === 1 ? "1 persona" : dati.persone + " persone") +
      ". Ti aspettiamo " + dataLunga + " alle " + CENA.ora + " al " + CENA.luogo.nome + ". Se serve ti chiamiamo al " + dati.telefono + "."));
    var cal = el("button", "btn btn--ghost btn--small", "Aggiungi al calendario");
    cal.type = "button";
    cal.addEventListener("click", scaricaIcs);
    result.appendChild(cal);
    result.hidden = false;
    result.focus({ preventScroll: true });
    cta.classList.add("is-hidden");
  }

  /* ---------- calendario (.ics) ---------- */
  function scaricaIcs() {
    var ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//bbbbolla.it//cena//IT", "BEGIN:VEVENT",
      "UID:" + CENA.id + "@bbbbolla.it",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""),
      "DTSTART;TZID=Europe/Rome:" + CENA.data.replace(/-/g, "") + "T" + CENA.ora.replace(":", "") + "00",
      "DURATION:PT" + CENA.durata + "H",
      "SUMMARY:" + CENA.titolo + " — Tavola Cunzata · " + C.rassegna.nome,
      "DESCRIPTION:" + CENA.sottotitolo + "\\n" + location.origin + location.pathname,
      "LOCATION:" + [CENA.luogo.nome, CENA.luogo.indirizzo].join(", ").replace(/,/g, "\\,"),
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
    var a = el("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "bolla-cena-" + CENA.data + ".ics";
    document.body.appendChild(a); a.click(); a.remove();
  }

  // il bottone fisso in basso (mobile) sparisce quando il modulo è a schermo
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (voci) {
      cta.classList.toggle("is-hidden", voci[0].isIntersecting || !form.offsetParent);
    }).observe($(".card"));
  }
})();
