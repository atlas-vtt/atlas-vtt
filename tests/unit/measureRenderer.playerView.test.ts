import { EventEmitter } from 'events';
import { EventBoundary, FederatedPointerEvent, Text, type Container, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MeasureRenderer } from '../../src/app/pixi/MeasureRenderer';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenFootprint } from '../../src/app/vision/measureOrigin';
import type { MeasurePlayersView } from '../../src/app/pixi/measurePartsVisibility';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

const GRID = 70;
const snap = (x: number, y: number): { x: number; y: number } => ({ x: Math.floor(x / GRID) * GRID + GRID / 2, y: Math.floor(y / GRID) * GRID + GRID / 2 });

interface Scene {
  measure: MeasureRenderer;
  viewport: Viewport;
  bus: EventEmitter;
  store: ReturnType<typeof createViewAtlasStore>;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void;
  /** Every measurement part on the viewport, the live ones first. */
  parts(): Container[];
  visible(): boolean[];
}

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

function scene(): Scene {
  const restoreGraphics = stubJsdomGraphics();
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events: { domElement: createEl('canvas') } as unknown as EventSystem });
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'measure-player-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/measure.atlasmap');
  const bus = new EventEmitter();
  const grid = { getOptions: () => ({ type: 'square', size: GRID, offsetX: 0, offsetY: 0 }), snapToCellCenter: snap } as unknown as GridSystem;
  const measure = new MeasureRenderer(viewport, bus, store, grid);
  const boundary = new EventBoundary(viewport);
  cleanup = (): void => {
    measure.destroy();
    viewport.destroy();
    restoreGraphics();
  };
  const parts = (): Container[] => viewport.children.slice();
  return {
    measure, viewport, bus, store, parts,
    visible: () => parts().map((part) => part.visible),
    pointer(type, x, y): void {
      const event = new FederatedPointerEvent(boundary);
      event.button = 0;
      event.global.set(x, y);
      viewport.emit(type, event);
    },
  };
}

/** A drag with the measure tool from (x0, y0) to (x1, y1). */
function measureFrom(s: Scene, x0: number, y0: number, x1 = x0 + 200, y1 = y0): void {
  s.pointer('pointerdown', x0, y0);
  s.pointer('pointermove', x1, y1);
  s.pointer('pointerup', x1, y1);
}

/** Players' view of the tokens: footprints, what they see in their frame and what the canvas shows them. */
function players(footprints: TokenFootprint[], seen: Set<string>, canvas: { players: boolean }): MeasurePlayersView & { seenAtStart: Mock<MeasurePlayersView['seenAtStart']> } {
  return {
    footprints: () => footprints,
    seenAtStart: vi.fn(() => (id: string) => seen.has(id)),
    seenOnCanvas: () => (canvas.players ? (id: string): boolean => seen.has(id) : null),
  };
}

const GOBLIN: TokenFootprint = { id: 'goblin', x: 100, y: 100, radius: 30 };
const HERO: TokenFootprint = { id: 'hero', x: 400, y: 100, radius: 30 };
const shownIn = (layers: { layer: unknown; visible: boolean }[], part: unknown): boolean | undefined => layers.find((entry) => entry.layer === part)?.visible;

describe('MeasureRenderer in the GM view', () => {
  it('shows and hides its parts exactly as it always did', () => {
    vi.useFakeTimers();
    const s = scene();
    const steps: boolean[][] = [s.visible()];
    s.store.getState().setActiveTool('measure');
    s.pointer('pointerdown', 100, 100);
    steps.push(s.visible());
    s.pointer('pointermove', 300, 100);
    steps.push(s.visible());
    s.pointer('pointerup', 300, 100);
    steps.push(s.visible());
    vi.advanceTimersByTime(2000);
    steps.push(s.visible());
    s.bus.emit('measure-persistence-changed', true);
    measureFrom(s, 100, 100);
    steps.push(s.visible());
    s.bus.emit('measure-shape-changed', 'circle');
    s.pointer('pointerdown', 400, 400);
    steps.push(s.visible());
    s.bus.emit('measure-shape-changed', 'cone');
    steps.push(s.visible());
    s.bus.emit('measure-persistence-changed', false);
    steps.push(s.visible());
    s.store.getState().setActiveTool('select');
    steps.push(s.visible());
    expect(steps).toEqual([
      [true, true, true],
      [true, true, true],
      [true, true, true],
      [true, true, true],
      [true, false, false],
      [true, false, false, true, true, true],
      [true, true, true, true, true, true],
      [true, false, false, true, true, true],
      [true, false, false],
      [true, false, false],
    ]);
  });
});

