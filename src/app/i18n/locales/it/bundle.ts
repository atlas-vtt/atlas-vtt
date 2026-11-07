import type { Translation } from '../../types';

export const bundle = {
  "bundle.backedUp": " I file sostituiti sono stati salvati come backup in {folder}.",
  "bundle.checking": "Verifica della collezione…",
  "bundle.exportFailed": "Esportazione non riuscita",
  "bundle.exported": "Collezione esportata",
  "bundle.exporting": "Esportazione della collezione",
  "bundle.filesRemoved": {
    "one": "{count} file rimosso",
    "other": "{count} file rimossi"
  },
  "bundle.filesWritten": {
    "one": "{count} file scritto",
    "other": "{count} file scritti"
  },
  "bundle.switchedNotes": {
    "one": "{count} blocco statistiche ora usa le copie dei modelli.",
    "other": "{count} blocchi statistiche ora usano le copie dei modelli."
  },
  "bundle.group.encounters": "Incontri",
  "bundle.group.maps": "Mappe",
  "bundle.group.notes": "Note",
  "bundle.group.scenes": "Scene",
  "bundle.group.statblocks": "Blocchi statistiche",
  "bundle.group.templates": "Modelli dei blocchi statistiche",
  "bundle.group.tokens": "Token",
  "bundle.importFailed": "Importazione non riuscita",
  "bundle.imported": "{name} importata.",
  "bundle.importedTitle": "Collezione importata",
  "bundle.importing": "Importazione della collezione",
  "bundle.keptLocal": {
    "one": "{count} elemento mantenuto nella tua versione",
    "other": "{count} elementi mantenuti nella tua versione"
  },
  "bundle.nameTaken": "Esiste già una collezione chiamata “{name}”.",
  "bundle.nameVersion": "“{name}” v{version}",
  "bundle.packed": "“{name}” v{version} ({assets}, {files}) compressa in {file}.",
  "bundle.preparing": "Preparazione…",
  "bundle.reading": "Lettura del pacchetto…",
  "bundle.recordFailed": "{packed} Impossibile registrare la versione in questo vault ({error}). Esporta di nuovo prima di condividere un’altra versione.",
  "bundle.updated": "{name} aggiornata: {parts}.{backup}",
  "bundle.updatedTitle": "Collezione aggiornata",
  "bundle.writing": "Scrittura…",
  "bundle.comparing": "Confronto con il vault…",
  "bundle.ready": "Pronto",
  "bundle.registering": "Registrazione delle risorse…",
  "bundle.done": "Completato",
  "bundle.compressing": "Compressione…",
  "bundle.step.writing": "Scrittura di {n} file su {total}…",
  "bundle.step.cleaning": "Pulizia di {n} file su {total}…",
  "bundle.step.adding": "Aggiunta di {n} file su {total}…",
  "bundle.step.checking": "Verifica di {n} file su {total}…",
  "bundle.notExport": "Questo file non è una collezione esportata da Atlas.",
  "bundle.tooNew": "Questa collezione è stata esportata da una versione più recente di Atlas. Aggiorna Atlas per importarla.",
  "bundle.tooOld": "Questa collezione esportata è troppo vecchia per essere importata.",
  "bundle.damaged": "Questa collezione esportata è danneggiata.",
  "bundle.unsafe": "Questa collezione esportata contiene un file che Atlas non scriverà: {path}",
  "bundle.checksum": {
    "one": "Questa collezione esportata è danneggiata: la somma di controllo di {count} file non corrisponde ({names}). Nessun contenuto importato.",
    "other": "Questa collezione esportata è danneggiata: le somme di controllo di {count} file non corrispondono ({names}). Nessun contenuto importato."
  }
} satisfies Translation;
