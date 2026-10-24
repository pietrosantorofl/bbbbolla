/* bolla® live — visuals proiettate.
   Un campo psichedelico in feedback (ogni fotogramma ridisegna il precedente deformato da un flusso),
   guidato dalla musica presa dal microfono. Il movimento è lento: il suono ne decide velocità, forma e colore
   con inviluppi morbidi; i bassi toccano appena lo sfondo, niente pulsazioni sulla cassa.
   Il pubblico manda nickname, colore e cosa prova: l'invio scorre nella mini chat, il testo appare grande,
   poi viene versato nel flusso e si scioglie; per qualche secondo cambia il carattere delle visuals. */
(function () {
  var C = window.BOLLA;
  var L = window.BOLLA_LIVE;
  var $ = function (id) { return document.getElementById(id); };
  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage non disponibile */ } }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function liscio(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function verso(attuale, obiettivo, dt, tau) { return attuale + (obiettivo - attuale) * (1 - Math.exp(-dt / tau)); }

  var CHIAVE_REGIA = "bolla-live-regia-schermo";   // ultime impostazioni ricevute dalla regia: si riparte uguali
  var SITO_LIVE = "https://bbbbolla.it/live/";   // dove porta il QR proiettato
  var SCALA_FEEDBACK = 0.6;             // il campo gira a risoluzione ridotta: più fluido e più morbido
  var DURATA_CHAT = 10;                 // secondi prima che una voce della chat sparisca
  var MAX_CHAT = 7;

  /* ============================================================
     Tipi di visuals
     w = peso dei cinque disegni di base (seta, liquido, lava, aurora, tunnel)
     zoom/spin/warp = quanto il campo si allarga, ruota e si deforma; kal = specchio a caleidoscopio
     decay = quanto dura la scia; drift = il campo sale (positivo) o scende
     ============================================================ */
  var TIPI = [
    { nome: "Seta", w: [1, 0, 0, 0, 0], zoom: .25, spin: .3, warp: .8, kal: 0, decay: .985, drift: 0 },
    { nome: "Liquido", w: [0, 1, 0, 0, 0], zoom: .4, spin: .4, warp: 1.2, kal: 0, decay: .982, drift: 0 },
    { nome: "Lava", w: [0, 0, 1, 0, 0], zoom: .08, spin: .12, warp: 1.6, kal: 0, decay: .988, drift: .5 },
    { nome: "Aurora", w: [0, 0, 0, 1, 0], zoom: .1, spin: .05, warp: .7, kal: 0, decay: .984, drift: 1 },
    { nome: "Caleidoscopio", w: [.5, .6, 0, 0, 0], zoom: .5, spin: .5, warp: 1, kal: 1, decay: .982, drift: 0 },
    { nome: "Tunnel", w: [0, 0, 0, 0, 1], zoom: 1.2, spin: .6, warp: .6, kal: 0, decay: .978, drift: 0 },
    { nome: "Mandala", w: [.6, 0, 0, 0, .6], zoom: .7, spin: -.5, warp: .7, kal: 1, decay: .98, drift: 0 }
  ];
  var DURATA_AUTO = 90;   // secondi per tipo quando il giro automatico è acceso

  /* Carattere di quello che il pubblico scrive: moltiplica velocità, deformazione e zoom del flusso
     e fa girare i colori (tinta, positiva verso i caldi). Svanisce piano in una ventina di secondi.
     Se il testo contiene una di queste radici usa il suo carattere; altrimenti ne ricava uno dal testo stesso. */
  var EFFETTI = {
    gioia: { vel: 1.4, warp: 1.2, zoom: 1.4, tinta: .004 },
    amore: { vel: .8, warp: 1.15, zoom: .8, tinta: .001 },
    desiderio: { vel: .65, warp: 1.6, zoom: .6, tinta: -.002 },
    euforia: { vel: 1.9, warp: 1.5, zoom: 1.8, tinta: .009 },
    calma: { vel: .45, warp: .6, zoom: .4, tinta: 0 },
    stupore: { vel: 1.1, warp: 1, zoom: 2.4, tinta: .003 },
    nostalgia: { vel: .6, warp: .9, zoom: .4, tinta: -.003 },
    malinconia: { vel: .4, warp: .8, zoom: .3, tinta: -.005 },
    rabbia: { vel: 1.6, warp: 2.2, zoom: 1, tinta: .007 },
    gratitudine: { vel: .8, warp: .9, zoom: .8, tinta: .002 }
  };
  var SINONIMI = { felic: "gioia", allegr: "gioia", happy: "gioia", joy: "gioia", innamor: "amore", love: "amore", passion: "desiderio",
    voglia: "desiderio", desire: "desiderio", eccit: "euforia", carich: "euforia", pace: "calma", seren: "calma", relax: "calma",
    calm: "calma", meravigl: "stupore", wow: "stupore", wonder: "stupore", triste: "malinconia", tristezza: "malinconia", sad: "malinconia",
    nostalg: "nostalgia", arrabbi: "rabbia", angry: "rabbia", grazie: "gratitudine", grat: "gratitudine" };
  var DURATA_UMORE = 18;
  function carattere(testo) {
    var t = String(testo).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    var chiavi = Object.keys(EFFETTI).concat(Object.keys(SINONIMI));
    for (var i = 0; i < chiavi.length; i++) {
      if (t.indexOf(chiavi[i]) >= 0) return EFFETTI[chiavi[i]] || EFFETTI[SINONIMI[chiavi[i]]];
    }
    // testo sconosciuto: un carattere stabile ricavato dalle lettere, sempre dentro limiti morbidi
    var h = 0;
    for (var j = 0; j < t.length; j++) h = (h * 31 + t.charCodeAt(j)) >>> 0;
    var r = function (n) { return ((h >>> n) & 255) / 255; };
    return { vel: .6 + r(0) * .9, warp: .7 + r(8) * 1.1, zoom: .4 + r(16) * 1.4, tinta: (r(24) - .5) * .01 };
  }

  // impostazioni decise dalla regia (live/regia.html): sullo schermo non c'è nessun pannello
  var imp = L.regiaIniziale();
  try { Object.assign(imp, JSON.parse(leggi(CHIAVE_REGIA)) || {}); } catch (e) { /* niente */ }
  imp.tipo = clamp(imp.tipo | 0, 0, TIPI.length - 1);

  /* ============================================================
     Shader
     ============================================================ */
  var VS = "#version 300 es\nin vec2 a; out vec2 vUv; void main(){ vUv = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }";

  var COMUNE = [
    "#version 300 es",
    "precision highp float;",
    "in vec2 vUv; out vec4 o;",
    "uniform vec2 uRes; uniform float uTime, uFt, uBass, uMid, uHigh, uLevel, uTono;",
    "vec3 mod289(vec3 x){ return x - floor(x * (1. / 289.)) * 289.; }",
    "vec2 mod289(vec2 x){ return x - floor(x * (1. / 289.)) * 289.; }",
    "vec3 permute(vec3 x){ return mod289(((x * 34.) + 1.) * x); }",
    "float snoise(vec2 v){",
    "  const vec4 C = vec4(.211324865405187, .366025403784439, -.577350269189626, .024390243902439);",
    "  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);",
    "  vec2 i1 = (x0.x > x0.y) ? vec2(1., 0.) : vec2(0., 1.);",
    "  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod289(i);",
    "  vec3 p = permute(permute(i.y + vec3(0., i1.y, 1.)) + i.x + vec3(0., i1.x, 1.));",
    "  vec3 m = max(.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.); m = m * m; m = m * m;",
    "  vec3 x = 2. * fract(p * C.www) - 1.; vec3 h = abs(x) - .5; vec3 ox = floor(x + .5); vec3 a0 = x - ox;",
    "  m *= 1.79284291400159 - .85373472095314 * (a0 * a0 + h * h);",
    "  vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;",
    "  return 130. * dot(m, g);",
    "}",
    "float fbm(vec2 p){ float f = 0., a = .5; for (int i = 0; i < 4; i++) { f += a * snoise(p); p = p * 2.03 + vec2(17., 9.); a *= .5; } return f; }",
    "vec2 curl(vec2 p){ float e = .09;",
    "  return vec2(snoise(p + vec2(0., e)) - snoise(p - vec2(0., e)), snoise(p - vec2(e, 0.)) - snoise(p + vec2(e, 0.))) / (2. * e); }",
    "mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }",
    // rotazione della tinta attorno all'asse dei grigi: il colore "cangia" senza perdere luce
    "vec3 tinta(vec3 c, float a){ const vec3 k = vec3(.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1. - ca); }",
    "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }"
  ].join("\n");

  var FS_FEEDBACK = COMUNE + "\n" + [
    "uniform sampler2D uPrev, uText;",
    "uniform float uZoom, uSpin, uWarp, uDecay, uDrift, uInk, uMelt, uTintaUmore, uBassi;",
    "uniform float uW[5];",
    "uniform vec3 uPal[4];",
    // i cinque disegni di base: ognuno restituisce dove il campo riceve nuova luce
    "float eSeta(vec2 p, float ft){",
    "  vec2 w = p + .4 * vec2(fbm(p * .7 + vec2(ft * .04, 0.)), fbm(p * .7 + vec2(5.2, -ft * .035)));",
    "  float v = sin(w.x * 6. + sin(w.y * 2.5 + ft * .15) * 2.2 + ft * .1) + sin(w.y * 4.5 - ft * .08 + sin(w.x * 1.7 - ft * .05) * 1.8);",
    "  return 1. - smoothstep(0., .09 + .06 * uMid, abs(v));",
    "}",
    "float eLiquido(vec2 p, float ft){",
    "  float n = fbm(p * 1.4 + fbm(p + ft * .04) * 1.6 + vec2(0., ft * .02));",
    "  return smoothstep(.55, 1., sin(n * 10. + ft * .3 + length(p) * 4.));",
    "}",
    "float eLava(vec2 p, float ft){",
    "  float n = fbm(p * .8 + vec2(0., -ft * .04) + .5 * fbm(p * .5 + ft * .02));",
    "  return smoothstep(.05, .3, n) * (1. - smoothstep(.3, .55, n)) * 1.4 + smoothstep(.45, .75, n) * .35;",
    "}",
    "float eAurora(vec2 p, float ft){",
    "  float x = p.x + .25 * fbm(vec2(p.x * .6, ft * .04));",
    "  float y0 = .18 * sin(x * 1.8 + ft * .07) + .12 * fbm(vec2(x * 2.2, ft * .05)) - .05;",
    "  float tenda = exp(-pow((p.y - y0) * 5., 2.));",
    "  float righe = .55 + .45 * sin(x * 38. + fbm(vec2(x * 4., ft * .1)) * 8.);",
    "  return tenda * righe;",
    "}",
    "float eTunnel(vec2 p, float ft){",
    "  float r = length(p), a = atan(p.y, p.x);",
    "  float v = sin(log(r + .001) * 9. - ft * .5 + a * 2. + fbm(p * 2. + ft * .03) * 1.5);",
    "  return smoothstep(.75, 1., v) * smoothstep(.04, .35, r);",
    "}",
    "void main(){",
    "  float asp = uRes.x / uRes.y;",
    "  vec2 p = (vUv - .5) * vec2(asp, 1.);",
    "  float ft = uFt;",
    "  vec2 fl = curl(p * 1.1 + vec2(ft * .03, -ft * .025)) + .5 * curl(p * 2.6 - vec2(ft * .05, ft * .02));",
    "  vec2 q = rot(uSpin * .0012 * (.4 + uLevel)) * p;",
    "  q *= 1. - uZoom * (.0006 + .0016 * uLevel);",
    // bassi: con la sensibilità alta il campo respira appena sui colpi lenti, a 0 non li sente
    "  q *= 1. - .0012 * uBassi * uBass * uBass;",
    "  q += fl * uWarp * (.0005 + .0022 * uMid);",
    "  q.y -= uDrift * .0006;",
    // lo sciogliersi: dove l'immagine è luminosa cola piano verso il basso
    "  vec3 pc = texture(uPrev, q / vec2(asp, 1.) + .5).rgb;",
    "  q.y += uMelt * .004 * smoothstep(.15, 1.3, dot(pc, vec3(.333))) * (.6 + .4 * snoise(p * 5. + ft * .2));",
    "  vec2 s = q / vec2(asp, 1.) + .5;",
    "  vec2 ab = fl * .0008 * (.5 + 2. * uHigh);",
    "  vec3 c = vec3(texture(uPrev, s + ab).r, texture(uPrev, s).g, texture(uPrev, s - ab).b);",
    "  c = tinta(c, .0015 + .008 * uHigh + .004 * uMid + uTintaUmore) * uDecay;",
    // un filo di saturazione a ogni giro: i colori mescolati restano accesi invece di diventare fango
    "  float lu = dot(c, vec3(.299, .587, .114)); c = max(mix(vec3(lu), c, 1.007), 0.);",
    "  float e = 0.;",
    "  if (uW[0] > .01) e += uW[0] * eSeta(p, ft);",
    "  if (uW[1] > .01) e += uW[1] * eLiquido(p, ft);",
    "  if (uW[2] > .01) e += uW[2] * eLava(p, ft);",
    "  if (uW[3] > .01) e += uW[3] * eAurora(p, ft);",
    "  if (uW[4] > .01) e += uW[4] * eTunnel(p, ft);",
    // il timbro (suono scuro o brillante) sposta i colori lungo la tavolozza
    "  float sel = fract(fbm(p * .6 + ft * .02) * .8 + e * .15 + uTono * .5 + ft * .008) * 4.;",
    "  int i0 = int(sel);",
    "  vec3 pal = mix(uPal[i0], uPal[(i0 + 1) % 4], smoothstep(0., 1., fract(sel)));",
    // dove il campo è già acceso non aggiunge luce: restano zone scure e il colore non si impasta
    "  float spazio = 1. - smoothstep(.35, 1.2, lu);",
    "  c += pal * e * spazio * (.006 + .028 * uLevel + .006 * uMid + .008 * uBassi * uBass);",
    // i bassi: solo un respiro leggero dello sfondo
    "  c += uPal[2] * .004 * uBassi * uBass * (1. - smoothstep(0., .9, length(p)));",
    // l'emozione entra nel flusso come inchiostro
    "  vec4 tx = texture(uText, vUv + fl * .003 * uInk);",
    "  c = mix(c, tx.rgb * 1.5, clamp(tx.a * uInk, 0., 1.));",
    "  o = vec4(min(c, vec3(4.)), 1.);",
    "}"
  ].join("\n");

  var FS_SCHERMO = COMUNE + "\n" + [
    "uniform sampler2D uFeed, uText;",
    "uniform float uKal, uOverlay, uWob;",
    "void main(){",
    "  float asp = uRes.x / uRes.y;",
    "  vec2 p = (vUv - .5) * vec2(asp, 1.);",
    "  vec2 ab = p * .003 * (.2 + 1.5 * uHigh);",
    "  vec3 c = vec3(texture(uFeed, vUv + ab).r, texture(uFeed, vUv).g, texture(uFeed, vUv - ab).b);",
    "  if (uKal > .001) {",
    "    float a = atan(p.y, p.x) + uFt * .02; float rr = length(p); float seg = 6.2831853 / 6.;",
    "    a = mod(a, seg); a = abs(a - seg * .5);",
    "    vec2 kp = rr * vec2(cos(a), sin(a));",
    "    c = mix(c, texture(uFeed, kp / vec2(asp, 1.) + .5).rgb, uKal);",
    "  }",
    "  c = pow(c, vec3(1.35)) * 1.25;",
    "  c = 1. - exp(-c * 1.3);",
    "  float g = dot(c, vec3(.299, .587, .114)); c = mix(vec3(g), c, 1.3);",
    // l'emozione nitida sopra, che ondeggia di più mentre si scioglie
    "  vec2 wob = vec2(sin(vUv.y * 18. + uTime * 1.6), cos(vUv.x * 14. + uTime * 1.2)) * .006 * uWob;",
    "  vec4 tx = texture(uText, vUv + wob);",
    "  c = mix(c, tx.rgb, clamp(tx.a * uOverlay, 0., 1.));",
    "  c *= 1. - .4 * pow(length((vUv - .5) * vec2(1., .85)) * 1.25, 2.6);",
    "  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.) - .5) * .03;",
    "  o = vec4(clamp(c, 0., 1.), 1.);",
    "}"
  ].join("\n");

  /* ============================================================
     WebGL
     ============================================================ */
  var canvas = $("gl");
  var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) { $("avvioTesto").textContent = "Questo browser non supporta WebGL2: usa Chrome aggiornato."; $("avvia").disabled = true; return; }
  var floatOk = !!gl.getExtension("EXT_color_buffer_float");

  function compila(tipo, src) {
    var s = gl.createShader(tipo);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function programma(fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compila(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compila(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "a");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var loc = {};
    p.u = function (nome) { return nome in loc ? loc[nome] : (loc[nome] = gl.getUniformLocation(p, nome)); };
    return p;
  }
  var pFeedback = programma(FS_FEEDBACK);
  var pSchermo = programma(FS_SCHERMO);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function texture(w, h) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (floatOk) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    return t;
  }

  var fb = [], fw = 0, fh = 0, corrente = 0;
  var testoCanvas = document.createElement("canvas");
  var tctx = testoCanvas.getContext("2d");
  var texTesto = gl.createTexture();

  function dimensiona() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.min(Math.round(innerWidth * dpr), 2560), h = Math.round(w * innerHeight / innerWidth);
    canvas.width = w; canvas.height = h;
    fw = Math.round(innerWidth * SCALA_FEEDBACK); fh = Math.round(innerHeight * SCALA_FEEDBACK);
    fb.forEach(function (f) { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fbo); });
    fb = [0, 1].map(function () {
      var tex = texture(fw, fh), fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex: tex, fbo: fbo };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    testoCanvas.width = 1280; testoCanvas.height = Math.round(1280 * innerHeight / innerWidth);
    if (parola) disegnaParola(parola.voce); else caricaTesto();
  }

  function caricaTesto() {
    gl.bindTexture(gl.TEXTURE_2D, texTesto);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, testoCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /* ============================================================
     Colori
     ============================================================ */
  function rgb(hex) { return [parseInt(hex.substr(1, 2), 16) / 255, parseInt(hex.substr(3, 2), 16) / 255, parseInt(hex.substr(5, 2), 16) / 255]; }
  function chiaro(c, k) { return c.map(function (v) { return v + (1 - v) * k; }); }
  function css(c, a) { return "rgba(" + c.map(function (v) { return Math.round(v * 255); }).join(",") + "," + (a == null ? 1 : a) + ")"; }

  // la tavolozza del campo parte dai colori bolla® e accoglie gli ultimi colori arrivati dal pubblico
  var palObiettivo = ["#f0307f", "#f8893c", "#2b2f8e", "#e5249a"].map(rgb);
  var pal = palObiettivo.map(function (c) { return c.slice(); });
  function nuovoColore(c) { palObiettivo = [c].concat(palObiettivo.slice(0, 3)); }

  /* ============================================================
     Audio: inviluppi lenti, così il movimento segue la musica senza scatti
     ============================================================ */
  var audio = { bass: 0, mid: 0, high: 0, level: 0, tono: .5, nome: "simulato", vero: false };
  var actx = null, analizzatore = null, fft = null, flusso = null;
  var picco = { bass: .2, mid: .2, high: .2, level: .2 }, dispositivi = [];
  // secondi per salire e per scendere: si accende in fretta, si spegne piano
  var INVILUPPI = { level: [.4, 1.6], mid: [.35, 1.4], high: [.25, 1.1], bass: [.6, 2], tono: [1.5, 2.5] };

  function avviaAudio(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(false);
    return navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    }).then(function (stream) {
      if (flusso) flusso.getTracks().forEach(function (t) { t.stop(); });
      flusso = stream;
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      analizzatore = actx.createAnalyser();
      analizzatore.fftSize = 2048;
      analizzatore.smoothingTimeConstant = .7;
      actx.createMediaStreamSource(stream).connect(analizzatore);
      fft = new Uint8Array(analizzatore.frequencyBinCount);
      audio.vero = true;
      audio.nome = stream.getAudioTracks()[0].label || "microfono";
      audio.id = stream.getAudioTracks()[0].getSettings().deviceId || "";
      return navigator.mediaDevices.enumerateDevices().then(function (d) {
        dispositivi = d.filter(function (x) { return x.kind === "audioinput"; });
        return true;
      });
    }).catch(function () { audio.vero = false; audio.nome = "simulato (microfono non disponibile)"; return false; });
  }

  // la regia sceglie l'ingresso audio tra quelli di questo computer ("" = predefinito)
  var ingressoChiesto = imp.audioId || "";
  function usaIngresso(id) {
    if (id === ingressoChiesto) return;
    ingressoChiesto = id;
    avviaAudio(id || undefined);
  }

  function segui(k, valore, dt) {
    audio[k] = verso(audio[k], valore, dt, valore > audio[k] ? INVILUPPI[k][0] : INVILUPPI[k][1]);
  }

  // ogni banda si normalizza sul proprio picco degli ultimi secondi: funziona sia con musica piano che a tutto volume
  function normalizza(k, valore, dt) {
    picco[k] = Math.max(valore, picco[k] * Math.pow(.999, dt * 60), .03);
    return clamp((valore / picco[k] - .2) / .8, 0, 1);
  }

  function analizza(dt, ora) {
    if (!audio.vero) {
      // senza microfono: onde lente finte, così le visuals non stanno mai ferme
      var t = ora / 1000;
      segui("level", .45 + .25 * Math.sin(t / 7) + .1 * Math.sin(t / 2.3), dt);
      segui("mid", .4 + .2 * Math.sin(t / 5), dt);
      segui("high", .3 + .2 * Math.sin(t / 3.1), dt);
      segui("bass", .4, dt);
      segui("tono", .5 + .3 * Math.sin(t / 11), dt);
      return;
    }
    analizzatore.getByteFrequencyData(fft);
    var hz = actx.sampleRate / analizzatore.fftSize;
    var banda = function (lo, hi) {
      var a = Math.max(1, Math.floor(lo / hz)), b = Math.min(fft.length - 1, Math.ceil(hi / hz)), s = 0;
      for (var i = a; i <= b; i++) s += fft[i];
      return s / ((b - a + 1) * 255);
    };
    segui("bass", normalizza("bass", banda(30, 140), dt), dt);
    segui("mid", normalizza("mid", banda(140, 2200), dt), dt);
    segui("high", normalizza("high", banda(2200, 10000), dt), dt);
    segui("level", normalizza("level", banda(60, 10000), dt), dt);
    // timbro: frequenza "baricentro" dello spettro, da scura (0) a brillante (1)
    var a = Math.floor(60 / hz), b = Math.min(fft.length - 1, Math.ceil(8000 / hz)), somma = 0, pesata = 0;
    for (var i = a; i <= b; i++) { somma += fft[i]; pesata += fft[i] * i * hz; }
    if (somma > 0) segui("tono", clamp(Math.log2(pesata / somma / 150) / Math.log2(40), 0, 1), dt);
  }

  /* ============================================================
     Tipo di visuals, velocità e umore (l'ultima emozione arrivata)
     ============================================================ */
  var par = JSON.parse(JSON.stringify(TIPI[imp.tipo]));
  var tipoDal = 0, ft = 0;
  var umore = { testo: null, ef: null, forza: 0, vel: 1, warp: 1, zoom: 1, tinta: 0 };

  function aggiornaTipo(dt, ora) {
    if (imp.auto && ora - tipoDal > DURATA_AUTO * 1000) scegliTipo((imp.tipo + 1) % TIPI.length);
    var obj = TIPI[imp.tipo];
    // passaggio morbido da un tipo all'altro, in qualche secondo
    ["zoom", "spin", "warp", "kal", "decay", "drift"].forEach(function (n) { par[n] = verso(par[n], obj[n], dt, 2.5); });
    for (var i = 0; i < 5; i++) par.w[i] = verso(par.w[i], obj.w[i], dt, 2.5);
    // l'emozione spinge il flusso verso il suo carattere, poi svanisce piano
    umore.forza *= Math.exp(-dt / DURATA_UMORE);
    var ef = umore.ef || { vel: 1, warp: 1, zoom: 1, tinta: 0 };
    ["vel", "warp", "zoom"].forEach(function (k) { umore[k] = verso(umore[k], 1 + (ef[k] - 1) * umore.forza, dt, 2); });
    umore.tinta = verso(umore.tinta, ef.tinta * umore.forza, dt, 2);
    // il tempo del flusso scorre più veloce quando la musica è piena, quasi fermo nel silenzio
    ft += dt * imp.velocita * umore.vel * (.25 + .8 * audio.level + .35 * audio.mid);
  }
  function scegliTipo(i) { imp.tipo = i; tipoDal = performance.now(); }

  /* ============================================================
     Mini chat: ogni invio scorre con nickname e cosa prova, e sparisce dopo 10 secondi
     ============================================================ */
  function aggiungiChat(v) {
    var lista = $("chatLista");
    var li = document.createElement("li");
    li.dataset.id = v.id;
    li.style.setProperty("--c", v.colore);
    li.appendChild(document.createElement("i"));
    var b = document.createElement("b");
    b.textContent = v.nickname;
    li.appendChild(b);
    var s = document.createElement("span");
    s.textContent = v.emozione;
    li.appendChild(s);
    lista.appendChild(li);
    setTimeout(function () { esceChat(li); }, (DURATA_CHAT - 1.2) * 1000);
    var vive = lista.querySelectorAll("li:not(.esce)");
    for (var i = 0; i < vive.length - MAX_CHAT; i++) esceChat(vive[i]);
  }
  function esceChat(li) {
    if (li.classList.contains("esce")) return;
    li.classList.add("esce");
    setTimeout(function () { li.remove(); }, 1300);
  }

  /* ============================================================
     Cosa prova il pubblico, sul muro: appare, viene versato nel flusso, si scioglie
     ============================================================ */
  var coda = [], parola = null;
  // invii nascosti dalla regia: non compaiono, e se sono già sul muro spariscono
  function nascosta(id) { return (imp.nascoste || []).indexOf(id) >= 0; }

  function disegnaParola(v) {
    var w = testoCanvas.width, h = testoCanvas.height;
    tctx.clearRect(0, 0, w, h);
    var c = rgb(v.colore);
    var testo = v.emozione;
    var font = function (px) { return px + "px Modak, 'Helvetica Neue', Helvetica, Arial, sans-serif"; };
    var size = h * .085;
    tctx.font = font(size);
    var mis = tctx.measureText(testo).width;
    if (mis > w * .5) { size *= w * .5 / mis; tctx.font = font(size); mis = w * .5; }
    // non sempre al centro: un punto a caso lontano dai bordi
    var x = w * .5 + (Math.random() - .5) * Math.max(0, w * .6 - mis), y = h * (.3 + Math.random() * .4);
    tctx.textAlign = "center"; tctx.textBaseline = "middle";
    // alone del colore scelto, poi il cuore chiaro: si legge su qualunque sfondo
    tctx.shadowColor = css(c); tctx.shadowBlur = size * .4;
    tctx.fillStyle = css(c);
    tctx.fillText(testo, x, y); tctx.fillText(testo, x, y);
    tctx.shadowBlur = size * .08; tctx.shadowColor = css(c, .9);
    tctx.fillStyle = css(chiaro(c, .4));
    tctx.fillText(testo, x, y);
    tctx.shadowBlur = 0;
    caricaTesto();
  }

  function svuotaTesto() { tctx.clearRect(0, 0, testoCanvas.width, testoCanvas.height); caricaTesto(); }

  // durata di un'emozione sul muro (secondi): appare da 0,8 s, versata nel flusso da 3 s, sciolta entro 10 s
  var FINE_PAROLA = 10, PROSSIMA_DOPO = 7.5;
  function aggiornaParola(ora) {
    if (parola) {
      parola.s = (ora - parola.inizio) / 1000 * parola.velocita;
      if (parola.s > FINE_PAROLA) { parola = null; svuotaTesto(); }
    }
    if ((!parola || parola.s > PROSSIMA_DOPO) && coda.length) {
      var v = coda.shift();
      if (nascosta(v.id)) return;
      // con tanti invii in coda il ritmo accelera un po', senza scatti
      parola = { voce: v, inizio: ora, s: 0, velocita: coda.length > 3 ? 1.8 : coda.length > 1 ? 1.35 : 1 };
      disegnaParola(v);
      nuovoColore(rgb(v.colore));
      umore.testo = v.emozione; umore.ef = carattere(v.emozione); umore.forza = 1;
    }
  }

  // le curve dell'emozione: visibile nitida, versata nel flusso, sciolta
  function curveParola() {
    if (!parola) return { overlay: 0, ink: 0, melt: 0, wob: 0 };
    var s = parola.s;
    var overlay = s < .8 ? 0 : s < 2.4 ? liscio((s - .8) / 1.6) : s < 5 ? 1 : 1 - liscio((s - 5) / 3);
    var ink = s < 3 ? 0 : s < 5 ? .1 * liscio((s - 3) / 2) : .1 * (1 - liscio((s - 5) / 3));
    var melt = liscio((s - 4) / 2) * (1 - liscio((s - 8.5) / 1.5));
    return { overlay: overlay, ink: ink, melt: melt, wob: liscio((s - 3.5) / 4) };
  }

  function svuotaCampo() {
    fb.forEach(function (f) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // invio nascosto dalla regia: via dalla chat, dalla coda e, se è sul muro, anche dal campo
  function togliInvio(id) {
    Array.prototype.forEach.call(document.querySelectorAll("#chatLista li"), function (li) { if (li.dataset.id === String(id)) li.remove(); });
    coda = coda.filter(function (v) { return v.id !== id; });
    if (!parola || parola.voce.id !== id) return;
    parola = null;
    umore.forza = 0;
    svuotaTesto();
    svuotaCampo();   // il testo tolto non deve restare come scia
  }

  /* ============================================================
     Fotogramma
     ============================================================ */
  var prima = 0, fps = 60, avvioT = 0;
  function uniformComuni(p, ora, w, h) {
    gl.uniform2f(p.u("uRes"), w, h);
    gl.uniform1f(p.u("uTime"), (ora - avvioT) / 1000);
    gl.uniform1f(p.u("uFt"), ft);
    gl.uniform1f(p.u("uBass"), audio.bass);
    gl.uniform1f(p.u("uMid"), audio.mid);
    gl.uniform1f(p.u("uHigh"), audio.high);
    gl.uniform1f(p.u("uLevel"), audio.level);
    gl.uniform1f(p.u("uTono"), audio.tono);
  }

  function fotogramma(ora) {
    var dt = Math.min(.05, (ora - prima) / 1000 || .016);
    prima = ora;
    fps += (1 / dt - fps) * .05;
    analizza(dt, ora);
    aggiornaParola(ora);
    aggiornaTipo(dt, ora);
    pal.forEach(function (c, i) { for (var j = 0; j < 3; j++) c[j] = verso(c[j], palObiettivo[i][j], dt, 4); });
    var cv = curveParola();

    // 1) campo in feedback
    var da = fb[corrente], a = fb[1 - corrente];
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.viewport(0, 0, fw, fh);
    gl.useProgram(pFeedback);
    uniformComuni(pFeedback, ora, fw, fh);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, da.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texTesto);
    gl.uniform1i(pFeedback.u("uPrev"), 0);
    gl.uniform1i(pFeedback.u("uText"), 1);
    gl.uniform1f(pFeedback.u("uZoom"), par.zoom * umore.zoom);
    gl.uniform1f(pFeedback.u("uSpin"), par.spin * Math.sin(ft / 40 + 1));
    gl.uniform1f(pFeedback.u("uWarp"), par.warp * umore.warp);
    gl.uniform1f(pFeedback.u("uDrift"), par.drift);
    gl.uniform1f(pFeedback.u("uTintaUmore"), umore.tinta);
    gl.uniform1f(pFeedback.u("uBassi"), imp.bassi);
    // mentre l'emozione si scioglie il campo trattiene di più: la sua scia resta visibile
    var decay = par.decay + (.988 - par.decay) * cv.melt;
    gl.uniform1f(pFeedback.u("uDecay"), floatOk ? decay : decay - .01);
    gl.uniform1f(pFeedback.u("uInk"), cv.ink);
    gl.uniform1f(pFeedback.u("uMelt"), cv.melt);
    gl.uniform1fv(pFeedback.u("uW"), par.w);
    gl.uniform3fv(pFeedback.u("uPal"), new Float32Array([].concat.apply([], pal)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    corrente = 1 - corrente;

    // 2) schermo
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(pSchermo);
    uniformComuni(pSchermo, ora, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texTesto);
    gl.uniform1i(pSchermo.u("uFeed"), 0);
    gl.uniform1i(pSchermo.u("uText"), 1);
    gl.uniform1f(pSchermo.u("uKal"), par.kal);
    gl.uniform1f(pSchermo.u("uOverlay"), cv.overlay);
    gl.uniform1f(pSchermo.u("uWob"), cv.wob);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!$("hud").hidden) aggiornaHud();
    requestAnimationFrame(fotogramma);
  }

  /* ============================================================
     Collegamento: legge gli invii nuovi ogni secondo e mezzo
     ============================================================ */
  var accesso = L.accesso();
  var ultimo = null, codice = "", inLinea = false, ultimaRisposta = 0;

  function giro() {
    L.api("live_feed", { accesso: accesso, dopo: ultimo || 0, stato: statoPerRegia() }).then(function (r) {
      if (!r.ok) {
        if (r.errore === "accesso") { L.dimentica(); location.reload(); }
        return;
      }
      inLinea = true; ultimaRisposta = Date.now();
      applicaRegia(r.regia);
      if (r.codice !== codice) { codice = r.codice; mostraQr(); }
      if (ultimo !== null && r.ultimo < ultimo) { ultimo = 0; return; }   // la cache si è svuotata: si riparte
      // al primo giro gli invii già arrivati colorano solo la tavolozza; i nuovi vanno in chat e sul muro
      var voci = r.voci.filter(function (v) { return !nascosta(v.id); });
      if (ultimo === null) voci.slice(-4).forEach(function (v) { nuovoColore(rgb(v.colore)); });
      else voci.forEach(function (v) { aggiungiChat(v); coda.push(v); });
      ultimo = r.ultimo;
    }).catch(function () { inLinea = false; })
      .then(function () { setTimeout(giro, 1500); });
  }

  /* ============================================================
     Regia: applica le impostazioni nuove e rimanda lo stato dello schermo
     ============================================================ */
  var revApplicata = imp.rev || 0;
  var comandiFatti = {};
  (imp.comandi || []).forEach(function (c) { comandiFatti[c.id] = 1; });   // i comandi vecchi non si ripetono

  function applicaRegia(r) {
    if (!r || !(r.rev > revApplicata)) return;
    revApplicata = r.rev;
    var tipoPrima = imp.tipo, autoPrima = imp.auto;
    imp = Object.assign(L.regiaIniziale(), r);
    imp.tipo = clamp(imp.tipo | 0, 0, TIPI.length - 1);
    if (imp.tipo !== tipoPrima || imp.auto !== autoPrima) tipoDal = performance.now();
    scrivi(CHIAVE_REGIA, JSON.stringify(imp));
    $("chat").hidden = !imp.chat.visibile;
    spostabili.chat.posiziona();
    if (codice) { $("qr").hidden = !imp.qr.visibile; spostabili.qr.posiziona(); }
    imp.nascoste.forEach(togliInvio);
    if (audio.vero || imp.audioId) usaIngresso(imp.audioId || "");
    imp.comandi.forEach(function (c) {
      if (comandiFatti[c.id]) return;
      comandiFatti[c.id] = 1;
      if (c.cosa === "prova") invioDiProva();
      if (c.cosa === "pulisci") svuotaCampo();
    });
  }

  function statoPerRegia() {
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    return {
      fps: Math.round(fps), tipo: imp.tipo, tipi: TIPI.map(function (t) { return t.nome; }), coda: coda.length,
      audio: { vero: audio.vero, nome: audio.nome, level: r2(audio.level), mid: r2(audio.mid), high: r2(audio.high), bass: r2(audio.bass) },
      dispositivi: dispositivi.map(function (d) { return { id: d.deviceId, nome: d.label }; }),
      larghezza: innerWidth, altezza: innerHeight,
      umore: umore.testo && umore.forza > .05 ? umore.testo : ""
    };
  }

  // regia aperta nello stesso computer: impostazioni e stato passano subito, senza aspettare il server
  if (L.canale) L.canale.addEventListener("message", function (e) {
    if (avvioT && e.data && e.data.tipo === "regia") applicaRegia(e.data.regia);
  });
  setInterval(function () { if (avvioT && L.canale) L.canale.postMessage({ tipo: "schermo", stato: statoPerRegia() }); }, 500);

  function mostraQr() {
    if (!window.qrcode) return;
    // il QR porta sempre al sito pubblico, anche se lo schermo è aperto da localhost; in demo resta locale
    var link = L.demo ? new URL("./", location.href).href + "?demo" : SITO_LIVE + "?c=" + encodeURIComponent(codice);
    var qr = qrcode(0, "M");
    qr.addData(link); qr.make();
    $("qrCodice").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
    $("qr").title = link;
    $("qr").hidden = !imp.qr.visibile;
    spostabili.qr.posiziona();
  }

  /* ============================================================
     QR e chat: la posizione la decide la regia.
     x e y da 0 a 1 dentro lo schermo (0,0 in alto a sinistra), con un margine dai bordi
     ============================================================ */
  function spostabile(el, chiave) {
    function posiziona() {
      var m = innerWidth * .024, pos = imp[chiave];
      el.style.left = Math.round(m + clamp(pos.x, 0, 1) * (innerWidth - el.offsetWidth - 2 * m)) + "px";
      el.style.top = Math.round(m + clamp(pos.y, 0, 1) * (innerHeight - el.offsetHeight - 2 * m)) + "px";
      // la chat cresce verso il centro dello schermo e si allinea al suo lato
      el.classList.toggle("in-alto", pos.y < .5);
      el.classList.toggle("a-destra", pos.x > .5);
    }
    return { posiziona: posiziona };
  }
  var spostabili = { qr: spostabile($("qr"), "qr"), chat: spostabile($("chat"), "chat") };

  /* ============================================================
     Invio di prova (dalla regia) e tasti dello schermo: F schermo intero, H pannello audio
     ============================================================ */
  var NOMI = ["luna", "kiko", "sara", "dario", "mimì", "tano", "ale", "vale"];
  var COLORI = ["#f0307f", "#ff3b1c", "#f8893c", "#ffd23f", "#3ddc97", "#22c3ee", "#5b5ff0", "#b04cf0"];
  var PROVE = ["gioia", "libertà", "mare dentro", "desiderio", "pace", "voglia di ballare", "nostalgia", "stupore", "calore", "felice"];
  var idProva = -1;
  function invioDiProva() {
    var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
    var v = { id: idProva--, nickname: pick(NOMI), colore: pick(COLORI), emozione: pick(PROVE) };
    aggiungiChat(v);
    coda.push(v);
  }

  function schermoIntero() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(function () {});
  }

  document.addEventListener("keydown", function (e) {
    if (!avvioT || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === "f") schermoIntero();
    if (k === "h") $("hud").hidden = !$("hud").hidden;
  });

  function barra(v) { return "<b style=\"width:" + Math.round(clamp(v, 0, 1) * 120) + "px\"></b>"; }
  function aggiornaHud() {
    $("hud").innerHTML =
      "fps     " + Math.round(fps) + (floatOk ? "" : "  (8 bit)") + "\n" +
      "audio   " + audio.nome + "\n" +
      "volume  " + barra(audio.level) + "\n" +
      "medi    " + barra(audio.mid) + "\n" +
      "alti    " + barra(audio.high) + "\n" +
      "bassi   " + barra(audio.bass) + "  sensibilità ×" + imp.bassi + "\n" +
      "timbro  " + barra(audio.tono) + "\n" +
      "visuals " + TIPI[imp.tipo].nome + (imp.auto ? " (giro automatico)" : "") + "  ×" + imp.velocita + "\n" +
      "umore   " + (umore.testo && umore.forza > .05 ? umore.testo + " " + barra(umore.forza) : "—") + "\n" +
      "in coda " + coda.length + "\n" +
      "rete    " + (L.demo ? "demo" : inLinea ? "ok (" + Math.round((Date.now() - ultimaRisposta) / 1000) + " s fa)" : "NON COLLEGATO");
  }

  // il cursore sparisce quando il mouse sta fermo
  var tCursore = 0;
  document.addEventListener("mousemove", function () {
    document.body.style.cursor = "";
    clearTimeout(tCursore);
    tCursore = setTimeout(function () { document.body.style.cursor = "none"; }, 2000);
  });

  /* ============================================================
     Avvio
     ============================================================ */
  if (L.demo) $("avvioTesto").textContent = "Modalità demo: apri live/?demo e live/regia.html?demo in altre schede.";
  else if (!accesso) { $("avvioTesto").textContent = "Apri lo schermo dal link segreto visuals. Lo crei dal foglio: menu bolla® → Crea link segreto visuals."; $("avvia").hidden = true; }

  $("avvioModulo").addEventListener("submit", function (e) {
    e.preventDefault();
    $("avvia").disabled = true;
    $("avvioErrore").textContent = "";
    var verifica = L.demo ? Promise.resolve({ ok: true }) : L.api("live_feed", { accesso: accesso, dopo: 1e9 });
    verifica.then(function (r) {
      if (!r.ok) throw new Error(r.messaggio || "Link non valido.");
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
      return avviaAudio();
    }).then(function (ok) {
      $("avvio").hidden = true;
      if (navigator.wakeLock) navigator.wakeLock.request("screen").catch(function () {});
      // il testo sul muro si disegna nel canvas: il carattere deve essere già caricato
      return (document.fonts ? document.fonts.load("40px Modak").catch(function () {}) : Promise.resolve());
    }).then(function () {
      dimensiona();
      avvioT = prima = tipoDal = performance.now();
      $("chat").hidden = !imp.chat.visibile;
      spostabili.chat.posiziona();
      addEventListener("resize", function () { dimensiona(); spostabili.qr.posiziona(); spostabili.chat.posiziona(); });
      giro();
      requestAnimationFrame(fotogramma);
    }).catch(function (err) {
      $("avvia").disabled = false;
      $("avvioErrore").textContent = err.message === "Failed to fetch" ? "Connessione assente." : err.message;
    });
  });
})();
