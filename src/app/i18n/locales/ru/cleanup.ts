import type { Translation } from '../../types';

export const cleanup: Translation = {
  'cleanup.backgrounds': { one: '{count} фон карты', few: '{count} фона карты', many: '{count} фонов карты', other: '{count} фона карты' },
  'cleanup.confirm': 'Убрать эти ссылки с карты?',
  'cleanup.done': { one: 'Убрана {count} ссылка на отсутствующий ресурс', few: 'Убрано {count} ссылки на отсутствующие ресурсы', many: 'Убрано {count} ссылок на отсутствующие ресурсы', other: 'Убрано {count} ссылки на отсутствующие ресурсы' },
  'cleanup.found': 'Найдено: {found}. Их изображений больше нет.',
  'cleanup.noMapData': 'Нет доступа к данным карты',
  'cleanup.nothingMissing': 'Отсутствующих ресурсов нет',
  'cleanup.title': 'Убрать отсутствующие ресурсы',
  'cleanup.tokens': { one: '{count} токен', few: '{count} токена', many: '{count} токенов', other: '{count} токена' },
  'cleanup.roofs': { one: '{count} крыша', few: '{count} крыши', many: '{count} крыш', other: '{count} крыши' },
};
