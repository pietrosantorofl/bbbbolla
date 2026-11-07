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
 *   Serate  id | titolo | data | capienza | aperta | orario | luogo | senza_pass | chiusura_pass | chiusura_gruppi |
 *           promemoria | solleciti | regalo | recap | recap_a        (vedi "Serate e automazioni")
 *   Inviti  token | etichetta | serata | max | scadenza | attivo | creato   (ogni invito vale per tutte le serate:
 *           la colonna serata non conta più; max = pass per serata)
 *   Gruppi  id | serata | creato | scadenza | capogruppo | stato | completato | confermati
 *   Pass    creato | serata | tipo | rif | nome | cognome | email | email_norm | chiave | codice | stato | confermato | checkin | newsletter | checkin_da
 *   Attesa  creato | serata | nome | cognome | email | email_norm | arrivato_da | newsletter | note
 *   Contatti creato | email_norm | email | nome | cognome | newsletter | prima | ultima | serate | aggiornato   (una riga per persona)
 *   Eventi  id | tipo | titolo | serata | inizio | posti | max_persone | foglio | attivo | avvisa   (workshop, cene… con prenotazione)
 *   Prenotazioni creato | evento | nome | cognome | telefono | telefono_norm | persone | note
 *   Workshop, Cena: prenotazioni dei primi eventi (stesso schema, colonna "workshop" o "cena" al posto di "evento")
 *   Archivio …: le righe delle serate passate, spostate dalla sveglia (vedi "Archivio")
 *
 * Web App: POST body JSON { action, ... } con action = stato | crea_gruppo | unisciti | invito | pass
 */

var CONFIG = {
  nomeMittente: 'bolla®',
  replyTo: 'bollacatania@gmail.com',   // le risposte alle email arrivano qui
  mittenteBrevo: 'pass@bbbbolla.it',   // mittente delle email inviate con Brevo (dominio da autenticare su Brevo)
  sito: 'https://bbbbolla.it',
  // valori di partenza: ogni serata può cambiarli nelle sue colonne del foglio Serate (luogo, orario, senza_pass…)
  luogo: 'MONO, Via Gornalunga 12, 95129 Catania CT',   // compare nelle email
  orario: 'dalle 20:00',          // compare nelle email
  senzaPass: '5€ al botteghino dopo le 22:30',  // compare nelle email ('' = niente)
  newsletterObbligatoria: true,   // deve coincidere con newsletterObbligatoria in js/config.js
  dimensioneGruppo: 3,
  chiusuraGruppi: '22:00',        // il giorno della serata: entro quest'ora il gruppo va completato, dopo non se ne creano di nuovi
  chiusuraPass: '22:00',          // il giorno della serata: da quest'ora nessun pass nuovo; il modulo resta, all'invio risponde "esauriti"
  oreConferma: 48,                // dopo, un membro che non ha confermato perde il posto nel gruppo
  minutiTraReinvii: 15,           // anti-spam: ogni quanto si può rimandare il link alla stessa persona
  riservaGmail: 20,               // con Gmail come canale principale: a queste email rimaste oggi si passa a Brevo

  /* anti-bot */
  secondiMinimiModulo: 4,         // un modulo inviato prima di N secondi dall'apertura viene respinto
  oreValiditaModulo: 2,           // dopo, il modulo va ricaricato
  maxRegistrazioniAlMinuto: 60,   // tetto globale: oltre, le richieste vengono respinte per un minuto

  /* serata nuova dal menu del foglio (bolla® → Nuova serata…). Dal 07.11 nessun invio automatico (scelta dell'utente):
     automazioni vuote = spente. Per riaccenderne una scrivi l'ora nella riga della serata (es. promemoria "-2 14:00",
     solleciti "09:30", regalo "18:00, 22:00", recap "16:00, 17:00, 18:00, 19:00"). */
  nuovaSerata: {
    promemoria: '',
    solleciti: '',
    regalo: '',                             // vuoto = chi è in un gruppo incompleto non riceve il pass
    recap: '',
    recapA: 'pietrosantoro90@gmail.com, tommiferrara@gmail.com'
  },

  /* archivio: le righe di una serata passano nei fogli "Archivio …" dopo questi giorni, di notte */
  giorniPrimaArchivio: 2,
  oreArchivio: [3, 6],            // tra le 3:00 e le 6:00, quando nessuno usa il sito

  /* email temporanee: lista pubblica aggiornata (~10.000 domini) + controllo che il dominio riceva posta */
  listaUsaEGetta: 'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf',
  controlloDominio: true,

  /* live: cosa prova il pubblico, sulle visuals (bbbbolla.it/live/) */
  liveSecondiTraInvii: 30,        // ogni telefono può mandare un'emozione ogni N secondi
  liveMaxAlMinuto: 120,           // tetto globale di invii al minuto
  liveMemoria: 80                 // quanti invii restano in cache per lo schermo
};

var TZ = 'Europe/Rome';
var COLONNE = {
  Serate: ['id', 'titolo', 'data', 'capienza', 'aperta', 'orario', 'luogo', 'senza_pass', 'chiusura_pass', 'chiusura_gruppi',
    'promemoria', 'solleciti', 'regalo', 'recap', 'recap_a'],
  Inviti: ['token', 'etichetta', 'serata', 'max', 'scadenza', 'attivo', 'creato'],
  Gruppi: ['id', 'serata', 'creato', 'scadenza', 'capogruppo', 'stato', 'completato', 'confermati'],
  Pass: ['creato', 'serata', 'tipo', 'rif', 'nome', 'cognome', 'email', 'email_norm', 'chiave', 'codice', 'stato', 'confermato', 'checkin', 'newsletter', 'checkin_da'],
  Attesa: ['creato', 'serata', 'nome', 'cognome', 'email', 'email_norm', 'arrivato_da', 'newsletter', 'note'],
  Contatti: ['creato', 'email_norm', 'email', 'nome', 'cognome', 'newsletter', 'prima', 'ultima', 'serate', 'aggiornato'],
  Live: ['creato', 'serata', 'nickname', 'colore', 'emozione', 'dispositivo'],
  Eventi: ['id', 'tipo', 'titolo', 'serata', 'inizio', 'posti', 'max_persone', 'foglio', 'attivo', 'avvisa'],
  Prenotazioni: ['creato', 'evento', 'nome', 'cognome', 'telefono', 'telefono_norm', 'persone', 'note'],
  Workshop: ['creato', 'workshop', 'nome', 'cognome', 'telefono', 'telefono_norm', 'note'],
  Cena: ['creato', 'cena', 'nome', 'cognome', 'telefono', 'telefono_norm', 'persone', 'note']
};
var COLONNE_TESTO = ['id', 'data', 'serata', 'rif', 'chiave', 'codice', 'capogruppo', 'token', 'email', 'email_norm', 'nome', 'cognome',
  'workshop', 'telefono', 'telefono_norm', 'cena', 'confermati', 'evento', 'prima', 'ultima', 'inizio',
  'orario', 'chiusura_pass', 'chiusura_gruppi', 'promemoria', 'solleciti', 'regalo', 'recap'];
// fogli delle prenotazioni agli eventi: colonna con l'id dell'evento
var COLONNA_EVENTO = { Prenotazioni: 'evento', Workshop: 'workshop', Cena: 'cena' };
// fogli spostati in archivio, con la colonna che dice a quale serata appartiene la riga
var DA_ARCHIVIARE = { Pass: 'serata', Gruppi: 'serata', Attesa: 'serata', Live: 'serata' };
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
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('bolla®')
    .addItem('Nuova serata…', 'nuovaSerataDaMenu')
    .addItem('Crea link invito…', 'creaInvitoDaMenu')
    .addItem('Esporta newsletter', 'esportaNewsletter')
    .addSeparator()
    .addItem('Crea link segreto staff (app ingresso)', 'creaLinkStaffDaMenu')
    .addItem('Crea link segreto visuals (schermo e regia)', 'creaLinkVisualsDaMenu')
    .addItem('Crea link segreto dashboard (numeri)', 'creaLinkDashboardDaMenu')
    .addItem('Crea link segreto pagina di stato (backend)', 'creaLinkStatoDaMenu')
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
    '\n\nVale per tutte le serate (il tetto vale per ogni serata). Per limitarlo a una serata scrivi il suo id nella colonna "serata". ' +
    'Per spegnerlo scrivi FALSE in "attivo".', ui.ButtonSet.OK);
}

