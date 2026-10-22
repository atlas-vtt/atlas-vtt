import type { Translation } from '../../types';

export const diceLab: Translation = {
  'diceLab.defaultDice': 'Кубики по умолчанию',
  'diceLab.critNatural': 'Натуральный',
  'diceLab.critRollUnder': 'Бросок «не выше»',
  'diceLab.critDoubles': 'Дубли',
  'diceLab.critHighTotal': 'Высокая сумма',
  'diceLab.critNone': 'Нет',
  'diceLab.critNoneHint': 'Броски никогда не бывают критическими.',
  'diceLab.explodeOff': 'Выкл.',
  'diceLab.explodeDefault': 'Кубики по умолчанию',
  'diceLab.explodeAll': 'Все кубики',
  'diceLab.explodeOffHint': 'Ни один кубик не перебрасывается. Отдельный бросок всё равно может взорваться: поставьте ! после кубиков, например 2d6! (один раз) или 2d6!i (снова и снова).',
  'diceLab.explodeRepeats': 'Новые кубики тоже взрываются',
  'diceLab.explodeRepeatsHint': 'Кубик, брошенный за взрыв, может взорваться сам, до десяти раз подряд.',
  'diceLab.explodeSubtractsHint': 'Кубик d{sides}, на котором выпало {faces}, бросается снова, и новый кубик вычитается из броска.',
  'diceLab.explodeMoreFaces': 'Взрыв на нескольких гранях',
  'diceLab.explodeHighFaces': 'Сколько старших граней взрывается',
  'diceLab.explodeLowFaces': 'Сколько младших граней вычитается',
  'diceLab.facesOn': 'На d{sides}: {faces}.',
};
