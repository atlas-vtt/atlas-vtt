import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import { frameOfAnnotation, framePoint } from '../annotationFrame';
import { readDrawing, readText } from '../annotationList';
import {
  MIN_FACTOR, mapFrame, mapPoint, moveBy, placedBy, scaleAbout, scaleByHandle, turnAbout, turnBetween, type Transform,
} from '../annotationTransform';
import type { Annotation, AnnotationPlace } from '../annotationTypes';
import { curvedPath, ellipsePoints, rectanglePoints } from '../shapeOutlines';
import { drawing, seeded, text } from './annotationKit';

const pt = (x: number, y: number): Point => ({ x, y });
const near = (a: Point, b: Point, slack = 1e-9): boolean => Math.abs(a.x - b.x) <= slack && Math.abs(a.y - b.y) <= slack;

/** `annotation` as it reads once `place` is written to it. */
function placed(annotation: Annotation, place: AnnotationPlace): Annotation {
  const record = { ...annotation.record, ...place };
  const read = annotation.kind === 'text' ? readText(annotation.id, record) : readDrawing(annotation.id, record);
  if (!read) throw new Error('The place left no annotation');
  return read;
}

/** The transform worked out the slow way: a point turned back into the frame's axes, scaled there, and turned forth. */
function scaledByHand(point: Point, anchor: Point, rotation: number, sx: number, sy: number): Point {
  const angle = (rotation * Math.PI) / 180;
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const along = (dx * Math.cos(angle) + dy * Math.sin(angle)) * sx;
  const across = (dy * Math.cos(angle) - dx * Math.sin(angle)) * sy;
  return { x: anchor.x + along * Math.cos(angle) - across * Math.sin(angle), y: anchor.y + along * Math.sin(angle) + across * Math.cos(angle) };
}

describe('the maps a gesture makes', () => {
  it('scales about an anchor along turned axes as working it out by hand does', () => {
    const random = seeded(7);
    for (let trial = 0; trial < 200; trial++) {
      const anchor = pt(random() * 400 - 200, random() * 400 - 200);
      const rotation = random() * 360 - 180;
      const sx = 0.2 + random() * 3;
      const sy = 0.2 + random() * 3;
      const transform = scaleAbout(anchor, rotation, sx, sy);
      const point = pt(random() * 600 - 300, random() * 600 - 300);
      expect(near(mapPoint(transform, point), scaledByHand(point, anchor, rotation, sx, sy), 1e-9)).toBe(true);
      expect(near(mapPoint(transform, anchor), anchor)).toBe(true);
    }
  });

  it('turns about a centre, and a quarter turn lands on whole pixels', () => {
    const quarter = turnAbout(pt(100, 100), 90);
    expect(mapPoint(quarter, pt(150, 100))).toEqual(pt(100, 150));
    expect(mapPoint(quarter, pt(100, 100))).toEqual(pt(100, 100));
    expect(mapPoint(turnAbout(pt(0, 0), 180), pt(30, 40))).toEqual(pt(-30, -40));
  });

  it('reads the pointer\'s turn about a centre, in 15° steps where asked', () => {
    expect(turnBetween(pt(0, 0), pt(10, 0), pt(0, 10), false)).toBeCloseTo(90);
    expect(turnBetween(pt(0, 0), pt(10, 0), pt(0, -10), false)).toBeCloseTo(-90);
    expect(turnBetween(pt(0, 0), pt(10, 0), pt(10, 3), true)).toBe(15);
    expect(turnBetween(pt(0, 0), pt(10, 0), pt(10, 1), true)).toBe(0);
    expect(turnBetween(pt(0, 0), pt(10, 0), pt(-10, -0.001), false)).toBeGreaterThan(-180);
  });
});

describe('a handle\'s scaling', () => {
  const frame = { centre: pt(100, 50), halfWidth: 40, halfHeight: 20, rotation: 0 };

  it('keeps the opposite corner where it is and puts the dragged corner under the pointer', () => {
    const transform = scaleByHandle(frame, { x: 1, y: 1 }, pt(20, 30), false);
    expect(near(mapPoint(transform, pt(60, 30)), pt(60, 30))).toBe(true);
    expect(near(mapPoint(transform, pt(140, 70)), pt(160, 100))).toBe(true);
  });

  it('stretches one axis from a side, the other side staying', () => {
    const transform = scaleByHandle(frame, { x: -1, y: 0 }, pt(-40, 500), false);
    expect(near(mapPoint(transform, pt(60, 30)), pt(20, 30))).toBe(true);
    expect(near(mapPoint(transform, pt(140, 70)), pt(140, 70))).toBe(true);
  });

  it('keeps the frame\'s proportion where asked, by the pointer\'s place along the diagonal', () => {
    const transform = scaleByHandle(frame, { x: 1, y: 1 }, pt(80, 40), true);
    const corner = mapPoint(transform, pt(140, 70));
    expect(near(corner, pt(220, 110))).toBe(true);
    const mapped = mapFrame(frame, transform);
    expect(mapped.halfWidth / mapped.halfHeight).toBeCloseTo(2);
  });

  it('scales a turned frame along its own sides', () => {
    const turned = { ...frame, rotation: 90 };
    // Turned a quarter, the frame's width runs down the screen: its (1, 0) side is its lowest.
    expect(near(framePoint(turned, { x: 1, y: 0 }), pt(100, 90))).toBe(true);
    const transform = scaleByHandle(turned, { x: 1, y: 0 }, pt(0, 40), false);
    expect(near(mapPoint(transform, pt(100, 90)), pt(100, 130))).toBe(true);
    expect(near(mapPoint(transform, pt(100, 10)), pt(100, 10))).toBe(true);
    // Across its width nothing changes: a point beside its middle goes down with it, and no way sideways.
    expect(near(mapPoint(transform, pt(120, 50)), pt(120, 70))).toBe(true);
  });

  it('never mirrors: a handle dragged past its opposite side leaves a sliver', () => {
    const transform = scaleByHandle(frame, { x: 1, y: 0 }, pt(-500, 0), false);
    expect(mapFrame(frame, transform).halfWidth).toBeCloseTo(40 * MIN_FACTOR);
  });

  it('leaves a side without a length as it is', () => {
    const level = { centre: pt(0, 0), halfWidth: 50, halfHeight: 0, rotation: 0 };
    const transform = scaleByHandle(level, { x: 1, y: 1 }, pt(50, 30), false);
    expect(near(mapPoint(transform, pt(50, 0)), pt(100, 0))).toBe(true);
    expect([transform.b, transform.c, transform.d]).toEqual([0, 0, 1]);
  });
});