// Una riga nel foglio Serate, con le automazioni di CONFIG.nuovaSerata già compilate (si cambiano nella riga).
// Il sito mostra la serata quando la aggiungi anche in js/config.js, con lo stesso id.
function nuovaSerataDaMenu() {
  var ui = SpreadsheetApp.getUi();
  var r1 = ui.prompt('Nuova serata', 'Data (AAAA-MM-GG, es. 2026-11-13). Diventa anche l\'id della serata.', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var data = r1.getResponseText().trim();
  if (!/^\d{4}-\d\d-\d\d$/.test(data)) { ui.alert('Data non valida: scrivila come 2026-11-13.'); return; }
  var db = carica_(['Serate']);
  if (trova_(db.Serate, 'id', data)) { ui.alert('Esiste già una serata con id ' + data + '.'); return; }
  var r2 = ui.prompt('Nuova serata', 'Titolo (compare nelle email e nell\'app ingresso):', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var r3 = ui.prompt('Nuova serata', 'Capienza (posti per i pass):', ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;
  var capienza = Math.floor(Number(r3.getResponseText().trim()));
  if (!(capienza > 0)) { ui.alert('Numero non valido.'); return; }
  var n = CONFIG.nuovaSerata;
  appendi_('Serate', { id: data, titolo: r2.getResponseText().trim() || 'bolla®', data: data, capienza: capienza, aperta: 'TRUE',
    promemoria: n.promemoria, solleciti: n.solleciti, regalo: n.regalo, recap: n.recap, recap_a: n.recapA });
  ui.alert('Serata ' + data + ' creata', 'Automazioni nella riga (cancella una cella per spegnerla):\n' +
    '• promemoria di conferma: ' + (n.promemoria || 'no') + '\n• solleciti: ' + (n.solleciti || 'no') +
    '\n• pass dati lo stesso ai gruppi incompleti: ' + (n.regalo || 'no') + '\n• recap: ' + (n.recap || 'no') +
    '\n\nLuogo, orario e prezzo senza pass: se diversi dal solito, scrivili nelle colonne luogo, orario, senza_pass.' +
    '\nRicorda di aggiungere la serata anche in js/config.js (line-up), con id ' + data + '.', ui.ButtonSet.OK);
}

/* ============================================================
   HTTP
   ============================================================ */

// Aprire l'URL della Web App da browser: crea i fogli se mancano e mostra lo stato.
// La prima volta, da proprietario, Google chiede anche le autorizzazioni.
// Dal 07.11 la pagina di stato si vede solo con il link segreto (…/exec?k=<segreto>, menu del foglio):
// senza, una riga e basta, nessuna lettura dei fogli e nessun lavoro.
function doGet(e) {
  if (!accessoStato_(e && e.parameter && e.parameter.k)) {
    Utilities.sleep(800);
    return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p style="font-family:Helvetica,Arial,sans-serif">bolla&reg;</p>')
      .setTitle('bolla®');
  }
  setup();
  aggiornamentiUnaTantum_(); // idempotente: ogni aggiornamento gira una volta sola
  var db = carica_(['Serate', 'Pass', 'Gruppi', 'Eventi']);
  aggiornaConfermati_(db);
  var props = PropertiesService.getScriptProperties();
  var emailEventi = props.getProperty('EVENTI_BREVO_EMAIL');
  if (emailEventi && chiaveBrevo_()) eventiBrevo_(emailEventi);
  var sveglia = installaSveglia_();
  var ss = SpreadsheetApp.getActive();
  var quota = quotaGmail_();
  var s = prossimaSerata_(db);
  var riga = function (testo, k) { return '<p>' + testo + ': ' + esc_(props.getProperty(k) || 'nessuno') + '</p>'; };
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:40px auto;padding:0 16px">' +
    '<h1 style="font-size:40px;margin:0">bolla&reg;</h1>' +
    '<p style="font-size:18px">Backend dei pass attivo.</p>' +
    '<p>Fogli: ' + Object.keys(COLONNE).map(function (n) { return ss.getSheetByName(n) ? n + ' ✓' : n + ' ✗'; }).join(' · ') + '</p>' +
    '<p>Email Gmail ancora inviabili oggi: ' + (quota < 0 ? 'non disponibile ora' : quota) + '</p>' +
    '<p>Brevo: ' + (chiaveBrevo_() ? 'collegato ✓' : 'non collegato') + '</p>' +
    '<p>Canale email principale: ' + (chiaveBrevo_() && !usaGmail_(quota) ? 'Brevo' : 'Gmail') +
      (gmailPrima_() ? ' (Gmail finché restano più di ' + CONFIG.riservaGmail + ' email oggi, poi Brevo)' : '') + '</p>' +
    '<p>Prossima serata: ' + (s ? esc_(s.id + ' — ' + s.titolo) : 'nessuna') + '</p>' + (s ? automazioniInfo_(s) : '') +
    riga('Ultima prova Brevo', 'BREVO_ESITO') +
    riga('Promemoria di conferma', 'PROMEMORIA_ESITO') +
    riga('Solleciti', 'SOLLECITI_ESITO') +
    riga('Pass dati lo stesso (gruppi incompleti)', 'REGALO_ESITO') +
    riga('Recap orari', 'RECAP_ESITO') +
    riga('Backup nel Drive', 'BACKUP_ESITO') +
    riga('Archivio', 'ARCHIVIO_ESITO') +
    riga('Contatti', 'CONTATTI_ESITO') +
    riga('Avvisi prenotazioni eventi', 'AVVISI_ESITO') +
    riga('Ricerca segnalazione', 'CERCA_ESITO') +
    riga('QR esterni', 'QR_ESTERNI_ESITO') +
    riga('Colonne vuote del foglio Cena', 'CENA_COLONNE_ESITO') +
    riga('Mail Vibes', 'VIBES_ESITO') +
    riga('Mail Vibes secondo Brevo', 'VIBES_VERIFICA') +
    riga('Mail invito', 'INVITO_ESITO') +
    riga('Mail invito, destinatari', 'INVITO_CONTEGGIO') +
    riga('Eventi Brevo', 'EVENTI_BREVO') +
    '<p>Sveglia automatica: ' + sveglia + '</p>' +
    erroriAggiornamenti_() + colonneSfasate_(ss) + confermeInSospeso_(db) + (s ? gruppiInSospeso_(db, s.id) : '') + '</div>';
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
      case 'dashboard': return json_(azioneDashboard_(d));
      case 'evento_stato': return json_(azioneEventoStato_(d));
      case 'evento_prenota': return json_(azioneEventoPrenota_(d));
      // pagine dei primi eventi (workshop.html, 6nov-tavolacunzata): stesse azioni, risposta nel loro formato
      case 'workshop_stato': return json_(azioneEventoStato_(d, 'workshop'));
      case 'workshop_prenota': return json_(azioneEventoPrenota_(d, 'workshop'));
      case 'cena_stato': return json_(azioneEventoStato_(d, 'cena'));
      case 'cena_prenota': return json_(azioneEventoPrenota_(d, 'cena'));
    }
    return json_(errore_('dati', 'Azione sconosciuta.'));
  } catch (err) {
    console.error(err && err.stack || err);
    return json_(errore_('server', 'Errore temporaneo. Riprova tra poco.'));
  }
}

/* ---------- sveglia ----------
 * Apps Script "si addormenta" dopo qualche minuto senza richieste e la prima risposta
 * può impiegare oltre 20 secondi. Un trigger ogni 5 minuti tiene caldi script, cache e foglio,
 * e intanto fa il lavoro a orario: automazioni delle serate e archivio.
 * Lo installa doGet: basta aprire l'URL della Web App da proprietario.
 * Google concede ai trigger 90 minuti al giorno: la sveglia legge solo i fogli che servono, una volta. */
function sveglia() {
  CacheService.getScriptCache().get('sveglia');
  aggiornamentiUnaTantum_();
  // finché l'ultima prova Brevo è fallita, riprova a ogni giro: quando funziona arriva l'email e si ferma
  var esitoBrevo = PropertiesService.getScriptProperties().getProperty('BREVO_ESITO') || '';
  if (chiaveBrevo_() && esitoBrevo.indexOf('errore') === 0) provaBrevo_();
  dominiUsaEGetta_();
  var db = carica_(['Serate', 'Pass', 'Gruppi']);
  aggiornaConfermati_(db);
  automazioni_(db);
  archivio_(db);
}

// Colonna "confermati" del foglio Gruppi (es. 2/3), solo da leggere: la riscrive la sveglia ogni 5 minuti,
// solo per le serate da ieri in poi e solo nelle celle cambiate. Un errore qui non deve fermare la sveglia.
function aggiornaConfermati_(db) {
  try {
    if (!db.Gruppi.length) return;
    var col = db.Gruppi[0]._head.indexOf('confermati') + 1;
    db.Gruppi.forEach(function (g) {
      if (!g.id || !serataInCorso_(db, g.serata)) return;
      var v = statoGruppo_(db, g).confermati.length + '/' + CONFIG.dimensioneGruppo;
      if (String(g.confermati) === v) return;
      // l'apostrofo tiene il testo: "1/3" altrimenti diventa una data
      g._foglio.getRange(g._riga, col).setValue("'" + v);
      g.confermati = v;
    });
  } catch (err) {
    console.error('Colonna confermati non aggiornata: ' + err);
  }
}

// Modifiche ai dati da fare una volta sola: partono con la sveglia (ogni 5 minuti), ognuna segnata
// nelle proprietà dello script così non si ripete. Poi la riga puoi cambiarla a mano nel foglio.
// Le voci già fatte si tolgono da qui (restano nella storia di git): ogni giro rilegge solo quelle nuove.
// Promemoria, solleciti, pass regalo e recap non stanno qui: si impostano per serata nel foglio Serate.
function aggiornamentiUnaTantum_() {
  var props = PropertiesService.getScriptProperties();
  var fatti = props.getProperties();
  [
    // i primi due eventi con prenotazione passano dalla configurazione nel codice al foglio Eventi
    { id: 'eventi-iniziali-2026-11', fai: function () {
      var db = carica_(['Eventi']);
      [
        { id: 'cumbia-2026-10-30', tipo: 'workshop', titolo: 'La Cumbia tradizionale colombiana', serata: '2026-10-30',
          inizio: '2026-10-30 20:00', posti: 40, max_persone: 0, foglio: 'Workshop', attivo: 'TRUE' },
        { id: 'tavolacunzata-2026-11-06', tipo: 'cena', titolo: 'Cena colombiana — Tavola Cunzata', serata: '2026-11-06',
          inizio: '2026-11-06 20:00', posti: 0, max_persone: 6, foglio: 'Cena', attivo: 'TRUE' }
      ].forEach(function (e) { if (!trova_(db.Eventi, 'id', e.id)) appendi_('Eventi', e); });
    } },
    // una riga per persona nel foglio Contatti, dai pass confermati (newsletter: vale l'ultima disiscrizione)
    { id: 'contatti-da-pass-2026-11', fai: function () {
      ricostruisciContatti_();
    } },
    // di nuovo, con anche i disiscritti che non hanno un pass confermato
    { id: 'contatti-con-disiscritti-2026-11', fai: function () {
      ricostruisciContatti_();
    } },
    // richiesta dell'utente (01.11): backup nel Drive e archivio del 30.10 subito, senza aspettare la notte.
    // L'archivio parte solo con il backup verificato; l'esito è nelle righe Backup e Archivio della pagina di stato.
    { id: 'backup-e-archivio-2026-10-30', fai: function () {
      var s = serata_(carica_(['Serate']), '2026-10-30');
      if (s && !PropertiesService.getScriptProperties().getProperty('archiviata:' + s.id)) archiviaSerata_(s);
    } },
    // la riga del 30.10 come esempio di compilazione (richiesta dell'utente): i valori usati davvero quella sera.
    // Serata passata: serataInCorso_ è falso, quindi le automazioni non ripartono.
    // cena del 6.11 (richiesta dell'utente): da 1 a 20 persone per prenotazione e avviso a ogni prenotazione
    { id: 'cena-2026-11-06-persone-20-avvisi', fai: function () {
      var db = carica_(['Eventi']);
      var e = trova_(db.Eventi, 'id', 'tavolacunzata-2026-11-06');
      if (e) aggiorna_(db.Eventi, e, { max_persone: 20, avvisa: 'pietrosantoro90@gmail.com, sipariomarchese@gmail.com' });
    } },
    // workshop di samba del 6.11 (richiesta dell'utente, 04.11): prenotazioni nel foglio Prenotazioni, 40 posti come la cumbia
    { id: 'workshop-samba-2026-11-06', fai: function () {
      var db = carica_(['Eventi']);
      if (!trova_(db.Eventi, 'id', 'samba-2026-11-06')) appendi_('Eventi', { id: 'samba-2026-11-06', tipo: 'workshop',
        titolo: 'Workshop di Samba e Percussioni', serata: '2026-11-06', inizio: '2026-11-06 19:00', posti: 40, max_persone: 0, foglio: '', attivo: 'TRUE' });
    } },
    { id: 'serata-2026-10-30-esempio', fai: function () {
      var db = carica_(['Serate']);
      var r = trova_(db.Serate, 'id', '2026-10-30');
      if (r) aggiorna_(db.Serate, r, { orario: 'dalle 20:00', luogo: 'MONO, Via Gornalunga 12, 95129 Catania CT',
        senza_pass: '5€ al botteghino dopo le 22:30',
        // l'apostrofo tiene il testo così com'è: "22:00" non diventa un orario, "-2 14:00" non diventa un numero
        chiusura_pass: "'22:00", chiusura_gruppi: "'22:00", promemoria: "'-2 14:00", solleciti: "'09:15",
        regalo: "'18:00, 22:00", recap: "'16:00, 17:00, 18:00, 19:00",
        recap_a: 'pietrosantoro90@gmail.com, tommiferrara@gmail.com' });
    } },
    // mail Vibes del 30.10 (richiesta dell'utente, 02.11): prima una prova a Pietro, poi a tutti gli iscritti il 03.11 alle 17:00
    { id: 'vibes-2026-10-30-prova', fai: function () { mailVibes_('2026-10-30', VIBES_30_10.prova('pietrosantoro90@gmail.com')); } },
    // seconda prova con i testi nuovi e senza il titolo della serata in fondo (richiesta dell'utente, 02.11)
    { id: 'vibes-2026-10-30-prova-2', fai: function () { mailVibes_('2026-10-30', VIBES_30_10.prova('pietrosantoro90@gmail.com')); } },
    // terza prova: tolta la frase "Grazie a chi c'era…" (richiesta dell'utente, 02.11)
    { id: 'vibes-2026-10-30-prova-3', fai: function () { mailVibes_('2026-10-30', VIBES_30_10.prova('pietrosantoro90@gmail.com')); } },
    // quarta prova: tolta anche "Aiutaci a raccogliere foto e video della serata!" (richiesta dell'utente, 02.11)
    { id: 'vibes-2026-10-30-prova-4', fai: function () { mailVibes_('2026-10-30', VIBES_30_10.prova('pietrosantoro90@gmail.com')); } },
    { id: 'vibes-2026-10-30', dopo: '2026-11-03 17:00', fai: function () { mailVibes_('2026-10-30', VIBES_30_10.tutti()); } },
    // conferma da Brevo che la mail Vibes del 03.11 è arrivata: consegne, rimbalzi, blocchi, aperture (richiesta dell'utente, 04.11)
    // mail d'invito al 6.11 con la locandina e i link: prima solo la prova a Pietro (richiesta dell'utente, 05.11)
    { id: 'invito-2026-11-06-prova', fai: function () { mailInvito_('2026-11-06', INVITO_06_11.prova('pietrosantoro90@gmail.com')); } },
    // conteggio dei destinatari, senza inviare (richiesta dell'utente, 05.11)
    { id: 'invito-2026-11-06-conteggio', fai: function () { contaInvito_('2026-11-06', INVITO_06_11.tutti()); } },
    // di nuovo, con il limite spostato al 30.10 compreso
    { id: 'invito-2026-11-06-conteggio-2', fai: function () { contaInvito_('2026-11-06', INVITO_06_11.tutti()); } },
    // invio a tutti il 05.11 alle 18:30; se per qualche motivo non è finito entro le 18:00 del giorno della serata, non si continua
    { id: 'invito-2026-11-06', dopo: '2026-11-05 18:30', fai: function () {
      if (new Date() > Utilities.parseDate('2026-11-06 18:00', TZ, 'yyyy-MM-dd HH:mm')) {
        accoda_('INVITO_ESITO', new Date().toISOString().slice(0, 16) + ' 2026-11-06: troppo tardi, invio fermato');
        return;
      }
      mailInvito_('2026-11-06', INVITO_06_11.tutti());
    } },
    // 95 QR di un'altra biglietteria per la serata del 6.11 (richiesta dell'utente, 06.11), sotto lock
    // perché la serata è aperta e i codici BOL- dei pass nuovi non devono sovrapporsi. Esito: "QR esterni" in /exec.
    { id: 'qr-esterni-2026-11-06', fai: function () {
      var out = conLock_(function () { aggiungiQrEsterni_('2026-11-06', [
        '1FC13BY43G6B67Q2RK6YT6B248', 'DSHR9GJ4AQ8NM122H7SXCWB9CG', 'K74D2KTGK3WVMPJEVS0B98NZ1T', 'F7SRFK62QRNP0C7RH6F3TWX0C0',
        'PCP0K6DP1K5QTQ15HG05WX6RM4', 'TJEMXXGZ2WPH33PG01RJYPS29K', '2Y2ZSGMPXFMBWXK10TDFW7ZJVM', 'Z18J72MM74VHG28TB68KPVJ5EW',
        'YYSD7PTE20KQF183GEBK2EHVNV', '4QF7A46BFCP704C0TQN5JT3Z95', 'GHHE6NWDYDD36K171ZR64Z7G7C', 'D51XKPMB9ZJK520XWRXY9PCV65',
        'TVHKYAYNT9WV7TR01SKJE6TM2R', 'H9XQNFXAE28QG3V1M40MV4HJMG', 'ZFE78Y8NJZS1GB4NA548G4AWFB', 'EMWGPFAR7J13EVV3B5GZMQ5R2V',
        'F5F4RFYYV48YC3HN40YNVTJC2C', 'J7FBKHZP4MJHNE4AE7ZHG8G2YZ', '5PQRF76R8K6PAG1EHDVGSWQRQG', 'VAWYE1PXYQDE059R1K9TFBR4M6',
        '007YB6N3RMQT9ZR4AZH7XKH1AA', '6P7H7E4CMJXAECCY4PSA6KDJ1C', '80841WRKF3WH057J3QVMG3YSZX', 'E40DFCCFPTTWK5NKS6AXBQ20A2',
        '9EH3XW59K2ZDFG7B6DNQZP33KN', '4W0V5X7V5ZQVPC17H1Z75SGM8M', 'JCM1CB4Q2T586908RY2TTFD6VR', 'NZR9BAS47BWQH37PNM8980VGPJ',
        '3SP5RP4EV2PAYYYY082K424V1S', 'CZZ2A6G6RH5GZDFPH2KTM8K6N7', 'CW5RX2G8AS8X97703DZKF95PV3', '0T1AWGY8G4HQ9FZ79J3YVXB42A',
        'R7FRSG1YYP0WZA5S0EMB1VXJ77', 'KZC3EBK7B8T47P8X0T62GZE2KF', 'H4HVG1X37NVG2XRA44N0VX25NP', 'K8ZGDEH38MRB6F84JYMGFMK73Q',
        'G7TD9JTEZHCNPM899FAZC5BKGV', '6BH31A6QRNZ8CT74GVNSZZER6H', '0ZA6TFXTVA0NWP0Y2BCWR5KKPW', '78Z1RXHF8SK8KMP7FPM3TMS6RT',
        '6EZHXTEM2HTXRE34HFW1FD43YP', 'HXQKVVM44KGVXVE57K36PF005M', 'DSCTA4VENK589EVN5MW203W732', 'SD3RCDNG1GSE4V18ASE49TA5T7',
        '8MB48Z2Y2WG62ZN5NEJ9Q687YJ', 'P9NTQ1YS642T1TPQPG3DPT4794', '9QD6Q64NV3F9YRT82P6F45RCRT', 'D0RNJBVRJA2265RCGAN89M34QF',
        '1EMT8XD230NQA267KKVAP1V8AE', 'XDR2WQCSGVMM6N830C1M4MQVWV', 'B0X050YTBY349QJJ5DAZBX2R8E', 'YWEC0M36P4MPNM7CMRX2H6W4NZ',
        'ZXVX0SST1GHX2MA8SE3P4XJFY3', 'JH5K7D6M1D1BWXXWK7E14NEEHZ', 'WDZGGBQ2Z8DTRWARVHVK2AMAV4', 'RKJ2CSD64KEDXGNX00PS4ZYRRH',
        '5WF4NB32GNR1881JG5T0WY19A6', '5N3ND0JDAS9DCC2SFRA9D7HHDB', 'GCCT0A3B175YAQM99ZMB2G3YZH', 'CBBP8JPDJR8XEB2A3MPFAN9HT8',
        'FM2AV7CC7HQN160P9F12QNKB82', 'GN3SMQM251NZ2PP703FPA1WTPM', 'G7TGMGPZM3VT5APRG775QAPTRR', 'VBK4JS1NE3Z1M3Z0GC1QVW7W1T',
        '29HZRA2JN5PCT0NVXZFD8CZ5ME', 'S5NV4WPMRDP4T7QHAJV00DX320', '03GANQK20Z01FMQTMF7FX0ME9M', 'TJE9X94YTK9P3GSWE7A3Z6WY03',
        'X9NWX3WJ5SFQJQW7WY20ACTSK3', 'W3ZDV5A5BASX7CWJRJFC0QGYEF', '9C6H15DWCVDEHWEVBAQK2JAT99', '4JFPE8DQDTWY1SRBEXRYGAY4XN',
        'NV93ZAEEHWR53MBXMZRXVEMQPP', '39H5D34Z83RG6RZ5RA7NXVZEQA', 'CMRA7EXZMKH2ZQS5GEWQAYFV09', 'TER32A03G3XQAT8017FGXK00WG',
        'SQQYGX3NHFS31HWG6E5P9FTD6Z', '6K8D8D6DF46C2S1TVNB7H7ZBP3', 'KVA55ABKSK88Y86031WDB8QV0H', 'FZTGARZKCVNVWN5NW7GVE27JT0',
        'BPKWX4T0ESKT8XT9SXR78HZH8T', '318G2GKRKCCBD4PDKBCSXAAN12', 'ZS7FBGBV8S4J1XBZXQ8VSSB4W3', 'G968DD5A0ZZ3BB1H5PDWN7FQFT',
        '44SKD7YVKZA46YMZP41FVW9VZ6', 'A6APEQ64AR8V8JH2308AA1XNV6', 'SEY8XPVPTWM8QDMWP53W01PPVZ', 'FN3N7JFRRVC8W13N6RD32JF8GZ',
        '50P96RFYB8SC2GNF1Z3HDA4M0P', '7JJ3T2K7R6T3N1J0H9S1XA1NQ9', '39QWQJ7Z7JRF1K8FPC90JHMEHF', 'PJTGGS3JQ63RHYZ3MGDJR0FFWC',
        'FA7AGXXS0FKWDXE18NH6X1CBEF', 'CT4ENPBZM8XPZGVW0Y91KBN2RF', 'BTDVAD11QCT1HMSTXADCZ7G17P'
      ]); return { ok: true }; });
      if (out && out.errore) throw new Error(out.messaggio);
    } },
    // serata del 6.11 finita: backup nel Drive subito (richiesta dell'utente, 07.11). L'archivio del 6.11 resta automatico,
    // la notte del 09.11, e fa un altro backup. Esito nella riga "Backup nel Drive" della pagina di stato.
    { id: 'backup-2026-11-07', fai: function () { if (!backupDrive_()) throw new Error('backup non verificato'); } },
    // pagina di stato protetta (richiesta dell'utente, 07.11): impronta del primo segreto, che sta nel Portachiavi del Mac
    // (servizio "bolla-pagina-stato"). Un link nuovo dal menu del foglio sostituisce questo.
    { id: 'link-stato-2026-11-07', fai: function () {
      var props = PropertiesService.getScriptProperties();
      if (!props.getProperty('LINK_STATO_SHA')) props.setProperty('LINK_STATO_SHA', '0a06bd5714a741b7b33603f093b8362a7c086ed019965a66b7735f19589d78aa');
    } },
    // nessun invio automatico per il 13.11 (richiesta dell'utente, 07.11): promemoria, solleciti, pass regalo e recap spenti
    { id: 'serata-2026-11-13-senza-invii', fai: function () {
      var db = carica_(['Serate']);
      var r = trova_(db.Serate, 'id', '2026-11-13');
      if (!r) throw new Error('serata 2026-11-13 non trovata nel foglio Serate');
      aggiorna_(db.Serate, r, { promemoria: '', solleciti: '', regalo: '', recap: '' });
    } },
    // foglio Cena: tolte le colonne senza intestazione tra "cena" e "nome", solo se vuote in tutte le righe (richiesta dell'utente, 07.11)
    { id: 'cena-colonne-vuote-2026-11-07', fai: function () {
      var out = conLock_(function () {
        var sh = SpreadsheetApp.getActive().getSheetByName('Cena');
        if (!sh) return { ok: true };
        var valori = sh.getDataRange().getValues();
        var tolte = 0;
        for (var c = valori[0].length - 1; c >= 0; c--) {
          if (String(valori[0][c]).trim() !== '') continue;
          var piena = valori.some(function (riga) { return String(riga[c]).trim() !== ''; });
          if (piena) throw new Error('colonna ' + (c + 1) + ' del foglio Cena senza intestazione ma con dati: non tolta');
          sh.deleteColumn(c + 1);
          tolte++;
        }
        delete TESTATE_.Cena;
        accoda_('CENA_COLONNE_ESITO', new Date().toISOString().slice(0, 16) + ' colonne vuote tolte: ' + tolte);
        return { ok: true };
      });
      if (out && out.errore) throw new Error(out.messaggio);
    } },
    { id: 'vibes-2026-10-30-verifica', fai: function () { verificaMailBrevo_('VIBES_VERIFICA', oggettoVibes_(), '2026-11-03', '2026-11-04'); } },
    // le prenotazioni del samba finivano nel foglio Workshop (segnalazione dell'utente, 05.11): l'evento torna sul foglio
    // Prenotazioni e le righe del samba già in Workshop si spostano lì. Sotto lock, così nessuna prenotazione si perde.
    { id: 'samba-2026-11-06-in-prenotazioni', fai: function () {
      var out = conLock_(function () {
        var id = 'samba-2026-11-06';
        var db = carica_(['Eventi', 'Workshop', 'Prenotazioni']);
        var e = trova_(db.Eventi, 'id', id);
        if (!e) throw new Error('evento ' + id + ' non trovato nel foglio Eventi');
        var prima = String(e.foglio);
        if (prima !== '') aggiorna_(db.Eventi, e, { foglio: '' });
        var gia = {};
        db.Prenotazioni.forEach(function (r) { if (r.evento === id) gia[r.telefono_norm] = true; });
        var sposta = db.Workshop.filter(function (r) { return r.workshop === id; });
        sposta.forEach(function (r) {
          if (gia[r.telefono_norm]) return;
          appendi_('Prenotazioni', { creato: r.creato, evento: id, nome: r.nome, cognome: r.cognome, telefono: r.telefono,
            telefono_norm: r.telefono_norm, persone: '', note: r.note });
          gia[r.telefono_norm] = true;
        });
        SpreadsheetApp.flush();
        // dal basso, così i numeri di riga restano giusti
        sposta.map(function (r) { return r._riga; }).sort(function (a, b) { return b - a; })
          .forEach(function (n) { db.Workshop[0]._foglio.deleteRow(n); });
        PropertiesService.getScriptProperties().setProperty('diagnosi:' + id,
          'foglio era "' + prima + '", spostate ' + sposta.length + ' righe da Workshop');
        return { ok: true };
      });
      if (!out.ok) throw new Error(out.messaggio);
    } },
    // pass dato lo stesso a chi ha confermato in un gruppo incompleto, alle 18:00 del 6.11 (richiesta dell'utente, 06.11):
    // colonna "regalo" della serata, poi ci pensa automazioni_ nella sveglia
    { id: 'regalo-2026-11-06-18', fai: function () {
      var db = carica_(['Serate']);
      var r = trova_(db.Serate, 'id', '2026-11-06');
      if (!r) throw new Error('serata 2026-11-06 non trovata');
      aggiorna_(db.Serate, r, { regalo: "'18:00" });
    } },
    // secondo giro alle 22:00, come il 30.10 (richiesta dell'utente, 06.11): passRegalo_ manda il pass solo se trova
    // gruppi ancora aperti con qualcuno confermato, altrimenti non parte nessuna email. Il giro delle 18:00 non si ripete.
    { id: 'regalo-2026-11-06-22', fai: function () {
      var db = carica_(['Serate']);
      var r = trova_(db.Serate, 'id', '2026-11-06');
      if (!r) throw new Error('serata 2026-11-06 non trovata');
      aggiorna_(db.Serate, r, { regalo: "'18:00, 22:00" });
    } }
  ].forEach(function (a) {
    if (fatti['fatto:' + a.id]) return;
    // "dopo": non prima di quest'ora (yyyy-MM-dd HH:mm, ora italiana)
    if (a.dopo && new Date() < Utilities.parseDate(a.dopo, TZ, 'yyyy-MM-dd HH:mm')) return;
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

// Solo numeri (la pagina è pubblica): pass di gruppo non ancora confermati e stato del loro gruppo, serate da ieri in poi.
function confermeInSospeso_(db) {
  var conta = {};
  db.Pass.forEach(function (r) {
    if (r.tipo !== 'gruppo' || r.stato !== 'da_confermare' || !serataInCorso_(db, r.serata)) return;
    var g = gruppo_(db, r.rif);
    var st = g ? statoGruppo_(db, g).stato : 'senza gruppo';
    var chiave = st + (oreDa_(r.creato) > CONFIG.oreConferma ? ', oltre ' : ', entro ') + CONFIG.oreConferma + ' ore';
    conta[chiave] = (conta[chiave] || 0) + 1;
  });
  var righe = Object.keys(conta).map(function (k) { return k + ': ' + conta[k]; });
  return '<p>Pass da confermare: ' + (righe.length ? esc_(righe.join(' · ')) : 'nessuno') + '</p>';
}

// Per decidere i solleciti: un gruppo non completo per riga, con chi manca (solo codici, niente id del gruppo:
// il link del gruppo fa entrare chiunque). "promemoria" = ha già ricevuto il promemoria di conferma.
function gruppiInSospeso_(db, serata) {
  var s = serata_(db, serata);
  if (!s) return '';
  var avvisati = PropertiesService.getScriptProperties().getProperty('PROMEMORIA_ESITO') || '';
  var completi = 0;
  var righe = [];
  db.Gruppi.forEach(function (g) {
    if (g.serata !== serata || g.stato === 'annullato') return;
    var st = statoGruppo_(db, g);
    if (st.stato === 'completo') { completi++; return; }
    var capo = st.membri.filter(function (r) { return r.chiave === g.capogruppo; })[0];
    var mancano = st.membri.filter(function (r) { return r.stato !== 'confermato'; }).map(function (r) {
      return r.codice + (r.chiave === g.capogruppo ? ' capo' : '') + ' ' + Math.round(oreDa_(r.creato)) + 'h' +
        (avvisati.indexOf(r.codice) >= 0 ? ' promemoria' : '');
    });
    righe.push(st.stato + ', ' + st.confermati.length + '/' + st.membri.length + ' confermati su ' + CONFIG.dimensioneGruppo +
      ', capo ' + (capo ? capo.codice + (st.capoConfermato ? ' confermato' : ' non confermato') : 'mancante') +
      ', creato ' + Utilities.formatDate(data_(g.creato), TZ, 'dd.MM HH:mm') + (mancano.length ? ' — mancano: ' + mancano.join(', ') : ''));
  });
  return '<p>Gruppi ' + esc_(serata) + ': completi ' + completi + ' · non completi ' + righe.length + '</p>' +
    (righe.length ? '<ol style="font-size:13px">' + righe.map(function (r) { return '<li>' + esc_(r) + '</li>'; }).join('') + '</ol>' : '');
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
// È la richiesta più frequente (ogni apertura del sito): senza invito né gruppo la risposta sulla serata
// viene dalla cache (60 secondi, svuotata a ogni nuovo pass o gruppo) e i fogli non si leggono.
// I controlli veri sui posti li rifanno sempre le azioni che scrivono.
function azioneStato_(d) {
  var cache = CacheService.getScriptCache();
  var kSerata = 'stato:' + String(d.serata || '');
  var pubblica = !d.invito && !d.gruppo && cache.get(kSerata);
  if (pubblica) return { ok: true, modulo: tokenModulo_(), dimensioneGruppo: CONFIG.dimensioneGruppo, serata: JSON.parse(pubblica) };
  var db = carica_(['Serate', 'Pass', 'Gruppi'].concat(d.invito ? ['Inviti'] : []));
  var s = serata_(db, d.serata);
  if (!s) return errore_('serata', 'Serata non trovata.');
  // capienza e posti rimasti non escono mai dal backend: solo se c'è posto per un gruppo o per una persona
  var liberi = disponibili_(db, s);
  var out = { ok: true, modulo: tokenModulo_(), dimensioneGruppo: CONFIG.dimensioneGruppo,
    serata: { aperta: serataAperta_(s), postiGruppo: liberi >= CONFIG.dimensioneGruppo, postiSingolo: liberi >= 1 } };
  cache.put(kSerata, JSON.stringify(out.serata), 60);
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
    var db = carica_(['Serate', 'Pass', 'Gruppi']);
    var s = serata_(db, d.serata);
    var chiusa = controllaSerata_(s);
    if (chiusa) return chiusa;
    if (passChiusi_(s)) return errorePassChiusi_();
    if (new Date() > scadenzaGruppi_(s)) return erroreGruppiChiusi_(s);
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
    var db = carica_(['Serate', 'Pass', 'Gruppi']);
    var s = serata_(db, d.serata);
    var chiusa = controllaSerata_(s);
    if (chiusa) return chiusa;
    if (passChiusi_(s)) return errorePassChiusi_();
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
    var db = carica_(['Serate', 'Pass', 'Gruppi', 'Inviti', 'Contatti']);
    var s = serata_(db, d.serata);
    var chiusa = controllaSerata_(s);
    if (chiusa) return chiusa;
    if (passChiusi_(s)) return errorePassChiusi_();
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
    contatto_(db, pass);
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
    var db = carica_(['Serate', 'Pass', 'Gruppi', 'Attesa']);
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
    var db = carica_(['Serate', 'Pass', 'Gruppi', 'Contatti']);
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
        contatto_(db, pass);
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

/* ---------- eventi con prenotazione (workshop, cene…) ----------
 * Ogni evento è una riga del foglio Eventi: si aggiunge o si cambia lì, senza pubblicare il codice.
 *   id           lo stesso della voce in js/config.js (eventi) e del link bbbbolla.it/prenota.html?e=<id>
 *   tipo         workshop, cena… (solo per leggere il foglio; le pagine vecchie lo usano per trovare l'evento)
 *   serata       la serata bolla® di cui fa parte (il recap conta le prenotazioni)
 *   inizio       AAAA-MM-GG HH:mm: da quest'ora le prenotazioni si chiudono
 *   posti        posti in tutto (sommando le persone); vuoto o 0 = nessun limite
 *   max_persone  persone al massimo in una prenotazione; vuoto o 0 = una persona, il modulo non chiede quante
 *   foglio       dove finiscono le prenotazioni: Prenotazioni (vuoto) oppure Workshop/Cena per i primi eventi
 *   attivo       FALSE = prenotazioni chiuse
 *   avvisa       email separate da virgola: a ogni prenotazione arriva un avviso con nome, telefono e persone; vuoto = nessuno
 * Nome, cognome e telefono (niente email, niente pass): lo staff richiama al telefono se serve.
 * Stesso anti-bot dei pass (modulo firmato, honeypot, tetto al minuto); lo stesso numero non può prenotare due volte. */
// pagine dei primi eventi rimaste in cache nei browser, che non mandano l'id
var EVENTI_PAGINE_VECCHIE = { workshop: 'cumbia-2026-10-30', cena: 'tavolacunzata-2026-11-06' };

function evento_(db, id, tipo) {
  var e = trova_(db.Eventi, 'id', String(id || (tipo && EVENTI_PAGINE_VECCHIE[tipo]) || ''));
  if (!e) return null;
  var inizio = e.inizio instanceof Date ? e.inizio : Utilities.parseDate(String(e.inizio).trim(), TZ, 'yyyy-MM-dd HH:mm');
  var foglio = COLONNA_EVENTO[e.foglio] ? e.foglio : 'Prenotazioni';
  return { id: e.id, tipo: e.tipo, titolo: e.titolo, serata: e.serata, inizio: inizio, posti: Number(e.posti) || 0,
    maxPersone: Number(e.max_persone) || 0, foglio: foglio, colonna: COLONNA_EVENTO[foglio], attivo: e.attivo === '' || vero_(e.attivo),
    avvisa: String(e.avvisa || '').split(/[\s,;]+/).filter(function (x) { return x.indexOf('@') > 0; }) };
}

function eventoAperto_(ev) {
  return ev.attivo && new Date() < ev.inizio;
}

// posti ancora liberi, sommando le persone (Infinity se l'evento non ha un limite)
function postiEvento_(db, ev) {
  if (!ev.posti) return Infinity;
  var presi = 0;
  db[ev.foglio].forEach(function (r) { if (r[ev.colonna] === ev.id) presi += Number(r.persone) || 1; });
  return ev.posti - presi;
}

function nomeEvento_(ev) {
  return ev.tipo === 'cena' ? 'la cena' : ev.tipo === 'workshop' ? 'il workshop' : 'l\'evento';
}

// tipo: solo per le pagine vecchie (workshop_stato, cena_stato), che vogliono la risposta nel loro formato
function azioneEventoStato_(d, tipo) {
  var db = carica_(['Eventi']);
  var ev = evento_(db, d.evento, tipo);
  if (!ev) return errore_('evento', 'Evento non trovato.');
  db[ev.foglio] = carica_([ev.foglio])[ev.foglio];
  var liberi = postiEvento_(db, ev);
  var max = Math.max(0, Math.min(ev.maxPersone || 1, liberi));
  var out = { ok: true, modulo: tokenModulo_() };
  if (tipo === 'workshop') out.workshop = { aperto: eventoAperto_(ev), posti: liberi > 0 };
  else if (tipo === 'cena') out.cena = { aperta: eventoAperto_(ev), posti: liberi > 0, maxPersone: max };
  else out.evento = { id: ev.id, aperto: eventoAperto_(ev), posti: liberi > 0, maxPersone: ev.maxPersone ? max : 0 };
  return out;
}

function azioneEventoPrenota_(d, tipo) {
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
    var db = carica_(['Eventi']);
    var ev = evento_(db, d.evento, tipo);
    if (!ev) return errore_('evento', 'Evento non trovato.');
    var persone = ev.maxPersone ? Number(d.persone) : 1;
    if (!(persone >= 1 && persone <= Math.max(1, ev.maxPersone) && Math.floor(persone) === persone)) return errore_('dati', 'Scegli per quante persone prenoti.');
    var cosa = nomeEvento_(ev);
    if (!eventoAperto_(ev)) return errore_('chiusa', 'Le prenotazioni per ' + cosa + ' sono chiuse.');
    db[ev.foglio] = carica_([ev.foglio])[ev.foglio];
    var gia = db[ev.foglio].some(function (r) { return r[ev.colonna] === ev.id && r.telefono_norm === tel.norm; });
    if (gia) return errore_('duplicato', 'Questo numero ha già una prenotazione per ' + cosa + '.');
    var liberi = postiEvento_(db, ev);
    if (liberi <= 0) return errore_('esaurito', 'I posti per ' + cosa + ' sono esauriti.');
    if (persone > liberi) return errore_('posti', liberi === 1 ? 'Resta un solo posto: prenota per 1 persona.' : 'Restano solo ' + liberi + ' posti: prenota per meno persone.');
    var riga = { creato: new Date(), nome: nome, cognome: cognome, telefono: tel.testo, telefono_norm: tel.norm, persone: ev.maxPersone ? persone : '', note: '' };
    riga[ev.colonna] = ev.id;
    appendi_(ev.foglio, riga);
    contaRegistrazione_();
    segnaModuloUsato_(d.modulo);
    // avviso agli organizzatori (colonna "avvisa"), dopo il lock: con i totali aggiornati
    var totali = { prenotazioni: 1, persone: persone };
    db[ev.foglio].forEach(function (r) { if (r[ev.colonna] === ev.id) { totali.prenotazioni++; totali.persone += Number(r.persone) || 1; } });
    return { ok: true, _email: ev.avvisa.length ? function () { avvisoPrenotazione_(ev, riga, totali); } : null };
  });
}

// Email agli indirizzi della colonna "avvisa" dell'evento. Esito (senza dati personali) nella pagina di stato.
function avvisoPrenotazione_(ev, r, totali) {
  var titolo = ev.titolo || ev.id;
  var persone = ev.maxPersone ? Number(r.persone) : 1;
  var righe = [
    ['Nome', r.nome + ' ' + r.cognome],
    ['Telefono', r.telefono],
    ['Persone', persone],
    ['Quando', Utilities.formatDate(r.creato, TZ, 'dd.MM.yyyy HH:mm')],
    ['Totale prenotazioni', totali.prenotazioni],
    ['Totale persone', totali.persone + (ev.posti ? ' su ' + ev.posti : '')]
  ];
  var oggetto = 'Nuova prenotazione — ' + titolo + ': ' + r.nome + ' ' + r.cognome + ', ' + (persone === 1 ? '1 persona' : persone + ' persone');
  var testo = oggetto + '\n\n' + righe.map(function (x) { return x[0] + ': ' + x[1]; }).join('\n');
  var html = '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px">' +
    '<h2 style="margin:0 0 12px">bolla&reg; · ' + esc_(titolo) + '</h2>' +
    '<p style="margin:0 0 12px">Nuova prenotazione:</p>' +
    '<table style="border-collapse:collapse;font-size:15px">' + righe.map(function (x) {
      var v = x[0] === 'Telefono' ? '<a href="tel:' + esc_(r.telefono_norm) + '">' + esc_(String(x[1])) + '</a>' : esc_(String(x[1]));
      return '<tr><td style="padding:4px 16px 4px 0;color:#5f5b56">' + esc_(x[0]) + '</td><td style="padding:4px 0;font-weight:bold">' + v + '</td></tr>';
    }).join('') + '</table>' +
    '<p style="font-size:12px;color:#777;margin-top:16px">Tutte le prenotazioni sono nel foglio ' + esc_(ev.foglio) + ' (colonna ' + esc_(ev.colonna) + ' = ' + esc_(ev.id) + ').</p></div>';
  var esiti = ev.avvisa.map(function (a) {
    try { return a.split('@')[0] + ' ' + invia_(a, oggetto, testo, html); }
    catch (err) { return a.split('@')[0] + ' errore: ' + String(err.message).slice(0, 80); }
  });
  accoda_('AVVISI_ESITO', Utilities.formatDate(new Date(), TZ, 'dd.MM HH:mm') + ' ' + ev.id + ' ' + esiti.join(', '));
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
  var membri = membriGruppo_(db, g.id).filter(function (r) { return r.stato !== 'annullato'; });
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

// Pass di gruppo per id del gruppo (annullati compresi). L'indice si costruisce una volta per richiesta:
// senza, ogni gruppo scorrerebbe tutto il foglio Pass.
function membriGruppo_(db, id) {
  if (!db._membri) {
    db._membri = {};
    db.Pass.forEach(function (r) {
      if (r.tipo !== 'gruppo') return;
      (db._membri[r.rif] = db._membri[r.rif] || []).push(r);
    });
  }
  return db._membri[id] || [];
}

// I gruppi della serata si chiudono tutti alla stessa ora (chiusura_gruppi della serata, o CONFIG.chiusuraGruppi).
function scadenzaGruppi_(s) {
  return Utilities.parseDate(s.data + ' ' + s.chiusuraGruppi, TZ, 'yyyy-MM-dd HH:mm');
}

function scadenzaGruppo_(db, g) {
  var s = serata_(db, g.serata);
  return s ? scadenzaGruppi_(s) : data_(g.scadenza);
}

function erroreGruppiChiusi_(s) {
  return errore_('chiusa', 'I pass di gruppo si potevano chiedere fino alle ' + s.chiusuraGruppi + ' del giorno della serata.' +
    (s.senzaPass ? ' Senza pass: ' + s.senzaPass + '.' : ''));
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
  // ogni invito vale per tutte le serate (richiesta dell'utente, 06.11): la colonna serata non conta più,
  // così anche i link creati per il 30.10 funzionano alle serate dopo
  if (inv.scadenza && new Date() > data_(inv.scadenza)) return nonValido;
  // il tetto vale per ogni serata: un link per tutte le serate non si esaurisce dopo la prima
  var usati = db.Pass.filter(function (r) { return r.tipo === 'invito' && r.rif === inv.token && r.serata === s.id && r.stato === 'confermato'; }).length;
  // max vuoto = nessun limite: vale solo la capienza della serata
  if (Number(inv.max) > 0 && usati >= Number(inv.max)) return errore_('invito', 'I pass di questo invito sono finiti.');
  return inv;
}

function controllaSerata_(s) {
  if (!s) return errore_('serata', 'Serata non trovata.');
  if (!serataAperta_(s)) return errore_('chiusa', 'Le prenotazioni per questa serata sono chiuse.');
  return null;
}

// Dopo chiusura_pass (o CONFIG.chiusuraPass) niente pass nuovi. La pagina non lo dice prima: chi invia il modulo legge "esauriti".
function passChiusi_(s) {
  return new Date() >= Utilities.parseDate(s.data + ' ' + s.chiusuraPass, TZ, 'yyyy-MM-dd HH:mm');
}

function errorePassChiusi_() {
  return errore_('esaurito', 'Pass esauriti. Seguici per le prossime serate.');
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
  var g = pass.tipo === 'gruppo' ? gruppo_(db, pass.rif) : null;
  var attivo = pass.tipo === 'invito' || (!!g && statoGruppo_(db, g).stato === 'completo');
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
   - dashboard: bbbbolla.it/dashboard.html#k=<segreto>      (numeri di pass, gruppi, prenotazioni: solo conteggi)
   Il segreto sta dopo il #: il browser non lo manda a nessun server, la pagina lo salva e lo toglie dalla barra.
   Le pagine lo mandano al backend nel campo "accesso".
   ============================================================ */

var LINK_SEGRETI = {
  staff: { prop: 'LINK_STAFF', nome: 'Link staff (app ingresso)', pagine: [['App ingresso', '/staff.html']], menu: 'Crea link segreto staff' },
  visuals: { prop: 'LINK_VISUALS', nome: 'Link visuals', pagine: [['Schermo (computer del proiettore)', '/live/schermo.html'], ['Regia (chi gestisce le visuals)', '/live/regia.html']], menu: 'Crea link segreto visuals' },
  dashboard: { prop: 'LINK_DASHBOARD', nome: 'Link dashboard', pagine: [['Dashboard (numeri delle serate)', '/dashboard.html']], menu: 'Crea link segreto dashboard' }
};

function creaLinkStaffDaMenu() { creaLinkDaMenu_('staff'); }

// Pagina di stato del backend: link …/exec?k=<segreto>. Nelle proprietà resta solo l'impronta SHA-256 del segreto.
function accessoStato_(k) {
  var impronta = PropertiesService.getScriptProperties().getProperty('LINK_STATO_SHA');
  return !!impronta && !!k && String(k).length >= 24 && hashChiave_(String(k)) === impronta;
}

function creaLinkStatoDaMenu() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('LINK_STATO_SHA')) {
    var r = ui.alert('Link pagina di stato', 'Esiste già un link. Crearne uno nuovo disattiva quello vecchio. Continuo?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  var segreto = token_(32);
  props.setProperty('LINK_STATO_SHA', hashChiave_(segreto));
  // stesso indirizzo di apiUrl in js/config.js (deployment-id.txt)
  var url = 'https://script.google.com/macros/s/AKfycbzEckzChK4ZcFHJ7wOjREzUTepDHg8QxMismXJwFMElQ1BRL8c74Ltsrsx2YinHvO5v4w/exec?k=' + segreto;
  var html = '<div style="font-family:Helvetica,Arial,sans-serif"><p style="margin:0 0 4px;font-weight:600">Pagina di stato del backend</p>' +
    '<input readonly value="' + esc_(url) + '" onclick="this.select()" style="width:100%;padding:8px;font:13px monospace;box-sizing:border-box">' +
    '<p style="margin-top:16px;color:#555;font-size:13px">Clicca il link per selezionarlo e copialo. Chi lo ha vede la pagina di stato.</p></div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(200), 'Link pagina di stato');
}
function creaLinkVisualsDaMenu() { creaLinkDaMenu_('visuals'); }
function creaLinkDashboardDaMenu() { creaLinkDaMenu_('dashboard'); }

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
   Dashboard (bbbbolla.it/dashboard.html, link segreto dashboard): i numeri di una serata e l'andamento delle serate.
   Solo conteggi: niente nomi, email o telefoni, così un link finito in giro non espone dati personali.
   Legge anche i fogli "Archivio …", per le serate passate. Risposta in cache 30 secondi per serata.
   ============================================================ */

// Righe del foglio più quelle del suo archivio (se c'è): le serate passate stanno lì
function conArchivio_(ss, nome) {
  var righe = [];
  [nome, 'Archivio ' + nome].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() > 1) righe = righe.concat(leggiFoglio_(sh, nome, false));
  });
  return righe;
}

function azioneDashboard_(d) {
  var no = controllaAccesso_('dashboard', d.accesso);
  if (no) return no;
  var cache = CacheService.getScriptCache();
  var k = 'dash:' + String(d.serata || '');
  var pronta = !d.fresco && cache.get(k);
  if (pronta) return JSON.parse(pronta);
  var out = datiDashboard_(d.serata);
  var testo = JSON.stringify(out);
  if (testo.length < 90000) cache.put(k, testo, 30);
  return out;
}

function datiDashboard_(idSerata) {
  var ss = SpreadsheetApp.getActive();
  var db = carica_(['Serate', 'Eventi', 'Inviti', 'Contatti']);
  ['Pass', 'Gruppi', 'Attesa', 'Prenotazioni', 'Workshop', 'Cena'].forEach(function (n) { db[n] = conArchivio_(ss, n); });
  var serate = db.Serate.map(function (r) { return serata_(db, r.id); }).filter(Boolean)
    .sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
  var s = serata_(db, idSerata) || prossimaSerata_(db);
  if (!s) return errore_('serata', 'Nessuna serata nel foglio.');

  var giornoOra = function (v, f) { var x = data_(v); return x && !isNaN(x) ? Utilities.formatDate(x, TZ, f) : ''; };
  var gruppiDi = function (id) { return db.Gruppi.filter(function (g) { return g.serata === id && g.stato !== 'annullato'; }); };
  var contaGruppi = function (id) {
    var c = { completo: 0, aperto: 0, scaduto: 0 };
    gruppiDi(id).forEach(function (g) { var st = statoGruppo_(db, g).stato; c[st] = (c[st] || 0) + 1; });
    return c;
  };

  // la serata scelta
  var tutti = db.Pass.filter(function (r) { return r.serata === s.id; });
  var pass = tutti.filter(function (r) { return r.stato !== 'annullato'; });
  var validi = pass.filter(function (r) { return passAttivo_(db, r); });
  var conta = function (righe, f) { return righe.filter(f).length; };
  var esterni = function (r) { return r.rif === 'qr-esterni'; };

  // gruppi aperti: quanti hanno confermato su quanti posti
  var aperti = [];
  gruppiDi(s.id).forEach(function (g) {
    var st = statoGruppo_(db, g);
    if (st.stato === 'aperto') aperti.push({ membri: st.attivi.length, confermati: st.confermati.length });
  });
  aperti.sort(function (a, b) { return b.confermati - a.confermati || b.membri - a.membri; });

  // pass chiesti giorno per giorno (annullati esclusi, QR esterni a parte)
  var perGiorno = {};
  pass.forEach(function (r) {
    if (esterni(r)) return;
    var g = giornoOra(r.creato, 'yyyy-MM-dd');
    if (!g) return;
    var x = perGiorno[g] = perGiorno[g] || { giorno: g, invito: 0, gruppo: 0 };
    x[r.tipo === 'invito' ? 'invito' : 'gruppo']++;
  });
  var andamento = Object.keys(perGiorno).sort().map(function (g) { return perGiorno[g]; });

  // ingressi ogni 15 minuti
  var perQuarto = {};
  pass.forEach(function (r) {
    var x = data_(r.checkin);
    if (!r.checkin || !x || isNaN(x)) return;
    var q = new Date(Math.floor(x.getTime() / 900000) * 900000);
    var kq = Utilities.formatDate(q, TZ, 'yyyy-MM-dd HH:mm');
    perQuarto[kq] = (perQuarto[kq] || 0) + 1;
  });
  var ingressi = Object.keys(perQuarto).sort().map(function (kq) { return { ora: kq.slice(11), n: perQuarto[kq] }; });

  // pass per link invito (etichetta del foglio Inviti)
  var etichette = {};
  db.Inviti.forEach(function (i) { etichette[i.token] = i.etichetta || 'Invito senza nome'; });
  var perInvito = {};
  validi.forEach(function (r) {
    if (r.tipo !== 'invito') return;
    var nome = esterni(r) ? 'QR di un\'altra biglietteria' : etichette[r.rif] || 'Invito senza nome';
    perInvito[nome] = (perInvito[nome] || 0) + 1;
  });
  var inviti = Object.keys(perInvito).map(function (n) { return { nome: n, pass: perInvito[n] }; })
    .sort(function (a, b) { return b.pass - a.pass; });

  // eventi con prenotazione della serata
  var eventi = db.Eventi.filter(function (e) { return e.serata === s.id; }).map(function (e) {
    var ev = evento_(db, e.id);
    var righe = (db[ev.foglio] || []).filter(function (r) { return r[ev.colonna] === ev.id; });
    var persone = 0;
    righe.forEach(function (r) { persone += Number(r.persone) || 1; });
    var ultima = righe.reduce(function (m, r) { var x = data_(r.creato); return x && x > m ? x : m; }, null);
    return { id: ev.id, tipo: ev.tipo, titolo: ev.titolo || ev.id, inizio: ev.inizio && !isNaN(ev.inizio) ? Utilities.formatDate(ev.inizio, TZ, 'HH:mm') : '',
      posti: ev.posti, prenotazioni: righe.length, persone: persone, aperto: eventoAperto_(ev),
      ultima: ultima ? Utilities.formatDate(ultima, TZ, 'dd.MM HH:mm') : '' };
  });

  var gruppi = contaGruppi(s.id);
  var newsletter = conta(db.Contatti, function (c) { return vero_(c.newsletter); });

  // tutte le serate, per confrontarle
  var storico = serate.slice().reverse().map(function (x) {
    var p = db.Pass.filter(function (r) { return r.serata === x.id && r.stato !== 'annullato'; });
    var v = p.filter(function (r) { return passAttivo_(db, r); });
    var pren = 0;
    db.Eventi.filter(function (e) { return e.serata === x.id; }).forEach(function (e) {
      var ev = evento_(db, e.id);
      (db[ev.foglio] || []).forEach(function (r) { if (r[ev.colonna] === ev.id) pren += Number(r.persone) || 1; });
    });
    return { id: x.id, data: x.data, titolo: x.titolo, validi: v.length, entrati: conta(p, function (r) { return !!r.checkin; }),
      gruppi: contaGruppi(x.id).completo, prenotati: pren, nuoviContatti: conta(db.Contatti, function (c) { return c.prima === x.id; }) };
  });

  return {
    ok: true,
    aggiornato: new Date().toISOString(),
    serate: serate.map(function (x) { return { id: x.id, data: x.data, titolo: x.titolo }; }),
    serata: { id: s.id, titolo: s.titolo, data: s.data, capienza: s.capienza, chiusuraPass: s.chiusuraPass, chiusuraGruppi: s.chiusuraGruppi,
      oggi: s.data === oggi_(), passata: s.data < oggi_() },
    pass: {
      validi: validi.length,
      invito: conta(validi, function (r) { return r.tipo === 'invito' && !esterni(r); }),
      esterni: conta(validi, esterni),
      gruppo: conta(validi, function (r) { return r.tipo === 'gruppo'; }),
      inAttesaDelGruppo: conta(pass, function (r) { return r.stato === 'confermato' && !passAttivo_(db, r); }),
      daConfermare: conta(pass, function (r) { return r.stato === 'da_confermare'; }),
      annullati: conta(tutti, function (r) { return r.stato === 'annullato'; }),
      entrati: conta(pass, function (r) { return !!r.checkin; }),
      newsletter: conta(validi, function (r) { return vero_(r.newsletter); })
    },
    gruppi: { completi: gruppi.completo, aperti: gruppi.aperto, scaduti: gruppi.scaduto, dimensione: CONFIG.dimensioneGruppo, inCorso: aperti },
    attesa: conta(db.Attesa, function (r) { return r.serata === s.id; }),
    eventi: eventi,
    andamento: andamento,
    ingressi: ingressi,
    inviti: inviti,
    contatti: { totale: db.Contatti.length, newsletter: newsletter, nuovi: conta(db.Contatti, function (c) { return c.prima === s.id; }) },
    storico: storico
  };
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

// QR di un'altra biglietteria: 26 caratteri in base32 di Crockford, salvati in minuscolo nella colonna "chiave"
var QR_ESTERNO = /^[0-9a-hjkmnp-tv-z]{26}$/;

// Ogni QR diventa un pass su invito confermato, senza email: conta nella capienza e compare nella lista staff.
// Nome "QR esterno" e cognome = primi 6 caratteri, per cercarlo a mano nell'app se il QR non si legge.
function aggiungiQrEsterni_(serata, codici) {
  var db = carica_(['Pass']);
  var aggiunti = 0, gia = 0, scartati = 0;
  codici.forEach(function (q) {
    var chiave = String(q).trim().toLowerCase();
    if (!QR_ESTERNO.test(chiave)) { scartati++; return; }
    if (trova_(db.Pass, 'chiave', chiave)) { gia++; return; }
    var r = { creato: new Date(), serata: serata, tipo: 'invito', rif: 'qr-esterni', nome: 'QR esterno', cognome: chiave.slice(0, 6).toUpperCase(),
      email: '', email_norm: '', chiave: chiave, codice: nuovoCodice_(db), stato: 'confermato', confermato: new Date(), checkin: '', newsletter: 'FALSE', checkin_da: '' };
    appendi_('Pass', r);
    db.Pass.push(r);
    aggiunti++;
  });
  PropertiesService.getScriptProperties().setProperty('QR_ESTERNI_ESITO', new Date().toISOString().slice(0, 16) + ' aggiunti ' + aggiunti +
    (gia ? ', già presenti ' + gia : '') + (scartati ? ', scartati ' + scartati : ''));
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
// Ogni telefono alla porta la chiede ogni minuto: la risposta resta in cache 20 secondi (svuotata a ogni ingresso).
function azioneStaffLista_(d) {
  var no = controllaAccesso_('staff', d.accesso);
  if (no) return no;
  var cache = CacheService.getScriptCache();
  var k = 'staff:' + String(d.serata || '');
  var pronta = cache.get(k);
  if (pronta) return JSON.parse(pronta);
  var db = carica_(['Serate', 'Pass', 'Gruppi']);
  var s = serata_(db, d.serata);
  if (!s) return errore_('serata', 'Serata non trovata.');
  var pass = db.Pass.filter(function (r) { return r.serata === s.id && passAttivo_(db, r); }).map(function (r) {
    return { h: hashChiave_(r.chiave), nome: r.nome, cognome: r.cognome, codice: r.codice, tipo: r.tipo, gruppo: r.tipo === 'gruppo' ? r.rif : '', dentro: quandoEntrato_(r) };
  });
  var out = { ok: true, serata: { id: s.id, titolo: s.titolo, capienza: s.capienza }, pass: pass, aggiornato: new Date().toISOString() };
  var testo = JSON.stringify(out);
  if (testo.length < 90000) cache.put(k, testo, 20); // una voce di cache tiene al massimo 100 KB
  return out;
}

function azioneStaffCheckin_(d) {
  var no = controllaAccesso_('staff', d.accesso);
  if (no) return no;
  return conLock_(function () {
    var db = carica_(['Pass', 'Gruppi']);
    var chiave = String(d.chiave || '').trim().toLowerCase();
    var codice = String(d.codice || '').trim().toUpperCase();
    var r = /^[a-f0-9]{24}$/.test(chiave) || QR_ESTERNO.test(chiave) ? trova_(db.Pass, 'chiave', chiave)
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
      'allora ognuno riceve il suo QR. Se il gruppo non si completa entro le ' + s.chiusuraGruppi + ' del ' + data + ', <strong>nessuno riceve il pass</strong>.</p>') +
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

// Esito di un invio in Brevo, contato sugli eventi con quell'oggetto (le prove "[Prova] …" non contano):
// per ogni tipo di evento quanti indirizzi diversi, più i motivi di rimbalzi e blocchi. Solo numeri, niente indirizzi.
function verificaMailBrevo_(chiave, oggetto, dal, al) {
  var opz = { headers: { 'api-key': chiaveBrevo_(), accept: 'application/json' }, muteHttpExceptions: true };
  var tipi = ['requests', 'delivered', 'deferred', 'softBounces', 'hardBounces', 'blocked', 'invalid', 'spam', 'unsubscribed', 'opened', 'clicks'];
  var motivi = {};
  var parti = tipi.map(function (tipo) {
    var indirizzi = {}, offset = 0, pagina;
    do {
      var r = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/statistics/events?limit=2500&offset=' + offset + '&startDate=' + dal +
        '&endDate=' + al + '&event=' + tipo, opz);
      if (r.getResponseCode() !== 200) return tipo + ' errore ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 120);
      pagina = JSON.parse(r.getContentText()).events || [];
      pagina.forEach(function (e) {
        if (String(e.subject || '') !== oggetto) return;
        indirizzi[String(e.email).toLowerCase()] = 1;
        if (e.reason && ['softBounces', 'hardBounces', 'blocked', 'invalid', 'deferred'].indexOf(tipo) >= 0) {
          var m = tipo + ': ' + String(e.reason).slice(0, 80);
          motivi[m] = (motivi[m] || 0) + 1;
        }
      });
      offset += pagina.length;
    } while (pagina.length === 2500);
    return tipo + ' ' + Object.keys(indirizzi).length;
  });
  var m = Object.keys(motivi).map(function (k) { return k + ' (' + motivi[k] + ')'; });
  PropertiesService.getScriptProperties().setProperty(chiave, new Date().toISOString().slice(0, 16) + ' «' + oggetto + '» dal ' + dal +
    ' al ' + al + ': ' + parti.join(' · ') + (m.length ? ' ¦ motivi: ' + m.join(' · ') : ''));
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
    var db = carica_(['Serate', 'Pass', 'Gruppi']);
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
  PropertiesService.getScriptProperties().setProperty('PROMEMORIA_ESITO', new Date().toISOString().slice(0, 16) + ' ' + serata + ' ' + (esiti.join(' · ') || 'nessun pass da confermare'));
}

/* Solleciti del giorno della serata, prima della chiusura dei gruppi:
 *  - gruppo scaduto perché il capogruppo non ha confermato in tempo: chi non ha confermato riparte da adesso
 *    (la scadenza diventa la chiusura dei gruppi) e riceve la proroga;
 *  - gruppo aperto: chi non ha confermato riceve il sollecito;
 *  - chi ha confermato in un gruppo aperto non completo (anche riaperto qui) riceve "manca qualcuno".
 * Esito per codice nella pagina di stato. */
function solleciti_(serata) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
  var esiti = [];
  try {
    var db = carica_(['Serate', 'Pass', 'Gruppi']);
    var s = serata_(db, serata);
    var now = new Date();
    if (now >= scadenzaGruppi_(s)) throw new Error('gruppi già chiusi');
    var invii = [];
    db.Gruppi.forEach(function (g) {
      if (g.serata !== serata || g.stato !== 'aperto') return;
      var st = statoGruppo_(db, g);
      var capo = st.membri.filter(function (r) { return r.chiave === g.capogruppo; })[0];
      var riaperto = false;
      if (st.stato === 'scaduto') {
        if (!capo || capo.stato !== 'da_confermare') return;
        st.membri.forEach(function (r) { if (r.stato === 'da_confermare') aggiorna_(db.Pass, r, { creato: now }); });
        riaperto = true;
        st = statoGruppo_(db, g);
      }
      if (st.stato !== 'aperto') return;
      // se il capogruppo non ha confermato, il gruppo vive solo fino alla sua scadenza
      var entro = capo.stato === 'confermato' ? scadenzaGruppi_(s) : infoPromemoria_(db, capo).scadenza;
      st.membri.forEach(function (r) {
        if (r.stato === 'confermato') invii.push({ pass: r, fai: emailGruppoIncompleto_, tipo: 'manca qualcuno', entro: entro });
        // oltre le 48 ore si conferma ancora, se nel gruppo c'è posto (vedi azionePass_)
        else if (st.attivi.indexOf(r) >= 0 || st.attivi.length < CONFIG.dimensioneGruppo) invii.push({ pass: r, fai: emailPromemoriaConferma_, tipo: riaperto ? 'proroga' : 'sollecito' });
        else esiti.push(r.codice + ' saltato (posto preso)');
      });
    });
    invii.forEach(function (x) {
      var info = infoPromemoria_(db, x.pass);
      if (x.tipo !== 'manca qualcuno') info.tipo = x.tipo;
      // i membri possono confermare fino alla chiusura (se nel gruppo c'è posto), il capogruppo fino alla sua scadenza
      if (x.entro) info.scadenza = x.entro;
      else if (!info.capogruppo || info.scadenza < now) info.scadenza = scadenzaGruppi_(s);
      try {
        var canale = x.fai(x.pass, info.s, info, '');
        esiti.push(x.pass.codice + ' ' + x.tipo + (info.capogruppo ? ' (capogruppo)' : '') + ' con ' + canale);
      } catch (err) {
        esiti.push(x.pass.codice + ' ' + x.tipo + ' errore: ' + String(err.message).slice(0, 80));
      }
    });
  } finally {
    lock.releaseLock();
  }
  PropertiesService.getScriptProperties().setProperty('SOLLECITI_ESITO', new Date().toISOString().slice(0, 16) + ' ' + serata + ' ' + (esiti.join(' · ') || 'nessuno'));
}

/* Chi ha confermato in un gruppo ancora incompleto riceve il pass lo stesso: gli orari sono nella colonna "regalo"
 * della serata (il 30.10: 18:00 e 22:00; vuota = nessun pass regalo).
 * Il gruppo passa a "completo", così i pass confermati diventano validi all'ingresso (passAttivo_) e compaiono nell'app staff;
 * chi non ha confermato resta senza pass. Esito per codice nella pagina di stato. */
function passRegalo_(serata) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
  var esiti = [];
  try {
    var db = carica_(['Serate', 'Pass', 'Gruppi']);
    var s = serata_(db, serata);
    var now = new Date();
    db.Gruppi.forEach(function (g) {
      if (g.serata !== serata || g.stato !== 'aperto') return;
      var confermati = statoGruppo_(db, g).confermati;
      if (!confermati.length) return;
      aggiorna_(db.Gruppi, g, { stato: 'completo', completato: now });
      confermati.forEach(function (r) {
        try {
          emailPass_(r, s, { regalo: true });
          esiti.push(r.codice + ' inviato');
        } catch (err) {
          esiti.push(r.codice + ' errore: ' + String(err.message).slice(0, 80));
        }
      });
    });
  } finally {
    lock.releaseLock();
  }
  accoda_('REGALO_ESITO', new Date().toISOString().slice(0, 16) + ' ' + serata + ' ' + (esiti.join(' · ') || 'nessuno'));
}

/* Conferma a mano un pass di gruppo per chi ci ha scritto che il link non arriva. Controllo di sicurezza: il cognome
 * deve contenere cognomeParte. Se l'indirizzo nel foglio è diverso da quello da cui ci ha scritto, si corregge.
 * Se così il gruppo arriva a CONFIG.dimensioneGruppo confermati, diventa completo e ognuno riceve il pass (come in azionePass_).
 * Esito, solo codici, nella pagina di stato (riga "Ricerca segnalazione"). */
function confermaAMano_(codice, email, cognomeParte) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
  var esito;
  try {
    var db = carica_(['Serate', 'Pass', 'Gruppi', 'Contatti']);
    var pass = trova_(db.Pass, 'codice', codice);
    if (!pass) throw new Error(codice + ' non trovato');
    if (String(pass.cognome).toLowerCase().indexOf(cognomeParte) < 0) throw new Error(codice + ': il cognome non corrisponde, non tocco niente');
    if (pass.tipo !== 'gruppo') throw new Error(codice + ' non è un pass di gruppo');
    var s = serata_(db, pass.serata);
    var g = gruppo_(db, pass.rif);
    var st = statoGruppo_(db, g);
    if (st.stato !== 'aperto') throw new Error(codice + ': gruppo ' + st.stato + ', non tocco niente');
    var n = normEmail_(email);
    var cambi = {};
    if (pass.email_norm !== n) {
      var altro = db.Pass.filter(function (r) { return r !== pass && r.serata === pass.serata && r.email_norm === n && r.stato !== 'annullato'; })[0];
      if (altro) throw new Error(codice + ': l\'indirizzo è già su ' + altro.codice + ', non tocco niente');
      cambi.email = email;
      cambi.email_norm = n;
    }
    if (pass.stato === 'da_confermare') { cambi.stato = 'confermato'; cambi.confermato = new Date(); }
    aggiorna_(db.Pass, pass, cambi);
    contatto_(db, pass);
    esito = codice + (cambi.email ? ' email corretta,' : ' email già giusta,') + ' confermato';
    var st2 = statoGruppo_(db, g);
    if (st2.stato === 'aperto' && st2.confermati.length >= CONFIG.dimensioneGruppo) {
      aggiorna_(db.Gruppi, g, { stato: 'completo', completato: new Date() });
      esito += ', gruppo completo, pass: ' + st2.confermati.map(function (m) {
        try { emailPass_(m, s); return m.codice + ' inviato'; }
        catch (err) { return m.codice + ' errore: ' + String(err.message).slice(0, 80); }
      }).join(', ');
    } else {
      esito += ', gruppo ancora ' + st2.stato + ' (' + st2.confermati.length + '/' + st2.membri.length + ')';
    }
  } finally {
    lock.releaseLock();
  }
  accoda_('CERCA_ESITO', new Date().toISOString().slice(0, 16) + ' ' + esito);
}

/* Completa a mano un gruppo ancora aperto e manda il pass ai confermati. Chi ha già un pass confermato altrove
 * (stessa email o cognome che contiene cognomeDoppione) è un doppione: la riga resta com'è e non riceve niente.
 * Righe senza chiave o codice (aggiunte a mano) non ricevono email. Esito nella riga "Ricerca segnalazione". */
function completaGruppoAMano_(id, emailDoppione, cognomeDoppione) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
  var esiti = [];
  try {
    var db = carica_(['Serate', 'Pass', 'Gruppi']);
    var g = gruppo_(db, id);
    if (!g) throw new Error('gruppo non trovato');
    if (g.stato !== 'aperto') throw new Error('gruppo ' + g.stato + ' nel foglio, non tocco niente');
    var s = serata_(db, g.serata);
    var n = normEmail_(emailDoppione);
    var daAvvisare = [];
    statoGruppo_(db, g).membri.forEach(function (r) {
      var nome = r.codice || 'riga ' + r._riga;
      var suo = r.email_norm === n || String(r.cognome).toLowerCase().indexOf(cognomeDoppione) >= 0;
      var altrove = suo && db.Pass.some(function (x) {
        return x !== r && x.serata === g.serata && x.stato === 'confermato' && (x.email_norm === n || x.email_norm === r.email_norm);
      });
      if (altrove) { esiti.push(nome + ' ha già un pass altrove, lasciato com\'è e niente email'); return; }
      if (r.stato !== 'confermato') { esiti.push(nome + ' non confermato, niente pass'); return; }
      if (!/^[a-f0-9]{24}$/.test(String(r.chiave)) || !r.codice) { esiti.push(nome + ' senza chiave o codice, niente email'); return; }
      daAvvisare.push(r);
    });
    if (!daAvvisare.length) throw new Error('nessun confermato da avvisare: ' + esiti.join(', '));
    aggiorna_(db.Gruppi, g, { stato: 'completo', completato: new Date() });
    daAvvisare.forEach(function (r) {
      try { emailPass_(r, s); esiti.push(r.codice + ' pass inviato'); }
      catch (err) { esiti.push(r.codice + ' errore: ' + String(err.message).slice(0, 80)); }
    });
  } finally {
    lock.releaseLock();
  }
  accoda_('CERCA_ESITO', new Date().toISOString().slice(0, 16) + ' gruppo completato a mano: ' + esiti.join(', '));
}

/* Recap per gli organizzatori, solo numeri: pass, gruppi, lista d'attesa e prenotazioni agli eventi della serata.
 * ora = 'HH:mm' dell'invio previsto; oltre 50 minuti di ritardo il recap è vecchio e non parte. ultimo = 'HH:mm' dell'ultimo recap.
 * Esito nella pagina di stato. */
function recapSerata_(serata, ora, destinatari, ultimo) {
  var previsto = Utilities.parseDate(serata + ' ' + ora, TZ, 'yyyy-MM-dd HH:mm');
  var esito;
  if (new Date() - previsto > 50 * 60000) {
    esito = ora + ' saltato (in ritardo)';
  } else {
    var db = carica_(['Serate', 'Pass', 'Gruppi', 'Attesa', 'Eventi']);
    var s = serata_(db, serata);
    var pass = db.Pass.filter(function (r) { return r.serata === serata && r.stato !== 'annullato'; });
    var validi = pass.filter(function (r) { return passAttivo_(db, r); });
    var gruppi = { completo: 0, aperto: 0, scaduto: 0 };
    db.Gruppi.forEach(function (g) {
      if (g.serata !== serata || g.stato === 'annullato') return;
      var st = statoGruppo_(db, g).stato;
      gruppi[st] = (gruppi[st] || 0) + 1;
    });
    var conta = function (righe, f) { return righe.filter(f).length; };
    var righe = [
      ['Pass validi per entrare', validi.length],
      ['— su invito', conta(validi, function (r) { return r.tipo === 'invito'; })],
      ['— di gruppo', conta(validi, function (r) { return r.tipo === 'gruppo'; })],
      ['Confermati in gruppi non completi', conta(pass, function (r) { return r.stato === 'confermato' && !passAttivo_(db, r); })],
      ['Da confermare', conta(pass, function (r) { return r.stato === 'da_confermare'; })],
      ['Già entrati', conta(pass, function (r) { return !!r.checkin; })],
      ['Gruppi completi', gruppi.completo],
      ['Gruppi aperti', gruppi.aperto],
      ['Gruppi scaduti', gruppi.scaduto],
      ['Lista d\'attesa', conta(db.Attesa, function (r) { return r.serata === serata; })]
    ];
    db.Eventi.filter(function (e) { return e.serata === serata; }).forEach(function (e) {
      var ev = evento_(db, e.id);
      if (!db[ev.foglio]) db[ev.foglio] = carica_([ev.foglio])[ev.foglio];
      var presi = 0;
      db[ev.foglio].forEach(function (r) { if (r[ev.colonna] === ev.id) presi += Number(r.persone) || 1; });
      righe.push(['Prenotati: ' + (ev.titolo || ev.id), presi + (ev.posti ? ' su ' + ev.posti : '')]);
    });
    var titolo = 'Recap delle ' + ora + ' — ' + dataBreve_(s);
    var testo = titolo + '\n\n' + righe.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n');
    var html = '<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px">' +
      '<h2 style="margin:0 0 12px">bolla&reg; · ' + esc_(titolo) + '</h2>' +
      '<table style="border-collapse:collapse;font-size:15px">' + righe.map(function (r) {
        return '<tr><td style="padding:4px 16px 4px 0">' + esc_(r[0]) + '</td><td style="padding:4px 0;font-weight:bold;text-align:right">' + esc_(String(r[1])) + '</td></tr>';
      }).join('') + '</table>' +
      (ultimo && ultimo !== ora ? '<p style="font-size:12px;color:#777;margin-top:16px">Ultimo recap alle ' + esc_(ultimo) + '.</p>' : '') + '</div>';
    var esiti = destinatari.map(function (a) {
      try { return a.split('@')[0] + ' ' + invia_(a, 'bolla® ' + dataBreve_(s) + ' — recap delle ' + ora, testo, html); }
      catch (err) { return a.split('@')[0] + ' errore: ' + String(err.message).slice(0, 80); }
    });
    esito = ora + ' ' + esiti.join(', ');
  }
  accoda_('RECAP_ESITO', serata + ' ' + esito);
}

// prefisso: '' per le email vere, '[Prova …] ' per quelle di prova
function emailPromemoriaConferma_(pass, s, info, prefisso) {
  var data = dataBreve_(s);
  var link = linkPass_(pass.chiave);
  var dim = CONFIG.dimensioneGruppo;
  var entro = dataOra_(info.scadenza);
  // info.tipo: promemoria (default), sollecito (giorno della serata), proroga (gruppo scaduto e riaperto da noi)
  var t = {
    promemoria: { kicker: 'Promemoria', titolo: 'il tuo posto ti aspetta', oggetto: 'Manca solo il tuo clic',
      intro: 'Hai chiesto un pass di gruppo per bolla® di ' + giorno_(fineSerata_(s)) + ', ma la tua email non è ancora confermata. ' },
    sollecito: { kicker: 'Ultime ore', titolo: 'conferma entro le ' + Utilities.formatDate(info.scadenza, TZ, 'HH:mm'), oggetto: 'Ultime ore per confermare il pass',
      intro: 'Stasera c\'è bolla® e la tua email per il pass di gruppo non è ancora confermata. ' },
    proroga: { kicker: 'Buone notizie', titolo: 'abbiamo riaperto il tuo gruppo', oggetto: 'Abbiamo riaperto il tuo gruppo',
      intro: 'Il tempo per confermare il tuo pass di gruppo era finito, ma abbiamo deciso di prorogarlo fino a ' + entro + '. ' }
  }[info.tipo || 'promemoria'];
  var corpo =
    kicker_(t.kicker) +
    titolo_('Ciao ' + esc_(pass.nome) + ', ' + t.titolo) +
    paragrafo_(t.intro + 'Senza conferma il pass non si attiva, né per te né per il tuo gruppo.') +
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
    nota_('Hai tempo fino a ' + entro + '. Dopo, ' + (+info.scadenza >= +scadenzaGruppi_(s) ? 'i gruppi si chiudono e non si può più confermare'
      : info.capogruppo ? 'il gruppo si chiude' : 'il tuo posto può passare a qualcun altro') +
      '. Se non ti serve più, ignora questa email.');
  return invia_(pass.email, prefisso + t.oggetto + ' — bolla® ' + data,
    'Ciao ' + pass.nome + ', la tua email per il pass di gruppo di bolla® del ' + data + ' non è ancora confermata. ' +
      'Conferma entro ' + entro + ' aprendo questo link: ' + link,
    layout_({ banner: 'banner-logo.jpg', anteprima: 'Conferma entro ' + entro + ', poi il pass si attiva', corpo: corpo, s: s, newsletter: vero_(pass.newsletter) }));
}

// A chi ha confermato ma è in un gruppo non ancora completo: manca qualcuno, o la conferma di qualcuno.
function emailGruppoIncompleto_(pass, s, info, prefisso) {
  var data = dataBreve_(s);
  var dim = CONFIG.dimensioneGruppo;
  var entro = dataOra_(info.scadenza);
  var mancaGente = info.membri < dim;
  var corpo =
    kicker_('Ultime ore') +
    titolo_('Ciao ' + esc_(pass.nome) + ', al tuo gruppo manca ancora qualcuno') +
    paragrafo_('Tu hai confermato, grazie! Ma il pass arriva a tutti solo quando confermate in ' + dim + ', e oggi alle ' + s.chiusuraGruppi +
      ' i gruppi si chiudono: se il tuo non è completo, nessuno riceve il pass.') +
    riquadro_(
      '<p style="margin:0 0 6px;font-size:15px;font-weight:700">Il tuo gruppo: ' + info.confermati + ' su ' + dim + ' ' +
        (info.confermati === 1 ? 'ha' : 'hanno') + ' confermato</p>' +
      '<p style="margin:0;font-size:14px;line-height:1.5">' + (mancaGente
        ? 'Nel gruppo ci sono ' + info.membri + ' persone su ' + dim + ': gira il link qui sotto a chi vuoi portare.'
        : 'Siete in ' + dim + ', ma qualcuno non ha ancora confermato la sua email: scrivigli di controllare la posta (anche lo spam).') + '</p>') +
    (mancaGente && info.gruppo ?
      '<p style="margin:24px 0 8px;font-size:15px;font-weight:700">Il link del gruppo</p>' +
      '<p style="margin:0 0 12px;padding:12px 14px;border:1.5px dashed #121212;border-radius:12px;background:#ffffff;font-size:14px;word-break:break-all">' +
        '<a href="' + linkGruppo_(info.gruppo.id) + '" style="color:#121212">' + linkGruppo_(info.gruppo.id) + '</a></p>' +
      bottone_('https://wa.me/?text=' + encodeURIComponent('Entra nel mio gruppo per il pass gratuito di bolla® (' + data + '): ' + linkGruppo_(info.gruppo.id)), 'Invia su WhatsApp', true) : '') +
    '<div style="height:24px"></div>' +
    dettagli_(s, data) +
    nota_('Il gruppo va completato entro ' + entro + '.');
  return invia_(pass.email, prefisso + 'Al tuo gruppo manca qualcuno — bolla® ' + data,
    'Ciao ' + pass.nome + ', tu hai confermato ma il tuo gruppo per bolla® del ' + data + ' non è ancora completo (' + info.confermati + ' su ' + dim +
      '). Va completato entro ' + entro + (mancaGente && info.gruppo ? ': ' + linkGruppo_(info.gruppo.id) : '.'),
    layout_({ banner: 'banner-logo.jpg', anteprima: 'Il gruppo va completato entro ' + entro, corpo: corpo, s: s, newsletter: vero_(pass.newsletter) }));
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

// o.regalo: pass dato lo stesso a chi era in un gruppo non completo; o.prefisso: '[Prova] ' per le prove
function emailPass_(pass, s, o) {
  o = o || {};
  var data = dataBreve_(s);
  var corpo =
    kicker_(o.regalo ? 'Il pass è tuo lo stesso' : 'Il tuo pass è attivo') +
    titolo_('Ciao ' + esc_(pass.nome) + ', ci vediamo dentro la bolla') +
    (o.regalo ? paragrafo_('Il tuo gruppo non si è completato in tempo, ma siamo felici di averti dentro in ogni caso. ' +
      'Il pass è attivo: ti aspettiamo.') : '') +
    // biglietto: QR grande, codice, nome
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border:1.5px solid #121212;border-radius:18px;background:#ffffff">' +
      '<tr><td align="center" style="padding:24px 16px 8px">' +
        qrTabella_(pass.chiave, 200) +
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
  invia_(pass.email, (o.prefisso || '') + (o.regalo ? 'Il pass è tuo lo stesso — bolla® ' : 'Il tuo pass bolla® — ') + data + ' · ' + pass.codice,
    'Pass ' + pass.codice + ' per ' + pass.nome + ' ' + pass.cognome + ' — ' + data + '. Apri: ' + linkPass_(pass.chiave),
    layout_({ banner: 'banner-sfera.jpg', anteprima: 'Pass ' + pass.codice + ': mostra il QR all\'ingresso', corpo: corpo, s: s, newsletter: vero_(pass.newsletter) }));
}

// Struttura a tabelle: è quella che i client email (Gmail, Outlook, Apple Mail) mostrano meglio.
function layout_(o) {
  var img = CONFIG.sito + '/assets/' + o.banner;
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  // modalità scura: chiede ai client di non invertire i colori, così il QR resta nero su bianco
  '<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>' +
  '<body style="margin:0;padding:0;background:#e9e7e3">' +
  '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc_(o.anteprima) + '</div>' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9e7e3;font-family:Helvetica,Arial,sans-serif;color:#121212">' +
    '<tr><td align="center" style="padding:28px 12px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#f3f2ef;border:1.5px solid #121212;border-radius:22px;overflow:hidden">' +
        '<tr><td style="padding:0;line-height:0"><a href="' + CONFIG.sito + '"><img src="' + img + '" width="520" alt="' + esc_(o.bannerAlt || 'bolla®') + '" style="display:block;width:100%;max-width:520px;height:auto;border:0"></a></td></tr>' +
        '<tr><td style="padding:28px 24px 8px">' + o.corpo + '</td></tr>' +
        '<tr><td style="padding:8px 24px 28px">' +
          // s.titolo vuoto (mail Vibes): niente riga col titolo, la linea passa sopra il testo della newsletter
          (o.s.titolo ? '<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #d6d3ce;font-size:13px;color:#5f5b56">' + esc_(o.s.titolo) + '</p>' : '') +
          (o.newsletter ? '<p style="' + (o.s.titolo ? 'margin:8px 0 0;' : 'margin:16px 0 0;padding-top:16px;border-top:1px solid #d6d3ce;') + 'font-size:12px;line-height:1.5;color:#5f5b56">Sei iscritto alla newsletter di bolla®: ti scriveremo solo per le prossime serate e non cederemo la tua email a terzi. Per disiscriverti rispondi con "cancellami".</p>' : '') +
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
  var righe = [['Quando', data + (s.orario ? ', ' + s.orario : '')]];
  if (s.luogo) righe.push(['Dove', s.luogo]);
  righe.push(['Ingresso', (s.senzaPass ? s.senzaPass + ' · ' : '') + 'Gratuito con pass']);
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
 *    le email. Mittente sul dominio autenticato bbbbolla.it, molto meno spam. Brevo non supporta immagini
 *    dentro il testo: il QR è disegnato con una tabella HTML (qrTabella_), niente allegati.
 *  - Gmail (MailApp, 100 al giorno): solo di riserva, se Brevo non è collegato o rifiuta l'invio. */
function invia_(a, oggetto, testo, html) {
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
        inviaBrevo_(brevo, a, oggetto, testo, html);
      } else {
        if (!gmailLibero) continue;
        inviaGmail_(a, oggetto, testo, html);
      }
      return ordine[i];
    } catch (err) {
      ultimoErrore = err;
      console.error('Invio con ' + ordine[i] + ' non riuscito a ' + a + ': ' + err);
    }
  }
  throw ultimoErrore || new Error('Nessun canale email disponibile');
}

function inviaGmail_(a, oggetto, testo, html) {
  var opzioni = { name: CONFIG.nomeMittente, htmlBody: html };
  if (CONFIG.replyTo) opzioni.replyTo = CONFIG.replyTo;
  MailApp.sendEmail(a, oggetto, testo, opzioni);
}

function inviaBrevo_(chiave, a, oggetto, testo, html) {
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
  var db = carica_(['Serate']);
  var s = serata_(db, db.Serate[0] && db.Serate[0].id);
  var finto = { nome: 'Prova', cognome: 'Brevo', email: CONFIG.replyTo, codice: 'BOL-PROVA', chiave: token_(24), tipo: 'invito', newsletter: 'FALSE' };
  try {
    var data = dataBreve_(s);
    inviaBrevo_(chiave, CONFIG.replyTo, '[Prova] Il tuo pass bolla® — ' + data, 'Email di prova inviata con Brevo.',
      layout_({ banner: 'banner-sfera.jpg', anteprima: 'Email di prova', corpo: kicker_('Prova') + titolo_('Brevo funziona') +
        paragrafo_('Questa email è partita da Brevo con mittente ' + CONFIG.mittenteBrevo + '. Sotto trovi il QR come appare nei pass.') +
        qrTabella_(finto.chiave, 200), s: s, newsletter: false }));
    ui.alert('Email di prova inviata a ' + CONFIG.replyTo + '. Controlla la posta (anche lo spam).');
  } catch (err) {
    ui.alert('Invio con Brevo non riuscito:\n\n' + err.message);
  }
}

function erroreQuota_() {
  return errore_('email', 'Oggi abbiamo raggiunto il limite di email inviabili. Riprova domani.');
}

// QR della chiave del pass disegnato con una tabella HTML: si vede dentro l'email senza immagini né allegati
// (Gmail blocca le immagini data:, Brevo non manda immagini inline). Le celle vicine dello stesso colore
// si uniscono (colspan) per tenere l'email leggera; la prima riga, alta 0, fissa la larghezza delle colonne.
function qrTabella_(chiave, lato) {
  var qr = qrcode(0, 'M');
  qr.addData(chiave);
  qr.make();
  var n = qr.getModuleCount(), bordo = 2, tot = n + 2 * bordo;
  var cella = Math.max(4, Math.round(lato / tot));
  var scuro = function (r, c) { return r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c); };
  var td = 'style="padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly"';
  var colonne = '';
  for (var i = 0; i < tot; i++) colonne += '<td width="' + cella + '" height="0" ' + td + '></td>';
  var righe = '<tr>' + colonne + '</tr>';
  for (var r = -bordo; r < n + bordo; r++) {
    var riga = '';
    for (var c = -bordo; c < n + bordo;) {
      var nero = scuro(r, c), lung = 1;
      while (c + lung < n + bordo && scuro(r, c + lung) === nero) lung++;
      riga += '<td' + (lung > 1 ? ' colspan="' + lung + '"' : '') + ' width="' + (cella * lung) + '" height="' + cella + '" bgcolor="' +
        (nero ? '#000000' : '#ffffff') + '" ' + td + '></td>';
      c += lung;
    }
    righe += '<tr>' + riga + '</tr>';
  }
  return '<table role="presentation" class="qr" cellpadding="0" cellspacing="0" border="0" width="' + (cella * tot) + '" bgcolor="#ffffff" ' +
    'style="border-collapse:collapse;table-layout:fixed;width:' + (cella * tot) + 'px;margin:0 auto;background:#ffffff">' + righe + '</table>';
}

