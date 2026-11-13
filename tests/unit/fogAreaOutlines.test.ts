import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { keyholed } from '../../src/app/fog/fogKeyhole';
import { drawAreaOutlines } from '../../src/app/pixi/fog/fogAreaOutlines';

interface Segment { from: { x: number; y: number }; to: { x: number; y: number } }

/** A Graphics that records the lines traced into it. */
function recorder(): { g: Graphics; segments: Segment[] } {
  const segments: Segment[] = [];
  let at = { x: 0, y: 0 };
  let start = at;
  const g = {
    clear: () => g,
    moveTo: (x: number, y: number) => { at = { x, y }; start = at; return g; },
    lineTo: (x: number, y: number) => { segments.push({ from: at, to: { x, y } }); at = { x, y }; return g; },
    closePath: () => { segments.push({ from: at, to: start }); at = start; return g; },
    stroke: () => g,
  };
  return { g: g as unknown as Graphics, segments };
}

const outer = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const hole = [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }];
const onRing = (p: { x: number; y: number }, ring: typeof outer): boolean => {
  const xs = ring.map((c) => c.x); const ys = ring.map((c) => c.y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return ((p.x === left || p.x === right) && p.y >= top && p.y <= bottom) || ((p.y === top || p.y === bottom) && p.x >= left && p.x <= right);
};

describe('the outlines of fog areas', () => {
  it('draws a room around a room as its two rings, with no line along the slit between them', () => {
    const { g, segments } = recorder();
    drawAreaOutlines(g, [{ outline: keyholed(outer, [hole]), dashed: false }], 1, 0xffffff);
    expect(segments.length).toBeGreaterThan(0);
    for (const { from, to } of segments) {
      const both = (ring: typeof outer): boolean => onRing(from, ring) && onRing(to, ring);
      expect(both(outer) || both(hole)).toBe(true);
    }
    // Both rings are there.
    expect(segments.some(({ from }) => onRing(from, hole))).toBe(true);
    expect(segments.some(({ from }) => onRing(from, outer))).toBe(true);
  });

  it('draws a plain outline as it is given', () => {
    const { g, segments } = recorder();
    drawAreaOutlines(g, [{ outline: outer, dashed: false }], 1, 0xffffff);
    // Casing and line: the four edges twice.
    expect(segments).toHaveLength(8);
  });
});
