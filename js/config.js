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
      // locandine per la pagina Eventi passati (archivio.html), una accanto all'altra; immagini in assets/locandine/
      locandine: [
        { src: "assets/locandine/2026-10-30-serata.jpg", alt: { it: "Locandina della serata del 30 ottobre 2026", en: "Poster of the 30 October 2026 night" } },
        { src: "assets/locandine/2026-10-30-workshop.jpg", alt: { it: "Locandina del workshop La Cumbia tradizionale colombiana", en: "Poster of the Traditional Colombian Cumbia workshop" } }
      ],
      // foto e video per la pagina Vibes (vibes.html#2026-10-30), file in assets/vibes/2026-10-30/
      // tipo: "foto" o "video"; src: null = segnaposto "in arrivo" finché non arriva il file
      // formato: larghezza:altezza ("9:16" video verticale dal telefono, "4:5", "3:2"…); poster: anteprima del video
      vibes: [
        { tipo: "foto", src: "assets/vibes/2026-10-30/bolle.webp", formato: "941:1672",
          alt: { it: "Una bolla di sapone durante il workshop di cumbia, con i tamburi sullo sfondo", en: "A soap bubble during the cumbia workshop, with the drums in the background" } },
        { tipo: "video", src: "assets/vibes/2026-10-30/selva-cosmica-live.mp4", poster: "assets/vibes/2026-10-30/selva-cosmica-live.jpg", formato: "9:16",
          alt: { it: "Il live di Selva Cosmica", en: "Selva Cosmica live" } },
        { tipo: "video", src: "assets/vibes/2026-10-30/dj-set.mp4", poster: "assets/vibes/2026-10-30/dj-set.jpg", formato: "9:16",
          alt: { it: "Il DJ set a fine serata, tra le bolle", en: "The late-night DJ set, among the bubbles" } }
      ],
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
          // link: profilo Instagram (si apre in una nuova scheda) oppure una pagina del sito
          nome: { it: "La Cumbia tradizionale colombiana", en: "Traditional Colombian Cumbia" }, ora: "20:00", tag: "Workshop", link: "workshop.html",
          // dettagli: testo breve (massimo 5 righe) che si apre cliccando la voce nella line-up
          dettagli: {
            titolo: { it: "Laboratorio di percussioni e canto afrocolombiani", en: "An Afro-Colombian percussion and singing workshop" },
            testo: [
              { it: "Laboratorio sui ritmi afrocolombiani, dalla cumbia al bullerengue: voce, corpo e tamburo per creare musica insieme, in cerchio. Nessuna esperienza richiesta.",
                en: "A workshop on Afro-Colombian rhythms, from cumbia to bullerengue: voice, body and drum to make music together, in a circle. No experience needed." },
              { it: "Con Karen Andrea Ramirez Viasus (percussioni) e Ana Milena Lozada Avella (voce).", en: "With Karen Andrea Ramirez Viasus (percussion) and Ana Milena Lozada Avella (vocals)." }
            ],
            // bottone in fondo ai dettagli
            prenota: { href: "workshop.html", testo: { it: "Prenota il workshop", en: "Book the workshop" } }
          }
        },
        {
          nome: "Selva Cosmica", ora: "21:30", tag: "Live", main: true, link: "https://www.instagram.com/selvacosmica_music/",
          dettagli: {
            testo: [
              { it: "Collettivo aperto e in continua evoluzione, un ponte sonoro tra Sicilia e Colombia nato dal DJ e produttore Dario Aiello. Oggi suona con le percussioni di Romina Adorno Pincha e Karen Andrea Ramirez e la voce di Anami: ritmi ancestrali del Sud del mondo che si rivestono di elettronica e dub techno, una preghiera psichedelica per la pista da ballo.",
                en: "An open, ever-evolving collective, a sonic bridge between Sicily and Colombia born from DJ and producer Dario Aiello. Today it plays with percussion by Romina Adorno Pincha and Karen Andrea Ramirez and the voice of Anami: ancestral rhythms of the Global South dressed in electronics and dub techno, a psychedelic prayer for the dance floor." }
            ]
          }
        },
        { nome: "Franzuà", ora: "23:00", tag: { it: "Sel Musicali", en: "Selections" }, note: "downtempo · cumbia · afrobeat", link: "https://www.instagram.com/franzua_imagerie/" },
        { nome: "Dario Aiello", ora: "23:00", tag: { it: "Sel Musicali", en: "Selections" }, note: { it: "elettronica · dub · downtempo", en: "electronic · dub · downtempo" }, link: "https://www.instagram.com/darioaiello77/" },
        // minore: true = più piccolo delle proposte musicali (vino, cibo)
        { nome: "Vini CONTROCORRENTE di Nino Calì", note: "Host: Valerio Brunetto", tag: { it: "Vino del giorno", en: "Wine of the day" }, minore: true, link: "https://www.instagram.com/controcorrente.etnawines/" },
        { nome: "SPIZZICO", tag: { it: "Food dalle 20:00", en: "Food from 8 pm" }, minore: true }
      ]
    },
    {
      id: "2026-11-06",
      data: "2026-11-06",
      // locandina definitiva (Canva, 1080x1350 = 4:5), per la pagina Eventi passati
      locandine: [
        { src: "assets/locandine/2026-11-06-serata.jpg", formato: "4:5", alt: { it: "Locandina della serata del 6 novembre 2026", en: "Poster of the 6 November 2026 night" } },
        { src: "assets/locandine/2026-11-06-workshop.jpg", formato: "4:5", alt: { it: "Locandina del workshop di samba e percussioni con Sambazita", en: "Poster of the samba and percussion workshop with Sambazita" } },
        { src: "assets/locandine/2026-11-06-vino.jpg", formato: "4:5", alt: { it: "Locandina della cantina del giorno: Vini Manciaciumi di Dario Sciuto", en: "Poster of the winery of the day: Manciaciumi wines by Dario Sciuto" } }
      ],
      // locandinaHero: nella home l'immagine della locandina al posto di sfera, date e programma
      locandinaHero: { src: "assets/locandine/2026-11-06-serata.jpg", formato: "4:5", alt: { it: "Locandina della serata del 6 novembre 2026: workshop di samba e percussioni, live podcast Tavola Cunzata e cena colombiana, live jam session, Vini Manciaciumi, Milenaria e Dario Aiello", en: "Poster of the 6 November 2026 night: samba and percussion workshop, Tavola Cunzata live podcast and Colombian dinner, live jam session, Manciaciumi wines, Milenaria and Dario Aiello" } },
      // sfera ricolorata con i colori di Tavola Cunzata (si vede solo senza locandinaHero)
      sfera: { src: "assets/sfera-tavola-cunzata.webp", ombra: "rgba(3, 195, 241, .35)" },
      orario: { inizio: "19:00", fine: null },
      senzaPass: { it: "5€ al botteghino dopo le 22:30", en: "€5 at the box office after 10:30 pm" },
      luogo: {
        nome: "MONO",
        indirizzo: "Via Gornalunga, 12, 95129 Catania CT",
        mappa: "https://www.google.com/maps/search/?api=1&query=MONO+Via+Gornalunga+12+95129+Catania"
      },
      lineup: [
        {
          nome: { it: "Workshop di SAMBA e PERCUSSIONI", en: "SAMBA and PERCUSSION Workshop" }, ora: "19:00", tag: "Workshop",
          note: { it: "a cura di Sambazita", en: "by Sambazita" }, link: "https://www.instagram.com/sambazita_/",
          dettagli: {
            prenota: { href: "prenota.html?e=samba-2026-11-06", testo: { it: "Prenota il workshop", en: "Book the workshop" } },
            testo: [
              { it: "Un workshop aperto a chiunque abbia voglia di mettersi in gioco, scoprire nuove sonorità e lasciarsi coinvolgere dall’energia della musica brasiliana.",
                en: "A workshop open to anyone who wants to get involved, discover new sounds and be swept up by the energy of Brazilian music." },
              { it: "Il samba non è solo musica: è corpo, condivisione, energia collettiva. È imparare ad ascoltarsi, trovare il proprio tempo e diventare parte di un unico grande suono. Nessuna esperienza richiesta.",
                en: "Samba isn’t just music: it’s body, sharing, collective energy. It’s learning to listen to each other, finding your own time and becoming part of one big sound. No experience needed." }
            ]
          }
        },
        {
          nome: { it: "Cena Colombiana", en: "Colombian Dinner" }, ora: "20:00", tag: { it: "Cena", en: "Dinner" },
          note: { it: "con Marina dell’Antojito Colombiano", en: "with Marina of Antojito Colombiano" }, link: "6nov-tavolacunzata/",
          dettagli: {
            testo: [
              { it: "Marina e la sua cucina dell’Antojito Colombiano. La cena è su prenotazione, prezzo speciale 15€ con bevanda inclusa.",
                en: "Marina and her Antojito Colombiano cooking. The dinner is by reservation, special price €15 including a drink." },
              { it: "Menù: arroz con pollo (riso con pollo, tipico colombiano) · due empanadas, pollo e carne · hawaiana (cipollina colombiana) · bebida “La Colombiana” gusto uva o fragola, analcolica. Menù veggy: arroz con verdure · due empanadas alle verdure · platanos · bebida “La Colombiana”.",
                en: "Menu: arroz con pollo (chicken and rice, a Colombian classic) · two empanadas, chicken and beef · hawaiana (Colombian spring onion) · “La Colombiana” soft drink, grape or strawberry. Veggie menu: rice with vegetables · two vegetable empanadas · platanos · “La Colombiana” soft drink." }
            ],
            prenota: { href: "6nov-tavolacunzata/", testo: { it: "Prenota la cena", en: "Book the dinner" } }
          }
        },
        {
          nome: "Tavola Cunzata", ora: "21:00", tag: "Live Podcast", main: true, link: "https://www.instagram.com/tavolacunzata.podcast/",
          note: { it: "ospite: Marina dell’Antojito Colombiano", en: "guest: Marina of Antojito Colombiano" },
          dettagli: {
            testo: [
              { it: "Tavola Cunzata si registra dal vivo e a tavola c’è Marina dell’Antojito Colombiano: dopo la cena, un viaggio da Catania fino alla Colombia tra racconti, musica, parole e sapori.",
                en: "Tavola Cunzata records live, with Marina of Antojito Colombiano at the table: after dinner, a journey from Catania to Colombia through stories, music, words and flavours." },
              { it: "La sua storia, le tradizioni e i piatti di casa, i modi di dire e cosa vuol dire portare le proprie radici dall’altra parte del mondo.",
                en: "Her story, home traditions and dishes, sayings, and what it means to carry your roots to the other side of the world." }
            ]
          }
        },
        { nome: "Live Jam Session", ora: "22:00", tag: "Live", note: { it: "con l’orchestra del podcast", en: "with the podcast’s orchestra" } },
        {
          nome: "Milenaria · Dario Aiello", ora: "23:30", tag: { it: "Sel Musicali", en: "Selections" }, note: { it: "cumbia · downtempo · elettronica", en: "cumbia · downtempo · electronic" },
          artisti: [{ nome: "Milenaria", link: "https://www.instagram.com/milenaria.sur/" }, { nome: "Dario Aiello", link: "https://www.instagram.com/darioaiello77/" }]
        },
        // minore: true = più piccolo delle proposte musicali (vino, cibo)
        {
          nome: "Vini Manciaciumi", tag: { it: "Cantina del giorno", en: "Winery of the day" }, minore: true, link: "https://www.instagram.com/manciaciumi.etna/",
          dettagli: {
            testo: [
              { it: "Nati sull’Etna nel 2020, intorno a una vecchia vigna. In siciliano “manciaciumi” è l’irrequietezza, il bisogno di fare, sperimentare, muoversi.",
                en: "Born on Etna in 2020, around an old vineyard. In Sicilian, “manciaciumi” means restlessness, the urge to do, experiment, move." },
              { it: "Oggi è il progetto di Dario Sciuto e Virginia Paracino, tutto etneo: versanti, vitigni e terroir di un unico vulcano.",
                en: "Today it’s Dario Sciuto and Virginia Paracino’s project, all from Etna: the slopes, grapes and terroirs of a single volcano." }
            ]
          }
        },
        { nome: "MONAMOUR", tag: { it: "Cucina dalle 19 alle 23", en: "Kitchen 7–11 pm" }, minore: true }
      ]
    },
    {
      id: "2026-11-13",
      data: "2026-11-13",
      // locandina non ancora pronta: grafica delle bolle con il logo (assets/sfera-13-11.webp) e la scritta "Locandina in arrivo".
      // DA COMPLETARE con la locandina: locandine + locandinaHero (come il 6.11), orario, line-up e workshop (riga Eventi + voce in "eventi")
      sfera: { src: "assets/sfera-13-11.webp", ombra: "rgba(240, 48, 90, .35)" },
      locandinaInArrivo: true,
      orario: null,
      ingresso: false,                  // niente riga Ingresso finché non si sa (scelta dell'utente, 07.11)
      luogo: {
        nome: "MONO",
        indirizzo: "Via Gornalunga, 12, 95129 Catania CT",
        mappa: "https://www.google.com/maps/search/?api=1&query=MONO+Via+Gornalunga+12+95129+Catania"
      },
      // vuota finché non arriva il programma: niente line-up né sulla locandina né sotto (scelta dell'utente, 07.11)
      lineup: []
    }
  ],

  /* Eventi con prenotazione (workshop, cene…): pagina bbbbolla.it/prenota.html?e=<id>.
     id deve coincidere con la colonna "id" del foglio Eventi, dove stanno posti, chiusura e persone per prenotazione.
     data e luogo: quelli della serata indicata, oppure data/luogo scritti qui (evento fuori dalle serate). */
  eventi: [
    {
      id: "cumbia-2026-10-30",
      tipo: "workshop",                 // come la colonna "tipo" del foglio Eventi
      etichetta: "Workshop",            // riga piccola sopra il titolo
      serata: "2026-10-30",             // serata bolla® di cui fa parte (data, luogo, link al pass)
      ora: "20:00",
      durata: 2,                        // ore, per il calendario (fino all'inizio dei live)
      titolo: { it: "La Cumbia tradizionale colombiana", en: "Traditional Colombian Cumbia" },
      sottotitolo: { it: "Laboratorio di percussioni e canto afrocolombiani", en: "An Afro-Colombian percussion and singing workshop" },
      bottone: { it: "Prenota il workshop", en: "Book the workshop" },
      locandina: { it: "assets/workshop-cumbia.jpg", en: "assets/workshop-cumbia-en.jpg" },
      conduttori: [
        { nome: "Karen Andrea Ramirez Viasus", ruolo: { it: "batteria e percussioni", en: "drums and percussion" } },
        { nome: "Ana Milena Lozada Avella", ruolo: { it: "voce", en: "vocals" } }
      ],
      testo: [
        { it: "Un laboratorio sui ritmi afrocolombiani, dalla cumbia al bullerengue: voce, corpo e tamburo per creare musica insieme, in cerchio.",
          en: "A workshop on Afro-Colombian rhythms, from cumbia to bullerengue: voice, body and drum to make music together, in a circle." },
        { it: "Nessuna esperienza richiesta.",
          en: "No experience needed." }
      ]
    },
    {
      id: "samba-2026-11-06",
      tipo: "workshop",
      etichetta: "Workshop",
      serata: "2026-11-06",
      ora: "19:00",
      durata: 1,
      titolo: { it: "Workshop di SAMBA e PERCUSSIONI", en: "SAMBA and PERCUSSION Workshop" },
      sottotitolo: { it: "a cura di Sambazita", en: "by Sambazita" },
      bottone: { it: "Prenota il workshop", en: "Book the workshop" },
      logo: { src: "assets/sambazita-logo.png", alt: "Scuola Popolare Sambazita" },
      conduttori: [
        { nome: "Sambazita", ruolo: { it: "samba e percussioni brasiliane", en: "Brazilian samba and percussion" } }
      ],
      testo: [
        { it: "BOLLA incontra il ritmo del samba con un workshop aperto a chiunque abbia voglia di mettersi in gioco, scoprire nuove sonorità e lasciarsi coinvolgere dall’energia della musica brasiliana.",
          en: "BOLLA meets the rhythm of samba with a workshop open to anyone who wants to get involved, discover new sounds and be swept up by the energy of Brazilian music." },
        { it: "Il samba non è solo musica: è corpo, condivisione, energia collettiva. È imparare ad ascoltarsi, trovare il proprio tempo e diventare parte di un unico grande suono.",
          en: "Samba isn’t just music: it’s body, sharing, collective energy. It’s learning to listen to each other, finding your own time and becoming part of one big sound." },
        { it: "Porta la tua curiosità, al resto pensiamo insieme. Nessuna esperienza richiesta.",
          en: "Bring your curiosity, we’ll figure out the rest together. No experience needed." }
      ]
    },
    {
      // la pagina della cena resta bbbbolla.it/6nov-tavolacunzata/ (js/cena.js); questa voce serve a prenota.html e alla demo
      id: "tavolacunzata-2026-11-06",
      tipo: "cena",
      etichetta: "Tavola Cunzata",
      data: "2026-11-06",
      ora: "20:00",
      durata: 3,
      titolo: "Cena colombiana",
      sottotitolo: "Marina e la sua cucina dell’Antojito Colombiano",
      bottone: { it: "Prenota la cena", en: "Book the dinner" },
      luogo: {
        nome: "MONO",
        indirizzo: "Via Gornalunga, 12, 95129 Catania CT",
        mappa: "https://www.google.com/maps/search/?api=1&query=MONO+Via+Gornalunga+12+95129+Catania"
      }
    }
  ],

  /* testo unico sotto la line-up */
  infoUtili: {
    it: "Ingresso gratuito con pass personale, per gruppi da 3 persone oppure su invito. Senza pass: 5 € al botteghino dopo le 22:30. I posti sono limitati e il pass non garantisce l'ingresso a capienza raggiunta: arriva presto.",
    en: "Free entry with a personal pass, for groups of 3 or by invitation. Without a pass: €5 at the box office after 10:30 pm. Places are limited and the pass doesn't guarantee entry once the venue is full: come early."
  }
};