/* ============================================================
   Contatti e newsletter
   Foglio Contatti: una riga per persona (email normalizzata), scritta quando un suo pass diventa confermato
   (email verificata). "serate" = a quante serate ha avuto un pass, "prima" e "ultima" = id delle serate.
   Disiscrizione: scrivi FALSE nella colonna "newsletter" del foglio Contatti. Vale per sempre: un nuovo pass
   non la riattiva (per riattivarla scrivi TRUE a mano). Anche FALSE nel foglio Pass, come prima, vale come disiscrizione.
   Menu bolla® → Esporta newsletter: ricrea il foglio "Newsletter" (un'email per riga, solo gli iscritti).
   ============================================================ */

// Dentro il lock, con db.Contatti caricato. Pass senza email (QR esterni): niente contatto.
function contatto_(db, pass) {
  if (!pass.email_norm) return;
  var c = trova_(db.Contatti, 'email_norm', pass.email_norm);
  var now = new Date();
  if (!c) {
    appendi_('Contatti', { creato: now, email_norm: pass.email_norm, email: pass.email, nome: pass.nome, cognome: pass.cognome,
      newsletter: vero_(pass.newsletter) ? 'TRUE' : 'FALSE', prima: pass.serata, ultima: pass.serata, serate: 1, aggiornato: now });
    return;
  }
  var cambi = { aggiornato: now };
  if (c.ultima !== pass.serata) { cambi.ultima = pass.serata; cambi.serate = (Number(c.serate) || 0) + 1; }
  // un no alla newsletter vale sempre; un sì non riattiva chi si è disiscritto
  if (!vero_(pass.newsletter) && vero_(c.newsletter)) cambi.newsletter = 'FALSE';
  aggiorna_(db.Contatti, c, cambi);
}

