import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchGl } from '../engine/__tests__/strictGl';
import { LightingWorld } from '../engine/LightingWorld';
import { SAVE_DELAY } from './rendererHarness';
import { CAVE, breakLinking, createScene, darkness, engineLayer, litScene, type Scene, type SceneOptions } from './sceneLightingHarness';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({
  Notice: class {
    constructor(message: string) {
      notices.push(message);
    }
  },
  getLanguage: () => 'en',
}));

const SAVED_MASK = 'data:image/png;base64,AAAA';

describe('scene lighting on a graphics device that cannot run the engine', () => {
  const cleanup: (() => void)[] = [];

  beforeEach(() => {
    notices.length = 0;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
  });

  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function setup(options: SceneOptions): Promise<Scene> {
    const scene = await createScene({ exploredMask: SAVED_MASK, ...options });
    cleanup.push(scene.dispose);
    return scene;
  }

  it('swaps to line of sight when the shaders do not link: one notice, clean renders, nothing saved', async () => {
    const scene = await setup({ enabled: false });
    const { renderer, viewport, host } = scene;
    const modeLayer = host.modeLayer;
    modeLayer.visible = true;
    breakLinking(renderer);

    expect(() => scene.switchLighting(true)).not.toThrow();
    vi.restoreAllMocks();

    expect(notices).toEqual(['Dynamic lighting could not run on this graphics device. Atlas shows line of sight without light and shadow.']);
    expect(engineLayer(viewport)).toBeUndefined();
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
    // The players still see only what the token sees: session view carried over to the fallback.
    expect(darkness(viewport)?.visible).toBe(true);
    expect(host.modeLayer).toBe(modeLayer);
    expect(host.currentSight().all).toBe(false);
    expect(host.currentSight().regions).toHaveLength(1);
    expect(host.lightReaches()).toEqual([]);
    modeLayer.visible = false;
    expect(darkness(viewport)?.visible).toBe(false);
    modeLayer.visible = true;
    expect(darkness(viewport)?.visible).toBe(true);

    const watch = watchGl(renderer.gl);
    scene.renderStage();
    scene.tick();
    watch.stop();
    expect(watch.findings).toEqual([]);
    expect(watch.draws()).toBeGreaterThan(0);

    // The memory the scene saved is not the fallback's to write, and a failure Atlas handled leaves no note.
    vi.advanceTimersByTime(SAVE_DELAY);
    host.beforeMapUnload();
    expect(scene.setExploredMask).not.toHaveBeenCalled();
    expect(scene.noted()).toBeNull();

    scene.switchLighting(false);
    scene.switchLighting(true);
    expect(engineLayer(viewport)).toBeUndefined();
    expect(notices).toHaveLength(1);
  });

  it('starts with line of sight when the last attempt on this map never finished, and retries after off and on', async () => {
    const build = vi.spyOn(LightingWorld.prototype, 'update');
    const scene = await setup({ enabled: true, noted: [CAVE] });
    const { renderer, viewport, host } = scene;

    expect(notices).toEqual(['Dynamic lighting could not run on this graphics device. Atlas shows line of sight without light and shadow. Switch dynamic lighting off and on to try again.']);
    expect(build).not.toHaveBeenCalled();
    expect(engineLayer(viewport)).toBeUndefined();
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
    expect(host.currentSight().all).toBe(false);
    expect(scene.noted()).toEqual([CAVE]);

    scene.switchLighting(false);
    expect(scene.noted()).toBeNull();
    expect(darkness(viewport)).toBeUndefined();

    scene.switchLighting(true);
    expect(build).toHaveBeenCalled();
    expect(engineLayer(viewport)?.filters).toHaveLength(1);
    expect(renderer.backBuffer.useBackBuffer).toBe(true);
    expect(scene.noted()).toEqual([CAVE]);

    scene.renderStage();
    scene.tick();
    scene.tick();
    expect(scene.noted()).toBeNull();
    expect(notices).toHaveLength(1);
  });

  it('stays on line of sight when the marked map is loaded again in the view: a load is not the retry of the GM', async () => {
    const build = vi.spyOn(LightingWorld.prototype, 'update');
    const scene = await setup({ enabled: true, noted: [CAVE], exploredMask: null });

    // `reloadActiveScene`, as after a snapshot restore or an asset transfer.
    scene.loadMap(CAVE, litScene(100, 128), { width: 256, height: 256 });

    expect(scene.noted()).toEqual([CAVE]);
    expect(build).not.toHaveBeenCalled();
    expect(engineLayer(scene.viewport)).toBeUndefined();
    expect(darkness(scene.viewport)).toBeDefined();
    expect(scene.host.currentSight().all).toBe(false);
    expect(notices).toHaveLength(1);

    // Another map in the same view is the engine's to light; coming back is refused again.
    scene.loadMap('maps/crypt.atlasmap', litScene(60, 60), { width: 256, height: 256 });
    expect(build).toHaveBeenCalled();
    expect(engineLayer(scene.viewport)?.filters).toHaveLength(1);
    scene.loadMap(CAVE, litScene(100, 128), { width: 256, height: 256 });
    expect(engineLayer(scene.viewport)).toBeUndefined();
    expect(scene.noted()).toEqual([CAVE]);
    expect(notices).toHaveLength(1);
  });

  it('notes the map only until the engine drew its first frame', async () => {
    const scene = await setup({ enabled: true });
    expect(scene.noted()).toEqual([CAVE]);
    expect(engineLayer(scene.viewport)?.filters).toHaveLength(1);
    scene.tick();
    expect(scene.noted()).toEqual([CAVE]);
    scene.renderStage();
    scene.tick();
    expect(scene.noted()).toEqual([CAVE]);
    scene.tick();
    expect(scene.noted()).toBeNull();
    expect(notices).toEqual([]);
  });
});
