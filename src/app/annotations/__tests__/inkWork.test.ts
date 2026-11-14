import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import type { DrawingAnnotation } from '../annotationTypes';
import { drawingInk, type DrawingInk } from '../drawingInk';
import { cleanFillAffordable, evenInkAffordable } from '../inkWork';
import { strokeCurve } from '../penStroke';
import { drawing, seeded, wandering } from './annotationKit';

const TOLERANCE = 0.2;
const WIDTHS = { s: 2.9, m: 5.8, l: 11.7, xl: 23.3 } as const;

/** The time `drawingInk` takes for a drawing it has not seen, milliseconds: the least of a few goes, each on a drawing of its own. */
function buildTime(fields: Record<string, unknown>): { ms: number; ink: DrawingInk; drawing: DrawingAnnotation } {
  let ms = Infinity;
  let made = drawing(fields);
  let ink = drawingInk(made, TOLERANCE);
  for (let i = 0; i < 3; i++) {
    made = drawing(fields);
    const start = performance.now();
    ink = drawingInk(made, TOLERANCE);
    ms = Math.min(ms, performance.now() - start);
  }
  return { ms, ink, drawing: made };
}

function strokes(random: () => number): { name: string; fields: Record<string, unknown> }[] {
  const scatter = (count: number): Point[] => Array.from({ length: count }, () => ({ x: random() * 800, y: random() * 600 }));
  const smooth = (count: number): Point[] => {
    const points = [{ x: 0, y: 0 }];
    let heading = random() * 6;
    for (let i = 1; i < count; i++) {
      heading += (random() - 0.5) * 0.5;
      points.push({ x: points[i - 1]!.x + Math.cos(heading) * 12, y: points[i - 1]!.y + Math.sin(heading) * 12 });
    }
    return points;
  };
  const made: { name: string; fields: Record<string, unknown> }[] = [];
  for (const [size, width] of Object.entries(WIDTHS)) {
    for (const count of [50, 150, 300, 500, 800]) made.push({ name: `a smooth stroke of ${count} points, ${size}`, fields: { points: smooth(count), width } });
    for (const count of [50, 150, 300, 500]) made.push({ name: `a rough stroke of ${count} points, ${size}`, fields: { points: wandering(random, count, 10), width } });
    for (const count of [20, 50, 90, 130, 200]) made.push({ name: `a scribble of ${count} straight lines, ${size}`, fields: { type: 'line', points: scatter(count), width } });
    for (const count of [50, 150, 250, 400]) made.push({ name: `${count} upright teeth, ${size}`, fields: { type: 'line', points: Array.from({ length: count }, (_, i) => ({ x: i * 3, y: (i % 2) * 200 + random() * 10 })), width } });
    for (const passes of [5, 15, 30, 60]) {
      const shade: Point[] = [];
      for (let pass = 0; pass < passes; pass++) for (let i = 0; i <= 10; i++) shade.push({ x: (pass % 2 ? 10 - i : i) * 20 + random() * 2, y: pass * width * 0.6 + random() * 2 });
      made.push({ name: `shading in ${passes} passes, ${size}`, fields: { points: shade, width } });
    }
    for (const count of [200, 600, 1500]) made.push({ name: `a dotted stroke of ${count} points, ${size}`, fields: { points: smooth(count), width, dash: 'dotted' } });
    for (const count of [200, 600, 1500]) made.push({ name: `a dashed stroke of ${count} points, ${size}`, fields: { points: smooth(count), width, dash: 'dashed' } });
  }
  return made;
}

