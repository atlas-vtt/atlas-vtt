import { describe, expect, it, vi } from 'vitest';
import { sightMarks } from '../../src/app/pixi/lighting/sightMarks';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { unitScaleOf } from '../../src/app/lighting/lightingUnits';
import { SceneModelBuilder, SceneSpots } from '../../src/app/pixi/lighting/sceneModel';
import { tokenPerception } from '../../src/app/pixi/lighting/playerLightingLayers';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import { computeSight, SEES_ALL, SightCache, sightSources } from '../../src/app/vision/sight';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const BOUNDS = { width: 1000, height: 600 };
const measurement = (): ReturnType<typeof resolveMeasurementSettings> => resolveMeasurementSettings(undefined, null);
const hero: TokenEntity = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 200, vision: { enabled: true, range: 10 } };
const hidden: TokenEntity = { ...hero, id: 'hidden', x: 800, isHidden: true };

function state(tokens: Record<string, TokenEntity>, tokenVision = true): Parameters<SceneModelBuilder['update']>[0] {
  const store = createViewAtlasStore(createInMemoryApp().app, 'table-sight');
  const initial = store.getState();
  return { ...initial, lighting: { enabled: true, ambient: 1, tokenVision }, objects: { ...initial.objects, tokens } };
}

function build(tokens: Record<string, TokenEntity>, tokenVision = true): ReturnType<SceneModelBuilder['update']>['model'] {
  return new SceneModelBuilder().update(state(tokens, tokenVision), BOUNDS, measurement).model;
}

describe('the local player picture', () => {
  it('takes no source from a hidden token', () => {
    expect(sightSources({ hero, hidden }, unitScaleOf(measurement(), null), BOUNDS).map(source => source.tokenId)).toEqual(['hero']);
  });

  it('hides sight rather than opening the map when every vision token is hidden', () => {
    const model = build({ hidden });
    expect(model.sight).toEqual({ all: false, regions: [] });
    expect(model.explored).toBeNull();
    expect(new SceneSpots().update(model, state({ hidden }), measurement)).toEqual([]);
  });

  it('still sees all with no vision tokens or token vision switched off', () => {
    expect(build({}).sight).toBe(SEES_ALL);
    expect(build({ hidden: { ...hidden, vision: { enabled: false } } }).sight).toBe(SEES_ALL);
    expect(build({ hidden }, false).sight).toBe(SEES_ALL);
  });

  it('keeps visible regions and never targets hidden tokens, including without vision', () => {
    const model = build({ hero, hidden });
    expect(model.sight.regions.map(region => region.tokenId)).toEqual(['hero']);
    const targets = { hidden, other: { ...hidden, id: 'other', vision: { enabled: false } } };
    const perceive = tokenPerception(SEES_ALL, { ambient: 1 }, [], targets);
    expect(perceive('hidden')).toBe('unseen');
    expect(perceive('other')).toBe('unseen');
  });

  it('does not evict another computation from a reused cache', () => {
    const cache = new SightCache();
    const walls: Parameters<typeof computeSight>[1] = [];
    const source = (tokenId: string): Parameters<typeof computeSight>[0][number] => ({ tokenId, origin: { x: 100, y: 100 }, range: 100, senses: [] });
    const first = computeSight([source('a')], walls, cache).regions[0];
    computeSight([source('b')], walls, cache);
    expect(computeSight([source('a')], walls, cache).regions[0]).toBe(first);
    cache.retain(new Set(['b']));
    expect(computeSight([source('a')], walls, cache).regions[0]).not.toBe(first);
  });
  it('retains regions across unchanged builds and removes deleted source entries once per build', () => {
    const retain = vi.spyOn(SightCache.prototype, 'retain');
    try {
      const builder = new SceneModelBuilder();
      const initial = state({ hero, hidden });
      const first = builder.update(initial, BOUNDS, measurement).model;
      expect(first.sight.regions[0]).toBe(first.gmSight!.regions[0]);
      expect(builder.update(initial, BOUNDS, measurement).model).toBe(first);
      expect(retain).toHaveBeenCalledTimes(1);
      const empty = { ...initial, objects: { ...initial.objects, tokens: {} } };
      builder.update(empty, BOUNDS, measurement);
      expect(retain).toHaveBeenLastCalledWith(new Set());
      const again = builder.update(initial, BOUNDS, measurement).model;
      expect(again.gmSight!.regions[0]).not.toBe(first.gmSight!.regions[0]);
    } finally { retain.mockRestore(); }
  });

  it('updates GM visibility marks to describe the corrected player picture', () => {
    const target: TokenEntity = { id: 'target', kind: 'token', imagePath: '', x: 800, y: 210 };
    const tokens = { hidden, target };
    const model = build(tokens);
    const perception = tokenPerception(model.sight, model.ambient, model.reaches, tokens);
    expect(sightMarks(tokens, perception, 70).map(mark => [mark.tokenId, mark.kind])).toEqual([['target', 'unseen']]);
  });

});
