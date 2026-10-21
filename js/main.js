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

  /* ---------- API (Apps Script) o demo locale ---------- */
  var DEMO_CAPIENZA = 120;
  function demoStore() { try { return JSON.parse(localStorage.getItem("bolla-demo") || "{}"); } catch (e) { return {}; } }
  function demoSave(s) { try { localStorage.setItem("bolla-demo", JSON.stringify(s)); } catch (e) { /* storage non disponibile */ } }
  function demoCodice() {
    var a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", c = "";
    for (var i = 0; i < 5; i++) c += a[Math.floor(Math.random() * a.length)];
    return "BOL-" + c;
  }

  function apiDisponibilita() {
    if (DEMO) {
      var st = demoStore()[serata.id] || [];
      var usati = st.reduce(function (t, p) { return t + p.posti; }, 0) + 37;
      return Promise.resolve({ ok: true, aperta: !passata, capienza: DEMO_CAPIENZA, disponibili: Math.max(0, DEMO_CAPIENZA - usati) });
    }
    return fetch(C.apiUrl + "?action=disponibilita&serata=" + encodeURIComponent(serata.id))
      .then(function (r) { return r.json(); });
  }

  function apiPrenota(dati) {
    if (DEMO) {
      return new Promise(function (res) {
        setTimeout(function () {
          var s = demoStore(); var lista = s[serata.id] || [];
          if (lista.some(function (p) { return p.email === dati.email; })) {
            return res({ ok: false, errore: "duplicato", messaggio: "Questa email ha già un pass per la serata. Controlla la tua casella di posta." });
          }
          var p = { email: dati.email, posti: dati.posti, codice: demoCodice() };
          lista.push(p); s[serata.id] = lista; demoSave(s);
          apiDisponibilita().then(function (disp) { res({ ok: true, codice: p.codice, posti: p.posti, disponibili: disp.disponibili }); });
        }, 900);
      });
    }
    // text/plain evita il preflight CORS, che Apps Script non gestisce
    return fetch(C.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action: "prenota", serata: serata.id }, dati))
    }).then(function (r) { return r.json(); });
  }

  /* ---------- disponibilità ---------- */
  var form = $("#form");
  var maxPosti = C.rassegna.maxPassPerPrenotazione;
  var disponibili = null;

  function renderMeter(r) {
    var label = $(".meter__label");
    var fill = $(".meter__fill");
    label.textContent = "";
    if (!r || !r.ok) { label.textContent = "Disponibilità non verificabile ora. Puoi comunque provare a prenotare."; return; }
    disponibili = r.disponibili;
    var pct = r.capienza ? Math.round((1 - r.disponibili / r.capienza) * 100) : 0;
    requestAnimationFrame(function () { fill.style.width = Math.min(100, Math.max(3, pct)) + "%"; });

    if (passata || !r.aperta) { label.textContent = passata ? "Questa serata è passata." : "Prenotazioni chiuse."; chiudi(); return; }
    if (r.disponibili <= 0) { label.innerHTML = "<strong>Pass esauriti.</strong> Seguici per le prossime serate."; chiudi(); return; }
    var s = el("strong", null, r.disponibili + (r.disponibili === 1 ? " pass disponibile" : " pass disponibili"));
    label.appendChild(s);
    if (r.disponibili <= Math.max(10, r.capienza * 0.1)) label.appendChild(document.createTextNode(" · ultimi posti"));
    setQty(+form.posti.value);
  }

  function chiudi() {
    $$("#form input, #form button").forEach(function (i) { i.disabled = true; });
    $("#form [type=submit]").textContent = passata ? "Serata passata" : "Pass esauriti";
    $(".mobile-cta").textContent = "Pass esauriti";
  }

  /* ---------- quantità ---------- */
  function limite() { return disponibili == null ? maxPosti : Math.max(1, Math.min(maxPosti, disponibili)); }
  function setQty(v) {
    v = Math.max(1, Math.min(limite(), v));
    form.posti.value = v;
    form.postiOut.value = v;
    $('[data-step="-1"]').disabled = v <= 1;
    $('[data-step="1"]').disabled = v >= limite();
  }
  $$(".qty__btn").forEach(function (b) {
    b.addEventListener("click", function () { setQty(+form.posti.value + +b.dataset.step); });
  });
  setQty(1);

  /* ---------- invio ---------- */
  var errBox = $(".form__error");
  function errore(msg) { errBox.textContent = msg; errBox.hidden = !msg; }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errore("");
    var campi = ["nome", "cognome", "email"];
    var primoErrato = null;
    campi.forEach(function (c) {
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
    btn.appendChild(el("span", null, "Prenoto…"));
    form.classList.add("is-loading");

    var dati = {
      nome: form.nome.value,
      cognome: form.cognome.value,
      email: form.email.value.toLowerCase(),
      posti: +form.posti.value,
      privacy: true,
      newsletter: form.newsletter.checked,
      maggiorenne: C.rassegna.richiediMaggiorenne ? form.maggiorenne.checked : null,
      website: form.website.value
    };

    apiPrenota(dati)
      .then(function (r) {
        if (!r || !r.ok) {
          errore((r && r.messaggio) || "Qualcosa è andato storto. Riprova tra poco.");
          if (r && r.errore === "esaurito") apiDisponibilita().then(renderMeter);
          return;
        }
        conferma(dati, r);
      })
      .catch(function () { errore("Connessione non riuscita. Controlla la rete e riprova."); })
      .then(function () {
        form.classList.remove("is-loading");
        btn.textContent = testo;
      });
  });

  function conferma(dati, r) {
    form.hidden = true;
    var done = $(".done");
    $(".done__name", done).textContent = dati.nome + " " + dati.cognome;
    $(".ticket__code", done).textContent = r.codice;
    $(".ticket__meta", done).textContent = r.posti + (r.posti === 1 ? " pass" : " pass") + " · " + dataBreve;
    if (DEMO) $(".done__text", done).textContent = "Modalità demo: nessuna email inviata. Collega Apps Script in config.js.";
    done.hidden = false;
    done.focus();
    $(".mobile-cta").classList.add("is-hidden");
    if (r.disponibili != null) renderMeter({ ok: true, aperta: true, capienza: lastCapienza, disponibili: r.disponibili });
  }

  var lastCapienza = 0;
  apiDisponibilita()
    .then(function (r) { lastCapienza = r && r.capienza; renderMeter(r); })
    .catch(function () { renderMeter(null); });

  /* ---------- calendario (.ics) ---------- */
  $('[data-action="ics"]').addEventListener("click", function () {
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
      "DESCRIPTION:Pass " + $(".ticket__code").textContent,
      luogo ? "LOCATION:" + luogo.replace(/,/g, "\\,") : null,
      "END:VEVENT", "END:VCALENDAR"
    ].filter(Boolean).join("\r\n");
    var a = el("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "bolla-" + serata.id + ".ics";
    document.body.appendChild(a); a.click(); a.remove();
  });

  /* ---------- UI: barra in alto e CTA mobile ---------- */
  var topbar = $(".topbar");
  addEventListener("scroll", function () { topbar.classList.toggle("is-scrolled", scrollY > 8); }, { passive: true });

  var cta = $(".mobile-cta");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { cta.classList.toggle("is-hidden", en.isIntersecting || !$(".done").hidden); });
    }, { threshold: 0.15 }).observe($("#prenota"));
  }
})();
