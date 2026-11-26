import type { Translation } from '../../types';

export const downloads: Translation = {
  'downloads.title': 'Downloads',
  'downloads.buttonActive': 'Downloads, {percent}%',
  'downloads.queued': 'Na fila',
  'downloads.percent': '{percent}%',
  'downloads.cancelled': 'Cancelado',
  'downloads.failed': 'Falha no download',
  'downloads.done': 'Concluído · {size}',
  'downloads.amount': '{done} de {total}',
  'downloads.left': 'faltam {time}',
  'downloads.cancel': 'Cancelar',
  'downloads.retry': 'Tentar de novo',
  'downloads.show': 'Mostrar',
  'downloads.clear': 'Limpar concluídos',
  'downloads.reason.unavailable': 'Servidor indisponível',
  'downloads.reason.damaged': 'Download corrompido',
  'downloads.reason.folder': 'Pasta indisponível',
  'downloads.reason.disk': 'Não foi possível salvar',
  'downloads.reason.connection': 'Sem conexão',
  'downloads.finishedOne': '{title} baixado',
  'downloads.finishedMany': { one: '{count} download concluído', other: '{count} downloads concluídos' },
};
