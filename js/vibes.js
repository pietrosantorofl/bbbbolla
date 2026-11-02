/* bolla® — Vibes: foto e video delle serate già concluse, dalla più recente.
   Il materiale è nella voce "vibes" di ogni serata (config.js), file in assets/vibes/<id serata>/.
   Ogni serata ha l'ancora #<id> (es. vibes.html#2026-10-30), usata nella mail di ringraziamento.
   Un clic apre la vista grande (frecce e Esc); i video in griglia girano senza audio, nella vista con l'audio. */
(function () {
  "use strict";

  var C = window.BOLLA;
  var T = I18N.T, L = I18N.L;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function parseData(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  // "9:16" -> "9 / 16" per aspect-ratio
  function proporzioni(f) { var p = String(f || "4:5").split(":"); return (+p[0] || 4) + " / " + (+p[1] || 5); }
  var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  var fermo = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var serate = C.serate
    .filter(function (s) { return s.vibes && s.vibes.length && parseData(s.data) < oggi; })
    .sort(function (a, b) { return a.data < b.data ? 1 : -1; });

  var box = document.querySelector('[data-bind="vibes"]');
  if (!serate.length) { box.appendChild(el("p", "vibes__vuoto", T("Foto e video in arrivo dopo la prossima serata."))); return; }

  // i video in griglia partono solo quando si vedono, così il telefono non scarica tutto subito
  var osserva = !fermo && "IntersectionObserver" in window ? new IntersectionObserver(function (voci) {
    voci.forEach(function (v) {
      if (v.isIntersecting) { var p = v.target.play(); if (p && p.catch) p.catch(function () {}); }
      else v.target.pause();
    });
  }, { threshold: 0.5 }) : null;

  serate.forEach(function (s) {
    var d = parseData(s.data);
    var data = d.getDate() + " " + I18N.mesi[d.getMonth()] + " " + d.getFullYear();
    var sez = el("section", "serata-vibes");
    sez.id = s.id;
    sez.setAttribute("aria-label", data);
    sez.appendChild(el("h2", "serata-vibes__data", data));
    if (s.luogo && s.luogo.nome) sez.appendChild(el("p", "serata-vibes__luogo", s.luogo.nome));

    var griglia = el("div", "serata-vibes__griglia");
    // solo i file arrivati entrano nella vista grande
    var pronti = s.vibes.filter(function (v) { return v.src; });
    s.vibes.forEach(function (v) {
      var tile;
      if (!v.src) {
        tile = el("div", "vibe vibe--attesa");
        tile.appendChild(el("span", null, v.tipo === "video" ? T("Video in arrivo") : T("Foto in arrivo")));
      } else {
        tile = el("button", "vibe");
        tile.type = "button";
        tile.setAttribute("aria-label", L(v.alt) || (v.tipo === "video" ? T("Apri il video") : T("Apri la foto")));
        if (v.tipo === "video") {
          var vid = el("video");
          vid.muted = true; vid.loop = true; vid.playsInline = true; vid.preload = "none";
          vid.setAttribute("muted", ""); vid.setAttribute("playsinline", "");
          if (v.poster) vid.poster = v.poster;
          vid.src = v.src;
          tile.appendChild(vid);
          var play = el("span", "vibe__play");
          play.innerHTML = '<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M0 0l10 6-10 6z"/></svg>';
          tile.appendChild(play);
          if (osserva) osserva.observe(vid);
        } else {
          var img = el("img");
          img.src = v.src; img.alt = L(v.alt) || ""; img.loading = "lazy";
          tile.appendChild(img);
        }
        var i = pronti.indexOf(v);
        tile.addEventListener("click", function () { apri(pronti, i); });
      }
      tile.style.aspectRatio = proporzioni(v.formato);
      griglia.appendChild(tile);
    });
    sez.appendChild(griglia);
    box.appendChild(sez);
  });

  // la pagina si costruisce qui: l'ancora del link (#2026-10-30) va raggiunta a mano
  if (location.hash) {
    var ancora = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (ancora) ancora.scrollIntoView();
  }

  /* ---------- vista grande ---------- */
  var vista = document.querySelector("[data-vista]");
  var media = vista.querySelector("[data-vista-media]");
  var conta = vista.querySelector("[data-vista-conta]");
  var prec = vista.querySelector("[data-vista-prec]");
  var succ = vista.querySelector("[data-vista-succ]");
  var lista = [], pos = 0;

  vista.setAttribute("aria-label", T("Foto e video"));
  vista.querySelector("[data-vista-chiudi]").setAttribute("aria-label", T("Chiudi"));
  prec.setAttribute("aria-label", T("Precedente"));
  succ.setAttribute("aria-label", T("Successiva"));

  function mostra() {
    media.textContent = "";
    var v = lista[pos];
    var n;
    if (v.tipo === "video") {
      n = el("video");
      n.controls = true; n.playsInline = true; n.autoplay = true; n.setAttribute("playsinline", "");
      if (v.poster) n.poster = v.poster;
      n.src = v.src;
    } else {
      n = el("img");
      n.src = v.src; n.alt = L(v.alt) || "";
    }
    media.appendChild(n);
    var piu = lista.length > 1;
    prec.hidden = succ.hidden = !piu;
    conta.textContent = piu ? (pos + 1) + " / " + lista.length : "";
  }
  function apri(l, i) {
    lista = l; pos = i;
    mostra();
    if (vista.showModal) vista.showModal(); else vista.setAttribute("open", "");
  }
  function chiudi() {
    media.textContent = "";   // ferma il video
    if (vista.close) vista.close(); else vista.removeAttribute("open");
  }
  function sposta(d) { pos = (pos + d + lista.length) % lista.length; mostra(); }

  vista.querySelector("[data-vista-chiudi]").addEventListener("click", chiudi);
  prec.addEventListener("click", function () { sposta(-1); });
  succ.addEventListener("click", function () { sposta(1); });
  vista.addEventListener("close", function () { media.textContent = ""; });
  // clic sul fondo scuro (fuori da foto, video e tastini): chiude
  vista.addEventListener("click", function (e) { if (e.target === vista || e.target === media) chiudi(); });
  vista.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft" && lista.length > 1) sposta(-1);
    if (e.key === "ArrowRight" && lista.length > 1) sposta(1);
  });
  // scorrimento col dito sul telefono
  var x0 = null;
  vista.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  vista.addEventListener("touchend", function (e) {
    if (x0 == null || lista.length < 2) return;
    var dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) sposta(dx < 0 ? 1 : -1);
    x0 = null;
  });
})();
