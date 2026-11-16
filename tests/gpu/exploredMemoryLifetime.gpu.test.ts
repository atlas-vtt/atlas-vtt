import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_DELAY, SIZE, createHarness, resetContext } from '../../src/app/pixi/lighting/__tests__/rendererHarness';
import { RIGHT_ROOM, WALL, forget, memoryScenes, reveal } from './exploredMemoryScene';

describe('the life of the explored memory\'s undo steps', () => {
  const { scene, unwatch } = memoryScenes();

  it('leaves the memory\'s steps behind when the scene unloads: the history keeps the map\'s own', async () => {
    const { lighting, store, history } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall({ type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    expect(history().pastStates).toHaveLength(3);

    lighting.beforeMapUnload();
    expect(history().pastStates).toHaveLength(1);
    history().undo();
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
    expect(history().pastStates).toHaveLength(0);
  });

  it('takes its steps out of the history when the lighting view goes, as when line of sight takes the engine\'s place', async () => {
    const { lighting, store, history, destroyLighting } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall({ type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    history().undo();
    expect(history().pastStates).toHaveLength(2);
    expect(history().futureStates).toHaveLength(1);

    destroyLighting();
    // Only the wall's step is left, in either direction: no step that has nothing to put back.
    expect(history().pastStates).toHaveLength(1);
    expect(history().futureStates).toHaveLength(0);
    history().undo();
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
    expect(history().pastStates).toHaveLength(0);
  });

  it('tells no one and saves nothing for an undo once the engine has stopped', async () => {
    const { lighting, store, history, travels, unavailable, redAt } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    vi.advanceTimersByTime(SAVE_DELAY);
    const saved = store.getState().exploredMask;
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    // A pass throws on this graphics device: the engine stops for good, and the renderer with the next lighting work.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (lighting as unknown as { engine: { fail: (error: unknown) => void } }).engine.fail(new Error('a pass threw'));
    store.getState().setSceneLighting({ ambient: 0.05 });
    expect(unavailable).toEqual(['failed']);

    history().undo();
    expect(travels).toEqual([]);
    expect(redAt(200, 128)).toBe(0);
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(store.getState().exploredMask).toBe(saved);
  });

  it('takes no edit back when a load starts the count over', async () => {
    const { lighting, store, redAt } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    // A load that reaches the store without the scene having been unloaded first.
    store.getState().setMapLoading(true, 0);
    store.getState().setExploredEdits(0);
    expect(redAt(200, 128)).toBe(255);
  });

  it('drops its steps with the texture when the map changes size', async () => {
    let bounds = { width: SIZE, height: SIZE };
    const { lighting, store, history, overlayTextures } = await scene({ bounds: () => bounds });
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall(WALL);
    expect(history().pastStates).toHaveLength(2);
    expect(overlayTextures).toHaveLength(1);

    bounds = { width: SIZE * 2, height: SIZE };
    lighting.refreshBounds();
    // The overlay was handed the new texture before the old one went.
    expect(overlayTextures).toHaveLength(2);
    expect(overlayTextures[1]).not.toBe(overlayTextures[0]);
    expect(overlayTextures[0]!.destroyed).toBe(true);
    expect(history().pastStates).toHaveLength(1);
    // The next edit is an undo step again, on the new texture.
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(true);
    expect(history().pastStates).toHaveLength(2);
    history().undo();
    expect(history().pastStates).toHaveLength(1);
  });

  it('hands the GM\'s overlay the memory\'s texture, and takes it back before the view goes', async () => {
    const { overlayTextures, destroyLighting } = await scene();
    expect(overlayTextures).toHaveLength(1);
    const texture = overlayTextures[0]!;
    expect(texture.destroyed).toBe(false);
    destroyLighting();
    expect(overlayTextures).toEqual([texture, null]);
    expect(texture.destroyed).toBe(true);
  });

  it('drops its steps when a restored context draws the memory anew from the saved mask', async () => {
    const { renderer, lighting, store, history } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall({ type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    unwatch();
    await resetContext(renderer, () => {
      // An undo while the context is lost has no texture to write to.
      history().undo();
    });
    // The next lighting work notices the restore.
    store.getState().setSceneLighting({ ambient: 0.05 });
    // Only the wall is left to undo: no step that would write texels of the texture that is gone.
    expect(history().pastStates).toHaveLength(1);
    expect(history().futureStates).toHaveLength(0);
    history().undo();
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
  });

  it('leaves no step that does nothing when an undo is the first to notice a restored context', async () => {
    const { renderer, lighting, store, history, travels } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    store.getState().addWall({ type: 'solid', p1: { x: 10, y: 10 }, p2: { x: 40, y: 10 }, closed: true });
    lighting.editExplored(forget({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    lighting.editExplored(reveal({ type: 'brush', brushRadius: 20, points: [{ x: 200, y: 128 }] }));
    vi.advanceTimersByTime(SAVE_DELAY);
    const saved = store.getState().exploredMask;
    unwatch();
    // No frame and no store change between the restore and the undo: the undo's own notification finds the new context.
    await resetContext(renderer);
    history().undo();
    // The history is put in order once the undo has finished writing it.
    await Promise.resolve();
    expect(history().pastStates).toHaveLength(1);
    expect(history().futureStates).toHaveLength(0);
    // The undo had no texels to put back: the GM is told of none, and nothing is saved for it.
    expect(travels).toEqual([]);
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(store.getState().exploredMask).toBe(saved);
    // What is left is the wall's step.
    history().undo();
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(1);
    expect(history().pastStates).toHaveLength(0);
    expect(history().futureStates).toHaveLength(1);
    history().redo();
    expect(history().futureStates).toHaveLength(0);
  });

  it('tells no one and saves nothing for an undo made while the context is lost', async () => {
    const { renderer, lighting, store, history, travels } = await scene();
    lighting.editExplored(reveal(RIGHT_ROOM));
    vi.advanceTimersByTime(SAVE_DELAY);
    const saved = store.getState().exploredMask;
    unwatch();
    const lost = new Promise<void>((resolve) => renderer.canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }));
    renderer.gl.getExtension('WEBGL_lose_context')!.loseContext();
    await lost;
    history().undo();
    expect(travels).toEqual([]);
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(store.getState().exploredMask).toBe(saved);
  });

  it('edits nothing while a lost context holds the texture, and puts no step in the history', async () => {
    const { renderer, lighting, history } = await scene();
    unwatch();
    const lost = new Promise<void>((resolve) => renderer.canvas.addEventListener('webglcontextlost', () => resolve(), { once: true }));
    renderer.gl.getExtension('WEBGL_lose_context')!.loseContext();
    await lost;
    expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(false);
    expect(history().pastStates).toHaveLength(0);
  });
});

describe('forgetting explored areas while the saved memory is not in yet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('drops the saved memory at once and for good, and edits nothing by hand meanwhile', async () => {
    const harness = await createHarness({ holdFirstDecode: true });
    const { lighting, state, setExploredMask, redAt, releaseFirstDecode, settle } = harness;
    try {
      expect(lighting.editExplored(reveal(RIGHT_ROOM))).toBe(false);
      lighting.resetExplored();
      expect(setExploredMask).toHaveBeenCalledWith(null, null);
      expect(state.exploredEdits).toBe(0);
      releaseFirstDecode();
      await settle();
      // The mask that was on its way in is not drawn after all.
      expect(redAt(200, 200)).toBe(0);
    } finally {
      harness.dispose();
    }
  });
});