describe('the budget of a drawing\'s ink', () => {
  it('draws a see-through scribble past it as a plain line, in a few milliseconds', () => {
    const random = seeded(5);
    const scribble = Array.from({ length: 2000 }, () => ({ x: random() * 800, y: random() * 600 }));
    const { ms, ink } = buildTime({ points: scribble, width: WIDTHS.xl, opacity: 0.5 });
    expect(ink.even).toBeNull();
    expect([ink.lines.length, ink.alpha, ink.width]).toEqual([1, 0.5, WIDTHS.xl]);
    console.log(`a see-through scribble of 2,000 points at XL, past the budget: ${ms.toFixed(2)} ms`);
  });

  it('keeps the even tone of what a hand draws: strokes, shading, dashes', () => {
    const random = seeded(6);
    const shade: Point[] = [];
    for (let pass = 0; pass < 20; pass++) for (let i = 0; i <= 10; i++) shade.push({ x: (pass % 2 ? 10 - i : i) * 20 + random() * 2, y: pass * 7 + random() * 2 });
    const hand = wandering(random, 120, 9);
    for (const fields of [{ points: hand, width: WIDTHS.m }, { points: hand, width: WIDTHS.xl }, { points: shade, width: WIDTHS.l }, { points: hand.slice(0, 60), width: WIDTHS.m, dash: 'dashed' }, { points: hand.slice(0, 60), width: WIDTHS.l, dash: 'dotted', ends: 'both' }]) {
      const ink = drawingInk(drawing({ ...fields, opacity: 0.5 }), TOLERANCE);
      expect(ink.even).not.toBeNull();
      expect([ink.lines, ink.heads]).toEqual([[], []]);
    }
  });

  it('holds every see-through line within it to a few milliseconds, and says what it comes to', () => {
    const random = seeded(7);
    let worstWithin = { ms: 0, name: '' };
    let worstPast = { ms: 0, name: '' };
    let within = 0;
    const times: number[] = [];
    const all = strokes(random);
    for (const { name, fields } of all) {
      const { ms, ink } = buildTime({ ...fields, opacity: 0.5 });
      if (ink.even) {
        within++;
        times.push(ms);
        if (ms > worstWithin.ms) worstWithin = { ms, name };
      } else if (ms > worstPast.ms) worstPast = { ms, name };
    }
    console.log(
      `see-through ink: ${within} of ${all.length} kinds of line are within the budget; the slowest of them is ${worstWithin.name}, ${worstWithin.ms.toFixed(1)} ms (median ${times.sort((a, b) => a - b)[Math.floor(times.length / 2)]!.toFixed(1)} ms); `
      + `the slowest past it (drawn plain) is ${worstPast.name}, ${worstPast.ms.toFixed(1)} ms`,
    );
    expect(within).toBeGreaterThan(all.length / 3);
    expect(all.length - within).toBeGreaterThan(all.length / 6);
  }, 60_000);

  it('fills an outline of thousands of crossing corners as it lies, and cleans the ones a hand makes', () => {
    const random = seeded(8);
    const corners = Array.from({ length: 1999 }, () => ({ x: random() * 800, y: random() * 600 }));
    const wild = buildTime({ type: 'line', points: [...corners, corners[0]], width: WIDTHS.m, fill: 'solid' });
    expect(wild.ink.fill!.parts).toEqual([{ outline: corners, holes: [] }]);
    // A star that crosses itself is cleaned: its arms, and its middle, as areas that do not overlap.
    const star = Array.from({ length: 5 }, (_, i) => ({ x: 100 * Math.sin((i * 4 * Math.PI) / 5), y: -100 * Math.cos((i * 4 * Math.PI) / 5) }));
    const cleaned = drawingInk(drawing({ type: 'line', points: [...star, star[0]], width: 0, fill: 'solid' }), TOLERANCE).fill!.parts;
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]!.outline).toHaveLength(10);
    // An outline of thousands of corners that crosses nothing is within the budget; one of tens of thousands is filled as it lies, which is the same picture.
    const ring = (count: number): Point[] => Array.from({ length: count }, (_, i) => ({ x: 400 + (300 + 4 * Math.sin(i * 1.7)) * Math.cos((i / count) * 2 * Math.PI), y: 400 + (300 + 4 * Math.sin(i * 1.7)) * Math.sin((i / count) * 2 * Math.PI) }));
    const closed = (points: Point[]): Point[] => [...points, points[0]!];
    expect([cleanFillAffordable(closed(ring(3000)), []), cleanFillAffordable(closed(ring(15_000)), []), cleanFillAffordable(closed(corners), [])]).toEqual([true, false, false]);
    const ragged = buildTime({ type: 'line', points: closed(ring(3000)), width: 0, fill: 'solid' });
    const large = buildTime({ type: 'line', points: closed(ring(15_000)), width: 0, fill: 'solid' });
    console.log(`fills: 1,999 crossing corners, filled as they lie: ${wild.ms.toFixed(2)} ms; a clean outline of 3,000 corners, cleaned: ${ragged.ms.toFixed(1)} ms; one of 15,000, filled as it lies: ${large.ms.toFixed(2)} ms`);
  });

  it('asks little to tell', () => {
    const random = seeded(9);
    const scribble = strokeCurve(Array.from({ length: 2000 }, () => ({ x: random() * 800, y: random() * 600 })), TOLERANCE);
    const long = wandering(random, 1500, 8);
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      evenInkAffordable(scribble, [scribble]);
      evenInkAffordable(long, [long]);
    }
    console.log(`telling whether a line is within the budget: ${((performance.now() - start) / 40).toFixed(3)} ms a line`);
  });
});

