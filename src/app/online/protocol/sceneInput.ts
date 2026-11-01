import { isCount, parseAsset } from './asset.ts';
import { parseSeq } from './delta.ts';
import { parseFog } from './fog.ts';
import type { GmMessage } from './game.ts';
import { parseInitiative } from './initiative.ts';
import { parseLightingScene, parseSight } from './lighting.ts';
import { parseLiquids } from './liquids.ts';
import { parseLive } from './live.ts';
import { parseAnnotations, parseDoors, parseGrid, parsePins, parseSensed } from './mapLayers.ts';
import { MAX_SCENE_ID } from './moves.ts';
import { parseWidgetBar } from './widgets.ts';

/** The largest explored memory (a PNG) that goes inline in an `explored` message; a larger one is stored like any asset. */
export const EXPLORED_INLINE_BYTES = 200 * 1024;
/** The largest count of removals an `explored` message may carry. */
export const MAX_EXPLORED_SERIAL = Number.MAX_SAFE_INTEGER;
const EXPLORED_INLINE_BASE64 = 4 * Math.ceil(EXPLORED_INLINE_BYTES / 3);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export const isSceneId = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_SCENE_ID;
const isInlinePng = (value: unknown): value is string => typeof value === 'string' && value.length <= EXPLORED_INLINE_BASE64 && value.length % 4 === 0 && BASE64.test(value);

/** A message about the scene's fog or lighting, or null for anything malformed. */
export function parseSceneInput(value: Record<string, unknown>, scene: string): GmMessage | null {
  switch (value.t) {
    case 'fog': {
      const fog = parseFog(value.fog);
      const seq = parseSeq(value.seq);
      return fog === undefined || seq === null ? null : { t: 'fog', scene, ...(seq !== undefined && { seq }), fog };
    }
    case 'lighting': {
      const lighting = parseLightingScene(value);
      return lighting === null ? null : { t: 'lighting', scene, ...lighting };
    }
    case 'sight': {
      const sight = parseSight(value);
      const seq = parseSeq(value.seq);
      return sight === null || seq === null ? null : { t: 'sight', scene, ...(seq !== undefined && { seq }), ...sight };
    }
    case 'live':
      return parseLive(value, scene);
    case 'explored': {
      if (value.png !== undefined && !isInlinePng(value.png)) return null;
      if (value.serial !== undefined && !isCount(value.serial, MAX_EXPLORED_SERIAL)) return null;
      const serial = value.serial === undefined ? {} : { serial: value.serial };
      if (value.mask === undefined) return { t: 'explored', scene, ...(value.png === undefined ? {} : { png: value.png }), ...serial };
      const mask = parseAsset(value.mask);
      return mask === null || mask.mime !== 'image/png' || value.png !== undefined ? null : { t: 'explored', scene, mask, ...serial };
    }
    case 'liquids': {
      const liquids = parseLiquids(value.liquids);
      return liquids === null ? null : { t: 'liquids', scene, liquids };
    }
    case 'grid': {
      const grid = parseGrid(value.grid);
      return grid === undefined ? null : { t: 'grid', scene, grid };
    }
    case 'doors': {
      const doors = parseDoors(value.doors);
      return doors === null ? null : { t: 'doors', scene, doors };
    }
    case 'sensed': {
      const tokens = parseSensed(value.tokens);
      return tokens === null ? null : { t: 'sensed', scene, tokens };
    }
    case 'pins': {
      const pins = parsePins(value.pins);
      return pins === null ? null : { t: 'pins', scene, pins };
    }
    case 'annotations': {
      const annotations = parseAnnotations(value);
      return annotations === null ? null : { t: 'annotations', scene, ...annotations };
    }
    case 'initiative': {
      const list = parseInitiative(value.list);
      return list === undefined ? null : { t: 'initiative', scene, list };
    }
    case 'widgets': {
      const bar = parseWidgetBar(value.bar);
      return bar === undefined ? null : { t: 'widgets', scene, bar };
    }
    default:
      return null;
  }
}
