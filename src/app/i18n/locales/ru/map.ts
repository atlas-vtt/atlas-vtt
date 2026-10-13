import type { Translation } from '../../types';

export const map: Translation = {
  'map.loading': 'Загрузка карты...',
  'map.readFailed': 'Atlas VTT не смог прочитать {file} ({reason}). Копия сохранена в {backup}.',
  'map.untitled': 'Карта без названия',
  'map.loadingShort': 'Загрузка карты...',
  'map.clearing': 'Очистка прежних данных...',
  'map.loadingImage': 'Загрузка изображения карты...',
  'map.restoring': 'Восстановление данных карты...',
  'map.loadingTokens': 'Загрузка токенов и пинов...',
  'map.alignGrid': 'Выровнять сетку',
  'map.detectingGrid': 'Поиск сетки...',
  'map.noGridFound': 'Сетка на этой карте не найдена, поэтому она не показана.',
  'map.loadingNTokens': { one: 'Загрузка {count} токена...', few: 'Загрузка {count} токенов...', many: 'Загрузка {count} токенов...', other: 'Загрузка {count} токена...' },
  'map.finalizing': 'Завершение...',
  'map.openFailed': 'Atlas VTT не смог открыть сцену {name} ({reason}).',
};
