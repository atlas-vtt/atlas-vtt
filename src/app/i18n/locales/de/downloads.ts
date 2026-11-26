import type { Translation } from '../../types';

export const downloads: Translation = {
  'downloads.title': 'Downloads',
  'downloads.buttonActive': 'Downloads, {percent} %',
  'downloads.queued': 'Wartet',
  'downloads.percent': '{percent} %',
  'downloads.cancelled': 'Abgebrochen',
  'downloads.failed': 'Download fehlgeschlagen',
  'downloads.done': 'Fertig · {size}',
  'downloads.amount': '{done} von {total}',
  'downloads.left': 'noch {time}',
  'downloads.cancel': 'Abbrechen',
  'downloads.retry': 'Erneut versuchen',
  'downloads.show': 'Zeigen',
  'downloads.clear': 'Fertige entfernen',
  'downloads.reason.unavailable': 'Server nicht erreichbar',
  'downloads.reason.damaged': 'Download beschädigt',
  'downloads.reason.folder': 'Ordner nicht verfügbar',
  'downloads.reason.disk': 'Speichern fehlgeschlagen',
  'downloads.reason.connection': 'Keine Verbindung',
  'downloads.finishedOne': '{title} heruntergeladen',
  'downloads.finishedMany': { one: '{count} Download fertig', other: '{count} Downloads fertig' },
};
