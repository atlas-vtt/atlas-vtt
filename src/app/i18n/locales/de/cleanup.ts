import type { Translation } from '../../types';

export const cleanup: Translation = {
  'cleanup.backgrounds': { one: '{count} Kartenhintergrund', other: '{count} Kartenhintergründe' },
  'cleanup.roofs': { one: '{count} Dach', other: '{count} Dächer' },
  'cleanup.confirm': 'Diese Verweise von der Karte entfernen?',
  'cleanup.done': { one: '{count} Verweis auf ein fehlendes Asset bereinigt', other: '{count} Verweise auf fehlende Assets bereinigt' },
  'cleanup.found': '{found} gefunden, die auf nicht mehr vorhandene Bilder verweisen.',
  'cleanup.noMapData': 'Kein Zugriff auf die Kartendaten',
  'cleanup.nothingMissing': 'Keine fehlenden Assets gefunden',
  'cleanup.title': 'Fehlende Assets bereinigen',
  'cleanup.tokens': { one: '{count} Token', other: '{count} Tokens' },
};
