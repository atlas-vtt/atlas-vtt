import type { Translation } from '../../types';

export const downloads: Translation = {
  'downloads.title': 'Descargas',
  'downloads.buttonActive': 'Descargas, {percent} %',
  'downloads.queued': 'En cola',
  'downloads.percent': '{percent} %',
  'downloads.cancelled': 'Cancelada',
  'downloads.failed': 'La descarga falló',
  'downloads.done': 'Lista · {size}',
  'downloads.amount': '{done} de {total}',
  'downloads.left': 'quedan {time}',
  'downloads.cancel': 'Cancelar',
  'downloads.retry': 'Reintentar',
  'downloads.show': 'Mostrar',
  'downloads.clear': 'Borrar terminadas',
  'downloads.reason.unavailable': 'Servidor no disponible',
  'downloads.reason.damaged': 'Descarga dañada',
  'downloads.reason.folder': 'Carpeta no disponible',
  'downloads.reason.disk': 'No se pudo guardar',
  'downloads.reason.connection': 'Sin conexión',
  'downloads.finishedOne': '{title} descargado',
  'downloads.finishedMany': { one: '{count} descarga terminada', other: '{count} descargas terminadas' },
};
