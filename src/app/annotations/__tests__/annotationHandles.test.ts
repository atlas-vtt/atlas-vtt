import { describe, expect, it } from 'vitest';
import type { Point } from '../../types/visionTypes';
import { frameOfAnnotation, selectionFrame } from '../annotationFrame';
import { HANDLE_LOOK, frameGrow, handleAt, handleSpots, handlesOf, isGrip, mapHandles, type HandleRef, type HandleSet } from '../annotationHandles';
import { turnAbout } from '../annotationTransform';
import type { TextAnnotation } from '../annotationTypes';
import { edgeNear, linePointsOf, MAX_LINE_HANDLES, withPointAdded, withPointMoved, withPointRemoved } from '../linePoints';
import { CURVE_STEPS, curvedPath, ellipsePoints, rectanglePoints } from '../shapeOutlines';
import { drawing, text } from './annotationKit';

const pt = (x: number, y: number): Point => ({ x, y });
/** A text is 100 by 20 before its scale, whatever it says. */
const measure = (_text: TextAnnotation): { width: number; height: number } => ({ width: 100, height: 20 });
const kinds = (handles: HandleSet, zoom = 1): string[] => handleSpots(handles, zoom).map(({ ref }) => ref.kind);
const count = (handles: HandleSet, kind: HandleRef['kind'], zoom = 1): number => kinds(handles, zoom).filter((one) => one === kind).length;

describe('the frame of what is selected', () => {
  it('is turned as a text, a stamp and a turned rectangle are, and level around everything else', () => {
    expect(frameOfAnnotation(text({ x: 50, y: 60, rotation: 30, scale: 2 }), measure)).toEqual({ centre: pt(50, 60), halfWidth: 100, halfHeight: 20, rotation: 30 });
    expect(frameOfAnnotation(drawing({ type: 'icon', icon: 'door-open', points: [pt(10, 20)], width: 70, rotation: 45 }))).toEqual({ centre: pt(10, 20), halfWidth: 35, halfHeight: 35, rotation: 45 });
    expect(frameOfAnnotation(drawing({ type: 'rectangle', points: rectanglePoints(pt(0, 0), pt(100, 40), 20) }))).toMatchObject({ rotation: expect.closeTo(20, 9) as number });
    expect(frameOfAnnotation(drawing({ points: [pt(0, 0), pt(100, 40), pt(60, -20)] }))).toEqual({ centre: pt(50, 10), halfWidth: 50, halfHeight: 30, rotation: 0 });
  });

  it('is the same box whichever way a rectangle was dragged', () => {
    const one = frameOfAnnotation(drawing({ type: 'rectangle', points: rectanglePoints(pt(0, 0), pt(100, 40)) }));
    const other = frameOfAnnotation(drawing({ type: 'rectangle', points: rectanglePoints(pt(100, 40), pt(0, 0)) }));
    expect(other).toEqual(one);
    expect(one).toEqual({ centre: pt(50, 20), halfWidth: 50, halfHeight: 20, rotation: 0 });
  });

  it('is level around a shape a stretched map left oblique, and around several', () => {
    const oblique = drawing({ type: 'rectangle', points: [pt(0, 0), pt(100, 0), pt(130, 50), pt(30, 50), pt(0, 0)] });
    expect(oblique.shape).toBe('rectangle');
    expect(frameOfAnnotation(oblique)).toEqual({ centre: pt(65, 25), halfWidth: 65, halfHeight: 25, rotation: 0 });
    const several = selectionFrame([drawing({ points: [pt(0, 0), pt(10, 10)] }), text({ x: 200, y: 100 })], measure);
    expect(several).toEqual({ centre: pt(125, 55), halfWidth: 125, halfHeight: 55, rotation: 0 });
    expect(selectionFrame([])).toBeNull();
  });
});

