import { describe, expect, it, vi } from 'vitest';
import { PlacementSession, type HeldToken } from '../../src/app/pixi/tokenPlacement/PlacementSession';
import { cycled, facingTowards, footprintCells, formationAt, queueSlot, type PlacementGrid, type Point } from '../../src/app/pixi/tokenPlacement/placementLayout';
import { WheelSteps } from '../../src/app/pixi/tokenPlacement/wheelSteps';
import { Spring } from '../../src/app/pixi/tokenPlacement/placementSpring';
import type { PlacementGhost } from '../../src/app/pixi/tokenPlacement/PlacementGhost';
import type { PlacementMarks } from '../../src/app/pixi/tokenPlacement/PlacementMarks';
import type { TokenInput } from '../../src/app/types/viewState';

/** A click: the button goes down and up in place. */
function put(session: PlacementSession, at: Point, shift: boolean): void {
  session.pressAt(at, shift);
  session.release();
}

/** A square grid of 70 px cells from the origin. */
const square: PlacementGrid = {
  hex: false,
  cellSize: 70,
  snapToken: ({ x, y }, size) => {
    const shift = Math.round(2 * size - 1) % 2 === 0 ? 35 : 0;
    return { x: Math.floor((x - shift) / 70) * 70 + 35 + shift, y: Math.floor((y - shift) / 70) * 70 + 35 + shift };
  },
  cellCentre: ({ x, y }) => ({ x: Math.floor(x / 70) * 70 + 35, y: Math.floor(y / 70) * 70 + 35 }),
  cellOutline: (centre) => [centre],
};

describe('laying held tokens out', () => {
  it('moves the formation by whole cells, held by its middle', () => {
    const tokens = [{ home: { x: 35, y: 35 }, size: 1 }, { home: { x: 105, y: 35 }, size: 1 }, { home: { x: 35, y: 105 }, size: 1 }];
    expect(formationAt(tokens, { x: 290, y: 300 }, square)).toEqual([{ x: 245, y: 245 }, { x: 315, y: 245 }, { x: 245, y: 315 }]);
  });

  it('moves freely without a grid', () => {
    const tokens = [{ home: { x: 0, y: 0 }, size: 1 }, { home: { x: 100, y: 0 }, size: 1 }];
    expect(formationAt(tokens, { x: 13, y: 7 }, null)).toEqual([{ x: -37, y: 7 }, { x: 63, y: 7 }]);
  });

  it('lights the cells a footprint covers', () => {
    expect(footprintCells({ x: 35, y: 35 }, 1, square)).toEqual([{ x: 35, y: 35 }]);
    expect(footprintCells({ x: 70, y: 70 }, 1.5, square)).toHaveLength(4);
    expect(footprintCells({ x: 105, y: 105 }, 2, square)).toHaveLength(9);
    expect(footprintCells({ x: 140, y: 140 }, 2.5, square)).toHaveLength(16);
  });

  it('queues waiting tokens beside the pointer, smaller and fainter, the rest hidden behind the last', () => {
    const slots = [0, 1, 2, 3].map((index) => queueSlot(index, 35));
    expect(Math.hypot(slots[0]!.offset.x, slots[0]!.offset.y)).toBeGreaterThan(35 + slots[0]!.diameter / 2);
    expect(slots[1]!.offset.x).toBeGreaterThan(slots[0]!.offset.x);
    expect(slots[1]!.diameter).toBeLessThan(slots[0]!.diameter);
    expect(slots[2]!.alpha).toBeLessThan(slots[1]!.alpha);
    expect(slots[3]).toMatchObject({ offset: slots[2]!.offset, alpha: 0 });
  });
});

describe('turning a token', () => {
  it('turns the art\'s bottom to the pointer in 15° steps from up, clockwise, or freely with Alt', () => {
    expect(facingTowards({ x: 0, y: 0 }, { x: 0, y: 10 }, false)).toBe(0);
    expect(facingTowards({ x: 0, y: 0 }, { x: 0, y: -10 }, false)).toBe(180);
    expect(facingTowards({ x: 0, y: 0 }, { x: 10, y: 0 }, false)).toBe(270);
    expect(facingTowards({ x: 0, y: 0 }, { x: -10, y: 0 }, false)).toBe(90);
    expect(facingTowards({ x: 0, y: 0 }, { x: 10, y: 1 }, false)).toBe(270);
    expect(facingTowards({ x: 0, y: 0 }, { x: 10, y: 1 }, true)).toBeCloseTo(275.71, 1);
  });
});

