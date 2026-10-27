/**
 * Whether a cave is lived in: only where the GM asks for it (the `inhabited` tag, no chance of
 * the seed's) and the cave has somewhere to live: a hollow near the mouth and near water.
 * Nothing stores it; it shows in the cave's rooms (a guard post at the mouth, a chief's den).
 */

import type { CaveSites } from '../../layout/cavern/caveSites';
import type { DungeonTag } from '../../tags';

/** Hops from the mouth a hollow may lie, and from water. */
const FROM_MOUTH = 2;
const FROM_WATER = 1;

/** Whether room `room` of a floor is a place to live: near the mouth and near water. */
export function hollowSite(site: CaveSites, room: number): boolean {
  return (site.hopsFromMouth[room] ?? Infinity) <= FROM_MOUTH && site.nearWater(room, FROM_WATER);
}

/** Whether the cave is lived in: asked for, and with a hollow site somewhere. */
export function isInhabited(tags: ReadonlySet<DungeonTag>, sites: readonly CaveSites[]): boolean {
  return tags.has('inhabited') && sites.some((site) => site.hopsFromMouth.some((_, room) => hollowSite(site, room)));
}
