import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchGl } from '../engine/__tests__/strictGl';
import { LightingRenderer } from '../LightingRenderer';
import { CAVE, createScene, darkness, engineLayer, litScene, type SavedScene, type Scene } from './sceneLightingHarness';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({
  Notice: class {
    constructor(message: string) {
      notices.push(message);
    }
  },
  getLanguage: () => 'en',
}));

const CRYPT = 'maps/crypt.atlasmap';

/** Two lit scenes of different sizes; the crypt has a wall and a torch. */
const cave = { path: CAVE, saved: litScene(100, 128), bounds: { width: 256, height: 256 } };
const crypt = {
  path: CRYPT,
  bounds: { width: 512, height: 384 },
  saved: {
    lighting: { enabled: true, ambient: 0.1 },
    exploredMask: null,
    objects: {
      ...litScene(60, 60).objects,
      walls: { w: { id: 'w', kind: 'wall', type: 'solid', p1: { x: 200, y: 20 }, p2: { x: 200, y: 300 } } },
      lights: { l: { id: 'l', x: 120, y: 90, emission: { bright: 10, dim: 20, color: '#ffcc88', intensity: 1, animation: 'torch' } } },
    },
  } as unknown as SavedScene,
};

describe('switching between lit scenes in one map view', () => {
  let scene: Scene;
  let error: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    notices.length = 0;
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
    scene = await createScene({ enabled: true });
  });

  afterEach(() => {
    scene.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** A few frames of the map view: the stage renders, the ticker runs. */
  function frames(count: number): void {
    for (let frame = 0; frame < count; frame++) {
      scene.renderStage();
      scene.tick();
    }
  }

  it('lights each scene with the one engine, without an error, a notice or a note left behind', () => {
    const engine = engineLayer(scene.viewport);
    const destroyed = vi.spyOn(LightingRenderer.prototype, 'destroy');
    const watch = watchGl(scene.renderer.gl);
    frames(3);
    expect(scene.noted()).toBeNull();

    for (let round = 0; round < 4; round++) {
      for (const map of [crypt, cave]) {
        scene.loadMap(map.path, map.saved, map.bounds);
        expect(engineLayer(scene.viewport)).toBe(engine);
        expect(engine?.visible).toBe(true);
        expect(engine?.filters).toHaveLength(1);
        expect(scene.host.currentSight().regions.map((region) => region.origin)).toEqual([{ x: map.saved.objects.tokens.t!.x, y: map.saved.objects.tokens.t!.y }]);
        expect(scene.noted()).toEqual([map.path]);
        frames(3);
        expect(scene.noted()).toBeNull();
      }
    }

    watch.stop();
    expect(watch.findings).toEqual([]);
    expect(destroyed).not.toHaveBeenCalled();
    expect(darkness(scene.viewport)).toBeUndefined();
    expect(notices).toEqual([]);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves no note when the GM switches scenes faster than a frame is drawn', () => {
    const engine = engineLayer(scene.viewport);
    for (let round = 0; round < 3; round++) {
      scene.loadMap(crypt.path, crypt.saved, crypt.bounds);
      scene.loadMap(cave.path, cave.saved, cave.bounds);
    }
    expect(scene.noted()).toEqual([CAVE]);
    scene.loadMap(crypt.path, crypt.saved, crypt.bounds);
    scene.switchLighting(false);
    expect(scene.noted()).toBeNull();

    scene.switchLighting(true);
    frames(3);
    expect(scene.noted()).toBeNull();
    expect(engineLayer(scene.viewport)).toBe(engine);
    expect(notices).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });
});
