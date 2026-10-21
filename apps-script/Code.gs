/**
 * bolla® — backend dei pass gratuiti (Google Apps Script + Google Sheet).
 *
 * Fogli usati (creati da setup()):
 *   Serate       id | titolo | data | capienza | aperta
 *   Prenotazioni timestamp | serata | codice | nome | cognome | email | posti | stato | checkin | newsletter
 *   Newsletter   creato da esportaNewsletter(): una riga per email iscritta
 *
 * Endpoint della Web App:
 *   GET  ?action=disponibilita&serata=<id>  -> { ok, aperta, capienza, disponibili }
 *   POST body JSON { action:"prenota", serata, nome, cognome, email, posti, privacy, newsletter, website }
 *        -> { ok, codice, posti, disponibili } | { ok:false, errore, messaggio }
 */

var CONFIG = {
  nomeMittente: 'bolla®',
  replyTo: '',                    // es. 'ciao@bbbbolla.it' (vuoto = account Google che pubblica lo script)
  sito: 'https://bbbbolla.it',
  maxPassPerPrenotazione: 2,
  newsletterObbligatoria: true,   // deve coincidere con newsletterObbligatoria in js/config.js
  luogo: '',                      // compare nell'email, es. 'Nome locale, Via ..., Catania'
  orario: ''                      // compare nell'email, es. 'dalle 19:30'
};

var FOGLIO_SERATE = 'Serate';
var FOGLIO_PRENOTAZIONI = 'Prenotazioni';
var STATO_ANNULLATO = 'annullato';

/* ---------- setup: eseguilo una volta dall'editor ---------- */
function setup() {
  var ss = SpreadsheetApp.getActive();
  var serate = ss.getSheetByName(FOGLIO_SERATE) || ss.insertSheet(FOGLIO_SERATE);
  if (serate.getLastRow() === 0) {
    serate.appendRow(['id', 'titolo', 'data', 'capienza', 'aperta']);
    serate.appendRow(['2026-10-30', 'bolla® — Ritmi in Colombia, Selva Cosmica, Franzuà', '2026-10-30', 150, true]);
    serate.getRange('A:A').setNumberFormat('@');
    serate.getRange('C:C').setNumberFormat('@');
    serate.setFrozenRows(1);
  }
  var pren = ss.getSheetByName(FOGLIO_PRENOTAZIONI) || ss.insertSheet(FOGLIO_PRENOTAZIONI);
  if (pren.getLastRow() === 0) {
    pren.appendRow(['timestamp', 'serata', 'codice', 'nome', 'cognome', 'email', 'posti', 'stato', 'checkin', 'newsletter']);
    pren.getRange('B:B').setNumberFormat('@');
    pren.setFrozenRows(1);
  }
}

/* ---------- HTTP ---------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'disponibilita') return json_(disponibilita_(p.serata));
  return json_({ ok: true, servizio: 'bolla pass' });
}

function doPost(e) {
  var dati;
  try {
    dati = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_(errore_('dati', 'Richiesta non valida.'));
  }
  if (dati.action !== 'prenota') return json_(errore_('dati', 'Azione sconosciuta.'));
  return json_(prenota_(dati));
}

/* ---------- logica ---------- */
function disponibilita_(idSerata) {
  var s = trovaSerata_(idSerata);
  if (!s) return errore_('serata', 'Serata non trovata.');
  var usati = postiUsati_(idSerata);
  return {
    ok: true,
    aperta: s.aperta,
    capienza: s.capienza,
    disponibili: Math.max(0, s.capienza - usati)
  };
}

