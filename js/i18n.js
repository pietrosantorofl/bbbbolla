/* bolla® — lingua del sito (italiano / inglese).
   - La lingua si sceglie con il tastino in alto a destra (resta salvata nel browser) o con ?lang=en / ?lang=it.
   - I testi in italiano sono la chiave: EN[testo italiano] = testo inglese. Se manca una traduzione resta l'italiano.
   - Nell'HTML: data-i18n sul testo semplice, data-i18n-html="id" per i testi con link,
     data-lang="it" / data-lang="en" per blocchi lunghi scritti nelle due lingue (manifesto, privacy). */
(function () {
  "use strict";

  var LINGUE = ["it", "en"];
  var CHIAVE = "bolla-lingua";
  function leggi() { try { return localStorage.getItem(CHIAVE); } catch (e) { return null; } }
  function scrivi(v) { try { localStorage.setItem(CHIAVE, v); } catch (e) { /* storage non disponibile */ } }

  var richiesta = new URLSearchParams(location.search).get("lang");
  var lang = LINGUE.indexOf(richiesta) >= 0 ? richiesta : leggi();
  if (LINGUE.indexOf(lang) < 0) lang = "it";
  if (richiesta) scrivi(lang);
  document.documentElement.lang = lang;

  var EN = {
    /* barra, presentazione, locandina */
    "Manifesto": "Manifesto",
    "Prenota pass": "Get your pass",
    "Prenota pass gratuito": "Get your free pass",
    "Prenota il pass": "Get your pass",
    "Leggi il manifesto": "Read the manifesto",
    "Prossimo appuntamento": "Next event",
    /* dettagli serata */
    "Quando": "When",
    "Dove": "Where",
    "Ingresso": "Entry",
    "Gratuito con pass": "Free with pass",
    "Prossime serate": "Upcoming nights",
    "Dalle {ora}": "From {ora}",
    "Ore {inizio} – {fine}": "{inizio} – {fine}",
    "Orario in arrivo": "Time to be announced",
    "Location in arrivo": "Venue to be announced",
    " · Pass gratuiti": " · Free passes",
    /* scheda pass */
    "Pass gratuito": "Free pass",
    "Controllo disponibilità…": "Checking availability…",
    "Nome": "First name",
    "Cognome": "Last name",
    "Email": "Email",
    "Dichiaro di essere maggiorenne.": "I confirm I am over 18.",
    "Continua": "Continue",
    "Pass di gruppo": "Group pass",
    "Il pass gratuito è per gruppi da {n}. Registrati, poi manda il link del gruppo ai tuoi {amici} amici. Quando tutti e {n} hanno confermato la propria email, ognuno riceve il suo pass con QR. Se il gruppo non si completa, nessuno riceve il pass.":
      "The free pass is for groups of {n}. Sign up, then send the group link to your {amici} friends. When all {n} have confirmed their email, each of you gets a pass with a QR code. If the group isn't completed, nobody gets a pass.",
    "Crea il gruppo": "Create the group",
    "Crea il tuo gruppo": "Create your group",
    "Entra nel gruppo": "Join the group",
    "Pass su invito": "Invitation pass",
    "Richiedi il pass": "Get your pass",
    "Il tuo pass": "Your pass",
    "Lista d'attesa": "Waiting list",
    "I pass gratuiti sono esauriti. Lascia nome ed email: se si libera un posto ti scriviamo noi.":
      "Free passes are sold out. Leave your name and email: if a spot opens up, we'll write to you.",
    " Senza pass: {prezzo}.": " Without a pass: {prezzo}.",
    "Mettimi in lista d'attesa": "Put me on the waiting list",
    "Crea un nuovo gruppo": "Create a new group",
    "Gruppo di {nome}": "{nome}'s group",
    "Il gruppo": "The group",
    "{n}/{tot} confermati": "{n}/{tot} confirmed",
    " (tu)": " (you)",
    "Posto libero": "Free spot",
    "confermato": "confirmed",
    "deve confermare l'email": "must confirm email",
    "Il gruppo va completato entro {quando}.": "The group must be completed by {quando}.",
    "{giorno} {d} {mese} alle {ora}": "{giorno} {d} {mese} at {ora}",
    "Link del gruppo": "Group link",
    "Ti aspetto a {nome} il {data}: entra nel mio gruppo per il pass gratuito ":
      "See you at {nome} on {data}: join my group for the free pass ",
    "Condividi": "Share",
    "Copia link": "Copy link",
    "Copiato": "Copied",
    "Controllo il tuo invito…": "Checking your invitation…",
    "Carico il gruppo…": "Loading the group…",
    "Non disponibile": "Not available",
    "Serata non disponibile.": "Event not available.",
    "Serata passata": "Event over",
    "Prenotazioni chiuse": "Bookings closed",
    "Esaurito": "Sold out",
    "Disponibile": "Available",
    " Senza invito puoi creare un gruppo da {n}.": " Without an invitation you can create a group of {n}.",
    "Hai un invito: il pass è personale e arriva via email con il QR.":
      "You have an invitation: the pass is personal and arrives by email with a QR code.",
    "Questo gruppo è scaduto prima di essere completato.": "This group expired before being completed.",
    "Il gruppo è al completo. Se qualcuno non conferma entro poche ore il posto si libera.":
      "The group is full. If someone doesn't confirm within a few hours, their spot opens up.",
    "Un amico": "A friend",
    "{chi} ti ha invitato nel suo gruppo. Registrati con la tua email e conferma dal link che ti arriva: quando tutti e {n} hanno confermato, ognuno riceve il suo pass con QR. Se il gruppo non si completa, nessuno lo riceve.":
      "{chi} invited you to their group. Sign up with your email and confirm from the link you receive: when all {n} have confirmed, each of you gets a pass with a QR code. If the group isn't completed, nobody gets one.",
    "Non verificabile": "Can't check",
    "Connessione non riuscita. Ricarica la pagina tra poco.": "Connection failed. Reload the page in a moment.",
    "Carico il tuo pass…": "Loading your pass…",
    "Ciao {nome}": "Hi {nome}",
    "Email confermata": "Email confirmed",
    "Il pass con QR si attiva solo quando tutti e {n} hanno confermato: ti arriva via email e lo trovi anche qui. Se il gruppo non si completa in tempo, nessuno riceve il pass. Manca qualcuno? Rimanda il link del gruppo:":
      "The pass with QR code activates only when all {n} have confirmed: you'll get it by email and find it here too. If the group isn't completed in time, nobody gets a pass. Someone missing? Send the group link again:",
    "Sei già entrato": "You're already in",
    "Ci vediamo dentro la bolla": "See you inside the bubble",
    "Codice pass": "Pass code",
    "Su invito": "Invitation",
    "QR code del pass": "Pass QR code",
    "Mostra questo QR all'ingresso. Vale una sola volta: non condividerlo.":
      "Show this QR code at the entrance. It's valid once: don't share it.",
    "Aggiungi al calendario": "Add to calendar",
    "Inserisci il tuo nome.": "Enter your name.",
    "Inserisci nome e cognome.": "Enter your first and last name.",
    "Controlla l'indirizzo email.": "Check your email address.",
    "L'evento è riservato ai maggiorenni.": "This event is for over-18s only.",
    "Un attimo…": "One moment…",
    "Qualcosa è andato storto. Riprova tra poco.": "Something went wrong. Try again in a moment.",
    "La sessione era scaduta: abbiamo ricaricato il modulo, premi di nuovo il bottone.":
      "Your session expired: we reloaded the form, press the button again.",
    "Connessione non riuscita. Controlla la rete e riprova.": "Connection failed. Check your network and try again.",
    "Ci siamo quasi": "Almost there",
    "Sei in lista d'attesa": "You're on the waiting list",
    "Se si libera un posto ti scriviamo a {email}. Non serve fare altro.": "If a spot opens up we'll write to {email}. Nothing else to do.",
    "Apri l'email che ti abbiamo mandato a {email} e conferma (controlla anche lo spam).":
      "Open the email we sent to {email} and confirm (check your spam folder too).",
    "Manda questo link ai tuoi {amici} amici: ognuno si registra con la propria email.":
      "Send this link to your {amici} friends: each of them signs up with their own email.",
    "Quando tutti e {n} hanno confermato, ognuno riceve il suo pass con QR. Se il gruppo non si completa, nessuno riceve il pass.":
      "When all {n} have confirmed, each of you gets a pass with a QR code. If the group isn't completed, nobody gets a pass.",
    "Ti abbiamo mandato una email a {email}. Apri il link per confermare il tuo posto nel gruppo (controlla anche lo spam).":
      "We sent an email to {email}. Open the link to confirm your spot in the group (check your spam folder too).",
    "Pass inviato": "Pass sent",
    "Il tuo pass con QR è in arrivo a {email}. Controlla anche lo spam.": "Your pass with QR code is on its way to {email}. Check your spam folder too.",
    /* footer, pagine */
    "Privacy": "Privacy",
    "Torna alla serata": "Back to the event",
    /* pagina workshop */
    "Prenota il workshop": "Book the workshop",
    "Prenota il tuo posto": "Book your spot",
    "Con": "With",
    "Telefono": "Phone",
    "Lascia nome, cognome e numero di telefono: ti contattiamo solo per comunicazioni sul workshop.":
      "Leave your name and phone number: we'll only contact you about the workshop.",
    "Controlla il numero di telefono.": "Check your phone number.",
    "Prenotazione ricevuta": "Booking received",
    "Ti aspettiamo {data} alle {ora} al {luogo}. Se serve ti chiamiamo al {telefono}.":
      "See you on {data} at {ora} at {luogo}. If needed we'll call you at {telefono}.",
    "Dopo il workshop la serata continua: prenota anche il pass gratuito.": "After the workshop the night goes on: get your free pass too.",

    /* messaggi del backend (arrivano in italiano) */
    "Serata non trovata.": "Event not found.",
    "Le email temporanee non sono accettate: usa la tua email personale.": "Temporary email addresses are not accepted: use your personal email.",
    "Serve il consenso privacy.": "Privacy consent is required.",
    "Il pass gratuito è riservato agli iscritti alla newsletter di bolla®.": "The free pass is for bolla® newsletter subscribers.",
    "Questa email è già registrata per la serata. Ti abbiamo rimandato il link personale: controlla la posta (anche lo spam).":
      "This email is already registered for the event. We've resent your personal link: check your inbox (and spam).",
    "Pass esauriti. Seguici per le prossime serate.": "Passes sold out. Follow us for the next events.",
    "Le prenotazioni per questa serata sono chiuse.": "Bookings for this event are closed.",
    "Questa serata è passata.": "This event is over.",
    "Questo link di gruppo non esiste.": "This group link doesn't exist.",
    "Il gruppo è già al completo.": "The group is already full.",
    "Il gruppo è già completo.": "The group is already complete.",
    "Questo gruppo è già completo.": "This group is already complete.",
    "Questo gruppo è stato annullato.": "This group was cancelled.",
    "Questo gruppo è scaduto prima di essere completato. Puoi crearne uno nuovo.": "This group expired before being completed. You can create a new one.",
    "Questo invito non è valido o è scaduto.": "This invitation isn't valid or has expired.",
    "I pass di questo invito sono finiti.": "The passes for this invitation have run out.",
    "Hai confermato troppo tardi: il tuo posto nel gruppo è stato preso da qualcun altro.": "You confirmed too late: your spot in the group was taken by someone else.",
    "Nel frattempo i posti sono finiti: non è più possibile formare un gruppo per questa serata.": "In the meantime spots ran out: it's no longer possible to form a group for this event.",
    "Link non valido.": "Invalid link.",
    "Errore temporaneo. Riprova tra poco.": "Temporary error. Try again in a moment.",
    "Troppe richieste in questo momento. Riprova tra qualche secondo.": "Too many requests right now. Try again in a few seconds.",
    "In questo momento stanno arrivando troppe registrazioni. Riprova tra un minuto.": "Too many sign-ups right now. Try again in a minute.",
    "Oggi abbiamo raggiunto il limite di email inviabili. Riprova domani.": "We've reached today's email limit. Try again tomorrow.",
    "Sessione non valida. Ricarica la pagina e riprova.": "Invalid session. Reload the page and try again.",
    "Hai fatto prestissimo! Ricontrolla i dati e invia di nuovo tra qualche secondo.": "That was quick! Check your details and send again in a few seconds.",
    "La pagina è aperta da troppo tempo. Ricaricala e riprova.": "This page has been open too long. Reload it and try again.",
    "Questo modulo è già stato inviato. Ricarica la pagina per una nuova registrazione.": "This form was already sent. Reload the page for a new registration.",
    "Richiesta non valida.": "Invalid request.",
    "Sei già in lista d'attesa per questa serata: ti scriviamo noi se si libera un posto.": "You're already on the waiting list for this event: we'll write to you if a spot opens up.",
    "Le prenotazioni per il workshop sono chiuse.": "Workshop bookings are closed.",
    "Questo numero ha già una prenotazione per il workshop.": "This number already has a workshop booking.",
    "I posti per il workshop sono esauriti.": "The workshop is fully booked."
  };

  // messaggi del backend con parti variabili
  var MESSAGGI_EN = [
    [/^Il dominio dell'email \((.+)\) non riceve posta\. Controlla di averla scritta bene\.$/, "The email domain ($1) doesn't receive mail. Check you typed it correctly."],
    [/^Non ci sono più posti per un gruppo da (\d+)\.$/, "No more spots for a group of $1."]
  ];

  // testi con link (data-i18n-html="id")
  var EN_HTML = {
    legale: "By clicking the button you accept the <a href=\"privacy.html\" target=\"_blank\" rel=\"noopener\">privacy notice</a> and subscribe to the bolla® newsletter, required for the free pass. Your email will not be shared with third parties and you can unsubscribe at any time.",
    legaleWorkshop: "By clicking the button you accept the <a href=\"privacy.html\" target=\"_blank\" rel=\"noopener\">privacy notice</a>. We only use your number for messages about the workshop and never share it with third parties."
  };

  var GIORNI = { it: ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"], en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] };
  var MESI = {
    it: ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  };

  function riempi(t, v) { return v ? t.replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }) : t; }

  // T("testo italiano con {variabili}", {variabili}) -> testo nella lingua scelta
  function T(it, v) { return riempi(lang === "en" && EN[it] != null ? EN[it] : it, v); }

  // L(valore di config.js): stringa, oppure { it: "...", en: "..." }
  function L(x) {
    if (x && typeof x === "object" && !Array.isArray(x) && "it" in x) return x[lang] != null ? x[lang] : x.it;
    return x;
  }

  // M(messaggio del backend): traduce i messaggi noti, lascia gli altri com'erano
  function M(msg) {
    if (lang !== "en" || !msg) return msg;
    if (EN[msg] != null) return EN[msg];
    for (var i = 0; i < MESSAGGI_EN.length; i++) if (MESSAGGI_EN[i][0].test(msg)) return msg.replace(MESSAGGI_EN[i][0], MESSAGGI_EN[i][1]);
    return msg;
  }

  function applica() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (n) {
      var chiave = n.getAttribute("data-i18n") || n.textContent.trim();
      n.setAttribute("data-i18n", chiave);
      n.textContent = T(chiave);
    });
    if (lang === "en") {
      Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-html]"), function (n) {
        var t = EN_HTML[n.getAttribute("data-i18n-html")];
        if (t) n.innerHTML = t;
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"), function (n) {
      n.hidden = n.getAttribute("data-lang") !== lang;
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-lingua]"), function (b) {
      var altra = lang === "it" ? "en" : "it";
      b.textContent = altra.toUpperCase();
      b.setAttribute("aria-label", altra === "en" ? "Switch to English" : "Passa all'italiano");
      b.setAttribute("lang", altra);
      b.addEventListener("click", function () {
        scrivi(altra);
        var u = new URL(location.href);
        u.searchParams.delete("lang");
        location.replace(u.toString());
      });
    });
  }

  window.I18N = { lang: lang, T: T, L: L, M: M, giorni: GIORNI[lang], mesi: MESI[lang] };
  applica();
})();
