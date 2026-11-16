# Video per la pagina Vibes

Strumenti Swift (niente ffmpeg sul Mac). Compilare una volta, fuori dal repo:

    swiftc -O tools/video/stabilizza.swift -o /tmp/stabilizza
    swiftc -O tools/video/fotogrammi.swift -o /tmp/fotogrammi

- `fotogrammi in.mp4 foglio.jpg 24`: foglio con 24 fotogrammi, per decidere i tagli.
- `stabilizza in.mp4 out.mp4 [opzioni]`: taglia, stabilizza (Vision, traslazione), zooma al centro, schiarisce e scrive H.264 + AAC con moov in testa.

Opzioni usate il 16.11 (13.11):

    # Pixel 4K 60 fps -> 720x1280 30 fps
    stabilizza in.mp4 out.mp4 w=720 h=1280 fps=30 bitrate=3000000 zoom=1.15 smooth=1.0 nr=0.02 sharp=0.3 ev=0.2 shadows=0.35 poster=out.jpg posterAt=1.0
    # WhatsApp 576x1024: resta 576x1024 (inutile ingrandire)
    stabilizza in.mp4 out.mp4 w=576 h=1024 fps=25 bitrate=2200000 zoom=1.15 smooth=1.0 nr=0.03 sharp=0.3 ev=0.45 shadows=0.5 poster=out.jpg

- `keep=0-4.5,6-10.1`: tiene solo questi intervalli (secondi), con dissolvenza audio breve ai tagli.
- `ev`, `shadows`, `sat`, `vib`, `contrast`: luce e colore. `nr` riduzione rumore, `sharp` nitidezza.
- `smooth`: secondi di lisciatura del movimento; `zoom`: margine per la stabilizzazione.
- `analyze=only`: stampa solo il tremolio stimato. `orient=0` per video già dritti (es. un output).
- I video del telefono sono girati in verticale con rotazione nei metadati: lo strumento li raddrizza (`.right`).
