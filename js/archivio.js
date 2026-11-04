/* bolla® — eventi passati: le serate di config.js già concluse, dalla più recente: data e locandine una accanto all'altra.
   Le locandine sono nella voce "locandine" di ogni serata (config.js), immagini in assets/locandine/. */
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
  var oggi = new Date(); oggi.setHours(0, 0, 0, 0);

  var passate = C.serate
    .filter(function (s) { return parseData(s.data) < oggi; })
    .sort(function (a, b) { return a.data < b.data ? 1 : -1; });

  var box = document.querySelector('[data-bind="passate"]');
  if (!passate.length) { box.appendChild(el("p", "archivio__vuoto", T("Ancora nessuna serata: la prima sta per arrivare."))); return; }

  passate.forEach(function (s) {
    var d = parseData(s.data);
    var sez = el("section", "passata");
    sez.setAttribute("aria-label", d.getDate() + " " + I18N.mesi[d.getMonth()] + " " + d.getFullYear());

    // solo la data: il resto lo raccontano le locandine
    sez.appendChild(el("h2", "passata__data", d.getDate() + " " + I18N.mesi[d.getMonth()] + " " + d.getFullYear()));

    var locandine = s.locandine || [];
    if (locandine.length) {
      var griglia = el("div", "passata__locandine");
      griglia.style.setProperty("--n", Math.min(locandine.length, 3));
      locandine.forEach(function (l) {
        // un clic apre la locandina intera
        var a = el("a");
        a.href = l.src; a.target = "_blank"; a.rel = "noopener";
        var img = el("img");
        img.src = l.src; img.alt = L(l.alt) || ""; img.loading = "lazy"; img.width = 900; img.height = 1200;
        // formato: "larghezza:altezza" se la locandina non è 3:4 (es. "4:5"), così non viene tagliata
        if (l.formato) { var f = l.formato.split(":"); img.height = Math.round(900 * f[1] / f[0]); img.style.aspectRatio = f[0] + " / " + f[1]; }
        a.appendChild(img);
        griglia.appendChild(a);
      });
      sez.appendChild(griglia);
    }
    // foto e video della serata, se ci sono: pagina Vibes
    if (s.vibes && s.vibes.length) {
      var p = el("p", "passata__vibes");
      var a = el("a", null, T("Vibes della serata") + " →");
      a.href = "vibes.html#" + s.id;
      p.appendChild(a);
      sez.appendChild(p);
    }
    box.appendChild(sez);
  });
})();
