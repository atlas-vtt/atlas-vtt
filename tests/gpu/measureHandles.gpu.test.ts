import { describe, expect, it } from 'vitest';
import { differingIn, differingPixels, playerViewScenes, samePixels, type PlayerViewScene } from '../helpers/playerViewScene';

const { scene } = playerViewScenes();
const HERO = { id: 'hero', x: 180, y: 60 };
/** A ruler kept on empty floor, from the cell centre (60, 180) to the right. */
const START = { x: 60, y: 180 };
/** The handle with the ring of the one whose popover is open, and a pixel to spare. */
const REACH = 16;

const atHandle = (a: Uint8ClampedArray, b: Uint8ClampedArray, at = START): number => differingIn(a, b, at.x - REACH, at.y - REACH, at.x + REACH, at.y + REACH);

/** A scene with a seen token and a kept ruler, the select tool in hand, its handle's glyph drawn. */
async function kept(): Promise<PlayerViewScene & { id: string }> {
  const s = await scene();
  await s.add(HERO);
  s.store.getState().setMeasureTool({ keep: true });
  s.measureFrom(START.x, START.y, 220, 180);
  s.store.getState().setActiveTool('select');
  await s.settle();
  const [id] = Object.keys(s.store.getState().objects.measures ?? {});
  return Object.assign(s, { id: id! });
}

describe('the handle of a kept measurement', () => {
  it('shows on the GM\'s canvas at the measurement\'s start and is all that the players\' frame leaves out', async () => {
    const s = await kept();
    const gm = s.canvas();
    const frame = s.frame();
    // A badge of 10 px radius: most of its disc differs from the ruler's end the players see there.
    expect(atHandle(gm, frame)).toBeGreaterThan(200);
    expect(differingPixels(gm, frame)).toBe(atHandle(gm, frame));
    // The capture leaves the GM's canvas as it was.
    expect(samePixels(s.canvas(), gm)).toBe(true);
  });

  it('is in no picture of the scene, and not on the canvas in session view or during the peek', async () => {
    const s = await kept();
    const gm = s.canvas();
    const frame = s.frame();
    expect(atHandle(s.thumbnail(), frame)).toBe(0);
    s.store.getState().setGMView(false);
    expect(samePixels(s.canvas(), frame)).toBe(true);
    s.store.getState().setGMView(true);
    expect(samePixels(s.canvas(), gm)).toBe(true);
    s.peek(true);
    expect(atHandle(s.canvas(), frame)).toBe(0);
    s.peek(false);
    expect(samePixels(s.canvas(), gm)).toBe(true);
  });

  it('follows its measurement when dragged, and goes with it when the measurement is deleted', async () => {
    const s = await kept();
    const before = s.canvas();
    // Two cells down: the start snaps to the cell centre (60, 220) there.
    s.pointer('pointerdown', START.x, START.y);
    s.pointer('pointermove', START.x, START.y + 20);
    s.pointer('pointermove', START.x + 3, START.y + 44);
    s.pointer('pointerup', START.x + 3, START.y + 44);
    expect(s.store.getState().objects.measures?.[s.id]?.points[0]).toEqual({ x: 60, y: 220 });
    await s.settle();
    const moved = s.canvas();
    const frame = s.frame();
    expect(atHandle(moved, frame, { x: 60, y: 220 })).toBeGreaterThan(200);
    expect(differingPixels(moved, frame)).toBe(atHandle(moved, frame, { x: 60, y: 220 }));
    s.store.getState().deleteMeasure(s.id);
    expect(samePixels(s.canvas(), s.frame())).toBe(true);
    expect(differingPixels(s.canvas(), before)).toBeGreaterThan(200);
  });

  it('is ringed while its popover is open, which the players\' frame shows nothing of either', async () => {
    const s = await kept();
    const gm = s.canvas();
    const frame = s.frame();
    s.pointer('pointerdown', START.x + 2, START.y - 2);
    s.pointer('pointerup', START.x + 2, START.y - 2);
    expect(s.store.getState().measurePopover).toBe(s.id);
    await s.settle();
    expect(atHandle(s.canvas(), gm)).toBeGreaterThan(40);
    expect(samePixels(s.frame(), frame)).toBe(true);
  });
});
