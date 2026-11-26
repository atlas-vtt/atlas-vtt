import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { openShapeOf } from '../../src/app/pixi/utils/openShape';
import { SETTLE_MS } from '../../src/app/pixi/input/touchGestures';
import { FogGesture } from '../../src/app/pixi/fog/FogGesture';
import { LightingController } from '../../src/app/pixi/lighting/LightingController';
import { MeasureInput } from '../../src/app/pixi/measure/MeasureInput';
import type { Measurement } from '../../src/app/measure/measureTypes';
import type { FogOperation } from '../../src/app/types/fogTypes';
import { EventEmitter } from '../../src/app/utils/typedEmitter';
import { frame, touch, touchMaps, VIEW, wait, type Point, type TouchMap } from './touchHarness';

// The menus are React's; nothing here opens one.
vi.mock('../../src/app/react/root/ContextMenuContext', async (original) => ({
  ...(await original<typeof import('../../src/app/react/root/ContextMenuContext')>()),
  openContextMenuGlobal: vi.fn(() => true),
  closeContextMenuGlobal: vi.fn(),
}));

const { map } = touchMaps();
/** Between two taps: longer than a double tap waits, so each tap is its own. */
const BETWEEN_TAPS = 450;
/** Long enough for a resting finger's press to have reached a tool that takes presses as they come. */
const RESTED = SETTLE_MS + 100;

async function tap(at: Point): Promise<void> {
  await touch.down(at);
  await wait(60);
  await touch.up();
  await wait(BETWEEN_TAPS);
  await frame();
}

const worldAt = (m: TouchMap, at: Point): Point => {
  const world = m.viewport.toWorld(at.x, at.y);
  return { x: world.x, y: world.y };
};

async function rest(m: TouchMap): Promise<void> {
  let before = { x: m.viewport.x, y: m.viewport.y };
  for (let i = 0; i < 300; i++) {
    await frame();
    const now = { x: m.viewport.x, y: m.viewport.y };
    if (i > 2 && now.x === before.x && now.y === before.y) return;
    before = now;
  }
}

/**
 * Two fingers move the map by `by`: the first comes down and rests long enough for its press to
 * reach a tool, then the second lands and both go the same way.
 */
async function panWithTwo(m: TouchMap, first: Point, second: Point, by: Point): Promise<void> {
  await touch.down(first);
  await wait(RESTED);
  await touch.down(first, second);
  const to = [first, second].map(({ x, y }) => ({ x: x + by.x, y: y + by.y }));
  await touch.glide([first, second], to, 6);
  await touch.up(to[1]!);
  await touch.up();
  await rest(m);
  await wait(BETWEEN_TAPS);
}

const near = (a: Point, b: Point, slack = 1.5): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= slack;

describe('a wall chain under fingers', () => {
  const A: Point = { x: 420, y: 140 };
  const B: Point = { x: 620, y: 300 };
  const C: Point = { x: 520, y: 400 };

  async function withWalls(): Promise<{ m: TouchMap; walls: () => { p1: Point; p2: Point }[]; done: () => void }> {
    const m = await map();
    const controller = new LightingController({
      viewport: m.viewport, app: m.app, store: m.store, eventBus: new EventEmitter(), obsApp: m.obsidian, viewId: 'touch-shapes',
      bounds: () => ({ x: 0, y: 0, width: VIEW.width, height: VIEW.height }), albedo: () => null,
    });
    controller.wire(m.tokens);
    m.taps.lighting = () => controller.tapPlacing();
    m.store.getState().setActiveTool('wall');
    m.store.getState().setLightingTool({ mode: 'draw', drawMode: 'point-to-point' });
    m.store.getState().setToolSwitch('lightingSnap', false);
    await frame();
    return { m, walls: () => Object.values(m.store.getState().objects.walls), done: () => controller.destroy() };
  }

  it('a tap, a pan with two fingers, a tap: one wall between the two taps, and the pan placed no corner', async () => {
    const { m, walls, done } = await withWalls();
    try {
      const start = worldAt(m, A);
      await tap(A);
      expect(openShapeOf(m.store).state).toEqual({ canFinish: true, canGoBack: false });
      const camera = m.viewport.x;
      await panWithTwo(m, { x: 250, y: 330 }, { x: 370, y: 330 }, { x: -90, y: -40 });
      expect(m.viewport.x).toBeLessThan(camera - 60);
      expect(walls()).toEqual([]);
      expect(openShapeOf(m.store).state).toEqual({ canFinish: true, canGoBack: false });
      const end = worldAt(m, B);
      await tap(B);
      expect(walls()).toHaveLength(1);
      expect(near(walls()[0]!.p1, start)).toBe(true);
      expect(near(walls()[0]!.p2, end)).toBe(true);
      // The chain goes on under a finger: one finger that moves pans, and the next tap is the next corner.
      await touch.down({ x: 300, y: 200 });
      await wait(RESTED);
      await touch.glide([{ x: 300, y: 200 }], [{ x: 340, y: 230 }], 5);
      await touch.up();
      await rest(m);
      await wait(BETWEEN_TAPS);
      expect(walls()).toHaveLength(1);
      const third = worldAt(m, C);
      await tap(C);
      expect(walls()).toHaveLength(2);
      expect(near(walls()[1]!.p2, third)).toBe(true);
      expect(m.steps()).toBe(0);
      openShapeOf(m.store).finish();
      expect(openShapeOf(m.store).state).toBeNull();
      expect(m.steps()).toBe(1);
    } finally {
      done();
    }
  });

  it('two fingers that move the map before any corner begin no chain, though the first rested', async () => {
    const { m, walls, done } = await withWalls();
    try {
      await panWithTwo(m, { x: 250, y: 330 }, { x: 370, y: 330 }, { x: 70, y: 30 });
      expect(openShapeOf(m.store).state).toBeNull();
      expect(walls()).toEqual([]);
      expect(m.steps()).toBe(0);
    } finally {
      done();
    }
  });
});

