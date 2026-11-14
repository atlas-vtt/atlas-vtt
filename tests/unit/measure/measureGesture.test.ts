import { describe, expect, it } from 'vitest';
import { MAX_RULER_POINTS } from '../../../src/app/measure/measureTypes';
import { MEASURE_DRAG_THRESHOLD, MeasureGesture } from '../../../src/app/pixi/measure/measureGesture';

const at = (x: number, y = 0): { x: number; y: number } => ({ x, y });

/** A click in place at `x`: a press and its release, the screen being the world. */
function click(gesture: MeasureGesture, x: number): ReturnType<MeasureGesture['release']> {
  if (gesture.active) gesture.press(at(x), at(x));
  else gesture.begin('ruler', at(x), at(x));
  return gesture.release(at(x));
}

describe('MeasureGesture, dragged', () => {
  it('measures from the press to the release', () => {
    const gesture = new MeasureGesture();
    expect(gesture.begin('ruler', at(0), at(0))).toEqual({ kind: 'live' });
    expect(gesture.measurement).toEqual({ shape: 'ruler', points: [at(0), at(0)] });
    expect(gesture.move(at(70), at(70))).toEqual({ kind: 'live' });
    expect(gesture.measurement).toEqual({ shape: 'ruler', points: [at(0), at(70)] });
    expect(gesture.release(at(140))).toEqual({ kind: 'finish', measurement: { shape: 'ruler', points: [at(0), at(140)] } });
    expect(gesture.active).toBe(false);
    expect(gesture.measurement).toBeNull();
  });

  it('tells nothing for a move that leaves the end where it is', () => {
    const gesture = new MeasureGesture();
    gesture.begin('ruler', at(0), at(0));
    gesture.move(at(70), at(60));
    expect(gesture.move(at(70), at(64))).toEqual({ kind: 'none' });
  });

  it('leaves nothing when it ends where it started', () => {
    const gesture = new MeasureGesture();
    gesture.begin('circle', at(0), at(0));
    gesture.move(at(70), at(70));
    gesture.move(at(0), at(20));
    expect(gesture.release(at(0))).toEqual({ kind: 'cancel' });
    expect(gesture.active).toBe(false);
  });

  it('takes Space for a corner of a ruler, once per place, and Backspace takes the last one back', () => {
    const gesture = new MeasureGesture();
    gesture.begin('ruler', at(0), at(0));
    expect(gesture.corner()).toEqual({ kind: 'none' });
    gesture.move(at(70), at(70));
    expect(gesture.corner()).toEqual({ kind: 'live' });
    expect(gesture.corner()).toEqual({ kind: 'none' });
    gesture.move(at(70, 70), at(70, 70));
    gesture.corner();
    gesture.move(at(140, 70), at(140, 70));
    expect(gesture.measurement?.points).toEqual([at(0), at(70), at(70, 70), at(140, 70)]);
    expect(gesture.back()).toEqual({ kind: 'live' });
    expect(gesture.measurement?.points).toEqual([at(0), at(70), at(140, 70)]);
    gesture.back();
    // The start is no corner.
    expect(gesture.back()).toEqual({ kind: 'none' });
    expect(gesture.release(at(140, 70))).toEqual({ kind: 'finish', measurement: { shape: 'ruler', points: [at(0), at(140, 70)] } });
  });

  it('ends on its last corner when it is released there', () => {
    const gesture = new MeasureGesture();
    gesture.begin('ruler', at(0), at(0));
    gesture.move(at(70), at(70));
    gesture.corner();
    expect(gesture.release(at(70))).toEqual({ kind: 'finish', measurement: { shape: 'ruler', points: [at(0), at(70)] } });
  });

  it.each(['circle', 'cone'] as const)('gives a %s no corners: an area is its origin and its end', (shape) => {
    const gesture = new MeasureGesture();
    gesture.begin(shape, at(0), at(0));
    gesture.move(at(70), at(70));
    expect(gesture.corner()).toEqual({ kind: 'none' });
    expect(gesture.release(at(140))).toEqual({ kind: 'finish', measurement: { shape, points: [at(0), at(140)] } });
  });

  it('stops taking corners before a ruler has more points than a kept one may', () => {
    const gesture = new MeasureGesture();
    gesture.begin('ruler', at(0), at(0));
    for (let step = 1; step <= MAX_RULER_POINTS + 5; step++) {
      gesture.move(at(step * 70), at(step * 70));
      gesture.corner();
    }
    const result = gesture.release(at(7000));
    expect(result.kind === 'finish' && result.measurement.points.length).toBe(MAX_RULER_POINTS);
  });

  it('is dropped by Escape, and Enter does nothing to a drag', () => {
    const gesture = new MeasureGesture();
    gesture.begin('ruler', at(0), at(0));
    gesture.move(at(70), at(70));
    expect(gesture.finish()).toEqual({ kind: 'none' });
    expect(gesture.cancel()).toEqual({ kind: 'cancel' });
    expect(gesture.cancel()).toEqual({ kind: 'none' });
    expect(gesture.release(at(70))).toEqual({ kind: 'none' });
  });
});

