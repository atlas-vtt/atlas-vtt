import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDomHost } from '../../src/app/host/dom';
import { FogCanvasCompositor } from '../../src/app/pixi/fog/FogCanvasCompositor';
import { renderBrush } from '../../src/app/pixi/fog/fogRenderUtils';
import type { FogBrushStroke, FogOperation, FogRectangleFill } from '../../src/app/types/fogTypes';

const bounds = { x: -32, y: -32, width: 128, height: 128 };
const owned: FogCanvasCompositor[] = [];

function rect(id: string, timestamp: number, x: number, y: number, width: number, height: number, isErasing = false): FogRectangleFill {
  return { id, timestamp, kind: 'fog', type: 'rectangle', x, y, width, height, isErasing };
}

function brush(radius: number, isErasing = false): FogBrushStroke {
  return { id: 'brush', timestamp: 4, kind: 'fog', type: 'brush', isErasing,
    brushRadius: radius, points: [{ x: 0, y: 16 }, { x: 64, y: 16 }] };
}

function compositor(): FogCanvasCompositor {
  const result = new FogCanvasCompositor(bounds, 1);
  owned.push(result);
  return result;
}

function alpha(c: FogCanvasCompositor, x: number, y: number): number {
  const context = c.getCanvas().getContext('2d');
  if (!context) throw new Error('Missing Canvas context');
  const b = c.getBounds();
  return context.getImageData(x - b.x, y - b.y, 1, 1).data[3]!;
}

beforeEach(() => {
  vi.stubGlobal('createEl', (tag: string) => {
    if (tag !== 'canvas') throw new Error(`Unexpected element: ${tag}`);
    return getDomHost().createCanvas();
  });
});

