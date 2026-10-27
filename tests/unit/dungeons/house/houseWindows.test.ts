import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { mirrored } from './houseZoneRules';
import { cellarWindows, corridorsAtEnds, evenlySpaced, frontMirrors, mainRoomsLit, piersBetween, stairHallTall, windowsByRoom, windowsClearOfCorners, windowsOverWindows } from './houseWindowRules';
import { windowStats } from './houseWindowStats';

/**
 * How a house's windows are placed (report 2026-10-25-mansion-windows-research), over many
 * Haunted Mansions of one to four floors: every rule checked apart from the planner.
 */

const SEEDS = 300;
const TAG_SETS: readonly string[][] = [[], ['small'], ['medium'], ['large'], ['ruined'], ['large', 'ruined', 'overgrown']];

const MODELS: { label: string; model: DungeonModel }[] = Array.from({ length: SEEDS }, (_, i) => {
  const k = i + 1;
  const tags = TAG_SETS[k % TAG_SETS.length] ?? [];
  const floors = 1 + (k % 4);
  const seed = k * 7349 + floors;
  return { label: `seed ${seed} [${tags.join(',')}] ${floors}f`, model: generateDungeon({ seed, theme: 'mansion', tags, floors }) };
});

const RULES: Record<string, (m: DungeonModel) => string[]> = {
  'W1 a room has the windows its kind and wall allow': windowsByRoom,
  'W1b every main room with an outer wall is lit': mainRoomsLit,
  'W2 corners solid, a cell clear of cross walls, never on a door': windowsClearOfCorners,
  'W3 corridors only at their ends': corridorsAtEnds,
  'W4 a stair hall has one tall window': stairHallTall,
  'W5 a cellar has a few small windows': cellarWindows,
  'W6 the main front mirrors about the front door': frontMirrors(mirrored),
  'W7 windows stand over windows': windowsOverWindows(mirrored),
  'W8 a pier between windows': piersBetween,
  'W9 evenly spaced about the wall\'s middle': evenlySpaced,
};

describe('a Haunted Mansion\'s windows', () => {
  if (import.meta.env.VITE_WINDOW_STATS === 'print') {
    it('prints their numbers', () => {
      console.log('WINDOW STATS ' + JSON.stringify(windowStats(MODELS.map((m) => m.model), mirrored)));
      for (const [name, rule] of Object.entries(RULES)) console.log(`WINDOW RULE ${name}: ${MODELS.filter(({ model }) => rule(model).length > 0).length} of ${SEEDS} houses break it`);
    });
    return;
  }
  for (const [name, rule] of Object.entries(RULES)) {
    it(`keep rule ${name}`, () => {
      const problems = MODELS.flatMap(({ label, model }) => rule(model).map((p) => `${label}: ${p}`));
      expect(problems.slice(0, 8)).toEqual([]);
    });
  }
});
