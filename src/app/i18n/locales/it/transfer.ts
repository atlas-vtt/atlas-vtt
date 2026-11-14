import type { Translation } from '../../types';

export const transfer = {
  "transfer.andScenes": {
    "one": "{what} e {count} scena collegata",
    "other": "{what} e {count} scene collegate"
  },
  "transfer.copied": "Copia di {what} in {target} completata",
  "transfer.copy.withScenes": {
    "one": "Copia con {count} scena collegata",
    "other": "Copia con {count} scene collegate"
  },
  "transfer.copy.withoutLinks": "Copia senza collegamenti",
  "transfer.copyFailed": "Impossibile copiare {what}: {error}",
  "transfer.linked.copy": {
    "one": "{subject} rimanda a un’altra scena di questa collezione: {names}.",
    "other": "{subject} rimanda ad altre {count} scene di questa collezione: {names}."
  },
  "transfer.linked.move": {
    "one": "{subject} è collegato a un’altra scena di questa collezione: {names}.",
    "other": "{subject} è collegato ad altre {count} scene di questa collezione: {names}."
  },
  "transfer.linked.rule": "Le scene possono collegarsi solo a scene della propria collezione. Porta le scene collegate in {target} per mantenere i collegamenti oppure rimuovili.",
  "transfer.linked.title": "Scene collegate",
  "transfer.move.withScenes": {
    "one": "Sposta con {count} scena collegata",
    "other": "Sposta con {count} scene collegate"
  },
  "transfer.move.withoutLinks": "Sposta senza collegamenti",
  "transfer.moveFailed": "Impossibile spostare {what}: {error}",
  "transfer.moved": "Spostamento di {what} in {target} completato",
  "transfer.selection": "La selezione"
} satisfies Translation;
