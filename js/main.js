/* bolla® — logica della pagina (non serve modificarlo: i contenuti sono in config.js) */
(function () {
  "use strict";

  var C = window.BOLLA;
  var DEMO = !C.apiUrl;
  var MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  var GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

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
  setText("sottotitolo", C.rassegna.sottotitolo);
  setText("dataBreve", dataBreve);
  setText("dataLunga", dataLunga);
  setText("anno", new Date().getFullYear());
  document.title = C.rassegna.nome + " — " + dataBreve + " · Pass gratuiti";

  bind("quando", function (n) {
    n.textContent = dataLunga.charAt(0).toUpperCase() + dataLunga.slice(1);
    n.appendChild(document.createElement("br"));
    n.appendChild(serata.orario
      ? document.createTextNode(serata.orario.fine ? "Ore " + serata.orario.inizio + " – " + serata.orario.fine : "Dalle " + serata.orario.inizio)
      : pending("Orario in arrivo"));
  });

  bind("dove", function (n) {
    var l = serata.luogo || {};
    if (!l.nome) { n.appendChild(pending("Location in arrivo")); return; }
    var nome = l.mappa ? el("a", null, l.nome) : document.createTextNode(l.nome);
    if (l.mappa) { nome.href = l.mappa; nome.target = "_blank"; nome.rel = "noopener"; }
    n.appendChild(nome);
    if (l.indirizzo) { n.appendChild(document.createElement("br")); n.appendChild(document.createTextNode(l.indirizzo)); }
  });

  // prima il prezzo al botteghino, sotto l'ingresso gratuito con pass
  bind("ingresso", function (n) {
    if (!serata.senzaPass) return;
    n.textContent = serata.senzaPass;
    n.appendChild(document.createElement("br"));
    n.appendChild(el("strong", null, "Gratuito con pass"));
  });

  bind("presentazione", function (n) { if (C.rassegna.presentazione) n.textContent = C.rassegna.presentazione; });


  // nome dell'artista: link al profilo (Instagram) se c'è
  function nomeArtista(a, cls) {
    if (!a.link) return el("span", cls, a.nome);
    var l = el("a", (cls ? cls + " " : "") + "artista", a.nome);
    l.href = a.link; l.target = "_blank"; l.rel = "noopener";
    return l;
  }

  bind("lineupHero", function (n) {
    serata.lineup.forEach(function (a) {
      var li = el("li", a.minore ? "is-minore" : null);
      li.appendChild(nomeArtista(a));
      if (a.tag) li.appendChild(el("sup", "tag", a.tag));
      if (a.note) li.appendChild(el("span", "note", "[" + a.note + "]"));
      n.appendChild(li);
    });
  });

  // voci con "dettagli": si aprono e chiudono con un clic (details/summary, accessibile da tastiera)
  bind("lineup", function (n) {
    serata.lineup.forEach(function (a) {
      var li = el("li", [a.minore ? "is-minore" : "", a.dettagli ? "ha-dettagli" : ""].join(" ").trim() || null);
      var riga = li;
      if (a.dettagli) {
        var det = el("details");
        riga = el("summary");
        det.appendChild(riga);
        det.appendChild(dettagliArtista(a.dettagli));
        li.appendChild(det);
      }
      var name = el("span", "lineup__name");
      name.appendChild(nomeArtista(a));
      if (a.note) name.appendChild(el("span", "lineup__note", a.note));
      riga.appendChild(name);
      if (a.tag) riga.appendChild(el("span", "lineup__tag", a.tag));
      if (a.dettagli) riga.appendChild(el("span", "lineup__toggle"));
      n.appendChild(li);
    });
  });

  function dettagliArtista(d) {
    var box = el("div", "lineup__more");
    if (d.titolo) box.appendChild(el("p", "lineup__more-titolo", d.titolo));
    (d.testo || []).forEach(function (t) { box.appendChild(el("p", null, t)); });
    (d.persone || []).forEach(function (p) {
      var w = el("div", "lineup__persona");
      var h = el("p", "lineup__persona-nome", p.nome);
      if (p.ruolo) h.appendChild(el("span", null, " · " + p.ruolo));
      w.appendChild(h);
      if (p.testo) w.appendChild(el("p", null, p.testo));
      box.appendChild(w);
    });
    return box;
  }

  bind("info", function (n) { n.textContent = C.infoUtili; });

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
      titolo: "Pass di gruppo",
      lead: "Il pass gratuito è per gruppi da " + DIM + ". Registrati, poi manda il link del gruppo ai tuoi " + (DIM - 1) + " amici. Quando tutti e " + DIM + " hanno confermato la propria email, ognuno riceve il suo pass con QR. Se il gruppo non si completa, nessuno riceve il pass.",
      bottone: "Crea il gruppo",
      cta: "Crea il tuo gruppo"
    },
    unisciti: { titolo: "Entra nel gruppo", lead: "", bottone: "Entra nel gruppo", cta: "Entra nel gruppo" },
    invito: { titolo: "Pass su invito", lead: "", bottone: "Richiedi il pass", cta: "Richiedi il pass" },
    pass: { titolo: "Il tuo pass", lead: "", bottone: "", cta: "Il tuo pass" }
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
    titolo.textContent = "Lista d'attesa";
    lead.textContent = "I pass gratuiti sono esauriti. Lascia nome ed email: se si libera un posto ti scriviamo noi." +
      (serata.senzaPass ? " Senza pass: " + serata.senzaPass + "." : "");
    var cognome = form.cognome;
    cognome.required = false;
    cognome.closest(".field").hidden = true;
    cognome.closest(".field-row").classList.add("field-row--uno");
    $("[type=submit]", form).textContent = "Mettimi in lista d'attesa";
    cta.textContent = "Lista d'attesa";
  }

  function blocca(messaggio, conLinkNuovoGruppo) {
    form.hidden = true;
    var p = el("p", "notice", messaggio);
    lead.textContent = "";
    lead.appendChild(p);
    if (conLinkNuovoGruppo) {
      var a = el("a", "btn btn--ghost btn--block", "Crea un nuovo gruppo");
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
    head.appendChild(el("span", null, g.capogruppo ? "Gruppo di " + g.capogruppo : "Il gruppo"));
    head.appendChild(el("strong", null, g.confermati + "/" + g.dimensione + " confermati"));
    target.appendChild(head);
    var ol = el("ol", "group__slots");
    for (var i = 0; i < g.dimensione; i++) {
      var m = g.membri[i];
      var li = el("li", m ? (m.confermato ? "is-ok" : "is-wait") : "is-free");
      li.appendChild(el("span", "group__dot"));
      li.appendChild(el("span", "group__name", m ? m.nome + (m.tu ? " (tu)" : "") : "Posto libero"));
      li.appendChild(el("span", "group__state", m ? (m.confermato ? "confermato" : "deve confermare l'email") : ""));
      ol.appendChild(li);
    }
    target.appendChild(ol);
    if (g.stato === "aperto") {
      var sc = new Date(g.scadenza);
      target.appendChild(el("p", "group__note", "Il gruppo va completato entro " + GIORNI[sc.getDay()] + " " + sc.getDate() + " " + MESI[sc.getMonth()] + " alle " + ("0" + sc.getHours()).slice(-2) + ":" + ("0" + sc.getMinutes()).slice(-2) + "."));
    }
  }

  function shareBox(link) {
    var w = el("div", "share");
    var input = el("input", "share__link");
    input.readOnly = true; input.value = link; input.setAttribute("aria-label", "Link del gruppo");
    input.addEventListener("focus", function () { input.select(); });
    w.appendChild(input);
    var row = el("div", "share__row");
    var testo = "Ti aspetto a " + C.rassegna.nome + " il " + dataBreve + ": entra nel mio gruppo per il pass gratuito ";
    if (navigator.share) {
      var sh = el("button", "btn btn--small", "Condividi");
      sh.type = "button";
      sh.addEventListener("click", function () { navigator.share({ title: C.rassegna.nome, text: testo, url: link }).catch(function () {}); });
      row.appendChild(sh);
    }
    var wa = el("a", "btn btn--small", "WhatsApp");
    wa.href = "https://wa.me/?text=" + encodeURIComponent(testo + link);
    wa.target = "_blank"; wa.rel = "noopener";
    row.appendChild(wa);
    var cp = el("button", "btn btn--small btn--ghost", "Copia link");
    cp.type = "button";
    cp.addEventListener("click", function () {
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject())
        .then(function () { cp.textContent = "Copiato"; }, function () { input.focus(); document.execCommand("copy"); cp.textContent = "Copiato"; });
      setTimeout(function () { cp.textContent = "Copia link"; }, 2000);
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
    if (modo === "invito") lead.textContent = "Controllo il tuo invito…";
    if (modo === "unisciti") lead.textContent = "Carico il gruppo…";
    form.hidden = false;
    statoPronto = api("stato", { invito: idInvito, gruppo: idGruppo }).then(function (r) {
      if (!r || !r.ok) { renderStato("Non disponibile", "esaurito"); blocca((r && r.messaggio) || "Serata non disponibile."); return; }
      if (r.dimensioneGruppo) DIM = r.dimensioneGruppo;
      nuovoModulo(r);
      if (!r.serata.aperta) {
        renderStato(passata ? "Serata passata" : "Prenotazioni chiuse", "esaurito");
        return blocca(passata ? "Questa serata è passata." : "Le prenotazioni per questa serata sono chiuse.");
      }
      var esaurito = modo === "invito" ? !r.serata.postiSingolo : modo === "crea" && !r.serata.postiGruppo;
      renderStato(esaurito ? "Esaurito" : "Disponibile", esaurito ? "esaurito" : "ok");

      if (modo === "invito") {
        if (!r.invito.valido) return blocca(r.invito.messaggio + " Senza invito puoi creare un gruppo da " + DIM + ".", true);
        if (esaurito) return attivaAttesa();
        lead.textContent = "Hai un invito: il pass è personale e arriva via email con il QR.";
      } else if (modo === "unisciti") {
        var g = r.gruppo;
        if (!g.valido) return blocca(g.messaggio, true);
        statoGruppo = g;
        renderGruppo(g, groupBox);
        if (g.stato !== "aperto") return blocca(g.stato === "completo" ? "Questo gruppo è già completo." : "Questo gruppo è scaduto prima di essere completato.", true);
        if (g.membri.length >= g.dimensione) return blocca("Il gruppo è al completo. Se qualcuno non conferma entro poche ore il posto si libera.", true);
        lead.textContent = (g.capogruppo || "Un amico") + " ti ha invitato nel suo gruppo. Registrati con la tua email e conferma dal link che ti arriva: quando tutti e " + g.dimensione + " hanno confermato, ognuno riceve il suo pass con QR. Se il gruppo non si completa, nessuno lo riceve.";
      } else if (esaurito) {
        attivaAttesa();
      }
    }).catch(function () {
      renderStato("Non verificabile");
      blocca("Connessione non riuscita. Ricarica la pagina tra poco.");
    });
  }

  function caricaPass() {
    $(".status").hidden = true;
    lead.textContent = "Carico il tuo pass…";
    api("pass", { chiave: chiavePass }).then(function (r) {
      if (!r || !r.ok) return blocca((r && r.messaggio) || "Link non valido.", true);
      if (r.pass.serata !== serata.id) {
        location.replace(base + "?pass=" + encodeURIComponent(chiavePass) + "&serata=" + encodeURIComponent(r.pass.serata));
        return;
      }
      lead.textContent = "";
      var nodi = [];
      if (r.avviso) nodi.push(el("p", "notice", r.avviso));
      if (r.pass.attivo) {
        nodi = nodi.concat(ticket(r));
      } else {
        nodi.push(el("p", "done__kicker", "Ciao " + r.pass.nome));
        if (r.pass.stato === "confermato") nodi.push(el("p", "done__name", "Email confermata"));
        if (r.gruppo) {
          var gbox = el("div", "group");
          renderGruppo(r.gruppo, gbox);
          nodi.push(gbox);
          if (r.gruppo.stato === "aperto") {
            nodi.push(el("p", "done__text", "Il pass con QR si attiva solo quando tutti e " + r.gruppo.dimensione + " hanno confermato: ti arriva via email e lo trovi anche qui. Se il gruppo non si completa in tempo, nessuno riceve il pass. Manca qualcuno? Rimanda il link del gruppo:"));
            nodi.push(shareBox(linkGruppo(r.gruppo.id)));
          } else if (r.gruppo.stato !== "completo") {
            var a = el("a", "btn btn--ghost btn--block", "Crea un nuovo gruppo");
            a.href = base;
            nodi.push(a);
          }
        }
      }
      mostraRisultato(nodi);
    }).catch(function () { blocca("Connessione non riuscita. Ricarica la pagina tra poco."); });
  }

  function ticket(r) {
    var nodi = [];
    nodi.push(el("p", "done__kicker", r.pass.checkin ? "Sei già entrato" : "Ci vediamo dentro la bolla"));
    nodi.push(el("p", "done__name", r.pass.nome + " " + r.pass.cognome));
    var t = el("div", "ticket");
    var banner = el("img", "ticket__banner");
    banner.src = "assets/banner-sfera.jpg"; banner.alt = ""; banner.width = 851; banner.height = 315;
    t.appendChild(banner);
    t.appendChild(el("span", "ticket__label", "Codice pass"));
    t.appendChild(el("span", "ticket__code", r.pass.codice));
    t.appendChild(el("span", "ticket__meta", (r.pass.tipo === "invito" ? "Su invito" : "Pass di gruppo") + " · " + dataBreve));
    if (window.qrcode && r.qr) {
      var qr = qrcode(0, "M");
      qr.addData(r.qr);
      qr.make();
      var box = el("div", "ticket__qr");
      box.setAttribute("role", "img");
      box.setAttribute("aria-label", "QR code del pass");
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      t.appendChild(box);
    }
    nodi.push(t);
    nodi.push(el("p", "done__text", "Mostra questo QR all'ingresso. Vale una sola volta: non condividerlo."));
    var ics = el("button", "btn btn--ghost btn--block", "Aggiungi al calendario");
    ics.type = "button";
    ics.addEventListener("click", function () { scaricaIcs(r.pass.codice); });
    nodi.push(ics);
    return nodi;
  }

  /* ---------- invio ---------- */
  var errBox = $(".form__error");
  function errore(msg) { errBox.textContent = msg; errBox.hidden = !msg; }

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
    if (primoErrato) { errore(primoErrato.name === "email" ? "Controlla l'indirizzo email." : inAttesa ? "Inserisci il tuo nome." : "Inserisci nome e cognome."); primoErrato.focus(); return; }
    if (C.rassegna.richiediMaggiorenne && !form.maggiorenne.checked) { errore("L'evento è riservato ai maggiorenni."); return; }
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
          errore((r && r.messaggio) || "Qualcosa è andato storto. Riprova tra poco.");
          if (r && r.errore === "modulo") {
            return api("stato", {}).then(function (s) {
              if (s && s.ok) { nuovoModulo(s); errore("La sessione era scaduta: abbiamo ricaricato il modulo, premi di nuovo il bottone."); }
            });
          }
          return;
        }
        fatto(azione, dati, r);
      })
      .catch(function () { errore("Connessione non riuscita. Controlla la rete e riprova."); })
      .then(function () {
        form.classList.remove("is-loading");
        btn.textContent = testo;
      });
  });

  function fatto(azione, dati, r) {
    var nodi = [el("p", "done__kicker", "Ci siamo quasi"), el("p", "done__name", (dati.nome + " " + dati.cognome).trim())];
    if (azione === "lista_attesa") {
      nodi[0].textContent = "Sei in lista d'attesa";
      nodi.push(el("p", "done__text", "Se si libera un posto ti scriviamo a " + dati.email + ". Non serve fare altro."));
    } else if (azione === "crea_gruppo") {
      var ol = el("ol", "steps");
      ol.appendChild(el("li", null, "Apri l'email che ti abbiamo mandato a " + dati.email + " e conferma (controlla anche lo spam)."));
      ol.appendChild(el("li", null, "Manda questo link ai tuoi " + (DIM - 1) + " amici: ognuno si registra con la propria email."));
      ol.appendChild(el("li", null, "Quando tutti e " + DIM + " hanno confermato, ognuno riceve il suo pass con QR. Se il gruppo non si completa, nessuno riceve il pass."));
      nodi.push(ol);
      nodi.push(shareBox(linkGruppo(r.gruppo.id)));
    } else if (azione === "unisciti") {
      nodi.push(el("p", "done__text", "Ti abbiamo mandato una email a " + dati.email + ". Apri il link per confermare il tuo posto nel gruppo (controlla anche lo spam)."));
    } else {
      nodi[0].textContent = "Pass inviato";
      nodi.push(el("p", "done__text", "Il tuo pass con QR è in arrivo a " + dati.email + ". Controlla anche lo spam."));
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
