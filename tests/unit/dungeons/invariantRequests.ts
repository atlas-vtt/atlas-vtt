import type { DungeonRequest } from '../../../src/app/dungeons/model';
import type { ThemeId } from '../../../src/app/dungeons/themes/themeTypes';
import { dungeonSeeds } from '../../helpers/dungeonSeeds';

/**
 * The requests the generator's invariants run, shared with the perf project, which times the same
 * dungeons the rules hold over. A quick run takes the first seeds of the full sequence.
 */

/** Seeds of every theme's invariants per floor count, each with two tag sets (`invariantRuns.ts`). */
export const INVARIANT_SEEDS = dungeonSeeds(1000, 250);
const INVARIANT_TAG_SETS: readonly string[][] = [
  [],
  ['small'],
  ['large'],
  ['medium', 'ordered', 'colonnades', 'overgrown'],
  ['chaotic', 'winding', 'wet'],
  ['string', 'deep', 'flooded'],
  ['secret', 'round', 'overgrown'],
  ['no-secrets', 'square', 'flat', 'dry', 'compact'],
  ['cramped', 'crumbling', 'large'],
];
// A Haunted Mansion is a house, held by its own rules (`house/houseInvariants.test.ts`).
export const INVARIANT_THEMES: readonly ThemeId[] = ['fortress', 'cavern'];

/** Two requests a seed; the theme turns once per round of tag sets, so every theme meets every set. */
export function invariantRequests(floors: number, seeds: number = INVARIANT_SEEDS): DungeonRequest[] {
  const out: DungeonRequest[] = [];
  for (let k = 1; k <= seeds; k++) {
    const seed = k * 7919 + floors;
    for (const offset of [0, 4]) {
      const tags = INVARIANT_TAG_SETS[(k + offset) % INVARIANT_TAG_SETS.length] ?? [];
      const theme = INVARIANT_THEMES[Math.floor((k + offset) / INVARIANT_TAG_SETS.length) % INVARIANT_THEMES.length]!;
      out.push({ seed, tags, floors, theme });
    }
  }
  return out;
}

/** Seeds of a Cavern's invariants per floor count, each with two tag sets (`caveInvariants.ts`). */
export const CAVE_SEEDS = dungeonSeeds(400, 100);
/** Five-room caves held besides on one floor, one tag set each. */
export const FIVE_ROOM_CAVE_SEEDS = dungeonSeeds(200, 50);
const CAVE_TAG_SETS: readonly string[][] = [
  [],
  ['small'],
  ['large'],
  ['lava', 'deep'],
  ['wet', 'winding'],
  ['flooded', 'spacious'],
  ['cramped', 'compact', 'dry'],
  ['string', 'no-secrets'],
  ['acid', 'overgrown'],
  ['overgrown', 'wet'],
  ['inhabited', 'wet'],
];

export function caveRequests(floors: number, fiveRoom: boolean, seeds: number = fiveRoom ? FIVE_ROOM_CAVE_SEEDS : CAVE_SEEDS): DungeonRequest[] {
  const out: DungeonRequest[] = [];
  for (let k = 1; k <= seeds; k++) {
    const seed = k * 6_131 + floors + (fiveRoom ? 7 : 0);
    for (const offset of fiveRoom ? [0] : [0, 4]) {
      const tags = CAVE_TAG_SETS[(k + offset) % CAVE_TAG_SETS.length] ?? [];
      out.push({ seed, tags, floors, theme: 'cavern', fiveRoom });
    }
  }
  return out;
}

/** Haunted Mansions the house rules hold over (`house/houseInvariants.test.ts`), one to four floors, one tag set each. */
export const HOUSE_SEEDS = dungeonSeeds(300, 100);
const HOUSE_TAG_SETS: readonly string[][] = [[], ['small'], ['medium'], ['large'], ['ruined'], ['overgrown', 'inhabited'], ['large', 'ruined', 'overgrown']];

export function houseRequests(seeds: number = HOUSE_SEEDS): DungeonRequest[] {
  return Array.from({ length: seeds }, (_, i) => {
    const k = i + 1;
    const floors = 1 + (k % 4);
    return { seed: k * 6131 + floors, theme: 'mansion', tags: HOUSE_TAG_SETS[k % HOUSE_TAG_SETS.length] ?? [], floors };
  });
}
