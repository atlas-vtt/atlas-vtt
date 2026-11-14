import { describe, expect, it } from 'vitest';
import type { Perception } from '../../src/app/vision/perception';
import { CELL, differingIn, differingPixels, playerViewScenes, samePixels, type PlayerViewScene } from '../helpers/playerViewScene';

const { scene } = playerViewScenes();
/** A circle of two cells around the corner of cells (120, 120), kept; its far end lies at (120, 200). */
const CENTRE = { x: 120, y: 120 };
const END = { x: 120, y: 200 };
/** Tokens on cell centres inside it: the hero right of its middle, the goblin left. */
const HERO = { id: 'hero', x: 180, y: 140 };
const GOBLIN = { id: 'goblin', x: 60, y: 140 };
/** A token's art is 36 px wide; its ring lies 3 px off its rim, 2 px wide in a dark casing. */
const RING_REACH = 30;

const perceiving = (answers: Record<string, Perception>) => (id: string): Perception => answers[id] ?? 'seen';
const around = (a: Uint8ClampedArray, b: Uint8ClampedArray, at: { x: number; y: number }, reach: number): number =>
  differingIn(a, b, at.x - reach, at.y - reach, at.x + reach, at.y + reach);

/** How many pixels left of `x1` differ and lie farther than a pixel and a half from the kept circle's edge. */
function offEdge(a: Uint8ClampedArray, b: Uint8ClampedArray, x1: number): number {
  const radius = Math.hypot(END.x - CENTRE.x, END.y - CENTRE.y);
  let count = 0;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < x1; x++) {
      const i = (y * 256 + x) * 4;
      const differs = a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2];
      if (differs && Math.abs(Math.hypot(x + 0.5 - CENTRE.x, y + 0.5 - CENTRE.y) - radius) > 1.5) count++;
    }
  }
  return count;
}

/** A scene on a grid that snaps, with `tokens` and a kept circle; the select tool in hand. */
async function kept(tokens: Array<typeof HERO>, more: { walls?: false; color?: string } = {}): Promise<PlayerViewScene & { id: string }> {
  const s = await scene();
  await s.add(...tokens);
  const id = s.store.getState().addMeasure({ shape: 'circle', points: [{ ...CENTRE }, { ...END }], color: '#e93147', ...more })!;
  s.store.getState().setActiveTool('select');
  await s.settle();
  return Object.assign(s, { id });
}

describe('a measured area in the players\' picture', () => {
  it('shows its body to the players, and keeps its unlit outline and its handles for the GM\'s canvas', async () => {
    const s = await kept([]);
    const empty = await scene();
    const frame = s.frame();
    // The body: a wash over the disc, its cells and its outline.
    expect(differingPixels(frame, empty.frame())).toBeGreaterThan(8000);
    const gm = s.canvas();
    // The GM's outline is ink around the disc's edge: where the frame has only the body's own line, away from both handles.
    expect(around(gm, frame, { x: 200, y: 120 }, 8)).toBeGreaterThan(20);
    expect(around(gm, frame, { x: 40, y: 120 }, 8)).toBeGreaterThan(20);
    // Both handles: the badge at the origin and the dot at the far end.
    expect(around(gm, frame, CENTRE, 12)).toBeGreaterThan(200);
    expect(around(gm, frame, END, 5)).toBeGreaterThan(40);
    // A picture of the scene has the body and none of the GM's marks; session view and the peek show the players' picture.
    expect(samePixels(s.thumbnail(), frame)).toBe(true);
    s.store.getState().setGMView(false);
    expect(samePixels(s.canvas(), frame)).toBe(true);
    s.store.getState().setGMView(true);
    s.peek(true);
    expect(samePixels(s.canvas(), frame)).toBe(true);
    s.peek(false);
    expect(samePixels(s.canvas(), gm)).toBe(true);
  });

  it('lies under the tokens: a token in it looks as it does without it', async () => {
    const s = await kept([HERO]);
    const without = await scene();
    await without.add(HERO);
    // The art's middle, inside its ring and rim.
    expect(around(s.frame(), without.frame(), HERO, 10)).toBe(0);
    expect(around(s.frame(), without.frame(), { x: HERO.x, y: HERO.y - 40 }, 10)).toBeGreaterThan(100);
  });

  it('rings the tokens in it while its handle is pointed at, for the GM alone: the players\' picture stays as it was', async () => {
    const s = await kept([HERO, GOBLIN]);
    s.lighting.perception = perceiving({ goblin: 'unseen' });
    const quiet = { frame: s.frame(), gm: s.canvas() };
    s.measure.handles.pointer.cursorAt(CENTRE.x, CENTRE.y);
    const pointed = { frame: s.frame(), gm: s.canvas() };
    // The GM's canvas rings both.
    expect(around(pointed.gm, quiet.gm, HERO, RING_REACH)).toBeGreaterThan(100);
    expect(around(pointed.gm, quiet.gm, GOBLIN, RING_REACH)).toBeGreaterThan(100);
    // What the GM points at is the GM's own look: no ring and no count reaches the players.
    expect(samePixels(pointed.frame, quiet.frame)).toBe(true);
    s.measure.handles.pointer.leave();
    s.store.getState().openMeasurePopover(s.id);
    expect(around(s.canvas(), quiet.gm, HERO, RING_REACH)).toBeGreaterThan(100);
    expect(samePixels(s.frame(), quiet.frame)).toBe(true);
    s.store.getState().closeMeasurePopover();
    expect(samePixels(s.frame(), quiet.frame)).toBe(true);
    expect(samePixels(s.canvas(), quiet.gm)).toBe(true);
  });

  it('is left out with its body when the GM keeps it to themselves', async () => {
    const s = await kept([]);
    const empty = await scene();
    s.store.getState().updateMeasure(s.id, { hidden: true });
    expect(samePixels(s.frame(), empty.frame())).toBe(true);
    expect(differingPixels(s.canvas(), empty.canvas())).toBeGreaterThan(8000);
  });
});

