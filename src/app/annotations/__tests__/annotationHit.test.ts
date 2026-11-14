import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import type { Box } from '../../vision/polygonBounds';
import { annotationBounds, boxOutline, stampBox, textBox, type TextMeasure } from '../annotationBounds';
import { AnnotationIndex, annotationIndex, annotationsAt, annotationsIn, hitAnnotation } from '../annotationHit';
import type { Annotation } from '../annotationTypes';
import { BoxTree } from '../boxTree';
import { windingNumber } from '../lineMath';
import { ellipsePoints, rectanglePoints } from '../shapeOutlines';
import { arrowReach } from '../strokeLook';
import { distanceToPath, drawing, sampled, seeded, text, wandering } from './annotationKit';

const MEASURE: TextMeasure = (read) => ({ width: read.text.length * 10, height: 24 });

/** A level's worth of every kind of annotation, scattered over a map `span` px a side. */
function scattered(random: () => number, count: number, span: number, points = 12): Annotation[] {
  const place = (): Point => ({ x: random() * span, y: random() * span });
  return Array.from({ length: count }, (_, i): Annotation => {
    const at = place();
    switch (i % 6) {
      case 0: return drawing({ points: wandering(random, points, 14, at), width: 1 + random() * 8 });
      case 1: return drawing({ type: 'rectangle', points: rectanglePoints(at, { x: at.x + 20 + random() * 90, y: at.y + 20 + random() * 90 }, random() * 90), fill: 'soft', width: random() < 0.5 ? 0 : 3 });
      case 2: return drawing({ type: 'circle', points: ellipsePoints(at, { x: at.x + 30 + random() * 60, y: at.y + 30 + random() * 60 }), width: 2 });
      case 3: return drawing({ type: 'icon', icon: 'skull', points: [at], width: 20 + random() * 50, rotation: random() * 360 });
      case 4: return text({ x: at.x, y: at.y, text: 'Here be dragons'.slice(0, 3 + Math.floor(random() * 12)), rotation: random() * 360, scale: 0.5 + random() });
      default: return drawing({ type: 'line', points: [at, place()], width: 2, ends: 'end' });
    }
  });
}

describe('annotationBounds', () => {
  it('holds a line with half its width, and with its arrowheads where it has them', () => {
    const line = [{ x: 10, y: 20 }, { x: 110, y: 20 }];
    expect(annotationBounds(drawing({ type: 'line', points: line, width: 6 }))).toEqual({ minX: 7, minY: 17, maxX: 113, maxY: 23 });
    const arrow = annotationBounds(drawing({ type: 'line', points: line, width: 6, ends: 'both' }));
    expect(arrow).toEqual({ minX: 10 - arrowReach(6), minY: 20 - arrowReach(6), maxX: 110 + arrowReach(6), maxY: 20 + arrowReach(6) });
  });

  it('holds a turned stamp and a turned text by the corners of their boxes', () => {
    const stamp = drawing({ type: 'icon', icon: 'skull', points: [{ x: 100, y: 100 }], width: 40, rotation: 45 });
    const reach = 20 * Math.SQRT2;
    const bounds = annotationBounds(stamp);
    for (const [value, expected] of [[bounds.minX, 100 - reach], [bounds.maxX, 100 + reach], [bounds.minY, 100 - reach], [bounds.maxY, 100 + reach]] as const) expect(value).toBeCloseTo(expected, 9);
    const label = text({ x: 50, y: 60, text: 'Cellar', rotation: 90, scale: 2 });
    // 60 × 24 as measured, doubled, on its side.
    expect(boxOutline(textBox(label, MEASURE)).slice(0, 4).map(({ x, y }) => [Math.round(x) + 0, Math.round(y) + 0])).toEqual([[74, 0], [74, 120], [26, 120], [26, 0]]);
    const turned = annotationBounds(label, MEASURE);
    for (const [value, expected] of [[turned.minX, 26], [turned.maxX, 74], [turned.minY, 0], [turned.maxY, 120]] as const) expect(value).toBeCloseTo(expected, 9);
  });

  it('guesses the size of a text nobody measured, with its plate', () => {
    const plain = textBox(text({ text: 'Four\nwords here', fontSize: 20 }));
    expect([plain.halfWidth * 2, plain.halfHeight * 2]).toEqual([10 * 12, 2 * 24]);
    const plate = textBox(text({ text: 'Four', fontSize: 20, backgroundColor: '#000000', padding: 5 }));
    expect([plate.halfWidth * 2, plate.halfHeight * 2]).toEqual([4 * 12 + 10, 24 + 10]);
  });
});

