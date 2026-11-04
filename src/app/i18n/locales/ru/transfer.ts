import type { Translation } from '../../types';

export const transfer: Translation = {
  'transfer.andScenes': { one: '{what} и {count} связанная сцена', few: '{what} и {count} связанные сцены', many: '{what} и {count} связанных сцен', other: '{what} и {count} связанной сцены' },
  'transfer.copied': 'Скопировано в «{target}»: {what}',
  'transfer.copy.withScenes': { one: 'Копировать с {count} связанной сценой', few: 'Копировать с {count} связанными сценами', many: 'Копировать с {count} связанными сценами', other: 'Копировать с {count} связанной сцены' },
  'transfer.copy.withoutLinks': 'Копировать без ссылок',
  'transfer.copyFailed': 'Не удалось скопировать ({what}): {error}',
  'transfer.linked.copy': { one: '{subject}: ссылается на ещё {count} сцену коллекции — {names}.', few: '{subject}: ссылается на ещё {count} сцены коллекции — {names}.', many: '{subject}: ссылается на ещё {count} сцен коллекции — {names}.', other: '{subject}: ссылается на ещё {count} сцены коллекции — {names}.' },
  'transfer.linked.move': { one: '{subject}: связана ещё {count} сцена коллекции — {names}.', few: '{subject}: связаны ещё {count} сцены коллекции — {names}.', many: '{subject}: связаны ещё {count} сцен коллекции — {names}.', other: '{subject}: связаны ещё {count} сцены коллекции — {names}.' },
  'transfer.linked.rule': 'Сцены ссылаются только на сцены своей коллекции. Возьмите связанные сцены в «{target}», чтобы сохранить ссылки, или уберите ссылки.',
  'transfer.linked.title': 'Связанные сцены',
  'transfer.move.withScenes': { one: 'Переместить с {count} связанной сценой', few: 'Переместить с {count} связанными сценами', many: 'Переместить с {count} связанными сценами', other: 'Переместить с {count} связанной сцены' },
  'transfer.move.withoutLinks': 'Переместить без ссылок',
  'transfer.moveFailed': 'Не удалось переместить ({what}): {error}',
  'transfer.moved': 'Перемещено в «{target}»: {what}',
  'transfer.selection': 'Выбранное',
};
