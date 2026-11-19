import type { Translation } from '../../types';

export const tables = {
  "tables.card.dice": "Tiro: {formula}",
  "tables.card.rolled": "{die}: risultato {total}",
  "tables.copied": "Risultato copiato",
  "tables.copy": "Copia come Markdown",
  "tables.copyFailed": "Impossibile copiare il risultato",
  "tables.covered": {
    "one": "{count} risultato, tutti i numeri coperti",
    "other": "{count} risultati, tutti i numeri coperti"
  },
  "tables.die": "Tira {die}",
  "tables.empty": "Ancora nessuna tabella casuale",
  "tables.even": {
    "one": "{count} riga, con uguale probabilità",
    "other": "{count} righe, tutte con uguale probabilità"
  },
  "tables.fromNote": "Usa una tabella da una nota",
  "tables.group.items": "Oggetti",
  "tables.group.text": "Testo",
  "tables.hiddenColumn": "Visibile solo a te",
  "tables.kind.items": "Oggetti",
  "tables.kind.text": "Testo",
  "tables.loading": "Lettura delle tabelle casuali",
  "tables.newTable": "Nuova tabella",
  "tables.import.mode": "Importa file",
  "tables.import.paste": "Incolla",
  "tables.import.source": "Origine della tabella",
  "tables.import.chooseFile": "Scegli un file con tabelle",
  "tables.import.formats": "PDF, XLSX, CSV, TSV, Markdown o testo. I file vengono letti su questo dispositivo. Per le immagini, usa il riconoscimento del testo del dispositivo e incolla il testo; per i siti web, copia la tabella.",
  "tables.import.reading": "Ricerca delle tabelle",
  "tables.import.saving": "Salvataggio delle note con tabelle",
  "tables.import.found": "Tabelle rilevate",
  "tables.import.unnamed": "Tabella {number}",
  "tables.import.page": "Pagina {page}",
  "tables.import.sheet": "Foglio: {sheet}",
  "tables.import.line": "Riga {line}",
  "tables.import.check": "Importa {name}",
  "tables.import.preview": "Anteprima di {name}",
  "tables.import.nameRequired": "Nessun titolo riconoscibile trovato. Inserisci un nome prima di selezionare questa tabella.",
  "tables.import.headerRow": "La prima riga contiene le intestazioni delle colonne",
  "tables.import.empty": "Scegli un file, controlla le sue tabelle e seleziona quelle da importare.",
  "tables.import.none": "Nessuna tabella supportata trovata. Prova a copiare una tabella e usa Incolla.",
  "tables.import.save": {
    "one": "Importa {count} tabella",
    "other": "Importa {count} tabelle"
  },
  "tables.import.saveFailed": "Impossibile salvare le note con tabelle. Riprova per completare il salvataggio.",
  "tables.import.retryHint": "Alcune note sono state create. Un nuovo tentativo userà le stesse note. Chiudendo, resteranno nella cartella indicata qui sotto.",
  "tables.import.error.tooLarge": "Questo file o una delle sue tabelle supera i limiti di importazione. Usa un file più piccolo o dividi la tabella.",
  "tables.import.error.malformed": "Impossibile leggere questo file in modo sicuro. Controlla il file oppure esporta le tabelle come CSV UTF-8.",
  "tables.import.error.unsupported": "Scegli un file PDF, XLSX, CSV, TSV, Markdown o di testo.",
  "tables.import.error.password": "Questo PDF richiede una password. Importa una copia sbloccata.",
  "tables.import.error.permissions": "Questo PDF non consente l’estrazione del testo.",
  "tables.import.error.pdfUnavailable": "Impossibile caricare il lettore PDF di Obsidian. Riavvia Obsidian e riprova.",
  "tables.import.error.workbookUnsupported": "Questo foglio di calcolo usa formule, celle unite o valori numerici formattati che non possono essere importati in modo affidabile. Esporta la tabella come CSV con i valori visualizzati.",
  "tables.import.warning.pdfReview": "Confronta ogni tabella con il PDF. Il rilevamento supporta tabelle di dadi complete su una singola pagina; alcune impaginazioni e alcuni titoli potrebbero non essere riconosciuti.",
  "tables.import.warning.skippedTables": "Alcune tabelle o impaginazioni non erano leggibili senza ambiguità e sono state saltate. Copiale usando Incolla.",
  "tables.import.warning.noText": "Alcune pagine non hanno un livello di testo leggibile. Le tabelle scansionate non possono essere importate da questo PDF.",
  "tables.import.warning.pageFailed": "Alcune pagine non sono state lette. Questi risultati comprendono solo le pagine lette correttamente.",
  "tables.noMatch": "Nessuna tabella corrispondente",
  "tables.noRepeats": "Senza ripetizioni",
  "tables.noteGone": "La nota non esiste più",
  "tables.nothingToRoll": "Questa tabella non ha righe da estrarre.",
  "tables.openNote": "Apri nota",
  "tables.paste.empty": "Incolla una tabella per visualizzarla qui",
  "tables.paste.hint": "Incolla da un PDF, una pagina web, un foglio di calcolo o una tabella Markdown.",
  "tables.paste.kind": "Risultato della tabella",
  "tables.paste.moreRows": {
    "one": "{count} altra riga",
    "other": "{count} altre righe"
  },
  "tables.paste.name": "Nome",
  "tables.paste.resultColumn": "Risultato",
  "tables.paste.rollColumn": "Tiro",
  "tables.paste.save": "Salva e tira",
  "tables.paste.saveFailed": "Impossibile salvare la tabella come nota",
  "tables.paste.savedIn": "Salvata come nota in {folder}",
  "tables.paste.text": "Tabella da incollare",
  "tables.paste.untitled": "Tabella",
  "tables.problems.gap": {
    "one": "{count} intervallo scoperto",
    "other": "{count} intervalli scoperti"
  },
  "tables.problems.limit": "Troppo grande: alcune righe sono state escluse",
  "tables.problems.overlap": {
    "one": "{count} sovrapposizione",
    "other": "{count} sovrapposizioni"
  },
  "tables.problems.unreachable": {
    "one": "{count} riga non ottenibile con il dado",
    "other": "{count} righe non ottenibili con il dado"
  },
  "tables.problems.unreadable": {
    "one": "{count} numero illeggibile",
    "other": "{count} numeri illeggibili"
  },
  "tables.results": {
    "one": "{count} risultato",
    "other": "{count} risultati"
  },
  "tables.roll": "Tira",
  "tables.rename": "Rinomina",
  "tables.rollFailed": "Impossibile tirare sulla tabella",
  "tables.rollTable": "Tira su {name}",
  "tables.rolledWithResult": {
    "one": "{dice} viene tirato insieme al risultato",
    "other": "{dice} vengono tirati insieme al risultato"
  },
  "tables.saveFailed": "Impossibile salvare l’impostazione della tabella",
  "tables.search": "Cerca tabelle",
  "tables.undo": "Annulla",
  "tables.settings.addBase": "Aggiungi una base",
  "tables.settings.addNote": "Aggiungi da una nota",
  "tables.settings.addRarity": "Aggiungi rarità",
  "tables.settings.addTables": {
    "one": "Aggiungi {count} tabella",
    "other": "Aggiungi {count} tabelle"
  },
  "tables.settings.bases": "Basi del bottino",
  "tables.settings.hiddenColumns": "Visibile solo a te",
  "tables.settings.kindOf": "Risultato di {name}",
  "tables.settings.moveRarity": "Trascina per riordinare oppure usa Alt e un tasto freccia",
  "tables.settings.noTables": "Questa nota non contiene tabelle",
  "tables.settings.rarities": "Rarità degli oggetti",
  "tables.settings.rarityName": "Rarità",
  "tables.settings.readFailed": "Impossibile leggere la nota",
  "tables.settings.remove": "Non usare più questa tabella per i tiri",
  "tables.settings.removeRarity": "Rimuovi rarità",
  "tables.settings.systemRarities": "Usa le rarità del sistema",
  "tables.settings.tables": "Tabelle",
  "tables.settings.tone.none": "Nessun colore",
  "tables.settings.toneOf": "Colore di {name}",
  "tables.tableGone": "La tabella non è più nella sua nota",
  "tables.tableRenamed": "Trovata in base alla posizione come “{name}”",
  "tables.tooLarge": "La nota è troppo grande per essere letta",
  "tables.unit.items": {
    "one": "oggetto",
    "other": "oggetti"
  },
  "tables.unit.results": {
    "one": "risultato",
    "other": "risultati"
  },
  "tables.weighted": "Ponderata",
  "tables.weightedLong": {
    "one": "{count} riga, in base al peso",
    "other": "{count} righe, in base al peso"
  }
} satisfies Translation;
