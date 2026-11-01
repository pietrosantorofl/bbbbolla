/* bolla® — prenotazione a un evento (workshop, cena…): nome, cognome, telefono e, se l'evento lo prevede, persone.
   Pagina bbbbolla.it/prenota.html?e=<id>; contenuti in config.js, voce "eventi"; posti e chiusura nel foglio Eventi. */
(function () {
  "use strict";

  var C = window.BOLLA;
  var id = new URLSearchParams(location.search).get("e") || document.body.getAttribute("data-evento");
  var W = (C.eventi || []).filter(function (e) { return e.id === id; })[0];
  var DEMO = !C.apiUrl;
  var T = I18N.T, L = I18N.L, M = I18N.M;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function bind(nome, fn) { Array.prototype.forEach.call(document.querySelectorAll('[data-bind="' + nome + '"]'), fn); }

  if (!W) {
    bind("titolo", function (n) { n.textContent = T("Evento non trovato."); });
    $(".booking").hidden = true;
    $(".mobile-cta").hidden = true;
    return;
  }
  // data e luogo: quelli dell'evento, altrimenti quelli della serata di cui fa parte
  var serata = C.serate.filter(function (s) { return s.id === W.serata; })[0] || {};
  var data = W.data || serata.data;
  var luogo = W.luogo || serata.luogo;

  /* ---------- contenuti ---------- */
  var p = data.split("-");
  var giorno = new Date(+p[0], +p[1] - 1, +p[2]);
  var dataLunga = I18N.giorni[giorno.getDay()] + " " + giorno.getDate() + " " + I18N.mesi[giorno.getMonth()] + " " + giorno.getFullYear();

  document.title = L(W.titolo) + " — bolla®";
  bind("tipo", function (n) { n.textContent = L(W.etichetta || "Evento") + " · bolla®"; });
  bind("titolo", function (n) { n.textContent = L(W.titolo); });
  bind("sottotitolo", function (n) { n.textContent = L(W.sottotitolo || ""); });
  bind("data", function (n) { n.textContent = dataLunga + " · " + T("Dalle {ora}", { ora: W.ora }).toLowerCase(); });
  bind("quando", function (n) {
    n.textContent = dataLunga;
    n.appendChild(document.createElement("br"));
    n.appendChild(document.createTextNode(T("Dalle {ora}", { ora: W.ora })));
  });
  bind("dove", function (n) {
    var nome = el("a", null, luogo.nome);
    nome.href = luogo.mappa; nome.target = "_blank"; nome.rel = "noopener";
    n.appendChild(nome);
    n.appendChild(document.createElement("br"));
    n.appendChild(document.createTextNode(luogo.indirizzo));
  });
  bind("conduttori", function (n) {
    if (!W.conduttori || !W.conduttori.length) { n.parentNode.hidden = true; return; }
    W.conduttori.forEach(function (c, i) {
      if (i) n.appendChild(document.createElement("br"));
      n.appendChild(el("strong", null, c.nome));
      n.appendChild(document.createTextNode(" · " + L(c.ruolo)));
    });
  });
  bind("testo", function (n) { (W.testo || []).forEach(function (t) { n.appendChild(el("p", null, L(t))); }); });
  bind("locandina", function (n) {
    if (!W.locandina) { n.hidden = true; return; }
    n.src = L(W.locandina); n.alt = L(W.titolo) + (W.sottotitolo ? " — " + L(W.sottotitolo) : "");
  });
  bind("bottone", function (n) { n.textContent = L(W.bottone) || T("Prenota il tuo posto"); });
  bind("demo", function (n) { n.hidden = !DEMO; });

  /* ---------- API (Apps Script, o demo nel browser) ---------- */
  function api(action, dati) {
    var body = Object.assign({ action: action, evento: W.id }, dati || {});
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
  var campoPersone = $("[data-bind=persone]");
  // supporto: sotto gli errori del server o della rete, l'email a cui scrivere (link cliccabile)
  var SUPPORTO = "bollacatania@gmail.com";
  var errSupporto = el("p", "notice notice--supporto");
  (function () {
    var parti = T("Se il problema continua, scrivici a {email}.").split("{email}");
    var a = el("a", null, SUPPORTO);
    a.href = "mailto:" + SUPPORTO;
    errSupporto.appendChild(document.createTextNode(parti[0]));
    errSupporto.appendChild(a);
    errSupporto.appendChild(document.createTextNode(parti[1] || ""));
  })();
  errSupporto.hidden = true;
  errBox.parentNode.insertBefore(errSupporto, errBox.nextSibling);
  function errore(msg, conSupporto) { errBox.textContent = M(msg); errBox.hidden = !msg; errSupporto.hidden = !msg || !conSupporto; }

  // menu persone: 1..max (il massimo arriva dal backend, che conosce i posti rimasti); 0 = niente menu
  function persone(max) {
    campoPersone.hidden = !max;
    if (!max) return;
    var sel = form.persone, prima = sel.value || "1";
    sel.textContent = "";
    for (var i = 1; i <= max; i++) sel.appendChild(el("option", null, String(i))).value = String(i);
    sel.value = +prima <= max ? prima : "1";
  }

  function renderStato(testo, classe) {
    var box = $(".status");
    box.className = "status" + (classe ? " status--" + classe : "");
    $(".status__label", box).textContent = testo;
  }
  function blocca(msg) {
    form.hidden = true;
    lead.textContent = M(msg);
    cta.classList.add("is-hidden");
  }

  /* ---------- disponibilità + modulo firmato (anti-bot, con tempo minimo) ---------- */
  var modulo = null, moduloDa = 0;
  var SECONDI_MINIMI = 4.5;
  function nuovoModulo(r) { modulo = r.modulo; moduloDa = Date.now(); }

  function leggiStato(r) {
    if (!r || !r.ok) {
      renderStato(T("Non disponibile"), "esaurito");
      blocca((r && r.messaggio) || T("Qualcosa è andato storto. Riprova tra poco."));
      errSupporto.hidden = false;
      return lead.appendChild(errSupporto);
    }
    nuovoModulo(r);
    if (!r.evento.aperto) { renderStato(T("Prenotazioni chiuse"), "esaurito"); return blocca("Le prenotazioni per l'evento sono chiuse."); }
    if (!r.evento.posti) { renderStato(T("Esaurito"), "esaurito"); return blocca("I posti per l'evento sono esauriti."); }
    persone(r.evento.maxPersone);
    renderStato(T("Disponibile"), "ok");
  }

  // il modulo si compila subito; l'invio aspetta la risposta (serve il modulo firmato)
  var statoPronto = api("evento_stato").then(leggiStato, function () {
    renderStato(T("Non verificabile"), "esaurito");
    errore(T("Connessione non riuscita. Ricarica la pagina tra poco."), true);
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
    if (primoErrato) { errore(T(primoErrato.name === "telefono" ? "Controlla il numero di telefono." : "Inserisci nome e cognome.")); primoErrato.focus(); return; }
    if (form.website.value) return; // bot

    var btn = $("[type=submit]", form);
    var testo = btn.textContent;
    btn.textContent = "";
    btn.appendChild(el("span", "spinner"));
    btn.appendChild(el("span", null, T("Un attimo…")));
    form.classList.add("is-loading");

    var dati = {
      nome: form.nome.value,
      cognome: form.cognome.value,
      telefono: form.telefono.value,
      persone: campoPersone.hidden ? 1 : +form.persone.value,
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
      .then(function () { dati.modulo = modulo; return api("evento_prenota", dati); })
      .then(function (r) {
        if (!r || !r.ok) {
          errore((r && r.messaggio) || T("Qualcosa è andato storto. Riprova tra poco."), !r || ["esaurito", "chiusa", "modulo", "duplicato", "posti"].indexOf(r.errore) < 0);
          // modulo scaduto o posti cambiati nel frattempo: si ricarica lo stato (e il menu persone)
          if (r && (r.errore === "modulo" || r.errore === "posti")) {
            return api("evento_stato").then(function (s) {
              if (!s || !s.ok) return;
              leggiStato(s);
              if (r.errore === "modulo") errore(T("La sessione era scaduta: abbiamo ricaricato il modulo, premi di nuovo il bottone."));
            });
          }
          return;
        }
        fatto(dati);
      })
      .catch(function () { errore(T("Connessione non riuscita. Controlla la rete e riprova."), true); })
      .then(function () {
        form.classList.remove("is-loading");
        btn.textContent = testo;
      });
  });

  function fatto(dati) {
    form.hidden = true;
    lead.hidden = true;
    result.textContent = "";
    result.appendChild(el("p", "done__kicker", T("Prenotazione ricevuta")));
    result.appendChild(el("p", "done__name", dati.nome + " " + dati.cognome));
    result.appendChild(el("p", "done__text", (campoPersone.hidden ? "" : T(dati.persone === 1 ? "Per 1 persona." : "Per {n} persone.", { n: dati.persone }) + " ") +
      T("Ti aspettiamo {data} alle {ora} al {luogo}. Se serve ti chiamiamo al {telefono}.",
        { data: dataLunga, ora: W.ora, luogo: luogo.nome, telefono: dati.telefono })));
    var cal = el("button", "btn btn--ghost btn--small", T("Aggiungi al calendario"));
    cal.type = "button";
    cal.addEventListener("click", scaricaIcs);
    result.appendChild(cal);
    // l'evento fa parte di una serata bolla® ancora da venire: invito al pass gratuito
    if (serata.id && W.passDopo !== false) {
      result.appendChild(el("p", "done__text", T("Dopo l'evento la serata continua: prenota anche il pass gratuito.")));
      var pass = el("a", "btn btn--small", T("Prenota il pass"));
      pass.href = "./?serata=" + encodeURIComponent(serata.id) + "#prenota";
      result.appendChild(pass);
    }
    result.hidden = false;
    result.focus({ preventScroll: true });
    cta.classList.add("is-hidden");
  }

  /* ---------- calendario (.ics), durata W.durata ore ---------- */
  function scaricaIcs() {
    var ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//bbbbolla.it//evento//IT", "BEGIN:VEVENT",
      "UID:" + W.id + "@bbbbolla.it",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""),
      "DTSTART;TZID=Europe/Rome:" + data.replace(/-/g, "") + "T" + W.ora.replace(":", "") + "00",
      "DURATION:PT" + (W.durata || 2) + "H",
      "SUMMARY:" + L(W.titolo) + " · " + C.rassegna.nome,
      "DESCRIPTION:" + (W.sottotitolo ? L(W.sottotitolo) + "\\n" : "") + location.origin + location.pathname + "?e=" + encodeURIComponent(W.id),
      "LOCATION:" + [luogo.nome, luogo.indirizzo].join(", ").replace(/,/g, "\\,"),
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
    var a = el("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "bolla-" + W.id + ".ics";
    document.body.appendChild(a); a.click(); a.remove();
  }

  // il bottone fisso in basso (mobile) sparisce quando il modulo è a schermo
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (voci) {
      cta.classList.toggle("is-hidden", voci[0].isIntersecting || !form.offsetParent);
    }).observe($(".card"));
  }
})();
