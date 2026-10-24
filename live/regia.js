/* bolla® live — regia delle visuals (live/regia.html, aperta dal link segreto visuals).
   Cambia tipo, velocità, bassi, ingresso audio, posizione di QR e chat, nasconde gli invii:
   sullo schermo proiettato non compare nessun pannello. Le impostazioni vanno al server (e, se lo schermo
   è aperto nello stesso computer, anche subito via BroadcastChannel); lo schermo rimanda il suo stato. */
(function () {
  var L = window.BOLLA_LIVE;
  var $ = function (id) { return document.getElementById(id); };
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  var TIPI_BASE = ["Seta", "Liquido", "Lava", "Aurora", "Caleidoscopio", "Tunnel", "Mandala"];   // finché lo schermo non manda i suoi
  var FRESCO = 8000;   // ms: oltre, lo schermo risulta non collegato

  var accesso = L.accesso();
  if (!accesso) { $("senzaAccesso").hidden = false; return; }
  $("pannello").hidden = false;
  $("esci").hidden = L.demo;
  $("apriSchermo").href = "schermo.html" + (L.demo ? "?demo" : "#k=" + accesso);

  var regia = L.regiaIniziale();
  var schermo = null;        // { t: quando è arrivato (ora locale), stato }
  var voci = [];

  /* ---------- invio delle modifiche ---------- */
  var tInvio = 0;
  function cambia(fn) {
    fn(regia);
    regia.rev = Date.now();
    if (L.canale) L.canale.postMessage({ tipo: "regia", regia: regia });
    clearTimeout(tInvio);
    tInvio = setTimeout(function () { leggi(true); }, 250);
    disegna();
  }
  function comando(cosa) {
    cambia(function (r) {
      r.comandi = (r.comandi || []).concat({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 6), cosa: cosa }).slice(-10);
    });
  }

  /* ---------- lettura dal server (ogni 2 secondi) ---------- */
  function leggi(conModifiche) {
    return L.api("live_regia", conModifiche ? { accesso: accesso, regia: regia } : { accesso: accesso }).then(function (r) {
      if (!r.ok) {
        if (r.errore === "accesso") { L.dimentica(); $("pannello").hidden = true; $("senzaAccesso").hidden = false; $("senzaAccessoTesto").textContent = r.messaggio; return; }
        return;
      }
      if (r.regia && r.regia.rev > regia.rev) regia = Object.assign(L.regiaIniziale(), r.regia);
      // lo stato dallo schermo vale se è recente rispetto all'ora del server
      if (r.schermo && r.ora - r.schermo.t < FRESCO && (!schermo || Date.now() - schermo.t > 1500)) schermo = { t: Date.now() - (r.ora - r.schermo.t), stato: r.schermo.stato };
      voci = r.voci || [];
      disegna();
    }).catch(function () { /* rete assente: riprova al prossimo giro */ });
  }
  function giro() { leggi(false).then(function () { setTimeout(giro, 2000); }); }

  if (L.canale) L.canale.addEventListener("message", function (e) {
    var m = e.data || {};
    if (m.tipo === "schermo") { schermo = { t: Date.now(), stato: m.stato }; disegna(); }
    if (m.tipo === "regia" && m.regia && m.regia.rev > regia.rev) { regia = Object.assign(L.regiaIniziale(), m.regia); disegna(); }
  });

  /* ---------- controlli ---------- */
  function tipiNomi() { return (schermo && schermo.stato.tipi) || TIPI_BASE; }
  var tipiDisegnati = "";
  function disegnaTipi() {
    var nomi = tipiNomi();
    if (nomi.join() === tipiDisegnati) return;
    tipiDisegnati = nomi.join();
    $("tipi").textContent = "";
    nomi.forEach(function (nome, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "bottone"; b.textContent = nome; b.dataset.tipo = i;
      b.addEventListener("click", function () { cambia(function (r) { r.tipo = i; }); });
      $("tipi").appendChild(b);
    });
  }

  $("auto").addEventListener("change", function () { var v = this.checked; cambia(function (r) { r.auto = v; }); });
  $("velocita").addEventListener("input", function () { var v = +this.value; cambia(function (r) { r.velocita = v; }); });
  $("bassi").addEventListener("input", function () { var v = +this.value; cambia(function (r) { r.bassi = v; }); });
  $("mostraQr").addEventListener("change", function () { var v = this.checked; cambia(function (r) { r.qr.visibile = v; }); });
  $("mostraChat").addEventListener("change", function () { var v = this.checked; cambia(function (r) { r.chat.visibile = v; }); });
  $("ingresso").addEventListener("change", function () { var v = this.value; cambia(function (r) { r.audioId = v; }); });
  $("pulisci").addEventListener("click", function () { comando("pulisci"); });
  $("prova").addEventListener("click", function () { comando("prova"); });
  $("esci").addEventListener("click", function () { L.dimentica(); location.reload(); });

  /* ---------- mappa dello schermo: stesse proporzioni e margini dello schermo vero ---------- */
  function misureSchermo() {
    var s = schermo && schermo.stato;
    return { w: (s && s.larghezza) || 1920, h: (s && s.altezza) || 1080 };
  }
  // dimensioni dei blocchi in frazioni dello schermo (vedi gli stili di schermo.html)
  function geometria(chi) {
    var m = misureSchermo();
    var bw = chi === "qr" ? .174 * m.h / m.w : Math.min(.32 * m.w, 460) / m.w;
    var bh = chi === "qr" ? .174 : .4;
    return { bw: bw, bh: bh, mx: .024, my: .024 * m.w / m.h };
  }
  function posizionaBlocco(chi) {
    var el = $(chi === "qr" ? "bloccoQr" : "bloccoChat"), g = geometria(chi), pos = regia[chi];
    el.style.width = (g.bw * 100) + "%";
    el.style.height = (g.bh * 100) + "%";
    el.style.left = ((g.mx + clamp(pos.x, 0, 1) * (1 - g.bw - 2 * g.mx)) * 100) + "%";
    el.style.top = ((g.my + clamp(pos.y, 0, 1) * (1 - g.bh - 2 * g.my)) * 100) + "%";
    el.classList.toggle("spento", !pos.visibile);
  }
  function trascinabile(chi) {
    var el = $(chi === "qr" ? "bloccoQr" : "bloccoChat"), da = null;
    el.addEventListener("pointerdown", function (e) {
      var r = el.getBoundingClientRect();
      da = { x: e.clientX - r.left, y: e.clientY - r.top };
      el.classList.add("trascina"); el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", function (e) {
      if (!da) return;
      var mappa = $("mappa").getBoundingClientRect(), g = geometria(chi);
      var fx = (e.clientX - da.x - mappa.left) / mappa.width, fy = (e.clientY - da.y - mappa.top) / mappa.height;
      regia[chi].x = clamp((fx - g.mx) / (1 - g.bw - 2 * g.mx), 0, 1);
      regia[chi].y = clamp((fy - g.my) / (1 - g.bh - 2 * g.my), 0, 1);
      posizionaBlocco(chi);
    });
    el.addEventListener("pointerup", function () {
      if (!da) return;
      da = null; el.classList.remove("trascina");
      cambia(function () {});
    });
  }
  trascinabile("qr");
  trascinabile("chat");

  /* ---------- disegno ---------- */
  var MISURE = [["level", "volume"], ["mid", "medi"], ["high", "alti"], ["bass", "bassi"]];
  MISURE.forEach(function (m) {
    var d = document.createElement("div");
    d.className = "misura";
    d.innerHTML = "<b style=\"font-weight:400\">" + m[1] + "</b><span><i id=\"misura-" + m[0] + "\"></i></span>";
    $("misure").appendChild(d);
  });

  function formatta(n) { return "×" + (Math.round(n * 100) / 100); }
  function ora(t) { var d = new Date(t); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }

  var inviiDisegnati = "", ingressiDisegnati = "";
  function disegna() {
    var s = schermo && Date.now() - schermo.t < FRESCO ? schermo.stato : null;

    var st = $("stato");
    st.classList.toggle("ok", !!s);
    st.textContent = s ? "schermo collegato · " + s.fps + " fps · " + (s.audio && s.audio.vero ? "microfono" : "suono simulato") : "schermo non collegato";

    disegnaTipi();
    var attivo = s ? s.tipo : regia.tipo;   // con il giro automatico il tipo lo sceglie lo schermo
    Array.prototype.forEach.call($("tipi").children, function (b) { b.setAttribute("aria-pressed", String(+b.dataset.tipo === attivo)); });
    $("auto").checked = !!regia.auto;
    if (document.activeElement !== $("velocita")) $("velocita").value = regia.velocita;
    if (document.activeElement !== $("bassi")) $("bassi").value = regia.bassi;
    $("velocitaValore").textContent = formatta(regia.velocita);
    $("bassiValore").textContent = regia.bassi ? formatta(regia.bassi) : "ignorati";
    $("mostraQr").checked = !!regia.qr.visibile;
    $("mostraChat").checked = !!regia.chat.visibile;

    MISURE.forEach(function (m) { $("misura-" + m[0]).style.width = (s && s.audio ? clamp(s.audio[m[0]] || 0, 0, 1) * 100 : 0) + "%"; });

    var ingressi = (s && s.dispositivi) || [];
    var chiave = JSON.stringify(ingressi) + regia.audioId;
    if (chiave !== ingressiDisegnati) {
      ingressiDisegnati = chiave;
      var sel = $("ingresso");
      sel.length = 1;
      ingressi.forEach(function (d) { var o = document.createElement("option"); o.value = d.id; o.textContent = d.nome || "Ingresso audio"; sel.appendChild(o); });
      sel.value = regia.audioId || "";
    }

    var m = misureSchermo();
    $("mappa").style.aspectRatio = m.w + " / " + m.h;
    if (!document.querySelector(".blocco.trascina")) { posizionaBlocco("qr"); posizionaBlocco("chat"); }

    var nascoste = regia.nascoste || [];
    var chiaveInvii = voci.map(function (v) { return v.id; }).join() + "|" + nascoste.join();
    if (chiaveInvii !== inviiDisegnati) {
      inviiDisegnati = chiaveInvii;
      var lista = $("invii");
      lista.textContent = "";
      voci.slice().reverse().forEach(function (v) {
        var nascosto = nascoste.indexOf(v.id) >= 0;
        var li = document.createElement("li");
        li.className = nascosto ? "nascosto" : "";
        var punto = document.createElement("i"); punto.style.background = v.colore; li.appendChild(punto);
        var testo = document.createElement("span"); testo.className = "testo";
        var b = document.createElement("b"); b.textContent = v.nickname; testo.appendChild(b);
        testo.appendChild(document.createTextNode(" " + v.emozione));
        var t = document.createElement("small"); t.textContent = ora(v.t); testo.appendChild(t);
        li.appendChild(testo);
        var btn = document.createElement("button");
        btn.type = "button"; btn.className = "bottone bottone--piccolo";
        btn.textContent = nascosto ? "Mostra" : "Nascondi";
        btn.addEventListener("click", function () {
          cambia(function (r) {
            r.nascoste = nascosto ? r.nascoste.filter(function (id) { return id !== v.id; }) : r.nascoste.concat(v.id).slice(-200);
          });
        });
        li.appendChild(btn);
        lista.appendChild(li);
      });
      $("nessunInvio").hidden = voci.length > 0;
    }
  }

  disegna();
  giro();
  setInterval(disegna, 1000);   // lo stato "collegato" scade anche se non arriva niente
})();
