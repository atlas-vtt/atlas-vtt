import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { keyholed } from '../../src/app/fog/fogKeyhole';
import { drawFogOutlines } from '../../src/app/pixi/fog/fogOutlines';

interface Segment { from: { x: number; y: number }; to: { x: number; y: number } }

/** A Graphics that records the lines traced into it. */
function recorder(): { g: Graphics; segments: Segment[]; cleared: () => number } {
  const segments: Segment[] = [];
  let at = { x: 0, y: 0 };
  let start = at;
  let clears = 0;
  const g = {
    clear: () => { clears++; return g; },
    moveTo: (x: number, y: number) => { at = { x, y }; start = at; return g; },
    lineTo: (x: number, y: number) => { segments.push({ from: at, to: { x, y } }); at = { x, y }; return g; },
    closePath: () => { segments.push({ from: at, to: start }); at = start; return g; },
    stroke: () => g,
  };
  return { g: g as unknown as Graphics, segments, cleared: () => clears };
}

const outer = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const hole = [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }];
const onRing = (p: { x: number; y: number }, ring: typeof outer): boolean => {
  const xs = ring.map((c) => c.x); const ys = ring.map((c) => c.y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return ((p.x === left || p.x === right) && p.y >= top && p.y <= bottom) || ((p.y === top || p.y === bottom) && p.x >= left && p.x <= right);
};

describe('the outlines the fog tool marks ground with', () => {
  it('draws ground round a hole as its two rings, with no line along the slit between them', () => {
    const { g, segments } = recorder();
    drawFogOutlines(g, [keyholed(outer, [hole])], 1, 0xffffff);
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
    drawFogOutlines(g, [outer], 1, 0xffffff);
    // Casing and line: the four edges twice.
    expect(segments).toHaveLength(8);
  });

  it('clears what was drawn and draws nothing for no outline, or one that encloses nothing', () => {
    const { g, segments, cleared } = recorder();
    drawFogOutlines(g, [], 1, 0xffffff);
    drawFogOutlines(g, [[{ x: 0, y: 0 }, { x: 5, y: 5 }]], 1, 0xffffff);
    expect(segments).toEqual([]);
    expect(cleared()).toBe(2);
  });
});
