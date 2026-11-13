import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';
import type { LiveDrawing } from '../../../../src/app/annotations/madeDrawing';
import type { SharedDrawing, SharedStroke } from '../../../../src/app/online/protocol/index.ts';

/** What every stroke's view was last told to show, and which views are gone. */
const views: { shown: LiveDrawing | null; shows: number; gone: boolean }[] = [];

vi.mock('../../../../src/app/pixi/annotations/LiveStroke', () => ({
  LiveStroke: class {
    private readonly view = { shown: null as LiveDrawing | null, shows: 0, gone: false };
    constructor() {
      views.push(this.view);
    }
    show(_layer: Container, input: LiveDrawing): void {
      this.view.shown = { ...input, points: input.points.map(({ x, y }) => ({ x, y })) };
      this.view.shows += 1;
    }
    destroy(): void {
      this.view.gone = true;
    }
  },
}));

const { RemoteStrokes, STROKE_HOLD_MS } = await import('../../../../src/app/online/marks/RemoteStrokes.ts');

const INTERVAL = 100;
const FRAME = 10;
const layer = {} as Container;
const line = (points: number[], more: Partial<SharedDrawing> = {}): SharedDrawing => ({ type: 'pen', points, colour: '#e93147', width: 4, opacity: 1, ...more });
const gm = (more: Partial<SharedStroke> & Pick<SharedStroke, 'drawings'>): SharedStroke => ({ who: 'gm', n: 1, ...more });
const live = (): typeof views => views.filter((view) => !view.gone);
const xs = (view: (typeof views)[number] | undefined): number[] => view?.shown?.points.map((point) => point.x) ?? [];

