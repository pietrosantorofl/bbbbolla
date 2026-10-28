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
 *   Workshop creato | workshop | nome | cognome | telefono | telefono_norm | note
 *   Cena    creato | cena | nome | cognome | telefono | telefono_norm | persone | note
 *
 * Web App: POST body JSON { action, ... } con action = stato | crea_gruppo | unisciti | invito | pass
 */

var CONFIG = {
  nomeMittente: 'bolla®',
  replyTo: 'bollacatania@gmail.com',   // le risposte alle email arrivano qui
  mittenteBrevo: 'pass@bbbbolla.it',   // mittente delle email inviate con Brevo (dominio da autenticare su Brevo)
  sito: 'https://bbbbolla.it',
  luogo: 'MONO, Via Gornalunga 12, 95129 Catania CT',   // compare nelle email
  orario: 'dalle 20:00',          // compare nelle email
  senzaPass: '5€ al botteghino dopo le 22:30',  // compare nelle email ('' = niente)
  newsletterObbligatoria: true,   // deve coincidere con newsletterObbligatoria in js/config.js
  dimensioneGruppo: 3,
  chiusuraGruppi: '18:00',        // il giorno della serata: entro quest'ora il gruppo va completato, dopo non se ne creano di nuovi
  oreConferma: 48,                // dopo, un membro che non ha confermato perde il posto nel gruppo
  minutiTraReinvii: 15,           // anti-spam: ogni quanto si può rimandare il link alla stessa persona
  riservaGmail: 20,               // con Gmail come canale principale: a queste email rimaste oggi si passa a Brevo

  /* anti-bot */
  secondiMinimiModulo: 4,         // un modulo inviato prima di N secondi dall'apertura viene respinto
  oreValiditaModulo: 2,           // dopo, il modulo va ricaricato
  maxRegistrazioniAlMinuto: 60,   // tetto globale: oltre, le richieste vengono respinte per un minuto

  /* prenotazioni al workshop (bbbbolla.it/workshop.html): nome, cognome e telefono, foglio "Workshop" */
  workshop: {
    id: 'cumbia-2026-10-30',      // deve coincidere con workshop.id in js/config.js
    inizio: '2026-10-30 20:00',   // dopo quest'ora le prenotazioni si chiudono
    posti: 40                     // 0 = nessun limite; altrimenti a quota raggiunta la pagina mostra "Esaurito"
  },

  /* prenotazioni alla cena (pagina nascosta bbbbolla.it/6nov-tavolacunzata/): nome, cognome, telefono e persone, foglio "Cena" */
  cena: {
    id: 'tavolacunzata-2026-11-06',   // deve coincidere con CENA.id in js/cena.js
    inizio: '2026-11-06 20:00',       // dopo quest'ora le prenotazioni si chiudono
    posti: 0,                         // coperti in tutto; 0 = nessun limite
    maxPersone: 6                     // persone al massimo in una prenotazione
  },

  /* email temporanee: lista pubblica aggiornata (~10.000 domini) + controllo che il dominio riceva posta */
  listaUsaEGetta: 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf',
  controlloDominio: true,

  /* live: cosa prova il pubblico, sulle visuals (bbbbolla.it/live/) */
  liveSecondiTraInvii: 30,        // ogni telefono può mandare un'emozione ogni N secondi
  liveMaxAlMinuto: 120,           // tetto globale di invii al minuto
  liveMemoria: 80                 // quanti invii restano in cache per lo schermo
};

