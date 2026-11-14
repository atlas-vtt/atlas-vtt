// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { EventEmitter } from 'eventemitter3';
import type { FogShape } from '../../src/app/fog/fogToolChoices';
import type { MapRect } from '../../src/app/grid/cellNumbering';
import { FogCanvasCompositor } from '../../src/app/pixi/fog/FogCanvasCompositor';
import { FogOfWarRenderer } from '../../src/app/pixi/fog/FogOfWarRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { FogOperation } from '../../src/app/types/fogTypes';
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
const COVER: Record<string, FogOperation> = { all: { id: 'all', kind: 'fog', timestamp: 1, type: 'rectangle', isErasing: false, x: 0, y: 0, width: 1000, height: 800 } };

type Place = readonly [number, number];

/** Each shape that is no brush stroke, drawn up to the pointer's last place and no further. */
const SHAPES: Record<Exclude<FogShape, 'brush' | 'room'>, { clicks: readonly Place[]; moves: readonly Place[] }> = {
  rectangle: { clicks: [], moves: [[210, 140], [420, 350], [490, 420]] },
  lasso: { clicks: [], moves: [[200, 150], [460, 160], [470, 400], [220, 380]] },
  cells: { clicks: [], moves: [[100, 100], [300, 110], [310, 300]] },
  polygon: { clicks: [[210, 140], [490, 140], [490, 420]], moves: [[210, 420]] },
};

interface FogView {
  store: ViewAtlasStore;
  fog: FogOfWarRenderer;
  /** Every stroke drawn on the fog's canvas, which the players' picture shows, since the view was made. */
  strokesOnCanvas(): unknown[];
  /** The wash over what a shape will reveal: whether the GM's canvas shows any, and whether the players' frame and a picture of the scene leave its layer out. */
  wash(): { shown: boolean; hiddenFromPlayers: boolean; hiddenFromPictures: boolean };
  /** Draws the shape chosen up to its last place, the pointer still down (a polygon: before the click that closes it). */
  draw(shape: keyof typeof SHAPES, alt: boolean): void;
  /** Ends what `draw` began: the pointer is released, or the polygon closed. */
  finish(shape: keyof typeof SHAPES, alt: boolean): void;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', place: Place, alt: boolean): void;
  escape(): void;
  fogCount(): number;
}

