# bolla® — pass gratuiti (bbbbolla.it)

Landing page per i pass gratuiti delle serate della rassegna bolla®.
Sito statico (HTML, CSS, JavaScript vanilla) su GitHub Pages. I dati finiscono in un Google Sheet
tramite Google Apps Script, che invia anche le email con link personale e QR.

## Come si ottiene un pass

Una persona = un pass = un QR. Due strade:

| Strada | Link | Come funziona |
|---|---|---|
| **Invito** | `bbbbolla.it/?invito=<token>` | Link unlisted creato da te. Nome, cognome, email: il pass con QR arriva subito via email. Ogni link ha un tetto di pass. |
| **Gruppo da 3** | `bbbbolla.it` | Il capogruppo si registra e riceve il link del gruppo `?gruppo=<id>` da girare a 2 amici. Ognuno si registra con la propria email e conferma aprendo il link personale. Solo quando tutti e 3 hanno confermato ognuno riceve il suo QR: se il gruppo non si completa, nessuno riceve il pass. |

- I posti del gruppo si bloccano quando il capogruppo conferma la sua email.
- I gruppi vanno completati entro le 18:00 del giorno della serata (`CONFIG.chiusuraGruppi`): dopo scadono, liberano i posti e non se ne creano di nuovi.
- Chi non conferma entro 48 ore (`CONFIG.oreConferma`) può perdere il posto nel gruppo a favore di un altro amico.
- Il link personale `?pass=<chiave>` mostra lo stato del gruppo e, quando attivo, il QR. Il QR contiene la stessa chiave.

**Pass esauriti**: il sito mostra "Esaurito" e il modulo diventa iscrizione alla **lista d'attesa** (nome ed email).
Le iscrizioni finiscono nel foglio **Attesa**: nessun pass automatico, decidi tu chi richiamare (per esempio con un link invito).

## App ingresso (staff)

Pagina **bbbbolla.it/staff.html**, da aprire sul telefono di chi sta alla porta (meglio: "Aggiungi a schermata Home").
Si entra solo da un **link segreto**, niente PIN.

1. Nel foglio: menu **bolla® → Crea link segreto staff**. Compare il link (`…/staff.html#k=…`): mandalo solo a chi lavora alla porta.
   Crearne uno nuovo disattiva il vecchio su tutti i telefoni.
2. Sul telefono: apri il link (resta salvato, poi basta aprire la pagina), premi **Avvia fotocamera** e inquadra i QR.
   **Esci** dimentica il link su quel telefono.

