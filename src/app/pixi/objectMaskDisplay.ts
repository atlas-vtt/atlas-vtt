import type { ObjectMask } from '../addons/objectMask';
import type { HideableLayer, LayerVisibility } from './playerSafeFrame';

/**
 * How renderers show the object mask: hidden objects are not drawn, ghosted
 * ones are drawn faintly for the GM and never reach a player frame.
 */
export const GHOST_ALPHA = 0.3;

/** Display objects of ghosted map objects; a player frame must not show them. */
export function ghostLayers(mask: ObjectMask, sprites: Readonly<Record<string, HideableLayer | null | undefined>> | ReadonlyMap<string, HideableLayer>): LayerVisibility[] {
  const layers: LayerVisibility[] = [];
  const entries: Iterable<[string, HideableLayer | null | undefined]> = sprites instanceof Map ? sprites.entries() : Object.entries(sprites);
  for (const [id, sprite] of entries) {
    if (sprite && mask.ghost[id]) layers.push({ layer: sprite, visible: false });
  }
  return layers;
}

/**
 * Applies the mask to one display object whose renderer otherwise shows it
 * fully. `baseAlpha` is the alpha the renderer would use without a mask.
 */
export function applyObjectMask(target: HideableLayer, mask: ObjectMask, id: string, baseAlpha = 1): void {
  target.visible = !mask.hidden[id];
  target.alpha = mask.ghost[id] ? baseAlpha * GHOST_ALPHA : baseAlpha;
}
