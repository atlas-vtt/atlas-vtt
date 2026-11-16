import type { SharedMapPlacement, SharedMapStretch } from '../protocol/index.ts';
import { imageWorldRect, NO_STRETCH, sameStretch, type ImageSize, type MapStretch } from '../../grid/mapStretch';
import { levelImagePlacement } from '../../levels/levelAlignment';
import type { SceneState } from './atlasView.ts';
import type { MapSize } from './moveCheck.ts';

/** The stretch as players are sent it: the factors and the angle, nothing a level's placement adds. */
function sharedStretch(stretch: MapStretch): SharedMapStretch {
  return { x: stretch.x, y: stretch.y, ...(stretch.rotation !== undefined && stretch.rotation !== 0 && { rotation: stretch.rotation }) };
}

/**
 * Where a floor's map image lies in its world as players are sent it (`SharedMapPlacement`), read
 * from what Atlas draws it by: a fitted level's own alignment, else the scene's grid alignment
 * (`levelImagePlacement`). Empty for a map drawn as it is and for a floor without an image, so such
 * a scene goes out as it always did.
 */
export function floorPlacement(state: Pick<SceneState, 'grid' | 'levelAlignments'>, level: string | null, background: string | null): SharedMapPlacement {
  if (background === null) return {};
  const alignment = level === null ? undefined : state.levelAlignments?.[level];
  if (alignment !== undefined) {
    const fit = { scale: alignment.scale, offset: { x: alignment.offset.x, y: alignment.offset.y } };
    return { ...(!sameStretch(alignment.stretch, NO_STRETCH) && { stretch: sharedStretch(alignment.stretch) }), fit };
  }
  const stretch = levelImagePlacement(state, level);
  return sameStretch(stretch, NO_STRETCH) ? {} : { stretch: sharedStretch(stretch) };
}

/**
 * The world a floor's map fills (`imageWorldRect`) for an image of `image` pixels drawn as Atlas draws
 * the floor: from the origin to the far corner of its turned, stretched and placed box. Players'
 * moves and marks are kept on it.
 */
export function floorWorldSize(state: Pick<SceneState, 'grid' | 'levelAlignments'>, level: string | null, image: ImageSize): MapSize {
  return imageWorldRect(image, levelImagePlacement(state, level));
}