describe('which handles a selection has', () => {
  it('gives a shape corners, sides and a turn handle', () => {
    for (const shape of [drawing({ type: 'rectangle', points: rectanglePoints(pt(0, 0), pt(200, 100)) }), drawing({ type: 'circle', points: ellipsePoints(pt(0, 0), pt(200, 100)) }), drawing({ points: [pt(0, 0), pt(200, 100)] })]) {
      const handles = handlesOf([shape])!;
      expect([count(handles, 'corner'), count(handles, 'side'), count(handles, 'turn'), count(handles, 'point')]).toEqual([4, 4, 1, 0]);
      expect(handles.proportional).toBe(false);
    }
  });

  it('gives a text and a stamp corners that keep their shape and a turn handle, and a text the two sides its width lies between', () => {
    const stamp = handlesOf([drawing({ type: 'icon', icon: 'door-open', points: [pt(0, 0)], width: 70 })], measure)!;
    expect([count(stamp, 'corner'), count(stamp, 'side'), count(stamp, 'turn')]).toEqual([4, 0, 1]);
    expect([stamp.proportional, stamp.wrap]).toEqual([true, null]);
    const label = text({});
    const handles = handlesOf([label], measure)!;
    expect([count(handles, 'corner'), count(handles, 'turn')]).toEqual([4, 1]);
    expect([handles.proportional, handles.wrap]).toEqual([true, label]);
    // Its left and right side, on a single line too (20 high: 30 with the frame's gap); none above and below.
    expect(handleSpots(handles, 1).flatMap(({ ref }) => (ref.kind === 'side' ? [[ref.x, ref.y]] : []))).toEqual([[1, 0], [-1, 0]]);
    expect(handleAt(handles, pt(50 + HANDLE_LOOK.gap, 0), 1)).toEqual({ kind: 'side', x: 1, y: 0 });
    // Too small on screen to hold them between the corners, it has none.
    expect(count(handles, 'side', 0.5)).toBe(0);
    // Selected with another, a text is stretched like the rest: the frame has all four sides, and no text's width to set.
    const both = handlesOf([label, text({ x: 300, y: 300 })], measure)!;
    expect([count(both, 'side'), both.wrap]).toEqual([4, null]);
  });

  it('shows a line\'s points in place of its sides, and nothing but its two ends on a straight line', () => {
    const path = handlesOf([drawing({ type: 'line', points: [pt(0, 0), pt(100, 0), pt(100, 100)] })])!;
    expect([count(path, 'point'), count(path, 'corner'), count(path, 'side'), count(path, 'turn')]).toEqual([3, 4, 0, 1]);
    const straight = handlesOf([drawing({ type: 'line', points: [pt(0, 0), pt(100, 50)] })])!;
    expect(kinds(straight)).toEqual(['point', 'point']);
    // A closed line shows its first corner once; a curve shows its anchors.
    const closed = handlesOf([drawing({ type: 'line', points: [pt(0, 0), pt(100, 0), pt(50, 80), pt(0, 0)] })])!;
    expect(closed.points).toEqual([pt(0, 0), pt(100, 0), pt(50, 80)]);
    const anchors = [pt(0, 0), pt(50, 40), pt(100, 0)];
    expect(handlesOf([drawing({ type: 'line', points: curvedPath(anchors, false), anchors })])!.points).toEqual(anchors);
  });

  it('frames several as one, and a line among them shows no points', () => {
    const handles = handlesOf([drawing({ type: 'line', points: [pt(0, 0), pt(100, 0), pt(100, 100)] }), text({ x: 300, y: 300 })], measure)!;
    expect([count(handles, 'corner'), count(handles, 'side'), count(handles, 'turn'), count(handles, 'point')]).toEqual([4, 4, 1, 0]);
    expect(handlesOf([])).toBeNull();
  });

  it('leaves the handle off a side too short to hold one between its corners', () => {
    const wide = handlesOf([drawing({ points: [pt(0, 0), pt(300, 10)], width: 2 })])!;
    expect(handleSpots(wide, 1).filter(({ ref }) => ref.kind === 'side').map(({ ref }) => ref.kind === 'side' && [ref.x, ref.y])).toEqual([[0, -1], [0, 1]]);
    // Zoomed in, the short sides are long enough on screen.
    expect(count(wide, 'side', 4)).toBe(4);
  });
});

describe('what a point takes', () => {
  const rectangle = handlesOf([drawing({ type: 'rectangle', points: rectanglePoints(pt(0, 0), pt(200, 100)), width: 4 })])!;

  it('takes a handle within 12 screen pixels of its middle, at every zoom', () => {
    for (const zoom of [0.25, 1, 4]) {
      const grow = frameGrow(rectangle, zoom);
      const corner = pt(200 + grow, 100 + grow);
      const reach = HANDLE_LOOK.reach / zoom;
      expect(handleAt(rectangle, pt(corner.x + reach * 0.9, corner.y), zoom)).toEqual({ kind: 'corner', x: 1, y: 1 });
      expect(isGrip(handleAt(rectangle, pt(corner.x + reach * 1.1, corner.y), zoom))).toBe(false);
      // The frame stands off the ink by the same screen pixels at every zoom.
      expect((grow - 2) * zoom).toBeCloseTo(HANDLE_LOOK.gap);
    }
  });

  it('takes the turn handle above the frame, a side in its middle, and the inside as the body', () => {
    const grow = frameGrow(rectangle, 1);
    expect(handleAt(rectangle, pt(100, -grow - HANDLE_LOOK.stem), 1)).toEqual({ kind: 'turn' });
    expect(handleAt(rectangle, pt(200 + grow, 50), 1)).toEqual({ kind: 'side', x: 1, y: 0 });
    expect(handleAt(rectangle, pt(100, 50), 1)).toEqual({ kind: 'body' });
    expect(handleAt(rectangle, pt(100, 100 + grow + 20), 1)).toBeNull();
    expect(isGrip({ kind: 'body' })).toBe(false);
  });

  it('takes a line\'s point before the frame\'s corner it lies on, its edge beside its points, and nothing of a line among several', () => {
    const line = drawing({ type: 'line', points: [pt(0, 0), pt(100, 0), pt(100, 100)], width: 4 });
    const handles = handlesOf([line])!;
    expect(handleAt(handles, pt(2, 2), 1)).toEqual({ kind: 'point', index: 0 });
    expect(handleAt(handles, pt(50, 3), 1)).toEqual({ kind: 'edge', after: 0, at: pt(50, 0) });
    expect(handleAt(handles, pt(100, 60), 1)).toEqual({ kind: 'edge', after: 1, at: pt(100, 60) });
    expect(handleAt(handles, pt(40, 50), 1)).toEqual({ kind: 'body' });
  });

  it('follows a turn: the handles of a turned frame stand where the turn puts them', () => {
    const turned = mapHandles(rectangle, turnAbout(rectangle.frame.centre, 90));
    expect(turned.frame).toMatchObject({ centre: pt(100, 50), halfWidth: 100, halfHeight: 50, rotation: 90 });
    const grow = frameGrow(turned, 1);
    // What was the top side's middle now points right.
    expect(handleAt(turned, pt(100 + 50 + grow + HANDLE_LOOK.stem, 50), 1)).toEqual({ kind: 'turn' });
  });
});

