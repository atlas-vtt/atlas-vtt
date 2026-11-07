import { describe, expect, it } from 'vitest';
import { PointerTap, thinTrail, type TapEvent, type TapViewport } from '../../../../src/app/online/marks/PointerTap.ts';
import { MAX_LASER_SPAN_MS } from '../../../../src/app/online/protocol/index.ts';

type Listener = (event: TapEvent) => void;

/** A viewport whose world is its screen, a clock a test sets, and a tap on both with the Laser tool active. */
function tapped(): { readonly tap: PointerTap; send(name: string, x: number, at: number, button?: number): void } {
  const listeners = new Map<string, Listener>();
  let now = 0;
  const viewport: TapViewport = {
    on: (event, listener) => void listeners.set(event, listener),
    off: (event) => void listeners.delete(event),
    toWorld: (point) => point,
    scale: { x: 1 },
  };
  const tap = new PointerTap(viewport, new EventTarget(), () => true, () => now);
  return {
    tap,
    send: (name, x, at, button = 0) => {
      now = at;
      listeners.get(name)?.({ button, global: { x, y: 0 } });
    },
  };
}

describe('PointerTap', () => {
  it('tells every point drawn since the last take and the time from the last take\'s pointer to this one\'s', () => {
    const { tap, send } = tapped();
    send('pointerdown', 0, 1000);
    expect(tap.takeTrail(64)).toEqual({ pts: [0, 0] });
    for (const [x, at] of [[10, 1008], [20, 1017], [30, 1025], [40, 1033]] as const) send('pointermove', x, at);
    expect(tap.takeTrail(64)).toEqual({ pts: [10, 0, 20, 0, 30, 0, 40, 0], span: 33 });
    // A move too short for a trail point of its own adds none, but its time still counts.
    send('pointermove', 45, 1042);
    send('pointermove', 46, 1050);
    expect(tap.takeTrail(64)).toEqual({ pts: [45, 0], span: 17 });
    expect(tap.takeTrail(64)).toEqual({ pts: [], span: 0 });
  });

  it('keeps whole milliseconds in step with the clock over many takes', () => {
    const { tap, send } = tapped();
    send('pointerdown', 0, 0);
    tap.takeTrail(64);
    let told = 0;
    for (let index = 1; index <= 300; index += 1) {
      send('pointermove', index * 10, (index * 100) / 3);
      const { span } = tap.takeTrail(64);
      expect(Number.isInteger(span)).toBe(true);
      told += span ?? 0;
    }
    expect(Math.abs(told - 10000)).toBeLessThanOrEqual(1);
  });

  it('tells no more than the longest span after a long pause, and none before the pointer was seen', () => {
    const { tap, send } = tapped();
    expect(tap.takeTrail(64)).toEqual({ pts: [] });
    send('pointermove', 5, 100);
    expect(tap.takeTrail(64)).toEqual({ pts: [] });
    send('pointermove', 50, 9000);
    expect(tap.takeTrail(64)).toEqual({ pts: [], span: MAX_LASER_SPAN_MS });
    send('pointermove', 60, 9020);
    expect(tap.takeTrail(64).span).toBe(20);
  });

  it('counts no time for a pointer that is told to move and stays where it is', () => {
    const { tap, send } = tapped();
    send('pointermove', 5, 0);
    tap.takeTrail(64);
    send('pointermove', 5.01, 40);
    expect(tap.takeTrail(64)).toEqual({ pts: [], span: 0 });
    send('pointermove', 9, 100);
    expect(tap.takeTrail(64).span).toBe(100);
  });

  it('spreads the points it gives along the whole stroke, the newest last, when more were drawn than a message holds', () => {
    const { tap, send } = tapped();
    send('pointerdown', 0, 0);
    for (let index = 1; index <= 40; index += 1) send('pointermove', index * 10, index);
    const { pts } = tap.takeTrail(8);
    expect(pts).toEqual([90, 0, 200, 0, 300, 0, 400, 0]);
    expect(tap.takeTrail(8).pts).toEqual([]);
  });

  it('thins a trail evenly and keeps one that fits whole', () => {
    expect(thinTrail([1, 1, 2, 2, 3, 3], 8)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(thinTrail([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6], 6)).toEqual([2, 2, 4, 4, 6, 6]);
    expect(thinTrail([1, 1, 2, 2], 0)).toEqual([]);
  });
});
