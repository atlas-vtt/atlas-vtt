import type { Translation } from '../../types';

export const cleanup = {
  "cleanup.backgrounds": {
    "one": "{count} sfondo della mappa",
    "other": "{count} sfondi della mappa"
  },
  "cleanup.confirm": "Rimuovere questi riferimenti dalla mappa?",
  "cleanup.done": {
    "one": "Rimosso {count} riferimento a risorse mancanti",
    "other": "Rimossi {count} riferimenti a risorse mancanti"
  },
  "cleanup.found": "Trovati {found} che rimandano a immagini non più esistenti.",
  "cleanup.noMapData": "Impossibile accedere ai dati della mappa",
  "cleanup.nothingMissing": "Nessuna risorsa mancante trovata",
  "cleanup.title": "Rimuovi riferimenti alle risorse mancanti",
  "cleanup.tokens": {
    "one": "{count} token",
    "other": "{count} token"
  }
} satisfies Translation;
