import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../src/app/dungeons/model';
import { firesLit } from '../../../src/app/dungeons/render/fireSites';
import { DUNGEON_TAGS, SIZE_TAGS, withTag, type DungeonTag } from '../../../src/app/dungeons/tags';
import { takesTag, THEMES } from '../../../src/app/dungeons/themes/themes';
import { THEME_IDS, type ThemeId } from '../../../src/app/dungeons/themes/themeTypes';

/** Tags a theme takes that change nothing because its dungeons fulfil them anyway. */
const FULFILLED: Readonly<Record<ThemeId, readonly DungeonTag[]>> = {
  fortress: ['dry'],
  mansion: ['dry', 'no-secrets'],
  cavern: [],
  forest: [],
};
const SEEDS = [1, 2, 3, 4, 5, 6];
const FLOORS = [1, 2];

/** What a tag can change: the dungeon without the tags it names, and whether its fires burn (drawn from the tags). */
function fingerprint(model: DungeonModel): string {
  return JSON.stringify(model, (key, value: unknown) => (key === 'tags' ? undefined : value)) + String(firesLit(model));
}

function changes(theme: ThemeId, tag: DungeonTag, seed: number, floors: number): boolean {
  const base = withTag([], 'medium');
  return fingerprint(generateDungeon({ seed, theme, tags: base, floors })) !== fingerprint(generateDungeon({ seed, theme, tags: withTag(base, tag), floors }));
}

const someDungeon = (test: (seed: number, floors: number) => boolean): boolean => FLOORS.some((floors) => SEEDS.some((seed) => test(seed, floors)));

describe('the tags each theme offers', () => {
  for (const theme of THEME_IDS) {
    const { ignores } = THEMES[theme];
    const offered = DUNGEON_TAGS.filter((tag) => !SIZE_TAGS.includes(tag) && takesTag(theme, tag) && !FULFILLED[theme].includes(tag));

    it(`${theme}: a tag it ignores changes none of its dungeons`, () => {
      expect(ignores.filter((tag) => someDungeon((seed, floors) => changes(theme, tag, seed, floors)))).toEqual([]);
    });

    it(`${theme}: every tag it offers changes one of its dungeons`, () => {
      expect(offered.filter((tag) => !someDungeon((seed, floors) => changes(theme, tag, seed, floors)))).toEqual([]);
    });
  }
});
