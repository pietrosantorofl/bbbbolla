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
    email: "bollacatania@gmail.com",
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
      orario: { inizio: "20:00", fine: null },   // fine: null = "dalle 20:00"
      senzaPass: "5€ al botteghino dopo le 22:30",   // null = nessun ingresso senza pass
      luogo: {
        nome: "MONO",
        indirizzo: "Via Gornalunga, 12, 95129 Catania CT",
        mappa: "https://www.google.com/maps/search/?api=1&query=MONO+Via+Gornalunga+12+95129+Catania"
      },
      lineup: [
        {
          nome: "Ritmi in Colombia", tag: "Workshop", link: "https://www.instagram.com/karvpercu/",
          // dettagli: testo che si apre cliccando la voce nella line-up
          dettagli: {
            titolo: "Radici in cerchio: voce, tamburo e creazione collettiva",
            testo: [
              "Un laboratorio per esplorare i ritmi afrocolombiani, dalla cumbia al bullerengue, con la voce, il corpo e il tamburo.",
              "Giochi vocali, canti a risposta e pattern di percussioni, ispirati alla pratica del Circle Singing, per improvvisare e costruire insieme paesaggi sonori collettivi.",
              "Non serve nessuna esperienza musicale: basta la voglia di ascoltare, giocare e fare musica in cerchio."
            ],
            persone: [
              { nome: "Karen Andrea Ramirez Viasus", ruolo: "batteria e percussioni",
                testo: "Polistrumentista e musicista di sessione, con formazione alla Facultad de Artes ASAB dell'Università Francisco José de Caldas. Oltre 10 anni di carriera tra salsa, musica latina, rock, jazz e blues, in festival e concerti in Colombia, Spagna, Italia, Albania, Grecia, Turchia, Egitto e Germania." },
              { nome: "Milenaria (Ana Milena Lozada Avella)", ruolo: "voce",
                testo: "Cantautrice colombiana che intreccia radici afro-caraibiche e latinoamericane con jazz, soul e musica popolare brasiliana. Specializzata nel canto jazz e nelle musiche popolari, usa la voce come ponte tra memoria collettiva e canzone contemporanea." }
            ]
          }
        },
        { nome: "Selva Cosmica", tag: "Live", link: "https://www.instagram.com/selvacosmica_music/" },
        { nome: "Franzuà", tag: "Sel Musicali", note: "downtempo · cumbia · afrobeat", link: "https://www.instagram.com/franzua_imagerie/" },
        { nome: "Dario Aiello", tag: "Sel Musicali", note: "elettronica · dub · downtempo", link: "https://www.instagram.com/darioaiello77/" },
        // minore: true = più piccolo delle proposte musicali (vino, cibo)
        { nome: "Cantina controcorrente", tag: "Vino del giorno", minore: true, link: "https://www.instagram.com/controcorrente.etnawines/" },
        { nome: "SPIZZICO", tag: "Food dalle 20:00", minore: true }
      ]
    }
  ],

  /* testo unico sotto la line-up */
  infoUtili: "Ingresso gratuito con pass personale, per gruppi da 3 persone oppure su invito: ognuno si registra con la propria email e il pass arriva solo quando tutti e 3 hanno confermato. Senza pass: 5 € al botteghino dopo le 22:30. I posti sono limitati e il pass non garantisce l'ingresso a capienza raggiunta: arriva presto."
};