describe('an area that stops at a wall', () => {
  /** Down the edge of cells at x = 160, a cell right of the circle's middle, from the map's top to its bottom. */
  const WALL = { type: 'solid' as const, p1: { x: 160, y: -CELL }, p2: { x: 160, y: 256 + CELL } };
  /** Whatever the area draws right of the wall, a pixel of smoothing aside. */
  const pastWall = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => differingIn(a, b, 162, 0, 256, 256);

  it('shows nothing past the wall, and reaches past it again once its switch is off', async () => {
    const s = await kept([]);
    const open = s.frame();
    const empty = await scene();
    const none = empty.frame();
    expect(pastWall(open, none)).toBeGreaterThan(1500);
    s.store.getState().addWall(WALL);
    empty.store.getState().addWall(WALL);
    const cut = s.frame();
    expect(pastWall(cut, empty.frame())).toBe(0);
    // Left of the wall it is the area it was, up to where its outline turns to run along the wall. The cut
    // outline's corners lie on eighths of a pixel, which moves its edge by less than a tenth of one: only
    // pixels on the very edge of the disc may fall to the other side of it.
    expect(offEdge(cut, open, 150)).toBe(0);
    s.store.getState().updateMeasure(s.id, { walls: false });
    expect(samePixels(s.frame(), open)).toBe(true);
  });

  it('tints no part of a covered cell that lies past a wall running through it', async () => {
    /** Through the middle of the cells from x = 160 to 200, which the circle covers by half. */
    const through = { ...WALL, p1: { x: 180, y: -CELL }, p2: { x: 180, y: 256 + CELL } };
    const beyond = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => differingIn(a, b, 182, 0, 256, 256);
    const s = await kept([]);
    const empty = await scene();
    // Without the wall the cells' tint reaches to their far edge.
    expect(differingIn(s.frame(), empty.frame(), 182, 100, 198, 140)).toBeGreaterThan(400);
    s.store.getState().addWall(through);
    empty.store.getState().addWall(through);
    const cut = s.frame();
    const bare = empty.frame();
    expect(beyond(cut, bare)).toBe(0);
    // Before the wall the cells keep their tint: the same cells, cut at the wall.
    expect(differingIn(cut, bare, 162, 100, 178, 140)).toBeGreaterThan(400);
    // The GM's canvas has nothing of the body past the wall either. Its unlit outline is ink centred on the wall, whose
    // soft casing fades out a few pixels past it; a tile would reach to the cell's far edge at 199.
    expect(differingIn(s.canvas(), empty.canvas(), 190, 0, 256, 256)).toBe(0);
  });

  it('is cut while it is made, too', async () => {
    const s = await scene();
    const empty = await scene();
    s.store.getState().addWall(WALL);
    empty.store.getState().addWall(WALL);
    s.store.getState().setMeasureTool({ mode: 'circle' });
    s.measureFrom(CENTRE.x, CENTRE.y, END.x, END.y, true);
    expect(pastWall(s.frame(), empty.frame())).toBe(0);
    expect(differingPixels(s.frame(), empty.frame())).toBeGreaterThan(4000);
  });
});
