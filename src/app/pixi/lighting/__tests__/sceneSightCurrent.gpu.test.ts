import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../../types';
import { playerTokenSight } from '../playerLightingLayers';
import { SIZE, resetContext, visionToken } from './rendererHarness';
import { breakLinking, createScene, darkness, litScene, type SavedScene, type Scene } from './sceneLightingHarness';

vi.mock('obsidian', () => ({ Notice: class {}, getLanguage: () => 'en' }));

const OTHER = 'maps/other.atlasmap';
const goblin = (id: string, x: number, y: number): TokenEntity => ({ id, x, y, isHidden: false, imagePath: 'g.png' }) as unknown as TokenEntity;

/** A lit scene in daylight whose vision token stands at x 150: it sees A and C, and not B, out at x 50. */
const other: SavedScene = {
  lighting: { enabled: true, ambient: 1 },
  objects: { walls: {}, lights: {}, tokens: { t: visionToken(150, 128, 5), A: goblin('A', 100, 140), B: goblin('B', 50, 128), C: goblin('C', 130, 150) } },
  exploredMask: null,
} as unknown as SavedScene;

describe('whether the lighting\'s sight is the scene\'s the store holds', () => {
  let scene: Scene;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
  });

  afterEach(() => {
    scene.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** How the players perceive A, B and C by the lighting as it is now. */
  const answers = (): string[] => {
    const perception = playerTokenSight(scene.host, scene.store.getState().objects.tokens);
    return ['A', 'B', 'C'].map((id) => perception?.(id) ?? 'none');
  };
  const origins = (): unknown[] => scene.host.currentSight().regions.map((region) => region.origin);

  it('is not from the start of a load until the scene that arrives is built, while it still answers by the scene before', async () => {
    scene = await createScene({ enabled: true });
    scene.setLighting({ ambient: 1 });
    expect(scene.host.sightIsCurrent()).toBe(true);
    scene.startLoad(OTHER, other, { width: SIZE, height: SIZE });
    expect(scene.host.sightIsCurrent()).toBe(false);
    expect({ origins: origins(), answers: answers() }).toEqual({ origins: [{ x: 100, y: 128 }], answers: ['seen', 'seen', 'seen'] });
    // A token renderer made before the lighting hears of the load's end first.
    const atLoadEnd: boolean[] = [];
    scene.listenFirst((state) => { if (!state.isMapLoading) atLoadEnd.push(scene.host.sightIsCurrent()); });
    scene.finishLoad();
    expect(atLoadEnd).toEqual([false]);
    expect(scene.host.sightIsCurrent()).toBe(true);
    expect({ origins: origins(), answers: answers() }).toEqual({ origins: [{ x: 150, y: 128 }], answers: ['seen', 'unseen', 'seen'] });
  });

  it('is not through a load that no map unloading came before, as after a load that failed', async () => {
    scene = await createScene({ enabled: true });
    scene.setLighting({ ambient: 1 });
    scene.startLoad(OTHER, other, { width: SIZE, height: SIZE }, false);
    expect(scene.host.sightIsCurrent()).toBe(false);
    scene.finishLoad();
    expect(scene.host.sightIsCurrent()).toBe(true);
    expect(origins()).toEqual([{ x: 150, y: 128 }]);
  });

  it('is not across a load made while the graphics context is lost, until the restored context builds the scene', async () => {
    scene = await createScene({ enabled: true });
    scene.setLighting({ ambient: 1 });
    await resetContext(scene.renderer, () => {
      scene.loadMap(OTHER, other, { width: SIZE, height: SIZE });
      expect(scene.host.sightIsCurrent()).toBe(false);
      expect(origins()).toEqual([{ x: 100, y: 128 }]);
    });
    scene.tick();
    expect(scene.host.sightIsCurrent()).toBe(true);
    expect(origins()).toEqual([{ x: 150, y: 128 }]);
  });

  it('is not while a lost graphics context keeps it from a change of the scene, until the restored context has built the scene', async () => {
    const onSightChange = vi.fn();
    scene = await createScene({ enabled: true, onSightChange });
    scene.setLighting({ ambient: 1 });
    expect(scene.host.sightIsCurrent()).toBe(true);
    await resetContext(scene.renderer, () => {
      // The party moves while nothing can be built: the sight is still the one from x 100.
      scene.moveToken(150, 128);
      expect({ current: scene.host.sightIsCurrent(), origins: origins() }).toEqual({ current: false, origins: [{ x: 100, y: 128 }] });
    });
    // The context is back, and the scene not built on it yet.
    expect(scene.host.sightIsCurrent()).toBe(false);
    onSightChange.mockClear();
    scene.tick();
    expect({ current: scene.host.sightIsCurrent(), origins: origins() }).toEqual({ current: true, origins: [{ x: 150, y: 128 }] });
    expect(onSightChange).toHaveBeenCalled();
  });

  it('tells of its sight again after a lost context that the scene did not change under', async () => {
    const onSightChange = vi.fn();
    scene = await createScene({ enabled: true, onSightChange });
    scene.setLighting({ ambient: 1 });
    await resetContext(scene.renderer, () => {
      scene.tick();
      expect(scene.host.sightIsCurrent()).toBe(false);
    });
    onSightChange.mockClear();
    scene.tick();
    expect({ current: scene.host.sightIsCurrent(), origins: origins() }).toEqual({ current: true, origins: [{ x: 100, y: 128 }] });
    // Whoever showed nothing by its sight meanwhile shows by it again.
    expect(onSightChange).toHaveBeenCalled();
  });

  it('is while the scene is unlit, and not while a lit one has no map to build on', async () => {
    scene = await createScene({ enabled: false });
    expect(scene.host.sightIsCurrent()).toBe(true);
    scene.loadMap(OTHER, other, null as never);
    expect(scene.host.sightIsCurrent()).toBe(false);
    scene.loadMap(OTHER, other, { width: SIZE, height: SIZE });
    expect(scene.host.sightIsCurrent()).toBe(true);
  });

  it('follows the line-of-sight fallback the same way', async () => {
    scene = await createScene({ enabled: false });
    breakLinking(scene.renderer);
    scene.switchLighting(true);
    vi.restoreAllMocks();
    expect(darkness(scene.viewport)).toBeDefined();
    expect(scene.host.sightIsCurrent()).toBe(true);
    scene.loadMap(OTHER, other, null as never);
    expect(scene.host.sightIsCurrent()).toBe(false);
    scene.loadMap(OTHER, { ...other, lighting: { enabled: false, ambient: 1 } } as SavedScene, null as never);
    expect(scene.host.sightIsCurrent()).toBe(true);
    scene.loadMap(OTHER, litScene(150, 128), { width: SIZE, height: SIZE });
    expect(scene.host.sightIsCurrent()).toBe(true);
    expect(origins()).toEqual([{ x: 150, y: 128 }]);
  });
});
