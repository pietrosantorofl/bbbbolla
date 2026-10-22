/**
 * bolla® — backend dei pass gratuiti (Google Apps Script + Google Sheet).
 *
 * Due modi per avere un pass (1 persona = 1 pass = 1 QR):
 *   - INVITO: link unlisted bbbbolla.it/?invito=<token>. Il pass parte subito via email.
 *   - GRUPPO: chi arriva senza invito crea un gruppo e gira il link bbbbolla.it/?gruppo=<id>.
 *     Ognuno si registra con la propria email e conferma aprendo il link personale ricevuto.
 *     Quando tutti i membri hanno confermato, i pass si attivano e ognuno riceve il suo QR.
 *
 * Il QR contiene la "chiave" del pass: stessa chiave del link personale bbbbolla.it/?pass=<chiave>.
 *
 * Fogli (creati da setup()):
 *   Serate  id | titolo | data | capienza | aperta
 *   Inviti  token | etichetta | serata | max | scadenza | attivo | creato
 *   Gruppi  id | serata | creato | scadenza | capogruppo | stato | completato
 *   Pass    creato | serata | tipo | rif | nome | cognome | email | email_norm | chiave | codice | stato | confermato | checkin | newsletter | checkin_da
 *   Attesa  creato | serata | nome | cognome | email | email_norm | arrivato_da | newsletter | note
 *
 * Web App: POST body JSON { action, ... } con action = stato | crea_gruppo | unisciti | invito | pass
 */

var CONFIG = {
  nomeMittente: 'bolla®',
  replyTo: '',                    // es. 'ciao@bbbbolla.it' (vuoto = account Google che pubblica lo script)
  sito: 'https://bbbbolla.it',
  luogo: 'MONO, Via Gornalunga 12, 95129 Catania CT',   // compare nelle email
  orario: 'dalle 20:00',          // compare nelle email
  newsletterObbligatoria: true,   // deve coincidere con newsletterObbligatoria in js/config.js
  dimensioneGruppo: 3,
  oreValiditaGruppo: 48,          // dopo, un gruppo incompleto scade e libera i posti
  oreConferma: 12,                // dopo, un membro che non ha confermato perde il posto nel gruppo
  minutiTraReinvii: 15,           // anti-spam: ogni quanto si può rimandare il link alla stessa persona

  /* anti-bot */
  secondiMinimiModulo: 4,         // un modulo inviato prima di N secondi dall'apertura viene respinto
  oreValiditaModulo: 2,           // dopo, il modulo va ricaricato
  maxRegistrazioniAlMinuto: 20,   // tetto globale: oltre, le richieste vengono respinte per un minuto

  /* email temporanee: lista pubblica aggiornata (~10.000 domini) + controllo che il dominio riceva posta */
  listaUsaEGetta: 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf',
  controlloDominio: true
};

var TZ = 'Europe/Rome';
var COLONNE = {
  Serate: ['id', 'titolo', 'data', 'capienza', 'aperta'],
  Inviti: ['token', 'etichetta', 'serata', 'max', 'scadenza', 'attivo', 'creato'],
  Gruppi: ['id', 'serata', 'creato', 'scadenza', 'capogruppo', 'stato', 'completato'],
  Pass: ['creato', 'serata', 'tipo', 'rif', 'nome', 'cognome', 'email', 'email_norm', 'chiave', 'codice', 'stato', 'confermato', 'checkin', 'newsletter', 'checkin_da'],
  Attesa: ['creato', 'serata', 'nome', 'cognome', 'email', 'email_norm', 'arrivato_da', 'newsletter', 'note']
};
var COLONNE_TESTO = ['id', 'data', 'serata', 'rif', 'chiave', 'codice', 'capogruppo', 'token', 'email', 'email_norm', 'nome', 'cognome'];
// riserva se la lista online non è raggiungibile
var DOMINI_USA_E_GETTA = ['mailinator.com', 'yopmail.com', 'yopmail.fr', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com',
  'grr.la', '10minutemail.com', 'temp-mail.org', 'tempmail.com', 'tempmail.net', 'trashmail.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'throwawaymail.com', 'mohmal.com', 'emailondeck.com', 'mintemail.com', 'tempr.email', 'fakeinbox.com', 'mailnesia.com',
  'tmail.ws', 'tmpmail.org', 'mail.tm', 'spamgourmet.com', 'jetable.org', 'mailcatch.com', 'moakt.com', 'burnermail.io'];
// provider noti: niente controllo DNS
var DOMINI_NOTI = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.it', 'outlook.com', 'outlook.it', 'live.com', 'live.it',
  'yahoo.com', 'yahoo.it', 'icloud.com', 'me.com', 'libero.it', 'virgilio.it', 'tiscali.it', 'alice.it', 'tim.it', 'email.it',
  'fastwebnet.it', 'proton.me', 'protonmail.com', 'pec.it'];

/* ============================================================
   Setup e menu del foglio
   ============================================================ */

function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(COLONNE).forEach(function (nome) {
    var sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    if (sh.getLastRow() === 0) {
      sh.appendRow(COLONNE[nome]);
      sh.setFrozenRows(1);
      // id e chiavi come testo: "1e50..." o "0123" non devono diventare numeri
      COLONNE[nome].forEach(function (c, i) {
        if (COLONNE_TESTO.indexOf(c) >= 0) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      });
    }
  });
  var serate = ss.getSheetByName('Serate');
  if (serate.getLastRow() === 1) {
    serate.appendRow(['2026-10-30', 'bolla® — Ritmi in Colombia, Selva Cosmica, Franzuà', '2026-10-30', '150', 'TRUE']);
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('bolla®')
    .addItem('Crea link invito…', 'creaInvitoDaMenu')
    .addItem('Esporta newsletter', 'esportaNewsletter')
    .addSeparator()
    .addItem('Crea PIN staff (app ingresso)', 'creaPinStaffDaMenu')
    .addItem('Attiva sveglia automatica', 'attivaSvegliaDaMenu')
    .addToUi();
}

// Dal menu: Google chiede qui le autorizzazioni nuove (la pagina della Web App non può farlo).
function attivaSvegliaDaMenu() {
  SpreadsheetApp.getUi().alert('Sveglia automatica: ' + installaSveglia_());
}

