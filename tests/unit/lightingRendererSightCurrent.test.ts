import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, type Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { LightingRenderer } from '../../src/app/pixi/lighting/LightingRenderer';
import type { TokenEntity } from '../../src/app/types';
import type { MapBounds } from '../../src/app/vision/visibility';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** The graphics device as the test sets it: its context lost, or restored and not yet reported. */
const gpu = vi.hoisted(() => ({ lost: false, restored: false }));

// The view works its sight out on the CPU and hands the scene to the engine and the explored
// memory, which draw. Both are left out here: this suite holds what the view says of its sight.
vi.mock('../../src/app/pixi/lighting/engine/LightingEngine', async () => {
  const { Container: Layer } = await import('pixi.js');
  return {
    LightingEngine: class {
      readonly layer = new Layer();
      readonly failed = false;
      takeRestored(): boolean {
        const restored = gpu.restored;
        gpu.restored = false;
        return restored;
      }
      renderFrame<T>(_frame: unknown, render: () => T): T { return render(); }
      hasWorld(): boolean { return false; }
      busy(): boolean { return false; }
      animate(): boolean { return false; }
      setEnabled(): void {}
      setExplored(): void {}
      setMode(): void {}
      setView(): void {}
      setGrid(): void {}
      update(): void {}
      flush(): void {}
      fail(): void {}
      destroy(): void {}
    },
  };
});
vi.mock('../../src/app/pixi/lighting/ExploredMemory', () => ({
  ExploredMemory: class {
    sync(): void {}
    record(): void {}
    reload(): void {}
    reset(): void {}
    edit(): boolean { return false; }
    forgetEdits(): void {}
    holdSaves(): void {}
    cancelSaves(): void {}
    beforeMapUnload(): void {}
    destroy(): void {}
  },
}));

const MAP: MapBounds = { width: 1000, height: 1000 };
const hero = (x: number): TokenEntity => ({ id: 'hero', kind: 'token', imagePath: 'h.png', x, y: 100, vision: { enabled: true, range: 10 } });

interface Lit {
  view: LightingRenderer;
  store: ViewAtlasStore;
  /** Where the sight the view holds looks from. */
  eyes: () => number[];
  moveHero: (x: number) => void;
  tick: () => void;
  sightChanges: ReturnType<typeof vi.fn>;
  setMap: (map: MapBounds | null) => void;
}

let open: Lit | undefined;
afterEach(() => {
  open?.view.destroy();
  open = undefined;
  gpu.lost = false;
  gpu.restored = false;
});

/** The engine's view over a lit scene whose hero stands at x 100, on a device that can draw. */
function lit(): Lit {
  const { app: obsApp } = createInMemoryApp();
  const store = createViewAtlasStore(obsApp, `lighting-renderer-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { hero: hero(100) } } });
  store.getState().setSceneLighting({ enabled: true });
  let map: MapBounds | null = MAP;
  const ticks: Array<() => void> = [];
  const renderer = { name: 'webgl', gl: { isContextLost: () => gpu.lost, finish: () => undefined }, canvas: document.createElement('canvas') };
  const app = { renderer, ticker: { add: (tick: () => void) => ticks.push(tick), remove: (tick: () => void) => ticks.splice(ticks.indexOf(tick), 1) } };
  const sightChanges = vi.fn();
  const view = new LightingRenderer({
    viewport: new Container() as unknown as Viewport,
    app: app as unknown as Application,
    store,
    measurement: () => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as never,
    bounds: () => map,
    albedo: () => null,
    onSightChange: sightChanges,
  });
  open = {
    view,
    store,
    eyes: () => view.currentSight().regions.map((region) => region.origin.x),
    moveHero: (x) => store.setState((state) => ({ objects: { ...state.objects, tokens: { hero: hero(x) } } })),
    tick: () => [...ticks].forEach((tick) => tick()),
    sightChanges,
    setMap: (next) => { map = next; },
  };
  return open;
}

describe('whether the lighting view\'s sight is the sight of the scene the store holds', () => {
  it('is once it has built a lit scene and while the scene is unlit, not while a lit scene has no map to build on', () => {
    const { view, store, eyes, setMap } = lit();
    expect({ current: view.sightIsCurrent(), eyes: eyes() }).toEqual({ current: true, eyes: [100] });
    store.getState().setSceneLighting({ enabled: false });
    expect(view.sightIsCurrent()).toBe(true);
    // Lit again on a map that is gone: the sight it holds is the one it worked out before.
    setMap(null);
    store.getState().setSceneLighting({ enabled: true });
    expect({ current: view.sightIsCurrent(), eyes: eyes() }).toEqual({ current: false, eyes: [100] });
    setMap(MAP);
    view.refreshBounds();
    expect(view.sightIsCurrent()).toBe(true);
  });

  it('is not from the start of a load until the scene that arrives is built, while it still holds the sight of the scene before', () => {
    const { view, store, eyes, moveHero } = lit();
    store.getState().setMapLoading(true);
    expect(view.sightIsCurrent()).toBe(false);
    moveHero(300);
    expect({ current: view.sightIsCurrent(), eyes: eyes() }).toEqual({ current: false, eyes: [100] });
    store.getState().setMapLoading(false);
    expect({ current: view.sightIsCurrent(), eyes: eyes() }).toEqual({ current: true, eyes: [300] });
  });

  it('is not once the map unloads', () => {
    const { view } = lit();
    view.beforeMapUnload();
    expect(view.sightIsCurrent()).toBe(false);
  });

  it('is not while a lost graphics context keeps it from a change of the scene, until the restored context has built the scene', () => {
    const { view, eyes, moveHero, tick, sightChanges } = lit();
    gpu.lost = true;
    // Nothing was missed yet: the sight is the scene's.
    expect(view.sightIsCurrent()).toBe(true);
    moveHero(300);
    expect({ current: view.sightIsCurrent(), eyes: eyes() }).toEqual({ current: false, eyes: [100] });
    gpu.lost = false;
    gpu.restored = true;
    // The context is back, and the scene not built on it yet.
    expect(view.sightIsCurrent()).toBe(false);
    sightChanges.mockClear();
    tick();
    expect({ current: view.sightIsCurrent(), eyes: eyes() }).toEqual({ current: true, eyes: [300] });
    expect(sightChanges).toHaveBeenCalledOnce();
  });

  it('tells of its sight again after a lost context that the scene did not change under', () => {
    const { view, eyes, tick, sightChanges } = lit();
    gpu.lost = true;
    tick();
    expect(view.sightIsCurrent()).toBe(false);
    gpu.lost = false;
    gpu.restored = true;
    sightChanges.mockClear();
    tick();
    expect({ current: view.sightIsCurrent(), eyes: eyes() }).toEqual({ current: true, eyes: [100] });
    // Whoever showed nothing by its sight meanwhile shows by it again.
    expect(sightChanges).toHaveBeenCalledOnce();
  });
});
