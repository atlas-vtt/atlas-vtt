// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import type { MapRect } from '../../src/app/grid/cellNumbering';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { FogOperation, FogRectangleFill } from '../../src/app/types/fogTypes';
import { MOTION_NORMAL_MS } from '../../src/app/utils/motion';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// The mesh that mixes two pictures needs WebGL; what it draws is measured in tests/gpu/fogFade.gpu.test.ts.
vi.mock('../../src/app/pixi/fog/fogEdgeMesh', () => ({
  FogEdgeMesh: class {
    setEdge(): void {}
    fadeFrom(): void {}
    setMix(): void {}
    destroy(): void {}
  },
}));

const MAP: MapRect = { x: 0, y: 0, width: 1000, height: 800 };
const rect = (id: string, timestamp: number, x: number): FogRectangleFill =>
  ({ id, timestamp, kind: 'fog', type: 'rectangle', isErasing: false, x, y: 100, width: 200, height: 200 });
const HALL = { hall: rect('hall', 1, 100) };
const BOTH = { ...HALL, cellar: rect('cellar', 2, 500) };

interface FogView {
  store: ViewAtlasStore;
  fog: FogOfWarRenderer;
  setFog(fog: Record<string, FogOperation>): void;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void;
}

describe('when a change of the fog starts a fade', () => {
  const views: FogOfWarRenderer[] = [];
  let reduced = false;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    reduced = false;
    // jsdom has no Canvas 2D implementation.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => (): void => undefined }) as never);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: reduced && query.includes('prefers-reduced-motion') }) as MediaQueryList);
  });

  afterEach(() => {
    for (const view of views.splice(0)) view.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** The fog of a loaded scene in the GM's view, on a renderer that can mix two pictures. */
  function fogView(fog: Record<string, FogOperation> = HALL, map = MAP): FogView {
    const store = createViewAtlasStore(createInMemoryApp().app, 'fog-fade-test');
    store.getState().setPersistenceEnabled(false);
    store.setState((state) => ({ mapPath: 'maps/a.atlasmap', isMapLoading: false, isGMView: true, objects: { ...state.objects, fog } }));
    const viewport = Object.assign(new Container(), { options: {}, scale: { x: 1, y: 1 }, toWorld: (point: { x: number; y: number }) => ({ x: point.x, y: point.y }) });
    const app = { canvas: createEl('canvas'), renderer: { name: 'webgl' } };
    const renderer = new FogOfWarRenderer(viewport as never, app as never, new EventEmitter() as never, store, () => map);
    views.push(renderer);
    return {
      store, fog: renderer,
      setFog: (next) => store.setState((state) => ({ objects: { ...state.objects, fog: next } })),
      pointer: (type, x, y) => { viewport.emit(type, { button: 0, global: { x, y } } as never); },
    };
  }

  it('fades an edit of the fog shown, until the fade has run', () => {
    const view = fogView();
    expect(view.fog.fading).toBe(false);
    view.setFog(BOTH);
    expect(view.fog.fading).toBe(true);
    vi.advanceTimersByTime(MOTION_NORMAL_MS / 2);
    expect(view.fog.fading).toBe(true);
    vi.advanceTimersByTime(MOTION_NORMAL_MS);
    expect(view.fog.fading).toBe(false);
  });

  it('fades undo and redo, an area flipped and the whole map hidden or revealed', () => {
    const view = fogView({});
    const hall = view.store.getState().addFogArea({ type: 'rectangle', x: 100, y: 100, width: 200, height: 200 })!;
    for (const edit of [
      (): void => { view.store.getState().flipFogArea(hall); },
      (): void => { view.store.temporal.getState().undo(); },
      (): void => { view.store.temporal.getState().redo(); },
      (): void => { view.store.getState().coverAllFog(MAP); },
      (): void => { view.store.getState().clearFog(); },
    ]) {
      vi.advanceTimersByTime(MOTION_NORMAL_MS + 50);
      expect(view.fog.fading).toBe(false);
      edit();
      expect(view.fog.fading).toBe(true);
    }
  });

  it('shows the first picture of a scene at once', () => {
    expect(fogView(BOTH).fog.fading).toBe(false);
  });

  it('starts none during a load nor at its end, and a load that begins ends one', () => {
    const view = fogView();
    view.store.setState({ isMapLoading: true });
    view.setFog(BOTH);
    expect(view.fog.fading).toBe(false);
    view.store.setState({ isMapLoading: false });
    expect(view.fog.fading).toBe(false);

    view.setFog(HALL);
    expect(view.fog.fading).toBe(true);
    view.store.setState({ isMapLoading: true });
    expect(view.fog.fading).toBe(false);
    // The fog that arrives with the end of the load
    view.store.setState((state) => ({ isMapLoading: false, objects: { ...state.objects, fog: BOTH } }));
    expect(view.fog.fading).toBe(false);
  });

  it('starts none for another level or another map, and ends one that runs', () => {
    const view = fogView();
    view.store.setState((state) => ({ viewedLevel: 'upper', objects: { ...state.objects, fog: BOTH } }));
    expect(view.fog.fading).toBe(false);
    view.setFog(HALL);
    expect(view.fog.fading).toBe(true);
    view.store.setState((state) => ({ viewedLevel: null, objects: { ...state.objects, fog: BOTH } }));
    expect(view.fog.fading).toBe(false);
    view.setFog(HALL);
    expect(view.fog.fading).toBe(true);
    view.store.setState((state) => ({ mapPath: 'maps/b.atlasmap', objects: { ...state.objects, fog: BOTH } }));
    expect(view.fog.fading).toBe(false);
  });

  it('starts none with reduced motion', () => {
    reduced = true;
    const view = fogView();
    view.setFog(BOTH);
    expect(view.fog.fading).toBe(false);
  });

  it('starts none for a stroke that is committed as it was shown, nor for one that is dropped', async () => {
    const view = fogView();
    view.store.getState().setFogTool({ shape: 'rectangle' });
    view.store.getState().setActiveTool('fog');
    view.pointer('pointerdown', 500, 100);
    view.pointer('pointermove', 700, 300);
    view.pointer('pointerup', 700, 300);
    expect(Object.keys(view.store.getState().objects.fog)).toHaveLength(2);
    expect(view.fog.fading).toBe(false);
    // What else the stroke writes in the same task was shown with it
    view.setFog(HALL);
    expect(view.fog.fading).toBe(false);

    view.pointer('pointerdown', 500, 100);
    view.pointer('pointermove', 700, 300);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(view.fog.fading).toBe(false);
    expect(Object.keys(view.store.getState().objects.fog)).toHaveLength(1);

    // An edit after it fades as any other
    await Promise.resolve();
    view.setFog(BOTH);
    expect(view.fog.fading).toBe(true);
  });

  it('shows a change at once that is too large to keep the picture before it: the whole of a very large map', () => {
    const huge = { x: 0, y: 0, width: 9000, height: 9000 };
    const view = fogView(HALL, huge);
    view.setFog(BOTH);
    expect(view.fog.fading).toBe(true);
    // The whole map covered while that fade runs: it ends, and the cover shows at once
    view.store.getState().coverAllFog(huge);
    expect(view.fog.fading).toBe(false);
    view.store.getState().clearFog();
    expect(view.fog.fading).toBe(false);
  });

  it('starts none for a change that lies off the canvas', () => {
    const view = fogView();
    view.setFog({ ...HALL, far: rect('far', 5, 5000) });
    expect(view.fog.fading).toBe(false);
  });

  it('lets a fade that runs go on under a stroke, which stays live', () => {
    const view = fogView();
    view.store.getState().setFogTool({ shape: 'rectangle' });
    view.store.getState().setActiveTool('fog');
    view.setFog(BOTH);
    expect(view.fog.fading).toBe(true);
    view.pointer('pointerdown', 500, 400);
    view.pointer('pointermove', 700, 600);
    view.pointer('pointerup', 700, 600);
    expect(view.fog.fading).toBe(true);
    vi.advanceTimersByTime(MOTION_NORMAL_MS + 50);
    expect(view.fog.fading).toBe(false);
  });

  it('shows the fog while what is left of it fades away, and not once it has', () => {
    const view = fogView();
    view.store.getState().clearFog();
    expect(view.fog.fading).toBe(true);
    expect(view.fog.getContainer().visible).toBe(true);
    vi.advanceTimersByTime(MOTION_NORMAL_MS + 50);
    expect(view.fog.getContainer().visible).toBe(false);
  });
});
