import { EventEmitter } from 'node:events';
import type { RollingDice } from '../../../../src/app/types/diceSetTypes';
import type { DiceRules } from '../../../../src/app/types/diceRulesTypes';
import type { DiceRollResult } from '../../../../src/app/types/diceTypes';
import type { DiceSource } from '../../../../src/app/online/gm/atlasDice.ts';

/**
 * Where Atlas's real dice tool comes from, which each test file imports by this computed path, so the
 * type checker does not follow it: the module imports Node's `events`, which would make the vendor's
 * Node types part of this repository's.
 */
export const DICE_TOOL = '../../../../src/app/tools/DiceTool';

interface DiceRollInputs {
  random(): number;
  rollId(): string;
  roller(): string;
  onFormulaError(error: { readonly code: string }): void;
}
/** Atlas's `DiceTool` class, as far as these tests use it. */
export type DiceToolClass = new (bus: EventEmitter, rules: () => DiceRules | RollingDice, inputs: DiceRollInputs) => Pick<DiceSource, 'rollDice'> & { getDiceRules(): DiceRules | RollingDice };

export interface RealDice {
  /** The tab's dice as the companion sees them: Atlas's dice tool and the bus it announces rolls on. */
  readonly dice: DiceSource;
  /** Every roll announced, in order. */
  readonly rolled: DiceRollResult[];
  /** The formula errors the tool reported (Atlas would show each as a notice on the GM's screen). */
  readonly errors: string[];
}

/** An Atlas map tab's dice: Atlas's real `DiceTool` on an `EventEmitter`, rolling by `rules` with `random`. */
export function realDice(DiceTool: DiceToolClass, rules: DiceRules | RollingDice, random: () => number, viewId = 'view-1'): RealDice {
  const bus = new EventEmitter();
  const errors: string[] = [];
  let ids = 0;
  const tool = new DiceTool(bus, () => rules, { random, rollId: () => `roll_${(ids += 1)}`, roller: () => 'Player', onFormulaError: (error) => errors.push(error.code) });
  const rolled: DiceRollResult[] = [];
  bus.on('dice-rolled', (result: DiceRollResult) => rolled.push(result));
  return {
    rolled, errors,
    dice: { viewId, rollDice: (formula, source, origin, options) => tool.rollDice(formula, source, origin, options), rules: () => tool.getDiceRules(), on: (event, listener) => bus.on(event, listener), off: (event, listener) => bus.off(event, listener) },
  };
}
