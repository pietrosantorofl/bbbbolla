/* bolla® live — pagina del pubblico: nickname, colore e cosa provi verso le visuals */
(function () {
  var C = window.BOLLA;
  var L = window.BOLLA_LIVE;
  var $ = function (id) { return document.getElementById(id); };

  var IT = /^it\b/i.test(navigator.language || "it");
  var TESTI = {
    live: ["live", "live"],
    chiusoTitolo: ["Sei fuori dalla bolla", "You're outside the bubble"],
    chiusoTesto: ["Questa pagina si apre dal QR proiettato in sala durante la serata.", "This page opens from the QR code projected in the room during the night."],
    sotto: ["Scegli un nome, un colore e scrivi cosa provi: lo vedrai prendere vita sul muro.", "Pick a name, a colour and write how you feel: watch it come alive on the wall."],
    nickname: ["Nickname", "Nickname"],
    colore: ["Colore", "Colour"],
    emozione: ["Cosa provi?", "How do you feel?"],
    lancia: ["Lancia nella bolla", "Send it into the bubble"],
    inviata: ["Guarda il muro: sta entrando nella bolla.", "Look at the wall: it is entering the bubble."],
    attendi: ["Puoi scrivere di nuovo tra %s s", "You can write again in %s s"],
    pronta: ["Senti qualcos'altro? Scrivilo", "Feeling something else? Write it"],
    rete: ["Connessione assente. Riprova.", "No connection. Try again."],
    serveEmozione: ["Scrivi cosa provi, solo lettere e spazi.", "Write how you feel, letters and spaces only."],
    serveNick: ["Scegli un nickname.", "Pick a nickname."]
  };
  function T(k) { return TESTI[k][IT ? 0 : 1]; }
  document.documentElement.lang = IT ? "it" : "en";
  document.querySelectorAll("[data-t]").forEach(function (n) { n.textContent = T(n.getAttribute("data-t")); });

  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage non disponibile */ } }

  var codice = new URLSearchParams(location.search).get("c") || "";
  if (!L.demo && !codice) { $("chiuso").hidden = false; return; }
  $("modulo").hidden = false;

  // serata: la prossima in programma (solo per l'archivio nel foglio)
  var oggi = new Date().toISOString().slice(0, 10);
  var serata = (C.serate.filter(function (s) { return s.data >= oggi; })[0] || C.serate[C.serate.length - 1]).id;

  var dispositivo = leggi("bolla-live-dispositivo");
  if (!dispositivo) {
    dispositivo = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(12)), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    scrivi("bolla-live-dispositivo", dispositivo);
  }

  /* ---------- colore ---------- */
  var CAMPIONI = ["#f0307f", "#ff3b1c", "#f8893c", "#ffd23f", "#3ddc97", "#22c3ee", "#5b5ff0", "#b04cf0"];
  var colore = leggi("bolla-live-colore") || CAMPIONI[0];

  function hsl2hex(h, s, l) {
    s /= 100; l /= 100;
    var f = function (n) {
      var k = (n + h / 30) % 12;
      var c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return ("0" + Math.round(c * 255).toString(16)).slice(-2);
    };
    return "#" + f(0) + f(8) + f(4);
  }
  function tintaDi(hex) {
    var r = parseInt(hex.substr(1, 2), 16) / 255, g = parseInt(hex.substr(3, 2), 16) / 255, b = parseInt(hex.substr(5, 2), 16) / 255;
    var max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    if (!d) return 0;
    var h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return Math.round((h * 60 + 360) % 360);
  }
  function usaColore(hex) {
    colore = hex;
    document.documentElement.style.setProperty("--c", hex);
    document.querySelector('meta[name="theme-color"]').content = hex;
    Array.prototype.forEach.call($("campioni").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.c === hex)); });
    scrivi("bolla-live-colore", hex);
  }
  CAMPIONI.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button"; b.dataset.c = c; b.style.setProperty("--s", c); b.setAttribute("aria-label", c);
    b.addEventListener("click", function () { $("tinta").value = tintaDi(c); usaColore(c); });
    $("campioni").appendChild(b);
  });
  $("tinta").addEventListener("input", function () { usaColore(hsl2hex(+this.value, 90, 58)); });
  $("tinta").value = tintaDi(colore);
  usaColore(colore);

  /* ---------- nickname e cosa provi ---------- */
  $("nickname").value = leggi("bolla-live-nickname") || "";
  function aggiornaAnteprima() { $("anteprima").textContent = $("emozione").value.trim() || "✦"; }
  $("emozione").addEventListener("input", function () { errore(""); aggiornaAnteprima(); });
  aggiornaAnteprima();

  /* ---------- invio ---------- */
  var attesaFino = 0;
  function errore(msg) { $("errore").textContent = msg; $("errore").hidden = !msg; }

  function contoAllaRovescia() {
    var s = Math.ceil((attesaFino - Date.now()) / 1000);
    if (s > 0) {
      $("lancia").disabled = true;
      $("nota").textContent = T("attendi").replace("%s", s);
      setTimeout(contoAllaRovescia, 500);
    } else {
      $("lancia").disabled = false;
      $("nota").textContent = T("pronta");
    }
  }

  $("modulo").addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (Date.now() < attesaFino) return;
    var nickname = $("nickname").value.trim();
    if (!nickname) { errore(T("serveNick")); $("nickname").focus(); return; }
    var emozione = $("emozione").value.trim().replace(/\s+/g, " ");
    if (!/^[\p{L}\p{N}'’ \-]{1,24}$/u.test(emozione)) { errore(T("serveEmozione")); $("emozione").focus(); return; }
    errore("");
    scrivi("bolla-live-nickname", nickname);
    $("lancia").disabled = true;
    L.api("live_invia", { codice: codice, serata: serata, dispositivo: dispositivo, nickname: nickname, colore: colore, emozione: emozione })
      .then(function (r) {
        if (!r.ok) { $("lancia").disabled = false; errore(r.messaggio); return; }
        if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
        var sfera = $("sfera");
        sfera.classList.remove("parte"); void sfera.offsetWidth; sfera.classList.add("parte");
        setTimeout(function () {
          sfera.classList.remove("parte");
          $("emozione").value = ""; aggiornaAnteprima();
        }, 1900);
        $("nota").textContent = T("inviata");
        attesaFino = Date.now() + (r.attesa || 30) * 1000;
        setTimeout(contoAllaRovescia, 2500);
      })
      .catch(function () { $("lancia").disabled = false; errore(T("rete")); });
  });
})();
