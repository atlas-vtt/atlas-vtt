import type { Translation } from '../../types';

export const encounter: Translation = {
  'encounter.saveTitle': 'Сохранить как стычку',
  'encounter.createWith': { one: 'Создать стычку с {count} токеном:', few: 'Создать стычку с {count} токенами:', many: 'Создать стычку с {count} токенами:', other: 'Создать стычку с {count} токена:' },
  'encounter.tokens': 'Токены:',
  'encounter.namePlaceholder': 'Название стычки...',
  'encounter.defaultName': 'Стычка {date}',
  'encounter.save': 'Сохранить стычку',
  'encounter.noTokens': 'Нет токенов для стычки',
  'encounter.description': { one: 'Стычка с {count} токеном', few: 'Стычка с {count} токенами', many: 'Стычка с {count} токенами', other: 'Стычка с {count} токена' },
  'encounter.descriptionRange': { one: 'Стычка с {range} токеном', few: 'Стычка с {range} токенами', many: 'Стычка с {range} токенами', other: 'Стычка с {range} токена' },
  'encounter.saved': 'Стычка «{name}» сохранена!',
  'encounter.saveFailed': 'Не удалось сохранить стычку',
  'encounter.noImage': 'У выбранных токенов нет изображения, их нельзя сохранить как стычку',
};