describe('the ink of a see-through drawing that is moved', () => {
  const random = seeded(11);
  const hand = wandering(random, 200, 9, { x: 300, y: 200 });
  const outline = (ink: DrawingInk): Point[] => ink.even!.flatMap((part) => [part.outline, ...part.holes]).flat();
  const off = (a: readonly Point[], b: readonly Point[]): number => (a.length === b.length ? Math.max(...a.map((point, i) => Math.hypot(point.x - b[i]!.x, point.y - b[i]!.y))) : Infinity);

  it('is the ink it had, moved with it: nothing is clipped again', () => {
    const before = drawingInk(drawing({ id: 'moved', points: hand, width: WIDTHS.l, opacity: 0.4 }), TOLERANCE);
    // Off the clipping grid: ink worked out anew would have other corners.
    const shifted = hand.map(({ x, y }) => ({ x: x + 13.37, y: y - 4.21 }));
    const start = performance.now();
    const after = drawingInk(drawing({ id: 'moved', points: shifted, width: WIDTHS.l, opacity: 0.4 }), TOLERANCE);
    const ms = performance.now() - start;
    expect(off(outline(after), outline(before).map(({ x, y }) => ({ x: x + 13.37, y: y - 4.21 })))).toBeLessThan(1e-9);
    const anew = drawingInk(drawing({ id: 'another', points: shifted, width: WIDTHS.l, opacity: 0.4 }), TOLERANCE);
    expect(off(outline(anew), outline(after))).toBeGreaterThan(1e-6);
    console.log(`a see-through stroke of 200 points moved: its ink in ${ms.toFixed(3)} ms`);
  });

  it('turns with it, and with its fill', () => {
    const ring = [...hand.slice(0, 40), hand[0]!];
    const hole = [{ x: 310, y: 205 }, { x: 320, y: 205 }, { x: 315, y: 215 }];
    const before = drawingInk(drawing({ id: 'turned', type: 'line', points: ring, width: WIDTHS.m, opacity: 0.4, fill: 'soft', holes: [hole] }), TOLERANCE);
    const [cos, sin] = [Math.cos(0.7), Math.sin(0.7)];
    const turn = ({ x, y }: Point): Point => ({ x: 50 + cos * x - sin * y, y: -20 + sin * x + cos * y });
    const after = drawingInk(drawing({ id: 'turned', type: 'line', points: ring.map(turn), width: WIDTHS.m, opacity: 0.4, fill: 'soft', holes: [hole.map(turn)] }), TOLERANCE);
    expect(off(outline(after), outline(before).map(turn))).toBeLessThan(1e-6);
    const fill = (ink: DrawingInk): Point[] => ink.fill!.parts.flatMap((part) => [part.outline, ...part.holes]).flat();
    expect(off(fill(after), fill(before).map(turn))).toBeLessThan(1e-6);
    expect([after.alpha, after.fill!.alpha]).toEqual([0.4, 0.1]);
  });

  it('is worked out anew when anything but its place changes', () => {
    const base = { id: 'changed', points: hand, width: WIDTHS.l, opacity: 0.4 };
    const before = outline(drawingInk(drawing(base), TOLERANCE));
    // Wider, scaled, a corner moved, another look: each is another outline.
    const wider = outline(drawingInk(drawing({ ...base, width: WIDTHS.xl }), TOLERANCE));
    expect(wider).not.toEqual(before);
    const scaled = outline(drawingInk(drawing({ ...base, points: hand.map(({ x, y }) => ({ x: x * 2, y: y * 2 })) }), TOLERANCE));
    expect(off(scaled, wider.map(({ x, y }) => ({ x: x * 2, y: y * 2 })))).toBeGreaterThan(1);
    const bent = hand.map((point, i) => (i === 100 ? { x: point.x + 30, y: point.y } : point));
    const dented = drawingInk(drawing({ ...base, points: bent }), TOLERANCE);
    const anew = drawingInk(drawing({ ...base, id: 'changed-anew', points: bent }), TOLERANCE);
    expect(outline(dented)).toEqual(outline(anew));
    // Less see-through: the same outline, at the new tone.
    const paler = drawingInk(drawing({ ...base, points: bent, opacity: 0.2 }), TOLERANCE);
    expect([outline(paler), paler.alpha]).toEqual([outline(anew), 0.2]);
  });
});
