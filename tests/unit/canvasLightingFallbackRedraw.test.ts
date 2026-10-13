import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import type { TokenEntity } from '../../src/app/types';
import type { SightRules } from '../../src/app/vision/sightRules';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { maskCovers, watchSightMasks, type WatchedMasks } from '../helpers/sightMaskWatch';

const BLINDED: SightRules = { definitions: [], conditions: [{ id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' }] };
const hero: TokenEntity = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true, range: 10 } };
const prey: TokenEntity = { id: 'prey', kind: 'token', imagePath: 'p.png', x: 150, y: 100 };

describe('when the line-of-sight fallback composes its black', () => {
  const cleanup: (() => void)[] = [];
  /** Every composition of the black: a canvas the size of the map drawn, read back and uploaded. */
  let masks: WatchedMasks;
  beforeEach(() => {
    masks = watchSightMasks();
  });
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    masks.restore();
  });

  interface Opened {
    fallback: CanvasLightingFallback;
    store: ViewAtlasStore;
    /** Whether the black covers a point of the map, by what it was last composed from. */
    covers: (x: number, y: number) => boolean;
    /** Whether the black shows anything at all. */
    shows: () => boolean;
    /** Every render of the stage the fallback asked for. */
    renders: ReturnType<typeof vi.fn>;
    /** The map image comes in another size. */
    resize: (width: number, height: number) => void;
  }

  function open(tokens: Record<string, TokenEntity>, rules?: SightRules): Opened {
    cleanup.push(stubJsdomGraphics());
    const store = createViewAtlasStore(createInMemoryApp().app, `fallback-redraw-${Math.random()}`);
    store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens } });
    store.getState().setSceneLighting({ enabled: true });
    const viewport = new Container();
    let bounds = { width: 1000, height: 1000 };
    const renders = vi.fn();
    const fallback = new CanvasLightingFallback({
      viewport: viewport as unknown as Viewport, store, bounds: () => bounds, requestRender: renders,
      measurement: () => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as never,
      ...(rules && { rules: () => rules }),
    });
    cleanup.push(() => {
      fallback.destroy();
      viewport.destroy();
    });
    masks.reset();
    renders.mockClear();
    const resize = (width: number, height: number): void => {
      bounds = { width, height };
      fallback.refreshBounds();
    };
    return { fallback, store, covers: (x, y) => maskCovers(masks.shapesIn(viewport), x, y), shows: () => masks.shapesIn(viewport) !== null, renders, resize };
  }

  it('composes nothing in the GM\'s view, where the black is not shown, and catches up once the players\' view shows it', () => {
    const { fallback, store, covers, shows } = open({ hero, prey });
    store.getState().updateToken('hero', { x: 300 });
    store.getState().updateToken('hero', { x: 400 });
    expect(masks.composed()).toBe(0);
    expect(shows()).toBe(false);

    fallback.modeLayer.visible = true;
    expect(masks.composed()).toBe(1);
    expect([100, 400].map((x) => covers(x, 100))).toEqual([true, false]);

    // Shown again without a change, as for every frame of the player window: nothing anew.
    masks.reset();
    fallback.modeLayer.visible = false;
    fallback.modeLayer.visible = true;
    expect(masks.composed()).toBe(0);
  });

  it('composes nothing for a token move that leaves sight and footprints as they are', () => {
    const { fallback, store, covers } = open({ hero, prey });
    fallback.modeLayer.visible = true;
    masks.reset();
    // The prey has no vision and stays in the hero's sight: who is seen may differ, the darkness does not.
    store.getState().updateToken('prey', { x: 160 });
    store.getState().updateToken('prey', { x: 170, y: 120 });
    store.getState().setSelection(['prey']);
    expect(masks.composed()).toBe(0);

    store.getState().updateToken('hero', { x: 300 });
    expect(masks.composed()).toBe(1);
    expect([100, 300].map((x) => covers(x, 100))).toEqual([true, false]);
  });

  it('draws anew when a footprint moves, though sight stays the same', () => {
    // A blinded party token is shown in its footprint alone.
    const { fallback, store, covers } = open({ hero, prey: { ...prey, x: 600, vision: { enabled: true }, conditions: ['blind'] } }, BLINDED);
    fallback.modeLayer.visible = true;
    const covered = (): boolean[] => [600, 700].map((x) => covers(x, 100));
    expect(covered()).toEqual([false, true]);
    const sight = fallback.currentSight();
    masks.reset();
    store.getState().updateToken('prey', { x: 700 });
    expect(fallback.currentSight()).toBe(sight);
    expect(masks.composed()).toBe(1);
    expect(covered()).toEqual([true, false]);
  });

  it('draws anew when lighting was off in between', () => {
    const { fallback, store, covers, shows } = open({ hero, prey });
    fallback.modeLayer.visible = true;
    store.getState().setSceneLighting({ enabled: false });
    expect(shows()).toBe(false);
    store.getState().setSceneLighting({ enabled: true });
    expect([100, 400].map((x) => covers(x, 100))).toEqual([false, true]);
  });

  it('asks for a render whenever what it is drawn from changes, shown or not, so that a player window gets its frame', () => {
    const { fallback, store, renders } = open({ hero, prey });
    // In the GM's view nothing on the stage changes: the request is all that makes a canvas that renders on change render.
    store.getState().updateToken('hero', { x: 300 });
    expect(renders).toHaveBeenCalledTimes(1);
    store.getState().updateToken('prey', { x: 160 });
    store.getState().setSelection(['prey']);
    expect(renders).toHaveBeenCalledTimes(1);
    store.getState().setSceneLighting({ tokenVision: false });
    expect(renders).toHaveBeenCalledTimes(2);
    fallback.modeLayer.visible = true;
    store.getState().setSceneLighting({ tokenVision: true });
    expect(renders).toHaveBeenCalledTimes(3);
    // Lighting off shows the players everything: their frame is due as well.
    store.getState().setSceneLighting({ enabled: false });
    expect(renders).toHaveBeenCalledTimes(4);
    store.getState().updateToken('hero', { x: 320 });
    expect(renders).toHaveBeenCalledTimes(4);
  });

  it('draws anew when the map comes in another size, and not when it is asked again at the same size', () => {
    const { fallback, covers, renders, resize } = open({ hero, prey });
    fallback.modeLayer.visible = true;
    expect([900, 1100].map((x) => covers(x, 900))).toEqual([true, false]);
    masks.reset();
    renders.mockClear();
    resize(1000, 1000);
    expect(masks.composed()).toBe(0);
    expect(renders).not.toHaveBeenCalled();
    // The hero's sight ends 140 px around it either way: only the map's black changes.
    resize(1200, 1000);
    expect(masks.composed()).toBe(1);
    expect(renders).toHaveBeenCalledTimes(1);
    expect([900, 1100, 1300].map((x) => covers(x, 900))).toEqual([true, true, false]);
  });

  it('draws anew when a magical darkness moves or goes, though sight stays the same', () => {
    const { fallback, store, covers } = open({ hero, prey });
    fallback.modeLayer.visible = true;
    // A darkness 28 px around, inside the hero's 140 px of sight and away from the hero.
    const shade = store.getState().addLight({ x: 100, y: 190, emission: { bright: 0, dim: 2, color: '#000000', intensity: 1, animation: 'none', darkness: true } });
    const covered = (): boolean[] => [190, 20].map((y) => covers(100, y));
    expect(covered()).toEqual([true, false]);
    const sight = fallback.currentSight();
    masks.reset();
    store.getState().updateLight(shade, { y: 10 });
    expect(fallback.currentSight()).toBe(sight);
    expect(masks.composed()).toBe(1);
    expect(covered()).toEqual([false, true]);
    masks.reset();
    store.getState().deleteLight(shade);
    expect(fallback.currentSight()).toBe(sight);
    expect(masks.composed()).toBe(1);
    expect(covered()).toEqual([false, false]);
  });
});
