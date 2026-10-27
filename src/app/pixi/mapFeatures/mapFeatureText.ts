/** What the GM's hover label says of a map feature or a door. */

import { t } from '../../i18n';
import type { MapFeature } from '../../types/mapFeatureTypes';
import type { WallSegment } from '../../types/wallTypes';

export interface HoverText {
  /** The first line, in the label's weight. */
  readonly title: string;
  /** What the thing does to play, one per line, quieter. */
  readonly traits: readonly string[];
}

/** A feature's name (or "Map feature" where it has none) and its traits. */
export function featureText(feature: MapFeature): HoverText {
  const traits: string[] = [];
  if (feature.terrain?.difficult) traits.push(t('mapFeature.difficult'));
  if (feature.terrain?.cover) traits.push(t(`mapFeature.cover.${feature.terrain.cover}`));
  return { title: feature.name || t('mapFeature.unnamed'), traits };
}

/** What a door is, read from the wall itself; null for a wall that is no door. */
export function doorText(wall: WallSegment): HoverText | null {
  if (wall.type === 'secret-door') return { title: t('mapFeature.secretDoor'), traits: [] };
  if (wall.type !== 'door') return null;
  return { title: t(wall.locked ? 'mapFeature.lockedDoor' : 'mapFeature.door'), traits: [] };
}
