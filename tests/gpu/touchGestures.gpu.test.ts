import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LONG_PRESS_MS } from '../../src/app/input/longPress';
import { SETTLE_MS } from '../../src/app/pixi/input/touchGestures';
import { DoorIcons } from '../../src/app/pixi/lighting/DoorIcons';
import { getHistoryStore } from '../../src/app/stores/history';
import { mouse } from './realMouse';
import { frame, touch, touchMaps, TOKEN, wait, type Point, type TouchMap } from './touchHarness';

// The menu itself is React's; what it is opened with is the map's.
const openContextMenuGlobal = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../src/app/react/root/ContextMenuContext', async (original) => ({
  ...(await original<typeof import('../../src/app/react/root/ContextMenuContext')>()),
  openContextMenuGlobal,
  closeContextMenuGlobal: vi.fn(),
}));

const { map } = touchMaps();
/** Open floor, away from the token. */
const EMPTY: Point = { x: 500, y: 350 };
/** Long enough for a press to have reached the tools. */
const SETTLED = SETTLE_MS + 40;

const camera = (m: TouchMap): { x: number; y: number; scale: number } => ({ x: m.viewport.x, y: m.viewport.y, scale: m.viewport.scale.x });
/** The world point a point of the screen shows. */
const worldAt = (m: TouchMap, at: Point): Point => {
  const world = m.viewport.toWorld(at.x, at.y);
  return { x: world.x, y: world.y };
};
/** Lets what coasts come to rest. */
async function rest(m: TouchMap): Promise<void> {
  let before = camera(m);
  for (let i = 0; i < 200; i++) {
    await frame();
    const now = camera(m);
    if (now.x === before.x && now.y === before.y && now.scale === before.scale) return;
    before = now;
  }
}

beforeEach(() => { openContextMenuGlobal.mockClear(); });

describe('one finger with the move tool', () => {
  it('drags the token it comes down on, and the map stays where it is', async () => {
    const m = await map();
    const before = camera(m);
    await touch.down(TOKEN);
    await touch.glide([TOKEN], [{ x: TOKEN.x + 160, y: TOKEN.y + 80 }]);
    await touch.up();
    await rest(m);
    expect(m.tokenAt().x).toBeCloseTo(TOKEN.x + 160, 0);
    expect(m.tokenAt().y).toBeCloseTo(TOKEN.y + 80, 0);
    expect(camera(m)).toEqual(before);
    expect(m.steps()).toBe(1);
  });

  it('pans the map from the empty floor, keeps the selection, and moves no token', async () => {
    const m = await map();
    m.store.getState().setSelection(['token']);
    const under = worldAt(m, EMPTY);
    await touch.down(EMPTY);
    await wait(SETTLED);
    // Past the 8 px a pan waits for at once: a finger that rests is a long press
    const started = { x: EMPTY.x - 9, y: EMPTY.y };
    await touch.move(started);
    const to = { x: EMPTY.x - 120, y: EMPTY.y + 60 };
    await touch.glide([started], [to], 12);
    // The floor under the finger went with it, but for those 8 px
    const now = worldAt(m, to);
    expect(Math.hypot(now.x - under.x, now.y - under.y)).toBeLessThan(12);
    expect(camera(m).x).toBeLessThan(-100);
    await touch.up();
    await rest(m);
    expect(m.tokenAt()).toEqual(TOKEN);
    expect(m.steps()).toBe(0);
    expect(m.store.getState().selectedIds).toEqual(['token']);
    expect(m.store.getState().isDragging).toBeFalsy();
  });

  it('a tap on the empty floor is a tap: the selection goes and the map stays', async () => {
    const m = await map();
    m.store.getState().setSelection(['token']);
    const before = camera(m);
    await touch.down(EMPTY);
    await wait(SETTLED);
    await touch.up();
    await rest(m);
    expect(m.store.getState().selectedIds).toEqual([]);
    expect(camera(m)).toEqual(before);
  });

  it('a tap on the token selects it', async () => {
    const m = await map();
    await touch.down(TOKEN);
    await wait(20);
    await touch.up();
    await frame();
    expect(m.store.getState().selectedIds).toEqual(['token']);
    expect(m.tokenAt()).toEqual(TOKEN);
    expect(m.steps()).toBe(0);
  });
});