function creaInvitoDaMenu() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt('Nuovo invito', 'Nome del link (es. "Artisti", "Amici di Marco"):', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var r2 = ui.prompt('Nuovo invito', 'Quanti pass al massimo con questo link?', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var max = Math.floor(Number(r2.getResponseText()));
  if (!(max > 0)) { ui.alert('Numero non valido.'); return; }
  var token = token_(12);
  appendi_('Inviti', { token: token, etichetta: r1.getResponseText().trim(), serata: '', max: max, scadenza: '', attivo: 'TRUE', creato: new Date() });
  ui.alert('Link invito creato', CONFIG.sito + '/?invito=' + token +
    '\n\nVale per tutte le serate. Per limitarlo a una serata scrivi il suo id nella colonna "serata". ' +
    'Per spegnerlo scrivi FALSE in "attivo".', ui.ButtonSet.OK);
}

/* ============================================================
   HTTP
   ============================================================ */

// Aprire l'URL della Web App da browser: crea i fogli se mancano e mostra lo stato.
// La prima volta, da proprietario, Google chiede anche le autorizzazioni.
function doGet() {
  setup();
  var sveglia = installaSveglia_();
  var ss = SpreadsheetApp.getActive();
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:40px auto;padding:0 16px">' +
    '<h1 style="font-size:40px;margin:0">bolla&reg;</h1>' +
    '<p style="font-size:18px">Backend dei pass attivo.</p>' +
    '<p>Fogli: ' + Object.keys(COLONNE).map(function (n) { return ss.getSheetByName(n) ? n + ' ✓' : n + ' ✗'; }).join(' · ') + '</p>' +
    '<p>Email ancora inviabili oggi: ' + MailApp.getRemainingDailyQuota() + '</p>' +
    '<p>Sveglia automatica: ' + sveglia + '</p></div>';
  return HtmlService.createHtmlOutput(html).setTitle('bolla® backend');
}

function doPost(e) {
  var d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_(errore_('dati', 'Richiesta non valida.'));
  }
  try {
    switch (d.action) {
      case 'stato': return json_(azioneStato_(d));
      case 'crea_gruppo': return json_(azioneCreaGruppo_(d));
      case 'unisciti': return json_(azioneUnisciti_(d));
      case 'invito': return json_(azioneInvito_(d));
      case 'pass': return json_(azionePass_(d));
      case 'lista_attesa': return json_(azioneListaAttesa_(d));
      case 'staff_lista': return json_(azioneStaffLista_(d));
      case 'staff_checkin': return json_(azioneStaffCheckin_(d));
    }
    return json_(errore_('dati', 'Azione sconosciuta.'));
  } catch (err) {
    console.error(err && err.stack || err);
    return json_(errore_('server', 'Errore temporaneo. Riprova tra poco.'));
  }
}

/* ---------- sveglia ----------
 * Apps Script "si addormenta" dopo qualche minuto senza richieste e la prima risposta
 * può impiegare oltre 20 secondi. Un trigger ogni 5 minuti tiene caldi script, cache e foglio.
 * Lo installa doGet: basta aprire l'URL della Web App da proprietario. */
function sveglia() {
  CacheService.getScriptCache().get('sveglia');
  aggiornamentiUnaTantum_();
  carica_();
  dominiUsaEGetta_();
}

// Modifiche ai dati da fare una volta sola: partono con la sveglia (ogni 5 minuti), ognuna segnata
// nelle proprietà dello script così non si ripete. Poi la riga puoi cambiarla a mano nel foglio.
function aggiornamentiUnaTantum_() {
  var props = PropertiesService.getScriptProperties();
  var db = carica_();
  [
    { id: 'capienza-2026-10-30-300', fai: function () {
      var s = trova_(db.Serate, 'id', '2026-10-30');
      if (s) aggiorna_(db.Serate, s, { capienza: 300 });
    } },
    // i token nascono qui sul server: nel codice pubblico non c'è nessun link valido
    { id: 'inviti-2026-10-30-organizzatori', fai: function () {
      ['Pietro', 'Dario', 'Fabrizio', 'Tommaso'].forEach(function (nome) {
        appendi_('Inviti', { token: token_(12), etichetta: nome, serata: '2026-10-30', max: 10, scadenza: '', attivo: 'TRUE', creato: new Date() });
      });
    } }
  ].forEach(function (a) {
    if (props.getProperty('fatto:' + a.id)) return;
    a.fai();
    props.setProperty('fatto:' + a.id, new Date().toISOString());
  });
}

function installaSveglia_() {
  var esiste = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'sveglia'; });
  if (!esiste) ScriptApp.newTrigger('sveglia').timeBased().everyMinutes(5).create();
  return esiste ? 'attiva ✓' : 'attivata ora ✓';
}

/* ============================================================
   Azioni
   ============================================================ */

// Disponibilità della serata + validità di invito o gruppo (sola lettura)
function azioneStato_(d) {
  var db = carica_();
  var s = serata_(db, d.serata);
  if (!s) return errore_('serata', 'Serata non trovata.');
  // capienza e posti rimasti non escono mai dal backend: solo se c'è posto per un gruppo o per una persona
  var liberi = disponibili_(db, s);
  var out = { ok: true, modulo: tokenModulo_(), dimensioneGruppo: CONFIG.dimensioneGruppo,
    serata: { aperta: serataAperta_(s), postiGruppo: liberi >= CONFIG.dimensioneGruppo, postiSingolo: liberi >= 1 } };
  if (d.invito) {
    var inv = invito_(db, d.invito, s);
    // il nome dell'invito resta nel foglio: al pubblico basta sapere che è valido
    out.invito = inv.errore ? { valido: false, messaggio: inv.messaggio } : { valido: true };
  }
  if (d.gruppo) {
    var g = gruppo_(db, d.gruppo);
    if (!g || g.serata !== s.id) out.gruppo = { valido: false, messaggio: 'Questo link di gruppo non esiste.' };
    else out.gruppo = pubblicoGruppo_(db, g, null);
  }
  return out;
}

function azioneCreaGruppo_(d) {
  return registrazione_(d, function (p) {
    var db = carica_();
    var s = serata_(db, d.serata);
    var chiusa = controllaSerata_(s);
    if (chiusa) return chiusa;
    var dup = duplicato_(db, s, p);
    if (dup) return dup;
    if (disponibili_(db, s) < CONFIG.dimensioneGruppo) return errore_('esaurito', 'Non ci sono più posti per un gruppo da ' + CONFIG.dimensioneGruppo + '.');
    if (!quotaOk_()) return erroreQuota_();

    var now = new Date();
    var scadenza = new Date(Math.min(now.getTime() + CONFIG.oreValiditaGruppo * 36e5, fineSerata_(s).getTime()));
    var g = { id: token_(10), serata: s.id, creato: now, scadenza: scadenza, capogruppo: '', stato: 'aperto', completato: '' };
    var pass = nuovoPass_(db, s, p, 'gruppo', g.id, 'da_confermare');
    g.capogruppo = pass.chiave;
    appendi_('Gruppi', g);
    appendi_('Pass', pass);
    return { ok: true, gruppo: { id: g.id, link: linkGruppo_(g.id) }, _email: function () { emailConferma_(pass, s, g, true); } };
  });
}

