/**
 * What grows in a dungeon, from its tags and theme: which climbers, floor plants and undergrowth,
 * and how much. Each theme grows its own kinds (a Fortress ivy, weeds and brambles, a Haunted
 * Mansion ivy, dead creepers, roots and moss, a Cavern moss, ferns, fungi and roots). An overgrown
 * dungeon grows richly; a wet one only moss and ferns by its water; a crumbling one weeds in its
 * cracks; a ruin, of itself, climbers and roots along its outer walls alone. A dry dungeon or one
 * of lava or acid grows nothing unless it is overgrown.
 */

import type { GrowthKind } from '../growthModel';
import type { TerrainKind } from '../terrainModel';
import type { DungeonTag } from '../tags';
import type { ThemeId } from '../themes/themeTypes';

export type Weights<T> = readonly (readonly [T, number])[];

export type UndergrowthKind = Extract<TerrainKind, 'brambles' | 'thicket' | 'tangled-roots'>;

export interface Flora {
  /** Overgrown: growth on every kind of wall and floor, not only by water and in cracks. */
  rich: boolean;
  /** Moss and ferns by the water. */
  damp: boolean;
  /** Weeds in the cracks. */
  cracks: boolean;
  /** A ruin's climbers and roots, on its outer walls only. */
  ruins: boolean;
  climbers: Weights<GrowthKind>;
  patches: Weights<GrowthKind>;
  undergrowth: Weights<UndergrowthKind>;
  /** What climbs columns. */
  columns: Weights<GrowthKind>;
  /** What grows at the water's edge. */
  shore: Weights<GrowthKind>;
}

interface Theme {
  climbers: Weights<GrowthKind>;
  patches: Weights<GrowthKind>;
  undergrowth: Weights<UndergrowthKind>;
  columns: Weights<GrowthKind>;
}

const THEMES: Readonly<Record<ThemeId, Theme>> = {
  fortress: {
    climbers: [['ivy', 5], ['grass', 2], ['moss', 1]],
    patches: [['grass', 4], ['moss', 2], ['fern', 1]],
    undergrowth: [['brambles', 4], ['thicket', 1]],
    columns: [['ivy', 3], ['creeper', 0.3]],
  },
  mansion: {
    climbers: [['ivy', 4], ['creeper', 3], ['roots', 2], ['moss', 1]],
    patches: [['moss', 3], ['grass', 1], ['fungi', 0.5]],
    undergrowth: [['tangled-roots', 3], ['brambles', 1]],
    columns: [['creeper', 2], ['ivy', 2]],
  },
  cavern: {
    climbers: [['moss', 4], ['roots', 2], ['fern', 1]],
    patches: [['moss', 3], ['fern', 3], ['fungi', 2]],
    undergrowth: [['tangled-roots', 2], ['thicket', 1]],
    // Only climbers grow up a column (`render/growth/growthForms.ts`).
    columns: [['creeper', 1]],
  },
};

/** What climbs a ruin's outer walls where nothing else makes it grow. */
const RUIN_CLIMBERS: Weights<GrowthKind> = [['ivy', 3], ['roots', 2], ['creeper', 1]];

/** Moss and ferns want water: in a dry dungeon they grow a third as often. */
function drier(weights: Weights<GrowthKind>): Weights<GrowthKind> {
  return weights.map(([kind, w]) => [kind, kind === 'moss' || kind === 'fern' ? w / 3 : w] as const);
}

/** What grows in a dungeon of these tags and theme, or null where nothing does. */
export function floraOf(tags: ReadonlySet<DungeonTag>, themeId: ThemeId): Flora | null {
  const rich = tags.has('overgrown');
  const dry = tags.has('dry');
  const damp = !dry && (tags.has('wet') || tags.has('flooded') || rich);
  const cracks = tags.has('crumbling') || rich;
  const ruins = tags.has('ruined') && !rich;
  if (!rich && (dry || tags.has('lava') || tags.has('acid'))) return null;
  if (!rich && !damp && !cracks && !ruins) return null;
  const theme = THEMES[themeId];
  const climbers = ruins && !damp ? RUIN_CLIMBERS : theme.climbers;
  const { patches } = theme;
  return {
    rich,
    damp,
    cracks,
    ruins,
    climbers: dry ? drier(climbers) : climbers,
    patches: dry ? drier(patches) : patches,
    undergrowth: theme.undergrowth,
    columns: theme.columns,
    shore: [['moss', 3], ['fern', 3]],
  };
}
