# bolla® — pass gratuiti (bbbbolla.it)

Landing page per prenotare pass gratuiti alle serate della rassegna bolla®.
Sito statico (HTML, CSS, JavaScript vanilla) su GitHub Pages. Le prenotazioni finiscono
in un Google Sheet tramite Google Apps Script, che invia anche l'email con il codice.

```
.
├── index.html            Pagina principale (poster + dettagli + prenotazione)
├── privacy.html          Informativa privacy (compila i campi evidenziati in giallo)
├── CNAME                 Dominio per GitHub Pages (bbbbolla.it)
├── css/style.css         Stili (palette in cima al file)
├── js/config.js          ← CONTENUTI: serate, line-up, luogo, orari, testi, URL backend
├── js/main.js            Logica (non serve modificarlo)
├── assets/               Logo, poster, favicon
└── apps-script/Code.gs   Backend da incollare in Google Apps Script
```

## 1. Backend: Google Sheet + Apps Script

1. Crea un nuovo Google Sheet (es. "bolla — prenotazioni").
2. Menu **Estensioni → Apps Script**. Cancella il codice di esempio e incolla `apps-script/Code.gs`.
3. In cima al file compila `CONFIG` (`replyTo`, `luogo`, `orario`).
4. Seleziona la funzione `setup` e premi **Esegui**. Autorizza l'accesso (foglio + invio email).
   Nascono i fogli **Serate** e **Prenotazioni**.
5. Nel foglio **Serate** imposta la `capienza` reale. `aperta` = `TRUE` apre le prenotazioni, `FALSE` le chiude.
6. **Esegui il deployment → Nuovo deployment → Tipo: App web**
   - Esegui come: **Me**
   - Chi ha accesso: **Chiunque**
7. Copia l'URL che finisce con `/exec` e incollalo in `js/config.js`, campo `apiUrl`.

Quando modifichi `Code.gs`: **Gestisci deployment → modifica (matita) → Versione: Nuova versione**.
Così l'URL resta lo stesso.

Senza `apiUrl` il sito gira in **modalità demo**: prenotazioni finte salvate solo nel browser.

### Gestire le prenotazioni

- **Annullare un pass**: nel foglio Prenotazioni scrivi `annullato` nella colonna `stato`. Il posto torna disponibile.
- **Ingresso**: filtra per codice o cognome; segna `x` nella colonna `checkin`.
- **Nuova serata**: aggiungi una riga in **Serate** e una voce in `serate` dentro `js/config.js` con lo stesso `id`.
- **Newsletter**: esegui `esportaNewsletter` dall'editor Apps Script. Il foglio **Newsletter** si riempie con un'email per riga, senza doppioni.
- **Disiscrizione**: scrivi `FALSE` nella colonna `newsletter` di tutte le prenotazioni di quella email.
- **Privacy**: 30 giorni dopo la serata lancia `esportaNewsletter`, poi cancella le righe di quella serata da Prenotazioni. Gli iscritti restano nel foglio Newsletter.
- **Newsletter facoltativa**: metti `newsletterObbligatoria: false` sia in `js/config.js` sia in `CONFIG` di `Code.gs`.

### Limiti di Google

Un account Gmail gratuito invia **100 email al giorno** con Apps Script (Google Workspace: 1500).
Oltre il limite la prenotazione viene comunque salvata e il codice compare a schermo, ma l'email non parte.

## 2. Sito su GitHub Pages con bbbbolla.it

1. Crea un repository GitHub (es. `bbbbolla`) e carica il contenuto di questa cartella.
2. Repository → **Settings → Pages** → Source: *Deploy from a branch*, branch `main`, cartella `/ (root)`.
3. Nel pannello DNS del registrar di bbbbolla.it:
   - 4 record **A** su `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - 1 record **CNAME** su `www` verso `<tuo-utente>.github.io`
4. In **Settings → Pages** scrivi `bbbbolla.it` come Custom domain. Quando il certificato è pronto, attiva **Enforce HTTPS**.

## 3. Aggiornare i contenuti

Tutto in `js/config.js`: luogo, orario, line-up, testi, info utili, contatti.
Un valore `null` mostra "in arrivo" o nasconde l'elemento.
La pagina mostra da sola la prossima serata; `bbbbolla.it/?serata=<id>` apre una serata specifica.

## Anteprima locale

```bash
python3 -m http.server 8770
```

Poi apri http://localhost:8770.
