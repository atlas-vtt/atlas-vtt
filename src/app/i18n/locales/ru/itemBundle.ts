import type { Translation } from '../../types';

export const itemBundle: Translation = {
  'itemBundle.notItem': 'Этот файл не является экспортом Atlas.',
  'itemBundle.tooNew': 'Этот файл экспортирован более новой версией Atlas. Обновите Atlas, чтобы импортировать его.',
  'itemBundle.damaged': 'Этот файл повреждён.',
  'itemBundle.unsafe': 'В этом файле есть файл, который Atlas не станет записывать: {path}',
  'itemBundle.builtIn': 'Встроенное в Atlas уже есть в каждом хранилище, поэтому им не делятся.',
  'itemBundle.missing': 'Этого больше нет в хранилище.',
  'itemBundle.unreadable': 'Не удалось прочитать этот шаблон.',
  'itemBundle.exported': '{name} — сохранено в {file}.',
  'itemBundle.exportFailed': 'Не удалось экспортировать: {reason}',
};
