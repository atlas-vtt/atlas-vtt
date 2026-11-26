import type { Translation } from '../../types';

export const downloads: Translation = {
  'downloads.title': 'Download',
  'downloads.buttonActive': 'Download, {percent}%',
  'downloads.queued': 'In coda',
  'downloads.percent': '{percent}%',
  'downloads.cancelled': 'Annullato',
  'downloads.failed': 'Download non riuscito',
  'downloads.done': 'Fatto · {size}',
  'downloads.amount': '{done} di {total}',
  'downloads.left': 'mancano {time}',
  'downloads.cancel': 'Annulla',
  'downloads.retry': 'Riprova',
  'downloads.show': 'Mostra',
  'downloads.clear': 'Rimuovi completati',
  'downloads.reason.unavailable': 'Server non disponibile',
  'downloads.reason.damaged': 'Download danneggiato',
  'downloads.reason.folder': 'Cartella non disponibile',
  'downloads.reason.disk': 'Impossibile salvare',
  'downloads.reason.connection': 'Nessuna connessione',
  'downloads.finishedOne': '{title} scaricato',
  'downloads.finishedMany': { one: '{count} download completato', other: '{count} download completati' },
};
