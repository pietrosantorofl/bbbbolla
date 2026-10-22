/* ============================================================
   bolla® — CONTENUTI DEL SITO
   Modifica solo questo file per aggiornare testi, serate e line-up.
   Un valore null nasconde l'elemento (o mostra "in arrivo").
   ============================================================ */

window.BOLLA = {
  /* URL della Web App di Google Apps Script (vedi apps-script/README).
     Lascia stringa vuota per la modalità DEMO (prenotazioni finte, solo nel browser). */
  apiUrl: /[?&]demo\b/.test(location.search) ? "" :   // ?demo = prova nel browser, senza toccare il foglio vero
    "https://script.google.com/macros/s/AKfycbzEckzChK4ZcFHJ7wOjREzUTepDHg8QxMismXJwFMElQ1BRL8c74Ltsrsx2YinHvO5v4w/exec",

  contatti: {
    email: null,              // es. "ciao@bbbbolla.it"
    instagram: null           // es. "https://instagram.com/bbbbolla"
  },

  rassegna: {
    nome: "bolla®",
    sottotitolo: "Rassegna di musica live",
    intro: [
      "bolla® è una rassegna di musica live: una serata alla volta, un piccolo mondo che si gonfia, galleggia e poi scoppia.",
      "Ritmi che arrivano da lontano, selezioni lente e calde, un bicchiere di vino buono. Entri, ti lasci portare, esci un po' diverso.",
      "L'ingresso è gratuito: forma un gruppo da 3 con i tuoi amici, oppure usa il link di invito che ti hanno mandato."
    ],
    /* Senza invito il pass è per gruppi: deve coincidere con CONFIG.dimensioneGruppo in apps-script/Code.gs */
    dimensioneGruppo: 3,
    richiediMaggiorenne: false,
    /* true = iscrizione alla newsletter necessaria per avere il pass.
       Deve coincidere con CONFIG.newsletterObbligatoria in apps-script/Code.gs */
    newsletterObbligatoria: true
  },

  /* Una voce per serata. La pagina mostra la prossima serata in programma.
     Per mostrarne una specifica: bbbbolla.it/?serata=<id>
     L'id deve coincidere con la colonna "id" del foglio "Serate". */
  serate: [
    {
      id: "2026-10-30",
      data: "2026-10-30",          // AAAA-MM-GG
      orario: null,                // es. { inizio: "19:30", fine: "01:00" }
      luogo: {
        nome: null,                // es. "Nome del locale"
        indirizzo: null,           // es. "Via Etnea 1, Catania"
        mappa: null                // link Google Maps
      },
      lineup: [
        { nome: "Ritmi in Colombia", tag: "Lab" },
        { nome: "Selva Cosmica", tag: "Live" },
        { nome: "Franzuà", tag: "Sel Musicali", note: "downtempo · cumbia · afrobeat" },
        { nome: "Cantina controcorrente", tag: "Vino del giorno" }
      ],
      poster: "assets/poster.jpg"
    }
  ],

  infoUtili: [
    { titolo: "Ingresso", testo: "Gratuito con pass personale, per gruppi da 3 persone oppure su invito. Ognuno si registra con la propria email. Il pass arriva solo quando tutti e 3 hanno confermato: se il gruppo non si completa, nessuno lo riceve." },
    { titolo: "Capienza", testo: "I posti sono limitati. Il pass non garantisce l'ingresso dopo il raggiungimento della capienza massima del locale: arriva presto." },
    { titolo: "Bar", testo: "Consumazioni a pagamento. Il vino del giorno è a cura di Cantina controcorrente." },
    { titolo: "Foto e video", testo: "La serata sarà documentata con foto e video che potranno comparire sui canali social della rassegna." }
  ]
};