describe('two fingers', () => {
  const LEFT: Point = { x: 300, y: 250 };
  const RIGHT: Point = { x: 500, y: 250 };
  const MIDDLE: Point = { x: 400, y: 250 };

  it('zoom about the point between them and pan with it, in any tool', async () => {
    const m = await map();
    m.store.getState().setActiveTool('fog');
    const under = worldAt(m, MIDDLE);
    await touch.down(LEFT);
    await touch.down(LEFT, RIGHT);
    // Apart to twice the span: the map is twice as large, and the floor between the fingers is still between them
    const apart = [{ x: 200, y: 250 }, { x: 600, y: 250 }];
    await touch.glide([LEFT, RIGHT], apart, 10);
    expect(camera(m).scale).toBeGreaterThan(1.8);
    expect(camera(m).scale).toBeLessThan(2.1);
    const between = worldAt(m, MIDDLE);
    expect(Math.hypot(between.x - under.x, between.y - under.y)).toBeLessThan(6);
    // Both the same way: the map goes with them and keeps its size
    const scale = camera(m).scale;
    const moved = apart.map(({ x, y }) => ({ x: x + 90, y: y - 40 }));
    await touch.glide(apart, moved, 6);
    expect(camera(m).scale).toBeCloseTo(scale, 5);
    const carried = worldAt(m, { x: MIDDLE.x + 90, y: MIDDLE.y - 40 });
    expect(Math.hypot(carried.x - under.x, carried.y - under.y)).toBeLessThan(6);
    await touch.up(moved[0]!);
    await touch.up();
    await rest(m);
    // No fog was painted, by either finger
    expect(Object.keys(m.store.getState().objects.fog ?? {})).toEqual([]);
    expect(m.steps()).toBe(0);
  });

  it('stay within the zoom range the wheel has', async () => {
    const m = await map();
    await touch.down(LEFT);
    await touch.down(LEFT, RIGHT);
    for (let round = 0; round < 6; round++) {
      await touch.glide([{ x: 390, y: 250 }, { x: 410, y: 250 }], [{ x: 20, y: 250 }, { x: 780, y: 250 }], 4);
      await touch.up();
      await touch.down({ x: 390, y: 250 });
      await touch.down({ x: 390, y: 250 }, { x: 410, y: 250 });
    }
    await touch.up();
    expect(camera(m).scale).toBeLessThanOrEqual(5);
    expect(camera(m).scale).toBeGreaterThan(4);
  });

  it('take a token drag back: the token stands where it was and no undo step is left', async () => {
    const m = await map();
    await touch.down(TOKEN);
    const dragged = { x: TOKEN.x + 120, y: TOKEN.y + 40 };
    await touch.glide([TOKEN], [dragged]);
    expect(m.tokenAt().x).toBeGreaterThan(TOKEN.x + 60);
    const second = { x: 600, y: 300 };
    await touch.down(dragged, second);
    await frame();
    expect(m.tokenAt()).toEqual(TOKEN);
    expect(m.store.getState().isDragging).toBeFalsy();
    // The two fingers navigate, and the token stays behind
    await touch.glide([dragged, second], [{ x: dragged.x + 60, y: dragged.y }, { x: second.x + 60, y: second.y }], 6);
    expect(camera(m).x).toBeGreaterThan(40);
    await touch.up(second);
    await touch.up();
    await rest(m);
    expect(m.tokenAt()).toEqual(TOKEN);
    expect(m.steps()).toBe(0);
  });
});

