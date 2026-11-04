import { Viewport } from 'pixi-viewport';
import { describe, expect, it, vi } from 'vitest';
import { LightMap } from '../../src/app/pixi/lighting/engine/LightMap';
import { TileCache } from '../../src/app/pixi/lighting/engine/TileCache';
import { SightCache } from '../../src/app/vision/sight';
import { LightingEngine } from '../../src/app/pixi/lighting/engine/LightingEngine';
import type { EngineScene } from '../../src/app/pixi/lighting/engine/types';
import { computeSight, NO_SIGHT } from '../../src/app/vision/sight';
import { createTestRenderer, renderThroughEngine } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { resolveMeasurementSettings } from '../../src/app/grid/measurementFormat';
import { GENERIC_SIGHT_RULES } from '../../src/app/vision/sightRules';
import { SenseRangeRings } from '../../src/app/pixi/lighting/SenseRangeRings';

const sight = computeSight([{ tokenId: 'hidden', origin: { x: 64, y: 64 }, range: 100, senses: [] }], []);
const scene: EngineScene = { bounds: { width: 128, height: 128 }, albedo: null, walls: [], lights: [], sight, sightRadius: 20, ambient: 1, playerSight: NO_SIGHT, spots: [], playerSpots: [] };
const camera = { size: 128, map: 128, scale: 1, x: 0, y: 0, tint: 0x6699cc };

describe('cached GM and player sight frames', () => {
  it('retains geometry while modes alternate and frees separate frames when no longer needed', async () => {
    const renderer = await createTestRenderer(128);
    const engine = new LightingEngine(renderer);
    try {
      engine.setEnabled(true);
      engine.update({ ...scene, lights: [{ key: 'lamp', x: 64, y: 64, bright: 20, dim: 40, flame: 1, color: [1, 1, 1], intensity: 1, animation: 'none' }] });
      const tiles = vi.spyOn(TileCache.prototype, 'sync');
      const lights = vi.spyOn(LightMap.prototype, 'draw');
      const regions = vi.spyOn(SightCache.prototype, 'get');
      const layers = engine.layer.getChildByLabel('frameSight')!;
      expect(layers.children).toHaveLength(2);
      const frames = [...layers.children];
      const meshes = frames.map(frame => [...frame.children]);
      for (let index = 0; index < 10; index++) {
        engine.setMode(index % 2 ? 'gm' : 'player');
        expect(layers.children[0]).toBe(frames[0]);
        expect(layers.children[1]).toBe(frames[1]);
        for (let frame = 0; frame < frames.length; frame++) {
          expect(frames[frame]!.children.length).toBe(meshes[frame]!.length);
          meshes[frame]!.forEach((mesh, i) => expect(frames[frame]!.children[i]).toBe(mesh));
        }
      }
      expect(tiles.mock.results.every(result => result.type === 'return' && result.value === false)).toBe(true);
      expect(lights).not.toHaveBeenCalled();
      expect(regions).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      engine.update({ ...scene, playerSight: sight, playerSpots: scene.spots ?? [] });
      expect(layers.children).toHaveLength(1);
      expect(frames[1]!.destroyed).toBe(true);
      engine.setEnabled(false);
      expect(layers.children).toHaveLength(0);
      expect(frames[0]!.destroyed).toBe(true);
      engine.setEnabled(true);
      engine.update(scene);
      expect(layers.children).toHaveLength(2);
    } finally { vi.restoreAllMocks(); engine.destroy(); renderer.destroy(); }
  });

  it('forces GM sight for a thumbnail and restores the selected player frame after a throw', async () => {
    const renderer = await createTestRenderer(128);
    const engine = new LightingEngine(renderer);
    try {
      engine.setEnabled(true);
      engine.update(scene);
      engine.flush();
      const gm = renderThroughEngine(engine, renderer, camera)(64, 64);
      engine.setMode('player');
      const player = renderThroughEngine(engine, renderer, camera)(64, 64);
      expect(player).toEqual([0, 0, 0]);
      expect(gm).not.toEqual(player);
      expect(() => engine.renderFrame({ x: 0, y: 0, resolution: 1 }, () => {
        engine.setMode('player');
        expect(renderThroughEngine(engine, renderer, camera)(64, 64)).toEqual(gm);
        throw new Error('thumbnail interrupted');
      })).toThrow('thumbnail interrupted');
      expect(renderThroughEngine(engine, renderer, camera)(64, 64)).toEqual(player);
      engine.setMode('gm');
      expect(renderThroughEngine(engine, renderer, camera)(64, 64)).toEqual(gm);
    } finally { vi.restoreAllMocks(); engine.destroy(); renderer.destroy(); }
  });

  it('keeps the selected hidden token’s range rings on the GM canvas', async () => {
    const renderer = await createTestRenderer(128);
    const viewport = new Viewport({ screenWidth: 128, screenHeight: 128, worldWidth: 128, worldHeight: 128, events: renderer.events });
    const store = createViewAtlasStore(createInMemoryApp().app, 'hidden-range-rings');
    store.getState().setPersistenceEnabled(false);
    const token = { id: 'hidden', kind: 'token' as const, imagePath: '', x: 64, y: 64, isHidden: true, vision: { enabled: true, range: 5 } };
    store.setState(state => ({ selectedIds: ['hidden'], objects: { ...state.objects, tokens: { hidden: token } } }));
    const rings = new SenseRangeRings({ viewport, store, shown: () => true, measurement: () => resolveMeasurementSettings(undefined, null), bounds: () => scene.bounds, rules: () => GENERIC_SIGHT_RULES });
    try {
      const hidden = rings.rings();
      expect(hidden[0]?.rings.length).toBeGreaterThan(0);
      store.getState().updateToken('hidden', { isHidden: false });
      expect(rings.rings()).toEqual(hidden);
    } finally { rings.destroy(); viewport.destroy(); renderer.destroy(); }
  });
});
