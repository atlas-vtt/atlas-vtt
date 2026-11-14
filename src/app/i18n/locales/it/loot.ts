import type { Translation } from '../../types';

export const loot = {
  "loot.card.openNote": "Apri la nota di {name}",
  "loot.close": "Chiudi tabelle casuali",
  "loot.closeWindow": "Chiudi finestra del bottino",
  "loot.count": "Quantità da estrarre",
  "loot.draws": {
    "one": "Estrae {items} da {count} oggetto, con uguale probabilità.",
    "other": "Estrae {items} da {count} oggetti, tutti con uguale probabilità."
  },
  "loot.empty.basesOff": "Bases è disattivato",
  "loot.empty.basesOffBody": "Le basi del bottino della collezione vengono lette tramite Obsidian Bases. Attiva il plugin principale Bases nelle impostazioni di Obsidian, poi riavvia Obsidian.",
  "loot.empty.noCollection": "Questa mappa non è in una collezione",
  "loot.empty.noCollectionBody": "Le tabelle casuali appartengono a una collezione. Sposta la mappa in una collezione per tirare sulle sue tabelle.",
  "loot.fewer": "Estrai meno",
  "loot.give.done": "{item} consegnato a {name}",
  "loot.give.failed": "Impossibile consegnare {item} a {name}",
  "loot.give.label": "Consegna al giocatore",
  "loot.give.noCharacter": "Nessun personaggio",
  "loot.history.empty": "Qui vengono conservati i tiri di tutte le mappe di questa collezione",
  "loot.history.remove": "Rimuovi questo tiro",
  "loot.items": {
    "one": "{count} oggetto",
    "other": "{count} oggetti"
  },
  "loot.more": "Estrai di più",
  "loot.noteGone": "La nota di {name} non esiste più",
  "loot.nothingToRoll": "Seleziona una vista o riattiva una rarità per avere oggetti da estrarre.",
  "loot.openFailed": "Impossibile aprire la nota",
  "loot.panel": "Tabelle casuali",
  "loot.rarities": "Rarità da estrarre",
  "loot.rarity.common": "Comune",
  "loot.rarity.epic": "Epico",
  "loot.rarity.legendary": "Leggendario",
  "loot.rarity.rare": "Raro",
  "loot.rarity.uncommon": "Non comune",
  "loot.rarityOff": {
    "one": "{count} oggetto di rarità {rarity} escluso dai tiri. Fai clic per includerlo di nuovo.",
    "other": "{count} oggetti di rarità {rarity} esclusi dai tiri. Fai clic per includerli di nuovo."
  },
  "loot.rarityOn": {
    "one": "{count} oggetto di rarità {rarity} nelle viste selezionate. Fai clic per escluderlo dai tiri.",
    "other": "{count} oggetti di rarità {rarity} nelle viste selezionate. Fai clic per escluderli dai tiri."
  },
  "loot.received": "Bottino ricevuto",
  "loot.results.empty": "I risultati dei tiri appaiono qui",
  "loot.roll": "Genera bottino",
  "loot.tabs.clear": "Cancella cronologia",
  "loot.tabs.clearHint": "Rimuove tutti i tiri di questa collezione, per tutte le sue mappe.",
  "loot.tabs.history": "Cronologia",
  "loot.tabs.historyHint": "Tutti i tiri di questa collezione, da tutte le sue mappe.",
  "loot.tabs.latest": "Ultimo tiro",
  "loot.tabs.latestHint": "L’ultimo tiro su questa mappa.",
  "loot.tabs.list": "Tiri",
  "loot.title": "Tabelle casuali",
  "loot.tree.all": "Tutte",
  "loot.tree.none": "Nessuna",
  "loot.tree.tickAll": "Seleziona tutte le viste di questa base.",
  "loot.tree.untickAll": "Deseleziona tutte le viste di questa base.",
  "loot.openPlayerView": "Apri la vista giocatori per mostrare loro il bottino.",
  "loot.query.note": "Atlas legge questa vista per il generatore di bottino. Apri il generatore su una mappa per effettuare un tiro.",
  "loot.query.name": "Bottino di Atlas"
} satisfies Translation;