describe('where a gesture leaves an annotation', () => {
  const transforms: Transform[] = [moveBy(13, -7), turnAbout(pt(40, 60), 33), scaleAbout(pt(-20, 10), 0, 1.5, 0.6), scaleAbout(pt(5, 5), 25, 2, 2)];

  it('keeps a rectangle a rectangle and an ellipse an ellipse through every gesture, one after another', () => {
    let rectangle: Annotation = drawing({ type: 'rectangle', points: rectanglePoints(pt(10, 20), pt(110, 80)) });
    let ellipse: Annotation = drawing({ type: 'circle', points: ellipsePoints(pt(0, 0), pt(90, 40)) });
    for (const transform of transforms) {
      rectangle = placed(rectangle, placedBy(rectangle, transform));
      ellipse = placed(ellipse, placedBy(ellipse, transform));
      expect(rectangle).toMatchObject({ kind: 'drawing', shape: 'rectangle' });
      expect(ellipse).toMatchObject({ kind: 'drawing', shape: 'ellipse' });
    }
  });

  it('puts a rectangle\'s corners where the map puts them', () => {
    const rectangle = drawing({ type: 'rectangle', points: rectanglePoints(pt(10, 20), pt(110, 80)) });
    const transform = turnAbout(pt(60, 50), 90);
    const place = placedBy(rectangle, transform);
    rectangle.points.forEach((point, index) => expect(near(place.points![index]!, mapPoint(transform, point), 1e-9)).toBe(true));
    // Turned a quarter, its frame is as it was, turned.
    expect(frameOfAnnotation(placed(rectangle, place))).toMatchObject({ halfWidth: 50, halfHeight: 30, rotation: 90 });
  });

  it('maps a line point by point, with the anchors and the holes that lie with its points', () => {
    const anchors = [pt(0, 0), pt(40, 30), pt(90, 0)];
    const curve = drawing({ type: 'line', points: curvedPath(anchors, false), anchors });
    const room = drawing({ type: 'line', points: [pt(0, 0), pt(100, 0), pt(100, 100), pt(0, 100), pt(0, 0)], fill: 'soft', holes: [[pt(20, 20), pt(40, 20), pt(40, 40)]] });
    for (const transform of transforms) {
      const curved = placedBy(curve, transform);
      expect(curved.anchors).toEqual(anchors.map((anchor) => mapPoint(transform, anchor)));
      // Its anchors still lie on it: it is read as the curve it was made as.
      expect(placed(curve, curved)).toMatchObject({ shape: 'line', anchors: curved.anchors });
      const moved = placedBy(room, transform);
      expect(moved.holes).toEqual([[pt(20, 20), pt(40, 20), pt(40, 40)].map((point) => mapPoint(transform, point))]);
      expect(moved.points).toHaveLength(5);
    }
  });

  it('leaves a line its width: only its points are scaled', () => {
    const pen = drawing({ points: [pt(0, 0), pt(50, 50)], width: 6 });
    expect(placedBy(pen, scaleAbout(pt(0, 0), 0, 3, 3))).toEqual({ points: [pt(0, 0), pt(150, 150)] });
  });

  it('moves, turns and grows a text and a stamp as a whole', () => {
    const label = text({ x: 100, y: 50, scale: 1.5, rotation: 350 });
    const stamp = drawing({ type: 'icon', icon: 'door-open', points: [pt(10, 10)], width: 70 });
    expect(placedBy(label, moveBy(5, 5))).toEqual({ x: 105, y: 55 });
    const turned = placedBy(label, turnAbout(pt(100, 50), 30));
    expect(near(pt(turned.x!, turned.y!), pt(100, 50))).toBe(true);
    expect(turned.rotation).toBe(20);
    expect(turned).not.toHaveProperty('scale');
    const grown = placedBy(label, scaleAbout(pt(0, 0), 0, 2, 2));
    expect(grown).toEqual({ x: 200, y: 100, scale: 3 });
    // Stretched one way only, it keeps its shape and grows by the mean of the two factors.
    expect(placedBy(label, scaleAbout(pt(0, 0), 0, 4, 1)).scale).toBeCloseTo(3);
    const spun = placedBy(stamp, turnAbout(pt(10, 10), 45));
    expect(near(spun.points![0]!, pt(10, 10))).toBe(true);
    expect(spun.rotation).toBe(45);
    expect(spun).not.toHaveProperty('width');
    expect(placedBy(stamp, scaleAbout(pt(10, 10), 0, 2, 2))).toEqual({ points: [pt(10, 10)], width: 140 });
  });
});