describe('a line\'s points', () => {
  const open = drawing({ type: 'line', points: [pt(0, 0), pt(100, 0), pt(100, 100)] });
  const closed = drawing({ type: 'line', points: [pt(0, 0), pt(100, 0), pt(50, 80), pt(0, 0)], fill: 'soft' });
  const anchors = [pt(0, 0), pt(50, 40), pt(100, 0), pt(150, 40)];
  const curve = drawing({ type: 'line', points: curvedPath(anchors, false), anchors });

  it('are a line\'s alone: no pen stroke, shape or text has them, nor a line with too many', () => {
    expect(linePointsOf(drawing({ points: [pt(0, 0), pt(10, 10)] }))).toBeNull();
    expect(linePointsOf(drawing({ type: 'rectangle', points: rectanglePoints(pt(0, 0), pt(10, 10)) }))).toBeNull();
    expect(linePointsOf(text({}))).toBeNull();
    const long = Array.from({ length: MAX_LINE_HANDLES + 1 }, (_, index) => pt(index * 10, index % 2));
    expect(linePointsOf(drawing({ type: 'line', points: long }))).toBeNull();
    expect(linePointsOf(drawing({ type: 'line', points: long.slice(1) }))).toHaveLength(MAX_LINE_HANDLES);
  });

  it('move one at a time; a closed line\'s first corner takes its last along', () => {
    expect(withPointMoved(open, 1, pt(120, -10))).toEqual({ points: [pt(0, 0), pt(120, -10), pt(100, 100)] });
    expect(withPointMoved(closed, 0, pt(-10, -10))).toEqual({ points: [pt(-10, -10), pt(100, 0), pt(50, 80), pt(-10, -10)] });
    expect(withPointMoved(open, 3, pt(0, 0))).toBeNull();
  });

  it('make a curve again through its moved anchors', () => {
    const place = withPointMoved(curve, 1, pt(50, 80))!;
    expect(place.anchors).toEqual([pt(0, 0), pt(50, 80), pt(100, 0), pt(150, 40)]);
    expect(place.points).toEqual(curvedPath(place.anchors!, false));
    expect(place.points![CURVE_STEPS]).toEqual(pt(50, 80));
  });

  it('take one more on an edge, after the point the edge begins at', () => {
    expect(edgeNear(open, pt(100, 40), 5)).toEqual({ after: 1, at: pt(100, 40) });
    expect(edgeNear(open, pt(50, 30), 5)).toBeNull();
    expect(withPointAdded(open, 1, pt(100, 40))).toEqual({ points: [pt(0, 0), pt(100, 0), pt(100, 40), pt(100, 100)] });
    // A closed line's last edge runs back to its first corner.
    expect(edgeNear(closed, pt(25, 40), 2)?.after).toBe(2);
    expect(withPointAdded(closed, 2, pt(25, 40))).toEqual({ points: [pt(0, 0), pt(100, 0), pt(50, 80), pt(25, 40), pt(0, 0)] });
    // On a curve the point becomes an anchor between the two the piece lies between.
    const onCurve = curve.points[CURVE_STEPS + 5]!;
    expect(edgeNear(curve, onCurve, 1)).toEqual({ after: 1, at: onCurve });
    expect(withPointAdded(curve, 1, onCurve)?.anchors).toEqual([anchors[0], anchors[1], onCurve, anchors[2], anchors[3]]);
  });

  it('lose one, but never the second of an open line or the third of a closed one', () => {
    expect(withPointRemoved(open, 1)).toEqual({ points: [pt(0, 0), pt(100, 100)] });
    expect(withPointRemoved(drawing({ type: 'line', points: [pt(0, 0), pt(100, 100)] }), 0)).toBeNull();
    expect(withPointRemoved(closed, 0)).toBeNull();
    const square = drawing({ type: 'line', points: [pt(0, 0), pt(100, 0), pt(100, 100), pt(0, 100), pt(0, 0)] });
    expect(withPointRemoved(square, 0)).toEqual({ points: [pt(100, 0), pt(100, 100), pt(0, 100), pt(100, 0)] });
    expect(withPointRemoved(curve, 3)?.anchors).toEqual(anchors.slice(0, 3));
  });
});