describe('the fog tool\'s polygon under fingers', () => {
  it('takes a corner from every tap and none from fingers that move the map, one or two', async () => {
    const m = await map();
    const shown: FogOperation[] = [];
    const layer = m.viewport.addChild(new Container());
    const gesture = new FogGesture({
      layer, viewport: m.viewport, canvas: () => m.canvas, store: m.store,
      host: { showStroke: (stroke) => { if (stroke) shown.push(stroke); }, showCommitted: () => undefined },
    });
    const stop = m.store.subscribe((state, previous) => {
      if (state.fogTool !== previous.fogTool) gesture.follow(state.fogTool);
    });
    m.store.setState((state) => ({ grid: { ...state.grid, snapToGrid: false } }));
    m.store.getState().setToolSwitch('fogSnap', false);
    m.store.getState().setFogTool({ shape: 'polygon' });
    m.store.getState().setActiveTool('fog');
    await frame();
    // Setting the grid up was a step of its own.
    const steps = m.steps();
    try {
      const taps: Point[] = [{ x: 420, y: 120 }, { x: 640, y: 160 }, { x: 560, y: 380 }];
      const corners: Point[] = [];
      corners.push(worldAt(m, taps[0]!));
      await tap(taps[0]!);
      await panWithTwo(m, { x: 250, y: 330 }, { x: 370, y: 330 }, { x: -60, y: 20 });
      corners.push(worldAt(m, taps[1]!));
      await tap(taps[1]!);
      // One finger that moves pans too: the polygon has nothing to drag.
      const before = m.viewport.x;
      await touch.down({ x: 300, y: 250 });
      await wait(RESTED);
      await touch.glide([{ x: 300, y: 250 }], [{ x: 360, y: 280 }], 5);
      await touch.up();
      await rest(m);
      await wait(BETWEEN_TAPS);
      expect(m.viewport.x).toBeGreaterThan(before + 30);
      corners.push(worldAt(m, taps[2]!));
      await tap(taps[2]!);
      expect(openShapeOf(m.store).state).toEqual({ canFinish: true, canGoBack: true });
      openShapeOf(m.store).finish();
      const fog = Object.values(m.store.getState().objects.fog);
      expect(fog).toHaveLength(1);
      const points = (fog[0] as FogOperation & { points: Point[] }).points;
      expect(points).toHaveLength(3);
      points.forEach((point, index) => expect(near(point, corners[index]!)).toBe(true));
      expect(m.steps()).toBe(steps + 1);
    } finally {
      stop();
      gesture.destroy();
    }
  });
});

describe('a ruler placed tap by tap', () => {
  it('keeps its corners through a pan with two fingers whose first press reached the tool, and ends from the strip\'s button', async () => {
    const m = await map();
    const finished: Measurement[] = [];
    let cancelled = 0;
    const input = new MeasureInput(m.viewport, {
      shape: () => 'ruler',
      point: (world) => ({ x: world.x, y: world.y }),
      takePress: () => false,
      started: () => undefined,
      changed: () => undefined,
      finished: (measurement) => { finished.push(measurement); },
      cancelled: () => { cancelled++; },
    }, { typed: () => false, areMaps: () => true }, undefined, openShapeOf(m.store));
    m.store.getState().setActiveTool('measure');
    input.setEnabled(true);
    await frame();
    try {
      const first = worldAt(m, { x: 420, y: 140 });
      await tap({ x: 420, y: 140 });
      const second = worldAt(m, { x: 600, y: 200 });
      await tap({ x: 600, y: 200 });
      expect(openShapeOf(m.store).state).toEqual({ canFinish: true, canGoBack: true });
      await panWithTwo(m, { x: 250, y: 330 }, { x: 370, y: 330 }, { x: -80, y: 30 });
      expect(cancelled).toBe(0);
      expect(input.measuring).toBe(true);
      const third = worldAt(m, { x: 520, y: 380 });
      await tap({ x: 520, y: 380 });
      openShapeOf(m.store).finish();
      expect(finished).toHaveLength(1);
      const points = finished[0]!.points;
      expect(points).toHaveLength(3);
      [first, second, third].forEach((point, index) => expect(near(points[index]!, point)).toBe(true));
      // A ruler dragged with one finger is dropped when the second lands.
      await touch.down({ x: 300, y: 150 });
      await touch.glide([{ x: 300, y: 150 }], [{ x: 380, y: 190 }], 4);
      expect(input.measuring).toBe(true);
      await touch.down({ x: 380, y: 190 }, { x: 500, y: 300 });
      await frame();
      expect(input.measuring).toBe(false);
      expect(cancelled).toBe(1);
      await touch.up();
    } finally {
      input.destroy();
    }
  });
});