var TZ = 'Europe/Rome';
var TITOLO_SERATA_2026_10_30 = 'bolla® — La Cumbia tradizionale colombiana, Selva Cosmica, Franzuà, Dario Aiello';
var COLONNE = {
  Serate: ['id', 'titolo', 'data', 'capienza', 'aperta'],
  Inviti: ['token', 'etichetta', 'serata', 'max', 'scadenza', 'attivo', 'creato'],
  Gruppi: ['id', 'serata', 'creato', 'scadenza', 'capogruppo', 'stato', 'completato'],
  Pass: ['creato', 'serata', 'tipo', 'rif', 'nome', 'cognome', 'email', 'email_norm', 'chiave', 'codice', 'stato', 'confermato', 'checkin', 'newsletter', 'checkin_da'],
  Attesa: ['creato', 'serata', 'nome', 'cognome', 'email', 'email_norm', 'arrivato_da', 'newsletter', 'note'],
  Live: ['creato', 'serata', 'nickname', 'colore', 'emozione', 'dispositivo'],
  Workshop: ['creato', 'workshop', 'nome', 'cognome', 'telefono', 'telefono_norm', 'note'],
  Cena: ['creato', 'cena', 'nome', 'cognome', 'telefono', 'telefono_norm', 'persone', 'note']
};
var COLONNE_TESTO = ['id', 'data', 'serata', 'rif', 'chiave', 'codice', 'capogruppo', 'token', 'email', 'email_norm', 'nome', 'cognome',
  'workshop', 'telefono', 'telefono_norm', 'cena'];
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
    serate.appendRow(['2026-10-30', TITOLO_SERATA_2026_10_30, '2026-10-30', '150', 'TRUE']);
  }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('bolla®')
    .addItem('Crea link invito…', 'creaInvitoDaMenu')
    .addItem('Esporta newsletter', 'esportaNewsletter')
    .addSeparator()
    .addItem('Crea link segreto staff (app ingresso)', 'creaLinkStaffDaMenu')
    .addItem('Crea link segreto visuals (schermo e regia)', 'creaLinkVisualsDaMenu')
    .addItem('Rigenera codice live (QR in sala)', 'rigeneraCodiceLiveDaMenu')
    .addItem('Imposta chiave Brevo…', 'impostaChiaveBrevoDaMenu')
    .addItem('Invia email di prova (Brevo)', 'emailProvaDaMenu')
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
  var r2 = ui.prompt('Nuovo invito', 'Quanti pass al massimo con questo link? Lascia vuoto per nessun limite.', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var testoMax = r2.getResponseText().trim();
  var max = testoMax ? Math.floor(Number(testoMax)) : '';
  if (testoMax && !(max > 0)) { ui.alert('Numero non valido.'); return; }
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
  aggiornamentiUnaTantum_(); // idempotente: ogni aggiornamento gira una volta sola
  var emailEventi = PropertiesService.getScriptProperties().getProperty('EVENTI_BREVO_EMAIL');
  if (emailEventi && chiaveBrevo_()) eventiBrevo_(emailEventi);
  var sveglia = installaSveglia_();
  var ss = SpreadsheetApp.getActive();
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:40px auto;padding:0 16px">' +
    '<h1 style="font-size:40px;margin:0">bolla&reg;</h1>' +
    '<p style="font-size:18px">Backend dei pass attivo.</p>' +
    '<p>Fogli: ' + Object.keys(COLONNE).map(function (n) { return ss.getSheetByName(n) ? n + ' ✓' : n + ' ✗'; }).join(' · ') + '</p>' +
    '<p>Email Gmail ancora inviabili oggi: ' + (quotaGmail_() < 0 ? 'non disponibile ora' : quotaGmail_()) + '</p>' +
    '<p>Brevo: ' + (chiaveBrevo_() ? 'collegato ✓' : 'non collegato') + '</p>' +
    '<p>Canale email principale: ' + (chiaveBrevo_() && !usaGmail_(quotaGmail_()) ? 'Brevo' : 'Gmail') +
      (gmailPrima_() ? ' (Gmail finché restano più di ' + CONFIG.riservaGmail + ' email oggi, poi Brevo)' : '') + '</p>' +
    '<p>Pulizia test: ' + esc_(PropertiesService.getScriptProperties().getProperty('PULIZIA_TEST') || 'nessuna') + '</p>' +
    '<p>Pulizia workshop: ' + esc_(PropertiesService.getScriptProperties().getProperty('PULIZIA_WORKSHOP') || 'nessuna') + '</p>' +
    '<p>Ultima prova Brevo: ' + esc_(PropertiesService.getScriptProperties().getProperty('BREVO_ESITO') || 'nessuna') + '</p>' +
    '<p>Email di scuse per i link di conferma: ' + esc_(PropertiesService.getScriptProperties().getProperty('SCUSE_ESITO') || 'nessuna') + '</p>' +
    '<p>Promemoria di conferma: ' + esc_(PropertiesService.getScriptProperties().getProperty('PROMEMORIA_ESITO') || 'nessuno') + '</p>' +
    '<p>Eventi Brevo: ' + esc_(PropertiesService.getScriptProperties().getProperty('EVENTI_BREVO') || 'nessuna lettura') + '</p>' +
    '<p>Sveglia automatica: ' + sveglia + '</p>' +
    erroriAggiornamenti_() + colonneSfasate_(ss) + confermeInSospeso_() + '</div>';
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
      case 'live_invia': return json_(azioneLiveInvia_(d));
      case 'live_feed': return json_(azioneLiveFeed_(d));
      case 'live_regia': return json_(azioneLiveRegia_(d));
      case 'workshop_stato': return json_(azioneWorkshopStato_());
      case 'workshop_prenota': return json_(azioneWorkshopPrenota_(d));
      case 'cena_stato': return json_(azioneCenaStato_());
      case 'cena_prenota': return json_(azioneCenaPrenota_(d));
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
  // finché l'ultima prova Brevo è fallita, riprova a ogni giro: quando funziona arriva l'email e si ferma
  var esitoBrevo = PropertiesService.getScriptProperties().getProperty('BREVO_ESITO') || '';
  if (chiaveBrevo_() && esitoBrevo.indexOf('errore') === 0) provaBrevo_();
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
        appendi_('Inviti', { token: token_(12), etichetta: nome, serata: '2026-10-30', max: '', scadenza: '', attivo: 'TRUE', creato: new Date() });
      });
    } },
    // chiave Brevo incollata per errore nella colonna "chiave" del foglio Pass: va nelle proprietà, la riga si cancella
    { id: 'chiave-brevo-dal-foglio-pass', fai: function () {
      var props = PropertiesService.getScriptProperties();
      db.Pass.filter(function (r) { return /^xkeysib-/.test(r.chiave); }).reverse().forEach(function (r) {
        props.setProperty('BREVO_API_KEY', r.chiave.trim());
        r._foglio.deleteRow(r._riga);
      });
      provaBrevo_();
    } },
    // la scheda vuota creata insieme al foglio confonde: si toglie (solo se vuota) e le schede vanno in ordine d'uso
    { id: 'schede-ordinate', fai: function () {
      var ss = SpreadsheetApp.getActive();
      ss.getSheets().forEach(function (sh) {
        if (COLONNE[sh.getName()] || sh.getName() === 'Newsletter') return;
        if (sh.getLastRow() === 0 && sh.getLastColumn() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
      });
      ['Pass', 'Gruppi', 'Inviti', 'Attesa', 'Serate'].forEach(function (nome, i) {
        var sh = ss.getSheetByName(nome);
        if (sh) { ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1); }
      });
    } },
    // email di un pass finto, identica a quelle vere, mandata a te per controllare grafica e spam con Brevo
    { id: 'prova-pass-brevo-1', fai: function () {
      var s = serata_(db, '2026-10-30');
      emailPass_({ nome: 'Prova', cognome: 'Pass', email: CONFIG.replyTo, codice: 'BOL-PROVA', chiave: token_(24), tipo: 'invito', newsletter: 'FALSE' }, s);
    } },
    // prima del lancio: annulla i pass e i gruppi creati durante i test (i posti tornano liberi)
    { id: 'pulizia-test-2026-10-22', fai: function () {
      var codici = ['BOL-MTFSG', 'BOL-XH2CG', 'BOL-ZY6WN'];
      var gruppi = {};
      db.Pass.forEach(function (r) {
        if (codici.indexOf(r.codice) < 0) return;
        if (r.tipo === 'gruppo') gruppi[r.rif] = true;
        aggiorna_(db.Pass, r, { stato: 'annullato' });
      });
      db.Gruppi.forEach(function (g) { if (gruppi[g.id]) aggiorna_(db.Gruppi, g, { stato: 'annullato' }); });
    } },
    { id: 'inviti-organizzatori-senza-limite', fai: function () {
      db.Inviti.forEach(function (inv) {
        if (['Pietro', 'Dario', 'Fabrizio', 'Tommaso'].indexOf(inv.etichetta) >= 0) aggiorna_(db.Inviti, inv, { max: '' });
      });
    } },
    // il workshop ha cambiato nome: il titolo della serata compare nelle email e nell'app staff
    // Una colonna vuota inserita in testa al foglio Pass ha spostato le intestazioni a destra: le righe scritte dopo
    // (dati da colonna A) vanno spostate di una colonna, poi la colonna A vuota si toglie.
    { id: 'pass-colonne-riallineate-2026-10-26', fai: function () {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
      try {
        var sh = SpreadsheetApp.getActive().getSheetByName('Pass');
        var values = sh.getDataRange().getValues();
        var spostamento = values[0].map(String).indexOf('creato');
        if (spostamento <= 0) return;
        for (var i = 1; i < values.length; i++) {
          var riga = values[i];
          if (riga.slice(0, spostamento).every(function (v) { return v === ''; })) continue; // riga già giusta
          var giusta = riga.map(function () { return ''; });
          COLONNE.Pass.forEach(function (c, k) {
            var v = riga[k];
            // Sheets può aver trasformato in data un testo finito nella colonna sbagliata (es. la serata)
            if (v instanceof Date && COLONNE_TESTO.indexOf(c) >= 0) v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
            giusta[k + spostamento] = typeof v === 'string' ? cella_(v) : v;
          });
          sh.getRange(i + 1, 1, 1, giusta.length).setValues([giusta]);
        }
        SpreadsheetApp.flush();
        var dopo = sh.getDataRange().getValues();
        var vuote = dopo.every(function (r) { return r.slice(0, spostamento).every(function (v) { return v === ''; }); });
        if (vuote) sh.deleteColumns(1, spostamento);
      } finally {
        lock.releaseLock();
      }
    } },
    { id: 'titolo-serata-2026-10-30-cumbia', fai: function () {
      var s = trova_(db.Serate, 'id', '2026-10-30');
      if (s) aggiorna_(db.Serate, s, { titolo: TITOLO_SERATA_2026_10_30 });
    } },
    // link di conferma rotti dalle colonne sfasate: per ora riapre e riscrive solo a questo indirizzo (prova)
    { id: 'scuse-conferma-pietrosantoro90', fai: function () {
      scuseConferma_(db, ['pietrosantoro90@gmail.com']);
    } },
    // l'email di scuse non è arrivata: cosa dice Brevo di quell'indirizzo (solo tipi di evento e orari)
    { id: 'eventi-brevo-pietrosantoro90-1', fai: function () {
      eventiBrevo_('pietrosantoro90@gmail.com');
    } },
    { id: 'eventi-brevo-pietrosantoro90-2', fai: function () {
      eventiBrevo_('pietrosantoro90@gmail.com');
    } },
    // da qui la pagina di stato rilegge gli eventi Brevo di questo indirizzo a ogni apertura
    { id: 'eventi-brevo-in-diretta', fai: function () {
      PropertiesService.getScriptProperties().setProperty('EVENTI_BREVO_EMAIL', 'pietrosantoro90@gmail.com');
    } },
    // con Brevo non è arrivata: stessa email dal canale di riserva (Gmail di bollacatania@gmail.com)
    { id: 'scuse-conferma-pietrosantoro90-gmail', fai: function () {
      scuseConferma_(db, ['pietrosantoro90@gmail.com'], true);
    } },
    { id: 'eventi-brevo-tre-indirizzi', fai: function () {
      PropertiesService.getScriptProperties().setProperty('EVENTI_BREVO_EMAIL', 'pietrosantoro90@gmail.com,bollacatania@gmail.com,pietrosantoro.fl@gmail.com');
    } },
    // dalle 17:28 del 26.10 Brevo accetta le email ma non le consegna: si passa a Gmail e si rimandano le conferme ferme
    { id: 'gmail-prima-2026-10-26', fai: function () {
      PropertiesService.getScriptProperties().setProperty('EMAIL_GMAIL_PRIMA', 'si');
      ['bollacatania@gmail.com', 'pietrosantoro.fl@gmail.com'].forEach(function (e) {
        var n = normEmail_(e);
        db.Pass.forEach(function (r) {
          if (r.email_norm !== n || r.tipo !== 'gruppo' || r.stato !== 'da_confermare') return;
          var g = gruppo_(db, r.rif);
          emailConferma_(r, serata_(db, r.serata), g, !!g && g.capogruppo === r.chiave);
        });
      });
    } },
    // test end-to-end finito: via le righe dei 3 pass di prova e dei gruppi fatti solo di loro
    { id: 'pulizia-test-2026-10-26', fai: function () {
      var chiavi = ['3f77716a14ed4ba9aeb72785', '5aeadd100a504721a7b738cc', 'b4080cbccf6e43218e2dedf6'];
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
      try {
        var db2 = carica_();
        var pass = db2.Pass.filter(function (r) { return chiavi.indexOf(r.chiave) >= 0; });
        var gruppi = db2.Gruppi.filter(function (g) {
          var membri = db2.Pass.filter(function (r) { return r.tipo === 'gruppo' && r.rif === g.id; });
          return membri.length > 0 && membri.every(function (r) { return chiavi.indexOf(r.chiave) >= 0; });
        });
        // dal basso, così i numeri di riga non cambiano mentre si cancella
        pass.concat(gruppi).sort(function (x, y) { return y._riga - x._riga; }).forEach(function (r) { r._foglio.deleteRow(r._riga); });
        PropertiesService.getScriptProperties().setProperty('PULIZIA_TEST', new Date().toISOString().slice(0, 16) +
          ' pass eliminati: ' + (pass.map(function (r) { return r.codice; }).join(', ') || 'nessuno') +
          ' · gruppi eliminati: ' + (gruppi.map(function (g) { return g.id; }).join(', ') || 'nessuno'));
      } finally {
        lock.releaseLock();
      }
    } },
    // tutti i pass di gruppo ancora da confermare (link rotti dal guasto del 26.10): riaperti e scuse via Gmail
    { id: 'scuse-conferma-tutti-gmail-2026-10-26', fai: function () {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
      var esiti = [];
      try {
        var db2 = carica_();
        var now = new Date();
        db2.Pass.filter(function (r) { return r.tipo === 'gruppo' && r.stato === 'da_confermare' && r.serata === '2026-10-30'; }).forEach(function (pass) {
          var s = serata_(db2, pass.serata);
          var g = gruppo_(db2, pass.rif);
          if (!g || g.stato !== 'aperto') { esiti.push('saltato (gruppo ' + (g ? g.stato : 'mancante') + ')'); return; }
          aggiorna_(db2.Pass, pass, { creato: now });
          aggiorna_(db2.Gruppi, g, { scadenza: scadenzaGruppi_(s) });
          var capo = g.capogruppo === pass.chiave;
          try {
            emailScuseConferma_(pass, s, g, capo, true);
            esiti.push(pass.codice + ' inviata' + (capo ? ' (capogruppo)' : '') + ', gruppo ' + statoGruppo_(db2, g).stato);
          } catch (err) {
            esiti.push(pass.codice + ' errore: ' + String(err.message).slice(0, 80));
          }
        });
      } finally {
        lock.releaseLock();
      }
      PropertiesService.getScriptProperties().setProperty('SCUSE_ESITO', now.toISOString().slice(0, 16) + ' ' + (esiti.join(' · ') || 'nessun pass da confermare'));
    } },
    // fine dei test: via tutto quello che riguarda gli indirizzi di prova (pass, gruppi fatti solo di loro, lista d'attesa, newsletter)
    { id: 'pulizia-email-test-2026-10-26', fai: function () {
      var prova = ['pietrosantoro90@gmail.com', 'ales.nastasi@gmail.com', 'pietrosantoro.fl@gmail.com'].map(normEmail_);
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
      try {
        var db2 = carica_();
        var pass = db2.Pass.filter(function (r) { return prova.indexOf(r.email_norm) >= 0; });
        var gruppi = db2.Gruppi.filter(function (g) {
          var membri = db2.Pass.filter(function (r) { return r.tipo === 'gruppo' && r.rif === g.id; });
          return membri.length > 0 && membri.every(function (r) { return prova.indexOf(r.email_norm) >= 0; });
        });
        // gruppi con anche persone vere: restano, ma senza i membri di prova
        var misti = db2.Gruppi.filter(function (g) {
          return gruppi.indexOf(g) < 0 && pass.some(function (r) { return r.tipo === 'gruppo' && r.rif === g.id; });
        });
        var attesa = db2.Attesa.filter(function (r) { return prova.indexOf(r.email_norm) >= 0; });
        // per foglio, dal basso: i numeri di riga non cambiano mentre si cancella
        [pass, gruppi, attesa].forEach(function (righe) {
          righe.slice().sort(function (x, y) { return y._riga - x._riga; }).forEach(function (r) { r._foglio.deleteRow(r._riga); });
        });
        var nl = 0;
        var foglioNl = SpreadsheetApp.getActive().getSheetByName('Newsletter');
        if (foglioNl && foglioNl.getLastRow() > 1) {
          var valori = foglioNl.getDataRange().getValues();
          for (var i = valori.length - 1; i >= 1; i--) {
            if (prova.indexOf(normEmail_(String(valori[i][3]).trim().toLowerCase())) >= 0) { foglioNl.deleteRow(i + 1); nl++; }
          }
        }
        PropertiesService.getScriptProperties().setProperty('PULIZIA_TEST', new Date().toISOString().slice(0, 16) +
          ' indirizzi di prova: pass eliminati ' + pass.length + ' (' + pass.map(function (r) { return r.codice; }).join(', ') + ')' +
          ' · gruppi eliminati ' + gruppi.length + ' · gruppi misti lasciati ' + misti.length +
          ' · lista d\'attesa ' + attesa.length + ' · newsletter ' + nl);
      } finally {
        lock.releaseLock();
      }
    } },
    // prenotazione di prova al workshop (il foglio non ha email: si riconosce dal nome)
    { id: 'pulizia-workshop-test-2026-10-26', fai: function () {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
      try {
        var righe = carica_().Workshop.filter(function (r) {
          return r.nome.trim().toLowerCase() === 'pietro' && r.cognome.trim().toLowerCase() === 'santoro';
        });
        righe.sort(function (x, y) { return y._riga - x._riga; }).forEach(function (r) { r._foglio.deleteRow(r._riga); });
        PropertiesService.getScriptProperties().setProperty('PULIZIA_WORKSHOP', new Date().toISOString().slice(0, 16) +
          ' prenotazioni Pietro Santoro eliminate: ' + righe.length +
          (righe.length ? ' (telefoni che finiscono con ' + righe.map(function (r) { return String(r.telefono_norm).slice(-3); }).join(', ') + ')' : ''));
      } finally {
        lock.releaseLock();
      }
    } },
    // nuove regole (26.10): conferma entro 48 ore, gruppi da completare entro le 18:00 del giorno della serata.
    // La scadenza vera si calcola dalla serata; qui si aggiorna solo la colonna, perché nel foglio si legga giusta.
    // righe di prova a nome "Test Test": pass, gruppi fatti solo di loro, lista d'attesa e workshop
    { id: 'pulizia-test-test-2026-10-26', fai: function () {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
      try {
        var db2 = carica_();
        var prova = function (r) { return String(r.nome).trim().toLowerCase() === 'test' && String(r.cognome).trim().toLowerCase() === 'test'; };
        var pass = db2.Pass.filter(prova);
        var gruppi = db2.Gruppi.filter(function (g) {
          var membri = db2.Pass.filter(function (r) { return r.tipo === 'gruppo' && r.rif === g.id; });
          return membri.length > 0 && membri.every(prova);
        });
        var attesa = db2.Attesa.filter(prova);
        var workshop = db2.Workshop.filter(prova);
        [pass, gruppi, attesa, workshop].forEach(function (righe) {
          righe.slice().sort(function (x, y) { return y._riga - x._riga; }).forEach(function (r) { r._foglio.deleteRow(r._riga); });
        });
        PropertiesService.getScriptProperties().setProperty('PULIZIA_TEST', new Date().toISOString().slice(0, 16) +
          ' "Test Test": pass eliminati ' + pass.length + (pass.length ? ' (' + pass.map(function (r) { return r.codice; }).join(', ') + ')' : '') +
          ' · gruppi ' + gruppi.length + ' · lista d\'attesa ' + attesa.length + ' · workshop ' + workshop.length);
      } finally {
        lock.releaseLock();
      }
    } },
    { id: 'scadenza-gruppi-ore-18', fai: function () {
      var db2 = carica_();
      db2.Gruppi.forEach(function (g) {
        var s = serata_(db2, g.serata);
        if (s && g.stato === 'aperto') aggiorna_(db2.Gruppi, g, { scadenza: scadenzaGruppi_(s) });
      });
    } },
    // promemoria di conferma: prima le due versioni (capogruppo e membro) a te, con dati finti
    { id: 'prova-promemoria-conferma-2026-10-28', fai: function () {
      var s = serata_(db, '2026-10-30');
      var finto = function () { return { nome: 'Pietro', email: 'pietrosantoro90@gmail.com', chiave: token_(24), newsletter: 'TRUE' }; };
      var entro = new Date(Date.now() + 30 * 36e5);
      var canali = [
        emailPromemoriaConferma_(finto(), s, { capogruppo: true, gruppo: { id: 'PROVA' }, confermati: 1, membri: 2, scadenza: entro }, '[Prova capogruppo] '),
        emailPromemoriaConferma_(finto(), s, { capogruppo: false, gruppo: null, confermati: 2, membri: 3, scadenza: entro }, '[Prova membro] ')
      ];
      PropertiesService.getScriptProperties().setProperty('PROMEMORIA_ESITO', new Date().toISOString().slice(0, 16) + ' 2 prove inviate (' + canali.join(', ') + ')');
    } },
    // promemoria vero: tutti i pass di gruppo ancora da confermare, se il gruppo è aperto e la loro scadenza non è passata
    { id: 'promemoria-conferma-2026-10-30', fai: function () {
      promemoriaConferme_('2026-10-30');
    } }
  ].forEach(function (a) {
    if (props.getProperty('fatto:' + a.id)) return;
    // la sveglia e la pagina di stato possono partire insieme: un aggiornamento già in corso non si rilancia
    var cache = CacheService.getScriptCache();
    if (cache.get('in-corso:' + a.id)) return;
    cache.put('in-corso:' + a.id, '1', 600);
    try {
      a.fai();
      props.setProperty('fatto:' + a.id, new Date().toISOString());
    } catch (err) {
      // un aggiornamento fallito non blocca gli altri: l'errore compare nella pagina di stato
      props.setProperty('errore:' + a.id, new Date().toISOString() + ' ' + String(err.message).slice(0, 200));
    }
  });
}

