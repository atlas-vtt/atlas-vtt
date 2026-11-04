/**
 * Stairs on the clipboard. A copy keeps the levels its stairs join as steps from the level shown
 * when it was copied, so pasted on another floor, or into another scene, it joins the floors that
 * lie the same way from where it lands: stairs to the floor above lead to the floor above that one.
 */

import type { LevelLink, LevelLinkDirection, LevelLinkFlight, LevelLinkInput } from '../types/sceneLevelTypes';
import type { Point } from '../types/visionTypes';
import { firstLinkTarget, linkDirection, linkLevels, linkTargets } from './levelLinks';
import { hasLevels, type SceneLevels } from './sceneLevels';

/** Stairs as copied: their area and way, and the levels they join counted from the level shown then. */
export interface CopiedLevelLink {
  polygon: Point[];
  direction?: LevelLinkDirection;
  /** Walked stairs keep their foot and rows: the same edge of the same corners. */
  flight?: LevelLinkFlight;
  /** The levels joined as steps from the level shown when copied (0 that level, 1 the one above, −1 the one below), or every level. */
  steps: number[] | 'all';
}

const indexOf = (levels: readonly { id: string }[], id: string): number => levels.findIndex((level) => level.id === id);

/** Stairs copied on level `from`; null where the scene has no levels for them to join. */
export function copiedLevelLink(link: LevelLink, from: string | null, levels: SceneLevels): CopiedLevelLink | null {
  if (!hasLevels(levels) || from === null) return null;
  const at = indexOf(levels, from);
  if (at < 0) return null;
  const direction = linkDirection(link);
  return {
    polygon: link.polygon.map(({ x, y }) => ({ x, y })),
    ...(direction !== 'both' && { direction }),
    ...(link.flight && { flight: { ...link.flight } }),
    steps: link.levels === 'all' ? 'all' : linkLevels(link, levels).map((id) => indexOf(levels, id) - at),
  };
}

/**
 * Copied stairs as they land on level `at`: joining the levels that lie the same steps from it
 * there are (every level for an elevator to all). Where fewer than two of them are left, they join
 * `at` and the level above it (else below), as new stairs do; a way that leads nowhere from `at`
 * then is dropped, so pasted stairs always lead somewhere. Null where the scene has no levels.
 */
export function placedLevelLink(copy: CopiedLevelLink, at: string | null, levels: SceneLevels): LevelLinkInput | null {
  if (!hasLevels(levels) || at === null) return null;
  const here = indexOf(levels, at);
  if (here < 0) return null;
  let joined: string[] | 'all' = 'all';
  if (copy.steps !== 'all') {
    const ids = [...new Set(copy.steps.map((step) => levels[here + step]?.id).filter((id): id is string => id !== undefined))];
    const fallback = firstLinkTarget(at, levels);
    joined = ids.length >= 2 && ids.includes(at) ? ids : fallback === null ? [] : [at, fallback];
  }
  if (joined !== 'all' && joined.length < 2) return null;
  const placed: LevelLinkInput = { polygon: copy.polygon.map(({ x, y }) => ({ x, y })), levels: joined, ...(copy.flight && { flight: { ...copy.flight } }) };
  const { direction } = copy;
  const leads = direction !== undefined && linkTargets({ id: '', kind: 'level-link', ...placed, direction }, at, levels).length > 0;
  return leads ? { ...placed, direction } : placed;
}