function azioneUnisciti_(d) {
  return registrazione_(d, function (p) {
    var db = carica_();
    var s = serata_(db, d.serata);
    var chiusa = controllaSerata_(s);
    if (chiusa) return chiusa;
    var g = gruppo_(db, d.gruppo);
    if (!g || g.serata !== s.id) return errore_('gruppo', 'Questo link di gruppo non esiste.');
    var st = statoGruppo_(db, g);
    if (st.stato !== 'aperto') return errore_('gruppo', messaggioGruppoChiuso_(st.stato));
    if (st.attivi.length >= CONFIG.dimensioneGruppo) return errore_('pieno', 'Il gruppo è già al completo.');
    var dup = duplicato_(db, s, p);
    if (dup) return dup;
    if (!quotaOk_()) return erroreQuota_();

    var pass = nuovoPass_(db, s, p, 'gruppo', g.id, 'da_confermare');
    appendi_('Pass', pass);
    return { ok: true, _email: function () { emailConferma_(pass, s, g, false); } };
  });
}

function azioneInvito_(d) {
  return registrazione_(d, function (p) {
    var db = carica_();
    var s = serata_(db, d.serata);
    var chiusa = controllaSerata_(s);
    if (chiusa) return chiusa;
    var inv = invito_(db, d.invito, s);
    if (inv.errore) return inv;
    var dup = duplicato_(db, s, p);
    if (dup) return dup;
    if (disponibili_(db, s) < 1) return errore_('esaurito', 'Pass esauriti. Seguici per le prossime serate.');
    if (!quotaOk_()) return erroreQuota_();

    // il QR arriva solo via email: così chi lo usa possiede davvero quell'indirizzo
    var pass = nuovoPass_(db, s, p, 'invito', inv.token, 'confermato');
    pass.confermato = new Date();
    appendi_('Pass', pass);
    return { ok: true, _email: function () { emailPass_(pass, s); } };
  });
}

// Controlli comuni a ogni registrazione: modulo (timer + firma), dati, tetto al minuto, lock.
function registrazione_(d, fn, cognomeFacoltativo) {
  var bot = controllaModulo_(d.modulo);
  if (bot) return bot;
  if (d.website) return errore_('modulo', 'Richiesta non valida.'); // honeypot compilato
  var p = persona_(d, cognomeFacoltativo);
  if (p.errore) return p;
  return conLock_(function () {
    if (tettoRaggiunto_()) return errore_('occupato', 'In questo momento stanno arrivando troppe registrazioni. Riprova tra un minuto.');
    var out = fn(p);
    if (out && out.ok) {
      contaRegistrazione_();
      segnaModuloUsato_(d.modulo);
    }
    return out;
  });
}

// Lista d'attesa: a posti esauriti si lasciano nome ed email. Nessun pass: decidi tu chi richiamare
// (per esempio mandando un link invito). Chi ha già un pass vivo per la serata viene rimandato al suo link.
function azioneListaAttesa_(d) {
  return registrazione_(d, function (p) {
    var db = carica_();
    var s = serata_(db, d.serata);
    if (!s) return errore_('serata', 'Serata non trovata.');
    if (new Date() > fineSerata_(s)) return errore_('chiusa', 'Questa serata è passata.');
    var dup = duplicato_(db, s, p);
    if (dup) return dup;
    var gia = db.Attesa.some(function (r) { return r.serata === s.id && r.email_norm === p.emailNorm; });
    if (gia) return errore_('attesa', 'Sei già in lista d\'attesa per questa serata: ti scriviamo noi se si libera un posto.');
    var posizione = db.Attesa.filter(function (r) { return r.serata === s.id; }).length + 1;
    var riga = {
      creato: new Date(), serata: s.id, nome: p.nome, cognome: p.cognome, email: p.email, email_norm: p.emailNorm,
      arrivato_da: d.invito ? 'invito ' + pulisci_(d.invito, 20) : 'sito', newsletter: p.newsletter ? 'TRUE' : 'FALSE', note: ''
    };
    appendi_('Attesa', riga);
    return { ok: true, posizione: posizione, _email: quotaOk_() ? function () { emailAttesa_(riga, s); } : null };
  }, true);
}

// Pagina personale: aprirla dal link dell'email conferma l'indirizzo.
function azionePass_(d) {
  var chiave = String(d.chiave || '');
  if (!/^[a-f0-9]{24}$/.test(chiave)) return errore_('pass', 'Link non valido.');

  return conLock_(function () {
    var db = carica_();
    var pass = trova_(db.Pass, 'chiave', chiave);
    if (!pass) return errore_('pass', 'Link non valido.');
    var s = serata_(db, pass.serata);
    var avvisi = null;

    if (pass.tipo === 'gruppo' && pass.stato === 'da_confermare') {
      var g = gruppo_(db, pass.rif);
      var st = statoGruppo_(db, g);
      var scaduto = oreDa_(pass.creato) > CONFIG.oreConferma;
      if (st.stato !== 'aperto') {
        avvisi = messaggioGruppoChiuso_(st.stato);
      } else if (scaduto && st.attivi.length >= CONFIG.dimensioneGruppo) {
        avvisi = 'Hai confermato troppo tardi: il tuo posto nel gruppo è stato preso da qualcun altro.';
      } else if (pass.chiave === g.capogruppo && disponibili_(db, s) < CONFIG.dimensioneGruppo) {
        // la conferma del capogruppo blocca i posti per tutto il gruppo
        avvisi = 'Nel frattempo i posti sono finiti: non è più possibile formare un gruppo per questa serata.';
      } else {
        aggiorna_(db.Pass, pass, { stato: 'confermato', confermato: new Date() });
      }
    }

    var dopo = null;
    var g2 = pass.tipo === 'gruppo' ? gruppo_(db, pass.rif) : null;
    if (g2) {
      var st2 = statoGruppo_(db, g2);
      if (st2.stato === 'aperto' && st2.confermati.length === CONFIG.dimensioneGruppo) {
        aggiorna_(db.Gruppi, g2, { stato: 'completo', completato: new Date() });
        var membri = st2.confermati;
        dopo = function () {
          membri.forEach(function (m) {
            try { emailPass_(m, s); } catch (err) { console.error('Email pass non inviata a ' + m.email + ': ' + err); }
          });
        };
      }
    }

    var attivo = pass.stato === 'confermato' && (pass.tipo === 'invito' || (g2 && g2.stato === 'completo'));
    return {
      ok: true,
      avviso: avvisi,
      pass: {
        nome: pass.nome, cognome: pass.cognome, codice: pass.codice, tipo: pass.tipo,
        stato: pass.stato, attivo: !!attivo, serata: s.id, checkin: !!pass.checkin
      },
      qr: attivo ? pass.chiave : null,
      gruppo: g2 ? pubblicoGruppo_(db, g2, pass.chiave) : null,
      _email: dopo
    };
  });
}

/* ============================================================
   Regole
   ============================================================ */