// Le righe nuove si scrivono nell'ordine di COLONNE, ma si leggono per intestazione:
// se nel foglio una colonna è stata spostata, cancellata o inserita, i dati finiscono sotto l'intestazione sbagliata.
function colonneSfasate_(ss) {
  return Object.keys(COLONNE).map(function (nome) {
    var sh = ss.getSheetByName(nome);
    if (!sh || sh.getLastColumn() === 0) return '';
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var ok = COLONNE[nome].every(function (c, i) { return head[i] === c; });
    return ok ? '' : '<p style="color:#c4231b">Colonne del foglio ' + esc_(nome) + ' fuori ordine: ' + esc_(head.join(' | ')) +
      '<br>Ordine atteso: ' + esc_(COLONNE[nome].join(' | ')) + '</p>';
  }).join('');
}

// Solo numeri (la pagina è pubblica): pass di gruppo non ancora confermati e stato del loro gruppo.
function confermeInSospeso_() {
  var db = carica_();
  var conta = {};
  db.Pass.forEach(function (r) {
    if (r.tipo !== 'gruppo' || r.stato !== 'da_confermare') return;
    var g = gruppo_(db, r.rif);
    var st = g ? statoGruppo_(db, g).stato : 'senza gruppo';
    var chiave = st + (oreDa_(r.creato) > CONFIG.oreConferma ? ', oltre ' : ', entro ') + CONFIG.oreConferma + ' ore';
    conta[chiave] = (conta[chiave] || 0) + 1;
  });
  var righe = Object.keys(conta).map(function (k) { return k + ': ' + conta[k]; });
  return '<p>Pass da confermare: ' + (righe.length ? esc_(righe.join(' · ')) : 'nessuno') + '</p>';
}

