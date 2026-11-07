import { readMapStretch } from '../grid/mapStretch';
import type { LevelAlignment } from '../types/sceneLevelTypes';
import { readLevelAlignment, type AlignedScene } from './levelAlignment';

/** An image's size in pixels. */
export interface ImageSize {
  width: number;
  height: number;
}

/** How far a replacing image's shape may differ from the one it replaces: one per cent of the aspect. */
export const REPLACE_ASPECT_TOLERANCE = 0.01;

/**
 * How a new map image takes the place of a level's image: drawn as the old one was (`same`, the
 * same pixel size), with an alignment of its own that scales it onto the old one's world rect
 * (`scaled`), or refused: another shape (`aspect`), or a scale no alignment holds (`scale`).
 */
export type ReplacementFit =
  | { kind: 'same' }
  | { kind: 'scaled'; alignment: LevelAlignment }
  | { kind: 'aspect' }
  | { kind: 'scale' };

/** The alignment level `levelId` is drawn with now: its own, or the frame's (the scene's grid alignment, from the origin). */
function currentAlignment(scene: AlignedScene, levelId: string | null): LevelAlignment {
  const own = levelId === null ? undefined : scene.levelAlignments?.[levelId];
  return own ?? { offset: { x: 0, y: 0 }, scale: 1, stretch: readMapStretch(scene.grid?.mapStretch) };
}

/**
 * How an image of `next` pixels replaces level `levelId`'s image of `old` pixels so that it covers
 * the same world rect, and the grid, walls, lights and everything else on the level stay on the art
 * (an animated or gridless version of the same map, a larger export). Its shape must be the old
 * one's within `REPLACE_ASPECT_TOLERANCE`; it is scaled by one factor, the mean of both sides'
 * ratios, keeping the level's offset, stretch and turn.
 */
export function replacementFit(scene: AlignedScene, levelId: string | null, old: ImageSize, next: ImageSize): ReplacementFit {
  const valid = (size: ImageSize): boolean => size.width > 0 && size.height > 0 && Number.isFinite(size.width) && Number.isFinite(size.height);
  if (!valid(old) || !valid(next)) return { kind: 'aspect' };
  const aspects = (next.width / next.height) / (old.width / old.height);
  if (Math.abs(aspects - 1) > REPLACE_ASPECT_TOLERANCE) return { kind: 'aspect' };
  if (old.width === next.width && old.height === next.height) return { kind: 'same' };
  const now = currentAlignment(scene, levelId);
  const factor = Math.sqrt((old.width / next.width) * (old.height / next.height));
  const alignment = readLevelAlignment({ ...now, scale: now.scale * factor });
  return alignment ? { kind: 'scaled', alignment: { ...alignment, stretch: now.stretch } } : { kind: 'scale' };
}
