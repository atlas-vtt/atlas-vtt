import type { Translation } from '../../types';

export const openings: Translation = {
  'openings.mode': 'Проёмы',
  'openings.needsLevels': 'Сквозь проём виден уровень ниже: сначала добавьте сцене уровень',
  'openings.title': 'Проём',
  'openings.kind': 'Что это за область',
  'openings.open': 'Открыто вниз',
  'openings.floor': 'Пол',
  'openings.chasm': 'Ниже этого уровня ничего нет: проём чёрный, а токены, поставленные в него, остаются на месте.',
  'openings.full': 'На уровне может быть не больше {count} проёмов и полов. Удалите часть, чтобы рисовать новые.',
  'openings.fell': { one: '{count} токен провалился на {name}', few: '{count} токена провалились на {name}', many: '{count} токенов провалились на {name}', other: '{count} токена провалились на {name}' },
};