function erroriAggiornamenti_() {
  var props = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(props).filter(function (k) { return k.indexOf('errore:') === 0 && !props['fatto:' + k.slice(7)]; })
    .map(function (k) { return '<p>Aggiornamento non riuscito ' + esc_(k.slice(7)) + ': ' + esc_(props[k]) + '</p>'; }).join('');
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
    if (new Date() > scadenzaGruppi_(s)) return erroreGruppiChiusi_();
    var dup = duplicato_(db, s, p);
    if (dup) return dup;
    if (disponibili_(db, s) < CONFIG.dimensioneGruppo) return errore_('esaurito', 'Non ci sono più posti per un gruppo da ' + CONFIG.dimensioneGruppo + '.');
    if (!quotaOk_()) return erroreQuota_();

    var now = new Date();
    var g = { id: token_(10), serata: s.id, creato: now, scadenza: scadenzaGruppi_(s), capogruppo: '', stato: 'aperto', completato: '' };
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

/* ---------- workshop ----------
 * Prenotazione con nome, cognome e telefono (niente email, niente pass): le righe finiscono nel foglio
 * "Workshop" e lo staff richiama al telefono se serve. Stesso anti-bot dei pass (modulo firmato, honeypot,
 * tetto al minuto); lo stesso numero non può prenotare due volte. */
function azioneWorkshopStato_() {
  var db = carica_();
  return { ok: true, modulo: tokenModulo_(), workshop: { aperto: workshopAperto_(), posti: postiWorkshop_(db) > 0 } };
}

function azioneWorkshopPrenota_(d) {
  var bot = controllaModulo_(d.modulo);
  if (bot) return bot;
  if (d.website) return errore_('modulo', 'Richiesta non valida.'); // honeypot compilato
  var nome = pulisci_(d.nome, 60);
  var cognome = pulisci_(d.cognome, 60);
  if (!nome || !cognome) return errore_('dati', 'Inserisci nome e cognome.');
  var tel = telefono_(d.telefono);
  if (!tel) return errore_('dati', 'Controlla il numero di telefono.');
  if (d.privacy !== true) return errore_('dati', 'Serve il consenso privacy.');

  return conLock_(function () {
    if (tettoRaggiunto_()) return errore_('occupato', 'In questo momento stanno arrivando troppe registrazioni. Riprova tra un minuto.');
    if (!workshopAperto_()) return errore_('chiusa', 'Le prenotazioni per il workshop sono chiuse.');
    var db = carica_();
    var gia = db.Workshop.some(function (r) { return r.workshop === CONFIG.workshop.id && r.telefono_norm === tel.norm; });
    if (gia) return errore_('duplicato', 'Questo numero ha già una prenotazione per il workshop.');
    if (postiWorkshop_(db) <= 0) return errore_('esaurito', 'I posti per il workshop sono esauriti.');
    appendi_('Workshop', { creato: new Date(), workshop: CONFIG.workshop.id, nome: nome, cognome: cognome, telefono: tel.testo, telefono_norm: tel.norm, note: '' });
    contaRegistrazione_();
    segnaModuloUsato_(d.modulo);
    return { ok: true };
  });
}

function workshopAperto_() {
  return new Date() < Utilities.parseDate(CONFIG.workshop.inizio, TZ, 'yyyy-MM-dd HH:mm');
}

// posti ancora liberi (Infinity se il workshop non ha un limite)
function postiWorkshop_(db) {
  if (!CONFIG.workshop.posti) return Infinity;
  return CONFIG.workshop.posti - db.Workshop.filter(function (r) { return r.workshop === CONFIG.workshop.id; }).length;
}

// Numero italiano o internazionale: "333 123 4567", "+39 333…", "0039 333…" diventano tutti +393331234567
function telefono_(v) {
  var testo = pulisci_(v, 30);
  var cifre = testo.replace(/[\s.\-\/()]/g, '');
  if (/^00\d/.test(cifre)) cifre = '+' + cifre.slice(2);
  if (/^\d/.test(cifre)) cifre = '+39' + cifre;
  if (!/^\+\d{8,15}$/.test(cifre)) return null;
  return { testo: testo, norm: cifre };
}

/* ---------- cena ----------
 * Pagina nascosta (bbbbolla.it/6nov-tavolacunzata/), non collegata dal resto del sito. Come il workshop:
 * nome, cognome e telefono, più il numero di persone. Le righe finiscono nel foglio "Cena" e i coperti
 * si contano sommando le persone. Stesso anti-bot; lo stesso numero non può prenotare due volte. */
function azioneCenaStato_() {
  var db = carica_();
  var liberi = postiCena_(db);
  return { ok: true, modulo: tokenModulo_(), cena: { aperta: cenaAperta_(), posti: liberi > 0, maxPersone: Math.max(0, Math.min(CONFIG.cena.maxPersone, liberi)) } };
}

function azioneCenaPrenota_(d) {
  var bot = controllaModulo_(d.modulo);
  if (bot) return bot;
  if (d.website) return errore_('modulo', 'Richiesta non valida.'); // honeypot compilato
  var nome = pulisci_(d.nome, 60);
  var cognome = pulisci_(d.cognome, 60);
  if (!nome || !cognome) return errore_('dati', 'Inserisci nome e cognome.');
  var tel = telefono_(d.telefono);
  if (!tel) return errore_('dati', 'Controlla il numero di telefono.');
  var persone = Number(d.persone);
  if (!(persone >= 1 && persone <= CONFIG.cena.maxPersone && Math.floor(persone) === persone)) return errore_('dati', 'Scegli per quante persone prenoti.');
  if (d.privacy !== true) return errore_('dati', 'Serve il consenso privacy.');

  return conLock_(function () {
    if (tettoRaggiunto_()) return errore_('occupato', 'In questo momento stanno arrivando troppe registrazioni. Riprova tra un minuto.');
    if (!cenaAperta_()) return errore_('chiusa', 'Le prenotazioni per la cena sono chiuse.');
    var db = carica_();
    var gia = db.Cena.some(function (r) { return r.cena === CONFIG.cena.id && r.telefono_norm === tel.norm; });
    if (gia) return errore_('duplicato', 'Questo numero ha già una prenotazione per la cena.');
    var liberi = postiCena_(db);
    if (liberi <= 0) return errore_('esaurito', 'I posti per la cena sono esauriti.');
    if (persone > liberi) return errore_('posti', liberi === 1 ? 'Resta un solo posto: prenota per 1 persona.' : 'Restano solo ' + liberi + ' posti: prenota per meno persone.');
    appendi_('Cena', { creato: new Date(), cena: CONFIG.cena.id, nome: nome, cognome: cognome, telefono: tel.testo, telefono_norm: tel.norm, persone: persone, note: '' });
    contaRegistrazione_();
    segnaModuloUsato_(d.modulo);
    return { ok: true };
  });
}

function cenaAperta_() {
  return new Date() < Utilities.parseDate(CONFIG.cena.inizio, TZ, 'yyyy-MM-dd HH:mm');
}

// coperti ancora liberi (Infinity se la cena non ha un limite)
function postiCena_(db) {
  if (!CONFIG.cena.posti) return Infinity;
  var presi = 0;
  db.Cena.forEach(function (r) { if (r.cena === CONFIG.cena.id) presi += Number(r.persone) || 1; });
  return CONFIG.cena.posti - presi;
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
    if (new Date() > scadenzaGruppo_(db, g)) stato = 'scaduto';
    else if (!capo || attivi.indexOf(capo) < 0) stato = 'scaduto';
  }
  return { stato: stato, membri: membri, attivi: attivi, confermati: confermati, capoConfermato: !!capo && capo.stato === 'confermato' };
}

