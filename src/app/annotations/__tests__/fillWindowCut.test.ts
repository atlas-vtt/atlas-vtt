import { describe, expect, it } from 'vitest';
import { inflatePolyline, subtractShapes } from '../../lighting/polygonClip';
import type { Point } from '../../types/visionTypes';
import { fillShape } from '../drawingInk';
import { windowCut } from '../fillWindowCut';
import { inFill } from '../lineMath';
import { filledParts, pointsQ, type FilledPart } from '../quantized';
import { rectanglePoints } from '../shapeOutlines';
import { distanceToPath, seeded, wandering } from './annotationKit';

const closed = (ring: readonly Point[]): Point[] => [...ring, ring[0]!];
const holds = (parts: readonly FilledPart[], point: Point): number => parts.filter((part) => inFill(point, closed(part.outline), part.holes)).length;
const size = (part: FilledPart): number => part.outline.length + part.holes.reduce((sum, hole) => sum + hole.length, 0);
const largest = (parts: readonly FilledPart[]): FilledPart => [...parts].sort((a, b) => size(b) - size(a))[0]!;

/** How near `point` lies to any edge of `parts`. */
function edgeDistance(parts: readonly FilledPart[], point: Point): number {
  return Math.min(...parts.flatMap((part) => [part.outline, ...part.holes]).map((ring) => distanceToPath(point, closed(ring))));
}

/** The cut of the whole fill: what the window's cut must come to. */
function wholeCut(fill: FilledPart, swept: readonly (readonly number[])[]): FilledPart[] {
  return filledParts(subtractShapes(fillShape(closed(fill.outline), fill.holes)!, swept));
}

describe('windowCut', () => {
  it('leaves what a cut of the whole fill leaves, for any sweep over a fill carved before', () => {
    const random = seeded(29);
    let fallbacks = 0;
    let cuts = 0;
    let split = 0;
    let holes = 0;
    for (let round = 0; round < 6; round++) {
      let fill: FilledPart = { outline: rectanglePoints({ x: 10, y: 20 }, { x: 610, y: 520 }).slice(0, -1), holes: [] };
      for (let move = 0; move < 90; move++) {
        // Dabs, short moves and longer ones, inside the fill, across its edge and through holes cut before.
        const from = { x: -20 + random() * 660, y: -10 + random() * 560 };
        const path = wandering(random, 1 + Math.floor(random() * 4), 6 + random() * 60, from);
        const radius = 4 + random() * 22;
        const swept = inflatePolyline(pointsQ(path), Math.round(radius * 8));
        const whole = wholeCut(fill, swept);
        const around = windowCut(closed(fill.outline), fill.holes, swept);
        cuts++;
        if (!around) {
          fallbacks++;
        } else {
          expect(around.length).toBe(whole.length);
          for (let i = 0; i < 300; i++) {
            // Most points near the sweep, where the cut is; the rest anywhere, where nothing may change.
            const near = i < 220;
            const point = near ? { x: from.x - 90 + random() * 180, y: from.y - 90 + random() * 180 } : { x: -20 + random() * 660, y: -10 + random() * 560 };
            if (edgeDistance(whole, point) < 0.25) continue;
            expect(holds(around, point)).toBe(holds(whole, point));
          }
        }
        const left = around ?? whole;
        if (left.length === 0) break;
        if (left.length > 1) split++;
        fill = largest(left);
        holes = Math.max(holes, fill.holes.length);
      }
    }
    // The sweeps did cut holes and cut pieces off, and nearly every cut was made in the window.
    expect([holes > 3, split > 3]).toEqual([true, true]);
    expect(fallbacks / cuts).toBeLessThan(0.1);
  });

  it('keeps every ring the sweep is not near as it is, and adds no points to edges it does not cut', () => {
    // A room with a ragged wall, off the clipping grid, and a hole far from where the eraser works.
    const ragged: Point[] = Array.from({ length: 400 }, (_, i) => ({ x: 1000 + (i % 2) * 3.3, y: i * 2.51 }));
    const outline = closed([{ x: 0, y: 0.3 }, ...ragged, { x: 0, y: 1010.7 }]);
    const far = [{ x: 100, y: 100 }, { x: 140, y: 100 }, { x: 120, y: 140 }];
    let fill: FilledPart = { outline: outline.slice(0, -1), holes: [far] };
    // Dabs along the ragged wall, clear of it: each window holds a part of the wall, and none cuts it.
    for (let i = 0; i < 60; i++) {
      const swept = inflatePolyline(pointsQ([{ x: 975, y: 30 + i * 16 }]), 8 * 6);
      const parts = windowCut(closed(fill.outline), fill.holes, swept);
      expect(parts).toHaveLength(1);
      fill = parts![0]!;
    }
    expect(fill.holes).toHaveLength(61);
    expect(fill.holes).toContainEqual(far);
    // The wall has the corners it had, each where it was or on the grid point next to it.
    expect(fill.outline).toHaveLength(outline.length - 1);
    for (const corner of outline) expect(Math.min(...fill.outline.map((point) => Math.hypot(point.x - corner.x, point.y - corner.y)))).toBeLessThan(0.09);
  });

  it('cuts through the edge and into a hole, and gives an island its own holes', () => {
    const room = rectanglePoints({ x: 0, y: 0 }, { x: 400, y: 300 }).slice(0, -1);
    const pond = [{ x: 180, y: 130 }, { x: 220, y: 130 }, { x: 220, y: 170 }, { x: 180, y: 170 }];
    // A moat around the pond, in four moves: the last one closes it, and what it closes off is an island with the pond in it.
    let fill: FilledPart = { outline: room, holes: [pond] };
    const moat = [[{ x: 120, y: 80 }, { x: 280, y: 80 }], [{ x: 280, y: 80 }, { x: 280, y: 220 }], [{ x: 280, y: 220 }, { x: 120, y: 220 }], [{ x: 120, y: 220 }, { x: 120, y: 80 }]];
    let parts: FilledPart[] = [];
    for (const side of moat) {
      parts = windowCut(closed(fill.outline), fill.holes, inflatePolyline(pointsQ(side), 80))!;
      fill = largest(parts);
    }
    expect(parts).toHaveLength(2);
    const island = parts.find((part) => part !== fill)!;
    expect([fill.holes.length, island.holes]).toEqual([1, [pond]]);
    expect([holds(parts, { x: 200, y: 150 }), holds(parts, { x: 150, y: 150 }), holds(parts, { x: 120, y: 150 }), holds(parts, { x: 50, y: 150 })]).toEqual([0, 1, 0, 1]);
    // A cut from outside the room through its wall into the moat: the moat is no hole any more, and the room has one outline.
    const breach = windowCut(closed(fill.outline), fill.holes, inflatePolyline(pointsQ([{ x: -30, y: 150 }, { x: 120, y: 150 }]), 80))!;
    expect(breach.map((part) => part.holes.length)).toEqual([0]);
    expect([holds(breach, { x: 60, y: 150 }), holds(breach, { x: 60, y: 120 }), holds(breach, { x: 120, y: 100 })]).toEqual([0, 1, 0]);
  });

  it('is not asked of an open line, and says so of a window the fill does not reach', () => {
    const swept = inflatePolyline(pointsQ([{ x: 900, y: 900 }]), 80);
    expect(windowCut([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }], [], swept)).toBeNull();
    expect(windowCut(rectanglePoints({ x: 0, y: 0 }, { x: 400, y: 300 }), [], swept)).toBeNull();
  });
});
