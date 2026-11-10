/* bolla® — pagine nascoste delle cene (bbbbolla.it/6nov-tavolacunzata/, 13nov-cucinaromantica/…):
   prenotazione con nome, cognome, telefono e persone. Testi della pagina nell'HTML; data, ora e luogo nella voce
   di config.js → attivita con l'id scritto in <body data-attivita="…"> (lo stesso della colonna "id" del foglio Attività). */
(function () {
  "use strict";

  var C = window.BOLLA;
  var ID = document.body.getAttribute("data-attivita") || "tavolacunzata-2026-11-06";
  var voce = (C.attivita || []).filter(function (a) { return a.id === ID; })[0] || {};
  var serataVoce = (C.serate || []).filter(function (s) { return s.id === voce.serata; })[0] || {};
  var CENA = {
    id: ID,
    data: voce.data || serataVoce.data,
    ora: voce.ora || null,              // null = "Orario in arrivo"
    durata: voce.durata || 3,           // ore, per il calendario
    titolo: voce.titolo || "Cena",
    sottotitolo: voce.sottotitolo || "",
    serie: voce.etichetta || "",        // nel titolo dell'evento in calendario
    luogo: voce.luogo || serataVoce.luogo
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

  bind("data", function (n) { n.textContent = maiuscola(dataLunga) + (CENA.ora ? " · dalle " + CENA.ora : " · orario in arrivo"); });
  bind("quando", function (n) {
    n.textContent = maiuscola(dataLunga);
    n.appendChild(document.createElement("br"));
    n.appendChild(document.createTextNode(CENA.ora ? "Dalle " + CENA.ora : "Orario in arrivo"));
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
    var body = Object.assign({ action: action, evento: CENA.id }, dati || {});
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

  // persone: numero libero da 1 a max (il massimo arriva dal backend: 20, o meno se restano meno coperti)
  var maxPersone = 20;
  function persone(max) {
    maxPersone = max;
    form.persone.max = String(max);
  }
  persone(Number(form.persone.max) || 20);   // fino alla risposta del backend: il massimo scritto nella pagina
  function personeValide() {
    var n = Number(form.persone.value);
    return n >= 1 && n <= maxPersone && Math.floor(n) === n;
  }

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
    form.persone.setAttribute("aria-invalid", personeValide() ? "false" : "true");
    if (!personeValide()) { errore("Scrivi per quante persone prenoti: da 1 a " + maxPersone + "."); form.persone.focus(); return; }
    // orario di prenotazione: solo nelle pagine che hanno il campo (es. 13nov-cucinaromantica)
    if (form.orario) {
      form.orario.setAttribute("aria-invalid", form.orario.value ? "false" : "true");
      if (!form.orario.value) { errore("Scegli l'orario della prenotazione."); form.orario.focus(); return; }
    }
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
      orario: form.orario ? form.orario.value : "",
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
      ". Ti aspettiamo " + dataLunga + (dati.orario ? " alle " + dati.orario : CENA.ora ? " alle " + CENA.ora : "") + " al " + CENA.luogo.nome + "." +
      (dati.orario || CENA.ora ? "" : " L'orario lo pubblichiamo a breve.") + " Se serve ti chiamiamo al " + dati.telefono + "."));
    var cal = el("button", "btn btn--ghost btn--small", "Aggiungi al calendario");
    cal.type = "button";
    cal.addEventListener("click", function () { scaricaIcs(dati.orario); });
    result.appendChild(cal);
    result.hidden = false;
    result.focus({ preventScroll: true });
    cta.classList.add("is-hidden");
  }

  /* ---------- calendario (.ics) ---------- */
  // orario: quello scelto nella prenotazione, altrimenti l'ora della cena
  function scaricaIcs(orario) {
    var ora = orario || CENA.ora;
    var ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//bbbbolla.it//cena//IT", "BEGIN:VEVENT",
      "UID:" + CENA.id + "@bbbbolla.it",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""),
      // senza orario: evento di tutto il giorno
      ora ? "DTSTART;TZID=Europe/Rome:" + CENA.data.replace(/-/g, "") + "T" + ora.replace(":", "") + "00" : "DTSTART;VALUE=DATE:" + CENA.data.replace(/-/g, ""),
      ora ? "DURATION:PT" + (orario ? 2 : CENA.durata) + "H" : "DURATION:P1D",
      "SUMMARY:" + CENA.titolo + (CENA.serie ? " — " + CENA.serie : "") + " · " + C.rassegna.nome,
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
