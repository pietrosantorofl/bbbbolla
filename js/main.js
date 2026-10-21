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
  setText("nome", C.rassegna.nome);
  setText("sottotitolo", C.rassegna.sottotitolo);
  setText("dataBreve", dataBreve);
  setText("dataLunga", dataLunga);
  setText("anno", new Date().getFullYear());
  document.title = C.rassegna.nome + " — " + dataBreve + " · Pass gratuiti";

  bind("quando", function (n) {
    n.textContent = dataLunga.charAt(0).toUpperCase() + dataLunga.slice(1);
    n.appendChild(document.createElement("br"));
    n.appendChild(serata.orario
      ? document.createTextNode("Ore " + serata.orario.inizio + (serata.orario.fine ? " – " + serata.orario.fine : ""))
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

  bind("intro", function (n) { C.rassegna.intro.forEach(function (p) { n.appendChild(el("p", null, p)); }); });

  bind("lineupHero", function (n) {
    serata.lineup.forEach(function (a) {
      var li = el("li");
      li.appendChild(document.createTextNode(a.nome));
      if (a.tag) li.appendChild(el("sup", "tag", a.tag));
      if (a.note) li.appendChild(el("span", "note", "[" + a.note + "]"));
      n.appendChild(li);
    });
  });

  bind("lineup", function (n) {
    serata.lineup.forEach(function (a) {
      var li = el("li");
      var name = el("span", "lineup__name", a.nome);
      if (a.note) name.appendChild(el("span", "lineup__note", a.note));
      li.appendChild(name);
      if (a.tag) li.appendChild(el("span", "lineup__tag", a.tag));
      n.appendChild(li);
    });
  });

  bind("info", function (n) {
    C.infoUtili.forEach(function (i) {
      var w = el("div");
      w.appendChild(el("dt", null, i.titolo));
      w.appendChild(el("dd", null, i.testo));
      n.appendChild(w);
    });
  });

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
  bind("newsletterObbligo", function (n) {
    if (C.rassegna.newsletterObbligatoria) { n.textContent = " (necessario per ricevere il pass gratuito)"; $("#form").newsletter.required = true; }
  });

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
      lead: "Il pass gratuito è per gruppi da " + DIM + ". Registrati, poi manda il link del gruppo ai tuoi " + (DIM - 1) + " amici. Quando tutti hanno confermato la propria email, ognuno riceve il suo pass con QR.",
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

  /* ---------- disponibilità ---------- */
  function renderMeter(s) {
    var label = $(".meter__label");
    var fill = $(".meter__fill");
    label.textContent = "";
    if (!s) { label.textContent = "Disponibilità non verificabile ora."; return; }
    var pct = s.capienza ? Math.round((1 - s.disponibili / s.capienza) * 100) : 0;
    requestAnimationFrame(function () { fill.style.width = Math.min(100, Math.max(3, pct)) + "%"; });
    if (!s.aperta) { label.textContent = passata ? "Questa serata è passata." : "Prenotazioni chiuse."; return; }
    if (s.disponibili <= 0) { label.appendChild(el("strong", null, "Pass esauriti.")); label.appendChild(document.createTextNode(" Seguici per le prossime serate.")); return; }
    label.appendChild(el("strong", null, s.disponibili + (s.disponibili === 1 ? " pass disponibile" : " pass disponibili")));
    if (s.disponibili <= Math.max(10, s.capienza * 0.1)) label.appendChild(document.createTextNode(" · ultimi posti"));
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

  function avvia() {
    if (modo === "pass") return caricaPass();
    api("stato", { invito: idInvito, gruppo: idGruppo }).then(function (r) {
      if (!r || !r.ok) { renderMeter(null); blocca((r && r.messaggio) || "Serata non disponibile."); return; }
      if (r.dimensioneGruppo) DIM = r.dimensioneGruppo;
      nuovoModulo(r);
      renderMeter(r.serata);
      if (!r.serata.aperta) return blocca(passata ? "Questa serata è passata." : "Le prenotazioni per questa serata sono chiuse.");

      if (modo === "invito") {
        if (!r.invito.valido) return blocca(r.invito.messaggio + " Senza invito puoi creare un gruppo da " + DIM + ".", true);
        if (r.serata.disponibili < 1) return blocca("Pass esauriti.");
        lead.textContent = "Invito «" + r.invito.etichetta + "». Il pass è personale e arriva via email con il QR.";
      } else if (modo === "unisciti") {
        var g = r.gruppo;
        if (!g.valido) return blocca(g.messaggio, true);
        statoGruppo = g;
        renderGruppo(g, groupBox);
        if (g.stato !== "aperto") return blocca(g.stato === "completo" ? "Questo gruppo è già completo." : "Questo gruppo è scaduto prima di essere completato.", true);
        if (g.membri.length >= g.dimensione) return blocca("Il gruppo è al completo. Se qualcuno non conferma entro poche ore il posto si libera.", true);
        lead.textContent = (g.capogruppo || "Un amico") + " ti ha invitato nel suo gruppo. Registrati con la tua email e conferma dal link che ti arriva: quando tutti e " + g.dimensione + " hanno confermato, ognuno riceve il suo pass con QR.";
      } else if (r.serata.disponibili < DIM) {
        return blocca("Non ci sono più posti per un nuovo gruppo da " + DIM + ".");
      }
      form.hidden = false;
    }).catch(function () {
      renderMeter(null);
      blocca("Connessione non riuscita. Ricarica la pagina tra poco.");
    });
  }

  function caricaPass() {
    $(".meter").hidden = true;
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
            nodi.push(el("p", "done__text", "Il pass con QR si attiva quando tutti hanno confermato: ti arriva via email e lo trovi anche qui. Manca qualcuno? Rimanda il link del gruppo:"));
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
    ["nome", "cognome", "email"].forEach(function (c) {
      var i = form[c];
      i.value = i.value.trim();
      var ok = i.checkValidity() && i.value.length > 0;
      i.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok && !primoErrato) primoErrato = i;
    });
    if (primoErrato) { errore(primoErrato.name === "email" ? "Controlla l'indirizzo email." : "Inserisci nome e cognome."); primoErrato.focus(); return; }
    if (C.rassegna.richiediMaggiorenne && !form.maggiorenne.checked) { errore("L'evento è riservato ai maggiorenni."); return; }
    if (!form.privacy.checked) { errore("Serve il consenso privacy per inviarti il pass."); return; }
    if (C.rassegna.newsletterObbligatoria && !form.newsletter.checked) { errore("Il pass gratuito è riservato agli iscritti alla newsletter di bolla®."); return; }
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
      privacy: true,
      newsletter: form.newsletter.checked,
      maggiorenne: C.rassegna.richiediMaggiorenne ? form.maggiorenne.checked : null,
      website: form.website.value
    };
    var azione = modo === "invito" ? "invito" : modo === "unisciti" ? "unisciti" : "crea_gruppo";
    if (modo === "invito") dati.invito = idInvito;
    if (modo === "unisciti") dati.gruppo = idGruppo;

    // chi compila più in fretta del minimo aspetta in silenzio il tempo che manca
    var attesa = Math.max(0, SECONDI_MINIMI * 1000 - (Date.now() - moduloDa));
    new Promise(function (ok) { setTimeout(ok, attesa); })
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
    var nodi = [el("p", "done__kicker", "Ci siamo quasi"), el("p", "done__name", dati.nome + " " + dati.cognome)];
    if (azione === "crea_gruppo") {
      var ol = el("ol", "steps");
      ol.appendChild(el("li", null, "Apri l'email che ti abbiamo mandato a " + dati.email + " e conferma (controlla anche lo spam)."));
      ol.appendChild(el("li", null, "Manda questo link ai tuoi " + (DIM - 1) + " amici: ognuno si registra con la propria email."));
      ol.appendChild(el("li", null, "Quando tutti hanno confermato, ognuno riceve il suo pass con QR."));
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
    if (serata.orario) {
      var fine = serata.orario.fine || serata.orario.inizio;
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

  /* ---------- UI: barra in alto e CTA mobile ---------- */
  var topbar = $(".topbar");
  addEventListener("scroll", function () { topbar.classList.toggle("is-scrolled", scrollY > 8); }, { passive: true });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { cta.classList.toggle("is-hidden", en.isIntersecting || !result.hidden || form.hidden); });
    }, { threshold: 0.15 }).observe($("#prenota"));
  }
})();