describe('cycling the queue', () => {
  it('sends the first to the back for each step forward, and the last to the front for each step back', () => {
    expect(cycled([1, 2, 3, 4], 1)).toEqual([2, 3, 4, 1]);
    expect(cycled([1, 2, 3, 4], -1)).toEqual([4, 1, 2, 3]);
    expect(cycled([1, 2, 3], 5)).toEqual([3, 1, 2]);
  });

  it('steps once per notch of a mouse wheel, however few pixels it scrolls, sideways too', () => {
    const steps = new WheelSteps();
    const notch = (deltaY: number, wheelDeltaY: number, at: number): number => steps.take({ deltaX: 0, deltaY, deltaMode: 0, wheelDeltaY, wheelDeltaX: 0 } as WheelEvent, at);
    // Chromium on macOS: a notch scrolls 4 pixels, its wheelDelta says 120; notches turned quickly come close together
    expect([0, 30, 60, 90].map((at) => notch(4, -120, at))).toEqual([1, 1, 1, 1]);
    expect(notch(-4, 120, 120)).toBe(-1);
    expect(steps.take({ deltaX: 100, deltaY: 0, deltaMode: 0 }, 1000)).toBe(1);
    expect(steps.take({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 1010)).toBe(1);
  });

  it('steps once when a smoothed or trackpad scroll begins, and again as it goes on', () => {
    const steps = new WheelSteps();
    const glide = (deltaY: number, at: number): number => steps.take({ deltaX: 0, deltaY, deltaMode: 0, wheelDeltaY: -3 * deltaY, wheelDeltaX: 0 } as WheelEvent, at);
    // One notch of a wheel its driver smooths: many small events in a row
    expect([0, 16, 32, 48, 64].map((at) => glide(6, at))).toEqual([1, 0, 0, 0, 0]);
    // The next notch, after a pause
    expect(glide(6, 300)).toBe(1);
    // A long trackpad glide steps on every 100 pixels, a 40 pixel event no notch for all its wheelDelta of 120
    expect([316, 332, 348, 364, 380].map((at) => glide(40, at))).toEqual([0, 0, 1, 0, 1]);
    // Turning back starts a new scroll
    expect(glide(-6, 396)).toBe(-1);
  });
});

describe('a spring', () => {
  it('arrives at its target and rests there', () => {
    const spring = new Spring(0, { frequency: 30, damping: 1 });
    spring.target = 10;
    for (let i = 0; i < 60; i++) spring.step(1 / 60);
    expect(spring.atRest).toBe(true);
    expect(spring.value).toBe(10);
  });
});

/** A ghost that records how it was posed and whether it landed or vanished. */
function fakeGhost() {
  const ghost = { diameter: 70, poses: [] as Array<{ at: Point; part: string }>, landed: null as Point | null, vanished: false, facing: 0 };
  return Object.assign(ghost, {
    turnTo: (degrees: number) => { ghost.facing = degrees; },
    pose: (pose: { at: Point }, part: string) => ghost.poses.push({ at: pose.at, part }),
    land: (at: Point) => { ghost.landed = at; },
    vanish: () => { ghost.vanished = true; },
  });
}

function hand(count: number) {
  const ghosts = Array.from({ length: count }, fakeGhost);
  const held: HeldToken[] = ghosts.map((ghost, i) => ({
    input: { imagePath: `t${i}.png`, x: 35 + 70 * i, y: 35 } as TokenInput,
    home: { x: 35 + 70 * i, y: 35 },
    size: 1,
    ghost: ghost as unknown as PlacementGhost,
    rotation: undefined,
  }));
  const committed: TokenInput[][] = [];
  const end = vi.fn();
  const marks = { light: vi.fn(), land: vi.fn(), clear: vi.fn() } as unknown as PlacementMarks;
  const session = new PlacementSession({
    toWorld: (p) => p,
    zoom: () => 1,
    grid: () => square,
    marks,
    count: () => undefined,
    commit: (tokens) => { committed.push(tokens); return tokens.map((token) => token.imagePath); },
    release: () => undefined,
    end,
  }, held, { x: 400, y: 300 });
  return { session, ghosts, committed, end, marks };
}

describe('placing held tokens', () => {
  it('puts the whole formation down with one click, on the grid', () => {
    const { session, committed, end, ghosts } = hand(3);
    put(session, { x: 300, y: 300 }, false);
    expect(committed).toEqual([[
      expect.objectContaining({ imagePath: 't0.png', x: 245, y: 315 }),
      expect.objectContaining({ imagePath: 't1.png', x: 315, y: 315 }),
      expect.objectContaining({ imagePath: 't2.png', x: 385, y: 315 }),
    ]]);
    expect(ghosts.every((ghost) => ghost.landed !== null)).toBe(true);
    expect(end).toHaveBeenCalledWith(['t0.png', 't1.png', 't2.png']);
  });

  it('puts one token down per click while Shift is held, and the rest as a formation once it is released', () => {
    const { session, committed, end, ghosts } = hand(4);
    session.moveTo({ x: 100, y: 100 }, true);
    expect(ghosts[0]!.poses.at(-1)).toEqual({ at: { x: 105, y: 105 }, part: 'head' });
    expect(ghosts[1]!.poses.at(-1)?.part).toBe('queue-0');
    put(session, { x: 100, y: 100 }, true);
    put(session, { x: 200, y: 100 }, true);
    expect(committed.map((batch) => batch.map(({ imagePath, x, y }) => [imagePath, x, y]))).toEqual([[['t0.png', 105, 105]], [['t1.png', 175, 105]]]);
    expect(ghosts[2]!.poses.at(-1)?.part).toBe('head');
    session.setShift(false);
    expect(ghosts[3]!.poses.at(-1)?.part).toBe('formation');
    put(session, { x: 400, y: 400 }, false);
    expect(committed[2]).toHaveLength(2);
    expect(end).toHaveBeenCalledWith(['t0.png', 't1.png', 't2.png', 't3.png']);
  });

  it('turns the pressed tokens towards the pointer while the button is held, and puts them down facing it', () => {
    const { session, committed, ghosts } = hand(2);
    session.moveTo({ x: 100, y: 100 }, true);
    session.pressAt({ x: 100, y: 100 }, true);
    session.turn({ x: 103, y: 102 }, false);
    expect(ghosts[0]!.facing).toBe(0);
    session.turn({ x: 300, y: 105 }, false);
    expect(ghosts[0]!.facing).toBe(270);
    session.moveTo({ x: 400, y: 400 }, true);
    session.release();
    expect(committed[0]).toEqual([expect.objectContaining({ imagePath: 't0.png', x: 105, y: 105, rotation: 270 })]);
    expect(ghosts[1]!.facing).toBe(0);
  });

  it('lets go of a press without putting anything down, facing as before', () => {
    const { session, committed, ghosts } = hand(1);
    session.pressAt({ x: 100, y: 100 }, false);
    session.turn({ x: 100, y: 300 }, false);
    session.cancelPress();
    expect(ghosts[0]!.facing).toBe(0);
    put(session, { x: 100, y: 100 }, false);
    expect(committed[0]?.[0]).not.toHaveProperty('rotation');
  });

  it('cycles the queue with Shift held, bringing the next token to the pointer', () => {
    const { session, ghosts, committed } = hand(3);
    session.moveTo({ x: 100, y: 100 }, false);
    session.cycle(1);
    expect(ghosts[1]!.poses.at(-1)?.part).toBe('formation');
    session.setShift(true);
    session.cycle(1);
    expect(ghosts[1]!.poses.at(-1)?.part).toBe('head');
    expect(ghosts[0]!.poses.at(-1)?.part).toBe('queue-1');
    session.cycle(-1);
    expect(ghosts[0]!.poses.at(-1)?.part).toBe('head');
    session.cycle(-1);
    put(session, { x: 100, y: 100 }, true);
    expect(committed[0]?.[0]?.imagePath).toBe('t2.png');
  });

  it('puts the tokens still held away and reports those already placed', () => {
    const { session, end, ghosts } = hand(3);
    put(session, { x: 100, y: 100 }, true);
    session.cancel();
    expect(ghosts.slice(1).every((ghost) => ghost.vanished)).toBe(true);
    expect(end).toHaveBeenCalledWith(['t0.png']);
    expect(session.active).toBe(false);
  });
});