- **Verde "Entra"**: pass valido, ingresso registrato. Per i gruppi mostra chi del gruppo è già dentro (ognuno entra col suo QR).
- **Rosso**: già entrato (con l'ora), pass inesistente, annullato, di un'altra serata, o gruppo mai completato.
- **Arancione "Attenzione"**: la persona risultava già entrata da un altro telefono.
- **Ricerca** per cognome, nome o codice `BOL-…` se il QR non si legge (controlla un documento).
- Il telefono scarica la lista dei pass attivi (solo l'hash delle chiavi, non i QR) e la aggiorna ogni minuto:
  la risposta è immediata e, se la rete cade, gli ingressi restano in coda e partono appena torna.
- Nel foglio Pass: `checkin` = ora di ingresso, `checkin_da` = telefono che l'ha registrato.

Prova senza toccare i dati veri: `staff.html?demo` (entra da sola).

## Live: cosa prova il pubblico, nelle visuals

Il pubblico inquadra il QR proiettato, sceglie nickname e colore e scrive cosa prova (testo libero, massimo 24 caratteri).
L'invio scorre nella mini chat sul muro e sparisce dopo 10 secondi; il testo appare grande nel colore scelto, poi si scioglie
dentro le visuals. Per una ventina di secondi il testo cambia anche il carattere del flusso: parole come gioia, amore,
calma, euforia, malinconia… hanno un carattere proprio; qualunque altro testo ne riceve uno ricavato dalle sue lettere.

- **Link segreto visuals**: nel foglio, menu **bolla® → Crea link segreto visuals**. Dà due link con lo stesso segreto:
  `…/live/schermo.html#k=…` e `…/live/regia.html#k=…`. Crearne uno nuovo disattiva i vecchi.
- **Schermo** (computer collegato al proiettore): apri il link dello schermo in Chrome, premi **Avvia** e consenti il microfono
  (meglio ancora un ingresso audio dal mixer). Sullo schermo non compare nessun pannello: solo `F` schermo intero e
  `H` pannello audio. Senza microfono gira un suono simulato.
- **Regia** (laptop o telefono di chi gestisce le visuals, anche lo stesso computer in un'altra finestra): tipo di visuals
  e giro automatico, velocità, sensibilità ai bassi (da 0 = ignorati a ×4), ingresso audio dello schermo, posizione di QR
  e chat (si trascinano sulla mappa) e se mostrarli, "Pulisci il campo", "Invio di prova", e la lista degli invii con
  **Nascondi** per toglierli subito dal muro e dalla chat. Mostra se lo schermo è collegato e i livelli del suono.
  Dallo stesso computer i cambi arrivano subito; da un altro dispositivo in 2-3 secondi.
- **Telefono del pubblico**: il QR porta a `bbbbolla.it/live/?c=<codice>`. Senza codice valido la pagina non invia nulla.
  Per invalidare i QR vecchi: menu **bolla® → Rigenera codice live** (lo schermo mostra il nuovo QR da solo).
- **Musica**: il movimento è lento; volume, medi, alti e timbro decidono velocità, forma e colore. I bassi toccano appena lo sfondo
  (alzando la sensibilità dalla regia contano di più: lo sfondo si accende e il campo respira sui colpi).
- **Carattere**: testi sul muro e chat usano Modak (Google Fonts), il più vicino al logo; senza internet si torna a Helvetica.
- **Filtro**: nickname e testi volgari vengono respinti dal server; ogni telefono può mandare un testo ogni 30 secondi
  (`liveSecondiTraInvii` in Code.gs). Tutto finisce anche nel foglio **Live**.

Prova senza toccare i dati veri, nello stesso browser: `live/schermo.html?demo`, `live/regia.html?demo` e `live/?demo` in tre schede.

## Protezioni

- **Tutti i controlli sono sul server** (Apps Script): il sito si può aggirare, il backend no.
- **Email verificate**: il QR arriva solo via email, quindi chi lo usa possiede l'indirizzo. Nei gruppi ogni membro conferma da solo.
- **Una email per serata**: Gmail ignora punti e `+etichetta`, quindi `m.rossi+1@gmail.com` = `mrossi@gmail.com`.
- **Email temporanee respinte**: lista pubblica aggiornata di ~10.000 domini usa e getta (scaricata ogni 6 ore da
  [disposable-email-domains](https://github.com/disposable-email-domains/disposable-email-domains)), sottodomini inclusi.
  Più un controllo DNS: un dominio che non riceve posta (es. errori di battitura come `gmial.con`) viene respinto.
- **Timer anti-bot**: il server firma l'ora in cui consegna il modulo. Un invio prima di 4 secondi, dopo 2 ore,
  con firma falsa o con un modulo già usato viene respinto. Un bot deve aspettare a ogni registrazione.
- **Tetto globale**: massimo 20 registrazioni al minuto per tutto il sito.
- **Campo trappola** (honeypot) invisibile alle persone.
- **Duplicati**: se un'email è già registrata, il sito non mostra nulla del pass: rimanda il link al vero proprietario (al massimo ogni 15 minuti).
- **Testi nel foglio**: un nome come `=FORMULA()` viene salvato come testo.

Valori regolabili in `CONFIG` in cima a `apps-script/Code.gs`.

## Struttura

```
.
├── index.html             Pagina principale (poster + dettagli + scheda pass)
├── privacy.html           Informativa privacy
├── manifesto.html         Manifesto di bolla® (testi del carosello)
├── CNAME                  Dominio per GitHub Pages (bbbbolla.it)
├── css/style.css          Stili (palette in cima al file)
├── js/config.js           ← CONTENUTI: serate, line-up, luogo, orari, testi, URL backend
├── js/main.js             Logica della pagina
├── prenota.html           Prenotazione agli eventi (workshop, cene…): prenota.html?e=<id>
├── js/prenota.js          Logica della pagina prenota
├── staff.html             App ingresso per lo staff (lettura QR)
├── js/staff.js            Logica dell'app ingresso
├── js/vendor/jsQR.js      Lettore QR (jsQR 1.4.0, Apache-2.0)
├── js/demo.js             Modalità demo: esegue Code.gs nel browser con dati finti
├── js/vendor/qrcode.js    Libreria QR (qrcode-generator 1.4.4, MIT)
├── assets/                Logo, poster, favicon
├── apps-script/Code.gs    Backend da incollare in Google Apps Script
└── apps-script/qrcode.gs  Stessa libreria QR, per le email
```

## 1. Backend: Google Sheet + Apps Script

**Già attivo** sull'account `bollacatania@gmail.com`: foglio "bolla® — pass", progetto in `apps-script/.clasp.json`,
ID del deployment in `apps-script/deployment-id.txt` (è quello dentro `apiUrl`).

Per aggiornare il backend dopo una modifica a `Code.gs` (clasp con le credenziali salvate come utente `bolla`):

```bash
cd apps-script && npx @google/clasp -u bolla push --force && npx @google/clasp -u bolla update-deployment "$(cat deployment-id.txt)" --description "bolla pass"
```

Usa sempre `update-deployment` con lo stesso ID: un nuovo deployment cambierebbe l'URL.
Aprire l'URL `…/exec` nel browser mostra lo stato del backend (e crea i fogli se mancano).
Se aggiungi permessi al manifest, l'URL mostra "Authorization is required": autorizza dal foglio, menu **bolla® → Attiva sveglia automatica** (o un'altra voce del menu).

### Installazione da zero (solo se serve rifarlo)

1. Crea un nuovo Google Sheet (es. "bolla — pass").
2. Menu **Estensioni → Apps Script**. Cancella il codice di esempio e incolla `apps-script/Code.gs`.
   Poi **File (+) → Script**, chiamalo `qrcode` e incolla `apps-script/qrcode.gs`.
3. **Impostazioni progetto (ingranaggio) → Fuso orario: (GMT+01:00) Roma**.
4. In cima a `Code.gs` compila `CONFIG` (`replyTo`, `luogo`, `orario`).
5. Seleziona la funzione `setup` e premi **Esegui**. Autorizza l'accesso (foglio, email, servizi esterni).
   Nascono i fogli **Serate**, **Inviti**, **Gruppi**, **Pass**.
6. Nel foglio **Serate** imposta la `capienza` reale. `aperta` = `TRUE` apre i pass, `FALSE` li chiude.
7. **Esegui il deployment → Nuovo deployment → Tipo: App web**
   - Esegui come: **Me**
   - Chi ha accesso: **Chiunque**
8. Copia l'URL che finisce con `/exec` e incollalo in `js/config.js`, campo `apiUrl`.

Quando modifichi `Code.gs`: **Gestisci deployment → modifica (matita) → Versione: Nuova versione**.
Così l'URL resta lo stesso.

Senza `apiUrl` il sito gira in **modalità demo**: stesso `Code.gs`, ma fogli ed email finti salvati nel browser.
Le email compaiono nella casella "Email demo". Invito di prova: `?invito=demoinvito01`.
Con `apiUrl` impostato, aggiungi `?demo` all'indirizzo (es. `http://localhost:8770/?demo`) per provare in demo senza toccare il foglio vero.
In demo non c'è rete: si usa la lista di riserva delle email temporanee e niente controllo DNS.

## 2. Gestione dal foglio

Ricarica il foglio dopo il setup: compare il menu **bolla®**.

- **Nuovo link invito**: menu **bolla® → Crea link invito…**. Scegli un nome (es. "Artisti") e, se vuoi, un tetto di pass (vuoto = nessun limite).
  Il link appare a schermo. Colonna `serata` vuota = vale per tutte le serate. `attivo` = `FALSE` lo spegne. `scadenza` (data) opzionale.
- **Annullare un pass**: foglio **Pass**, colonna `stato` = `annullato`.
- **Annullare un gruppo**: foglio **Gruppi**, colonna `stato` = `annullato`. I posti tornano liberi.
- **Ingresso** (finché non c'è l'app di validazione): il QR contiene la `chiave`. Cercala nel foglio Pass e segna `x` in `checkin`.
- **Nuova serata** (ogni venerdì): menu **bolla® → Nuova serata…** (data, titolo, capienza), poi una voce in `serate`
  dentro `js/config.js` con lo stesso `id` (la line-up). Nient'altro da pubblicare: il backend non cambia.
- **Impostazioni della serata**, colonne del foglio **Serate** (vuote = valori soliti di `CONFIG` in Code.gs):
  `orario`, `luogo`, `senza_pass` (`-` = nessun ingresso senza pass), `chiusura_pass`, `chiusura_gruppi` (HH:mm).
- **Automazioni della serata**, stesse righe; vuote = spente. Una o più ore separate da virgola, ognuna parte una volta sola:

  | Colonna | Cosa fa | Esempio |
  |---|---|---|
  | `promemoria` | email a chi non ha ancora confermato il pass di gruppo | `-2 14:00` (due giorni prima) |
  | `solleciti` | "ultime ore", gruppo riaperto, "manca qualcuno" | `09:30` (il giorno della serata) |
  | `regalo` | pass dato lo stesso a chi ha confermato in un gruppo incompleto | `18:00, 22:00` |
  | `recap` | numeri della serata agli indirizzi di `recap_a` | `16:00, 17:00, 18:00, 19:00` |

  Un'ora è `HH:mm` (giorno della serata), `-N HH:mm` (N giorni prima) o `AAAA-MM-GG HH:mm`. Le fa partire la sveglia;
  con troppo ritardo (sveglia ferma, riga scritta tardi) l'automazione si salta. Esito nella pagina `/exec`.
  **Nuova serata…** compila già promemoria, solleciti e recap (`CONFIG.nuovaSerata`); il regalo resta spento.
- **Serata → attività → prenotazioni**. Ogni cosa della serata (workshop, cena, live, dj…) è una riga del foglio
  **Attività**: `id`, `serata` (id della riga Serate), `tipo`, `titolo`, `inizio` (`HH:mm` nel giorno della serata o
  `AAAA-MM-GG HH:mm`; da lì le prenotazioni chiudono), casella `prenotazione`, `posti`, `max_persone`, `attivo`, `avvisa`, `link`.
  Con la casella `prenotazione` spuntata la sveglia scrive in `link` il link da condividere (`bbbbolla.it/prenota.html?e=<id>`);
  un link scritto a mano resta. Le prenotazioni finiscono tutte nel foglio **Prenotazioni** (colonna `attivita` = id).
  Sul sito: voce in `attivita` dentro `js/config.js` con lo stesso `id` (testi, locandina, `bottone`, eventuale `pagina`)
  e `attivita: "<id>"` nella voce della line-up: il bottone di prenotazione compare da solo.
  `max_persone` vuoto = una persona, il modulo non chiede quante. Il recap e la dashboard contano le prenotazioni per attività.
- **Archivio**: due giorni dopo la serata, di notte (3-6), la sveglia sposta le sue righe da Pass, Gruppi, Attesa, Live
  e le prenotazioni delle sue attività nei fogli **Archivio …** dello stesso file. I fogli che il sito legge restano piccoli
  e veloci anche dopo un anno di serate. Per cercare qualcuno di una serata passata: fogli Archivio.
- **Contatti**: foglio **Contatti**, una riga per persona (email verificata): prima e ultima serata, quante serate.
- **Newsletter**: menu **bolla® → Esporta newsletter**. Il foglio **Newsletter** contiene gli iscritti del foglio Contatti.
- **Disiscrizione**: `FALSE` nella colonna `newsletter` del foglio **Contatti** (una cella sola, vale per sempre).
  `FALSE` in una riga del foglio Pass vale ancora: l'export la riporta nei Contatti.
- **Privacy**: 30 giorni dopo la serata (e dopo il workshop o la cena) cancella le sue righe dai fogli **Archivio …**
  (l'informativa promette la cancellazione entro 30 giorni). Il foglio Contatti resta: serve alla newsletter.

### Email: Brevo + Gmail

- **Brevo** (piano Starter, nessun limite giornaliero): manda tutte le email (conferme, pass, lista d'attesa).
  Mittente `pass@bbbbolla.it` (dominio autenticato su Brevo), risposte a `bollacatania@gmail.com`.
  Il QR del pass arriva in allegato (Brevo non mette immagini dentro il testo); il bottone "Apri il pass sul sito" lo mostra comunque.
  Chiave API: menu **bolla® → Imposta chiave Brevo…** (resta nelle proprietà dello script, mai nel codice).
  Prova: menu **bolla® → Invia email di prova (Brevo)**.
- **Gmail** (100 al giorno): solo di riserva, se Brevo non è collegato o rifiuta un invio.

### Limiti di Google

Un account Gmail gratuito invia **100 email al giorno** con Apps Script (Google Workspace: 1500).
Ogni gruppo completo usa circa 6 email (3 conferme + 3 QR), ogni invito 1.
Con il limite raggiunto il sito respinge le nuove registrazioni con un messaggio chiaro.

## 3. Sito su GitHub Pages

Repository `pietrosantorofl/bbbbolla`, branch `main`, cartella root. Dominio `bbbbolla.it` con HTTPS obbligatorio.
DNS su Register.it: 4 record **A** su `@` (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`) e **CNAME** `www` verso `pietrosantorofl.github.io`.

Ogni push su `main` pubblica il sito in circa un minuto.
Prima di ogni push lancia `sh tools/versione.sh`: aggiorna il numero di versione di CSS e JS, così i browser non usano file vecchi.

## 4. Aggiornare i contenuti

Tutto in `js/config.js`: luogo, orario, line-up, testi, info utili, contatti.
Un valore `null` mostra "in arrivo" o nasconde l'elemento.
La pagina mostra da sola la prossima serata; `?serata=<id>` apre una serata specifica.

## Lingue (IT / EN)

Tastino in alto a destra su home, manifesto e privacy; la scelta resta salvata nel browser (`?lang=en` / `?lang=it` per forzarla).
- Testi della pagina: dizionario in `js/i18n.js` (chiave = testo italiano). Una frase nuova in `main.js` va scritta come `T("…")` e aggiunta al dizionario.
- Testi di `config.js`: stringa oppure `{ it: "…", en: "…" }`.
- Manifesto e privacy: blocchi `data-lang="it"` / `data-lang="en"` nell'HTML.
- Le email e l'app staff restano in italiano.

## Anteprima locale

```bash
python3 -m http.server 8770
```

Poi apri http://localhost:8770.