// I gruppi della serata si chiudono tutti alla stessa ora (CONFIG.chiusuraGruppi del giorno della serata).
function scadenzaGruppi_(s) {
  return Utilities.parseDate(s.data + ' ' + CONFIG.chiusuraGruppi, TZ, 'yyyy-MM-dd HH:mm');
}

function scadenzaGruppo_(db, g) {
  var s = serata_(db, g.serata);
  return s ? scadenzaGruppi_(s) : data_(g.scadenza);
}

function erroreGruppiChiusi_() {
  return errore_('chiusa', 'I pass di gruppo si potevano chiedere fino alle ' + CONFIG.chiusuraGruppi + ' del giorno della serata.' +
    (CONFIG.senzaPass ? ' Senza pass: ' + CONFIG.senzaPass + '.' : ''));
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
  // max vuoto = nessun limite: vale solo la capienza della serata
  if (Number(inv.max) > 0 && usati >= Number(inv.max)) return errore_('invito', 'I pass di questo invito sono finiti.');
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
    scadenza: scadenzaGruppo_(db, g).toISOString(),
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
   Link segreti, al posto dei PIN. Si creano dal menu del foglio; crearne uno nuovo disattiva il vecchio.
   - staff:   bbbbolla.it/staff.html#k=<segreto>            (app ingresso, telefoni alla porta)
   - visuals: bbbbolla.it/live/schermo.html#k=<segreto>     (computer del proiettore)
              bbbbolla.it/live/regia.html#k=<segreto>       (chi gestisce le visuals)
   Il segreto sta dopo il #: il browser non lo manda a nessun server, la pagina lo salva e lo toglie dalla barra.
   Le pagine lo mandano al backend nel campo "accesso".
   ============================================================ */

var LINK_SEGRETI = {
  staff: { prop: 'LINK_STAFF', nome: 'Link staff (app ingresso)', pagine: [['App ingresso', '/staff.html']], menu: 'Crea link segreto staff' },
  visuals: { prop: 'LINK_VISUALS', nome: 'Link visuals', pagine: [['Schermo (computer del proiettore)', '/live/schermo.html'], ['Regia (chi gestisce le visuals)', '/live/regia.html']], menu: 'Crea link segreto visuals' }
};

function creaLinkStaffDaMenu() { creaLinkDaMenu_('staff'); }
function creaLinkVisualsDaMenu() { creaLinkDaMenu_('visuals'); }

function creaLinkDaMenu_(tipo) {
  var t = LINK_SEGRETI[tipo];
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(t.prop)) {
    var r = ui.alert(t.nome, 'Esiste già un link. Crearne uno nuovo disattiva quello vecchio su tutti i dispositivi. Continuo?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  var segreto = token_(32);
  props.setProperty(t.prop, segreto);
  // finestra con i link da copiare (il testo di ui.alert non si seleziona bene)
  var righe = t.pagine.map(function (p) {
    var url = CONFIG.sito + p[1] + '#k=' + segreto;
    return '<p style="margin:14px 0 4px;font-weight:600">' + esc_(p[0]) + '</p>' +
      '<input readonly value="' + esc_(url) + '" onclick="this.select()" style="width:100%;padding:8px;font:13px monospace;box-sizing:border-box">';
  }).join('');
  var html = '<div style="font-family:Helvetica,Arial,sans-serif">' + righe +
    '<p style="margin-top:16px;color:#555;font-size:13px">Clicca un link per selezionarlo e copialo. Mandalo solo a chi deve usarlo: ' +
    'chi lo ha può entrare. Per disattivarlo crea un link nuovo dal menu.</p></div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(140 + 70 * t.pagine.length), t.nome);
}

// segreto sbagliato: risposta rallentata, e comunque 32 caratteri casuali non si indovinano
function controllaAccesso_(tipo, accesso) {
  var t = LINK_SEGRETI[tipo];
  var giusto = PropertiesService.getScriptProperties().getProperty(t.prop);
  if (!giusto) return errore_('accesso', 'Link non ancora creato: nel foglio usa il menu bolla® → ' + t.menu + '.');
  if (String(accesso || '') !== giusto) {
    Utilities.sleep(1000);
    return errore_('accesso', 'Link non valido o sostituito: chiedi il link nuovo.');
  }
  return null;
}

/* ============================================================
   Live: il pubblico manda nickname, colore ed emozione alle visuals proiettate.
   Telefono: bbbbolla.it/live/?c=<codice> (dal QR proiettato in sala).
   Schermo (proiettore) e regia (chi gestisce le visuals): pagine live/schermo.html e live/regia.html,
   aperte dal link segreto visuals. La regia salva le impostazioni, lo schermo le legge insieme agli invii
   e manda indietro il suo stato (audio, tipo di visuals, coda) che la regia mostra.
   Gli invii stanno in cache (lo schermo li legge ogni secondo e mezzo) e in archivio nel foglio Live.
   Il codice nel QR blocca chi trova il link fuori dalla sala: rigenerarlo invalida i QR vecchi.
   ============================================================ */

function codiceLive_() {
  var props = PropertiesService.getScriptProperties();
  var c = props.getProperty('LIVE_CODICE');
  if (!c) { c = token_(8); props.setProperty('LIVE_CODICE', c); }
  return c;
}

function rigeneraCodiceLiveDaMenu() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Codice live', 'Il QR proiettato cambia da solo al prossimo aggiornamento dello schermo; i link già aperti sui telefoni smettono di funzionare. Continuo?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  var c = token_(8);
  PropertiesService.getScriptProperties().setProperty('LIVE_CODICE', c);
  ui.alert('Codice live', 'Nuovo link: ' + CONFIG.sito + '/live/?c=' + c, ui.ButtonSet.OK);
}

function azioneLiveInvia_(d) {
  if (String(d.codice || '') !== codiceLive_()) return errore_('codice', 'Link non valido: scansiona il QR proiettato in sala.');
  var nickname = pulisciLive_(d.nickname, 16);
  var emozione = pulisciLive_(d.emozione, 24);
  var colore = String(d.colore || '').toLowerCase();
  var dispositivo = String(d.dispositivo || '').slice(0, 40);
  if (!nickname) return errore_('nickname', 'Scegli un nickname.');
  if (!/^[\p{L}\p{N}'’ \-]{1,24}$/u.test(emozione)) return errore_('emozione', 'Scrivi cosa provi, solo lettere e spazi.');
  if (!/^#[0-9a-f]{6}$/.test(colore)) return errore_('colore', 'Scegli un colore.');
  if (volgare_(nickname)) return errore_('nickname', 'Questo nickname non può andare sul muro. Prova con un altro.');
  if (volgare_(emozione)) return errore_('emozione', 'Questo testo non può andare sul muro. Prova con altre parole.');

  var cache = CacheService.getScriptCache();
  var kDisp = 'live:disp:' + dispositivo;
  if (dispositivo && cache.get(kDisp)) return errore_('attendi', 'La tua emozione è appena partita: aspetta qualche secondo prima di mandarne un\'altra.');
  var kMin = 'live:min:' + Math.floor(Date.now() / 60000);
  if (Number(cache.get(kMin) || 0) >= CONFIG.liveMaxAlMinuto) return errore_('attendi', 'Troppi invii tutti insieme: riprova tra un minuto.');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var feed = leggiFeedLive_();
    var voce = { id: feed.ultimo + 1, nickname: nickname, colore: colore, emozione: emozione, t: Date.now() };
    feed.ultimo = voce.id;
    feed.voci.push(voce);
    if (feed.voci.length > CONFIG.liveMemoria) feed.voci = feed.voci.slice(-CONFIG.liveMemoria);
    cache.put('live:feed', JSON.stringify(feed), 21600);
    cache.put(kMin, String(Number(cache.get(kMin) || 0) + 1), 120);
    if (dispositivo) cache.put(kDisp, '1', CONFIG.liveSecondiTraInvii);
  } finally {
    lock.releaseLock();
  }
  try {
    if (!SpreadsheetApp.getActive().getSheetByName('Live')) setup();
    appendi_('Live', { creato: new Date(), serata: String(d.serata || ''), nickname: nickname, colore: colore, emozione: emozione, dispositivo: dispositivo });
  } catch (err) {
    console.error('Archivio live non riuscito: ' + err);
  }
  return { ok: true, attesa: CONFIG.liveSecondiTraInvii };
}

// Lo schermo chiede gli invii arrivati dopo l'ultimo che ha già (dopo = id) e manda il suo stato per la regia.
// Se la cache si è svuotata gli id ripartono: "ultimo" più basso di "dopo" dice allo schermo di ricominciare.
function azioneLiveFeed_(d) {
  var e = controllaAccesso_('visuals', d.accesso);
  if (e) return e;
  if (d.stato) {
    var stato = JSON.stringify(d.stato);
    if (stato.length < 8000) CacheService.getScriptCache().put('live:schermo', JSON.stringify({ t: Date.now(), stato: d.stato }), 120);
  }
  var feed = leggiFeedLive_();
  var dopo = Number(d.dopo) || 0;
  return {
    ok: true,
    codice: codiceLive_(),
    ultimo: feed.ultimo,
    voci: feed.voci.filter(function (v) { return v.id > dopo; }),
    regia: leggiRegia_()
  };
}

// Regia: legge tutto (impostazioni, stato dello schermo, ultimi invii) e, se manda "regia", la salva.
// Vince la versione più recente (rev = ora in cui la regia l'ha cambiata).
function azioneLiveRegia_(d) {
  var e = controllaAccesso_('visuals', d.accesso);
  if (e) return e;
  if (d.regia && typeof d.regia === 'object') {
    var testo = JSON.stringify(d.regia);
    if (testo.length > 9000) return errore_('dati', 'Impostazioni troppo grandi.');
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var attuale = leggiRegia_();
      if (!attuale || Number(d.regia.rev) > Number(attuale.rev)) {
        CacheService.getScriptCache().put('live:regia', testo, 21600);
        PropertiesService.getScriptProperties().setProperty('LIVE_REGIA', testo);
      }
    } finally {
      lock.releaseLock();
    }
  }
  var schermo = CacheService.getScriptCache().get('live:schermo');
  return {
    ok: true,
    regia: leggiRegia_(),
    schermo: schermo ? JSON.parse(schermo) : null,
    ora: Date.now(),
    codice: codiceLive_(),
    voci: leggiFeedLive_().voci.slice(-40)
  };
}

function leggiRegia_() {
  var testo = CacheService.getScriptCache().get('live:regia') || PropertiesService.getScriptProperties().getProperty('LIVE_REGIA');
  return testo ? JSON.parse(testo) : null;
}

function leggiFeedLive_() {
  var testo = CacheService.getScriptCache().get('live:feed');
  return testo ? JSON.parse(testo) : { ultimo: 0, voci: [] };
}

function pulisciLive_(v, max) {
  return String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Filtro essenziale per un muro pubblico: confronta il testo senza accenti, simboli e lettere ripetute
// ("c4zz000" = "cazo"), così le varianti più comuni non passano.
// Radici lunghe: bloccate anche dentro altre parole. Corte: solo se sono la parola intera ("nazi" sì, "nazione" no).
var PAROLE_VIETATE = ['cazo', 'minchi', 'figa', 'troia', 'puttan', 'zoccol', 'bagasc', 'stronz', 'vafancul', 'fancul',
  'culatton', 'ricchion', 'frocio', 'froci', 'negr', 'terron', 'coglion', 'merd', 'porcodi', 'diocan', 'dioporc',
  'porcamadon', 'bastard', 'sucami', 'pompin', 'scopat', 'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'nigg', 'whore',
  'slut', 'stupr', 'hitler', 'mussolin', 'sieg', 'jihad', 'pedof', 'porn', 'sesso', 'tette', 'uccid', 'ammazz'];
var PAROLE_CORTE_VIETATE = ['caz', 'sega', 'duce', 'culo', 'fag', 'anal', 'sex', 'fica', 'dick', 'cock', 'kill', 'nazi',
  'isis', 'rape', 'pirla', 'mign', 'pota'];
var PAROLE_AMMESSE = ['negroni'];

function volgare_(testo) {
  var s = String(testo).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[0@4]/g, function (c) { return c === '4' || c === '@' ? 'a' : 'o'; })
    .replace(/1|!/g, 'i').replace(/3/g, 'e').replace(/5|\$/g, 's').replace(/7/g, 't')
    .replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  var corte = PAROLE_CORTE_VIETATE.map(function (p) { return p.replace(/(.)\1+/g, '$1'); });
  if (PAROLE_AMMESSE.indexOf(s) >= 0) return false;
  if (corte.indexOf(s) >= 0) return true;
  return PAROLE_VIETATE.some(function (p) {
    p = p.replace(/(.)\1+/g, '$1');
    return p.length >= 4 && s.indexOf(p) >= 0;
  });
}

/* ============================================================
   Staff: verifica dei QR all'ingresso (pagina bbbbolla.it/staff.html, aperta dal link segreto staff)
   ============================================================ */

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
  var no = controllaAccesso_('staff', d.accesso);
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
  var no = controllaAccesso_('staff', d.accesso);
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
      'allora ognuno riceve il suo QR. Se il gruppo non si completa entro le ' + CONFIG.chiusuraGruppi + ' del ' + data + ', <strong>nessuno riceve il pass</strong>.</p>') +
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

/* Chi non ha potuto confermare per un guasto: il pass riparte da adesso (di nuovo CONFIG.oreConferma ore),
 * il gruppo ancora "aperto" nel foglio resta aperto fino alla chiusura dei gruppi (CONFIG.chiusuraGruppi),
 * e arriva un'email di scuse con lo stesso link personale. Esito (senza indirizzi) nella pagina di stato. */
function scuseConferma_(db, emails, soloGmail) {
  var norm = emails.map(function (e) { return normEmail_(e.toLowerCase()); });
  var esiti = [];
  norm.forEach(function (n) {
    var pass = db.Pass.filter(function (r) { return r.email_norm === n && r.tipo === 'gruppo' && r.stato !== 'annullato'; }).pop();
    if (!pass) { esiti.push('nessun pass di gruppo'); return; }
    var s = serata_(db, pass.serata);
    var g = gruppo_(db, pass.rif);
    var now = new Date();
    if (pass.stato === 'da_confermare') aggiorna_(db.Pass, pass, { creato: now });
    if (g && g.stato === 'aperto') {
      aggiorna_(db.Gruppi, g, { scadenza: scadenzaGruppi_(s) });
    }
    var capo = !!g && g.capogruppo === pass.chiave;
    emailScuseConferma_(pass, s, g, capo, soloGmail);
    esiti.push('inviata' + (soloGmail ? ' con Gmail' : '') + ' (' + pass.stato + ', gruppo ' + (g ? statoGruppo_(db, g).stato : '?') + (capo ? ', capogruppo' : '') + ')');
  });
  PropertiesService.getScriptProperties().setProperty('SCUSE_ESITO', new Date().toISOString() + ' ' + esiti.join(' · '));
}

// Stato dell'account Brevo e ultimi eventi (richiesta, consegna, blocco, rimbalzo…) di alcuni indirizzi separati da virgola,
// salvati senza gli indirizzi (indirizzo 1, 2…) per la pagina di stato.
function eventiBrevo_(emails) {
  var opz = { headers: { 'api-key': chiaveBrevo_(), accept: 'application/json' }, muteHttpExceptions: true };
  var parti = [];
  var acc = UrlFetchApp.fetch('https://api.brevo.com/v3/account', opz);
  if (acc.getResponseCode() !== 200) parti.push('account: errore ' + acc.getResponseCode() + ' ' + acc.getContentText().slice(0, 200));
  else parti.push('account: ' + (JSON.parse(acc.getContentText()).plan || []).map(function (p) {
    return p.type + ' crediti ' + p.credits + (p.creditsType ? ' ' + p.creditsType : '') + (p.endDate ? ' fino al ' + p.endDate : '');
  }).join(', '));
  String(emails).split(',').forEach(function (email, i) {
    var r = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/statistics/events?limit=8&sort=desc&email=' + encodeURIComponent(email.trim()), opz);
    var testo;
    if (r.getResponseCode() !== 200) testo = 'errore ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 200);
    else testo = (JSON.parse(r.getContentText()).events || []).map(function (e) {
      return String(e.date).slice(5, 16) + ' ' + e.event + (e.reason ? ' (' + String(e.reason).slice(0, 80) + ')' : '') + ' «' + String(e.subject || '').slice(0, 25) + '»';
    }).join(' · ') || 'nessun evento';
    parti.push('indirizzo ' + (i + 1) + ': ' + testo);
  });
  PropertiesService.getScriptProperties().setProperty('EVENTI_BREVO', new Date().toISOString().slice(0, 16) + ' ' + parti.join(' ¦ '));
}

function emailScuseConferma_(pass, s, g, capogruppo, soloGmail) {
  var data = dataBreve_(s);
  var link = linkPass_(pass.chiave);
  var dim = CONFIG.dimensioneGruppo;
  var confermato = pass.stato === 'confermato';
  var corpo =
    kicker_('Scusaci') +
    titolo_('Ciao ' + esc_(pass.nome) + ', ora il link funziona') +
    paragrafo_('Il link di conferma che ti abbiamo mandato non funzionava per un problema tecnico: ora è risolto. ' +
      (confermato ? 'La tua email risulta già confermata: dal link vedi lo stato del tuo gruppo.' :
        'Il tuo posto nel gruppo è ancora valido: conferma dal bottone qui sotto.')) +
    bottone_(link, confermato ? 'Apri il mio pass' : 'Conferma la mia email') +
    (capogruppo && g ?
      '<p style="margin:24px 0 8px;font-size:15px;font-weight:700">Il link del gruppo da girare ai tuoi ' + (dim - 1) + ' amici</p>' +
      '<p style="margin:0 0 12px;padding:12px 14px;border:1.5px dashed #121212;border-radius:12px;background:#ffffff;font-size:14px;word-break:break-all">' +
        '<a href="' + linkGruppo_(g.id) + '" style="color:#121212">' + linkGruppo_(g.id) + '</a></p>' : '') +
    nota_('Il pass si attiva quando tutti e ' + dim + ' i membri del gruppo hanno confermato la propria email' +
      (confermato ? '.' : '. Hai ' + CONFIG.oreConferma + ' ore per confermare.'));
  (soloGmail ? inviaGmail_ : invia_)(pass.email, 'Scusaci: ora il link funziona — bolla® ' + data,
    'Ciao ' + pass.nome + ', il link di conferma che ti abbiamo mandato non funzionava per un problema tecnico: ora è risolto. Apri: ' + link,
    layout_({ banner: 'banner-logo.jpg', anteprima: 'Il link di conferma ora funziona', corpo: corpo, s: s, newsletter: vero_(pass.newsletter) }));
}

/* Promemoria a chi ha un pass di gruppo ancora da confermare. La scadenza è la sua: CONFIG.oreConferma ore
 * dall'iscrizione, ma mai dopo la chiusura dei gruppi. Se non conferma il capogruppo, il gruppo si chiude per tutti. */
function infoPromemoria_(db, pass) {
  var s = serata_(db, pass.serata);
  var g = gruppo_(db, pass.rif);
  var st = statoGruppo_(db, g);
  var entro = new Date(data_(pass.creato).getTime() + CONFIG.oreConferma * 36e5);
  var chiusura = scadenzaGruppi_(s);
  return {
    s: s, gruppo: g, stato: st.stato, capogruppo: g.capogruppo === pass.chiave,
    confermati: st.confermati.length, membri: st.membri.length, scadenza: entro < chiusura ? entro : chiusura
  };
}

// Esito (solo codici, niente indirizzi) nella pagina di stato.
function promemoriaConferme_(serata) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
  var esiti = [];
  try {
    var db = carica_();
    var now = new Date();
    db.Pass.filter(function (r) { return r.tipo === 'gruppo' && r.stato === 'da_confermare' && r.serata === serata; }).forEach(function (pass) {
      if (!gruppo_(db, pass.rif)) { esiti.push(pass.codice + ' saltato (gruppo mancante)'); return; }
      var info = infoPromemoria_(db, pass);
      if (info.stato !== 'aperto') { esiti.push(pass.codice + ' saltato (gruppo ' + info.stato + ')'); return; }
      if (info.scadenza < now) { esiti.push(pass.codice + ' saltato (scaduto)'); return; }
      try {
        var canale = emailPromemoriaConferma_(pass, info.s, info, '');
        esiti.push(pass.codice + ' inviata' + (info.capogruppo ? ' (capogruppo)' : '') + ' con ' + canale);
      } catch (err) {
        esiti.push(pass.codice + ' errore: ' + String(err.message).slice(0, 80));
      }
    });
  } finally {
    lock.releaseLock();
  }
  PropertiesService.getScriptProperties().setProperty('PROMEMORIA_ESITO', new Date().toISOString().slice(0, 16) + ' ' + (esiti.join(' · ') || 'nessun pass da confermare'));
}

