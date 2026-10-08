import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, type Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import { uncoveredAreas } from '../../src/app/lighting/uncoveredAreas';
import type { TokenEntity } from '../../src/app/types';
import type { SightRules } from '../../src/app/vision/sightRules';
import { darknessCovers, darknessOf } from '../helpers/darknessCover';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

vi.mock('../../src/app/lighting/uncoveredAreas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/lighting/uncoveredAreas')>();
  return { ...actual, uncoveredAreas: vi.fn(actual.uncoveredAreas) };
});

/** Every time the darkness is worked out by clipping. */
const clipped = vi.mocked(uncoveredAreas);
const BLINDED: SightRules = { definitions: [], conditions: [{ id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' }] };
const hero: TokenEntity = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true, range: 10 } };
const prey: TokenEntity = { id: 'prey', kind: 'token', imagePath: 'p.png', x: 150, y: 100 };

describe('when the line-of-sight fallback works its darkness out', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  interface Opened {
    fallback: CanvasLightingFallback;
    store: ViewAtlasStore;
    darkness: Graphics;
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
    clipped.mockClear();
    renders.mockClear();
    const resize = (width: number, height: number): void => {
      bounds = { width, height };
      fallback.refreshBounds();
    };
    return { fallback, store, darkness: darknessOf(viewport), renders, resize };
  }

  it('works nothing out in the GM\'s view, where the darkness is not shown, and catches up once the players\' view shows it', () => {
    const { fallback, store, darkness } = open({ hero, prey });
    store.getState().updateToken('hero', { x: 300 });
    store.getState().updateToken('hero', { x: 400 });
    expect(clipped).not.toHaveBeenCalled();
    expect(darkness.context.instructions).toHaveLength(0);
    expect(darkness.visible).toBe(false);

    fallback.modeLayer.visible = true;
    expect(clipped).toHaveBeenCalled();
    expect([100, 400].map((x) => darknessCovers(darkness, x, 100))).toEqual([true, false]);

    // Shown again without a change, as for every frame of the player window: nothing anew.
    clipped.mockClear();
    fallback.modeLayer.visible = false;
    fallback.modeLayer.visible = true;
    expect(clipped).not.toHaveBeenCalled();
  });

  it('works nothing out for a token move that leaves sight and footprints as they are', () => {
    const { fallback, store, darkness } = open({ hero, prey });
    fallback.modeLayer.visible = true;
    clipped.mockClear();
    const drawn = darkness.context.instructions;
    // The prey has no vision and stays in the hero's sight: who is seen may differ, the darkness does not.
    store.getState().updateToken('prey', { x: 160 });
    store.getState().updateToken('prey', { x: 170, y: 120 });
    store.getState().setSelection(['prey']);
    expect(clipped).not.toHaveBeenCalled();
    expect(darkness.context.instructions).toBe(drawn);
    expect(drawn.length).toBeGreaterThan(0);

    store.getState().updateToken('hero', { x: 300 });
    expect(clipped).toHaveBeenCalled();
    expect([100, 300].map((x) => darknessCovers(darkness, x, 100))).toEqual([true, false]);
  });

  it('draws anew when a footprint moves, though sight stays the same', () => {
    // A blinded party token is shown in its footprint alone.
    const { fallback, store, darkness } = open({ hero, prey: { ...prey, x: 600, vision: { enabled: true }, conditions: ['blind'] } }, BLINDED);
    fallback.modeLayer.visible = true;
    const covered = (): boolean[] => [600, 700].map((x) => darknessCovers(darkness, x, 100));
    expect(covered()).toEqual([false, true]);
    const sight = fallback.currentSight();
    clipped.mockClear();
    store.getState().updateToken('prey', { x: 700 });
    expect(fallback.currentSight()).toBe(sight);
    expect(clipped).toHaveBeenCalled();
    expect(covered()).toEqual([true, false]);
  });

  it('draws anew when lighting was off in between', () => {
    const { fallback, store, darkness } = open({ hero, prey });
    fallback.modeLayer.visible = true;
    store.getState().setSceneLighting({ enabled: false });
    expect(darkness.context.instructions).toHaveLength(0);
    store.getState().setSceneLighting({ enabled: true });
    expect([100, 400].map((x) => darknessCovers(darkness, x, 100))).toEqual([false, true]);
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
    const { fallback, darkness, renders, resize } = open({ hero, prey });
    fallback.modeLayer.visible = true;
    expect([900, 1100].map((x) => darknessCovers(darkness, x, 900))).toEqual([true, false]);
    clipped.mockClear();
    renders.mockClear();
    resize(1000, 1000);
    expect(clipped).not.toHaveBeenCalled();
    expect(renders).not.toHaveBeenCalled();
    // The hero's sight ends 140 px around it either way: only the map's black changes.
    resize(1200, 1000);
    expect(clipped).toHaveBeenCalled();
    expect(renders).toHaveBeenCalledTimes(1);
    expect([900, 1100, 1300].map((x) => darknessCovers(darkness, x, 900))).toEqual([true, true, false]);
  });

  it('draws anew when a magical darkness moves or goes, though sight stays the same', () => {
    const { fallback, store, darkness } = open({ hero, prey });
    fallback.modeLayer.visible = true;
    // A darkness 28 px around, inside the hero's 140 px of sight and away from the hero.
    const shade = store.getState().addLight({ x: 100, y: 190, emission: { bright: 0, dim: 2, color: '#000000', intensity: 1, animation: 'none', darkness: true } });
    const covered = (): boolean[] => [190, 20].map((y) => darknessCovers(darkness, 100, y));
    expect(covered()).toEqual([true, false]);
    const sight = fallback.currentSight();
    clipped.mockClear();
    store.getState().updateLight(shade, { y: 10 });
    expect(fallback.currentSight()).toBe(sight);
    expect(clipped).toHaveBeenCalled();
    expect(covered()).toEqual([false, true]);
    clipped.mockClear();
    store.getState().deleteLight(shade);
    expect(fallback.currentSight()).toBe(sight);
    expect(clipped).toHaveBeenCalled();
    expect(covered()).toEqual([false, false]);
  });
});