describe('MeasureGesture, placed click by click', () => {
  it('starts placing when the first press is released within the threshold, and follows the pointer with no button down', () => {
    const gesture = new MeasureGesture();
    gesture.begin('ruler', at(0), at(0));
    gesture.move(at(0), at(MEASURE_DRAG_THRESHOLD));
    expect(gesture.release(at(0))).toEqual({ kind: 'live' });
    expect(gesture.active).toBe(true);
    expect(gesture.move(at(210), at(210))).toEqual({ kind: 'live' });
    expect(gesture.measurement).toEqual({ shape: 'ruler', points: [at(0), at(210)] });
  });

  it('places a corner of a ruler with every click and finishes with a click on the last one, as a double click does', () => {
    const gesture = new MeasureGesture();
    click(gesture, 0);
    expect(click(gesture, 70)).toEqual({ kind: 'live' });
    expect(click(gesture, 210)).toEqual({ kind: 'live' });
    expect(click(gesture, 210)).toEqual({ kind: 'finish', measurement: { shape: 'ruler', points: [at(0), at(70), at(210)] } });
  });

  it('finishes with Enter where the pointer is', () => {
    const gesture = new MeasureGesture();
    click(gesture, 0);
    click(gesture, 70);
    gesture.move(at(70, 140), at(70, 140));
    expect(gesture.finish()).toEqual({ kind: 'finish', measurement: { shape: 'ruler', points: [at(0), at(70), at(70, 140)] } });
  });

  it('finishes an area with its second click', () => {
    const gesture = new MeasureGesture();
    gesture.begin('cone', at(0), at(0));
    gesture.release(at(0));
    gesture.press(at(140), at(140));
    expect(gesture.release(at(140))).toEqual({ kind: 'finish', measurement: { shape: 'cone', points: [at(0), at(140)] } });
  });

  it('leaves nothing for a double click in one place, or Enter on the start', () => {
    const twice = new MeasureGesture();
    click(twice, 0);
    expect(click(twice, 0)).toEqual({ kind: 'cancel' });
    const entered = new MeasureGesture();
    click(entered, 0);
    expect(entered.finish()).toEqual({ kind: 'cancel' });
  });

  it('takes a release only for its own press: another button coming up places nothing', () => {
    const gesture = new MeasureGesture();
    click(gesture, 0);
    gesture.move(at(140), at(140));
    expect(gesture.release(at(140))).toEqual({ kind: 'none' });
    expect(gesture.measurement?.points).toEqual([at(0), at(140)]);
  });

  it('gives a press whose release never came way to the next one', () => {
    const gesture = new MeasureGesture();
    gesture.begin('ruler', at(0), at(0));
    gesture.move(at(70), at(70));
    expect(gesture.press(at(140), at(140))).toEqual({ kind: 'live' });
    expect(gesture.release(at(140))).toEqual({ kind: 'live' });
    expect(gesture.measurement?.points).toEqual([at(0), at(140)]);
  });

  it('takes Space and Backspace as a drag does', () => {
    const gesture = new MeasureGesture();
    click(gesture, 0);
    gesture.move(at(70), at(70));
    gesture.corner();
    gesture.move(at(140), at(140));
    expect(gesture.measurement?.points).toEqual([at(0), at(70), at(140)]);
    gesture.back();
    expect(gesture.measurement?.points).toEqual([at(0), at(140)]);
  });
});