// prefisso: '' per le email vere, '[Prova …] ' per quelle di prova
function emailPromemoriaConferma_(pass, s, info, prefisso) {
  var data = dataBreve_(s);
  var link = linkPass_(pass.chiave);
  var dim = CONFIG.dimensioneGruppo;
  var entro = dataOra_(info.scadenza);
  var corpo =
    kicker_('Promemoria') +
    titolo_('Ciao ' + esc_(pass.nome) + ', il tuo posto ti aspetta') +
    paragrafo_('Hai chiesto un pass di gruppo per bolla® di ' + giorno_(fineSerata_(s)) + ', ma la tua email non è ancora confermata. ' +
      'Senza conferma il pass non si attiva, né per te né per il tuo gruppo.') +
    bottone_(link, 'Conferma la mia email') +
    riquadro_(
      '<p style="margin:0 0 6px;font-size:15px;font-weight:700">Il tuo gruppo: ' + info.confermati + ' su ' + dim + ' ' +
        (info.confermati === 1 ? 'ha' : 'hanno') + ' confermato</p>' +
      '<p style="margin:0;font-size:14px;line-height:1.5">' + (info.capogruppo
        ? 'Il gruppo l\'hai creato tu: se non confermi, si chiude anche per gli altri.'
        : 'Gli altri aspettano te: il pass arriva a tutti solo quando confermate in ' + dim + '.') + '</p>') +
    (info.capogruppo && info.gruppo && info.membri < dim ?
      '<p style="margin:24px 0 8px;font-size:15px;font-weight:700">Ti manca ancora qualcuno? Gira questo link</p>' +
      '<p style="margin:0 0 12px;padding:12px 14px;border:1.5px dashed #121212;border-radius:12px;background:#ffffff;font-size:14px;word-break:break-all">' +
        '<a href="' + linkGruppo_(info.gruppo.id) + '" style="color:#121212">' + linkGruppo_(info.gruppo.id) + '</a></p>' +
      bottone_('https://wa.me/?text=' + encodeURIComponent('Entra nel mio gruppo per il pass gratuito di bolla® (' + data + '): ' + linkGruppo_(info.gruppo.id)), 'Invia su WhatsApp', true) : '') +
    '<div style="height:24px"></div>' +
    dettagli_(s, data) +
    nota_('Hai tempo fino a ' + entro + '. Dopo, ' + (info.capogruppo ? 'il gruppo si chiude' : 'il tuo posto può passare a qualcun altro') +
      '. Se non ti serve più, ignora questa email.');
  return invia_(pass.email, prefisso + 'Manca solo il tuo clic — bolla® ' + data,
    'Ciao ' + pass.nome + ', la tua email per il pass di gruppo di bolla® del ' + data + ' non è ancora confermata. ' +
      'Conferma entro ' + entro + ' aprendo questo link: ' + link,
    layout_({ banner: 'banner-logo.jpg', anteprima: 'Conferma entro ' + entro + ', poi il pass si attiva', corpo: corpo, s: s, newsletter: vero_(pass.newsletter) }));
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
  righe.push(['Ingresso', (CONFIG.senzaPass ? CONFIG.senzaPass + ' · ' : '') + 'Gratuito con pass']);
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

/* Due canali di invio:
 *  - Brevo (chiave API nelle proprietà dello script, menu bolla® → Imposta chiave Brevo): canale principale per tutte
 *    le email. Mittente sul dominio autenticato bbbbolla.it, molto meno spam. Il QR va in allegato
 *    (Brevo non supporta immagini dentro il testo); il bottone "Apri il pass sul sito" lo mostra comunque.
 *  - Gmail (MailApp, 100 al giorno): solo di riserva, se Brevo non è collegato o rifiuta l'invio. */
function invia_(a, oggetto, testo, html, immagini) {
  var brevo = chiaveBrevo_();
  var quota = quotaGmail_();
  var gmailLibero = quota !== 0;
  // EMAIL_GMAIL_PRIMA (proprietà dello script): Gmail come canale principale, Brevo di riserva (es. Brevo non consegna)
  var ordine = !brevo ? ['gmail'] : usaGmail_(quota) ? ['gmail', 'brevo'] : ['brevo', 'gmail'];
  var ultimoErrore = null;
  for (var i = 0; i < ordine.length; i++) {
    try {
      if (ordine[i] === 'brevo') {
        if (!brevo) continue;
        inviaBrevo_(brevo, a, oggetto, testo, html, immagini);
      } else {
        if (!gmailLibero) continue;
        inviaGmail_(a, oggetto, testo, html, immagini);
      }
      return ordine[i];
    } catch (err) {
      ultimoErrore = err;
      console.error('Invio con ' + ordine[i] + ' non riuscito a ' + a + ': ' + err);
    }
  }
  throw ultimoErrore || new Error('Nessun canale email disponibile');
}

function inviaGmail_(a, oggetto, testo, html, immagini) {
  var opzioni = { name: CONFIG.nomeMittente, htmlBody: html };
  if (immagini) opzioni.inlineImages = immagini;
  if (CONFIG.replyTo) opzioni.replyTo = CONFIG.replyTo;
  MailApp.sendEmail(a, oggetto, testo, opzioni);
}

function inviaBrevo_(chiave, a, oggetto, testo, html, immagini) {
  var corpo = {
    sender: { name: CONFIG.nomeMittente, email: CONFIG.mittenteBrevo },
    to: [{ email: a }],
    subject: oggetto,
    htmlContent: html,
    textContent: testo,
    tags: ['bolla-pass'],
    // aiuta Gmail e Outlook a considerare le email legittime (e a non metterle in spam)
    headers: { 'List-Unsubscribe': '<mailto:' + CONFIG.replyTo + '?subject=cancellami>' }
  };
  if (CONFIG.replyTo) corpo.replyTo = { email: CONFIG.replyTo };
  if (immagini && immagini.qr) {
    // niente immagini inline su Brevo: il QR va in allegato e nel testo c'è il bottone per aprire il pass
    corpo.htmlContent = html.replace(/<img src="cid:qr"[^>]*>/,
      '<div style="width:200px;padding:24px 12px;border:1.5px dashed #121212;border-radius:14px;font-size:14px;line-height:1.45;color:#121212">' +
      'Il tuo QR è <strong>allegato</strong> a questa email.<br>Lo trovi anche toccando <strong>Apri il pass sul sito</strong> qui sotto.</div>');
    corpo.attachment = [{ name: 'pass-bolla-qr.gif', content: Utilities.base64Encode(immagini.qr.getBytes()) }];
  }
  var r = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'api-key': chiave, accept: 'application/json' },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });
  if (r.getResponseCode() >= 300) throw new Error('Brevo ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
}

