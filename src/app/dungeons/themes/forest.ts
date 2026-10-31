/**
 * The Forest: glades in the woods, as Watabou's Glade view reads a cave. A Cavern's layout (its
 * chambers are the clearings, its passages the trails, its rock the woods, a rock island a copse)
 * whose entry floor is drawn as a forest (`forestFloor`), and whose floors below are caves, reached
 * from a clearing. Nature builds no ruins, a wood hides no secret rooms and holds no lava or acid.
 */

import type { DungeonParams } from '../params';
import { CAVERN } from './cavern';
import type { ThemeDefinition } from './themeTypes';

/** A Cavern's params without secret doors: every way through the woods lies open. */
function forestParams(params: DungeonParams): DungeonParams {
  const cave = CAVERN.params!(params);
  return { ...cave, secretWings: { chance: 0, extra: 0 }, secretLoopChance: 0, secretEntranceWeight: 0, secretReward: 0 };
}

export const FOREST: ThemeDefinition = {
  ...CAVERN,
  id: 'forest',
  ignores: [...CAVERN.ignores, 'secret', 'no-secrets'],
  // A wood holds no molten rock: its glades are no volcano's.
  refuses: [...CAVERN.refuses, { tag: 'lava' }, { tag: 'acid' }],
  params: forestParams,
};