function persona_(d, cognomeFacoltativo) {
  var nome = pulisci_(d.nome, 60);
  var cognome = pulisci_(d.cognome, 60);
  var email = String(d.email || '').trim().toLowerCase().slice(0, 120);
  if (!nome) return errore_('dati', 'Inserisci il tuo nome.');
  if (!cognome && !cognomeFacoltativo) return errore_('dati', 'Inserisci nome e cognome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return errore_('dati', "Controlla l'indirizzo email.");
  var erroreEmail = controllaDominio_(email.split('@')[1]);
  if (erroreEmail) return erroreEmail;
  if (d.privacy !== true) return errore_('dati', 'Serve il consenso privacy.');
  var newsletter = d.newsletter === true;
  if (CONFIG.newsletterObbligatoria && !newsletter) return errore_('dati', 'Il pass gratuito è riservato agli iscritti alla newsletter di bolla®.');
  return { nome: nome, cognome: cognome, email: email, emailNorm: normEmail_(email), newsletter: newsletter };
}

// Stessa persona = stessa email normalizzata (Gmail ignora punti e +etichetta).
// Non rivela mai il codice: rimanda il link personale al vero proprietario dell'email.
function duplicato_(db, s, p) {
  var esistente = null;
  db.Pass.forEach(function (r) {
    if (r.serata === s.id && r.email_norm === p.emailNorm && passVivo_(db, r)) esistente = r;
  });
  if (!esistente) return null;
  reinvia_(db, esistente, s);
  return errore_('duplicato', 'Questa email è già registrata per la serata. Ti abbiamo rimandato il link personale: controlla la posta (anche lo spam).');
}

// Un pass "vivo" occupa la persona: confermato, oppure in attesa dentro un gruppo ancora aperto.
function passVivo_(db, r) {
  if (r.stato === 'annullato') return false;
  if (r.tipo === 'invito') return r.stato === 'confermato';
  var g = gruppo_(db, r.rif);
  if (!g) return false;
  var st = statoGruppo_(db, g);
  if (st.stato === 'completo') return r.stato === 'confermato';
  if (st.stato !== 'aperto') return false;
  return st.attivi.indexOf(r) >= 0;
}

function statoGruppo_(db, g) {
  var membri = db.Pass.filter(function (r) { return r.tipo === 'gruppo' && r.rif === g.id && r.stato !== 'annullato'; });
  var attivi = membri.filter(function (r) { return r.stato === 'confermato' || oreDa_(r.creato) <= CONFIG.oreConferma; });
  var confermati = membri.filter(function (r) { return r.stato === 'confermato'; });
  var capo = membri.filter(function (r) { return r.chiave === g.capogruppo; })[0];
  var stato = g.stato;
  if (stato === 'aperto') {
    if (new Date() > data_(g.scadenza)) stato = 'scaduto';
    else if (!capo || attivi.indexOf(capo) < 0) stato = 'scaduto';
  }
  return { stato: stato, membri: membri, attivi: attivi, confermati: confermati, capoConfermato: !!capo && capo.stato === 'confermato' };
}

function messaggioGruppoChiuso_(stato) {
  if (stato === 'completo') return 'Il gruppo è già completo.';
  if (stato === 'annullato') return 'Questo gruppo è stato annullato.';
  return 'Questo gruppo è scaduto prima di essere completato. Puoi crearne uno nuovo.';
}

// Posti occupati: pass su invito + gruppi completi o con capogruppo confermato (bloccano tutti i posti del gruppo)
function disponibili_(db, s) {
  var usati = 0;
  db.Pass.forEach(function (r) {
    if (r.serata === s.id && r.tipo === 'invito' && r.stato === 'confermato') usati++;
  });
  db.Gruppi.forEach(function (g) {
    if (g.serata !== s.id) return;
    var st = statoGruppo_(db, g);
    if (st.stato === 'completo' || (st.stato === 'aperto' && st.capoConfermato)) usati += CONFIG.dimensioneGruppo;
  });
  return Math.max(0, s.capienza - usati);
}

function invito_(db, token, s) {
  var inv = trova_(db.Inviti, 'token', String(token || ''));
  var nonValido = errore_('invito', 'Questo invito non è valido o è scaduto.');
  if (!inv || !vero_(inv.attivo)) return nonValido;
  if (inv.serata && inv.serata !== s.id) return nonValido;
  if (inv.scadenza && new Date() > data_(inv.scadenza)) return nonValido;
  var usati = db.Pass.filter(function (r) { return r.tipo === 'invito' && r.rif === inv.token && r.stato === 'confermato'; }).length;
  if (usati >= Number(inv.max)) return errore_('invito', 'I pass di questo invito sono finiti.');
  return inv;
}

function controllaSerata_(s) {
  if (!s) return errore_('serata', 'Serata non trovata.');
  if (!serataAperta_(s)) return errore_('chiusa', 'Le prenotazioni per questa serata sono chiuse.');
  return null;
}

function serataAperta_(s) {
  return vero_(s.aperta) && new Date() <= fineSerata_(s);
}

function pubblicoGruppo_(db, g, chiaveMia) {
  var st = statoGruppo_(db, g);
  var capo = st.membri.filter(function (r) { return r.chiave === g.capogruppo; })[0];
  return {
    valido: true,
    id: g.id,
    link: linkGruppo_(g.id),
    stato: st.stato,
    dimensione: CONFIG.dimensioneGruppo,
    capogruppo: capo ? capo.nome : '',
    scadenza: data_(g.scadenza).toISOString(),
    confermati: st.confermati.length,
    // solo nome + iniziale: niente email né cognomi completi
    membri: st.attivi.map(function (r) {
      return { nome: r.nome + ' ' + r.cognome.charAt(0) + '.', confermato: r.stato === 'confermato', tu: r.chiave === chiaveMia };
    })
  };
}

function nuovoPass_(db, s, p, tipo, rif, stato) {
  return {
    creato: new Date(), serata: s.id, tipo: tipo, rif: rif,
    nome: p.nome, cognome: p.cognome, email: p.email, email_norm: p.emailNorm,
    chiave: token_(24), codice: nuovoCodice_(db), stato: stato, confermato: '', checkin: '', newsletter: p.newsletter ? 'TRUE' : 'FALSE'
  };
}

function reinvia_(db, pass, s) {
  var cache = CacheService.getScriptCache();
  var k = 'reinvio:' + pass.chiave;
  if (cache.get(k)) return;
  cache.put(k, '1', CONFIG.minutiTraReinvii * 60);
  var attivo = pass.tipo === 'invito' || statoGruppo_(db, gruppo_(db, pass.rif)).stato === 'completo';
  try {
    if (attivo) emailPass_(pass, s);
    else emailConferma_(pass, s, null, false);
  } catch (err) {
    console.error('Reinvio non riuscito: ' + err);
  }
}

/* ============================================================
   Staff: verifica dei QR all'ingresso (pagina bbbbolla.it/staff.html)
   Accesso con un PIN di 8 cifre creato dal menu del foglio. Rigenerarlo disattiva il precedente.
   ============================================================ */

function creaPinStaffDaMenu() {
  var ui = SpreadsheetApp.getUi();
  var vecchio = PropertiesService.getScriptProperties().getProperty('PIN_STAFF');
  if (vecchio) {
    var r = ui.alert('PIN staff', 'Esiste già un PIN. Crearne uno nuovo disattiva quello vecchio su tutti i telefoni. Continuo?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  var pin = '';
  var hex = token_(32);
  for (var i = 0; i < 8; i++) pin += String(parseInt(hex.substr(i * 4, 4), 16) % 10);
  PropertiesService.getScriptProperties().setProperty('PIN_STAFF', pin);
  ui.alert('PIN staff', 'Nuovo PIN: ' + pin + '\n\nApri ' + CONFIG.sito + '/staff.html sul telefono di chi sta alla porta e inseriscilo.', ui.ButtonSet.OK);
}

// PIN sbagliato: risposta rallentata, così provarli tutti richiederebbe mesi
function controllaPin_(pin) {
  var giusto = PropertiesService.getScriptProperties().getProperty('PIN_STAFF');
  if (!giusto) return errore_('pin', 'PIN staff non ancora creato: nel foglio usa il menu bolla® → Crea PIN staff.');
  if (String(pin || '') !== giusto) {
    Utilities.sleep(1500);
    return errore_('pin', 'PIN sbagliato.');
  }
  return null;
}

// Un pass fa entrare se: confermato, non annullato e (su invito, oppure gruppo completo)
function passAttivo_(db, r) {
  if (r.stato !== 'confermato') return false;
  if (r.tipo === 'invito') return true;
  var g = gruppo_(db, r.rif);
  return !!g && g.stato === 'completo';
}

function hashChiave_(chiave) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, chiave).map(function (b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function quandoEntrato_(r) {
  if (!r.checkin) return null;
  return r.checkin instanceof Date ? r.checkin.toISOString() : String(r.checkin);
}

// Lista dei pass attivi della serata. Al posto della chiave c'è il suo hash: il telefono riconosce
// subito il QR scansionato, ma se lo perdi nessuno può ricavarne i QR.
function azioneStaffLista_(d) {
  var no = controllaPin_(d.pin);
  if (no) return no;
  var db = carica_();
  var s = serata_(db, d.serata);
  if (!s) return errore_('serata', 'Serata non trovata.');
  var pass = db.Pass.filter(function (r) { return r.serata === s.id && passAttivo_(db, r); }).map(function (r) {
    return { h: hashChiave_(r.chiave), nome: r.nome, cognome: r.cognome, codice: r.codice, tipo: r.tipo, gruppo: r.tipo === 'gruppo' ? r.rif : '', dentro: quandoEntrato_(r) };
  });
  return { ok: true, serata: { id: s.id, titolo: s.titolo, capienza: s.capienza }, pass: pass, aggiornato: new Date().toISOString() };
}

function azioneStaffCheckin_(d) {
  var no = controllaPin_(d.pin);
  if (no) return no;
  return conLock_(function () {
    var db = carica_();
    var chiave = String(d.chiave || '').trim().toLowerCase();
    var codice = String(d.codice || '').trim().toUpperCase();
    var r = /^[a-f0-9]{24}$/.test(chiave) ? trova_(db.Pass, 'chiave', chiave)
      : /^BOL-[A-Z0-9]{5}$/.test(codice) ? trova_(db.Pass, 'codice', codice) : null;
    if (!r) return { ok: true, esito: 'sconosciuto' };
    var info = { nome: r.nome, cognome: r.cognome, codice: r.codice, tipo: r.tipo, serata: r.serata };
    if (r.serata !== String(d.serata)) return { ok: true, esito: 'altra_serata', pass: info };
    if (r.stato === 'annullato') return { ok: true, esito: 'annullato', pass: info };
    if (!passAttivo_(db, r)) return { ok: true, esito: 'non_attivo', pass: info };
    var gia = quandoEntrato_(r);
    var da = gia ? r.checkin_da : pulisci_(d.dispositivo, 24);
    if (!gia) aggiorna_(db.Pass, r, { checkin: new Date(), checkin_da: da });
    var gruppo = r.tipo === 'gruppo' ? db.Pass.filter(function (m) { return m.rif === r.rif && m.tipo === 'gruppo' && passAttivo_(db, m); }).map(function (m) {
      return { nome: m.nome + ' ' + m.cognome, dentro: !!quandoEntrato_(m), tu: m === r };
    }) : null;
    return { ok: true, esito: gia ? 'gia_entrato' : 'entrato', quando: gia, da: da || '', pass: info, gruppo: gruppo };
  });
}

/* ============================================================
   Anti-bot
   ============================================================ */

// Il server firma l'ora in cui consegna il modulo (azione "stato").
// All'invio verifica firma ed età: un bot deve chiedere un modulo nuovo e aspettare ogni volta.
function tokenModulo_() {
  var base = Date.now() + '.' + token_(8); // parte casuale: moduli diversi anche nello stesso millisecondo
  return base + '.' + firma_(base);
}

function controllaModulo_(tok) {
  var parti = String(tok || '').split('.');
  if (parti.length !== 3 || firma_(parti[0] + '.' + parti[1]) !== parti[2]) return errore_('modulo', 'Sessione non valida. Ricarica la pagina e riprova.');
  var secondi = (Date.now() - Number(parti[0])) / 1000;
  if (secondi < CONFIG.secondiMinimiModulo) return errore_('veloce', 'Hai fatto prestissimo! Ricontrolla i dati e invia di nuovo tra qualche secondo.');
  if (secondi > CONFIG.oreValiditaModulo * 3600) return errore_('modulo', 'La pagina è aperta da troppo tempo. Ricaricala e riprova.');
  if (CacheService.getScriptCache().get('modulo:' + parti[2])) return errore_('modulo', 'Questo modulo è già stato inviato. Ricarica la pagina per una nuova registrazione.');
  return null;
}

function segnaModuloUsato_(tok) {
  var firma = String(tok).split('.')[2];
  CacheService.getScriptCache().put('modulo:' + firma, '1', Math.min(21600, CONFIG.oreValiditaModulo * 3600));
}

function firma_(testo) {
  var props = PropertiesService.getScriptProperties();
  var segreto = props.getProperty('SEGRETO');
  if (!segreto) {
    segreto = token_(64);
    props.setProperty('SEGRETO', segreto);
  }
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(testo, segreto)).replace(/=+$/, '').slice(0, 22);
}

function chiaveMinuto_() {
  return 'registrazioni:' + Math.floor(Date.now() / 60000);
}

function tettoRaggiunto_() {
  return Number(CacheService.getScriptCache().get(chiaveMinuto_()) || 0) >= CONFIG.maxRegistrazioniAlMinuto;
}

function contaRegistrazione_() {
  var cache = CacheService.getScriptCache();
  var k = chiaveMinuto_();
  cache.put(k, String(Number(cache.get(k) || 0) + 1), 120);
}

/* ============================================================
   Email temporanee e domini inesistenti
   ============================================================ */

function controllaDominio_(dominio) {
  if (DOMINI_NOTI.indexOf(dominio) >= 0) return null;
  var lista = dominiUsaEGetta_();
  var parti = dominio.split('.');
  // controlla anche i sottodomini: x.mailinator.com
  for (var i = 0; i < parti.length - 1; i++) {
    if (lista[parti.slice(i).join('.')]) return errore_('dati', 'Le email temporanee non sono accettate: usa la tua email personale.');
  }
  if (CONFIG.controlloDominio && !dominioRiceveEmail_(dominio)) return errore_('dati', 'Il dominio dell\'email (' + dominio + ') non riceve posta. Controlla di averla scritta bene.');
  return null;
}

// Lista scaricata al massimo ogni 6 ore e tenuta in cache (a pezzi: max 100 KB per voce)
function dominiUsaEGetta_() {
  var cache = CacheService.getScriptCache();
  var testo = null;
  var n = Number(cache.get('usaegetta:n') || 0);
  if (n) {
    var pezzi = cache.getAll(Array.apply(null, Array(n)).map(function (_, i) { return 'usaegetta:' + i; }));
    testo = '';
    for (var i = 0; i < n; i++) {
      if (pezzi['usaegetta:' + i] == null) { testo = null; break; }
      testo += pezzi['usaegetta:' + i];
    }
  }
  if (testo == null) {
    try {
      var r = UrlFetchApp.fetch(CONFIG.listaUsaEGetta, { muteHttpExceptions: true });
      if (r.getResponseCode() === 200) {
        testo = r.getContentText();
        var voci = {};
        var k = 0;
        for (var j = 0; j < testo.length; j += 90000) voci['usaegetta:' + (k++)] = testo.slice(j, j + 90000);
        voci['usaegetta:n'] = String(k);
        cache.putAll(voci, 21600);
      }
    } catch (err) {
      console.error('Lista email temporanee non scaricata: ' + err);
    }
  }
  var set = {};
  DOMINI_USA_E_GETTA.forEach(function (x) { set[x] = true; });
  if (testo) testo.split('\n').forEach(function (x) { x = x.trim().toLowerCase(); if (x && x.charAt(0) !== '#') set[x] = true; });
  return set;
}

// Chiede a Google DNS se il dominio ha un record MX (o almeno A). In caso di errore di rete lascia passare.
function dominioRiceveEmail_(dominio) {
  var cache = CacheService.getScriptCache();
  var k = 'dns:' + dominio;
  var noto = cache.get(k);
  if (noto) return noto === 'si';
  var esito = true;
  try {
    var mx = JSON.parse(UrlFetchApp.fetch('https://dns.google/resolve?type=MX&name=' + encodeURIComponent(dominio), { muteHttpExceptions: true }).getContentText());
    if (mx.Status === 3) esito = false; // NXDOMAIN: il dominio non esiste
    else if (mx.Status === 0 && !(mx.Answer || []).some(function (a) { return a.type === 15; })) {
      var a = JSON.parse(UrlFetchApp.fetch('https://dns.google/resolve?type=A&name=' + encodeURIComponent(dominio), { muteHttpExceptions: true }).getContentText());
      esito = (a.Answer || []).some(function (x) { return x.type === 1; });
    }
  } catch (err) {
    console.error('Controllo DNS non riuscito per ' + dominio + ': ' + err);
    return true;
  }
  cache.put(k, esito ? 'si' : 'no', 21600);
  return esito;
}

/* ============================================================
   Email
   ============================================================ */

function emailConferma_(pass, s, g, capogruppo) {
  var data = dataBreve_(s);
  var link = linkPass_(pass.chiave);
  var dim = CONFIG.dimensioneGruppo;
  var corpo =
    kicker_('Un ultimo passo') +
    titolo_('Ciao ' + esc_(pass.nome) + ', conferma la tua email') +
    paragrafo_('Apri il tuo link personale: così sappiamo che l\'indirizzo è tuo e il tuo posto nel gruppo è confermato.') +
    bottone_(link, 'Conferma la mia email') +
    riquadro_(
      '<p style="margin:0 0 6px;font-size:15px;font-weight:700">Come funziona il pass di gruppo</p>' +
      '<p style="margin:0;font-size:14px;line-height:1.5">Il pass è per gruppi da ' + dim + '. Si attiva solo quando <strong>tutti e ' + dim + '</strong> hanno confermato la propria email: ' +
      'allora ognuno riceve il suo QR. Se il gruppo non si completa entro ' + CONFIG.oreValiditaGruppo + ' ore, <strong>nessuno riceve il pass</strong>.</p>') +
    (capogruppo && g ?
      '<p style="margin:24px 0 8px;font-size:15px;font-weight:700">Manda questo link ai tuoi ' + (dim - 1) + ' amici</p>' +
      '<p style="margin:0 0 12px;padding:12px 14px;border:1.5px dashed #121212;border-radius:12px;background:#ffffff;font-size:14px;word-break:break-all">' +
        '<a href="' + linkGruppo_(g.id) + '" style="color:#121212">' + linkGruppo_(g.id) + '</a></p>' +
      bottone_('https://wa.me/?text=' + encodeURIComponent('Entra nel mio gruppo per il pass gratuito di bolla® (' + data + '): ' + linkGruppo_(g.id)), 'Invia su WhatsApp', true) : '') +
    nota_('Hai ' + CONFIG.oreConferma + ' ore per confermare: dopo, il tuo posto nel gruppo può essere preso da qualcun altro.');
  invia_(pass.email, 'Conferma il tuo posto — bolla® ' + data,
    'Ciao ' + pass.nome + ', conferma la tua email aprendo questo link: ' + link +
      '. Il pass si attiva solo quando tutti e ' + dim + ' i membri del gruppo hanno confermato.',
    layout_({ banner: 'banner-logo.jpg', anteprima: 'Conferma la tua email per il pass di gruppo', corpo: corpo, s: s, newsletter: vero_(pass.newsletter) }), null);
}

function emailAttesa_(r, s) {
  var data = dataBreve_(s);
  var corpo =
    kicker_('Lista d\'attesa') +
    titolo_('Ciao ' + esc_(r.nome) + ', sei in lista') +
    paragrafo_('I pass gratuiti per la serata del ' + data + ' sono esauriti, ma ti abbiamo messo in lista d\'attesa. ' +
      'Se si libera un posto ti scriviamo noi a questo indirizzo.') +
    dettagli_(s, data) +
    nota_('Non serve fare altro. Questa email non è un pass e non dà diritto all\'ingresso.');
  invia_(r.email, 'Sei in lista d\'attesa — bolla® ' + data,
    'Ciao ' + r.nome + ', sei in lista d\'attesa per bolla® del ' + data + '. Se si libera un posto ti scriviamo noi.',
    layout_({ banner: 'banner-logo.jpg', anteprima: 'Sei in lista d\'attesa: ti scriviamo se si libera un posto', corpo: corpo, s: s, newsletter: vero_(r.newsletter) }), null);
}

function emailPass_(pass, s) {
  var data = dataBreve_(s);
  var corpo =
    kicker_('Il tuo pass è attivo') +
    titolo_('Ciao ' + esc_(pass.nome) + ', ci vediamo dentro la bolla') +
    // biglietto: QR grande, codice, nome
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border:1.5px solid #121212;border-radius:18px;background:#ffffff">' +
      '<tr><td align="center" style="padding:24px 16px 8px">' +
        '<img src="cid:qr" width="200" height="200" alt="QR ' + pass.codice + '" style="display:block;width:200px;height:200px">' +
      '</td></tr>' +
      '<tr><td align="center" style="padding:4px 16px 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#5f5b56">Codice pass</td></tr>' +
      '<tr><td align="center" style="padding:2px 16px 0;font-size:32px;font-weight:700;letter-spacing:3px;color:#121212">' + pass.codice + '</td></tr>' +
      '<tr><td align="center" style="padding:4px 16px 20px;font-size:15px;color:#121212">' + esc_(pass.nome + ' ' + pass.cognome) +
        ' · ' + (pass.tipo === 'invito' ? 'su invito' : 'pass di gruppo') + '</td></tr>' +
      '<tr><td style="height:8px;font-size:0;line-height:0;background:#f0307f;background-image:linear-gradient(90deg,#f8893c,#f0307f 50%,#ff3b1c);border-radius:0 0 16px 16px">&nbsp;</td></tr>' +
    '</table>' +
    dettagli_(s, data) +
    bottone_(linkPass_(pass.chiave), 'Apri il pass sul sito') +
    nota_('Mostra il QR all\'ingresso, dal telefono va benissimo. Il pass è personale e vale una sola volta: non condividerlo. ' +
      'Non garantisce l\'ingresso dopo il raggiungimento della capienza massima: arriva presto.');
  invia_(pass.email, 'Il tuo pass bolla® — ' + data + ' · ' + pass.codice,
    'Pass ' + pass.codice + ' per ' + pass.nome + ' ' + pass.cognome + ' — ' + data + '. Apri: ' + linkPass_(pass.chiave),
    layout_({ banner: 'banner-sfera.jpg', anteprima: 'Pass ' + pass.codice + ': mostra il QR all\'ingresso', corpo: corpo, s: s, newsletter: vero_(pass.newsletter) }),
    { qr: qrBlob_(pass.chiave) });
}

// Struttura a tabelle: è quella che i client email (Gmail, Outlook, Apple Mail) mostrano meglio.
function layout_(o) {
  var img = CONFIG.sito + '/assets/' + o.banner;
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
  '<body style="margin:0;padding:0;background:#e9e7e3">' +
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc_(o.anteprima) + '</div>' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9e7e3;font-family:Helvetica,Arial,sans-serif;color:#121212">' +
    '<tr><td align="center" style="padding:28px 12px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#f3f2ef;border:1.5px solid #121212;border-radius:22px;overflow:hidden">' +
        '<tr><td style="padding:0;line-height:0"><a href="' + CONFIG.sito + '"><img src="' + img + '" width="520" alt="bolla®" style="display:block;width:100%;max-width:520px;height:auto;border:0"></a></td></tr>' +
        '<tr><td style="padding:28px 24px 8px">' + o.corpo + '</td></tr>' +
        '<tr><td style="padding:8px 24px 28px">' +
          '<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #d6d3ce;font-size:13px;color:#5f5b56">' + esc_(o.s.titolo) + '</p>' +
          (o.newsletter ? '<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#5f5b56">Sei iscritto alla newsletter di bolla®: ti scriveremo solo per le prossime serate e non cederemo la tua email a terzi. Per disiscriverti rispondi con "cancellami".</p>' : '') +
        '</td></tr>' +
      '</table>' +
      '<p style="margin:16px 0 0;font-size:12px;color:#5f5b56;font-family:Helvetica,Arial,sans-serif"><a href="' + CONFIG.sito + '" style="color:#5f5b56">bbbbolla.it</a></p>' +
    '</td></tr>' +
  '</table></body></html>';
}

function kicker_(t) {
  return '<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#e5249a">' + t + '</p>';
}

function titolo_(t) {
  return '<h1 style="margin:0 0 14px;font-size:28px;line-height:1.1;letter-spacing:-0.5px;font-weight:700;color:#121212">' + t + '</h1>';
}

function paragrafo_(t) {
  return '<p style="margin:0 0 20px;font-size:16px;line-height:1.5">' + t + '</p>';
}

function riquadro_(html) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0"><tr>' +
    '<td style="padding:16px;border-radius:14px;background:#ffffff;border-left:4px solid #f0307f">' + html + '</td></tr></table>';
}

function nota_(t) {
  return '<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#5f5b56">' + t + '</p>';
}

function dettagli_(s, data) {
  var righe = [['Quando', data + (CONFIG.orario ? ', ' + CONFIG.orario : '')]];
  if (CONFIG.luogo) righe.push(['Dove', CONFIG.luogo]);
  righe.push(['Ingresso', 'Gratuito con pass']);
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;font-size:15px">' +
    righe.map(function (r) {
      return '<tr><td style="padding:8px 0;border-top:1px solid #d6d3ce;width:90px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#5f5b56">' + r[0] + '</td>' +
        '<td style="padding:8px 0;border-top:1px solid #d6d3ce">' + esc_(r[1]) + '</td></tr>';
    }).join('') +
  '</table>';
}

function bottone_(href, testo, secondario) {
  var stile = secondario
    ? 'background:#ffffff;color:#121212;border:1.5px solid #121212'
    : 'background:#121212;color:#f3f2ef;border:1.5px solid #121212';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr><td align="center">' +
    '<a href="' + href + '" style="display:inline-block;' + stile + ';text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:999px">' + testo + '</a>' +
  '</td></tr></table>';
}

function invia_(a, oggetto, testo, html, immagini) {
  var opzioni = { name: CONFIG.nomeMittente, htmlBody: html };
  if (immagini) opzioni.inlineImages = immagini;
  if (CONFIG.replyTo) opzioni.replyTo = CONFIG.replyTo;
  MailApp.sendEmail(a, oggetto, testo, opzioni);
}

function quotaOk_() {
  return MailApp.getRemainingDailyQuota() > 0;
}

function erroreQuota_() {
  return errore_('email', 'Oggi abbiamo raggiunto il limite di email inviabili. Riprova domani.');
}

// QR della chiave del pass come GIF inline (Gmail blocca le immagini data:)
function qrBlob_(chiave) {
  var qr = qrcode(0, 'M');
  qr.addData(chiave);
  qr.make();
  var base64 = qr.createDataURL(8, 2).split(',')[1];
  return Utilities.newBlob(Utilities.base64Decode(base64), 'image/gif', 'qr.gif');
}

/* ============================================================
   Newsletter
   Menu bolla® → Esporta newsletter: ricrea il foglio "Newsletter" (un'email per riga).
   Per disiscrivere qualcuno scrivi FALSE nella colonna "newsletter" di tutti i suoi pass.
   ============================================================ */

function esportaNewsletter() {
  var db = carica_();
  var iscritti = {};
  var disiscritti = {};
  db.Pass.forEach(function (r) {
    if (!vero_(r.newsletter)) { disiscritti[r.email_norm] = true; return; }
    if (r.stato !== 'confermato') return; // solo email verificate
    if (!iscritti[r.email_norm]) iscritti[r.email_norm] = [r.confermato || r.creato, r.nome, r.cognome, r.email];
  });
  var righe = Object.keys(iscritti)
    .filter(function (e) { return !disiscritti[e]; })
    .map(function (e) { return iscritti[e]; });

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Newsletter') || ss.insertSheet('Newsletter');
  sh.clearContents();
  sh.appendRow(['iscritto il', 'nome', 'cognome', 'email']);
  if (righe.length) sh.getRange(2, 1, righe.length, 4).setValues(righe);
  sh.setFrozenRows(1);
}

/* ============================================================
   Accesso ai fogli
   ============================================================ */

function carica_() {
  var ss = SpreadsheetApp.getActive();
  if (Object.keys(COLONNE).some(function (n) { return !ss.getSheetByName(n); })) setup();
  var db = {};
  Object.keys(COLONNE).forEach(function (nome) {
    var sh = ss.getSheetByName(nome);
    var values = sh.getDataRange().getValues();
    var head = values[0];
    // colonne aggiunte in versioni successive: le intestazioni mancanti vanno in fondo
    COLONNE[nome].forEach(function (c) {
      if (head.indexOf(c) < 0) { head.push(c); sh.getRange(1, head.length).setValue(c); }
    });
    db[nome] = [];
    for (var i = 1; i < values.length; i++) {
      var r = { _riga: i + 1, _foglio: sh, _head: head };
      head.forEach(function (h, j) {
        var v = values[i][j];
        // Sheets può trasformare "2026-10-30" in una data anche nelle colonne testo: la riportiamo a stringa
        if (v instanceof Date && COLONNE_TESTO.indexOf(h) >= 0) r[h] = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
        else r[h] = v instanceof Date ? v : String(v);
      });
      db[nome].push(r);
    }
  });
  return db;
}

function appendi_(nome, obj) {
  var sh = SpreadsheetApp.getActive().getSheetByName(nome);
  sh.appendRow(COLONNE[nome].map(function (c) { return cella_(obj[c] == null ? '' : obj[c]); }));
}

function aggiorna_(tabella, r, campi) {
  Object.keys(campi).forEach(function (c) {
    var col = r._head.indexOf(c) + 1;
    r._foglio.getRange(r._riga, col).setValue(campi[c]);
    r[c] = campi[c];
  });
}

function trova_(tabella, campo, valore) {
  for (var i = 0; i < tabella.length; i++) if (tabella[i][campo] === valore) return tabella[i];
  return null;
}

function serata_(db, id) {
  var s = trova_(db.Serate, 'id', String(id || ''));
  if (!s) return null;
  return {
    id: s.id,
    titolo: s.titolo || 'bolla®',
    data: s.data instanceof Date ? Utilities.formatDate(s.data, TZ, 'yyyy-MM-dd') : s.data,
    capienza: Number(s.capienza) || 0,
    aperta: s.aperta
  };
}

function gruppo_(db, id) {
  return trova_(db.Gruppi, 'id', String(id || ''));
}

/* ============================================================
   Utilità
   ============================================================ */

// Esegue fn con il lock; manda le email dopo aver rilasciato il lock.
function conLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return errore_('occupato', 'Troppe richieste in questo momento. Riprova tra qualche secondo.');
  var out;
  try {
    out = fn();
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  if (out && typeof out._email === 'function') {
    try { out._email(); } catch (err) { console.error('Email non inviata: ' + err); }
  }
  if (out) delete out._email;
  return out;
}

function fineSerata_(s) {
  return Utilities.parseDate(s.data + ' 23:59', TZ, 'yyyy-MM-dd HH:mm');
}

function dataBreve_(s) {
  return Utilities.formatDate(fineSerata_(s), TZ, 'dd.MM.yyyy');
}

function data_(v) {
  return v instanceof Date ? v : new Date(v);
}

function oreDa_(v) {
  return (new Date() - data_(v)) / 36e5;
}

function vero_(v) {
  var s = String(v).toLowerCase();
  return v === true || s === 'true' || s === 'si' || s === 'sì' || s === 'vero';
}

function linkGruppo_(id) { return CONFIG.sito + '/?gruppo=' + id; }
function linkPass_(chiave) { return CONFIG.sito + '/?pass=' + chiave; }

// Gmail ignora i punti e tutto ciò che segue "+": a.b+x@gmail.com = ab@gmail.com
function normEmail_(email) {
  var parti = email.split('@');
  var locale = parti[0].split('+')[0];
  var dominio = parti[1] === 'googlemail.com' ? 'gmail.com' : parti[1];
  if (dominio === 'gmail.com') locale = locale.replace(/\./g, '');
  return locale + '@' + dominio;
}

// Token casuali da UUID v4 (generatore crittografico di Google), in esadecimale
function token_(lunghezza) {
  var s = '';
  while (s.length < lunghezza) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, lunghezza);
}

function nuovoCodice_(db) {
  var usati = {};
  db.Pass.forEach(function (r) { usati[r.codice] = true; });
  var alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var codice;
  do {
    codice = 'BOL-';
    var hex = Utilities.getUuid().replace(/-/g, '');
    for (var i = 0; i < 5; i++) codice += alfabeto.charAt(parseInt(hex.substr(i * 2, 2), 16) % alfabeto.length);
  } while (usati[codice]);
  return codice;
}

function pulisci_(s, max) {
  return String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// evita che un testo come "=IMPORTXML(...)" diventi una formula nel foglio
function cella_(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function errore_(codice, messaggio) {
  return { ok: false, errore: codice, messaggio: messaggio };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
