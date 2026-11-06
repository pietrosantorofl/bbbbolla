/* bolla® — dashboard (dashboard.html), aperta dal link segreto dashboard (#k=...).
   Solo numeri: il backend (azione "dashboard") non manda nomi, email o telefoni.
   Si aggiorna da sola ogni minuto mentre la pagina è visibile. ?demo = dati finti. */
(function () {
  "use strict";

  var C = window.BOLLA;
  var DEMO = !C.apiUrl;
  var CHIAVE_ACCESSO = "bolla-dashboard-accesso";
  var CHIAVE_SERATA = "bolla-dashboard-serata";
  var OGNI = 60000;

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
  function pad(n) { return ("0" + n).slice(-2); }
  function ora(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  var GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  var MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  function giorno(ymd) { var p = ymd.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dataLunga(ymd) { var d = giorno(ymd); return ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"][d.getDay()] + " " + d.getDate() + " " + MESI[d.getMonth()] + " " + d.getFullYear(); }
  function dataCorta(ymd) { var d = giorno(ymd); return pad(d.getDate()) + "." + pad(d.getMonth() + 1); }
  function perc(a, b) { return b ? Math.round(a / b * 100) : 0; }

  /* ---------- accesso: il segreto arriva dal link (#k=...), si salva e sparisce dalla barra ---------- */
  var dalLink = (location.hash.match(/[#&]k=([A-Za-z0-9]+)/) || [])[1];
  if (dalLink) {
    scrivi(CHIAVE_ACCESSO, dalLink);
    history.replaceState(null, "", location.pathname + location.search);
  }
  var accesso = leggi(CHIAVE_ACCESSO) || (DEMO ? "demo" : null);
  var serataScelta = new URLSearchParams(location.search).get("serata") || leggi(CHIAVE_SERATA) || "";
  var ultimo = null, inCorso = false, timer = null;

  function api(dati) {
    var body = Object.assign({ action: "dashboard", accesso: accesso }, dati);
    if (DEMO) return new Promise(function (ok) { setTimeout(function () { ok(datiDemo(body.serata)); }, 300); });
    return fetch(C.apiUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  function cancello(msg) {
    ruolo("main").hidden = true;
    ruolo("ctrl").hidden = true;
    ruolo("gate").hidden = false;
    if (msg) ruolo("gate-msg").textContent = msg + " Il link si crea nel foglio «bolla® — pass», menu bolla® → Crea link segreto dashboard.";
  }

  function carica(fresco) {
    if (inCorso || !accesso) return;
    inCorso = true;
    var agg = ruolo("agg");
    agg.classList.remove("err");
    agg.textContent = "Aggiorno…";
    api({ serata: serataScelta, fresco: !!fresco }).then(function (r) {
      inCorso = false;
      if (!r || !r.ok) {
        if (r && r.errore === "accesso") { scrivi(CHIAVE_ACCESSO, null); accesso = null; cancello(r.messaggio); return; }
        throw new Error(r && r.messaggio || "risposta non valida");
      }
      ultimo = r;
      disegna(r);
      agg.textContent = "Aggiornato alle " + ora(new Date(r.aggiornato));
    }).catch(function (e) {
      inCorso = false;
      agg.classList.add("err");
      agg.textContent = "Non riesco ad aggiornare" + (ultimo ? " (dati delle " + ora(new Date(ultimo.aggiornato)) + ")" : "") + ". Riprovo tra un minuto.";
      console.error(e);
    });
  }

  function avvia() {
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) carica(); }, OGNI);
  }

  /* ---------- disegno ---------- */
  function riga(box, etichetta, valore, colore) {
    var r = el("div", "row");
    var s = el("span");
    if (colore) { var k = el("i", "key"); k.style.background = "var(" + colore + ")"; s.appendChild(k); }
    s.appendChild(document.createTextNode(etichetta));
    r.appendChild(s);
    r.appendChild(el("strong", null, valore));
    box.appendChild(r);
  }

  function metro(box, parti) {
    box.textContent = "";
    parti.forEach(function (p) {
      if (!(p.v > 0)) return;
      var i = el("i", p.cls || "");
      i.style.width = Math.min(100, p.v) + "%";
      box.appendChild(i);
    });
  }

  function setV(k, v) { $('[data-v="' + k + '"]').textContent = v; }

  function disegna(d) {
    ruolo("gate").hidden = true;
    ruolo("main").hidden = false;
    ruolo("ctrl").hidden = false;

    // serate nel menu
    var sel = ruolo("serata");
    sel.textContent = "";
    d.serate.forEach(function (s) {
      var o = el("option", null, dataCorta(s.data) + " · " + s.titolo);
      o.value = s.id;
      if (s.id === d.serata.id) o.selected = true;
      sel.appendChild(o);
    });

    var s = d.serata, p = d.pass, g = d.gruppi;
    document.title = "bolla® — Dashboard " + dataCorta(s.data);
    ruolo("titolo").textContent = s.titolo;
    ruolo("data").textContent = dataLunga(s.data);
    var st = ruolo("stato");
    st.className = "badge " + (s.oggi ? "badge--live" : "badge--off");
    st.textContent = s.oggi ? "Stasera" : s.passata ? "Conclusa" : "In arrivo";

    // tile principali
    setV("validi", p.validi);
    metro(ruolo("cap-meter"), [{ v: perc(p.gruppo, s.capienza), cls: "s2" }, { v: perc(p.invito + p.esterni, s.capienza), cls: "s1" }]);
    ruolo("cap").textContent = s.capienza ? "su " + s.capienza + " posti · " + perc(p.validi, s.capienza) + "% · ne restano " + Math.max(0, s.capienza - p.validi) : "capienza non impostata";
    setV("entrati", p.entrati);
    metro(ruolo("entr-meter"), [{ v: perc(p.entrati, p.validi) }]);
    ruolo("entr").textContent = p.validi ? perc(p.entrati, p.validi) + "% dei pass validi" : "nessun pass";
    setV("gruppi", g.completi);
    ruolo("gruppi-sub").textContent = g.aperti + (g.aperti === 1 ? " aperto" : " aperti") + " · " + g.scaduti + (g.scaduti === 1 ? " scaduto" : " scaduti");
    setV("attesa", d.attesa);

    // eventi
    var ev = ruolo("eventi");
    ev.textContent = "";
    ruolo("eventi-box").hidden = !d.eventi.length;
    d.eventi.forEach(function (e) {
      var c = el("div", "card ev");
      c.appendChild(el("h3", null, e.titolo));
      c.appendChild(el("div", "ev__meta", (e.inizio ? "ore " + e.inizio + " · " : "") + (e.aperto ? "prenotazioni aperte" : "prenotazioni chiuse") +
        (e.ultima ? " · ultima " + e.ultima : "")));
      var n = el("div", "ev__nums");
      var a = el("span");
      a.appendChild(el("b", "num", String(e.persone)));
      a.appendChild(document.createTextNode(e.posti ? " su " + e.posti + " posti" : (e.persone === 1 ? " persona" : " persone")));
      n.appendChild(a);
      if (e.prenotazioni !== e.persone) n.appendChild(el("span", "ev__meta", e.prenotazioni + (e.prenotazioni === 1 ? " prenotazione" : " prenotazioni")));
      if (e.posti) n.appendChild(el("span", "ev__meta", (e.posti - e.persone > 0 ? "liberi " + (e.posti - e.persone) : "esaurito")));
      c.appendChild(n);
      if (e.posti) { var m = el("div", "meter"); metro(m, [{ v: perc(e.persone, e.posti), cls: e.tipo === "cena" ? "s2" : "s1" }]); c.appendChild(m); }
      ev.appendChild(c);
    });

    // dettaglio pass
    var bp = ruolo("pass");
    bp.textContent = "";
    riga(bp, "Di gruppo (gruppi completi)", p.gruppo, "--s2");
    riga(bp, "Su invito", p.invito, "--s1");
    if (p.esterni) riga(bp, "QR di un'altra biglietteria", p.esterni, "--s1");
    riga(bp, "Confermati, gruppo non ancora completo", p.inAttesaDelGruppo);
    riga(bp, "Email da confermare", p.daConfermare);
    riga(bp, "Annullati", p.annullati);
    riga(bp, "Pass validi con newsletter", p.newsletter);

    // gruppi
    var bg = ruolo("gruppi");
    bg.textContent = "";
    riga(bg, "Completi", g.completi);
    riga(bg, "Aperti", g.aperti);
    riga(bg, "Scaduti", g.scaduti);
    var ga = ruolo("gruppi-aperti");
    ga.textContent = "";
    if (g.inCorso.length) {
      ga.appendChild(el("div", "ev__meta", "Gruppi aperti: pallino verde = confermato, grigio = iscritto da confermare, vuoto = posto libero"));
      var box = el("div", "gruppi");
      g.inCorso.forEach(function (x) {
        var item = el("span", "gr");
        item.title = x.confermati + " confermati, " + (x.membri - x.confermati) + " da confermare, " + Math.max(0, g.dimensione - x.membri) + " liberi";
        for (var i = 0; i < g.dimensione; i++) item.appendChild(el("i", i < x.confermati ? "c" : i < x.membri ? "m" : ""));
        box.appendChild(item);
      });
      ga.appendChild(box);
    }

    // grafici
    barre(ruolo("andamento"), d.andamento.map(function (x) {
      var dd = giorno(x.giorno);
      return { etichetta: GIORNI[dd.getDay()] + " " + dd.getDate(), titolo: dataLunga(x.giorno), valori: [x.gruppo, x.invito] };
    }), [{ nome: "Di gruppo", col: "--s2" }, { nome: "Su invito", col: "--s1" }], "Nessun pass ancora.");
    ruolo("ingressi-box").hidden = !d.ingressi.length;
    barre(ruolo("ingressi"), d.ingressi.map(function (x) { return { etichetta: x.ora, titolo: "dalle " + x.ora, valori: [x.n] }; }),
      [{ nome: "Ingressi", col: "--s1" }], "");

    // inviti
    var bi = ruolo("inviti");
    bi.textContent = "";
    if (!d.inviti.length) bi.appendChild(el("div", "vuoto", "Nessun pass da link invito."));
    d.inviti.forEach(function (x) { riga(bi, x.nome, x.pass); });

    // contatti
    var bc = ruolo("contatti");
    bc.textContent = "";
    riga(bc, "Persone in rubrica (tutte le serate)", d.contatti.totale);
    riga(bc, "Iscritte alla newsletter", d.contatti.newsletter + " · " + perc(d.contatti.newsletter, d.contatti.totale) + "%");
    riga(bc, "Arrivate per la prima volta con questa serata", d.contatti.nuovi);

    // storico
    var stor = d.storico.filter(function (x) { return x.validi || x.prenotati || x.id === s.id; });
    barre(ruolo("storico-chart"), stor.map(function (x) {
      return { etichetta: dataCorta(x.data), titolo: dataCorta(x.data) + " · " + x.titolo, valori: [x.entrati, Math.max(0, x.validi - x.entrati)], sel: x.id === s.id,
        extra: "Pass validi: " + x.validi };
    }), [{ nome: "Entrati", col: "--s1" }, { nome: "Pass validi non entrati", col: "--s2" }], "");
    var t = ruolo("storico");
    t.textContent = "";
    var h = el("tr");
    ["Serata", "Pass validi", "Entrati", "Gruppi completi", "Prenotati agli eventi", "Contatti nuovi"].forEach(function (x) { h.appendChild(el("th", null, x)); });
    t.appendChild(h);
    d.storico.slice().reverse().forEach(function (x) {
      var tr = el("tr", x.id === s.id ? "sel" : "");
      [dataCorta(x.data) + " · " + x.titolo, x.validi, x.entrati + (x.validi ? " (" + perc(x.entrati, x.validi) + "%)" : ""), x.gruppi, x.prenotati, x.nuoviContatti]
        .forEach(function (v) { tr.appendChild(el("td", null, String(v))); });
      t.appendChild(tr);
    });
  }

  /* barre impilate in SVG: una colonna per voce, serie dal basso in alto, tooltip al passaggio */
  var NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function scalaTonda(max) {
    if (max <= 5) return { top: 5, passo: 1 };
    var passo = Math.pow(10, Math.floor(Math.log10(max)));
    [1, 2, 5, 10].some(function (m) { if (max / (passo * m) <= 5) { passo *= m; return true; } return false; });
    return { top: Math.ceil(max / passo) * passo, passo: passo };
  }

  function barre(box, voci, serie, vuoto) {
    box.textContent = "";
    if (!voci.length) { if (vuoto) box.appendChild(el("div", "vuoto", vuoto)); return; }
    var W = Math.max(320, box.clientWidth || 600), H = 220, L = 34, R = 8, T = 18, B = 26;
    var tot = voci.map(function (v) { return v.valori.reduce(function (a, b) { return a + b; }, 0); });
    var sc = scalaTonda(Math.max.apply(null, tot.concat([1])));
    var y = function (v) { return T + (H - T - B) * (1 - v / sc.top); };
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": serie.map(function (s) { return s.nome; }).join(", ") });
    for (var g = 0; g <= sc.top; g += sc.passo) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: y(g), y2: y(g), "class": "grid-l" }));
      var tx = svgEl("text", { x: L - 6, y: y(g) + 4, "text-anchor": "end" }); tx.textContent = g; svg.appendChild(tx);
    }
    var slot = (W - L - R) / voci.length;
    var bw = Math.max(4, Math.min(42, slot * .62));
    var ogni = Math.ceil(voci.length / Math.max(1, Math.floor((W - L - R) / 46)));   // etichette che non si sovrappongono
    var tip = el("div", "tip"); tip.hidden = true;
    voci.forEach(function (v, i) {
      var cx = L + slot * (i + .5), base = 0;
      var gr = svgEl("g", {});
      v.valori.forEach(function (val, j) {
        if (!(val > 0)) return;
        var y0 = y(base), y1 = y(base + val);
        var hgt = Math.max(1, y0 - y1 - (base > 0 ? 2 : 0));   // 2px di stacco tra i segmenti
        var r = svgEl("rect", { x: cx - bw / 2, y: y1, width: bw, height: hgt, rx: Math.min(4, bw / 4), fill: "var(" + serie[j].col + ")" });
        if (v.sel === false) r.setAttribute("opacity", ".55");
        gr.appendChild(r);
        base += val;
      });
      if (tot[i] && (voci.length <= 14 || i % ogni === 0)) {
        var vt = svgEl("text", { x: cx, y: y(tot[i]) - 5, "text-anchor": "middle" }); vt.textContent = tot[i]; gr.appendChild(vt);
      }
      if (i % ogni === 0) {
        var lt = svgEl("text", { x: cx, y: H - 8, "text-anchor": "middle" }); lt.textContent = v.etichetta; gr.appendChild(lt);
      }
      // area di passaggio più grande della barra
      var hit = svgEl("rect", { x: cx - slot / 2, y: T, width: slot, height: H - T - B, fill: "transparent" });
      hit.addEventListener("pointerenter", function () {
        tip.textContent = "";
        tip.appendChild(el("div", null, v.titolo));
        serie.forEach(function (s, j) {
          if (serie.length === 1 && !v.valori[j]) return;
          var rr = el("div");
          var k = el("i", "key"); k.style.background = "var(" + s.col + ")";
          rr.appendChild(k); rr.appendChild(document.createTextNode(s.nome + ": ")); rr.appendChild(el("b", null, String(v.valori[j] || 0)));
          tip.appendChild(rr);
        });
        if (v.extra) tip.appendChild(el("div", null, v.extra));
        else if (serie.length > 1) { var tt = el("div"); tt.appendChild(document.createTextNode("Totale: ")); tt.appendChild(el("b", null, String(tot[i]))); tip.appendChild(tt); }
        var bx = box.getBoundingClientRect(), sx = svg.getBoundingClientRect();
        var px = (cx / W) * sx.width, py = (y(tot[i]) / H) * sx.height;
        tip.style.left = Math.min(bx.width - 70, Math.max(70, px)) + "px";
        tip.style.top = Math.max(40, py) + "px";
        tip.hidden = false;
      });
      hit.addEventListener("pointerleave", function () { tip.hidden = true; });
      gr.appendChild(hit);
      svg.appendChild(gr);
    });
    box.appendChild(svg);
    box.appendChild(tip);
    if (serie.length > 1) {
      var lg = el("div", "legend");
      serie.forEach(function (s) { var it = el("span"); var k = el("i", "key"); k.style.background = "var(" + s.col + ")"; it.appendChild(k); it.appendChild(document.createTextNode(s.nome)); lg.appendChild(it); });
      box.appendChild(lg);
    }
  }

  /* ---------- eventi ---------- */
  ruolo("serata").addEventListener("change", function (e) {
    serataScelta = e.target.value;
    scrivi(CHIAVE_SERATA, serataScelta);
    carica();
  });
  ruolo("aggiorna").addEventListener("click", function () { carica(true); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) carica(); });
  var largo = 0;
  window.addEventListener("resize", function () {
    if (!ultimo || Math.abs(window.innerWidth - largo) < 40) return;
    largo = window.innerWidth;
    disegna(ultimo);
  });

  if (!accesso) cancello();
  else { ruolo("ctrl").hidden = false; carica(); avvia(); }
  largo = window.innerWidth;

  /* ---------- dati finti per ?demo ---------- */
  function datiDemo(id) {
    var serate = [
      { id: "2026-11-13", data: "2026-11-13", titolo: "Serata del 13" },
      { id: "2026-11-06", data: "2026-11-06", titolo: "Tavola Cunzata" },
      { id: "2026-10-30", data: "2026-10-30", titolo: "Cumbia, Selva Cosmica" }
    ];
    var s = serate.filter(function (x) { return x.id === id; })[0] || serate[1];
    var oggi = new Date(); var ymd = oggi.getFullYear() + "-" + pad(oggi.getMonth() + 1) + "-" + pad(oggi.getDate());
    return {
      ok: true, aggiornato: new Date().toISOString(), serate: serate,
      serata: { id: s.id, titolo: s.titolo, data: s.data, capienza: 300, chiusuraPass: "22:00", chiusuraGruppi: "22:00", oggi: s.data === ymd, passata: s.data < ymd },
      pass: { validi: 142, invito: 21, esterni: 4, gruppo: 117, inAttesaDelGruppo: 11, daConfermare: 6, annullati: 3, entrati: 38, newsletter: 142 },
      gruppi: { completi: 39, aperti: 7, scaduti: 4, dimensione: 3, inCorso: [{ membri: 3, confermati: 2 }, { membri: 3, confermati: 2 }, { membri: 2, confermati: 2 }, { membri: 2, confermati: 1 }, { membri: 3, confermati: 1 }, { membri: 1, confermati: 1 }, { membri: 1, confermati: 0 }] },
      attesa: 2,
      eventi: [
        { id: "samba", tipo: "workshop", titolo: "Workshop Samba e Percussioni", inizio: "19:00", posti: 40, prenotazioni: 27, persone: 27, aperto: true, ultima: "06.11 12:41" },
        { id: "cena", tipo: "cena", titolo: "Cena colombiana", inizio: "20:00", posti: 60, prenotazioni: 14, persone: 33, aperto: true, ultima: "06.11 13:05" }
      ],
      andamento: [
        { giorno: "2026-11-01", invito: 4, gruppo: 9 }, { giorno: "2026-11-02", invito: 2, gruppo: 18 }, { giorno: "2026-11-03", invito: 1, gruppo: 12 },
        { giorno: "2026-11-04", invito: 3, gruppo: 15 }, { giorno: "2026-11-05", invito: 8, gruppo: 27 }, { giorno: "2026-11-06", invito: 3, gruppo: 36 }
      ],
      ingressi: [{ ora: "20:00", n: 6 }, { ora: "20:15", n: 9 }, { ora: "20:30", n: 4 }, { ora: "20:45", n: 3 }, { ora: "21:00", n: 7 }, { ora: "21:15", n: 9 }],
      inviti: [{ nome: "Artisti", pass: 12 }, { nome: "Amici di Marco", pass: 9 }, { nome: "QR di un'altra biglietteria", pass: 4 }],
      contatti: { totale: 251, newsletter: 247, nuovi: 118 },
      storico: [
        { id: "2026-10-30", data: "2026-10-30", titolo: "Cumbia, Selva Cosmica", validi: 184, entrati: 55, gruppi: 40, prenotati: 18, nuoviContatti: 126 },
        { id: "2026-11-06", data: "2026-11-06", titolo: "Tavola Cunzata", validi: 142, entrati: 38, gruppi: 39, prenotati: 60, nuoviContatti: 118 },
        { id: "2026-11-13", data: "2026-11-13", titolo: "Serata del 13", validi: 0, entrati: 0, gruppi: 0, prenotati: 0, nuoviContatti: 0 }
      ]
    };
  }
})();
