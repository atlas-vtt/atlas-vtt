import { describe, expect, it, vi } from 'vitest';
import { RenderScheduler } from '../../src/app/pixi/RenderScheduler';
import { MOTION_NORMAL_MS } from '../../src/app/utils/motion';
import type { FogOperation, FogRectangleFill } from '../../src/app/types/fogTypes';
import { fogScenes, reduceMotion } from '../helpers/fogCoverageScene';

/**
 * An edit of the fog fades from the picture before it to the new one, on the GM's canvas at the
 * GM's opacity and in the players' frame at theirs. Only what changed moves: fog both pictures
 * hold keeps its pixels throughout.
 */
const scenes = fogScenes({ fades: true });
type Scene = Awaited<ReturnType<typeof scenes.scene>>;

const SIZE = 128;
const rect = (id: string, timestamp: number, x: number, y: number, width: number, height: number, isErasing = false): FogRectangleFill =>
  ({ id, timestamp, kind: 'fog', type: 'rectangle', x, y, width, height, isErasing });
/** The room the tests hide and reveal, and a corner of fog that stays as it is. */
const ROOM = rect('room', 2, 16, 16, 56, 56);
const KEPT = rect('kept', 1, 88, 88, 32, 32);
const IN_ROOM = { x: 44, y: 44 };
const IN_KEPT = { x: 104, y: 104 };

const red = (pixels: Uint8ClampedArray, { x, y }: { x: number; y: number }): number => pixels[(y * SIZE + x) * 4]!;
/** How far two pictures lie apart at most, in any channel of any pixel, within the rectangle (the whole picture without one). */
function apart(a: Uint8ClampedArray, b: Uint8ClampedArray, within = { x: 0, y: 0, width: SIZE, height: SIZE }): number {
  let most = 0;
  for (let y = within.y; y < within.y + within.height; y++) {
    for (let x = within.x; x < within.x + within.width; x++) {
      for (let channel = 0; channel < 4; channel++) {
        const at = (y * SIZE + x) * 4 + channel;
        most = Math.max(most, Math.abs(a[at]! - b[at]!));
      }
    }
  }
  return most;
}

/** A clock the test moves: the fade's frames come as the test asks for them. */
function steppedClock(): (ms: number) => void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  return (ms) => { vi.advanceTimersByTime(ms); };
}

/** Fog on a map: the fog's canvas has the map's size, whatever is painted. */
async function scene(ops: Record<string, FogOperation>): Promise<Scene> {
  const s = await scenes.scene(ops);
  s.showMapImage({ x: 0, y: 0, width: SIZE, height: SIZE });
  return s;
}

const gm = (s: Scene): Uint8ClampedArray => s.rgba();
const picture = (s: Scene): Uint8ClampedArray => s.rgba(s.fog.getGmViewLayers());
/** The players' frame; `ended`, with the fog as a fade that runs will leave it. */
const players = (s: Scene, ended = false): Uint8ClampedArray =>
  s.rgba(ended ? [...s.fog.getGmViewLayers().filter(({ alpha }) => alpha === undefined), ...s.fog.getPlayerViewLayers()] : s.fog.getPlayerViewLayers());
const both = (...ops: FogOperation[]): Record<string, FogOperation> => Object.fromEntries(ops.map((op) => [op.id, op]));