afterEach(() => {
  for (const c of owned.splice(0)) c.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('committed fog on Canvas', () => {
  it('draws an erased hole and a later painted island with the same nonzero shape', () => {
    const c = compositor();
    const ops = {
      outer: rect('outer', 1, -16, -16, 96, 96),
      hole: rect('hole', 2, 0, 0, 64, 64, true),
      island: rect('island', 3, 16, 16, 16, 16),
    };
    c.composite(ops);
    expect(alpha(c, -8, -8)).toBe(255);
    expect(alpha(c, 8, 8)).toBe(0);
    expect(alpha(c, 24, 24)).toBe(255);
    expect(alpha(c, 88, 88)).toBe(0);
  });

  it('unions separately painted opposite-winding lassos', () => {
    const c = compositor();
    const points = [{ x: 0, y: 0 }, { x: 64, y: 0 }, { x: 64, y: 64 }, { x: 0, y: 64 }];
    const first: FogOperation = { id: 'first', kind: 'fog', type: 'lasso', timestamp: 1, isErasing: false, points };
    c.composite({ first, second: { ...first, id: 'second', timestamp: 2, points: [...points].reverse() } });
    expect(alpha(c, 32, 32)).toBe(255);
  });

  it('uses insertion order for tied timestamps', () => {
    const c = compositor();
    const paint = rect('z', 1, 0, 0, 64, 64);
    const erase = rect('a', 1, 16, 16, 32, 32, true);
    c.composite({ z: paint, a: erase });
    expect(alpha(c, 24, 24)).toBe(0);
    c.composite({ a: erase, z: paint });
    expect(alpha(c, 24, 24)).toBe(255);
  });

  it('keeps a temporary erase separate from saved coverage', () => {
    const c = compositor();
    const ops = { paint: rect('paint', 1, 0, 0, 64, 64) };
    c.composite(ops, brush(8, true));
    expect(alpha(c, 32, 16)).toBe(0);
    expect(alpha(c, 32, 40)).toBe(255);
    c.composite(ops);
    expect(alpha(c, 32, 16)).toBe(255);
  });

  it('redraws committed geometry at changed bounds and resets between maps', () => {
    const c = compositor();
    const ops = { paint: rect('paint', 1, 0, 0, 64, 64) };
    c.composite(ops);
    c.updateBounds({ x: -64, y: -64, width: 192, height: 192 });
    c.composite(ops);
    expect(alpha(c, 32, 32)).toBe(255);
    expect(alpha(c, -48, -48)).toBe(0);
    c.reset();
    c.composite({});
    expect(alpha(c, 32, 32)).toBe(0);
    c.composite(ops);
    expect(alpha(c, 32, 32)).toBe(255);
  });

  it.each([false, true])('covers the full canvas after invalid committed geometry (erase=%s), then recovers', (erasing) => {
    const c = compositor();
    const paint = rect('paint', 1, 0, 0, 64, 64);
    c.composite({ paint });
    const invalid = rect('invalid', 2, Number.NaN, 0, 16, 16, erasing);
    const bad = erasing ? { paint, invalid } : { invalid };
    c.composite(bad, brush(8, true));
    expect(alpha(c, -24, -24)).toBe(255);
    expect(alpha(c, 32, 16)).toBe(255);
    expect(alpha(c, 88, 88)).toBe(255);
    c.composite({ paint });
    expect(alpha(c, -24, -24)).toBe(0);
    expect(alpha(c, 32, 16)).toBe(255);
  });

  it('fails closed on invalid preview input and recovers when the preview ends', () => {
    const c = compositor();
    const ops = { paint: rect('paint', 1, 0, 0, 64, 64) };
    c.composite(ops, brush(Number.NaN, true));
    expect(alpha(c, 88, 88)).toBe(255);
    c.composite(ops);
    expect(alpha(c, 88, 88)).toBe(0);
  });

  it('fills the whole canvas if drawing the committed path throws', () => {
    const c = compositor();
    const context = c.getCanvas().getContext('2d');
    if (!context) throw new Error('Missing Canvas context');
    vi.spyOn(context, 'fill').mockImplementationOnce(() => { throw new Error('Draw failed'); });
    c.composite({ paint: rect('paint', 1, 0, 0, 64, 64) });
    expect(alpha(c, -24, -24)).toBe(255);
    expect(alpha(c, 32, 32)).toBe(255);
  });

  it.each([0, Number.MIN_VALUE, Number.EPSILON])('treats a sub-grid brush as empty (radius=%s)', (radius) => {
    const c = compositor();
    const context = c.getCanvas().getContext('2d');
    if (!context) throw new Error('Missing Canvas context');
    const stroke = vi.spyOn(context, 'stroke');
    renderBrush(context, brush(radius), bounds, 1, 0, 0);
    expect(stroke).not.toHaveBeenCalled();
    const ops = { paint: rect('paint', 1, 0, 0, 64, 64) };
    for (const erasing of [false, true]) {
      c.composite({ ...ops, zero: brush(radius, erasing) }, brush(radius, erasing));
      expect(alpha(c, 32, 16)).toBe(255);
      expect(alpha(c, 88, 88)).toBe(0);
    }
  });
});

/** A slow drag: many points a fraction of a pixel apart, as pointer moves deliver them. */
function slowDrag(): { x: number; y: number }[] {
  let seed = 7;
  const next = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const points = [];
  let x = 10;
  let y = 32;
  for (let i = 0; i < 1500; i++) {
    x += next() * 0.08 - 0.01;
    y += next() * 0.6 - 0.3;
    points.push({ x, y });
  }
  return points;
}

function alphas(c: FogCanvasCompositor): Uint8ClampedArray {
  const canvas = c.getCanvas();
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Missing Canvas context');
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return data.filter((_, index) => index % 4 === 3);
}

function distanceToPolyline(points: readonly { x: number; y: number }[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
  }
  return best;
}

describe('the brush stroke under way', () => {
  it.each([false, true])('is drawn as it is committed, without a lattice inside (erase=%s)', (erasing) => {
    const live = compositor();
    const saved = compositor();
    const base = erasing ? { paint: rect('paint', 1, -32, -32, 128, 128) } : {};
    const op: FogBrushStroke = { ...brush(37.3, erasing), points: slowDrag() };
    live.composite(base, op);
    saved.composite({ ...base, brush: op });
    const shown = alphas(live);
    const committed = alphas(saved);
    const width = live.getCanvas().width;
    const stroked = erasing ? 0 : 255;
    for (let i = 0; i < shown.length; i++) {
      const distance = distanceToPolyline(op.points, bounds.x + (i % width) + 0.5, bounds.y + Math.floor(i / width) + 0.5);
      const rim = Math.abs(distance - op.brushRadius) < 1.5;
      if (!rim && distance < op.brushRadius) expect(shown[i]).toBe(stroked);
      // Release must not move the stroke: off its anti-aliased rim both pictures agree.
      if (!rim) expect(shown[i]).toBe(committed[i]);
    }
  });

  it('draws a single point as the brush disc', () => {
    const c = compositor();
    c.composite({}, { ...brush(8), points: [{ x: 32, y: 32 }] });
    expect(alpha(c, 32, 32)).toBe(255);
    expect(alpha(c, 37, 32)).toBe(255);
    expect(alpha(c, 42, 32)).toBe(0);
  });
});
