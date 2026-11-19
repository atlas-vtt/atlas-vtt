import type { Translation } from '../../types';

export const map: Translation = {
  'map.loading': 'Karte wird geladen…',
  'map.readFailed': 'Atlas VTT konnte {file} nicht lesen ({reason}). Eine Kopie liegt unter {backup}.',
  'map.untitled': 'Unbenannte Karte',
  'map.loadingShort': 'Karte wird geladen…',
  'map.clearing': 'Vorherige Daten werden entfernt…',
  'map.loadingImage': 'Kartenbild wird geladen…',
  'map.processing': 'Karte wird verarbeitet · {percent} %',
  'map.restoring': 'Kartendaten werden wiederhergestellt…',
  'map.loadingTokens': 'Tokens und Pins werden geladen…',
  'map.alignGrid': 'Raster ausrichten',
  'map.detectingGrid': 'Raster wird erkannt…',
  'map.loadingNTokens': { one: '{count} Token wird geladen…', other: '{count} Tokens werden geladen…' },
  'map.finalizing': 'Wird abgeschlossen…',
  'map.noGridFound': 'Auf dieser Karte wurde kein Raster gefunden, daher wird keins gezeigt.',
  'map.openFailed': 'Atlas VTT konnte die Szene {name} nicht öffnen ({reason}).',
  'map.syncLeavesOutFiles': 'Obsidian Sync lässt Atlas-Szenen und -Karten auf diesem Gerät aus. Damit sie mitkommen, schalte auf jedem Gerät unter Einstellungen → Synchronisierung „Alle anderen Dateitypen synchronisieren“ ein.',
  'map.imageUnshown': 'Atlas VTT konnte das Kartenbild {file} nicht anzeigen. {reason}',
  'map.videoTooLarge': 'Die animierte Karte {file} ist {width} × {height} px groß und damit größer, als dieses Gerät abspielen kann ({side} px pro Seite). Sie zeigt ihr erstes Bild.',
  'map.videoUnplayable': 'Die animierte Karte {file} kann hier nicht abgespielt werden und zeigt daher ihr erstes Bild. {reason}',
};
