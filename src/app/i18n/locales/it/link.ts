import type { Translation } from '../../types';

export const link = {
  "link.notFound": "Statblock non trovato: {path}",
  "link.linked": "Token collegato allo statblock",
  "link.moved": "{token} ora è collegato a questo statblock anziché a {previous}",
  "link.unlinked": "Token scollegato dallo statblock",
  "link.created": "Token creato da {name}",
  "link.noneCreated": "Nessun token creato.",
  "link.importFailed": "Impossibile importare questo statblock.",
  "link.unknown": "Sconosciuto"
} satisfies Translation;
