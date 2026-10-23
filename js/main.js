/* bolla® — logica della pagina (non serve modificarlo: i contenuti sono in config.js) */
(function () {
  "use strict";

  var C = window.BOLLA;
  var DEMO = !C.apiUrl;
  // lingua (js/i18n.js): T traduce i testi della pagina, L i valori di config.js, M i messaggi del backend
  var T = I18N.T, L = I18N.L, M = I18N.M;
  var MESI = I18N.mesi;
  var GIORNI = I18N.giorni;

  /* ---------- serata da mostrare ---------- */
  function parseData(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function oggi() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  var future = C.serate
    .filter(function (s) { return parseData(s.data) >= oggi(); })
    .sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  var richiesta = new URLSearchParams(location.search).get("serata");
  var serata = C.serate.filter(function (s) { return s.id === richiesta; })[0] || future[0] || C.serate[C.serate.length - 1];
  var passata = parseData(serata.data) < oggi();

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function bind(name, fn) { $$('[data-bind="' + name + '"]').forEach(fn); }
  function setText(name, text) { bind(name, function (n) { n.textContent = text; }); }
  function pending(text) { return el("span", "pending", text); }

  var d = parseData(serata.data);
  var dataBreve = ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear();
  var dataLunga = GIORNI[d.getDay()] + " " + d.getDate() + " " + MESI[d.getMonth()] + " " + d.getFullYear();

  /* ---------- contenuti ---------- */
  setText("sottotitolo", L(C.rassegna.sottotitolo));
  setText("dataBreve", dataBreve);
  setText("dataLunga", dataLunga);
  setText("anno", new Date().getFullYear());
  document.title = C.rassegna.nome + " — " + dataBreve + T(" · Pass gratuiti");

  bind("quando", function (n) {
    n.textContent = dataLunga.charAt(0).toUpperCase() + dataLunga.slice(1);
    n.appendChild(document.createElement("br"));
    n.appendChild(serata.orario
      ? document.createTextNode(serata.orario.fine ? T("Ore {inizio} – {fine}", serata.orario) : T("Dalle {ora}", { ora: serata.orario.inizio }))
      : pending(T("Orario in arrivo")));
  });

  bind("dove", function (n) {
    var l = serata.luogo || {};
    if (!l.nome) { n.appendChild(pending(T("Location in arrivo"))); return; }
    var nome = l.mappa ? el("a", null, l.nome) : document.createTextNode(l.nome);
    if (l.mappa) { nome.href = l.mappa; nome.target = "_blank"; nome.rel = "noopener"; }
    n.appendChild(nome);
    if (l.indirizzo) { n.appendChild(document.createElement("br")); n.appendChild(document.createTextNode(l.indirizzo)); }
  });

  // prima il prezzo al botteghino, sotto l'ingresso gratuito con pass
  bind("ingresso", function (n) {
    if (!serata.senzaPass) return;
    n.textContent = L(serata.senzaPass);
    n.appendChild(document.createElement("br"));
    n.appendChild(el("strong", null, T("Gratuito con pass")));
  });

  bind("presentazione", function (n) { if (C.rassegna.presentazione) n.textContent = L(C.rassegna.presentazione); });


  // nome dell'artista: link al profilo (Instagram) se c'è
  function nomeArtista(a, cls) {
    if (!a.link) return el("span", cls, a.nome);
    var l = el("a", (cls ? cls + " " : "") + "artista", a.nome);
    l.href = a.link; l.target = "_blank"; l.rel = "noopener";
    return l;
  }

  // locandina: a sinistra il programma in ordine di orario, a destra food & beverage.
  // Più voci consecutive con lo stesso orario lo mostrano solo sulla prima.
  bind("lineupHero", function (n) {
    var lista = $(".programma__lista", n), fb = $(".programma__fb ul", n), oraPrecedente = null;
    serata.lineup.forEach(function (a) {
      var li = el("li");
      if (!a.minore) li.appendChild(el("span", "programma__ora", a.ora && a.ora !== oraPrecedente ? a.ora : ""));
      var nome = el("span", "programma__nome");
      nome.appendChild(nomeArtista(a));
      if (a.tag) nome.appendChild(el("sup", "tag", L(a.tag)));
      if (a.note) nome.appendChild(el("span", "note", "[" + L(a.note) + "]"));
      li.appendChild(nome);
      if (a.minore) fb.appendChild(li);
      else { lista.appendChild(li); oraPrecedente = a.ora; }
    });
    if (!fb.children.length) $(".programma__fb", n).hidden = true;
  });

  // voci con "dettagli": si aprono e chiudono con un clic (details/summary, accessibile da tastiera)
  bind("lineup", function (n) {
    serata.lineup.forEach(function (a) {
      var li = el("li", [a.minore ? "is-minore" : "", a.dettagli ? "ha-dettagli" : ""].join(" ").trim() || null);
      li.setAttribute("data-ora", a.ora || "");
      var riga = li;
      if (a.dettagli) {
        var det = el("details");
        riga = el("summary");
        riga.setAttribute("data-ora", a.ora || "");
        det.appendChild(riga);
        det.appendChild(dettagliArtista(a.dettagli));
        li.appendChild(det);
      }
      var name = el("span", "lineup__name");
      name.appendChild(nomeArtista(a));
      if (a.note) name.appendChild(el("span", "lineup__note", L(a.note)));
      riga.appendChild(name);
      if (a.tag) riga.appendChild(el("span", "lineup__tag", L(a.tag)));
      if (a.dettagli) riga.appendChild(el("span", "lineup__toggle"));
      n.appendChild(li);
    });
  });

  function dettagliArtista(d) {
    var box = el("div", "lineup__more");
    if (d.titolo) box.appendChild(el("p", "lineup__more-titolo", L(d.titolo)));
    (d.testo || []).forEach(function (t) { box.appendChild(el("p", null, L(t))); });
    (d.persone || []).forEach(function (p) {
      var w = el("div", "lineup__persona");
      var h = el("p", "lineup__persona-nome", p.nome);
      if (p.ruolo) h.appendChild(el("span", null, " · " + L(p.ruolo)));
      w.appendChild(h);
      if (p.testo) w.appendChild(el("p", null, L(p.testo)));
      box.appendChild(w);
    });
    return box;
  }

  bind("info", function (n) { n.textContent = L(C.infoUtili); });

  bind("altreSerate", function (n) {
    var altre = future.filter(function (s) { return s.id !== serata.id; });
    if (!altre.length) return;
    var ul = $(".altre__list", n);
    altre.forEach(function (s) {
      var sd = parseData(s.data);
      var a = el("a");
      a.href = "?serata=" + encodeURIComponent(s.id);
      a.appendChild(el("span", null, sd.getDate() + " " + MESI[sd.getMonth()]));
      a.appendChild(el("span", null, s.lineup.map(function (x) { return x.nome; }).slice(0, 2).join(", ") + " →"));
      var li = el("li"); li.appendChild(a); ul.appendChild(li);
    });
    n.hidden = false;
  });

  bind("contatti", function (n) {
    if (C.contatti.instagram) { var ig = el("a", null, "Instagram"); ig.href = C.contatti.instagram; ig.target = "_blank"; ig.rel = "noopener"; n.appendChild(ig); }
    if (C.contatti.email) { var m = el("a", null, C.contatti.email); m.href = "mailto:" + C.contatti.email; n.appendChild(m); }
  });

  bind("maggiorenne", function (n) {
    if (C.rassegna.richiediMaggiorenne) { n.hidden = false; $("input", n).required = true; }
  });
  bind("demo", function (n) { n.hidden = !DEMO; });

  /* ---------- API (Apps Script, o demo nel browser) ---------- */
  function api(action, dati) {
    var body = Object.assign({ action: action, serata: serata.id }, dati || {});
    if (DEMO) return window.BOLLA_DEMO.call(body);
    // text/plain evita il preflight CORS, che Apps Script non gestisce
    return fetch(C.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  /* ---------- modalità della pagina ---------- */
  var params = new URLSearchParams(location.search);
  var chiavePass = params.get("pass");
  var idInvito = params.get("invito");
  var idGruppo = params.get("gruppo");
  var modo = chiavePass ? "pass" : idInvito ? "invito" : idGruppo ? "unisciti" : "crea";
  var DIM = C.rassegna.dimensioneGruppo;
  var base = location.origin + location.pathname;

  var form = $("#form");
  var card = $(".card");
  var lead = $(".card__lead");
  var groupBox = $(".group");
  var result = $(".result");
  var cta = $(".mobile-cta");
  var titolo = $("#booking-title");

  var TESTI = {
    crea: {
      titolo: T("Pass di gruppo"),
      lead: T("Il pass gratuito è per gruppi da {n}. Registrati, poi manda il link del gruppo ai tuoi {amici} amici. Quando tutti e {n} hanno confermato la propria email, ognuno riceve il suo pass con QR. Se il gruppo non si completa, nessuno riceve il pass.", { n: DIM, amici: DIM - 1 }),
      bottone: T("Crea il gruppo"),
      cta: T("Crea il tuo gruppo")
    },
    unisciti: { titolo: T("Entra nel gruppo"), lead: "", bottone: T("Entra nel gruppo"), cta: T("Entra nel gruppo") },
    invito: { titolo: T("Pass su invito"), lead: "", bottone: T("Richiedi il pass"), cta: T("Richiedi il pass") },
    pass: { titolo: T("Il tuo pass"), lead: "", bottone: "", cta: T("Il tuo pass") }
  };
  titolo.textContent = TESTI[modo].titolo;
  lead.textContent = TESTI[modo].lead;
  $("[type=submit]", form).textContent = TESTI[modo].bottone;
  cta.textContent = TESTI[modo].cta;

  function linkGruppo(id) { return base + "?gruppo=" + encodeURIComponent(id); }

  /* ---------- disponibilità: solo "Disponibile" / "Esaurito" ---------- */
  function renderStato(testo, classe) {
    var box = $(".status");
    box.className = "status" + (classe ? " status--" + classe : "");
    $(".status__label", box).textContent = testo;
  }

  // Posti finiti: il modulo resta, ma diventa iscrizione alla lista d'attesa (nome ed email).
  var inAttesa = false;
  function attivaAttesa() {
    inAttesa = true;
    titolo.textContent = T("Lista d'attesa");
    lead.textContent = T("I pass gratuiti sono esauriti. Lascia nome ed email: se si libera un posto ti scriviamo noi.") +
      (serata.senzaPass ? T(" Senza pass: {prezzo}.", { prezzo: L(serata.senzaPass) }) : "");
    var cognome = form.cognome;
    cognome.required = false;
    cognome.closest(".field").hidden = true;
    cognome.closest(".field-row").classList.add("field-row--uno");
    $("[type=submit]", form).textContent = T("Mettimi in lista d'attesa");
    cta.textContent = T("Lista d'attesa");
  }

  function blocca(messaggio, conLinkNuovoGruppo) {
    form.hidden = true;
    var p = el("p", "notice", M(messaggio));
    lead.textContent = "";
    lead.appendChild(p);
    if (conLinkNuovoGruppo) {
      var a = el("a", "btn btn--ghost btn--block", T("Crea un nuovo gruppo"));
      a.href = base;
      lead.appendChild(a);
    }
    cta.classList.add("is-hidden");
  }

  /* ---------- gruppo: avanzamento ---------- */
  function renderGruppo(g, target) {
    target.textContent = "";
    target.hidden = false;
    var head = el("div", "group__head");
    head.appendChild(el("span", null, g.capogruppo ? T("Gruppo di {nome}", { nome: g.capogruppo }) : T("Il gruppo")));
    head.appendChild(el("strong", null, T("{n}/{tot} confermati", { n: g.confermati, tot: g.dimensione })));
    target.appendChild(head);
    var ol = el("ol", "group__slots");
    for (var i = 0; i < g.dimensione; i++) {
      var m = g.membri[i];
      var li = el("li", m ? (m.confermato ? "is-ok" : "is-wait") : "is-free");
      li.appendChild(el("span", "group__dot"));
      li.appendChild(el("span", "group__name", m ? m.nome + (m.tu ? T(" (tu)") : "") : T("Posto libero")));
      li.appendChild(el("span", "group__state", m ? (m.confermato ? T("confermato") : T("deve confermare l'email")) : ""));
      ol.appendChild(li);
    }
    target.appendChild(ol);
    if (g.stato === "aperto") {
      var sc = new Date(g.scadenza);
      var quando = T("{giorno} {d} {mese} alle {ora}", { giorno: GIORNI[sc.getDay()], d: sc.getDate(), mese: MESI[sc.getMonth()], ora: ("0" + sc.getHours()).slice(-2) + ":" + ("0" + sc.getMinutes()).slice(-2) });
      target.appendChild(el("p", "group__note", T("Il gruppo va completato entro {quando}.", { quando: quando })));
    }
  }

  function shareBox(link) {
    var w = el("div", "share");
    var input = el("input", "share__link");
    input.readOnly = true; input.value = link; input.setAttribute("aria-label", T("Link del gruppo"));
    input.addEventListener("focus", function () { input.select(); });
    w.appendChild(input);
    var row = el("div", "share__row");
    var testo = T("Ti aspetto a {nome} il {data}: entra nel mio gruppo per il pass gratuito ", { nome: C.rassegna.nome, data: dataBreve });
    if (navigator.share) {
      var sh = el("button", "btn btn--small", T("Condividi"));
      sh.type = "button";
      sh.addEventListener("click", function () { navigator.share({ title: C.rassegna.nome, text: testo, url: link }).catch(function () {}); });
      row.appendChild(sh);
    }
    var wa = el("a", "btn btn--small", "WhatsApp");
    wa.href = "https://wa.me/?text=" + encodeURIComponent(testo + link);
    wa.target = "_blank"; wa.rel = "noopener";
    row.appendChild(wa);
    var cp = el("button", "btn btn--small btn--ghost", T("Copia link"));
    cp.type = "button";
    cp.addEventListener("click", function () {
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
        .then(function () { cp.textContent = T("Copiato"); }, function () { input.focus(); document.execCommand("copy"); cp.textContent = T("Copiato"); });
      setTimeout(function () { cp.textContent = T("Copia link"); }, 2000);
    });
    row.appendChild(cp);
    w.appendChild(row);
    return w;
  }

  function mostraRisultato(nodi) {
    form.hidden = true;
    groupBox.hidden = true;
    lead.textContent = "";
    result.textContent = "";
    nodi.forEach(function (n) { result.appendChild(n); });
    result.hidden = false;
    result.focus({ preventScroll: true });
    cta.classList.add("is-hidden");
  }

  /* ---------- caricamento iniziale ---------- */
  var statoGruppo = null;
  // modulo firmato dal server: serve per inviare e ha un tempo minimo (anti-bot)
  var modulo = null;
  var moduloDa = 0;
  var SECONDI_MINIMI = 4.5;
  function nuovoModulo(r) { modulo = r.modulo; moduloDa = Date.now(); }

  // Il backend può impiegare diversi secondi a rispondere: il modulo si mostra subito
  // e si compila nel frattempo; l'invio aspetta la risposta (serve il modulo firmato).
  var statoPronto = null;

  function avvia() {
    if (modo === "pass") return caricaPass();
    if (modo === "invito") lead.textContent = T("Controllo il tuo invito…");
    if (modo === "unisciti") lead.textContent = T("Carico il gruppo…");
    form.hidden = false;
    statoPronto = api("stato", { invito: idInvito, gruppo: idGruppo }).then(function (r) {
      if (!r || !r.ok) { renderStato(T("Non disponibile"), "esaurito"); blocca((r && r.messaggio) || T("Serata non disponibile.")); return; }
      if (r.dimensioneGruppo) DIM = r.dimensioneGruppo;
      nuovoModulo(r);
      if (!r.serata.aperta) {
        renderStato(passata ? T("Serata passata") : T("Prenotazioni chiuse"), "esaurito");
        return blocca(passata ? "Questa serata è passata." : "Le prenotazioni per questa serata sono chiuse.");
      }
      var esaurito = modo === "invito" ? !r.serata.postiSingolo : modo === "crea" && !r.serata.postiGruppo;
      renderStato(esaurito ? T("Esaurito") : T("Disponibile"), esaurito ? "esaurito" : "ok");

      if (modo === "invito") {
        if (!r.invito.valido) return blocca(M(r.invito.messaggio) + T(" Senza invito puoi creare un gruppo da {n}.", { n: DIM }), true);
        if (esaurito) return attivaAttesa();
        lead.textContent = T("Hai un invito: il pass è personale e arriva via email con il QR.");
      } else if (modo === "unisciti") {
        var g = r.gruppo;
        if (!g.valido) return blocca(g.messaggio, true);
        statoGruppo = g;
        renderGruppo(g, groupBox);
        if (g.stato !== "aperto") return blocca(g.stato === "completo" ? "Questo gruppo è già completo." : T("Questo gruppo è scaduto prima di essere completato."), true);
        if (g.membri.length >= g.dimensione) return blocca(T("Il gruppo è al completo. Se qualcuno non conferma entro poche ore il posto si libera."), true);
        lead.textContent = T("{chi} ti ha invitato nel suo gruppo. Registrati con la tua email e conferma dal link che ti arriva: quando tutti e {n} hanno confermato, ognuno riceve il suo pass con QR. Se il gruppo non si completa, nessuno lo riceve.", { chi: g.capogruppo || T("Un amico"), n: g.dimensione });
      } else if (esaurito) {
        attivaAttesa();
      }
    }).catch(function () {
      renderStato(T("Non verificabile"));
      blocca(T("Connessione non riuscita. Ricarica la pagina tra poco."));
    });
  }

  function caricaPass() {
    $(".status").hidden = true;
    lead.textContent = T("Carico il tuo pass…");
    api("pass", { chiave: chiavePass }).then(function (r) {
      if (!r || !r.ok) return blocca((r && r.messaggio) || "Link non valido.", true);
      if (r.pass.serata !== serata.id) {
        location.replace(base + "?pass=" + encodeURIComponent(chiavePass) + "&serata=" + encodeURIComponent(r.pass.serata));
        return;
      }
      lead.textContent = "";
      var nodi = [];
      if (r.avviso) nodi.push(el("p", "notice", M(r.avviso)));
      if (r.pass.attivo) {
        nodi = nodi.concat(ticket(r));
      } else {
        nodi.push(el("p", "done__kicker", T("Ciao {nome}", { nome: r.pass.nome })));
        if (r.pass.stato === "confermato") nodi.push(el("p", "done__name", T("Email confermata")));
        if (r.gruppo) {
          var gbox = el("div", "group");
          renderGruppo(r.gruppo, gbox);
          nodi.push(gbox);
          if (r.gruppo.stato === "aperto") {
            nodi.push(el("p", "done__text", T("Il pass con QR si attiva solo quando tutti e {n} hanno confermato: ti arriva via email e lo trovi anche qui. Se il gruppo non si completa in tempo, nessuno riceve il pass. Manca qualcuno? Rimanda il link del gruppo:", { n: r.gruppo.dimensione })));
            nodi.push(shareBox(linkGruppo(r.gruppo.id)));
          } else if (r.gruppo.stato !== "completo") {
            var a = el("a", "btn btn--ghost btn--block", T("Crea un nuovo gruppo"));
            a.href = base;
            nodi.push(a);
          }
        }
      }
      mostraRisultato(nodi);
    }).catch(function () { blocca(T("Connessione non riuscita. Ricarica la pagina tra poco.")); });
  }

  function ticket(r) {
    var nodi = [];
    nodi.push(el("p", "done__kicker", r.pass.checkin ? T("Sei già entrato") : T("Ci vediamo dentro la bolla")));
    nodi.push(el("p", "done__name", r.pass.nome + " " + r.pass.cognome));
    var t = el("div", "ticket");
    var banner = el("img", "ticket__banner");
    banner.src = "assets/banner-sfera.jpg"; banner.alt = ""; banner.width = 851; banner.height = 315;
    t.appendChild(banner);
    t.appendChild(el("span", "ticket__label", T("Codice pass")));
    t.appendChild(el("span", "ticket__code", r.pass.codice));
    t.appendChild(el("span", "ticket__meta", (r.pass.tipo === "invito" ? T("Su invito") : T("Pass di gruppo")) + " · " + dataBreve));
    if (window.qrcode && r.qr) {
      var qr = qrcode(0, "M");
      qr.addData(r.qr);
      qr.make();
      var box = el("div", "ticket__qr");
      box.setAttribute("role", "img");
      box.setAttribute("aria-label", T("QR code del pass"));
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      t.appendChild(box);
    }
    nodi.push(t);
    nodi.push(el("p", "done__text", T("Mostra questo QR all'ingresso. Vale una sola volta: non condividerlo.")));
    var ics = el("button", "btn btn--ghost btn--block", T("Aggiungi al calendario"));
    ics.type = "button";
    ics.addEventListener("click", function () { scaricaIcs(r.pass.codice); });
    nodi.push(ics);
    return nodi;
  }

  /* ---------- invio ---------- */
  var errBox = $(".form__error");
  function errore(msg) { errBox.textContent = M(msg); errBox.hidden = !msg; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errore("");
    var primoErrato = null;
    (inAttesa ? ["nome", "email"] : ["nome", "cognome", "email"]).forEach(function (c) {
      var i = form[c];
      i.value = i.value.trim();
      var ok = i.checkValidity() && i.value.length > 0;
      i.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok && !primoErrato) primoErrato = i;
    });
    if (primoErrato) { errore(T(primoErrato.name === "email" ? "Controlla l'indirizzo email." : inAttesa ? "Inserisci il tuo nome." : "Inserisci nome e cognome.")); primoErrato.focus(); return; }
    if (C.rassegna.richiediMaggiorenne && !form.maggiorenne.checked) { errore(T("L'evento è riservato ai maggiorenni.")); return; }
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
      email: form.email.value.toLowerCase(),
      // niente caselle: cliccando il bottone si accettano informativa e newsletter (testo sotto il bottone)
      privacy: true,
      newsletter: true,
      maggiorenne: C.rassegna.richiediMaggiorenne ? form.maggiorenne.checked : null,
      website: form.website.value
    };
    var azione = inAttesa ? "lista_attesa" : modo === "invito" ? "invito" : modo === "unisciti" ? "unisciti" : "crea_gruppo";
    if (modo === "invito") dati.invito = idInvito;
    if (modo === "unisciti") dati.gruppo = idGruppo;

    // aspetta la risposta di "stato"; chi compila più in fretta del minimo aspetta in silenzio il tempo che manca
    statoPronto
      .then(function () {
        if (form.hidden || !modulo) throw new Error("modulo");
        var attesa = Math.max(0, SECONDI_MINIMI * 1000 - (Date.now() - moduloDa));
        return new Promise(function (ok) { setTimeout(ok, attesa); });
      })
      .then(function () { dati.modulo = modulo; return api(azione, dati); })
      .then(function (r) {
        if (!r || !r.ok) {
          errore((r && r.messaggio) || T("Qualcosa è andato storto. Riprova tra poco."));
          if (r && r.errore === "modulo") {
            return api("stato", {}).then(function (s) {
              if (s && s.ok) { nuovoModulo(s); errore(T("La sessione era scaduta: abbiamo ricaricato il modulo, premi di nuovo il bottone.")); }
            });
          }
          return;
        }
        fatto(azione, dati, r);
      })
      .catch(function () { errore(T("Connessione non riuscita. Controlla la rete e riprova.")); })
      .then(function () {
        form.classList.remove("is-loading");
        btn.textContent = testo;
      });
  });

  function fatto(azione, dati, r) {
    var nodi = [el("p", "done__kicker", T("Ci siamo quasi")), el("p", "done__name", (dati.nome + " " + dati.cognome).trim())];
    if (azione === "lista_attesa") {
      nodi[0].textContent = T("Sei in lista d'attesa");
      nodi.push(el("p", "done__text", T("Se si libera un posto ti scriviamo a {email}. Non serve fare altro.", dati)));
    } else if (azione === "crea_gruppo") {
      var ol = el("ol", "steps");
      ol.appendChild(el("li", null, T("Apri l'email che ti abbiamo mandato a {email} e conferma (controlla anche lo spam).", dati)));
      ol.appendChild(el("li", null, T("Manda questo link ai tuoi {amici} amici: ognuno si registra con la propria email.", { amici: DIM - 1 })));
      ol.appendChild(el("li", null, T("Quando tutti e {n} hanno confermato, ognuno riceve il suo pass con QR. Se il gruppo non si completa, nessuno riceve il pass.", { n: DIM })));
      nodi.push(ol);
      nodi.push(shareBox(linkGruppo(r.gruppo.id)));
    } else if (azione === "unisciti") {
      nodi.push(el("p", "done__text", T("Ti abbiamo mandato una email a {email}. Apri il link per confermare il tuo posto nel gruppo (controlla anche lo spam).", dati)));
    } else {
      nodi[0].textContent = T("Pass inviato");
      nodi.push(el("p", "done__text", T("Il tuo pass con QR è in arrivo a {email}. Controlla anche lo spam.", dati)));
    }
    mostraRisultato(nodi);
  }

  /* ---------- calendario (.ics) ---------- */
  function scaricaIcs(codice) {
    var ymd = serata.data.replace(/-/g, "");
    var dt;
    if (serata.orario && !serata.orario.fine) {
      // orario di fine non dichiarato: evento di 5 ore nel calendario
      dt = "DTSTART;TZID=Europe/Rome:" + ymd + "T" + serata.orario.inizio.replace(":", "") + "00\r\nDURATION:PT5H";
    } else if (serata.orario) {
      var fine = serata.orario.fine;
      var giornoFine = fine < serata.orario.inizio ? new Date(d.getTime() + 864e5) : d;
      var ymdFine = giornoFine.getFullYear() + ("0" + (giornoFine.getMonth() + 1)).slice(-2) + ("0" + giornoFine.getDate()).slice(-2);
      dt = "DTSTART;TZID=Europe/Rome:" + ymd + "T" + serata.orario.inizio.replace(":", "") + "00\r\n" +
           "DTEND;TZID=Europe/Rome:" + ymdFine + "T" + fine.replace(":", "") + "00";
    } else {
      var dopo = new Date(d.getTime() + 864e5);
      dt = "DTSTART;VALUE=DATE:" + ymd + "\r\nDTEND;VALUE=DATE:" + dopo.getFullYear() + ("0" + (dopo.getMonth() + 1)).slice(-2) + ("0" + dopo.getDate()).slice(-2);
    }
    var luogo = serata.luogo && serata.luogo.nome ? [serata.luogo.nome, serata.luogo.indirizzo].filter(Boolean).join(", ") : "";
    var ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//bbbbolla.it//pass//IT", "BEGIN:VEVENT",
      "UID:" + serata.id + "@bbbbolla.it",
      "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""),
      dt,
      "SUMMARY:" + C.rassegna.nome + " — " + serata.lineup.map(function (a) { return a.nome; }).join(", "),
      "DESCRIPTION:Pass " + codice + " — " + location.href,
      luogo ? "LOCATION:" + luogo.replace(/,/g, "\\,") : null,
      "END:VEVENT", "END:VCALENDAR"
    ].filter(Boolean).join("\r\n");
    var a = el("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "bolla-" + serata.id + ".ics";
    document.body.appendChild(a); a.click(); a.remove();
  }

  avvia();

  /* ---------- pulsazione: bottone cliccato e poi la scheda, quando ci arriva lo scorrimento ---------- */
  function pulsa(n) { n.classList.remove("pulsa"); void n.offsetWidth; n.classList.add("pulsa"); }
  $$('a[href="#prenota"]').forEach(function (a) {
    a.addEventListener("click", function () {
      pulsa(a);
      setTimeout(function () { pulsa(card); }, 500);
    });
  });

  /* ---------- UI: barra in alto e CTA mobile ---------- */
  var topbar = $(".topbar");
  addEventListener("scroll", function () { topbar.classList.toggle("is-scrolled", scrollY > 8); }, { passive: true });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { cta.classList.toggle("is-hidden", en.isIntersecting || !result.hidden || form.hidden); });
    }, { threshold: 0.15 }).observe($("#prenota"));
  }
})();