// Rifà il foglio Contatti dai pass confermati (foglio Pass e archivio). Le disiscrizioni già scritte in Contatti restano.
function ricostruisciContatti_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('lock occupato, riprovo al prossimo giro');
  try {
    var db = carica_(['Pass', 'Contatti']);
    var no = {};
    db.Contatti.forEach(function (c) { if (c.email_norm && String(c.newsletter) !== '' && !vero_(c.newsletter)) no[c.email_norm] = true; });
    var per = {};
    var ordine = [];
    leggiArchivio_('Pass').concat(db.Pass).forEach(function (r) {
      if (!r.email_norm) return;
      if (!vero_(r.newsletter)) no[r.email_norm] = true;
      if (r.stato !== 'confermato') return;
      var c = per[r.email_norm];
      if (!c) {
        c = per[r.email_norm] = { creato: r.confermato || r.creato, email_norm: r.email_norm, email: r.email, nome: r.nome, cognome: r.cognome,
          prima: r.serata, ultima: r.serata, serate: {} };
        ordine.push(c);
      }
      c.serate[r.serata] = true;
      if (String(r.serata) < String(c.prima)) c.prima = r.serata;
      if (String(r.serata) > String(c.ultima)) c.ultima = r.serata;
    });
    // disiscritti senza un pass confermato: restano come FALSE, così un pass futuro non li riscrive alla newsletter
    leggiArchivio_('Pass').concat(db.Pass).forEach(function (r) {
      if (!r.email_norm || per[r.email_norm] || !no[r.email_norm]) return;
      per[r.email_norm] = { creato: r.creato, email_norm: r.email_norm, email: r.email, nome: r.nome, cognome: r.cognome, prima: '', ultima: '', serate: {} };
      ordine.push(per[r.email_norm]);
    });
    db.Contatti.forEach(function (c) {
      if (!c.email_norm || per[c.email_norm] || !no[c.email_norm]) return;
      per[c.email_norm] = { creato: c.creato, email_norm: c.email_norm, email: c.email, nome: c.nome, cognome: c.cognome, prima: c.prima, ultima: c.ultima, serate: {} };
      ordine.push(per[c.email_norm]);
    });
    var now = new Date();
    var sh = SpreadsheetApp.getActive().getSheetByName('Contatti');
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var valori = ordine.map(function (c) {
      var riga = { creato: c.creato, email_norm: c.email_norm, email: c.email, nome: c.nome, cognome: c.cognome,
        newsletter: no[c.email_norm] ? 'FALSE' : 'TRUE', prima: c.prima, ultima: c.ultima, serate: Object.keys(c.serate).length, aggiornato: now };
      return head.map(function (h) { return riga[h] == null ? '' : cella_(riga[h]); });
    });
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, head.length).clearContent();
    if (valori.length) sh.getRange(2, 1, valori.length, head.length).setValues(valori);
    PropertiesService.getScriptProperties().setProperty('CONTATTI_ESITO', now.toISOString().slice(0, 16) + ' ricostruiti: ' + valori.length +
      ' persone, iscritte alla newsletter ' + valori.filter(function (v) { return v[head.indexOf('newsletter')] === 'TRUE'; }).length);
  } finally {
    lock.releaseLock();
  }
}

