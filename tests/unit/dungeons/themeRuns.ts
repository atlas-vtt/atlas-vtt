import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel } from '../../../src/app/dungeons/model';
import type { ThemeId } from '../../../src/app/dungeons/themes/themeTypes';

/** Themed dungeons over many seeds: 500 seeds, one to three floors, each with one of the tag sets below. */

export const THEME_SEEDS = 500;
export const THEME_TAG_SETS: readonly string[][] = [[], ['small'], ['large'], ['wet'], ['ruined'], ['secret', 'round'], ['crumbling', 'overgrown']];

export interface ThemeRun {
  seed: number;
  tags: string[];
  model: DungeonModel;
}

export function themeRuns(theme: ThemeId): ThemeRun[] {
  return Array.from({ length: THEME_SEEDS }, (_, k) => {
    const seed = (k + 1) * 4099 + theme.length;
    const tags = THEME_TAG_SETS[k % THEME_TAG_SETS.length] ?? [];
    return { seed, tags, model: generateDungeon({ seed, theme, tags, floors: 1 + (k % 3) }) };
  });
}

/** The first ten problems of every run, each named by its seed and tags. */
export function failuresOf(runs: readonly ThemeRun[], check: (model: DungeonModel) => string[]): string[] {
  return runs.flatMap((run) => check(run.model).map((problem) => `seed ${run.seed} [${run.tags.join(',')}]: ${problem}`)).slice(0, 10);
}

/** The share of runs `holds` holds in, among those `applies` to. */
export function shareOf(runs: readonly ThemeRun[], applies: (model: DungeonModel) => boolean, holds: (model: DungeonModel) => boolean): number {
  const counted = runs.filter((run) => applies(run.model));
  return counted.filter((run) => holds(run.model)).length / Math.max(1, counted.length);
}