describe('a change of the fog', () => {
  it('fades a reveal out, partly gone on its way and gone at its end, in the GM\'s picture and the players\'', async () => {
    const s = await scene(both(KEPT, ROOM));
    const advance = steppedClock();
    const before = { gm: gm(s), players: players(s) };
    expect(red(before.players, IN_ROOM)).toBe(0);
    expect(s.fog.fading).toBe(false);

    s.setFog(both(KEPT));
    expect(s.fog.fading).toBe(true);
    // Nothing has moved yet: both pictures are what they were
    expect(apart(gm(s), before.gm)).toBe(0);
    expect(apart(players(s), before.players)).toBe(0);

    advance(40);
    const midway = { gm: gm(s), players: players(s) };
    expect(red(midway.players, IN_ROOM)).toBeGreaterThan(40);
    expect(red(midway.players, IN_ROOM)).toBeLessThan(215);
    expect(red(midway.gm, IN_ROOM)).toBeGreaterThan(red(before.gm, IN_ROOM) + 20);
    expect(red(midway.gm, IN_ROOM)).toBeLessThan(235);
    // The GM's fog is as much thinner than the players' as it was before the fade
    expect(255 - red(midway.gm, IN_ROOM)).toBeLessThan(255 - red(midway.players, IN_ROOM));
    // Fog neither picture changed keeps its pixels
    const kept = { x: KEPT.x - 4, y: KEPT.y - 4, width: KEPT.width + 8, height: KEPT.height + 8 };
    expect(apart(midway.gm, before.gm, kept)).toBe(0);
    expect(apart(midway.players, before.players, kept)).toBe(0);

    advance(MOTION_NORMAL_MS);
    expect(s.fog.fading).toBe(false);
    const after = { gm: gm(s), players: players(s) };
    expect(red(after.gm, IN_ROOM)).toBe(255);
    expect(red(after.players, IN_ROOM)).toBe(255);
    expect(apart(after.gm, before.gm, kept)).toBe(0);
    expect(apart(after.players, before.players, kept)).toBe(0);
    expect(red(after.players, IN_KEPT)).toBe(0);
  });

  it('fades new fog in, and ends on the picture the fog has without a fade', async () => {
    const s = await scene(both(KEPT));
    const advance = steppedClock();
    const before = gm(s);
    s.setFog(both(KEPT, ROOM));
    expect(apart(gm(s), before)).toBe(0);
    advance(40);
    const midway = players(s);
    expect(red(midway, IN_ROOM)).toBeGreaterThan(40);
    expect(red(midway, IN_ROOM)).toBeLessThan(215);
    // A picture of the scene shows the fog as the fade will leave it
    const ahead = picture(s);
    advance(MOTION_NORMAL_MS);
    expect(s.fog.fading).toBe(false);
    expect(red(players(s), IN_ROOM)).toBe(0);
    expect(apart(gm(s), ahead)).toBeLessThanOrEqual(1);
    // The last frames of the fade lie on the picture it ends at: nothing jumps when it does
    s.setFog(both(KEPT));
    advance(MOTION_NORMAL_MS - 8);
    expect(s.fog.fading).toBe(true);
    const last = gm(s);
    advance(32);
    expect(s.fog.fading).toBe(false);
    expect(apart(gm(s), last)).toBeLessThanOrEqual(2);
  });

  it.each([['soft', 0], ['crackle', 12]] as const)('fades a fog with a %s edge from the picture it showed to the one it shows after, without a jump', async (style, tolerance) => {
    const s = await scene(both(KEPT, ROOM));
    s.fog.setEdge({ style, width: 12 });
    const advance = steppedClock();
    const before = { gm: gm(s), players: players(s) };

    s.setFog(both(KEPT));
    expect(s.fog.fading).toBe(true);
    expect(apart(gm(s), before.gm)).toBeLessThanOrEqual(tolerance);
    expect(apart(players(s), before.players)).toBeLessThanOrEqual(tolerance);
    advance(40);
    const midway = players(s);
    expect(red(midway, IN_ROOM)).toBeGreaterThan(40);
    expect(red(midway, IN_ROOM)).toBeLessThan(215);
    // Well away from the room, the kept fog and its edge are what they were
    const kept = { x: KEPT.x - 2, y: KEPT.y - 2, width: KEPT.width + 4, height: KEPT.height + 4 };
    expect(apart(midway, before.players, kept)).toBeLessThanOrEqual(tolerance);
    const ahead = picture(s);
    advance(MOTION_NORMAL_MS);
    expect(s.fog.fading).toBe(false);
    expect(apart(gm(s), ahead)).toBeLessThanOrEqual(Math.max(1, tolerance));
    expect(red(players(s), IN_ROOM)).toBe(255);
  });

  it('keeps the fog around a change as it is, right up to the change', async () => {
    const cover = rect('cover', 1, 0, 0, SIZE, SIZE);
    const s = await scene(both(cover));
    const advance = steppedClock();
    const before = { gm: gm(s), players: players(s) };
    s.setFog(both(cover, { ...ROOM, isErasing: true }));
    expect(s.fog.fading).toBe(true);
    // The fog above, below and beside the room, up to two pixels from it
    const around = [
      { x: 0, y: 0, width: SIZE, height: ROOM.y - 2 },
      { x: 0, y: ROOM.y + ROOM.height + 2, width: SIZE, height: SIZE - ROOM.y - ROOM.height - 2 },
      { x: 0, y: 0, width: ROOM.x - 2, height: SIZE },
      { x: ROOM.x + ROOM.width + 2, y: 0, width: SIZE - ROOM.x - ROOM.width - 2, height: SIZE },
    ];
    for (const ms of [0, 24, 40, 80, MOTION_NORMAL_MS]) {
      advance(ms);
      const now = { gm: gm(s), players: players(s) };
      for (const part of around) {
        expect(apart(now.gm, before.gm, part)).toBe(0);
        expect(apart(now.players, before.players, part)).toBe(0);
      }
    }
    expect(s.fog.fading).toBe(false);
    expect(red(players(s), IN_ROOM)).toBe(255);
  });

  it('fades a fog with an edge that changes at the map\'s edge, past which it is repeated', async () => {
    const cover = rect('cover', 1, 0, 0, SIZE, SIZE);
    const s = await scene(both(cover));
    s.fog.setEdge({ style: 'soft', width: 12 });
    // The map's corner, and the room the fog's canvas has beyond it
    s.lookAt(-48, -48);
    const advance = steppedClock();
    const before = players(s);
    expect(red(before, { x: 20, y: 20 })).toBe(0);
    s.setFog(both(cover, rect('corner', 2, 0, 0, 40, 40, true)));
    expect(s.fog.fading).toBe(true);
    expect(apart(players(s), before)).toBeLessThanOrEqual(1);
    advance(40);
    expect(red(players(s), { x: 20, y: 20 })).toBeGreaterThan(40);
    expect(red(players(s), { x: 20, y: 20 })).toBeLessThan(215);
    const ahead = players(s, true);
    advance(MOTION_NORMAL_MS);
    expect(s.fog.fading).toBe(false);
    expect(apart(players(s), ahead)).toBeLessThanOrEqual(1);
    expect(red(players(s), { x: 20, y: 20 })).toBe(255);
  });

  it('goes on from what it shows when the fog changes again on its way', async () => {
    const s = await scene(both(KEPT, ROOM));
    const advance = steppedClock();
    const covered = { gm: gm(s), players: players(s) };
    s.setFog(both(KEPT));
    advance(40);
    const shown = { gm: gm(s), players: players(s) };
    // Undone on its way: the room is hidden again, from as far as its fog had gone
    s.setFog(both(KEPT, ROOM));
    expect(s.fog.fading).toBe(true);
    expect(apart(gm(s), shown.gm)).toBeLessThanOrEqual(2);
    expect(apart(players(s), shown.players)).toBeLessThanOrEqual(2);
    advance(40);
    expect(red(players(s), IN_ROOM)).toBeLessThan(red(shown.players, IN_ROOM));
    expect(red(players(s), IN_ROOM)).toBeGreaterThan(0);
    advance(MOTION_NORMAL_MS);
    expect(s.fog.fading).toBe(false);
    expect(apart(gm(s), covered.gm)).toBe(0);
    expect(apart(players(s), covered.players)).toBe(0);
  });

  it('goes on from what it shows when fog elsewhere changes on its way', async () => {
    const s = await scene(both(KEPT, ROOM));
    const advance = steppedClock();
    s.setFog(both(KEPT));
    advance(40);
    const shown = { gm: gm(s), players: players(s) };
    // The corner is revealed while the room still fades: the room goes on, the corner begins
    s.setFog({});
    expect(s.fog.fading).toBe(true);
    expect(apart(gm(s), shown.gm)).toBeLessThanOrEqual(2);
    expect(apart(players(s), shown.players)).toBeLessThanOrEqual(2);
    advance(40);
    const later = players(s);
    expect(red(later, IN_ROOM)).toBeGreaterThan(red(shown.players, IN_ROOM));
    expect(red(later, IN_ROOM)).toBeLessThan(255);
    expect(red(later, IN_KEPT)).toBeGreaterThan(40);
    expect(red(later, IN_KEPT)).toBeLessThan(215);
    advance(MOTION_NORMAL_MS);
    expect(s.fog.fading).toBe(false);
    expect(red(players(s), IN_ROOM)).toBe(255);
    expect(red(players(s), IN_KEPT)).toBe(255);
  });

  it('shows fog that fades away until it has, and none once the last of it is gone', async () => {
    const s = await scene(both(ROOM));
    const advance = steppedClock();
    s.store.getState().clearFog();
    expect(s.fog.fading).toBe(true);
    expect(s.fog.getContainer().visible).toBe(true);
    expect(red(players(s), IN_ROOM)).toBe(0);
    advance(MOTION_NORMAL_MS + 16);
    expect(s.fog.fading).toBe(false);
    expect(s.fog.getContainer().visible).toBe(false);
    expect(red(players(s), IN_ROOM)).toBe(255);
  });
});