describe('what a shape will reveal, before it is committed', () => {
  const views: FogOfWarRenderer[] = [];
  let composite: MockInstance<FogCanvasCompositor['composite']>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    // jsdom has no Canvas 2D implementation.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => (): void => undefined }) as never);
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: false }) as MediaQueryList);
    composite = vi.spyOn(FogCanvasCompositor.prototype, 'composite');
  });

  afterEach(() => {
    for (const view of views.splice(0)) view.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** A covered map in the GM's view with the fog tool chosen, on a renderer that can mix two pictures. */
  function fogView(tool: 'fog' | 'eraser', shape: FogShape): FogView {
    const store = createViewAtlasStore(createInMemoryApp().app, `fog-reveal-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.setState((state) => ({ mapPath: 'maps/a.atlasmap', isMapLoading: false, isGMView: true, objects: { ...state.objects, fog: COVER } }));
    const same = (point: { x: number; y: number }): { x: number; y: number } => ({ x: point.x, y: point.y });
    const viewport = Object.assign(new Container(), { options: {}, scale: { x: 1, y: 1 }, toWorld: same, toScreen: (x: number, y: number) => same({ x, y }) });
    const app = { canvas: createEl('canvas'), renderer: { name: 'webgl' } };
    const fog = new FogOfWarRenderer(viewport as never, app as never, new EventEmitter() as never, store, () => MAP);
    views.push(fog);
    store.getState().setFogTool({ shape });
    store.getState().setActiveTool(tool);
    composite.mockClear();
    const pointer = (type: 'pointerdown' | 'pointermove' | 'pointerup', [x, y]: Place, altKey: boolean): void => {
      viewport.emit(type, { button: 0, global: { x, y }, altKey, shiftKey: false, ctrlKey: false, metaKey: false } as never);
    };
    const washLayer = fog.getContainer().getChildByLabel('fog-reveal-wash') as Graphics;
    const hides = (layers: readonly { layer: unknown; visible: boolean }[]): boolean => layers.some((entry) => entry.layer === washLayer && !entry.visible);
    return {
      store, fog, pointer,
      strokesOnCanvas: () => composite.mock.calls.map(([, stroke]) => stroke as unknown).filter((stroke) => stroke !== undefined),
      wash: () => ({ shown: washLayer.getLocalBounds().width > 0, hiddenFromPlayers: hides(fog.getPlayerViewLayers()), hiddenFromPictures: hides(fog.getGmViewLayers()) }),
      draw: (name, alt) => {
        const { clicks, moves } = SHAPES[name];
        for (const place of clicks) {
          pointer('pointerdown', place, alt);
          pointer('pointerup', place, alt);
        }
        const [first, ...rest] = moves;
        if (clicks.length === 0) pointer('pointerdown', first!, alt);
        for (const place of clicks.length === 0 ? rest : moves) pointer('pointermove', place, alt);
      },
      finish: (name, alt) => {
        const { clicks, moves } = SHAPES[name];
        const last = moves[moves.length - 1]!;
        if (clicks.length === 0) {
          pointer('pointerup', last, alt);
          return;
        }
        // The polygon's last corner, and the click on its first that closes it.
        pointer('pointerdown', last, alt);
        pointer('pointerup', last, alt);
        pointer('pointerdown', clicks[0]!, alt);
        pointer('pointerup', clicks[0]!, alt);
      },
      escape: () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); },
      fogCount: () => Object.keys(store.getState().objects.fog).length,
    };
  }

  const shapes = Object.keys(SHAPES) as (keyof typeof SHAPES)[];
  /** The revealing tool, and the hiding one with Alt held. */
  const revealing = [['eraser', false], ['fog', true]] as const;

  it.each(shapes.flatMap((shape) => revealing.map(([tool, alt]) => [shape, tool, alt] as const)))(
    'draws nothing of a %s on the fog\'s canvas (%s, Alt %s): the GM alone sees what it will reveal, and Escape leaves the fog as it was',
    (shape, tool, alt) => {
      const view = fogView(tool, shape);
      view.draw(shape, alt);
      expect(view.strokesOnCanvas()).toEqual([]);
      expect(view.wash()).toEqual({ shown: true, hiddenFromPlayers: true, hiddenFromPictures: true });
      view.escape();
      expect(view.strokesOnCanvas()).toEqual([]);
      expect(view.wash().shown).toBe(false);
      expect(view.store.getState().objects.fog).toBe(COVER);
      expect(view.fog.fading).toBe(false);
    },
  );

  it.each(shapes.flatMap((shape) => revealing.map(([tool, alt]) => [shape, tool, alt] as const)))(
    'fades a committed %s that reveals (%s, Alt %s) like any change: it was never on the canvas',
    (shape, tool, alt) => {
      const view = fogView(tool, shape);
      view.draw(shape, alt);
      view.finish(shape, alt);
      expect(view.fogCount()).toBeGreaterThan(1);
      expect(Object.values(view.store.getState().objects.fog).filter((operation) => operation.id !== 'all').every((operation) => operation.isErasing)).toBe(true);
      expect(view.strokesOnCanvas()).toEqual([]);
      expect(view.wash().shown).toBe(false);
      expect(view.fog.fading).toBe(true);
      vi.advanceTimersByTime(MOTION_NORMAL_MS + 50);
      expect(view.fog.fading).toBe(false);
    },
  );

  it.each(shapes)('leaves nothing of an erasing %s on the map when the tool is left, or the players\' view shows, while it is under way', (shape) => {
    for (const leave of [
      (view: ReturnType<typeof fogView>): void => { view.store.getState().setActiveTool('move'); },
      (view: ReturnType<typeof fogView>): void => { view.store.getState().setGMView(false); },
    ]) {
      const view = fogView('eraser', shape);
      view.draw(shape, false);
      expect(view.wash().shown).toBe(true);
      leave(view);
      expect(view.wash().shown).toBe(false);
      expect(view.strokesOnCanvas()).toEqual([]);
      expect(view.store.getState().objects.fog).toBe(COVER);
    }
  });

  it.each(shapes)('leaves nothing drawn but the fog once an erasing %s is let go: no wash, no outline, no mark, and nothing remembered', (shape) => {
    const view = fogView('eraser', shape);
    view.draw(shape, false);
    view.finish(shape, false);
    expect(view.wash().shown).toBe(false);
    // Every mark of the tool in the fog's layer is empty: the outline of what was under way, the snapping guide, the menu's mark.
    const marks = view.fog.getContainer().children.filter((child): child is Graphics => child instanceof Graphics);
    expect(marks.length).toBeGreaterThan(2);
    expect(marks.filter((mark) => mark.visible && mark.getLocalBounds().width > 0).map((mark) => mark.label)).toEqual([]);
    expect(Object.values(view.store.getState().objects.fog).some((operation) => 'area' in operation)).toBe(false);
  });

  it.each(shapes)('draws a %s that hides on the fog\'s canvas while it is under way, and commits it without a fade', (shape) => {
    const view = fogView('fog', shape);
    view.store.getState().clearFog();
    vi.advanceTimersByTime(MOTION_NORMAL_MS + 50);
    composite.mockClear();
    view.draw(shape, false);
    expect(view.strokesOnCanvas().length).toBeGreaterThan(0);
    expect(view.wash().shown).toBe(false);
    view.finish(shape, false);
    expect(view.fogCount()).toBeGreaterThan(0);
    expect(view.fog.fading).toBe(false);
  });

  it.each([['eraser', false, true], ['fog', true, true], ['fog', false, false], ['eraser', true, false]] as const)(
    'draws the brush on the fog\'s canvas as it goes (%s, Alt %s): it wipes fog away live, and commits without a fade',
    (tool, alt, reveals) => {
      const view = fogView(tool, 'brush');
      view.pointer('pointerdown', [300, 300], alt);
      view.pointer('pointermove', [420, 330], alt);
      const strokes = view.strokesOnCanvas();
      expect(strokes.length).toBeGreaterThan(0);
      expect(strokes[strokes.length - 1]).toMatchObject({ type: 'brush', isErasing: reveals });
      expect(view.wash().shown).toBe(false);
      view.pointer('pointerup', [420, 330], alt);
      expect(view.fogCount()).toBe(2);
      expect(view.fog.fading).toBe(false);
    },
  );

  it('takes a hiding shape off the canvas when Alt turns it around, and puts it back when Alt is let go', () => {
    const view = fogView('fog', 'rectangle');
    view.draw('rectangle', false);
    expect(view.strokesOnCanvas().length).toBeGreaterThan(0);
    composite.mockClear();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true }));
    // The canvas is drawn once more, as the scene holds the fog.
    expect(composite).toHaveBeenCalledTimes(1);
    expect(view.strokesOnCanvas()).toEqual([]);
    expect(view.wash().shown).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }));
    expect(view.strokesOnCanvas()).toHaveLength(1);
    expect(view.wash().shown).toBe(false);
  });

  it('draws the canvas for no pointer move of a shape that will reveal', () => {
    const view = fogView('eraser', 'rectangle');
    view.draw('rectangle', false);
    expect(composite).not.toHaveBeenCalled();
  });

  it('shows fog that changes under a shape that will reveal at once, as the scene holds it', () => {
    const view = fogView('eraser', 'rectangle');
    view.draw('rectangle', false);
    view.store.getState().clearFog();
    expect(composite).toHaveBeenCalled();
    expect(view.strokesOnCanvas()).toEqual([]);
    expect(composite.mock.lastCall?.[0]).toBe(view.store.getState().objects.fog);
    expect(view.wash().shown).toBe(true);
  });
});