function prenota_(d) {
  // honeypot: i bot compilano il campo nascosto "website"
  if (d.website) return { ok: true, codice: 'BOL-00000', posti: 1, disponibili: null };

  var nome = pulisci_(d.nome, 60);
  var cognome = pulisci_(d.cognome, 60);
  var email = String(d.email || '').trim().toLowerCase().slice(0, 120);
  var posti = Math.floor(Number(d.posti));

  if (!nome || !cognome) return errore_('dati', 'Inserisci nome e cognome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return errore_('dati', "Controlla l'indirizzo email.");
  if (!(posti >= 1 && posti <= CONFIG.maxPassPerPrenotazione)) return errore_('dati', 'Numero di pass non valido.');
  if (d.privacy !== true) return errore_('dati', 'Serve il consenso privacy.');
  var newsletter = d.newsletter === true;
  if (CONFIG.newsletterObbligatoria && !newsletter) return errore_('dati', 'Il pass gratuito è riservato agli iscritti alla newsletter di bolla®.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return errore_('occupato', 'Troppe richieste in questo momento. Riprova tra qualche secondo.');
  try {
    var s = trovaSerata_(d.serata);
    if (!s) return errore_('serata', 'Serata non trovata.');
    if (!s.aperta) return errore_('chiusa', 'Le prenotazioni per questa serata sono chiuse.');

    var sheet = SpreadsheetApp.getActive().getSheetByName(FOGLIO_PRENOTAZIONI);
    var righe = righePrenotazioni_(sheet);
    var usati = 0;
    for (var i = 0; i < righe.length; i++) {
      var r = righe[i];
      if (r.serata !== s.id || r.stato === STATO_ANNULLATO) continue;
      if (r.email === email) {
        return errore_('duplicato', 'Questa email ha già un pass per la serata (codice ' + r.codice + '). Controlla la tua casella di posta.');
      }
      usati += r.posti;
    }
    var disponibili = s.capienza - usati;
    if (disponibili <= 0) return errore_('esaurito', 'Pass esauriti. Seguici per le prossime serate.');
    if (posti > disponibili) return errore_('esaurito', disponibili === 1 ? 'È rimasto solo 1 pass.' : 'Sono rimasti solo ' + disponibili + ' pass.');

    var codice = nuovoCodice_(righe);
    sheet.appendRow([new Date(), s.id, codice, cella_(nome), cella_(cognome), cella_(email), posti, 'confermato', '', newsletter]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  try {
    inviaEmail_(email, nome, cognome, codice, posti, s, newsletter);
  } catch (err) {
    // la prenotazione resta valida anche se l'email non parte (es. quota giornaliera finita)
    console.error('Email non inviata a ' + email + ': ' + err);
  }

  return { ok: true, codice: codice, posti: posti, disponibili: disponibili - posti };
}

/* ---------- email ---------- */
function inviaEmail_(email, nome, cognome, codice, posti, s, newsletter) {
  var data = Utilities.formatDate(new Date(s.data + 'T12:00:00'), 'Europe/Rome', 'dd.MM.yyyy');
  var dettagli = [data, CONFIG.orario, CONFIG.luogo].filter(String).join(' · ');
  var html =
    '<div style="background:#e9e7e3;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#121212">' +
      '<div style="max-width:480px;margin:0 auto;background:#f3f2ef;border:1.5px solid #121212;border-radius:22px;padding:28px 24px">' +
        '<p style="margin:0;font-size:40px;font-weight:700;letter-spacing:-2px">bolla&reg;</p>' +
        '<p style="margin:8px 0 20px;font-size:17px">Ciao ' + esc_(nome) + ', il tuo pass gratuito è confermato.</p>' +
        '<div style="background:#f0307f;background-image:linear-gradient(135deg,#f8893c 0%,#f0307f 45%,#ff3b1c 100%);color:#fff;border-radius:16px;padding:22px 16px;text-align:center">' +
          '<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase">Codice pass</div>' +
          '<div style="font-size:34px;font-weight:700;letter-spacing:3px;margin:4px 0">' + codice + '</div>' +
          '<div style="font-size:14px">' + esc_(nome + ' ' + cognome) + ' · ' + posti + ' pass</div>' +
        '</div>' +
        '<p style="margin:20px 0 4px;font-size:15px"><strong>' + esc_(s.titolo) + '</strong></p>' +
        '<p style="margin:0 0 16px;font-size:15px">' + esc_(dettagli) + '</p>' +
        '<p style="margin:0 0 16px;font-size:14px;color:#5f5b56">Mostra questa email all\'ingresso. Il pass è nominativo e non garantisce l\'ingresso dopo il raggiungimento della capienza massima: arriva presto.</p>' +
        '<p style="margin:0;font-size:14px;color:#5f5b56">Non puoi venire? Rispondi a questa email così liberiamo il posto per qualcun altro.</p>' +
        (newsletter ? '<p style="margin:16px 0 0;font-size:12px;color:#5f5b56">Sei iscritto alla newsletter di bolla®: ti scriveremo solo per le prossime serate e non cederemo la tua email a terzi. Per disiscriverti rispondi con "cancellami".</p>' : '') +
      '</div>' +
      '<p style="text-align:center;font-size:12px;color:#5f5b56;margin:16px 0 0"><a href="' + CONFIG.sito + '" style="color:#5f5b56">bbbbolla.it</a></p>' +
    '</div>';

  var opzioni = { name: CONFIG.nomeMittente, htmlBody: html };
  if (CONFIG.replyTo) opzioni.replyTo = CONFIG.replyTo;
  MailApp.sendEmail(email, 'Il tuo pass bolla® — ' + data + ' · ' + codice,
    'Pass ' + codice + ' per ' + nome + ' ' + cognome + ' (' + posti + ' pass) — ' + dettagli + '. Mostra questa email all\'ingresso.',
    opzioni);
}

/* ---------- newsletter ----------
 * Esegui esportaNewsletter() dall'editor quando ti serve la lista.
 * Ricrea il foglio "Newsletter" con un'email per riga (prima iscrizione).
 * Per disiscrivere qualcuno scrivi FALSE nella colonna "newsletter" di tutte le sue prenotazioni. */
function esportaNewsletter() {
  var ss = SpreadsheetApp.getActive();
  var values = ss.getSheetByName(FOGLIO_PRENOTAZIONI).getDataRange().getValues();
  var iscritti = {};
  var disiscritti = {};
  for (var i = 1; i < values.length; i++) {
    var email = String(values[i][5]).toLowerCase();
    var flag = values[i][9];
    if (flag === false || String(flag).toUpperCase() === 'FALSE') { disiscritti[email] = true; continue; }
    if (flag === true || String(flag).toUpperCase() === 'TRUE') {
      if (!iscritti[email]) iscritti[email] = [values[i][0], values[i][3], values[i][4], email];
    }
  }
  var righe = Object.keys(iscritti)
    .filter(function (e) { return !disiscritti[e]; })
    .map(function (e) { return iscritti[e]; });

  var sh = ss.getSheetByName('Newsletter') || ss.insertSheet('Newsletter');
  sh.clearContents();
  sh.appendRow(['iscritto il', 'nome', 'cognome', 'email']);
  if (righe.length) sh.getRange(2, 1, righe.length, 4).setValues(righe);
  sh.setFrozenRows(1);
}

/* ---------- helpers ---------- */
function trovaSerata_(id) {
  if (!id) return null;
  var values = SpreadsheetApp.getActive().getSheetByName(FOGLIO_SERATE).getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      var aperta = values[i][4];
      return {
        id: String(values[i][0]),
        titolo: String(values[i][1] || 'bolla®'),
        data: values[i][2] instanceof Date ? Utilities.formatDate(values[i][2], 'Europe/Rome', 'yyyy-MM-dd') : String(values[i][2]),
        capienza: Number(values[i][3]) || 0,
        aperta: aperta === true || String(aperta).toLowerCase() === 'true' || String(aperta).toLowerCase() === 'si'
      };
    }
  }
  return null;
}

function righePrenotazioni_(sheet) {
  var values = sheet.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    out.push({
      serata: String(values[i][1]),
      codice: String(values[i][2]),
      email: String(values[i][5]).toLowerCase(),
      posti: Number(values[i][6]) || 0,
      stato: String(values[i][7]).toLowerCase()
    });
  }
  return out;
}

function postiUsati_(idSerata) {
  var righe = righePrenotazioni_(SpreadsheetApp.getActive().getSheetByName(FOGLIO_PRENOTAZIONI));
  return righe.reduce(function (t, r) {
    return r.serata === String(idSerata) && r.stato !== STATO_ANNULLATO ? t + r.posti : t;
  }, 0);
}

function nuovoCodice_(righe) {
  var usati = {};
  righe.forEach(function (r) { usati[r.codice] = true; });
  var alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var codice;
  do {
    codice = 'BOL-';
    for (var i = 0; i < 5; i++) codice += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  } while (usati[codice]);
  return codice;
}

function pulisci_(s, max) {
  return String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// evita che un testo come "=IMPORTXML(...)" diventi una formula nel foglio
function cella_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
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
