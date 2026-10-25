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

  rassegna: {
    nome: "bolla®",
    // i testi possono essere una stringa o { it: "...", en: "..." } (versione inglese del sito)
    sottotitolo: { it: "Rassegna di musica live", en: "Live music series" },
    /* testo in cima alla pagina, prima della sfera (con il link al manifesto) */
    presentazione: {
      it: "bolla® è una rassegna di musica dal vivo a Catania: live, workshop, lab e talk, tra elettronica, world music, nu-jazz, soul e i ritmi ancestrali del sud del mondo.",
      en: "bolla® is a live music series in Catania: live sets, workshops, labs and talks, across electronic music, world music, nu-jazz, soul and the ancestral rhythms of the Global South."
    },
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
      orario: { inizio: "20:00", fine: null },   // fine: null = "dalle 20:00"
      senzaPass: { it: "5€ al botteghino dopo le 22:30", en: "€5 at the box office after 10:30 pm" },   // null = nessun ingresso senza pass
      luogo: {
        nome: "MONO",
        indirizzo: "Via Gornalunga, 12, 95129 Catania CT",
        mappa: "https://www.google.com/maps/search/?api=1&query=MONO+Via+Gornalunga+12+95129+Catania"
      },
      lineup: [
        {
          // ora: orario in locandina (in ordine di programma); minore: true = food & beverage, colonna a destra;
          // main: true = main act, più grande nella locandina
          nome: "Ritmi in Colombia", ora: "20:00", tag: "Workshop", link: "https://www.instagram.com/karvpercu/",
          // dettagli: testo breve (massimo 5 righe) che si apre cliccando la voce nella line-up
          dettagli: {
            titolo: { it: "Radici in cerchio: voce, tamburo e creazione collettiva", en: "Roots in a circle: voice, drum and collective creation" },
            testo: [
              { it: "Laboratorio sui ritmi afrocolombiani, dalla cumbia al bullerengue: voce, corpo e tamburo per creare musica insieme, in cerchio. Nessuna esperienza richiesta.",
                en: "A workshop on Afro-Colombian rhythms, from cumbia to bullerengue: voice, body and drum to make music together, in a circle. No experience needed." },
              { it: "Con Karen Andrea Ramirez Viasus (percussioni) e Milenaria (voce).", en: "With Karen Andrea Ramirez Viasus (percussion) and Milenaria (vocals)." }
            ]
          }
        },
        {
          nome: "Selva Cosmica", ora: "22:00", tag: "Live", main: true, link: "https://www.instagram.com/selvacosmica_music/",
          dettagli: {
            testo: [
              { it: "Un ponte sonoro tra Sicilia e Colombia, nato dal DJ e produttore Dario Aiello con le percussioni di Romina Adorno Pincha e Karen Andrea Ramirez e la voce di La Sol. Ritmi ancestrali del Sud del mondo che si rivestono di elettronica, sfumature mediterranee e dub techno: una preghiera psichedelica per la pista da ballo.",
                en: "A sonic bridge between Sicily and Colombia, born from DJ and producer Dario Aiello with percussion by Romina Adorno Pincha and Karen Andrea Ramirez and the voice of La Sol. Ancestral rhythms of the Global South dressed in electronics, Mediterranean shades and dub techno: a psychedelic prayer for the dance floor." }
            ]
          }
        },
        { nome: "Franzuà", ora: "23:30", tag: { it: "Sel Musicali", en: "Selections" }, note: "downtempo · cumbia · afrobeat", link: "https://www.instagram.com/franzua_imagerie/" },
        { nome: "Dario Aiello", ora: "23:30", tag: { it: "Sel Musicali", en: "Selections" }, note: { it: "elettronica · dub · downtempo", en: "electronic · dub · downtempo" }, link: "https://www.instagram.com/darioaiello77/" },
        // minore: true = più piccolo delle proposte musicali (vino, cibo)
        { nome: "Cantina controcorrente", tag: { it: "Vino del giorno", en: "Wine of the day" }, minore: true, link: "https://www.instagram.com/controcorrente.etnawines/" },
        { nome: "SPIZZICO", tag: { it: "Food dalle 20:00", en: "Food from 8 pm" }, minore: true }
      ]
    }
  ],

  /* testo unico sotto la line-up */
  infoUtili: {
    it: "Ingresso gratuito con pass personale, per gruppi da 3 persone oppure su invito. Senza pass: 5 € al botteghino dopo le 22:30. I posti sono limitati e il pass non garantisce l'ingresso a capienza raggiunta: arriva presto.",
    en: "Free entry with a personal pass, for groups of 3 or by invitation. Without a pass: €5 at the box office after 10:30 pm. Places are limited and the pass doesn't guarantee entry once the venue is full: come early."
  }
};
