import type { Translation } from '../../types';

export const downloads: Translation = {
  'downloads.title': 'Загрузки',
  'downloads.buttonActive': 'Загрузки, {percent} %',
  'downloads.queued': 'В очереди',
  'downloads.percent': '{percent} %',
  'downloads.cancelled': 'Отменено',
  'downloads.failed': 'Загрузка не удалась',
  'downloads.done': 'Готово · {size}',
  'downloads.amount': '{done} из {total}',
  'downloads.left': 'осталось {time}',
  'downloads.cancel': 'Отменить',
  'downloads.retry': 'Повторить',
  'downloads.show': 'Показать',
  'downloads.clear': 'Убрать завершённые',
  'downloads.reason.unavailable': 'Сервер недоступен',
  'downloads.reason.damaged': 'Файл повреждён',
  'downloads.reason.folder': 'Папка недоступна',
  'downloads.reason.disk': 'Не удалось сохранить',
  'downloads.reason.connection': 'Нет соединения',
  'downloads.finishedOne': '{title}: загружено',
  'downloads.finishedMany': { one: 'Завершена {count} загрузка', few: 'Завершены {count} загрузки', many: 'Завершено {count} загрузок', other: 'Завершено {count} загрузки' },
};
