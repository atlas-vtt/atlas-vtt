import type { Translation } from '../../types';

export const dice: Translation = {
  'dice.clearHistory': 'Очистить историю',
  'dice.clearSelection': 'Сбросить выбор',
  'dice.closeHint': 'Закрыть (Enter или Esc)',
  'dice.details': 'Подробности',
  'dice.log': 'Журнал бросков',
  'dice.noRolls': 'Бросков пока нет',
  'dice.pin': 'Закрепить панель',
  'dice.rollAgain': 'Бросить снова',
  'dice.unknown': 'Неизвестно',
  'dice.unpin': 'Открепить панель',
  'dice.player': 'Игрок',
  'dice.rollFormula': 'Бросить {formula}',
  'dice.formulaError.syntax': 'Используйте кубики и числа через + или −, например 2d6+3. У кубика от 2 до 1 000 граней, в числе не больше 4 цифр.',
  'dice.formulaError.length': 'В формуле броска может быть не больше 64 символов.',
  'dice.formulaError.terms': 'В формуле броска может быть не больше 10 слагаемых.',
  'dice.formulaError.dice': 'Формула может бросать не больше 100 кубиков, не считая взрывов.',
  'dice.formulaError.faces': 'У кубика должно быть от 2 до 1 000 граней.',
};
