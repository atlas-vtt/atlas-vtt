import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { TERRAIN_KINDS } from '../../../src/app/dungeons/terrain/catalog';
import { dungeon } from '../../../src/app/i18n/locales/en/dungeon';

/** Every name a piece of terrain carries is an English message, so the GM's label and the note never show a key. */
/** A cave names its lava, its acid and its water after what they are. */
const CAVE_TAGS: readonly string[][] = [['crumbling'], ['lava', 'deep'], ['acid', 'wet']];

describe('terrain names', () => {
  const messages: Readonly<Record<string, string>> = dungeon;

  it('name every kind in the catalogue', () => {
    for (const { name } of Object.values(TERRAIN_KINDS)) expect(messages[name], name).toBeTypeOf('string');
  });

  it('name every piece the generator places', () => {
    const names = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const model = generateDungeon({ seed: seed * 911, theme: seed % 2 ? 'fortress' : 'cavern', tags: seed % 2 ? ['wet', 'colonnades'] : CAVE_TAGS[seed % CAVE_TAGS.length]!, floors: 1 + (seed % 4), fiveRoom: seed % 5 === 0 });
      for (const floor of model.floors) for (const piece of floor.terrain) names.add(piece.name);
    }
    expect([...names].filter((name) => typeof messages[name] !== 'string')).toEqual([]);
    // Typed rooms place their furniture as props; terrain is their reasons, cover and a cave's geology.
    expect(names.size).toBeGreaterThan(18);
    // Three hundred dungeons of up to four floors: seconds alone, longer beside the whole suite
  }, 60_000);
});
