import type { OnOneLevel } from './sceneLevelTypes';

/** How much a feature covers what stands behind it, as the rules of most grid games name it. */
export type FeatureCover = 'half' | 'three-quarters' | 'total';

/** What a feature does to play: whether moving into it costs more, and how much it covers. */
export interface FeatureTerrain {
  /** Moving into it costs double where the collection's rules have difficult terrain (`collectionDifficultTerrain`). */
  difficult?: true | undefined;
  cover?: FeatureCover | undefined;
}

/**
 * Something on a battle map the GM may want named: rubble, a statue, a stone bridge, a pool. An
 * area on one level with a name the GM reads when hovering it, and what it does to play. Never shown
 * to players. Map geometry (undo-tracked, in `objects.mapFeatures`); read them with `mapFeatureList`.
 */
export interface MapFeature extends OnOneLevel {
  id: string;
  kind: 'map-feature';
  /** The area's corners in world pixels, at least three. */
  polygon: { x: number; y: number }[];
  /** What the GM reads, e.g. "Rubble" or "Stone bridge". */
  name: string;
  terrain?: FeatureTerrain | undefined;
}

export type MapFeatureInput = Omit<MapFeature, 'id' | 'kind'>;

/** Changes to a map feature: a field given as undefined is removed. */
export type MapFeatureChanges = { [Field in keyof MapFeatureInput]?: MapFeatureInput[Field] | undefined };
