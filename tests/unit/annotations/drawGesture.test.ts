import { describe, expect, it } from 'vitest';
import { STEADY_SLACK } from '../../../src/app/annotations/penStroke';
import { CORNER_REACH, DRAW_DRAG_THRESHOLD, DrawGesture, MAX_LINE_CORNERS, type DrawPointer } from '../../../src/app/pixi/annotations/drawGesture';

const pt = (x: number, y = 0): { x: number; y: number } => ({ x, y });
/** The pointer at (x, y), the screen being the world and nothing snapping. */
const at = (x: number, y = 0, more: Partial<DrawPointer> = {}): DrawPointer => ({ raw: pt(x, y), placed: pt(x, y), screen: pt(x, y), zoom: 1, constrain: false, ...more });

/** A click in place: a press (the first begins the gesture) and its release. */
function click(gesture: DrawGesture, mode: 'line' | 'rectangle' | 'ellipse', x: number, y = 0): ReturnType<DrawGesture['release']> {
  if (gesture.active) gesture.press(at(x, y));
  else gesture.begin(mode, at(x, y));
  return gesture.release(at(x, y));
}

describe('DrawGesture, the pen', () => {
  it('draws from the press to the release, ending where the pointer is', () => {
    const gesture = new DrawGesture();
    expect(gesture.begin('pen', at(0))).toEqual({ kind: 'live' });
    expect(gesture.shape).toEqual({ mode: 'pen', points: [pt(0)], closed: false });
    expect(gesture.move(at(100))).toEqual({ kind: 'live' });
    const result = gesture.release(at(100));
    expect(result.kind).toBe('finish');
    if (result.kind !== 'finish' || !result.made) throw new Error('Expected a stroke');
    expect(result.made.mode).toBe('pen');
    expect(result.made.points[0]).toEqual(pt(0));
    expect(result.made.points.at(-1)).toEqual(pt(100));
    expect(gesture.active).toBe(false);
  });

  it('trails the pointer by no more than the slack, at any zoom', () => {
    for (const zoom of [0.5, 1, 4]) {
      const gesture = new DrawGesture();
      gesture.begin('pen', at(0, 0, { zoom }));
      for (let x = 40; x <= 400; x += 40) {
        gesture.move(at(x, 0, { zoom }));
        const last = gesture.shape?.points.at(-1);
        expect(Math.abs(x - (last?.x ?? Infinity)) * zoom).toBeLessThanOrEqual(STEADY_SLACK + 1e-9);
      }
    }
  });

  it('keeps one list of points that only grows at its end', () => {
    const gesture = new DrawGesture();
    gesture.begin('pen', at(0));
    const points = gesture.shape?.points;
    gesture.move(at(10));
    gesture.move(at(20, 5));
    expect(gesture.shape?.points).toBe(points);
    expect(points).toHaveLength(3);
  });

  it('is a dot for a press released in place', () => {
    const gesture = new DrawGesture();
    gesture.begin('pen', at(7, 9));
    expect(gesture.release(at(7, 9))).toEqual({ kind: 'finish', made: { mode: 'pen', points: [pt(7, 9)], closed: false } });
  });

  it('goes on as one straight piece in 15° steps while Shift is held, from where Shift went down', () => {
    const gesture = new DrawGesture();
    gesture.begin('pen', at(0));
    gesture.move(at(2));
    const before = gesture.shape?.points.length ?? 0;
    gesture.move(at(100, 4, { constrain: true }));
    gesture.move(at(200, 9, { constrain: true }));
    const points = gesture.shape?.points ?? [];
    // One point for the whole straight piece, level with where it began.
    expect(points).toHaveLength(before + 1);
    expect(points.at(-1)?.y).toBe(points[before - 1]?.y);
    expect(points.at(-1)?.x).toBeCloseTo(200, 6);
    // Without Shift the stroke goes on from the piece's end.
    gesture.move(at(202, 30));
    expect(gesture.shape?.points).toHaveLength(before + 2);
  });

  it('takes no corner, and Enter ends nothing', () => {
    const gesture = new DrawGesture();
    gesture.begin('pen', at(0));
    gesture.move(at(50));
    expect(gesture.corner()).toEqual({ kind: 'none' });
    expect(gesture.back()).toEqual({ kind: 'none' });
    expect(gesture.finish()).toEqual({ kind: 'none' });
  });
});

