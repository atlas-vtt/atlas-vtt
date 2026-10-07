import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import { playerTokenSight } from '../../src/app/pixi/lighting/playerLightingLayers';
import { holdTokens } from '../../src/app/lighting/sightOnDrop';
import type { TokenEntity } from '../../src/app/types';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import { BUILT_IN_SENSES } from '../../src/app/gameSystems/senses';
import type { SightRules } from '../../src/app/vision/sightRules';
import type { MapBounds } from '../../src/app/vision/visibility';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restore: (() => void) | undefined;
afterEach(() => { restore?.(); restore = undefined; });

const MAP: MapBounds = { width: 1000, height: 1000 };

function setup(
  tokens: Record<string, TokenEntity>, lighting: Partial<SceneLighting> = {}, onSightChange?: () => void, rules?: SightRules, bounds: () => MapBounds | null = () => MAP,
): { fallback: CanvasLightingFallback; viewport: Container; store: ViewAtlasStore } {
  restore = stubJsdomGraphics();
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `canvas-lighting-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens } });
  store.getState().setSceneLighting({ enabled: true, ...lighting });
  const viewport = new Container();
  const fallback = new CanvasLightingFallback({
    viewport: viewport as unknown as Viewport,
    store,
    measurement: () => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as never,
    bounds,
    ...(onSightChange && { onSightChange }),
    ...(rules && { rules: () => rules }),
  });
  return { fallback, viewport, store };
}

const hero: TokenEntity = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true, range: 10 } };

describe('CanvasLightingFallback', () => {
  it('keeps an all-hidden vision scene closed and restores the no-vision and vision-off fallbacks', () => {
    const { fallback, store, viewport } = setup({ hero: { ...hero, isHidden: true } });
    try {
      expect(fallback.currentSight()).toEqual({ all: false, regions: [] });
      store.getState().setSceneLighting({ tokenVision: false });
      expect(fallback.currentSight().all).toBe(true);
      store.getState().setSceneLighting({ tokenVision: true });
      expect(fallback.currentSight().all).toBe(false);
      store.getState().updateToken('hero', { isHidden: false });
      expect(fallback.currentSight().regions.map(region => region.tokenId)).toEqual(['hero']);
      store.setState(state => ({ objects: { ...state.objects, tokens: {} } }));
      expect(fallback.currentSight().all).toBe(true);
    } finally { fallback.destroy(); viewport.destroy(); }
  });

  it('works sight out by the senses and conditions of the map\'s collection', () => {
    const seer: TokenEntity = { ...hero, vision: { enabled: true, senses: [{ id: 'pathfinder2e-darkvision' }, { id: 'blindsight', range: 10 }] }, conditions: ['blind'] };
    const generic = setup({ seer }).fallback.currentSight();
    expect(generic.regions.map((region) => region.sense.id)).toEqual(['sight', 'blindsight']);
    restore?.();
    const rules: SightRules = { definitions: BUILT_IN_SENSES['builtin:pathfinder2e']!, conditions: [{ id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' }] };
    const pathfinder = setup({ seer }, {}, undefined, rules).fallback.currentSight();
    expect(pathfinder.regions.map((region) => region.sense.id)).toEqual(['blindsight']);
    restore?.();
    const sighted = setup({ seer: { ...seer, conditions: [] } }, {}, undefined, rules).fallback.currentSight();
    expect(sighted.regions.map((region) => region.sense.id)).toEqual(['sight', 'pathfinder2e-darkvision', 'blindsight']);
  });

  it('cuts the darkness open at a party token no sense shows, and at a token that only a precise creature sense sees', () => {
    const rules: SightRules = { definitions: BUILT_IN_SENSES['builtin:pathfinder2e']!, conditions: [{ id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' }] };
    const bat: TokenEntity = { ...hero, vision: { enabled: true, senses: [{ id: 'pathfinder2e-echolocation', range: 40 }] }, conditions: ['blind'] };
    const prey: TokenEntity = { id: 'prey', kind: 'token', imagePath: 'p.png', x: 150, y: 100 };
    /** The centres of the footprints cut out: each is the polygon of what its token's centre has in a clear line. */
    const cuts = (tokens: Record<string, TokenEntity>): number[][] => {
      const poly = vi.spyOn(Graphics.prototype, 'poly');
      setup(tokens, {}, undefined, rules);
      const centres = poly.mock.calls.map(([points]) => {
        const flat = points as number[];
        const xs = flat.filter((_, index) => index % 2 === 0);
        const ys = flat.filter((_, index) => index % 2 === 1);
        return [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.round((Math.min(...ys) + Math.max(...ys)) / 2), Math.round((Math.max(...xs) - Math.min(...xs)) / 2)];
      });
      poly.mockRestore();
      restore?.();
      return centres;
    };
    // The bat is blinded: it is shown in its own footprint, like the prey its echolocation finds.
    expect(cuts({ bat })).toEqual([[100, 100, 31]]);
    expect(cuts({ bat, prey })).toEqual([[100, 100, 31], [150, 100, 31]]);
    expect(cuts({ bat, prey: { ...prey, x: 900 } })).toEqual([[100, 100, 31]]);
  });

  it('cuts a footprint by the walls its token stands at, and cuts none for a token whose condition hides it from every sense', () => {
    const rules: SightRules = {
      definitions: BUILT_IN_SENSES['builtin:pathfinder2e']!,
      conditions: [{ id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' }, { id: 'gone', name: 'Undetected', color: '#000000', effect: 'undetected' }],
    };
    const bat: TokenEntity = { ...hero, vision: { enabled: true, senses: [{ id: 'pathfinder2e-echolocation', range: 40 }] }, conditions: ['blind'] };
    const prey: TokenEntity = { id: 'prey', kind: 'token', imagePath: 'p.png', x: 150, y: 100 };
    const poly = vi.spyOn(Graphics.prototype, 'poly');
    /** The x reach of every footprint cut out since the last call. */
    const cuts = (): number[][] => {
      const reach = poly.mock.calls.map(([points]) => {
        const xs = (points as number[]).filter((_, index) => index % 2 === 0);
        return [Math.round(Math.min(...xs)), Math.round(Math.max(...xs))];
      });
      poly.mockClear();
      return reach;
    };
    const { store } = setup({ bat, prey }, {}, undefined, rules);
    expect(cuts()).toEqual([[69, 131], [119, 181]]);
    // A wall 8 px right of the bat's centre ends its footprint; the prey behind it is out of the echo's line.
    store.getState().addWall({ type: 'solid', p1: { x: 108, y: 0 }, p2: { x: 108, y: 400 }, closed: true });
    expect(cuts()).toEqual([[69, 108]]);
    store.setState({ objects: { ...store.getState().objects, walls: {} } });
    expect(cuts()).toHaveLength(2);
    store.getState().updateToken('prey', { conditions: ['gone'] });
    expect(cuts()).toEqual([[69, 131]]);
    poly.mockRestore();
  });

  it('keeps magical darkness dark: its area is black for every sense, and a token in it is not seen', () => {
    const prey: TokenEntity = { id: 'prey', kind: 'token', imagePath: 'p.png', x: 150, y: 100 };
    const { fallback, store } = setup({ hero: { ...hero, vision: { enabled: true } }, prey });
    const perceived = (): string | undefined => playerTokenSight(fallback, store.getState().objects.tokens)?.('prey');
    expect(fallback.lightReaches()).toEqual([]);
    expect(perceived()).toBe('seen');
    const fill = vi.spyOn(Graphics.prototype, 'fill');
    store.getState().addLight({ x: 150, y: 100, emission: { bright: 0, dim: 10, color: '#000000', intensity: 1, animation: 'none', darkness: true } });
    expect(fallback.lightReaches()).toMatchObject([{ darkness: true, origin: { x: 150, y: 100 }, dim: 140 }]);
    expect(perceived()).toBe('unseen');
    // The whole map in black, then the darkness in black over the hole of the hero's sight.
    expect(fill.mock.calls.filter(([style]) => (style as { color: number }).color === 0x000000)).toHaveLength(2);
    // A plain light is none of the fallback's business: it draws no light.
    store.getState().addLight({ x: 300, y: 100, emission: { bright: 5, dim: 10, color: '#ffffff', intensity: 1, animation: 'none' } });
    expect(fallback.lightReaches()).toHaveLength(1);
    fill.mockRestore();
  });

  it('opens magical darkness where a sense that sees in it looks, so a token it shows is not under the black; a token standing in it sees nothing with its eyes', () => {
    const rules: SightRules = { definitions: BUILT_IN_SENSES['builtin:dnd5e']!, conditions: [] };
    // The hero sees 140 px far; the darkness, 140 px in radius, begins 60 px from it.
    const prey: TokenEntity = { id: 'prey', kind: 'token', imagePath: 'p.png', x: 220, y: 100 };
    const warlock: TokenEntity = { ...hero, vision: { enabled: true, range: 10, senses: [{ id: 'dnd5e-devils-sight', range: 120 }] } };
    const { fallback, store } = setup({ hero: warlock, prey }, {}, undefined, rules);
    const cut = vi.spyOn(Graphics.prototype, 'cut');
    store.getState().addLight({ x: 300, y: 100, emission: { bright: 0, dim: 10, color: '#000000', intensity: 1, animation: 'none', darkness: true } });
    expect(playerTokenSight(fallback, store.getState().objects.tokens, { conditions: [] })?.('prey')).toBe('seen');
    // The map's black is cut by the hero's sight and by its devil's sight; the darkness' black by the devil's sight again.
    expect(cut).toHaveBeenCalledTimes(3);
    cut.mockRestore();
    // Plain eyes inside the darkness: no region at all.
    store.getState().updateToken('hero', { x: 300, y: 100, vision: { enabled: true } });
    expect(fallback.currentSight().regions).toEqual([]);
  });

  it('blacks out the map outside sight in the player frame only', () => {
    const { fallback, viewport } = setup({ hero });
    const darkness = viewport.children[0]!;
    expect(darkness.visible).toBe(false);
    fallback.modeLayer.visible = true;
    expect(darkness.visible).toBe(true);
    expect(fallback.currentSight().all).toBe(false);
    fallback.modeLayer.visible = false;
    expect(darkness.visible).toBe(false);
  });

  it('reports the sight it worked out, at the start and when a token moves', () => {
    const seen: number[] = [];
    const onSightChange = vi.fn();
    const { fallback, store } = setup({ hero }, {}, onSightChange);
    expect(onSightChange).toHaveBeenCalledTimes(1);
    onSightChange.mockImplementation(() => seen.push(fallback.currentSight().regions[0]!.origin.x));
    store.getState().updateToken('hero', { x: 300 });
    expect(seen).toEqual([300]);
  });

  it('reports nothing for store changes sight does not read, and keeps its sight and its light reaches the same objects while they are the same', () => {
    const prey: TokenEntity = { id: 'prey', kind: 'token', imagePath: 'p.png', x: 150, y: 100 };
    const onSightChange = vi.fn();
    const { fallback, store } = setup({ hero, prey }, {}, onSightChange);
    // What the perception memo compares: the same objects while nothing changed.
    expect(fallback.lightReaches()).toBe(fallback.lightReaches());
    const sight = fallback.currentSight();
    onSightChange.mockClear();
    store.getState().setActiveTool('wall');
    store.getState().setSelection(['hero']);
    store.getState().setGMView(false);
    expect(onSightChange).not.toHaveBeenCalled();
    // A token without vision moved: who is seen may differ, the regions do not.
    store.getState().updateToken('prey', { x: 160 });
    expect(onSightChange).toHaveBeenCalledTimes(1);
    expect(fallback.currentSight()).toBe(sight);
    store.getState().updateToken('hero', { x: 300 });
    expect(onSightChange).toHaveBeenCalledTimes(2);
    expect(fallback.currentSight()).not.toBe(sight);
    // The map's size is asked anew when the view says so.
    fallback.refreshBounds();
    expect(onSightChange).toHaveBeenCalledTimes(3);
  });

  it('keeps a held vision token\'s sight where it was taken until it is let go, where the scene waits for the drop', () => {
    const { fallback, store } = setup({ hero }, { sightOnDrop: true });
    holdTokens(store, ['hero']);
    store.getState().setTokenPositions([{ id: 'hero', x: 300, y: 100 }]);
    expect(fallback.currentSight().regions.map((region) => region.origin)).toEqual([{ x: 100, y: 100 }]);
    holdTokens(store, []);
    expect(fallback.currentSight().regions.map((region) => region.origin)).toEqual([{ x: 300, y: 100 }]);
  });

  it('follows a held vision token while it is dragged, as a scene does unless it waits for the drop', () => {
    const { fallback, store } = setup({ hero });
    holdTokens(store, ['hero']);
    store.getState().setTokenPositions([{ id: 'hero', x: 300, y: 100 }]);
    expect(fallback.currentSight().regions.map((region) => region.origin)).toEqual([{ x: 300, y: 100 }]);
  });

  it('renders a thumbnail in the GM view while the canvas shows the players, and leaves the canvas on theirs', () => {
    const { fallback, viewport } = setup({ hero });
    const darkness = viewport.children[0]!;
    fallback.modeLayer.visible = true;
    expect(darkness.visible).toBe(true);
    expect(fallback.renderForFrame({ x: 0, y: 0, resolution: 0.5 }, () => darkness.visible)).toBe(false);
    expect(darkness.visible).toBe(true);
    expect(() => fallback.renderForFrame({ x: 0, y: 0, resolution: 0.5 }, () => { throw new Error('Render failed'); })).toThrow('Render failed');
    expect(darkness.visible).toBe(true);
  });

  it('says its sight is the scene\'s while the scene is unlit and once it has worked a lit one out, not while a lit scene has no map to build on', () => {
    let map: MapBounds | null = null;
    const { fallback, store, viewport } = setup({ hero }, {}, undefined, undefined, () => map);
    try {
      expect(fallback.sightIsCurrent()).toBe(false);
      map = MAP;
      fallback.refreshBounds();
      expect(fallback.sightIsCurrent()).toBe(true);
      expect(fallback.currentSight().regions.map((region) => region.tokenId)).toEqual(['hero']);
      store.getState().setSceneLighting({ enabled: false });
      expect(fallback.sightIsCurrent()).toBe(true);
      // Lit again on a map that is gone: the sight it holds is the one it worked out before.
      map = null;
      store.getState().setSceneLighting({ enabled: true });
      expect(fallback.sightIsCurrent()).toBe(false);
      expect(fallback.currentSight().regions.map((region) => region.tokenId)).toEqual(['hero']);
    } finally { fallback.destroy(); viewport.destroy(); }
  });

  it('hides nothing while no token has vision', () => {
    const { fallback } = setup({});
    expect(fallback.currentSight().all).toBe(true);
  });

  it('hides nothing by line of sight while the scene switches token vision off', () => {
    const { fallback, viewport } = setup({ hero }, { tokenVision: false });
    expect(fallback.currentSight().all).toBe(true);
    fallback.modeLayer.visible = true;
    expect((viewport.children[0] as Graphics).context.instructions).toHaveLength(0);
  });

  it('counts everything in sight as lit, whatever the scene\'s threshold, since it draws no light', () => {
    const { fallback } = setup({ hero }, { ambient: 0, litThreshold: 1 });
    const { ambient, litThreshold } = fallback.ambientLight();
    expect(ambient).toBeGreaterThanOrEqual(litThreshold ?? 0.25);
  });
});
