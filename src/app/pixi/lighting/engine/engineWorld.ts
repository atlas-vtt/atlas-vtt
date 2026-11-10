import type { Renderer } from 'pixi.js';
import type { LightingQuality } from '../../../lighting/lightingQuality';
import type { MapBounds } from '../../../vision/visibility';
import { LightingWorld } from './LightingWorld';
import { PolygonWorld } from './PolygonWorld';

/** The world-space picture of one map: traced on the graphics device, or drawn from the rule's polygons (`LightingQuality.picture`). */
export type EngineWorld = LightingWorld | PolygonWorld;

/** The world `quality` makes for a map of `bounds` whose grid cell is `cell` px; `paced` sends a traced world's heavy work only as fast as the device runs it. */
export function createEngineWorld(renderer: Renderer, bounds: MapBounds, quality: LightingQuality, paced: boolean, cell?: number): EngineWorld {
  return quality.picture === 'polygons' ? new PolygonWorld(renderer, bounds, quality, cell) : new LightingWorld(renderer, bounds, quality, paced, cell);
}