function esportaNewsletter() {
  var db = carica_(['Pass', 'Contatti']);
  // FALSE scritto nel foglio Pass (come si faceva prima del foglio Contatti) passa anche nei Contatti
  var noPass = {};
  db.Pass.forEach(function (r) { if (r.email_norm && !vero_(r.newsletter)) noPass[r.email_norm] = true; });
  var righe = [];
  db.Contatti.forEach(function (c) {
    if (!c.email_norm) return;
    if (noPass[c.email_norm] && vero_(c.newsletter)) aggiorna_(db.Contatti, c, { newsletter: 'FALSE' });
    if (vero_(c.newsletter)) righe.push([c.creato, c.nome, c.cognome, c.email]);
  });

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Newsletter') || ss.insertSheet('Newsletter');
  sh.clearContents();
  sh.appendRow(['iscritto il', 'nome', 'cognome', 'email']);
  if (righe.length) sh.getRange(2, 1, righe.length, 4).setValues(righe);
  sh.setFrozenRows(1);
}

/* ============================================================
   Mail Vibes: grazie per la serata e link a foto e video (bbbbolla.it/vibes.html#<serata>)
   A tutti gli iscritti alla newsletter del foglio Contatti (FALSE in Contatti o nel foglio Pass = escluso).
   Parte da una voce una tantum con "dopo". Solo Brevo: Gmail (100 al giorno) resta per i pass della serata dopo.
   Chi l'ha già ricevuta non la riceve di nuovo: gli indirizzi fatti sono nella proprietà VIBES_FATTI:<serata>,
   così un giro interrotto (tempo massimo di Apps Script, Brevo che rifiuta) riparte dagli altri al giro dopo.
   Esito, solo numeri, nella pagina di stato (riga "Mail Vibes").
   ============================================================ */

