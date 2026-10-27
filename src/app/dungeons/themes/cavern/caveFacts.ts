/**
 * The Cavern's facts as the room assignment and the furnishing ask them: the rules of its types
 * (`caveTypeRules.ts`), which rooms suit a type best, and where its formations form
 * (`formations.ts`).
 */

import { caveSites } from '../../layout/cavern/caveSites';
import type { ThemeFacts, ThemeFactsInput } from '../themeTypes';
import { type CaveFacts, allowsType, caveFacts } from './caveTypeRules';
import { formationAllowed, formationRichness } from './formations';

export { type CaveFacts, caveFacts } from './caveTypeRules';

export function cavernThemeFacts(facts: CaveFacts): ThemeFacts {
  return {
    allows: (type, ref) => allowsType(facts, type, ref),
    score: (type, ref) => {
      if (type === 'lake-cavern' && facts.sites[ref.floor]?.deepest) return 2;
      if (type === 'crystal-grotto' && facts.floors[ref.floor]?.cave?.basins.includes(ref.room)) return 1;
      // A lava cave shows its lava, an acid cave its spring, wherever they may lie.
      if (type === 'lava-tube' || type === 'sulphur-spring') return 3;
      return 0;
    },
    placeAllowed: (kind, at, ref) => formationAllowed(kind, at, ref, facts),
    richness: (ref) => formationRichness(ref, facts),
  };
}

/** The Cavern's facts from the floors assignment receives. */
export function cavernFacts(input: ThemeFactsInput): ThemeFacts {
  return cavernThemeFacts(caveFacts(input, caveSites(input.floors)));
}
