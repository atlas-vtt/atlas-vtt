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

  function open(tokens: Record<string, TokenEntity>, rules?: SightRules): { fallback: CanvasLightingFallback; store: ViewAtlasStore; darkness: Graphics } {
    cleanup.push(stubJsdomGraphics());
    const store = createViewAtlasStore(createInMemoryApp().app, `fallback-redraw-${Math.random()}`);
    store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens } });
    store.getState().setSceneLighting({ enabled: true });
    const viewport = new Container();
    const fallback = new CanvasLightingFallback({
      viewport: viewport as unknown as Viewport, store, bounds: () => ({ width: 1000, height: 1000 }),
      measurement: () => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as never,
      ...(rules && { rules: () => rules }),
    });
    cleanup.push(() => {
      fallback.destroy();
      viewport.destroy();
    });
    clipped.mockClear();
    return { fallback, store, darkness: darknessOf(viewport) };
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
});