// o.racconto: frase sulla serata (HTML già sicuro); o.prossima e o.prossimaTesto: id e due righe sulla serata dopo,
// per il riquadro con il bottone del pass (facoltativi);
// o.prova: un solo indirizzo, con [Prova] nell'oggetto e senza segnare niente.
function mailVibes_(serata, o) {
  var db = carica_(['Serate', 'Pass', 'Contatti']);
  var s = serata_(db, serata);
  if (!s) throw new Error('serata ' + serata + ' non trovata');
  o.dopo = o.prossima ? serata_(db, o.prossima) : null;
  mailATutti_(db, {
    etichetta: serata, fatti: 'VIBES_FATTI:' + serata, esito: 'VIBES_ESITO', prova: o.prova, oggetto: oggettoVibes_(),
    testo: function (c) { return testoVibes_(c.nome, s); },
    html: function (c) { return emailVibes_(c.nome, s, o); }
  });
}

/* Una mail a tutti gli iscritti alla newsletter (Contatti con newsletter TRUE, tranne chi in un pass ha detto no), solo con Brevo.
 * m.prova = un indirizzo: parte solo a quello, con "[Prova]" nell'oggetto e il nome Pietro.
 * Gli indirizzi già fatti restano nella proprietà m.fatti ("!" = provato e non riuscito, non si riprova): niente doppioni,
 * e dopo un'interruzione si riprende da dove si era rimasti. m.testo(c) e m.html(c) ricevono il contatto.
 * m.filtro(c), facoltativo: false = quel contatto non la riceve. */
