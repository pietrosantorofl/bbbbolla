/* bolla® — pagina workshop: prenotazione con nome, cognome e telefono (i contenuti sono in config.js, voce "workshop") */
(function () {
  "use strict";

  var C = window.BOLLA;
  var W = C.workshop;
  var DEMO = !C.apiUrl;
  var T = I18N.T, L = I18N.L, M = I18N.M;
  var serata = C.serate.filter(function (s) { return s.id === W.serata; })[0] || C.serate[0];

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function bind(nome, fn) { Array.prototype.forEach.call(document.querySelectorAll('[data-bind="' + nome + '"]'), fn); }

  /* ---------- contenuti ---------- */
  var p = serata.data.split("-");
  var giorno = new Date(+p[0], +p[1] - 1, +p[2]);
  var dataLunga = I18N.giorni[giorno.getDay()] + " " + giorno.getDate() + " " + I18N.mesi[giorno.getMonth()] + " " + giorno.getFullYear();

  bind("titolo", function (n) { n.textContent = L(W.titolo); });
  bind("sottotitolo", function (n) { n.textContent = L(W.sottotitolo); });
  bind("data", function (n) { n.textContent = dataLunga + " · " + T("Dalle {ora}", { ora: W.ora }).toLowerCase(); });
  bind("quando", function (n) {
    n.textContent = dataLunga;
    n.appendChild(document.createElement("br"));
    n.appendChild(document.createTextNode(T("Dalle {ora}", { ora: W.ora })));
  });
  bind("dove", function (n) {
    var l = serata.luogo;
    var nome = el("a", null, l.nome);
    nome.href = l.mappa; nome.target = "_blank"; nome.rel = "noopener";
    n.appendChild(nome);
    n.appendChild(document.createElement("br"));
    n.appendChild(document.createTextNode(l.indirizzo));
  });
  bind("conduttori", function (n) {
    W.conduttori.forEach(function (c, i) {
      if (i) n.appendChild(document.createElement("br"));
      n.appendChild(el("strong", null, c.nome));
      n.appendChild(document.createTextNode(" · " + L(c.ruolo)));
    });
  });
  bind("testo", function (n) { W.testo.forEach(function (t) { n.appendChild(el("p", null, L(t))); }); });
  bind("locandina", function (n) { n.src = W.locandina; n.alt = L(W.titolo) + " — " + L(W.sottotitolo); });
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
  function errore(msg) { errBox.textContent = M(msg); errBox.hidden = !msg; }

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

  // il modulo si compila subito; l'invio aspetta la risposta (serve il modulo firmato)
  var statoPronto = api("workshop_stato").then(function (r) {
    if (!r || !r.ok) { renderStato(T("Non disponibile"), "esaurito"); return blocca((r && r.messaggio) || T("Qualcosa è andato storto. Riprova tra poco.")); }
    nuovoModulo(r);
    if (!r.workshop.aperto) { renderStato(T("Prenotazioni chiuse"), "esaurito"); return blocca("Le prenotazioni per il workshop sono chiuse."); }
    if (!r.workshop.posti) { renderStato(T("Esaurito"), "esaurito"); return blocca("I posti per il workshop sono esauriti."); }
    renderStato(T("Disponibile"), "ok");
  }, function () {
    renderStato(T("Non verificabile"), "esaurito");
    errore(T("Connessione non riuscita. Ricarica la pagina tra poco."));
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
      .then(function () { dati.modulo = modulo; return api("workshop_prenota", dati); })
      .then(function (r) {
        if (!r || !r.ok) {
          errore((r && r.messaggio) || T("Qualcosa è andato storto. Riprova tra poco."));
          if (r && r.errore === "modulo") {
            return api("workshop_stato").then(function (s) {
              if (s && s.ok) { nuovoModulo(s); errore(T("La sessione era scaduta: abbiamo ricaricato il modulo, premi di nuovo il bottone.")); }
            });
          }
          return;
        }
        fatto(dati);
      })
      .catch(function () { errore(T("Connessione non riuscita. Controlla la rete e riprova.")); })
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
    result.appendChild(el("p", "done__text", T("Ti aspettiamo {data} alle {ora} al {luogo}. Se serve ti chiamiamo al {telefono}.",
      { data: dataLunga, ora: W.ora, luogo: serata.luogo.nome, telefono: dati.telefono })));
    result.appendChild(el("p", "done__text", T("Dopo il workshop la serata continua: prenota anche il pass gratuito.")));
    var pass = el("a", "btn btn--small", T("Prenota il pass"));
    pass.href = "./#prenota";
    result.appendChild(pass);
    result.hidden = false;
    result.focus({ preventScroll: true });
    cta.classList.add("is-hidden");
  }

  // il bottone fisso in basso (mobile) sparisce quando il modulo è a schermo
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (voci) {
      cta.classList.toggle("is-hidden", voci[0].isIntersecting || !form.offsetParent);
    }).observe($(".card"));
  }
})();