describe('fog that does not fade', () => {
  it('shows a change at once with reduced motion', async () => {
    reduceMotion();
    const s = await scene(both(KEPT, ROOM));
    s.setFog(both(KEPT));
    expect(s.fog.fading).toBe(false);
    expect(red(players(s), IN_ROOM)).toBe(255);
  });

  it('shows the fog of a load, of another level and of another map at once', async () => {
    const s = await scene(both(KEPT));
    s.store.setState({ isMapLoading: true });
    s.setFog(both(KEPT, ROOM));
    s.store.setState({ isMapLoading: false });
    expect(s.fog.fading).toBe(false);
    expect(red(players(s), IN_ROOM)).toBe(0);

    // A load that begins ends a fade
    s.setFog(both(KEPT));
    expect(s.fog.fading).toBe(true);
    s.store.setState({ isMapLoading: true });
    expect(s.fog.fading).toBe(false);
    s.store.setState({ isMapLoading: false });

    s.store.setState((state) => ({ mapPath: 'maps/b.atlasmap', objects: { ...state.objects, fog: both(ROOM) } }));
    expect(s.fog.fading).toBe(false);
    expect(red(players(s), IN_ROOM)).toBe(0);
  });

  it('does not fade a stroke that is committed as it was shown, and a stroke that follows a fade is live', async () => {
    const s = await scene(both(KEPT));
    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.store.getState().setActiveTool('fog');
    s.pointer('pointerdown', 20, 20);
    s.pointer('pointermove', 60, 60);
    const drawn = players(s);
    expect(red(drawn, { x: 40, y: 40 })).toBe(0);
    s.pointer('pointerup', 60, 60);
    expect(Object.keys(s.store.getState().objects.fog)).toHaveLength(2);
    expect(s.fog.fading).toBe(false);
    expect(apart(players(s), drawn)).toBeLessThanOrEqual(1);
  });
});