function mailATutti_(db, m) {
  var brevo = chiaveBrevo_();
  if (!brevo) throw new Error('Brevo non collegato');
  var props = PropertiesService.getScriptProperties();

  if (m.prova) {
    var pietro = { nome: 'Pietro', email: m.prova, email_norm: String(m.prova).toLowerCase() };
    inviaBrevo_(brevo, m.prova, '[Prova] ' + m.oggetto, m.testo(pietro), m.html(pietro));
    accoda_(m.esito, new Date().toISOString().slice(0, 16) + ' ' + m.etichetta + ' prova inviata');
    return;
  }

  var fatti = {};
  (props.getProperty(m.fatti) || '').split('\n').forEach(function (e) { if (e) fatti[e.replace(/^!/, '')] = e; });
  var noPass = {};
  db.Pass.forEach(function (r) { if (r.email_norm && !vero_(r.newsletter)) noPass[r.email_norm] = true; });
  var lista = db.Contatti.filter(function (c) {
    return c.email_norm && c.email && vero_(c.newsletter) && !noPass[c.email_norm] && !fatti[c.email_norm] && (!m.filtro || m.filtro(c));
  });

  var inizio = Date.now();
  var inviate = 0, errori = 0, diFila = [];
  var salva = function () { props.setProperty(m.fatti, Object.keys(fatti).map(function (k) { return fatti[k]; }).join('\n')); };
  try {
    for (var i = 0; i < lista.length; i++) {
      // Apps Script si ferma a 6 minuti: oltre i 4 si riprende al giro dopo
      if (Date.now() - inizio > 4 * 60 * 1000) throw new Error('tempo finito, continuo al prossimo giro');
      var c = lista[i];
      try {
        inviaBrevo_(brevo, c.email, m.oggetto, m.testo(c), m.html(c));
        fatti[c.email_norm] = c.email_norm;
        inviate++;
        diFila = [];
      } catch (err) {
        console.error('Mail ' + m.esito + ' non inviata a ' + c.email + ': ' + err);
        // "!" = provata e non riuscita: non si riprova
        fatti[c.email_norm] = '!' + c.email_norm;
        errori++;
        diFila.push(c.email_norm);
        // tre errori di fila: Brevo non risponde, non l'indirizzo. Quei tre si riprovano al giro dopo
        if (diFila.length >= 3) {
          diFila.forEach(function (e) { delete fatti[e]; });
          errori -= diFila.length;
          throw new Error('Brevo rifiuta: ' + String(err.message).slice(0, 120));
        }
      }
      if (inviate % 20 === 0) salva();
    }
  } finally {
    salva();
    var tutti = Object.keys(fatti);
    accoda_(m.esito, new Date().toISOString().slice(0, 16) + ' ' + m.etichetta + ': ' + inviate + ' inviate in questo giro, ' +
      errori + ' non riuscite; in tutto ' + tutti.filter(function (k) { return fatti[k] === k; }).length + ' inviate, ' +
      (lista.length - inviate - errori) + ' ancora da inviare');
  }
}

/* Mail d'invito a una serata: locandina al posto del banner, programma con i link, bottoni per pass, workshop e cena.
 * Chi ha già un pass vivo per la serata trova "Apri il tuo pass" al posto di "Prenota il pass". */
function mailInvito_(serata, o) {
  var db = carica_(['Serate', 'Pass', 'Gruppi', 'Contatti']);
  var s = serata_(db, serata);
  if (!s) throw new Error('serata ' + serata + ' non trovata');
  var passDi = {};
  db.Pass.forEach(function (r) { if (r.serata === s.id && r.email_norm && passVivo_(db, r)) passDi[r.email_norm] = r; });
  var filtro = filtroInvito_(db, s, o);
  mailATutti_(db, {
    etichetta: serata, fatti: 'INVITO_FATTI:' + serata, esito: 'INVITO_ESITO', prova: o.prova, oggetto: o.oggetto, filtro: filtro,
    testo: function (c) { return testoInvito_(c.nome, s, o, passDi[c.email_norm]); },
    html: function (c) { return emailInvito_(c.nome, s, o, passDi[c.email_norm]); }
  });
}

// o.iscrittiPrima ('yyyy-MM-dd'): solo i contatti con la prima conferma (colonna "creato") prima di quel giorno, ora italiana.
// o.senzaPass: niente mail a chi ha già un pass per la serata (qualsiasi riga del foglio Pass non annullata).
function filtroInvito_(db, s, o) {
  var limite = o.iscrittiPrima ? Utilities.parseDate(o.iscrittiPrima + ' 00:00', TZ, 'yyyy-MM-dd HH:mm') : null;
  var conPass = {};
  db.Pass.forEach(function (r) { if (r.serata === s.id && r.email_norm && r.stato !== 'annullato') conPass[r.email_norm] = true; });
  return function (c) {
    if (o.senzaPass && conPass[c.email_norm]) return false;
    if (!limite) return true;
    var d = c.creato instanceof Date ? c.creato : new Date(c.creato);
    return !isNaN(d) && String(c.creato) !== '' && d < limite;
  };
}

// Quanti riceverebbero la mail d'invito, senza inviare niente (solo numeri, per la pagina di stato)
function contaInvito_(serata, o) {
  var db = carica_(['Serate', 'Pass', 'Gruppi', 'Contatti']);
  var s = serata_(db, serata);
  var noPass = {};
  db.Pass.forEach(function (r) { if (r.email_norm && !vero_(r.newsletter)) noPass[r.email_norm] = true; });
  var iscritti = db.Contatti.filter(function (c) { return c.email_norm && c.email && vero_(c.newsletter) && !noPass[c.email_norm]; });
  var conta = function (oo) { var f = filtroInvito_(db, s, oo); return iscritti.filter(f).length; };
  // il giorno dopo il limite: per contare anche chi si è iscritto il giorno stesso
  var giorno = o.iscrittiPrima ? Utilities.formatDate(new Date(Utilities.parseDate(o.iscrittiPrima + ' 12:00', TZ, 'yyyy-MM-dd HH:mm').getTime() + 86400000), TZ, 'yyyy-MM-dd') : '';
  PropertiesService.getScriptProperties().setProperty('INVITO_CONTEGGIO', new Date().toISOString().slice(0, 16) + ' ' + serata +
    ': iscritti alla newsletter ' + iscritti.length +
    ' · senza pass per la serata ' + conta({ senzaPass: true }) +
    ' · iscritti prima del ' + o.iscrittiPrima + ' ' + conta({ iscrittiPrima: o.iscrittiPrima }) +
    ' · entrambe le cose (riceveranno la mail) ' + conta(o) +
    (giorno ? ' · se valesse anche chi si è iscritto il giorno stesso ' + conta({ senzaPass: o.senzaPass, iscrittiPrima: giorno }) : ''));
}

function testoInvito_(nome, s, o, pass) {
  return 'Ciao ' + nome + ', ' + o.invito + ' ' + giorno_(fineSerata_(s)) + ', ' + o.orario + ', ' + String(s.luogo).split(',')[0] + '. ' +
    o.programma.map(function (p) { return (p.ora ? p.ora + ' ' : '') + p.nome; }).join(' · ') + '. ' +
    (pass ? 'Il tuo pass: ' + linkPass_(pass.chiave) : 'Il pass è gratuito: ' + CONFIG.sito + '/#prenota') + ' — ' +
    o.bottoni.map(function (b) { return b.testo + ': ' + b.href; }).join(' — ');
}

function emailInvito_(nome, s, o, pass) {
  var a = function (href, t) { return '<a href="' + href + '" style="color:#121212;text-decoration:underline">' + t + '</a>'; };
  var luogo = String(s.luogo).split(',')[0];
  var dettagli = dettagli_({ orario: o.orario, luogo: s.luogo, senzaPass: s.senzaPass }, giorno_(fineSerata_(s)));
  // programma: ora a sinistra, nome (con link) e una riga sotto
  var programma = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;font-size:15px">' +
    o.programma.map(function (p) {
      var nomi = p.link ? a(p.link, esc_(p.nome)) : (p.artisti || [p]).map(function (x) { return x.link ? a(x.link, esc_(x.nome)) : esc_(x.nome); }).join(' · ');
      return '<tr><td style="padding:10px 0;border-top:1px solid #d6d3ce;width:56px;vertical-align:top;font-weight:700;font-size:14px">' + (p.ora || '') + '</td>' +
        '<td style="padding:10px 0;border-top:1px solid #d6d3ce;vertical-align:top"><span style="font-weight:700">' + nomi + '</span>' +
        (p.nota ? '<br><span style="font-size:13px;color:#5f5b56">' + esc_(p.nota) + '</span>' : '') + '</td></tr>';
    }).join('') + '</table>';
  var corpo =
    kicker_(Utilities.formatDate(fineSerata_(s), TZ, 'dd.MM') + ' · ' + esc_(luogo)) +
    titolo_(o.titolo) +
    paragrafo_('Ciao ' + esc_(nome) + ',') +
    paragrafo_(o.racconto) +
    dettagli +
    (pass
      ? bottone_(linkPass_(pass.chiave), 'Apri il tuo pass') + nota_('Hai già il pass per questa serata: all\'ingresso mostra il QR.')
      : bottone_(CONFIG.sito + '/#prenota', 'Prenota il pass gratuito')) +
    '<p style="margin:28px 0 0;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#5f5b56">Programma</p>' +
    programma +
    o.bottoni.map(function (b) {
      return riquadro_('<p style="margin:0 0 6px;font-size:15px;font-weight:700">' + esc_(b.titolo) + '</p>' +
        '<p style="margin:0 0 14px;font-size:14px;line-height:1.5">' + esc_(b.descrizione) + '</p>' + bottone_(b.href, esc_(b.testo), true));
    }).join('') +
    nota_(a(o.mappa, 'Come arrivare al ' + esc_(luogo)) + ' · ' + a(o.instagram, 'bolla® su Instagram') + ' · ' +
      a(CONFIG.sito + '/vibes.html', 'Le Vibes della prima serata'));
  return layout_({ banner: o.locandina, bannerAlt: o.locandinaAlt, anteprima: o.anteprima, corpo: corpo, s: { titolo: '' }, newsletter: true });
}

// testi della mail d'invito al 6.11 (come la pagina: js/config.js, serata 2026-11-06)
var INVITO_06_11 = {
  base: function () {
    return {
      oggetto: 'Venerdì 6 novembre torna bolla®: samba, cena colombiana e Tavola Cunzata',
      anteprima: 'Workshop di samba, cena colombiana, Tavola Cunzata dal vivo, jam session e selezioni fino a tardi',
      locandina: 'locandine/2026-11-06-serata.jpg',
      locandinaAlt: 'Locandina di bolla® del 6 novembre 2026',
      titolo: 'Ti aspettiamo nella bolla®',
      racconto: 'Venerdì 6 novembre si parte alle 19:00 con il workshop di samba e percussioni, poi la cena colombiana di Marina, ' +
        'Tavola Cunzata che registra dal vivo, la jam session e le selezioni di Milenaria e Dario Aiello fino a tardi.',
      invito: 'ti aspettiamo alla seconda serata di bolla®:',
      orario: 'dalle 19:00',
      mappa: 'https://www.google.com/maps/search/?api=1&query=MONO+Via+Gornalunga+12+95129+Catania',
      instagram: 'https://www.instagram.com/bbbbolla/',
      // destinatari (richiesta dell'utente, 05.11): iscritti entro il 30.10 compreso e senza pass per il 6.11
      iscrittiPrima: '2026-10-31',
      senzaPass: true,
      programma: [
        { ora: '19:00', nome: 'Workshop di samba e percussioni', link: 'https://www.instagram.com/sambazita_/', nota: 'a cura di Sambazita · su prenotazione' },
        { ora: '20:00', nome: 'Cena colombiana', link: CONFIG.sito + '/6nov-tavolacunzata/', nota: 'con Marina dell’Antojito Colombiano · 15€ con bevanda, su prenotazione' },
        { ora: '21:00', nome: 'Tavola Cunzata', link: 'https://www.instagram.com/tavolacunzata.podcast/', nota: 'live podcast con Marina dell’Antojito Colombiano' },
        { ora: '22:00', nome: 'Live Jam Session', nota: 'con l’orchestra del podcast' },
        { ora: '23:30', nome: 'Milenaria · Dario Aiello', nota: 'selezioni musicali: cumbia · downtempo · elettronica',
          artisti: [{ nome: 'Milenaria', link: 'https://www.instagram.com/milenaria.sur/' }, { nome: 'Dario Aiello', link: 'https://www.instagram.com/darioaiello77/' }] },
        { nome: 'Vini Manciaciumi', link: 'https://www.instagram.com/manciaciumi.etna/', nota: 'cantina del giorno' },
        { nome: 'MONAMOUR', nota: 'cucina dalle 19 alle 23' }
      ],
      bottoni: [
        { titolo: 'Workshop di samba e percussioni · 19:00', descrizione: 'Con la Scuola Popolare Sambazita. Aperto a tutti, nessuna esperienza richiesta.',
          testo: 'Prenota il workshop', href: CONFIG.sito + '/prenota.html?e=samba-2026-11-06' },
        { titolo: 'Cena colombiana · 20:00', descrizione: 'Arroz con pollo, empanadas e bebida “La Colombiana”, anche in versione veggy. 15€ con bevanda inclusa.',
          testo: 'Prenota la cena', href: CONFIG.sito + '/6nov-tavolacunzata/' }
      ]
    };
  },
  prova: function (a) { var o = INVITO_06_11.base(); o.prova = a; return o; },
  tutti: function () { return INVITO_06_11.base(); }
};

// testi della mail Vibes del 30.10
var VIBES_30_10 = {
  base: function () {
    return {
      racconto: 'Venerdì 30 ottobre abbiamo iniziato con la prima serata di bolla®: il workshop di cumbia colombiana, ' +
        'il live di Selva Cosmica e le selezioni di Franzuà e Dario Aiello fino a tardi.',
      prossima: '2026-11-06',
      prossimaTesto: 'con un workshop, la cena colombiana di Tavola Cunzata e un DJ set fino a tardi'
    };
  },
  prova: function (a) { var o = VIBES_30_10.base(); o.prova = a; return o; },
  tutti: function () { return VIBES_30_10.base(); }
};

function oggettoVibes_() {
  return 'Grazie per essere entrati nella bolla®';
}

function testoVibes_(nome, s) {
  return 'Ciao ' + nome + ', grazie per la serata di bolla® del ' + dataBreve_(s) + '. ' +
    'Foto e video della serata sono sul sito, nella sezione Vibes: ' + linkVibes_(s) + ' — ' +
    'Ti riconosci in una foto e preferisci che non ci sia? Rispondi a questa email e la togliamo.';
}

function linkVibes_(s) { return CONFIG.sito + '/vibes.html#' + s.id; }

function emailVibes_(nome, s, o) {
  var dopo = o.dopo;
  var luogo = String(s.luogo).split(',')[0];
  var corpo =
    kicker_(Utilities.formatDate(fineSerata_(s), TZ, 'dd.MM') + ' · ' + esc_(luogo)) +
    titolo_('Grazie per esserci stati') +
    paragrafo_('Ciao ' + esc_(nome) + ',') +
    paragrafo_(o.racconto) +
    bottone_(linkVibes_(s), 'Guarda le Vibes') +
    (dopo ? riquadro_(
      '<p style="margin:0 0 6px;font-size:15px;font-weight:700">Prossima serata: ' + esc_(giorno_(fineSerata_(dopo))) + '</p>' +
      '<p style="margin:0 0 14px;font-size:14px;line-height:1.5">Al ' + esc_(String(dopo.luogo).split(',')[0]) + ', ' + esc_(dopo.orario) +
        (o.prossimaTesto ? ', ' + o.prossimaTesto : '') + '. Il pass è gratuito: prenotalo sul sito.</p>' +
      bottone_(CONFIG.sito + '/#prenota', 'Prenota il pass', true)) : '') +
    nota_('Ti riconosci in una foto e preferisci che non ci sia? Rispondi a questa email e la togliamo.');
  return layout_({ banner: 'banner-sfera.jpg', anteprima: 'Foto e video del ' + giorno_(fineSerata_(s)).replace(/^\S+ /, '') + ' sono sul sito',
    corpo: corpo, s: { titolo: '' }, newsletter: true });   // niente titolo della serata in fondo (richiesta dell'utente)
}

/* ============================================================
   Serate e automazioni
   Ogni serata è una riga del foglio Serate (menu bolla® → Nuova serata…). Colonne facoltative, vuote = valore di CONFIG:
     orario, luogo, senza_pass        testi delle email (senza_pass "-" = nessun ingresso senza pass)
     chiusura_pass, chiusura_gruppi   HH:mm del giorno della serata
   Automazioni, vuote = spente. Una o più ore separate da virgola; ognuna parte una volta sola:
     promemoria  email a chi non ha ancora confermato il pass di gruppo                     es. "-2 14:00"
     solleciti   ultime ore / gruppo riaperto / manca qualcuno (prima della chiusura gruppi) es. "09:30"
     regalo      pass dato lo stesso a chi ha confermato in un gruppo incompleto           es. "18:00, 22:00"
     recap       numeri della serata agli indirizzi di recap_a (separati da virgola)       es. "16:00, 17:00"
   Un'ora è "HH:mm" (il giorno della serata), "-N HH:mm" (N giorni prima) o "AAAA-MM-GG HH:mm".
   La sveglia (ogni 5 minuti) le fa partire. Con troppo ritardo (sveglia ferma, riga scritta tardi) l'automazione
   si salta invece di partire fuori tempo. Esito nella pagina di stato del backend.
   ============================================================ */

