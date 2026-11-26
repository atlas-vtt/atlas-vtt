import type { Translation } from '../../types';

export const map = {
  "map.loading": "Caricamento della mappa…",
  "map.readFailed": "Atlas VTT non ha potuto leggere {file} ({reason}). Una copia è stata conservata in {backup}.",
  "map.untitled": "Mappa senza titolo",
  "map.loadingShort": "Caricamento della mappa…",
  "map.clearing": "Rimozione dei dati precedenti…",
  "map.loadingImage": "Caricamento dell’immagine della mappa…",
  "map.restoring": "Ripristino dei dati della mappa…",
  "map.loadingTokens": "Caricamento di token e segnaposto…",
  "map.alignGrid": "Allinea la griglia",
  "map.detectingGrid": "Rilevamento della griglia…",
  "map.loadingNTokens": {
    "one": "Caricamento di {count} token…",
    "other": "Caricamento di {count} token…"
  },
  "map.finalizing": "Completamento…",
  "map.noGridFound": "Non è stata rilevata alcuna griglia su questa mappa, quindi non ne viene mostrata nessuna.",
  "map.openFailed": "Atlas VTT non ha potuto aprire la scena {name} ({reason}).",
  "map.imageUnshown": "Atlas VTT non ha potuto mostrare l’immagine della mappa {file}. {reason}",
  "map.processing": "Elaborazione della mappa · {percent}%",
  "map.syncLeavesOutFiles": "Obsidian Sync esclude le scene e le mappe di Atlas su questo dispositivo. Per sincronizzarle, attiva \"Sincronizza tutti gli altri tipi\" in Impostazioni → Sincronizzazione su ogni dispositivo.",
  "map.videoTooLarge": "La mappa animata {file} misura {width} × {height} px, più di quanto questo dispositivo possa riprodurre ({side} px per lato). Ne viene mostrato il primo fotogramma.",
  "map.videoUnplayable": "La mappa animata {file} non può essere riprodotta qui, quindi ne viene mostrato il primo fotogramma. {reason}",
} satisfies Translation;