describe('a long press', () => {
  it('on a token opens its menu at the finger, with the ring closing around it meanwhile, and is no tap or drag', async () => {
    const m = await map();
    await touch.down(TOKEN);
    await wait(LONG_PRESS_MS / 2);
    expect(m.ring().visible).toBe(true);
    // The ring keeps its size on the screen and stands around the finger
    expect(m.ring().position.x).toBeCloseTo(TOKEN.x, 0);
    expect(m.ring().getBounds().width).toBeGreaterThan(60);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    await wait(LONG_PRESS_MS / 2 + 80);
    expect(openContextMenuGlobal).toHaveBeenCalledOnce();
    const at = (openContextMenuGlobal.mock.calls as unknown[][])[0]![1] as Point;
    const box = m.canvas.getBoundingClientRect();
    expect(at.x - box.left).toBeCloseTo(TOKEN.x, 0);
    expect(at.y - box.top).toBeCloseTo(TOKEN.y, 0);
    expect(m.ring().visible).toBe(false);
    // The finger moves on and lifts: nothing follows it
    await touch.glide([TOKEN], [{ x: TOKEN.x + 100, y: TOKEN.y }], 4);
    await touch.up();
    await rest(m);
    expect(m.tokenAt()).toEqual(TOKEN);
    expect(m.steps()).toBe(0);
    expect(openContextMenuGlobal).toHaveBeenCalledOnce();
  });

  it('on the empty floor draws the marquee from where the finger came down, and opens no menu', async () => {
    const m = await map();
    const before = camera(m);
    const from = { x: TOKEN.x - 90, y: TOKEN.y - 90 };
    await touch.down(from);
    await wait(LONG_PRESS_MS + 80);
    await touch.glide([from], [{ x: TOKEN.x + 90, y: TOKEN.y + 90 }], 6);
    await touch.up();
    await rest(m);
    expect(m.store.getState().selectedIds).toEqual(['token']);
    expect(camera(m)).toEqual(before);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it('is a tap when the finger lifts before the ring has closed', async () => {
    const m = await map();
    await touch.down(TOKEN);
    await wait(LONG_PRESS_MS / 2);
    await touch.up();
    await wait(LONG_PRESS_MS);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
    expect(m.ring().visible).toBe(false);
    expect(m.store.getState().selectedIds).toEqual(['token']);
  });
});

describe('a door\'s badge, which opens its door as it is pressed', () => {
  /** A closed door on open floor, away from the token: its badge is in the middle of it. */
  const BADGE: Point = { x: 500, y: 350 };

  async function withDoor(): Promise<{ m: TouchMap; closed: () => boolean }> {
    const m = await map();
    const door = m.store.getState().addWall({ type: 'door', p1: { x: BADGE.x - 40, y: BADGE.y }, p2: { x: BADGE.x + 40, y: BADGE.y }, closed: true });
    const doors = new DoorIcons(m.store, m.canvas);
    m.viewport.addChild(doors.view);
    // As the lighting wires it: the press opens or closes, and the gestures are told where it would
    m.tokens.setDoorClickHandler((x, y) => {
      const doorId = doors.hitTest(x, y);
      if (doorId) doors.toggle(doorId);
      return doorId !== null;
    }, (x, y) => doors.hitTest(x, y) !== null);
    getHistoryStore(m.store)?.getState().clear();
    await frame();
    return { m, closed: () => m.store.getState().objects.walls[door]!.closed === true };
  }

  it('stays shut under the first finger of a pinch, however late the second lands', async () => {
    const { m, closed } = await withDoor();
    const second: Point = { x: BADGE.x + 160, y: BADGE.y };
    await touch.down(BADGE);
    await wait(120);
    expect(closed()).toBe(true);
    await touch.down(BADGE, second);
    await touch.glide([BADGE, second], [{ x: BADGE.x - 60, y: BADGE.y }, { x: second.x + 60, y: second.y }]);
    await touch.up();
    await rest(m);
    expect(m.viewport.scale.x).toBeGreaterThan(1.3);
    expect(closed()).toBe(true);
    expect(m.steps()).toBe(0);
  });

  it('opens under a finger\'s tap, and under a mouse\'s press as ever', async () => {
    const { m, closed } = await withDoor();
    await touch.down(BADGE);
    await touch.up();
    await wait(120);
    expect(closed()).toBe(false);
    expect(m.steps()).toBe(1);

    await mouse.hover(BADGE.x, BADGE.y);
    await mouse.down(BADGE.x, BADGE.y);
    expect(closed()).toBe(true);
    await mouse.up(BADGE.x, BADGE.y);
  });

  it('lets a finger that starts on it pan the map, and stays shut', async () => {
    const { m, closed } = await withDoor();
    const before = camera(m);
    await touch.down(BADGE);
    await wait(SETTLED);
    await touch.glide([BADGE], [{ x: BADGE.x + 100, y: BADGE.y }]);
    await touch.up();
    await rest(m);
    expect(camera(m).x).toBeGreaterThan(before.x + 80);
    expect(closed()).toBe(true);
  });
});

describe('fingers set to pan beside a pen', () => {
  it('pan in the fog tool and paint nothing', async () => {
    const m = await map();
    m.fingers.use = 'pan';
    m.store.getState().setActiveTool('fog');
    await touch.down(EMPTY);
    await wait(SETTLED);
    await touch.glide([EMPTY], [{ x: EMPTY.x + 140, y: EMPTY.y }]);
    await touch.up();
    await rest(m);
    expect(camera(m).x).toBeGreaterThan(100);
    expect(Object.keys(m.store.getState().objects.fog ?? {})).toEqual([]);
  });
});

describe('a mouse, as ever', () => {
  it('pans with the right button and draws the marquee with the left', async () => {
    const m = await map();
    const before = camera(m);
    // A left-drag over the token from the empty floor selects it and moves nothing
    await mouse.hover(TOKEN.x - 90, TOKEN.y - 90);
    await mouse.down(TOKEN.x - 90, TOKEN.y - 90);
    for (let step = 1; step <= 6; step++) {
      await mouse.move(TOKEN.x - 90 + step * 30, TOKEN.y - 90 + step * 30);
      await frame();
    }
    await mouse.up(TOKEN.x + 90, TOKEN.y + 90);
    await frame();
    expect(m.store.getState().selectedIds).toEqual(['token']);
    expect(camera(m)).toEqual(before);

    // A right-drag pans by what the pointer moved, past the viewport's own threshold
    await mouse.send('mousePressed', EMPTY.x, EMPTY.y, true, 0, 'right');
    for (let step = 1; step <= 6; step++) {
      await mouse.send('mouseMoved', EMPTY.x + step * 20, EMPTY.y, true, 0, 'right');
      await frame();
    }
    expect(camera(m).x).toBeGreaterThan(100);
    expect(camera(m).x).toBeLessThanOrEqual(120);
    await mouse.send('mouseReleased', EMPTY.x + 120, EMPTY.y, false, 0, 'right');
    await rest(m);
    expect(m.tokenAt()).toEqual(TOKEN);
    expect(openContextMenuGlobal).not.toHaveBeenCalled();
  });

  it('drags a token with the left button, and a press on the empty floor clears the selection at once', async () => {
    const m = await map();
    await mouse.hover(TOKEN.x, TOKEN.y);
    await mouse.down(TOKEN.x, TOKEN.y);
    for (let step = 1; step <= 6; step++) {
      await mouse.move(TOKEN.x + step * 20, TOKEN.y);
      await frame();
    }
    await mouse.up(TOKEN.x + 120, TOKEN.y);
    await frame();
    expect(m.tokenAt().x).toBeCloseTo(TOKEN.x + 120, 0);
    expect(m.steps()).toBe(1);
    m.store.getState().setSelection(['token']);
    await mouse.hover(EMPTY.x, EMPTY.y);
    await mouse.down(EMPTY.x, EMPTY.y);
    expect(m.store.getState().selectedIds).toEqual([]);
    await mouse.up(EMPTY.x, EMPTY.y);
  });
});