// ritardoMax in minuti
var AUTOMAZIONI = [
  { campo: 'promemoria', ritardoMax: 180, fai: function (s) { promemoriaConferme_(s.id); } },
  { campo: 'solleciti', ritardoMax: 180, fai: function (s) { solleciti_(s.id); } },
  { campo: 'regalo', ritardoMax: 360, fai: function (s) { passRegalo_(s.id); } },
  { campo: 'recap', ritardoMax: 50, fai: function (s, o) { recapSerata_(s.id, o.ora, s.recapA, o.ultimo); } }
];

function automazioni_(db) {
  var props = PropertiesService.getScriptProperties();
  var fatti = props.getProperties();
  var now = new Date();
  db.Serate.forEach(function (r) {
    var s = serata_(db, r.id);
    if (!s || !serataInCorso_(db, s.id)) return;
    AUTOMAZIONI.forEach(function (a) {
      var orari = orariSerata_(s, r[a.campo]).filter(function (o) { return !o.errore; });
      orari.forEach(function (o) {
        var k = chiaveAutomazione_(s, a.campo, o);
        if (fatti[k] || now < o.quando) return;
        if ((now - o.quando) / 60000 > a.ritardoMax) { props.setProperty(k, 'saltata, in ritardo ' + now.toISOString().slice(0, 16)); return; }
        // segnata prima di partire: se qualcosa va storto a metà, le email non partono due volte
        props.setProperty(k, 'in corso ' + now.toISOString().slice(0, 16));
        try {
          a.fai(s, { ora: o.ora, ultimo: orari[orari.length - 1].ora });
          props.setProperty(k, 'fatta ' + new Date().toISOString().slice(0, 16));
        } catch (err) {
          props.setProperty(k, 'errore ' + new Date().toISOString().slice(0, 16) + ' ' + String(err.message).slice(0, 200));
        }
      });
    });
  });
}

function chiaveAutomazione_(s, campo, o) {
  return 'auto:' + s.id + ':' + campo + ':' + o.quando.toISOString().slice(0, 16);
}

// Per la pagina di stato: le automazioni della serata, con l'esito di quelle già partite.
function automazioniInfo_(s) {
  var props = PropertiesService.getScriptProperties().getProperties();
  var db = carica_(['Serate']);
  var r = trova_(db.Serate, 'id', s.id);
  var righe = AUTOMAZIONI.map(function (a) {
    var orari = orariSerata_(s, r[a.campo]);
    if (!orari.length) return a.campo + ': spenta';
    return a.campo + ': ' + orari.map(function (o) {
      if (o.errore) return '"' + o.testo + '" non valida';
      return Utilities.formatDate(o.quando, TZ, 'dd.MM HH:mm') + ' ' + (props[chiaveAutomazione_(s, a.campo, o)] || 'da fare');
    }).join(', ');
  });
  return '<ul style="font-size:13px">' + righe.map(function (t) { return '<li>' + esc_(t) + '</li>'; }).join('') + '</ul>';
}

// "HH:mm", "-N HH:mm" o "AAAA-MM-GG HH:mm", separati da virgola
function orariSerata_(s, testo) {
  return String(testo || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean).map(function (t) {
    var m = /^(?:([+-]?\d+)\s+)?(\d{1,2}):(\d\d)$/.exec(t);
    var m2 = /^(\d{4}-\d\d-\d\d)\s+(\d{1,2}):(\d\d)$/.exec(t);
    if (!m && !m2) return { testo: t, errore: true };
    var giorno = m ? spostaGiorno_(s.data, Number(m[1] || 0)) : m2[1];
    var ora = ('0' + (m || m2)[2]).slice(-2) + ':' + (m || m2)[3];
    return { testo: t, ora: ora, quando: Utilities.parseDate(giorno + ' ' + ora, TZ, 'yyyy-MM-dd HH:mm') };
  });
}

/* ============================================================
   Archivio
   CONFIG.giorniPrimaArchivio giorni dopo la serata, di notte, la sveglia sposta le sue righe dai fogli Pass, Gruppi,
   Attesa e Live nei fogli "Archivio Pass", "Archivio Gruppi"… (stesse colonne, nello stesso file), e le prenotazioni
   dei suoi eventi in "Archivio Workshop", "Archivio Prenotazioni"… Così i fogli che il sito legge a ogni richiesta
   restano piccoli. Per cercare qualcuno di una serata passata: fogli Archivio. Il link personale di un pass
   archiviato risponde "Link non valido". Esito nella pagina di stato.
   Prima di spostare qualcosa fa una copia completa del file nel Drive (backupDrive_) e controlla che la copia
   abbia le stesse righe: senza un backup verificato l'archivio non parte.
   ============================================================ */

// Copia del file nel Drive del proprietario ("bolla® backup AAAA-MM-GG HH:mm"), con lo stesso numero di righe
// in ogni foglio. Restituisce true se la copia è verificata; esito e link nella pagina di stato.
function backupDrive_() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('BACKUP_TENTATO', String(Date.now()));
  var ss = SpreadsheetApp.getActive();
  var quando = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  var copia = ss.copy('bolla® backup ' + quando);
  var esito = quando + ' ' + copia.getUrl();
  var ok = false;
  try {
    var diversi = ss.getSheets().filter(function (sh) {
      var c = copia.getSheetByName(sh.getName());
      return !c || c.getLastRow() !== sh.getLastRow() || c.getLastColumn() !== sh.getLastColumn();
    }).map(function (sh) { return sh.getName(); });
    ok = !diversi.length;
    esito += ok ? ' · verificato: ' + ss.getSheets().length + ' fogli, stesse righe' : ' · DIVERSO in: ' + diversi.join(', ');
  } catch (err) {
    esito += ' · verifica non riuscita: ' + String(err.message).slice(0, 120);
  }
  props.setProperty('BACKUP_ESITO', esito);
  if (ok) props.setProperty('BACKUP_VERIFICATO', String(Date.now()));
  return ok;
}

function archivio_(db) {
  var ora = Number(Utilities.formatDate(new Date(), TZ, 'H'));
  if (ora < CONFIG.oreArchivio[0] || ora >= CONFIG.oreArchivio[1]) return;
  var limite = spostaGiorno_(oggi_(), -CONFIG.giorniPrimaArchivio);
  var props = PropertiesService.getScriptProperties();
  var fatti = props.getProperties();
  db.Serate.forEach(function (r) {
    var s = serata_(db, r.id);
    if (!s || s.data >= limite || fatti['archiviata:' + s.id]) return;
    archiviaSerata_(s);
  });
}

function archiviaSerata_(s) {
  var props = PropertiesService.getScriptProperties();
  // backup verificato nell'ultima ora (più serate nella stessa notte: uno basta), altrimenti se ne fa uno adesso
  var ultimo = Number(props.getProperty('BACKUP_VERIFICATO') || 0);
  if (Date.now() - ultimo > 36e5) {
    // dopo un backup non riuscito si riprova il giorno dopo, non a ogni giro della sveglia (una copia ogni 5 minuti)
    var tentato = Number(props.getProperty('BACKUP_TENTATO') || 0);
    if (Date.now() - tentato < 20 * 36e5 || !backupDrive_()) {
      accoda_('ARCHIVIO_ESITO', new Date().toISOString().slice(0, 16) + ' ' + s.id + ': non archiviata, backup non verificato');
      return false;
    }
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return false; // riprova al prossimo giro
  var conti = [];
  try {
    Object.keys(DA_ARCHIVIARE).forEach(function (nome) {
      var col = DA_ARCHIVIARE[nome];
      var dopo = fineSerata_(s).getTime() + 864e5;
      var n = sposta_(nome, function (r) {
        // invii live senza serata: per data
        return r[col] === s.id || (nome === 'Live' && !r[col] && data_(r.creato).getTime() < dopo);
      });
      if (n) conti.push(nome + ' ' + n);
    });
    var eventi = carica_(['Eventi']);
    eventi.Eventi.forEach(function (e) {
      if (e.serata !== s.id) return;
      var ev = evento_(eventi, e.id);
      var n = sposta_(ev.foglio, function (r) { return r[ev.colonna] === ev.id; });
      if (n) conti.push(ev.foglio + ' ' + n);
    });
    // le automazioni della serata non servono più
    Object.keys(props.getProperties()).forEach(function (k) { if (k.indexOf('auto:' + s.id + ':') === 0) props.deleteProperty(k); });
    props.setProperty('archiviata:' + s.id, new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
  accoda_('ARCHIVIO_ESITO', new Date().toISOString().slice(0, 16) + ' ' + s.id + ': ' + (conti.join(', ') || 'niente da spostare'));
  return true;
}

// Sposta nel foglio "Archivio <nome>" le righe per cui sposta(riga) è vero e restituisce quante sono.
// Blocchi di righe consecutive: prima si copiano in ordine (valori così come sono), poi si cancellano dal basso.
function sposta_(nome, sposta) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(nome);
  if (!sh || sh.getLastRow() < 2) return 0;
  var righe = leggiFoglio_(sh, nome, false).filter(sposta);
  if (!righe.length) return 0;
  var nc = sh.getLastColumn();
  var arch = ss.getSheetByName('Archivio ' + nome) || ss.insertSheet('Archivio ' + nome, ss.getSheets().length);
  // intestazioni sempre uguali a quelle del foglio (anche se nel frattempo si sono aggiunte colonne)
  sh.getRange(1, 1, 1, nc).copyTo(arch.getRange(1, 1, 1, nc), { contentsOnly: true });
  arch.setFrozenRows(1);
  var blocchi = [];
  righe.forEach(function (r) {
    var b = blocchi[blocchi.length - 1];
    if (b && b.fine + 1 === r._riga) b.fine = r._riga; else blocchi.push({ inizio: r._riga, fine: r._riga });
  });
  var dest = arch.getLastRow() + 1;
  blocchi.forEach(function (b) {
    var n = b.fine - b.inizio + 1;
    sh.getRange(b.inizio, 1, n, nc).copyTo(arch.getRange(dest, 1, n, nc), { contentsOnly: true });
    dest += n;
  });
  SpreadsheetApp.flush();
  // un foglio non può restare senza righe oltre l'intestazione
  if (sh.getMaxRows() - righe.length < 2) sh.insertRowsAfter(sh.getMaxRows(), 1);
  blocchi.reverse().forEach(function (b) { sh.deleteRows(b.inizio, b.fine - b.inizio + 1); });
  SpreadsheetApp.flush();
  return righe.length;
}

function leggiArchivio_(nome) {
  var sh = SpreadsheetApp.getActive().getSheetByName('Archivio ' + nome);
  return sh && sh.getLastRow() > 1 ? leggiFoglio_(sh, nome, false) : [];
}

/* ============================================================
   Accesso ai fogli
   ============================================================ */

// intestazioni lette in questa esecuzione: appendi_ non le rilegge
var TESTATE_ = {};

// Legge solo i fogli che servono: ogni foglio in più è tempo in più a ogni richiesta.
// Senza nomi legge tutti i fogli di COLONNE.
function carica_(nomi) {
  var ss = SpreadsheetApp.getActive();
  nomi = nomi || Object.keys(COLONNE);
  var fogli = {};
  var elenca = function () { ss.getSheets().forEach(function (sh) { fogli[sh.getName()] = sh; }); };
  elenca();
  if (nomi.some(function (n) { return !fogli[n]; })) { setup(); elenca(); }
  var db = {};
  nomi.forEach(function (nome) { db[nome] = leggiFoglio_(fogli[nome], nome, true); });
  return db;
}

// Righe del foglio come oggetti { intestazione: valore, _riga, _foglio, _head, _nome }.
// aggiungi: le colonne di COLONNE mancanti (aggiunte in versioni successive) vanno in fondo.
function leggiFoglio_(sh, nome, aggiungi) {
  var values = sh.getDataRange().getValues();
  var head = values[0];
  if (aggiungi) {
    COLONNE[nome].forEach(function (c) {
      if (head.indexOf(c) >= 0) return;
      head.push(c);
      sh.getRange(1, head.length).setValue(c);
      // colonne di testo: niente conversioni in date o numeri ("09:30", "1/3", "1e50…")
      if (COLONNE_TESTO.indexOf(c) >= 0) sh.getRange(1, head.length, sh.getMaxRows(), 1).setNumberFormat('@');
    });
    TESTATE_[nome] = head;
  }
  var righe = [];
  for (var i = 1; i < values.length; i++) {
    var r = { _riga: i + 1, _foglio: sh, _head: head, _nome: nome };
    for (var j = 0; j < head.length; j++) {
      var h = head[j], v = values[i][j];
      if (v === undefined) v = '';
      // Sheets può trasformare "2026-10-30" o "18:00" in una data anche nelle colonne testo: la riportiamo a stringa
      if (v instanceof Date && COLONNE_TESTO.indexOf(h) >= 0) {
        r[h] = Utilities.formatDate(v, TZ, h === 'inizio' ? 'yyyy-MM-dd HH:mm' : v.getFullYear() < 1901 ? 'HH:mm' : 'yyyy-MM-dd');
      } else r[h] = v instanceof Date ? v : String(v);
    }
    righe.push(r);
  }
  return righe;
}

// Ogni valore va sotto la sua intestazione: il foglio resta giusto anche se qualcuno sposta o inserisce colonne.
function appendi_(nome, obj) {
  var sh = SpreadsheetApp.getActive().getSheetByName(nome);
  var head = TESTATE_[nome];
  if (!head) {
    head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    COLONNE[nome].forEach(function (c) {
      if (head.indexOf(c) < 0) { head.push(c); sh.getRange(1, head.length).setValue(c); }
    });
    TESTATE_[nome] = head;
  }
  sh.appendRow(head.map(function (h) {
    return COLONNE[nome].indexOf(h) < 0 || obj[h] == null ? '' : cella_(obj[h]);
  }));
  invalidaCache_(nome, obj);
}

function aggiorna_(tabella, r, campi) {
  Object.keys(campi).forEach(function (c) {
    var col = r._head.indexOf(c) + 1;
    r._foglio.getRange(r._riga, col).setValue(campi[c]);
    r[c] = campi[c];
  });
  invalidaCache_(r._nome, r);
}

// Un pass o un gruppo nuovo o cambiato: posti liberi e lista staff di quella serata vanno ricalcolati
function invalidaCache_(nome, riga) {
  if ((nome === 'Pass' || nome === 'Gruppi') && riga && riga.serata) {
    CacheService.getScriptCache().removeAll(['stato:' + riga.serata, 'staff:' + riga.serata]);
  }
}

function trova_(tabella, campo, valore) {
  for (var i = 0; i < tabella.length; i++) if (tabella[i][campo] === valore) return tabella[i];
  return null;
}

// Colonne vuote della serata = valori di CONFIG
function serata_(db, id) {
  var s = trova_(db.Serate, 'id', String(id || ''));
  if (!s) return null;
  var testo = function (v, base) { v = String(v == null ? '' : v).trim(); return v === '' ? base : v === '-' ? '' : v; };
  return {
    id: s.id,
    titolo: s.titolo || 'bolla®',
    data: s.data instanceof Date ? Utilities.formatDate(s.data, TZ, 'yyyy-MM-dd') : s.data,
    capienza: Number(s.capienza) || 0,
    aperta: s.aperta,
    orario: testo(s.orario, CONFIG.orario),
    luogo: testo(s.luogo, CONFIG.luogo),
    senzaPass: testo(s.senza_pass, CONFIG.senzaPass),
    chiusuraPass: ora_(s.chiusura_pass) || CONFIG.chiusuraPass,
    chiusuraGruppi: ora_(s.chiusura_gruppi) || CONFIG.chiusuraGruppi,
    recapA: String(s.recap_a || '').split(/[\s,;]+/).filter(function (e) { return e.indexOf('@') > 0; })
  };
}

function gruppo_(db, id) {
  return trova_(db.Gruppi, 'id', String(id || ''));
}

// La prima serata da oggi in poi; se non ce n'è, l'ultima passata.
function prossimaSerata_(db) {
  var oggi = oggi_();
  var serate = db.Serate.map(function (r) { return serata_(db, r.id); }).filter(Boolean)
    .sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
  return serate.filter(function (s) { return s.data >= oggi; })[0] || serate[serate.length - 1] || null;
}

// Serata di ieri, di oggi o futura: le altre non hanno più niente da aggiornare
function serataInCorso_(db, id) {
  if (!db._inCorso) {
    var ieri = spostaGiorno_(oggi_(), -1);
    db._inCorso = {};
    db.Serate.forEach(function (r) { var s = serata_(db, r.id); if (s && s.data >= ieri) db._inCorso[s.id] = true; });
  }
  return !!db._inCorso[id];
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

function oggi_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

// "2026-11-06" spostato di n giorni (anche negativi)
function spostaGiorno_(ymd, n) {
  var p = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}

// "9:30" → "09:30"; testo non valido → ''
function ora_(v) {
  var m = /^(\d{1,2}):(\d\d)$/.exec(String(v == null ? '' : v).trim());
  return m && Number(m[1]) < 24 ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}

// Esiti che si accumulano (pass regalo, recap, ricerche): restano gli ultimi, una proprietà tiene al massimo 9 KB
function accoda_(k, testo) {
  var props = PropertiesService.getScriptProperties();
  var prima = props.getProperty(k);
  props.setProperty(k, ((prima ? prima + ' ¦ ' : '') + testo).slice(-3000));
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
