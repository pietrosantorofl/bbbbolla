/* bolla® — app staff per l'ingresso (staff.html).
   Scarica la lista dei pass attivi (con l'hash della chiave), legge i QR con la fotocamera,
   risponde subito dal telefono e manda il check-in al backend, che resta l'unica fonte di verità. */
(function () {
  "use strict";

  var C = window.BOLLA;
  var DEMO = !C.apiUrl;
  var CHIAVE_ACCESSO = "bolla-staff-accesso";
  var CHIAVE_CODA = "bolla-staff-coda";
  var CHIAVE_DISPOSITIVO = "bolla-staff-dispositivo";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function ruolo(n) { return $('[data-ruolo="' + n + '"]'); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage non disponibile */ } }
  function ora(iso) { var d = new Date(iso); return isNaN(d) ? "" : ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  /* ---------- serata: la prossima in programma, o ?serata=<id> ---------- */
  function parseData(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  var richiesta = new URLSearchParams(location.search).get("serata");
  var future = C.serate.filter(function (s) { return parseData(s.data) >= oggi; }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  var serata = C.serate.filter(function (s) { return s.id === richiesta; })[0] || future[0] || C.serate[C.serate.length - 1];

  function api(action, dati) {
    var body = Object.assign({ action: action, serata: serata.id, accesso: accesso, dispositivo: dispositivo }, dati || {});
    if (DEMO) return window.BOLLA_DEMO.call(body);
    return fetch(C.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  function sha256(testo) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(testo)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }

  /* ---------- stato ---------- */
  // il segreto arriva dal link (#k=...): si salva sul telefono e sparisce dalla barra degli indirizzi
  var dalLink = (location.hash.match(/[#&]k=([A-Za-z0-9]+)/) || [])[1];
  if (dalLink) {
    scrivi(CHIAVE_ACCESSO, dalLink);
    history.replaceState(null, "", location.pathname + location.search);
  }
  scrivi("bolla-staff-pin", null);   // vecchio accesso con PIN, non più usato
  var accesso = leggi(CHIAVE_ACCESSO) || (DEMO ? "demostaff" : null);
  // identifica questo telefono nei check-in: serve a capire se qualcuno è entrato da un'altra porta
  var dispositivo = leggi(CHIAVE_DISPOSITIVO);
  if (!dispositivo) { dispositivo = "tel-" + crypto.getRandomValues(new Uint32Array(1))[0].toString(36); scrivi(CHIAVE_DISPOSITIVO, dispositivo); }
  var lista = [];          // pass attivi della serata
  var perHash = {};        // hash chiave -> pass
  var capienza = null;
  var coda = [];           // check-in da mandare al backend
  try { coda = JSON.parse(leggi(CHIAVE_CODA) || "[]"); } catch (e) { coda = []; }

  /* ---------- accesso ---------- */
  var login = $("#login");
  var app = $("#app");
  ruolo("serata").textContent = serata.data.split("-").reverse().join(".") + (DEMO ? " · DEMO" : "");

  function erroreAccesso(msg) {
    var err = $(".errore", login);
    err.textContent = msg;
    err.hidden = false;
  }

  $('[data-azione="esci"]').addEventListener("click", function () {
    if (coda.length && !confirm("Ci sono " + coda.length + " ingressi non ancora inviati. Uscire comunque?")) return;
    scrivi(CHIAVE_ACCESSO, null);
    location.reload();
  });

  function mostraApp() {
    login.hidden = true;
    app.hidden = false;
    $('[data-azione="esci"]').hidden = false;
    aggiornaContatori();
    setInterval(function () { caricaLista().catch(function () {}); }, 60000);
    setInterval(svuotaCoda, 10000);
    svuotaCoda();
  }

  /* ---------- lista dei pass ---------- */
  function caricaLista() {
    return api("staff_lista").then(function (r) {
      if (!r.ok) {
        // link sostituito dal foglio mentre l'app era aperta: si torna all'accesso
        if (r.errore === "accesso" && login.hidden) { scrivi(CHIAVE_ACCESSO, null); location.reload(); }
        return r;
      }
      // gli ingressi fatti da questo telefono e non ancora confermati restano segnati
      var locali = {};
      lista.forEach(function (p) { if (p.dentro) locali[p.h] = p.dentro; });
      lista = r.pass;
      perHash = {};
      lista.forEach(function (p) {
        if (!p.dentro && locali[p.h]) p.dentro = locali[p.h];
        perHash[p.h] = p;
      });
      capienza = r.serata.capienza;
      aggiornaContatori();
      return r;
    });
  }

  function aggiornaContatori() {
    ruolo("entrati").textContent = lista.filter(function (p) { return p.dentro; }).length;
    ruolo("attesi").textContent = lista.length;
    ruolo("capienza").textContent = capienza != null ? capienza : "–";
    var c = ruolo("coda");
    c.hidden = !coda.length;
    c.textContent = coda.length + (coda.length === 1 ? " ingresso" : " ingressi") + " da inviare: verranno mandati appena c'è rete.";
  }

  function gruppoDi(p) {
    if (!p.gruppo) return null;
    return lista.filter(function (m) { return m.gruppo === p.gruppo; });
  }

  /* ---------- esito a schermo intero ---------- */
  var esito = $(".esito");
  var timerEsito = null;

  function mostraEsito(tipo, titolo, p, info, gruppo) {
    clearTimeout(timerEsito);
    esito.className = "esito esito--" + tipo;
    esito.textContent = "";
    esito.appendChild(el("p", "esito__titolo", titolo));
    if (p) esito.appendChild(el("p", "esito__nome", p.nome + " " + p.cognome));
    if (info) esito.appendChild(el("p", "esito__info", info));
    if (gruppo && gruppo.length) {
      var ul = el("ul", "esito__gruppo");
      ul.appendChild(el("li", null, "Gruppo: " + gruppo.filter(function (m) { return m.dentro; }).length + "/" + gruppo.length + " dentro"));
      gruppo.forEach(function (m) { ul.appendChild(el("li", null, (m.dentro ? "✓ " : "○ ") + m.nome + (m.cognome ? " " + m.cognome : ""))); });
      esito.appendChild(ul);
    }
    var chiudi = el("button", "btn btn--light esito__chiudi", "Avanti");
    chiudi.type = "button";
    chiudi.addEventListener("click", nascondiEsito);
    esito.appendChild(chiudi);
    esito.hidden = false;
    segnale(tipo);
    if (tipo === "ok") timerEsito = setTimeout(nascondiEsito, 2500);
  }

  function nascondiEsito() { clearTimeout(timerEsito); esito.hidden = true; }

  var audio;
  function segnale(tipo) {
    try {
      if (navigator.vibrate) navigator.vibrate(tipo === "ok" ? 80 : [200, 100, 200]);
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = tipo === "ok" ? 880 : 220;
      g.gain.value = .15;
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + (tipo === "ok" ? .12 : .45));
    } catch (e) { /* audio non disponibile */ }
  }

  /* ---------- verifica di un pass ---------- */
  var ultimo = { testo: "", quando: 0 };

  function scansionato(testo) {
    var t = String(testo || "").trim().toLowerCase();
    if (t === ultimo.testo && Date.now() - ultimo.quando < 4000) return; // stesso QR ancora inquadrato
    ultimo = { testo: t, quando: Date.now() };
    var m = t.match(/[a-f0-9]{24}/);
    if (!m) return mostraEsito("no", "QR non valido", null, "Non è un pass bolla®.");
    var chiave = m[0];
    sha256(chiave).then(function (h) {
      var p = perHash[h];
      if (p) return verificaLocale(p, { chiave: chiave });
      // non in lista: forse la lista è vecchia, chiedo al backend
      verificaOnline({ chiave: chiave });
    });
  }

  function verificaLocale(p, rif) {
    if (p.dentro) {
      return mostraEsito("no", "Già entrato", p, "Alle " + ora(p.dentro) + ". Il pass vale una sola volta.", gruppoDi(p));
    }
    p.dentro = new Date().toISOString();
    coda.push(Object.assign({ quando: p.dentro, h: p.h }, rif));
    scrivi(CHIAVE_CODA, JSON.stringify(coda));
    aggiornaContatori();
    mostraEsito("ok", "Entra", p, p.tipo === "invito" ? "Pass su invito" : "Pass di gruppo", gruppoDi(p));
    svuotaCoda();
  }

  var MESSAGGI = {
    sconosciuto: ["no", "Pass inesistente", "Questo QR non corrisponde a nessun pass."],
    altra_serata: ["no", "Altra serata", "Il pass è valido per un'altra data."],
    annullato: ["no", "Pass annullato", "Il pass è stato annullato."],
    non_attivo: ["no", "Pass non attivo", "Il gruppo non è stato completato: il pass non vale."]
  };

  function verificaOnline(rif) {
    mostraEsito("wait", "Verifico…", null, "Un attimo, controllo sul server.");
    api("staff_checkin", rif).then(function (r) {
      if (!r.ok) return mostraEsito("warn", "Errore", null, r.messaggio);
      var p = r.pass;
      if (r.esito === "entrato" || r.esito === "gia_entrato") {
        caricaLista().catch(function () {});
        var gruppo = r.gruppo && r.gruppo.map(function (m) { return { nome: m.nome, cognome: "", dentro: m.dentro }; });
        return r.esito === "entrato"
          ? mostraEsito("ok", "Entra", p, p.tipo === "invito" ? "Pass su invito" : "Pass di gruppo", gruppo)
          : mostraEsito("no", "Già entrato", p, "Alle " + ora(r.quando) + ". Il pass vale una sola volta.", gruppo);
      }
      var msg = MESSAGGI[r.esito] || ["no", "Non valido", ""];
      mostraEsito(msg[0], msg[1], p, msg[2]);
    }).catch(function () {
      mostraEsito("warn", "Senza rete", null, "Non riesco a verificare questo pass: non è nella lista scaricata. Riprova tra poco.");
    });
  }

  /* ---------- invio degli ingressi al backend ---------- */
  var invio = false;
  function svuotaCoda() {
    if (invio || !coda.length || !accesso) return;
    invio = true;
    var voce = coda[0];
    api("staff_checkin", voce.chiave ? { chiave: voce.chiave } : { codice: voce.codice }).then(function (r) {
      invio = false;
      if (!r.ok) { aggiornaContatori(); return; }
      coda.shift();
      scrivi(CHIAVE_CODA, JSON.stringify(coda));
      // il backend dice che era già entrato prima di questo telefono: avviso lo staff
      if (r.esito === "gia_entrato" && r.da !== dispositivo) {
        mostraEsito("warn", "Attenzione", r.pass, "Risultava già entrato alle " + ora(r.quando) + " da un altro telefono.");
      } else if (r.esito !== "entrato" && r.esito !== "gia_entrato") {
        var msg = MESSAGGI[r.esito] || ["no", "Non valido", ""];
        mostraEsito("warn", "Attenzione: " + msg[1], r.pass, msg[2]);
      }
      aggiornaContatori();
      svuotaCoda();
    }).catch(function () { invio = false; aggiornaContatori(); });
  }

  /* ---------- fotocamera e lettura QR ---------- */
  var video = $(".camera video");
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d", { willReadFrequently: true });

  $('[data-azione="camera"]').addEventListener("click", function () {
    var btn = this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      btn.parentNode.replaceChild(el("p", null, "Questo browser non può usare la fotocamera. Usa la ricerca qui sotto."), btn);
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }).then(function (stream) {
      video.srcObject = stream;
      video.play();
      $(".camera__start").hidden = true;
      $(".camera__frame").hidden = false;
      $(".camera__hint").hidden = false;
      requestAnimationFrame(leggiFotogramma);
    }).catch(function () {
      btn.parentNode.replaceChild(el("p", null, "Permesso fotocamera negato. Consentilo nelle impostazioni del browser e ricarica la pagina."), btn);
    });
  });

  var ultimaLettura = 0;
  function leggiFotogramma(t) {
    requestAnimationFrame(leggiFotogramma);
    if (!esito.hidden || t - ultimaLettura < 120 || video.readyState < 2) return;
    ultimaLettura = t;
    var w = 480, h = Math.round(video.videoHeight / video.videoWidth * w) || w;
    canvas.width = w; canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    var codice = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
    if (codice && codice.data) scansionato(codice.data);
  }

  /* ---------- ricerca a mano (telefono scarico, QR rovinato) ---------- */
  var cerca = ruolo("cerca");
  var risultati = ruolo("risultati");

  cerca.addEventListener("input", function () {
    var q = cerca.value.trim().toLowerCase();
    risultati.textContent = "";
    if (q.length < 2) return;
    lista.filter(function (p) {
      return (p.nome + " " + p.cognome).toLowerCase().indexOf(q) >= 0 || (p.cognome + " " + p.nome).toLowerCase().indexOf(q) >= 0 || p.codice.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 8).forEach(function (p) {
      var b = el("button");
      b.type = "button";
      var testo = el("span", null, p.nome + " " + p.cognome + " ");
      testo.appendChild(el("small", null, p.codice));
      b.appendChild(testo);
      if (p.dentro) b.appendChild(el("span", "tag-dentro", "dentro " + ora(p.dentro)));
      b.addEventListener("click", function () {
        if (p.dentro || confirm("Hai controllato un documento di " + p.nome + " " + p.cognome + "? Confermi l'ingresso?")) {
          verificaLocale(p, { codice: p.codice });
        }
      });
      var li = el("li"); li.appendChild(b); risultati.appendChild(li);
    });
    if (!risultati.children.length) risultati.appendChild(el("li", null, "Nessun pass attivo trovato."));
  });
  $('[data-azione="pulisci"]').addEventListener("click", function () { cerca.value = ""; risultati.textContent = ""; });

  // demo: simula una scansione dalla console (BOLLA_STAFF_TEST("<chiave>"))
  if (DEMO) window.BOLLA_STAFF_TEST = scansionato;

  /* ---------- avvio ---------- */
  if (accesso) {
    caricaLista().then(function (r) {
      if (r.ok) mostraApp();
      else { scrivi(CHIAVE_ACCESSO, null); accesso = null; erroreAccesso(r.messaggio); }
    }).catch(function () {
      // senza rete ma già entrati in precedenza: lavoro con la coda
      mostraApp();
    });
  }
})();