function chiaveBrevo_() {
  return PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY');
}

// Email Gmail ancora inviabili oggi; -1 se Google in quel momento non risponde (capita): in quel caso si prova a inviare lo stesso.
function quotaGmail_() {
  try {
    return MailApp.getRemainingDailyQuota();
  } catch (err) {
    console.error('Quota Gmail non leggibile: ' + err);
    return -1;
  }
}

function gmailPrima_() {
  return PropertiesService.getScriptProperties().getProperty('EMAIL_GMAIL_PRIMA') === 'si';
}

// Gmail prima di Brevo finché restano più di CONFIG.riservaGmail email oggi (quota -1 = non leggibile: Gmail resta)
function usaGmail_(quota) {
  return gmailPrima_() && (quota < 0 || quota > CONFIG.riservaGmail);
}

function quotaOk_() {
  return !!chiaveBrevo_() || quotaGmail_() !== 0;
}

function impostaChiaveBrevoDaMenu() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Chiave Brevo', 'Incolla la chiave API di Brevo (Brevo → SMTP & API → API Keys). Lascia vuoto per scollegare Brevo.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var chiave = r.getResponseText().trim();
  var props = PropertiesService.getScriptProperties();
  if (chiave) props.setProperty('BREVO_API_KEY', chiave); else props.deleteProperty('BREVO_API_KEY');
  ui.alert(chiave ? 'Chiave salvata. Ora usa "Invia email di prova" per controllare.' : 'Brevo scollegato: le email partono solo da Gmail.');
}

