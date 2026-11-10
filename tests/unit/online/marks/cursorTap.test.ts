import { describe, expect, it } from 'vitest';
import { CursorTap, type CursorCanvas, type CursorEvent, type CursorViewport } from '../../../../src/app/online/marks/CursorTap.ts';

/** The tasks the tap put off until after the event under way, as the browser runs them later. */
let tasks: (() => void)[] = [];

/** Runs the tasks queued after the events so far, as the browser does once each event has run to its end. */
async function settled(): Promise<void> {
  await Promise.resolve();
  const due = tasks;
  tasks = [];
  due.forEach((task) => task());
}

interface Tapped {
  readonly tap: CursorTap;
  /** A move of a mouse to `x` on the canvas at `at`, as the canvas reports it. */
  readonly move: (x: number, at: number, pointerType?: string) => void;
  /** The camera moves the map under the pointer by `dx` world units. */
  readonly pan: (dx: number, at: number) => void;
  readonly leave: () => void;
  readonly changes: () => number;
}

/** A viewport whose world is its screen at `zoom` moved by a pan, a clock a test sets, and a cursor tap on both. */
function tapped(zoom = 1): Tapped {
  const pointer = new Map<string, (event: CursorEvent) => void>();
  const plain = new Map<string, () => void>();
  let now = 0;
  let changes = 0;
  let offset = 0;
  const viewport: CursorViewport = {
    on: (event: string, listener: () => void) => void plain.set(event, listener),
    off: (event: string) => void plain.delete(event),
    toWorld: ({ x, y }) => ({ x: x / zoom - offset, y: y / zoom }),
    scale: { x: zoom },
  };
  const canvas: CursorCanvas = {
    addEventListener: (type: string, listener: (event: CursorEvent) => void) => void (type === 'mouseleave' ? plain.set(type, listener as () => void) : pointer.set(type, listener)),
    removeEventListener: (type: string) => void (pointer.delete(type), plain.delete(type)),
  };
  tasks = [];
  const tap = new CursorTap(viewport, canvas, () => now, (run) => void tasks.push(run));
  tap.subscribe(() => void (changes += 1));
  const event = (x: number, pointerType = 'mouse'): CursorEvent => ({ offsetX: x, offsetY: 0, pointerType });
  return {
    tap,
    move: (x, at, pointerType) => {
      now = at;
      pointer.get('pointermove')?.(event(x, pointerType));
    },
    pan: (dx, at) => {
      now = at;
      offset += dx;
      plain.get('moved')?.();
    },
    leave: () => plain.get('mouseleave')?.(),
    changes: () => changes,
  };
}

describe('CursorTap', () => {
  it('follows a mouse over the map in world places, with the places it passed and the time they cover', async () => {
    const { tap, move } = tapped(2);
    move(100, 1000);
    await settled();
    expect(tap.at()).toEqual([50, 0]);
    expect(tap.take(64)).toEqual({ pts: [50, 0] });
    move(120, 1016);
    await settled();
    move(140, 1033);
    await settled();
    expect(tap.take(64)).toEqual({ pts: [60, 0, 70, 0], span: 33 });
    expect(tap.movedAt()).toBe(1033);
  });

  it('pairs the pointer and the camera of one drag step, though the camera moves before the canvas hears the pointer', async () => {
    const { tap, move, pan } = tapped();
    move(100, 1000);
    await settled();
    tap.take(64);
    // As in a browser: PIXI's listener on the document moves the camera (and says so) before the canvas hears the move.
    for (let step = 1; step <= 5; step += 1) {
      pan(30, 1000 + 16 * step);
      await Promise.resolve();
      move(100 + 30 * step, 1000 + 16 * step);
      await settled();
    }
    expect(tap.at()).toEqual([100, 0]);
    expect(tap.take(64).pts).toEqual([]);
  });

  it('works the place out once per event, from the pointer and the camera as the event left them', async () => {
    const { tap, move, pan } = tapped();
    move(100, 1000);
    await settled();
    tap.take(64);
    // A drag moves the pointer and the camera in one event: the place the pointer holds does not move.
    move(150, 1016);
    pan(50, 1016);
    await settled();
    expect(tap.at()).toEqual([100, 0]);
    expect(tap.take(64)).toEqual({ pts: [], span: 0 });
    pan(-50, 1016);
    move(100, 1016);
    await settled();
    expect(tap.at()).toEqual([100, 0]);
  });

  it('leaves out places closer than a receiver could show, and counts a pointer at work that stays on its place', async () => {
    const { tap, move, pan, changes } = tapped();
    move(100, 1000);
    await settled();
    move(101, 1008);
    await settled();
    expect(tap.take(64).pts).toEqual([100, 0]);
    expect(tap.at()).toEqual([101, 0]);
    // A zoom around the pointer leaves it on its place: no new place, but its owner is at work.
    pan(0, 1016);
    await settled();
    expect(tap.take(64).pts).toEqual([]);
    expect(tap.at()).toEqual([101, 0]);
    expect(tap.movedAt()).toBe(1016);
    expect(changes()).toBe(3);
  });

  it('follows the map moving under a pointer at rest, and not once it left', async () => {
    const { tap, move, pan, leave } = tapped();
    move(100, 1000);
    await settled();
    tap.take(64);
    pan(-50, 1100);
    await settled();
    expect(tap.at()).toEqual([150, 0]);
    expect(tap.take(64)).toEqual({ pts: [150, 0], span: 100 });
    leave();
    pan(-50, 1200);
    await settled();
    expect(tap.at()).toBeNull();
  });

  it('has no cursor for a finger', async () => {
    const { tap, move } = tapped();
    move(100, 1000, 'touch');
    await settled();
    expect(tap.at()).toBeNull();
    move(100, 1000, 'pen');
    await settled();
    expect(tap.at()).toEqual([100, 0]);
  });

  it('is away once the pointer leaves the canvas, and comes back on a path of its own', async () => {
    const { tap, move, leave } = tapped();
    move(100, 1000);
    await settled();
    tap.take(64);
    move(120, 1016);
    await settled();
    leave();
    expect(tap.at()).toBeNull();
    expect(tap.movedAt()).toBeNull();
    expect(tap.take(64)).toEqual({ pts: [120, 0], span: 16 });
    move(400, 3000);
    await settled();
    expect(tap.take(64)).toEqual({ pts: [400, 0] });
  });

  it('stops listening once destroyed', async () => {
    const { tap, move } = tapped();
    tap.destroy();
    move(100, 1000);
    await settled();
    expect(tap.at()).toBeNull();
  });
});