describe('hitAnnotation', () => {
  it('finds a line by its ink and the tolerance around it', () => {
    const line = drawing({ type: 'line', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 4 });
    expect(hitAnnotation({ x: 50, y: 3.9 }, 2, line)).toBe(true);
    expect(hitAnnotation({ x: 50, y: 4.1 }, 2, line)).toBe(false);
    expect(hitAnnotation({ x: 103, y: 0 }, 0, line)).toBe(false);
    expect(hitAnnotation({ x: 101.9, y: 0 }, 0, line)).toBe(true);
    const dot = drawing({ points: [{ x: 5, y: 5 }], width: 10 });
    expect(hitAnnotation({ x: 8, y: 9 }, 0, dot)).toBe(true);
    expect(hitAnnotation({ x: 8.1, y: 9.1 }, 0, dot)).toBe(false);
  });

  it('finds a fill by its inside less its holes, and an outline only by its line', () => {
    const points = rectanglePoints({ x: 0, y: 0 }, { x: 100, y: 100 });
    const hole = [{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 60 }, { x: 40, y: 60 }];
    const room = drawing({ type: 'rectangle', points, width: 2, fill: 'soft', holes: [hole] });
    expect(hitAnnotation({ x: 20, y: 20 }, 0, room)).toBe(true);
    expect(hitAnnotation({ x: 50, y: 50 }, 0, room)).toBe(false);
    expect(hitAnnotation({ x: 120, y: 50 }, 0, room)).toBe(false);
    const outline = drawing({ type: 'rectangle', points, width: 2 });
    expect(hitAnnotation({ x: 20, y: 20 }, 0, outline)).toBe(false);
    expect(hitAnnotation({ x: 0.5, y: 20 }, 0, outline)).toBe(true);
    const floor = drawing({ type: 'line', points, width: 0, fill: 'solid' });
    expect(hitAnnotation({ x: 99, y: 99 }, 0, floor)).toBe(true);
    expect(hitAnnotation({ x: 101, y: 99 }, 0, floor)).toBe(false);
  });

  it('finds a stamp and a text by their turned boxes', () => {
    const stamp = drawing({ type: 'icon', icon: 'skull', points: [{ x: 100, y: 100 }], width: 40, rotation: 45 });
    expect(hitAnnotation({ x: 100, y: 127 }, 0, stamp)).toBe(true);
    // In the box that is not turned, outside the one that is.
    expect(hitAnnotation({ x: 119, y: 119 }, 0, stamp)).toBe(false);
    expect(hitAnnotation({ x: 119, y: 119 }, 8, stamp)).toBe(true);
    const label = text({ x: 50, y: 60, text: 'Cellar', rotation: 90, scale: 2 });
    expect(hitAnnotation({ x: 60, y: 115 }, 0, label, MEASURE)).toBe(true);
    expect(hitAnnotation({ x: 100, y: 60 }, 0, label, MEASURE)).toBe(false);
  });
});

describe('BoxTree', () => {
  it('names exactly the boxes that touch a box, and never one with a number that is none', () => {
    const random = seeded(12);
    const boxes: Box[] = Array.from({ length: 700 }, () => {
      const [x, y, size] = [random() * 4000, random() * 4000, random() < 0.05 ? 2500 * random() : 60 * random()];
      return { minX: x, minY: y, maxX: x + size, maxY: y + size * random() };
    });
    boxes[13] = { minX: NaN, minY: 0, maxX: 10, maxY: 10 };
    const tree = new BoxTree(boxes);
    for (let i = 0; i < 400; i++) {
      const [x, y, size] = [random() * 4200 - 100, random() * 4200 - 100, random() < 0.5 ? 0 : 500 * random()];
      const expected = boxes.flatMap((box, index) => (box.minX <= x + size && box.maxX >= x && box.minY <= y + size && box.maxY >= y ? [index] : []));
      expect(tree.touching(x, y, x + size, y + size)).toEqual(expected);
    }
    expect(new BoxTree([]).touching(0, 0, 1, 1)).toEqual([]);
  });
});