describe('DrawGesture, shapes by a drag', () => {
  it('makes a line from the press to the release', () => {
    const gesture = new DrawGesture();
    gesture.begin('line', at(0));
    gesture.move(at(70, 70));
    expect(gesture.shape).toEqual({ mode: 'line', points: [pt(0), pt(70, 70)], closed: false });
    expect(gesture.release(at(140, 70))).toEqual({ kind: 'finish', made: { mode: 'line', points: [pt(0), pt(140, 70)], closed: false } });
  });

  it('places a shape\'s points where the tool places them, and the pen\'s where the pointer is', () => {
    const shape = new DrawGesture();
    shape.begin('rectangle', at(3, 4, { placed: pt(0, 0) }));
    shape.move(at(66, 71, { placed: pt(70, 70) }));
    expect(shape.shape?.points).toEqual([pt(0, 0), pt(70, 70)]);
    const pen = new DrawGesture();
    pen.begin('pen', at(3, 4, { placed: pt(0, 0) }));
    expect(pen.shape?.points).toEqual([pt(3, 4)]);
  });

  it('makes a rectangle or an ellipse from corner to corner, a square or a circle with Shift', () => {
    for (const mode of ['rectangle', 'ellipse'] as const) {
      const gesture = new DrawGesture();
      gesture.begin(mode, at(10, 10));
      gesture.move(at(110, 60));
      expect(gesture.shape).toEqual({ mode, points: [pt(10, 10), pt(110, 60)], closed: false });
      expect(gesture.release(at(110, 60, { constrain: true }))).toEqual({ kind: 'finish', made: { mode, points: [pt(10, 10), pt(110, 110)], closed: false } });
    }
  });

  it('turns a line in 15° steps with Shift', () => {
    const gesture = new DrawGesture();
    gesture.begin('line', at(0));
    gesture.move(at(100, 5, { constrain: true }));
    expect(gesture.shape?.points[1]).toEqual(pt(100, 0));
  });

  it('adds a corner with Space, once per place, and takes the last one back with Backspace', () => {
    const gesture = new DrawGesture();
    gesture.begin('line', at(0));
    expect(gesture.corner()).toEqual({ kind: 'none' });
    gesture.move(at(70));
    expect(gesture.corner()).toEqual({ kind: 'live' });
    expect(gesture.corner()).toEqual({ kind: 'none' });
    gesture.move(at(70, 70));
    gesture.corner();
    gesture.move(at(140, 70));
    expect(gesture.shape?.points).toEqual([pt(0), pt(70), pt(70, 70), pt(140, 70)]);
    expect(gesture.back()).toEqual({ kind: 'live' });
    expect(gesture.shape?.points).toEqual([pt(0), pt(70), pt(140, 70)]);
    gesture.back();
    // The start is no corner.
    expect(gesture.back()).toEqual({ kind: 'none' });
    expect(gesture.release(at(140, 70))).toEqual({ kind: 'finish', made: { mode: 'line', points: [pt(0), pt(140, 70)], closed: false } });
  });

  it('gives a rectangle no corners', () => {
    const gesture = new DrawGesture();
    gesture.begin('rectangle', at(0));
    gesture.move(at(70, 70));
    expect(gesture.corner()).toEqual({ kind: 'none' });
    expect(gesture.back()).toEqual({ kind: 'none' });
  });

  it('leaves nothing for a box without a size, and for Escape', () => {
    const box = new DrawGesture();
    box.begin('rectangle', at(0));
    box.move(at(70, 70));
    box.move(at(0, 20));
    box.move(at(0));
    expect(box.release(at(0))).toEqual({ kind: 'cancel' });
    const line = new DrawGesture();
    line.begin('line', at(0));
    line.move(at(70));
    expect(line.cancel()).toEqual({ kind: 'cancel' });
    expect(line.active).toBe(false);
    expect(line.shape).toBeNull();
    expect(line.cancel()).toEqual({ kind: 'none' });
  });

  it('counts a press that moved no farther than the threshold as a click', () => {
    const gesture = new DrawGesture();
    gesture.begin('line', at(0));
    gesture.move(at(DRAW_DRAG_THRESHOLD));
    expect(gesture.release(at(DRAW_DRAG_THRESHOLD))).toEqual({ kind: 'live' });
    expect(gesture.active).toBe(true);
  });
});