// Email di prova automatica: l'esito (mai la chiave) resta nelle proprietà e compare nella pagina di stato del backend
function provaBrevo_() {
  var props = PropertiesService.getScriptProperties();
  var chiave = chiaveBrevo_();
  if (!chiave) return;
  try {
    inviaBrevo_(chiave, CONFIG.replyTo, '[Prova] bolla® via Brevo', 'Email di prova inviata con Brevo.',
      layout_({ banner: 'banner-sfera.jpg', anteprima: 'Email di prova', corpo: kicker_('Prova') + titolo_('Brevo funziona') +
        paragrafo_('Questa email è partita da Brevo con mittente ' + CONFIG.mittenteBrevo + '.'), s: { titolo: 'bolla®' }, newsletter: false }), null);
    props.setProperty('BREVO_ESITO', 'ok ' + new Date().toISOString());
  } catch (err) {
    props.setProperty('BREVO_ESITO', 'errore ' + new Date().toISOString() + ': ' + String(err.message).slice(0, 300));
  }
}

// Manda a te (replyTo) un'email di prova con QR passando da Brevo, per verificare chiave, mittente e dominio
function emailProvaDaMenu() {
  var ui = SpreadsheetApp.getUi();
  var chiave = chiaveBrevo_();
  if (!chiave) { ui.alert('Prima imposta la chiave Brevo dal menu.'); return; }
  var db = carica_();
  var s = serata_(db, db.Serate[0] && db.Serate[0].id);
  var finto = { nome: 'Prova', cognome: 'Brevo', email: CONFIG.replyTo, codice: 'BOL-PROVA', chiave: token_(24), tipo: 'invito', newsletter: 'FALSE' };
  try {
    var data = dataBreve_(s);
    inviaBrevo_(chiave, CONFIG.replyTo, '[Prova] Il tuo pass bolla® — ' + data, 'Email di prova inviata con Brevo.',
      layout_({ banner: 'banner-sfera.jpg', anteprima: 'Email di prova', corpo: kicker_('Prova') + titolo_('Brevo funziona') +
        paragrafo_('Questa email è partita da Brevo con mittente ' + CONFIG.mittenteBrevo + '. Sotto trovi il QR come appare nelle email inviate con Brevo.') +
        '<img src="cid:qr" width="200" height="200" alt="">', s: s, newsletter: false }),
      { qr: qrBlob_(finto.chiave) });
    ui.alert('Email di prova inviata a ' + CONFIG.replyTo + '. Controlla la posta (anche lo spam).');
  } catch (err) {
    ui.alert('Invio con Brevo non riuscito:\n\n' + err.message);
  }
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

// Ogni valore va sotto la sua intestazione: il foglio resta giusto anche se qualcuno sposta o inserisce colonne.
function appendi_(nome, obj) {
  var sh = SpreadsheetApp.getActive().getSheetByName(nome);
  var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  COLONNE[nome].forEach(function (c) {
    if (head.indexOf(c) < 0) { head.push(c); sh.getRange(1, head.length).setValue(c); }
  });
  sh.appendRow(head.map(function (h) {
    return COLONNE[nome].indexOf(h) < 0 || obj[h] == null ? '' : cella_(obj[h]);
  }));
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

// "venerdì 30 ottobre"
function giorno_(d) {
  var p = Utilities.formatDate(d, TZ, 'yyyy-MM-dd').split('-').map(Number);
  var giorni = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  return giorni[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()] + ' ' + p[2] + ' ' + mesi[p[1] - 1];
}

// "venerdì 30 ottobre alle 18:00"
function dataOra_(d) {
  return giorno_(d) + ' alle ' + Utilities.formatDate(d, TZ, 'HH:mm');
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