describe('a fade and the renders it asks for', () => {
  it('renders while it runs and asks for nothing once it has ended', async () => {
    const s = await scene(both(KEPT, ROOM));
    const scheduler = new RenderScheduler(s.app);
    const advance = steppedClock();
    const render = vi.spyOn(s.app, 'render');
    const tick = (): number => {
      render.mockClear();
      s.app.ticker.update(performance.now());
      return render.mock.calls.length;
    };
    try {
      // The first render the scheduler owes its stage
      tick();
      expect(tick()).toBe(0);
      s.setFog(both(KEPT));
      for (let frame = 0; frame < 5; frame++) {
        advance(16);
        expect(tick()).toBe(1);
      }
      advance(MOTION_NORMAL_MS);
      expect(s.fog.fading).toBe(false);
      // The picture the fade ends at is rendered once
      expect(tick()).toBe(1);
      for (let frame = 0; frame < 5; frame++) {
        advance(16);
        expect(tick()).toBe(0);
      }
    } finally {
      scheduler.destroy();
    }
  });
});

describe('the peek', () => {
  it('shows the fog as the players see it while it is held, and as the GM does when it is let go', async () => {
    const s = await scene(both(KEPT, ROOM));
    const seen = gm(s);
    const theirs = players(s);
    expect(apart(seen, theirs)).toBeGreaterThan(100);
    let held = true;
    s.fog.showsPlayers = () => held;
    s.fog.refreshVisibility();
    // Opaque fog, and no mark on the hall
    expect(apart(gm(s), theirs)).toBe(0);
    // A picture of the scene is still the GM's
    expect(red(picture(s), IN_KEPT)).toBeGreaterThan(100);
    held = false;
    s.fog.refreshVisibility();
    expect(apart(gm(s), seen)).toBe(0);
  });
});
