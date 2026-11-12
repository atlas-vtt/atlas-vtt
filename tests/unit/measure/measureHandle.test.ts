import { describe, expect, it } from 'vitest';
import type { GridGeometry } from '../../../src/app/grid/gridDistance';
import { measureMovedBy } from '../../../src/app/measure/measureMove';
import type { KeptMeasure } from '../../../src/app/measure/measureTypes';
import { MEASURE_HANDLE_HIT_RADIUS, measureHandleAt, measureHandleLook } from '../../../src/app/pixi/measure/measureHandle';

const SQUARES: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
const HEXES: GridGeometry = { type: 'hex-vertical', size: 70, offsetX: 0, offsetY: 0 };

const kept = (id: string, shape: KeptMeasure['shape'], points: [number, number][], color?: string): KeptMeasure =>
  ({ id, kind: 'measure', shape, points: points.map(([x, y]) => ({ x, y })), ...(color && { color }) });

const RULER = kept('ruler', 'ruler', [[105, 105], [315, 105], [315, 315]]);
const CIRCLE = kept('circle', 'circle', [[525, 105], [665, 105]]);

describe('measureHandleAt', () => {
  it('hits a measurement at its first point alone: its corners, its end, its line and its area take no press', () => {
    expect(measureHandleAt([RULER, CIRCLE], { x: 108, y: 101 }, 1)).toEqual({ id: 'ruler', part: 'origin' });
    expect(measureHandleAt([RULER, CIRCLE], { x: 525, y: 105 + MEASURE_HANDLE_HIT_RADIUS }, 1)).toEqual({ id: 'circle', part: 'origin' });
    for (const [x, y] of [[315, 105], [315, 315], [210, 105], [595, 105], [665, 105], [525, 105 + MEASURE_HANDLE_HIT_RADIUS + 1]]) {
      expect(measureHandleAt([RULER, CIRCLE], { x: x!, y: y! }, 1)).toBeNull();
    }
  });

  it('keeps its reach on screen: half the world pixels at twice the zoom, more of them zoomed out', () => {
    const beside = { x: 105 + 10, y: 105 };
    expect(measureHandleAt([RULER], beside, 1)).not.toBeNull();
    expect(measureHandleAt([RULER], beside, 2)).toBeNull();
    expect(measureHandleAt([RULER], { x: 105 + 20, y: 105 }, 0.5)).not.toBeNull();
  });

  it('takes the nearest of two handles, and of two on one point the later measurement\'s, which lies on top', () => {
    const near = kept('near', 'ruler', [[112, 105], [400, 105]]);
    expect(measureHandleAt([RULER, near], { x: 110, y: 105 }, 1)?.id).toBe('near');
    expect(measureHandleAt([near, RULER], { x: 106, y: 105 }, 1)?.id).toBe('ruler');
    const twin = kept('twin', 'cone', [[105, 105], [105, 245]]);
    expect(measureHandleAt([RULER, twin], { x: 105, y: 105 }, 1)?.id).toBe('twin');
    expect(measureHandleAt([twin, RULER], { x: 105, y: 105 }, 1)?.id).toBe('ruler');
  });
});

