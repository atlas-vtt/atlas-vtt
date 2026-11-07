// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, type Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { LightingRenderer, type LightingRendererDeps } from '../../src/app/pixi/lighting/LightingRenderer';
import type { TokenEntity } from '../../src/app/types';
import type { MapBounds } from '../../src/app/vision/visibility';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** The times each stamp was recorded with (undefined: at once), in order. */
const recorded = vi.hoisted((): (number | undefined)[] => []);

vi.mock('../../src/app/pixi/lighting/engine/LightingEngine', async () => {
  const { Container: Layer } = await import('pixi.js');
  return {
    LightingEngine: class {
      readonly layer = new Layer();
      readonly failed = false;
      takeRestored(): boolean { return false; }
      renderFrame<T>(_frame: unknown, render: () => T): T { return render(); }
      hasWorld(): boolean { return false; }
      busy(): boolean { return false; }
      animate(): boolean { return false; }
      setEnabled(): void {}
      setCoverage(): void {}
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
    record(_shapes: unknown, now?: number): void { recorded.push(now); }
    stampDue(): boolean { return false; }
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

let open: { view: LightingRenderer; store: ViewAtlasStore } | undefined;
afterEach(() => {
  open?.view.destroy();
  open = undefined;
  recorded.length = 0;
});

/** The engine's view over a lit scene whose hero stands at x 100, with the sight of the scene recorded as the memory hears it. */
function lit(deps: Partial<LightingRendererDeps> = {}): { view: LightingRenderer; store: ViewAtlasStore; moveHero: (x: number) => void } {
  const { app: obsApp } = createInMemoryApp();
  const store = createViewAtlasStore(obsApp, `lighting-stamps-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { hero: hero(100) } } });
  store.getState().setSceneLighting({ enabled: true, ambient: 1 });
  const renderer = { name: 'webgl', gl: { isContextLost: () => false, finish: () => undefined }, canvas: document.createElement('canvas') };
  const app = { renderer, ticker: { add: () => undefined, remove: () => undefined, lastTime: 0 } };
  const view = new LightingRenderer({
    viewport: new Container() as unknown as Viewport,
    app: app as unknown as Application,
    store,
    measurement: () => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as never,
    bounds: () => MAP,
    albedo: () => null,
    ...deps,
  });
  open = { view, store };
  return { view, store, moveHero: (x) => store.setState((state) => ({ objects: { ...state.objects, tokens: { hero: hero(x) } } })) };
}

describe('when what the tokens see is stamped into the explored memory', () => {
  it('at once for a change that is no drag, and at the frame\'s time while a drag holds tokens', () => {
    const { store, moveHero } = lit();
    const before = recorded.length;
    moveHero(200);
    expect(recorded.length).toBeGreaterThan(before);
    expect(recorded.at(-1)).toBeUndefined();
    store.getState().setHeldTokens({ hero: { x: 200, y: 100 } });
    moveHero(300);
    expect(typeof recorded.at(-1)).toBe('number');
  });

  it('at the frame\'s time for every change where the view paces its stamps (the players\' page, whose tokens move every frame)', () => {
    const { moveHero } = lit({ paceStamps: true });
    const before = recorded.length;
    moveHero(200);
    expect(recorded.length).toBeGreaterThan(before);
    expect(typeof recorded.at(-1)).toBe('number');
  });
});
