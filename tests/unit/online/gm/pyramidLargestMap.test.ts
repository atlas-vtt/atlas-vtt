import { describe, expect, it } from 'vitest';
import { IMAGE_PRESETS, MAP_MAX_PIXELS, MAP_MAX_SIDE } from '../../../../src/app/imageProcessing/imageProcessing';
import { manifestOf, pyramidBound, tileCount } from '../../../../src/app/online/gm/assets/pyramidPlan';
import { ASSET_CAPS } from '../../../../src/app/online/protocol/index.ts';
import { pyramidOf } from '../../../../src/app/pixi/mosaicCanvas/pyramid';

/** The relay's limits on one stored pyramid (`apps/relay/src/assets/assetLimits.ts`), which the page reads it within. */
const RELAY_MAX_TILES = 65_536;
const RELAY_MAX_LEVELS = 32;

describe('the largest map an import keeps, in the online store', () => {
  const square = Math.floor(Math.sqrt(MAP_MAX_PIXELS));
  const shapes = [
    pyramidOf(square, square),
    pyramidOf(MAP_MAX_SIDE, Math.floor(MAP_MAX_PIXELS / MAP_MAX_SIDE)),
    pyramidOf(Math.floor(MAP_MAX_PIXELS / MAP_MAX_SIDE), MAP_MAX_SIDE),
  ];

  it('is offered at a bound within what the store keeps under one id', () => {
    for (const pyramid of shapes) {
      expect(pyramidBound(pyramid)).toBeLessThanOrEqual(ASSET_CAPS.tiles);
      expect(pyramidBound(pyramid)).toBeGreaterThan(pyramid.width * pyramid.height * 4);
    }
  });

  it('has fewer tiles and levels than the relay takes, and a manifest the plan has room for', () => {
    for (const pyramid of shapes) {
      expect(tileCount(pyramid)).toBeLessThanOrEqual(RELAY_MAX_TILES);
      expect(pyramid.levels.length).toBeLessThanOrEqual(RELAY_MAX_LEVELS);
      expect(manifestOf(pyramid).length).toBeLessThan(256);
    }
    expect(IMAGE_PRESETS.map.maxPixels).toBe(MAP_MAX_PIXELS);
  });
});
