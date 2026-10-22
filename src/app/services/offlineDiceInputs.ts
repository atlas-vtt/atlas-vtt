import { t } from '../i18n';
import type { DiceRollInputs } from '../tools/DiceTool';
import { showNotice } from '../ui/notice';

/** The local roller's random stream: dice, initiative and hit points joining a scene all roll with it. */
export const diceRandom = (): number => Math.random();

/** Keep the local roller's random stream, id format and label at the plugin boundary. */
export function offlineDiceInputs(): DiceRollInputs {
  return {
    random: diceRandom,
    rollId: (): string => `roll_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    roller: (): string => t('dice.player'),
    onFormulaError: (error): void => { showNotice(t(`dice.formulaError.${error.code}`)); },
  };
}