describe('DrawGesture, shapes click by click', () => {
  it('places a line corner by corner and ends it on a second click in place', () => {
    const gesture = new DrawGesture();
    expect(click(gesture, 'line', 0)).toEqual({ kind: 'live' });
    // The button is up: the line follows the pointer.
    gesture.move(at(50));
    expect(gesture.shape?.points).toEqual([pt(0), pt(50)]);
    expect(click(gesture, 'line', 70)).toEqual({ kind: 'live' });
    expect(click(gesture, 'line', 70, 70)).toEqual({ kind: 'live' });
    expect(click(gesture, 'line', 70, 70)).toEqual({ kind: 'finish', made: { mode: 'line', points: [pt(0), pt(70), pt(70, 70)], closed: false } });
  });

  it('ends a line with Enter where the pointer is', () => {
    const gesture = new DrawGesture();
    click(gesture, 'line', 0);
    click(gesture, 'line', 70);
    gesture.move(at(70, 90));
    expect(gesture.finish()).toEqual({ kind: 'finish', made: { mode: 'line', points: [pt(0), pt(70), pt(70, 90)], closed: false } });
  });

  it('closes a line that ends on its first corner, the pointer drawn onto it from nearby', () => {
    const gesture = new DrawGesture();
    click(gesture, 'line', 0);
    click(gesture, 'line', 100);
    click(gesture, 'line', 100, 100);
    gesture.move(at(CORNER_REACH - 1, 1));
    expect(gesture.shape).toEqual({ mode: 'line', points: [pt(0), pt(100), pt(100, 100)], closed: true });
    expect(click(gesture, 'line', CORNER_REACH - 1, 1)).toEqual({ kind: 'finish', made: { mode: 'line', points: [pt(0), pt(100), pt(100, 100)], closed: true } });
  });

  it('closes nothing that has no inside: two corners end on the first as a line there and back', () => {
    const gesture = new DrawGesture();
    click(gesture, 'line', 0);
    click(gesture, 'line', 100);
    const result = click(gesture, 'line', 0);
    expect(result).toEqual({ kind: 'live' });
    expect(gesture.shape?.closed).toBe(false);
  });

  it('closes a line with Space on its first corner', () => {
    const gesture = new DrawGesture();
    gesture.begin('line', at(0));
    gesture.move(at(100));
    gesture.corner();
    gesture.move(at(100, 100));
    gesture.corner();
    gesture.move(at(2, 2));
    expect(gesture.corner()).toEqual({ kind: 'finish', made: { mode: 'line', points: [pt(0), pt(100), pt(100, 100)], closed: true } });
  });

  it('ends a rectangle or an ellipse with the second click', () => {
    for (const mode of ['rectangle', 'ellipse'] as const) {
      const gesture = new DrawGesture();
      expect(click(gesture, mode, 0)).toEqual({ kind: 'live' });
      gesture.move(at(40, 30));
      expect(gesture.shape?.points).toEqual([pt(0), pt(40, 30)]);
      expect(click(gesture, mode, 80, 60)).toEqual({ kind: 'finish', made: { mode, points: [pt(0), pt(80, 60)], closed: false } });
    }
  });

  it('ends a line that reaches the most corners a drawing may have', () => {
    const gesture = new DrawGesture();
    let result = click(gesture, 'line', 0);
    for (let corner = 1; corner < MAX_LINE_CORNERS && result.kind === 'live'; corner++) result = click(gesture, 'line', corner * 20, (corner % 2) * 20);
    expect(result.kind).toBe('finish');
    if (result.kind === 'finish') expect(result.made?.points).toHaveLength(MAX_LINE_CORNERS);
  });

  it('drops the shape when the tool\'s work ends by something else', () => {
    const gesture = new DrawGesture();
    click(gesture, 'line', 0);
    click(gesture, 'line', 70);
    expect(gesture.stop()).toEqual({ kind: 'cancel' });
    expect(gesture.active).toBe(false);
  });
});

describe('DrawGesture, the eraser', () => {
  it('dabs at the press and sweeps from place to place while the button is down', () => {
    const gesture = new DrawGesture();
    expect(gesture.begin('eraser', at(5, 5))).toEqual({ kind: 'sweep', from: pt(5, 5), to: pt(5, 5) });
    expect(gesture.shape).toBeNull();
    expect(gesture.move(at(5, 5))).toEqual({ kind: 'none' });
    expect(gesture.move(at(30, 5))).toEqual({ kind: 'sweep', from: pt(5, 5), to: pt(30, 5) });
    expect(gesture.move(at(30, 40))).toEqual({ kind: 'sweep', from: pt(30, 5), to: pt(30, 40) });
    expect(gesture.release(at(30, 40))).toEqual({ kind: 'finish', made: null });
    expect(gesture.move(at(60, 40))).toEqual({ kind: 'none' });
  });

  it('follows the pointer as it is, whatever the tool would snap', () => {
    const gesture = new DrawGesture();
    gesture.begin('eraser', at(3, 4, { placed: pt(0, 0) }));
    expect(gesture.move(at(33, 4, { placed: pt(35, 0) }))).toEqual({ kind: 'sweep', from: pt(3, 4), to: pt(33, 4) });
  });

  it('ends where it is, keeping what it erased, when the tool\'s work ends by something else', () => {
    const gesture = new DrawGesture();
    gesture.begin('eraser', at(0));
    gesture.move(at(20));
    expect(gesture.stop()).toEqual({ kind: 'finish', made: null });
  });
});

describe('DrawGesture, one at a time', () => {
  it('begins nothing while a gesture is under way', () => {
    const gesture = new DrawGesture();
    gesture.begin('line', at(0));
    expect(gesture.begin('pen', at(50))).toEqual({ kind: 'none' });
    expect(gesture.mode).toBe('line');
  });

  it('takes a press only while a shape waits for its next click', () => {
    const gesture = new DrawGesture();
    expect(gesture.press(at(0))).toEqual({ kind: 'none' });
    gesture.begin('line', at(0));
    expect(gesture.press(at(10))).toEqual({ kind: 'none' });
  });
});