describe('other people\'s drawings under way', () => {
  let strokes: InstanceType<typeof RemoteStrokes>;
  const run = (from: number, to: number): void => {
    for (let now = from; now <= to; now += FRAME) strokes.tick(now);
  };

  beforeEach(() => {
    views.length = 0;
    strokes = new RemoteStrokes({ layer: () => layer, zoom: () => 1, interval: INTERVAL });
  });

  it('lets a pen\'s stroke grow over the time its points took, its end moving on every frame', () => {
    strokes.update([gm({ drawings: [line([0, 0, 10, 0])], from: 0, span: 100 })], 0);
    strokes.update([gm({ drawings: [line([10, 0, 20, 0, 30, 0])], from: 1, span: 100 })], 100);
    const ends: number[] = [];
    for (let now = 0; now <= 220; now += FRAME) {
      strokes.tick(now);
      ends.push(xs(live()[0]).at(-1) ?? Number.NaN);
    }
    // Never backwards, never a jump of more than the points of one frame, and all of it in the end.
    for (let index = 1; index < ends.length; index += 1) {
      expect(ends[index]).toBeGreaterThanOrEqual(ends[index - 1]!);
      expect(ends[index]! - ends[index - 1]!).toBeLessThanOrEqual(3);
    }
    expect(xs(live()[0])).toEqual([0, 10, 20, 30]);
    expect(live()[0]?.shown).toMatchObject({ type: 'pen', color: '#e93147', width: 4 });
    expect(strokes.busy).toBe(false);
    const drawn = live()[0]?.shows;
    run(230, 400);
    expect(live()[0]?.shows).toBe(drawn);
  });

  it('leaves out the points a message tells again, and goes straight on over a message that never came', () => {
    strokes.update([gm({ drawings: [line([0, 0, 10, 0, 20, 0])], from: 0 })], 0);
    strokes.update([gm({ drawings: [line([10, 0, 20, 0, 30, 0])], from: 1, span: 100 })], 100);
    strokes.update([gm({ drawings: [line([70, 0, 80, 0])], from: 7, span: 100 })], 200);
    strokes.update([gm({ drawings: [line([80, 0, 90, 0])], from: 8, span: 100 })], 300);
    run(0, 600);
    expect(xs(live()[0])).toEqual([0, 10, 20, 30, 70, 80, 90]);
  });

  it('moves a shape from how it stood to how it is told, and shows every area of cells being filled', () => {
    const box = (right: number): SharedDrawing => line([0, 0, right, 0, right, 50, 0, 50, 0, 0], { shape: 'rectangle', fill: 'soft' });
    strokes.update([gm({ drawings: [box(100)] })], 0);
    run(0, 100);
    expect(xs(live()[0])).toEqual([0, 100, 100, 0, 0]);
    expect(live()[0]?.shown).toMatchObject({ type: 'rectangle', fill: 'soft' });
    strokes.update([gm({ drawings: [box(200)] })], 100);
    strokes.tick(150);
    expect(xs(live()[0])).toEqual([0, 150, 150, 0, 0]);
    run(160, 300);
    expect(xs(live()[0])).toEqual([0, 200, 200, 0, 0]);
    expect(strokes.busy).toBe(false);

    const cell = (x: number): SharedDrawing => line([x, 0, x + 70, 0, x + 70, 70, x, 70, x, 0], { shape: 'line', fill: 'solid', width: 0, opacity: 0.4 });
    strokes.update([gm({ n: 2, drawings: [cell(0), cell(140), cell(280)] })], 300);
    strokes.tick(300);
    expect(live().map((view) => view.shown?.points[0]?.x)).toEqual([0, 140, 280]);
    strokes.update([gm({ n: 2, drawings: [cell(0)] })], 400);
    strokes.tick(400);
    expect(live()).toHaveLength(1);
  });

  it('takes a dropped drawing off at once, and keeps one that was made until the drawing itself is told', () => {
    strokes.update([gm({ drawings: [line([0, 0, 10, 0])], from: 0 })], 0);
    run(0, 50);
    strokes.update([], 60);
    expect(live()).toHaveLength(0);

    strokes.update([gm({ n: 2, drawings: [line([0, 0, 10, 0, 20, 0])], from: 0, span: 100 })], 1000);
    strokes.tick(1010);
    strokes.update([gm({ n: 2, drawings: [], kept: true })], 1020);
    // All of it shows at once: the hand has let go.
    expect(xs(live()[0])).toEqual([0, 10, 20]);
    strokes.update([], 1100);
    run(1100, 1300);
    expect(live()).toHaveLength(1);
    expect(strokes.busy).toBe(true);
    strokes.drawingsTold(1310);
    expect(live()).toHaveLength(0);
    expect(strokes.busy).toBe(false);
  });

  it('lets a made drawing go once its time is over, and at once where the drawing was told a moment before', () => {
    strokes.update([gm({ drawings: [line([0, 0, 10, 0])], from: 0 })], 0);
    strokes.update([gm({ drawings: [], kept: true })], 100);
    // The next drawing begins while the one before still waits: both show.
    strokes.update([gm({ n: 2, drawings: [line([5, 5, 6, 6])], from: 0 })], 200);
    strokes.tick(200);
    expect(live()).toHaveLength(2);
    run(200, 100 + STROKE_HOLD_MS);
    expect(live()).toHaveLength(1);

    strokes.drawingsTold(2000);
    strokes.update([gm({ n: 2, drawings: [], kept: true })], 2100);
    expect(live()).toHaveLength(0);
    // Word that a drawing nobody was shown was made shows nothing.
    strokes.update([gm({ n: 9, drawings: [], kept: true })], 3000);
    expect(live()).toHaveLength(0);
  });

  it('keeps one drawing a sender, and clears all of them', () => {
    const ana = 'a'.repeat(20);
    strokes.update([gm({ drawings: [line([0, 0, 1, 1])], from: 0 }), { who: ana, n: 4, drawings: [line([9, 9, 8, 8])], from: 0 }], 0);
    strokes.tick(0);
    expect(live()).toHaveLength(2);
    strokes.update([{ who: ana, n: 5, drawings: [line([3, 3, 4, 4])], from: 0 }], 100);
    strokes.tick(100);
    expect(live()).toHaveLength(1);
    expect(live()[0]?.shown?.points[0]).toEqual({ x: 3, y: 3 });
    strokes.clear();
    expect(live()).toHaveLength(0);
  });
});