describe('measureHandleLook', () => {
  const theme = { background: 0x2a2a2a, stroke: 0xffffff, accent: 0x4da6ff };
  const rest = { hovered: false, selected: false, dragging: false };

  it('rings the badge in the measurement\'s colour, in the accent where it names none', () => {
    expect(measureHandleLook(kept('a', 'cone', [[0, 0], [70, 0]], '#e93147'), rest, theme)).toMatchObject({ shape: 'cone', ringColor: 0xe93147, accent: null, lift: 1 });
    expect(measureHandleLook(RULER, rest, theme).ringColor).toBe(0x4da6ff);
  });

  it('moves a colour that would not show on the badge until it does', () => {
    const light = { background: 0xe3e3e3, stroke: 0x000000, accent: 0x7852ee };
    const ring = measureHandleLook(kept('a', 'ruler', [[0, 0], [70, 0]], '#ffffff'), rest, light).ringColor;
    expect(ring).not.toBe(0xffffff);
    expect(ring).toBeLessThan(0xe3e3e3);
  });

  it('lifts on hover, more while dragged, and rings the one whose popover is open in the accent', () => {
    expect(measureHandleLook(RULER, { ...rest, hovered: true }, theme).lift).toBeGreaterThan(1);
    expect(measureHandleLook(RULER, { ...rest, hovered: true, dragging: true }, theme).lift).toBeGreaterThan(measureHandleLook(RULER, { ...rest, hovered: true }, theme).lift);
    expect(measureHandleLook(RULER, { ...rest, selected: true }, theme).accent).toBe(0x4da6ff);
  });
});

describe('measureMovedBy', () => {
  const offsets = (from: readonly { x: number; y: number }[], to: readonly { x: number; y: number }[]): string[] =>
    from.map((point, index) => `${to[index]!.x - point.x},${to[index]!.y - point.y}`);

  it('moves every point the same way, so the measurement keeps its shape', () => {
    const moved = measureMovedBy('ruler', RULER.points, { x: 150, y: 80 }, SQUARES);
    expect(new Set(offsets(RULER.points, moved)).size).toBe(1);
    expect(moved).toHaveLength(3);
  });

  it('snaps a ruler\'s first point to the centre of the cell it comes to lie in', () => {
    expect(measureMovedBy('ruler', RULER.points, { x: 150, y: 80 }, SQUARES)).toEqual([{ x: 245, y: 175 }, { x: 455, y: 175 }, { x: 455, y: 385 }]);
    // A move that stays in the cell moves nothing.
    expect(measureMovedBy('ruler', RULER.points, { x: 20, y: -20 }, SQUARES)).toEqual(RULER.points);
  });

  it('keeps a ruler that was placed freely off the grid by as much from its first point on', () => {
    const free = [{ x: 110, y: 120 }, { x: 300, y: 200 }];
    expect(measureMovedBy('ruler', free, { x: 70, y: 0 }, SQUARES)).toEqual([{ x: 175, y: 105 }, { x: 365, y: 185 }]);
  });

  it('snaps an area\'s origin to the nearest cell centre, corner or edge middle, and on hexes to a centre or corner', () => {
    expect(measureMovedBy('circle', CIRCLE.points, { x: 44, y: 31 }, SQUARES)).toEqual([{ x: 560, y: 140 }, { x: 700, y: 140 }]);
    expect(measureMovedBy('cone', CIRCLE.points, { x: 30, y: 4 }, SQUARES)[0]).toEqual({ x: 560, y: 105 });
    const [origin, end] = measureMovedBy('circle', CIRCLE.points, { x: 44, y: 31 }, HEXES);
    expect(origin).not.toEqual({ x: 569, y: 136 });
    // No point of a hex lies farther from its centre and corners than a third of its width.
    expect(Math.hypot(origin!.x - 569, origin!.y - 136)).toBeLessThan(70 / 3 + 1);
    expect(end!.x - origin!.x).toBeCloseTo(140);
    expect(end!.y - origin!.y).toBeCloseTo(0);
  });

  it('places freely with the key that frees, and where there is no grid to snap to', () => {
    expect(measureMovedBy('ruler', RULER.points, { x: 150, y: 80 }, SQUARES, true)[0]).toEqual({ x: 255, y: 185 });
    expect(measureMovedBy('circle', CIRCLE.points, { x: 44, y: 31 }, null)).toEqual([{ x: 569, y: 136 }, { x: 709, y: 136 }]);
  });

  it('moves nothing of a measurement without points', () => {
    expect(measureMovedBy('ruler', [], { x: 10, y: 10 }, SQUARES)).toEqual([]);
  });
});