describe('MeasureRenderer and the players\' picture', () => {
  it('records the tokens under the start at the press, by the frame\'s sight then', () => {
    const s = scene();
    const seen = new Set(['hero']);
    const view = players([GOBLIN, HERO], seen, { players: false });
    s.measure.playersView = view;
    s.store.getState().setActiveTool('measure');
    s.pointer('pointerdown', 100, 100);
    s.pointer('pointermove', 300, 100);
    s.pointer('pointermove', 350, 100);
    expect(view.seenAtStart).toHaveBeenCalledTimes(1);
    const [graphics, pill, text] = s.parts();
    const layers = s.measure.getPlayerViewLayers((id) => seen.has(id));
    expect([shownIn(layers, graphics), shownIn(layers, pill), shownIn(layers, text)]).toEqual([false, false, false]);
    // The GM's canvas keeps the ruler.
    expect(s.visible()).toEqual([true, true, true]);
    s.pointer('pointerup', 350, 100);
  });

  it('records a token under the pressed point that the snapped start misses', () => {
    const s = scene();
    s.measure.playersView = players([{ id: 'goblin', x: 90, y: 100, radius: 12 }], new Set(), { players: false });
    s.store.getState().setActiveTool('measure');
    s.pointer('pointerdown', 100, 100);
    s.pointer('pointermove', 300, 100);
    expect(s.measure.getPlayerViewLayers(() => true).slice(0, 3).map((entry) => entry.visible)).toEqual([false, false, false]);
  });

  it('mirrors a measurement from a seen token or from empty floor as the GM view shows it', () => {
    const s = scene();
    const seen = new Set(['hero']);
    s.measure.playersView = players([GOBLIN, HERO], seen, { players: false });
    s.store.getState().setActiveTool('measure');
    s.pointer('pointerdown', 400, 100);
    s.pointer('pointermove', 600, 100);
    expect(s.measure.getPlayerViewLayers((id) => seen.has(id)).map((entry) => entry.visible)).toEqual([true, true, true]);
    s.pointer('pointerup', 600, 100);
    s.pointer('pointerdown', 800, 800);
    expect(s.measure.getPlayerViewLayers(() => false).map((entry) => entry.visible)).toEqual([true, true, true]);
  });

  it('keeps the origin with a persistent copy, drops it when the measurement clears, and forgets copies switched off', () => {
    const s = scene();
    const seen = new Set(['hero']);
    s.measure.playersView = players([GOBLIN, HERO], seen, { players: false });
    s.bus.emit('measure-persistence-changed', true);
    s.store.getState().setActiveTool('measure');
    measureFrom(s, 100, 100);
    measureFrom(s, 400, 100);
    const isSeen = (id: string): boolean => seen.has(id);
    const [, , , ...goblinRuler] = s.parts();
    const fromGoblin = s.measure.getPlayerViewLayers(isSeen);
    expect(goblinRuler.slice(0, 3).map((part) => shownIn(fromGoblin, part))).toEqual([false, false, false]);
    expect(goblinRuler.slice(3).map((part) => shownIn(fromGoblin, part))).toEqual([true, true, true]);
    // The goblin is revealed: a ruler started while it was unseen stays out for good.
    seen.add('goblin');
    expect(goblinRuler.slice(0, 3).map((part) => shownIn(s.measure.getPlayerViewLayers(isSeen), part))).toEqual([false, false, false]);
    // The hero leaves the players' sight, and the ruler from it goes with it until it is seen again.
    seen.delete('hero');
    expect(goblinRuler.slice(3).map((part) => shownIn(s.measure.getPlayerViewLayers(isSeen), part))).toEqual([false, false, false]);
    seen.add('hero');
    expect(goblinRuler.slice(3).map((part) => shownIn(s.measure.getPlayerViewLayers(isSeen), part))).toEqual([true, true, true]);
    // The live parts were cleared with their origin.
    expect(s.measure.getPlayerViewLayers(() => false).slice(0, 3).map((entry) => entry.visible)).toEqual([true, false, false]);
    s.bus.emit('measure-persistence-changed', false);
    expect(s.measure.getPlayerViewLayers(() => false)).toHaveLength(3);
  });

  it('hides by the rule on the canvas while it shows the players\' view, and gives the GM view back', () => {
    const s = scene();
    const canvas = { players: true };
    const seen = new Set(['hero']);
    s.measure.playersView = players([GOBLIN, HERO], seen, canvas);
    s.bus.emit('measure-persistence-changed', true);
    s.store.getState().setActiveTool('measure');
    measureFrom(s, 400, 100);
    s.pointer('pointerdown', 100, 100);
    s.pointer('pointermove', 300, 100);
    expect(s.visible()).toEqual([false, false, false, true, true, true]);
    seen.delete('hero');
    s.measure.refreshVisibility();
    expect(s.visible()).toEqual([false, false, false, false, false, false]);
    canvas.players = false;
    s.measure.refreshVisibility();
    expect(s.visible()).toEqual([true, true, true, true, true, true]);
    // A picture of the scene is the GM's, whatever the canvas shows.
    canvas.players = true;
    s.measure.refreshVisibility();
    expect(s.measure.getGmViewLayers().map((entry) => entry.visible)).toEqual([true, true, true, true, true, true]);
    s.pointer('pointerup', 300, 100);
  });

  it('keeps the hidden label at the zoom\'s size, so it shows right when it comes back', () => {
    const s = scene();
    s.measure.playersView = players([GOBLIN], new Set(), { players: true });
    s.store.getState().setActiveTool('measure');
    s.pointer('pointerdown', 100, 100);
    s.pointer('pointermove', 300, 100);
    const text = s.parts()[2];
    if (!(text instanceof Text)) throw new Error('Expected the live label');
    expect(text.visible).toBe(false);
    s.viewport.scale.set(0.5);
    s.viewport.emit('zoomed', { viewport: s.viewport, type: 'wheel' });
    expect(text.style.fontSize).toBe(32);
  });

  it('asks nothing of the players\' sight while there is no measurement', () => {
    const s = scene();
    const seenOnCanvas = vi.fn(() => null);
    s.measure.playersView = { footprints: () => [], seenAtStart: () => () => true, seenOnCanvas };
    s.measure.refreshVisibility();
    expect(seenOnCanvas).not.toHaveBeenCalled();
  });
});