describe('annotationsAt', () => {
  it('finds what a look at every annotation finds, the topmost first', () => {
    const random = seeded(5);
    const list = scattered(random, 600, 1500);
    let found = 0;
    for (let i = 0; i < 1500; i++) {
      const point = { x: random() * 1500, y: random() * 1500 };
      const tolerance = [0, 4, 30][i % 3]!;
      const expected = list.filter((annotation) => hitAnnotation(point, tolerance, annotation, MEASURE)).reverse();
      expect(annotationsAt(point, tolerance, list, MEASURE)).toEqual(expected);
      found += expected.length;
    }
    expect(found).toBeGreaterThan(1000);
  });

  it('keeps one index per list and measurer', () => {
    const list = scattered(seeded(1), 30, 500);
    expect(annotationIndex(list)).toBe(annotationIndex(list));
    expect(annotationIndex(list, MEASURE)).not.toBe(annotationIndex(list));
    expect(annotationIndex(list, MEASURE)).toBe(annotationIndex(list, MEASURE));
    expect(annotationIndex([...list])).not.toBe(annotationIndex(list));
  });

  it('gives what may show on a screen: every annotation whose bounds touch it, in drawing order', () => {
    const list = scattered(seeded(7), 300, 2000);
    const screen = { minX: 400, minY: 300, maxX: 1300, maxY: 900 };
    const expected = list.filter((annotation) => {
      const bounds = annotationBounds(annotation, MEASURE);
      return bounds.minX <= screen.maxX && bounds.maxX >= screen.minX && bounds.minY <= screen.maxY && bounds.maxY >= screen.minY;
    });
    expect(new AnnotationIndex(list, MEASURE).touching(screen)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(20);
    expect(expected.length).toBeLessThan(list.length);
  });

  it('reads a handful of 2,000 drawings of 100 points each', () => {
    const random = seeded(9);
    const list = scattered(random, 2000, 6000, 100);
    const points = Array.from({ length: 20_000 }, () => ({ x: random() * 6000, y: random() * 6000 }));
    let start = performance.now();
    const index = new AnnotationIndex(list, MEASURE);
    const built = performance.now() - start;
    start = performance.now();
    let found = 0;
    for (const point of points) found += index.at(point, 4).length;
    const indexed = (performance.now() - start) / points.length;
    start = performance.now();
    let expected = 0;
    for (const point of points.slice(0, 200)) expected += list.filter((annotation) => hitAnnotation(point, 4, annotation, MEASURE)).length;
    const plain = (performance.now() - start) / 200;
    let again = 0;
    for (const point of points.slice(0, 200)) again += index.at(point, 4).length;
    expect(again).toBe(expected);
    // A list with one drawing changed: the others' bounds are known, the tree is built anew.
    start = performance.now();
    for (let i = 0; i < 20; i++) new AnnotationIndex([...list.slice(1), drawing({ points: wandering(random, 100, 14) })], MEASURE);
    const rebuilt = (performance.now() - start) / 20;
    console.log(`annotationsAt over 2,000 annotations: ${(indexed * 1000).toFixed(2)} µs a point with the index (built in ${built.toFixed(2)} ms, again after a change in ${rebuilt.toFixed(2)} ms), ${(plain * 1000).toFixed(1)} µs without; ${found} hits at ${points.length} points`);
  });
});

describe('annotationsIn', () => {
  /** The lines an area must touch, sampled every quarter pixel. */
  function outline(annotation: Annotation): Point[] {
    if (annotation.kind === 'text') return sampled(boxOutline(textBox(annotation, MEASURE)), 0.25);
    if (annotation.shape === 'stamp') return sampled(boxOutline(stampBox(annotation)), 0.25);
    return sampled(annotation.points, 0.25);
  }
  const inBox = (point: Point, box: Box, grown: number): boolean => point.x >= box.minX - grown && point.x <= box.maxX + grown && point.y >= box.minY - grown && point.y <= box.maxY + grown;

  it('takes a line the marquee holds or crosses, and not a fill it only lies in', () => {
    const line = drawing({ type: 'line', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], width: 2 });
    const room = drawing({ type: 'rectangle', points: rectanglePoints({ x: -500, y: -500 }, { x: 500, y: 500 }), width: 2, fill: 'solid' });
    const list = [room, line];
    // Across the line's middle, holding neither of its ends.
    expect(annotationsIn({ minX: 40, minY: 40, maxX: 60, maxY: 60 }, list)).toEqual([line]);
    // In the box around the line, beside the line itself.
    expect(annotationsIn({ minX: 70, minY: 5, maxX: 95, maxY: 30 }, list)).toEqual([]);
    expect(annotationsIn({ minX: -600, minY: -10, maxX: 10, maxY: 10 }, list)).toEqual([room, line]);
    expect(annotationsIn({ minX: -600, minY: -600, maxX: 600, maxY: 600 }, list)).toEqual([room, line]);
  });

  it('takes with a lasso what the lasso holds or crosses', () => {
    const line = drawing({ type: 'line', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], width: 2 });
    const dot = drawing({ points: [{ x: 50, y: 50 }], width: 6 });
    const list = [line, dot];
    expect(annotationsIn([{ x: 40, y: 40 }, { x: 60, y: 40 }, { x: 50, y: 65 }], list)).toEqual([dot]);
    expect(annotationsIn([{ x: 40, y: -10 }, { x: 60, y: -10 }, { x: 50, y: 65 }], list)).toEqual([line, dot]);
    expect(annotationsIn([{ x: 40, y: 40 }, { x: 60, y: 40 }], list)).toEqual([]);
    expect(annotationsIn([{ x: -10, y: -10 }, { x: 110, y: -10 }, { x: 110, y: 10 }, { x: -10, y: 10 }], list)).toEqual([line]);
  });

  it('agrees with a walk along every outline, for marquees and lassos anywhere', () => {
    const random = seeded(23);
    const list = scattered(random, 240, 900);
    const outlines = new Map(list.map((annotation) => [annotation, outline(annotation)]));
    let taken = 0;
    for (let round = 0; round < 40; round++) {
      const [x, y] = [random() * 800, random() * 800];
      const box = { minX: x, minY: y, maxX: x + random() * 250, maxY: y + random() * 250 };
      const inMarquee = annotationsIn(box, list, MEASURE);
      // What has a sampled point well inside is taken; what is taken has one inside or within a hair of the edge.
      for (const annotation of list) {
        const samples = outlines.get(annotation)!;
        if (samples.some((point) => inBox(point, box, -0.3))) expect(inMarquee).toContain(annotation);
        if (inMarquee.includes(annotation)) expect(samples.some((point) => inBox(point, box, 0.3))).toBe(true);
      }
      const lasso = Array.from({ length: 9 }, (_, i) => {
        const reach = 40 + random() * 140;
        return { x: x + reach * Math.cos((i * 2 * Math.PI) / 9), y: y + reach * Math.sin((i * 2 * Math.PI) / 9) };
      });
      const inLasso = annotationsIn(lasso, list, MEASURE);
      const ring = [...lasso, lasso[0]!];
      for (const annotation of list) {
        const samples = outlines.get(annotation)!;
        const held = (point: Point): boolean => windingNumber(point, lasso) !== 0;
        if (samples.some((point) => held(point) && distanceToPath(point, ring) > 0.3)) expect(inLasso).toContain(annotation);
        if (inLasso.includes(annotation)) expect(samples.some((point) => held(point) || distanceToPath(point, ring) < 0.3)).toBe(true);
      }
      taken += inMarquee.length + inLasso.length;
      expect(inMarquee).toEqual(list.filter((annotation) => inMarquee.includes(annotation)));
    }
    expect(taken).toBeGreaterThan(300);
  });
});
