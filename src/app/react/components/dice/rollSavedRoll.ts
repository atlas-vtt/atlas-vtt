import type { DiceTool } from '../../../tools/DiceTool';
import type { DicePreset } from '../../../types/dicePresetTypes';
import type { AdvantageSide } from '../../../types/diceSetTypes';
import { presetSet } from './presetLook';

/** Rolls a saved roll through `diceTool`, as the tray does: a formula as written, designed dice as their own set (its names, colours and rules). */
export function rollSavedRoll(diceTool: Pick<DiceTool, 'rollDice'>, preset: DicePreset, side: AdvantageSide | null = null): void {
  const set = presetSet(preset);
  // A side the set has no rule for rolls as it is.
  const advantage = side && (!set || set[side]) ? side : undefined;
  diceTool.rollDice(preset.formula, undefined, undefined, { ...(set && { set }), ...(advantage && { advantage }) });
}
