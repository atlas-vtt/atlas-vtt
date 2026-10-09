import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture, type Application } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { LightingRenderer } from '../../src/app/pixi/lighting/LightingRenderer';
import type { EngineScene } from '../../src/app/pixi/lighting/engine/types';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** The scenes the view handed the engine, in order. */
const handed = vi.hoisted(() => ({ scenes: [] as EngineScene[] }));

// The engine and the explored memory draw; this suite holds what the view hands the engine.
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
      setExplored(): void {}
      setMode(): void {}
      setView(): void {}
      setGrid(): void {}
      update(scene: EngineScene): void { handed.scenes.push(scene); }
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

const hero: TokenEntity = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true, range: 10 } };

interface Lit {
  view: LightingRenderer;
  setLit: (on: boolean) => void;
  /** The map image's albedo becomes `texture` (or goes). */
  setAlbedo: (texture: Texture | null) => void;
  /** How often the view asked for the albedo. */
  asked: () => number;
  tick: () => void;
  sightChanges: ReturnType<typeof vi.fn>;
}

let open: LightingRenderer | undefined;
afterEach(() => {
  open?.destroy();
  open = undefined;
  handed.scenes = [];
});

/** The engine's view over a scene with one vision token, lit, whose albedo is not ready yet. */
function lit(): Lit {
  const { app: obsApp } = createInMemoryApp();
  const store = createViewAtlasStore(obsApp, `lighting-albedo-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { hero } } });
  store.getState().setSceneLighting({ enabled: true });
  let albedo: Texture | null = null;
  let asked = 0;
  const ticks: Array<() => void> = [];
  const renderer = { name: 'webgl', gl: { isContextLost: () => false, finish: () => undefined }, canvas: document.createElement('canvas') };
  const app = { renderer, ticker: { add: (tick: () => void) => ticks.push(tick), remove: (tick: () => void) => ticks.splice(ticks.indexOf(tick), 1) } };
  const sightChanges = vi.fn();
  const view = new LightingRenderer({
    viewport: new Container() as unknown as Viewport,
    app: app as unknown as Application,
    store,
    measurement: () => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as never,
    bounds: () => ({ width: 8192, height: 8192 }),
    albedo: () => {
      asked++;
      return albedo;
    },
    onSightChange: sightChanges,
  });
  open = view;
  return {
    view,
    setLit: (on) => store.getState().setSceneLighting({ enabled: on }),
    setAlbedo: (texture) => { albedo = texture; },
    asked: () => asked,
    tick: () => [...ticks].forEach((tick) => tick()),
    sightChanges,
  };
}

describe('the albedo of a map image that arrives after the image', () => {
  it('reaches the engine at the next tick, without building the scene anew', () => {
    const { setAlbedo, tick, sightChanges } = lit();
    expect(handed.scenes.at(-1)?.albedo).toBeNull();
    const first = handed.scenes.at(-1)!;
    sightChanges.mockClear();

    tick();
    expect(handed.scenes.at(-1)).toBe(first);

    const overview = new Texture();
    setAlbedo(overview);
    tick();
    const next = handed.scenes.at(-1)!;
    expect(next.albedo).toBe(overview);
    // The same scene otherwise: walls, lights and sight are the ones built before.
    expect(next.walls).toBe(first.walls);
    expect(next.lights).toBe(first.lights);
    expect(next.sight).toBe(first.sight);
    expect(sightChanges).not.toHaveBeenCalled();

    // Handed once: further ticks with the same albedo hand nothing.
    tick();
    expect(handed.scenes.at(-1)).toBe(next);
  });

  it('reaches a thumbnail taken before the next tick', () => {
    const { view, setAlbedo } = lit();
    const overview = new Texture();
    setAlbedo(overview);
    view.renderForFrame({} as never, () => undefined);
    expect(handed.scenes.at(-1)?.albedo).toBe(overview);
  });

  it('is gone from the engine once the image takes it along', () => {
    const { setAlbedo, tick } = lit();
    setAlbedo(new Texture());
    tick();
    setAlbedo(null);
    tick();
    expect(handed.scenes.at(-1)?.albedo).toBeNull();
  });

  it('is not asked for while the scene is unlit', () => {
    const { setLit, setAlbedo, asked, tick } = lit();
    setLit(false);
    const before = asked();
    const count = handed.scenes.length;
    setAlbedo(new Texture());
    tick();
    tick();
    expect(asked()).toBe(before);
    expect(handed.scenes).toHaveLength(count);
  });
});
