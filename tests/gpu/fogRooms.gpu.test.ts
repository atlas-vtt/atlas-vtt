import { describe, expect, it } from 'vitest';
import { areaOutline, fogAreaList } from '../../src/app/fog/fogAreas';
import { canvasBadgeTheme } from '../../src/app/pixi/utils/canvasBadgeColors';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { WallInput } from '../../src/app/types/wallTypes';
import { fogScenes } from '../helpers/fogCoverageScene';

const { scene } = fogScenes();
type Scene = Awaited<ReturnType<typeof scene>>;

const SIZE = 128;
const MAP = { x: 0, y: 0, width: SIZE, height: SIZE };
/** The hall, 16 to 64 across and 16 to 80 down, and the vault beside it to 112, with a door in the wall between them; a cell below, apart. */
const HALL = { left: 16, top: 16, right: 64, bottom: 80 };
const VAULT = { left: 64, top: 16, right: 112, bottom: 80 };
// Farther below the hall than the gap between walls that counts as closed.
const CELL = { left: 24, top: 98, right: 56, bottom: 122 };
const WALLS: WallInput[] = [
  { type: 'solid', p1: { x: 16, y: 16 }, p2: { x: 112, y: 16 } },
  { type: 'solid', p1: { x: 112, y: 16 }, p2: { x: 112, y: 80 } },
  { type: 'solid', p1: { x: 112, y: 80 }, p2: { x: 16, y: 80 } },
  { type: 'solid', p1: { x: 16, y: 80 }, p2: { x: 16, y: 16 } },
  { type: 'solid', p1: { x: 64, y: 16 }, p2: { x: 64, y: 40 } },
  { type: 'door', closed: false, p1: { x: 64, y: 40 }, p2: { x: 64, y: 56 } },
  { type: 'solid', p1: { x: 64, y: 56 }, p2: { x: 64, y: 80 } },
  { type: 'solid', p1: { x: 24, y: 98 }, p2: { x: 56, y: 98 } },
  { type: 'solid', p1: { x: 56, y: 98 }, p2: { x: 56, y: 122 } },
  { type: 'solid', p1: { x: 56, y: 122 }, p2: { x: 24, y: 122 } },
  { type: 'solid', p1: { x: 24, y: 122 }, p2: { x: 24, y: 98 } },
];

/** The scene's walls and a 16 px grid, as part of its setup: no undo step. */
function withWalls(store: ViewAtlasStore): void {
  store.setState((state) => ({ grid: { ...state.grid, type: 'square', size: 16, offsetX: 0, offsetY: 0 } }));
  for (const wall of WALLS) store.getState().addWall(wall);
  store.temporal.getState().clear();
}

const click = (s: Scene, x: number, y: number): void => {
  s.pointer('pointerdown', x, y);
  s.pointer('pointerup', x, y);
};

const at = (frame: readonly number[], x: number, y: number): number => frame[y * SIZE + x]!;

/**
 * Holds the players' picture to fog over `rooms` alone: every pixel more than two pixels inside
 * one of them is covered, and every pixel more than two pixels outside all of them is clear. The
 * fog's canvas is half the map's size, so its edge may lie a pixel to either side of a wall.
 */
function expectFogOver(frame: readonly number[], rooms: readonly (typeof HALL)[]): void {
  const within = (x: number, y: number, room: typeof HALL, by: number): boolean => x >= room.left + by && x < room.right - by && y >= room.top + by && y < room.bottom - by;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (rooms.some((room) => within(x, y, room, 2))) expect([x, y, at(frame, x, y)]).toEqual([x, y, 0]);
      else if (!rooms.some((room) => within(x, y, room, -2))) expect([x, y, at(frame, x, y)]).toEqual([x, y, 255]);
    }
  }
}

/** Whether the pixel is drawn in the theme's accent, as a room's outline is. */
function isAccent(pixels: Uint8ClampedArray, x: number, y: number): boolean {
  const { accent } = canvasBadgeTheme();
  const index = (y * SIZE + x) * 4;
  return [(accent >> 16) & 0xff, (accent >> 8) & 0xff, accent & 0xff].every((value, channel) => Math.abs(pixels[index + channel]! - value) < 70);
}

/** The pixels along a level line from `from` to `to` that are drawn in the accent, on the line or the pixel above it. */
const accentAlong = (pixels: Uint8ClampedArray, y: number, from: number, to: number): number => {
  let count = 0;
  for (let x = from; x < to; x++) if (isAccent(pixels, x, y) || isAccent(pixels, x, y - 1)) count++;
  return count;
};

/** A corridor from 16 to 112 all round a block from 40 to 88, which a wall down its middle parts into two rooms. */
const COURT = { left: 16, top: 16, right: 112, bottom: 112 };
const BLOCK = { left: 40, top: 40, right: 88, bottom: 88 };
const box = (room: typeof COURT): WallInput[] => [
  { type: 'solid', p1: { x: room.left, y: room.top }, p2: { x: room.right, y: room.top } },
  { type: 'solid', p1: { x: room.right, y: room.top }, p2: { x: room.right, y: room.bottom } },
  { type: 'solid', p1: { x: room.right, y: room.bottom }, p2: { x: room.left, y: room.bottom } },
  { type: 'solid', p1: { x: room.left, y: room.bottom }, p2: { x: room.left, y: room.top } },
];
const RING_WALLS: WallInput[] = [...box(COURT), ...box(BLOCK), { type: 'solid', p1: { x: 64, y: 40 }, p2: { x: 64, y: 88 } }];

/**
 * Holds the players' picture to fog over the corridor alone, or over all but the corridor
 * (`covered` false): two pixels clear of every wall, as `expectFogOver` allows.
 */
function expectCorridor(frame: readonly number[], covered: boolean): void {
  const within = (x: number, y: number, room: typeof COURT, by: number): boolean => x >= room.left + by && x < room.right - by && y >= room.top + by && y < room.bottom - by;
  let [corridor, rooms] = [0, 0];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const inCorridor = within(x, y, COURT, 2) && !within(x, y, BLOCK, -2);
      const inRooms = within(x, y, BLOCK, 2);
      if (inCorridor) corridor++;
      if (inRooms) rooms++;
      if (inCorridor) expect([x, y, at(frame, x, y)]).toEqual([x, y, covered ? 0 : 255]);
      // Beyond the court too, save along the map's own edge, where fog that covers the map ends.
      else if (inRooms || (!within(x, y, COURT, -2) && within(x, y, { left: 0, top: 0, right: SIZE, bottom: SIZE }, 4))) expect([x, y, at(frame, x, y)]).toEqual([x, y, covered ? 255 : 0]);
    }
  }
  // The corridor is 24 px wide all round, the block 48 px square.
  expect([corridor, rooms]).toEqual([92 * 92 - 52 * 52, 44 * 44]);
}

describe('the fog tool\'s Room shape on the map', () => {
  it('hides and reveals a corridor that runs all round rooms without the rooms inside it', async () => {
    const s = await scene();
    s.showMapImage(MAP);
    s.store.setState((state) => ({ grid: { ...state.grid, type: 'square', size: 16, offsetX: 0, offsetY: 0 } }));
    for (const wall of RING_WALLS) s.store.getState().addWall(wall);
    s.store.temporal.getState().clear();
    s.store.getState().setFogTool({ shape: 'room' });
    s.store.getState().setActiveTool('fog');
    const history = getHistoryStore(s.store)!;

    // A click in the corridor's left side hides the corridor: the two rooms inside stay clear.
    click(s, 28, 64);
    expect(Object.values(s.store.getState().objects.fog)).toEqual([expect.objectContaining({ type: 'lasso', isErasing: false })]);
    expect(history.getState().pastStates).toHaveLength(1);
    expectCorridor(s.frame(), true);
    history.getState().undo();

    // With the whole map covered, revealing the corridor leaves the rooms inside hidden.
    s.store.getState().coverAllFog(MAP);
    s.store.getState().setActiveTool('eraser');
    click(s, 64, 100);
    expectCorridor(s.frame(), false);

    // Each room inside is revealed by a click of its own.
    click(s, 52, 64);
    const frame = s.frame();
    expect([at(frame, 52, 64), at(frame, 76, 64)]).toEqual([255, 0]);
  });

  it('outlines a corridor round rooms along its walls and theirs, with no line across it', async () => {
    const s = await scene();
    s.showMapImage(MAP);
    s.store.setState((state) => ({ grid: { ...state.grid, type: 'square', size: 16, offsetX: 0, offsetY: 0 } }));
    for (const wall of RING_WALLS) s.store.getState().addWall(wall);
    s.store.getState().setFogTool({ shape: 'room' });
    s.store.getState().setActiveTool('fog');
    s.pointer('pointermove', 28, 64);
    const pixels = s.rgba();
    // The court's top wall and the block's are outlined.
    expect(accentAlong(pixels, 16, 20, 108)).toBe(88);
    expect(accentAlong(pixels, 40, 44, 84)).toBe(40);
    // Nothing is drawn on the corridor's floor: no pixel in the accent more than three pixels from a wall.
    const floor = (x: number, y: number): boolean => {
      const outer = Math.min(x - COURT.left, COURT.right - x, y - COURT.top, COURT.bottom - y);
      const inner = Math.max(BLOCK.left - x, x - BLOCK.right, BLOCK.top - y, y - BLOCK.bottom);
      return outer > 3 && inner > 3;
    };
    let stray = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (floor(x, y) && isAccent(pixels, x, y)) stray++;
    expect(stray).toBe(0);
  });


  it('hides exactly the room clicked in, in one undo step: its neighbour beyond the door stays clear', async () => {
    const s = await scene();
    s.showMapImage(MAP);
    withWalls(s.store);
    s.store.getState().setFogTool({ shape: 'room' });
    s.store.getState().setActiveTool('fog');
    const history = getHistoryStore(s.store)!;

    click(s, 40, 48);
    expectFogOver(s.frame(), [HALL]);
    expect(history.getState().pastStates).toHaveLength(1);
    expect(Object.values(s.store.getState().objects.fog)).toEqual([expect.objectContaining({ type: 'lasso', isErasing: false })]);

    // The cell below, and then the vault: each its own shape.
    click(s, 40, 110);
    expectFogOver(s.frame(), [HALL, CELL]);
    click(s, 90, 30);
    expectFogOver(s.frame(), [HALL, VAULT, CELL]);
    expect(history.getState().pastStates).toHaveLength(3);

    // The revealing tool clears a room the same way.
    s.store.getState().setActiveTool('eraser');
    click(s, 40, 48);
    expectFogOver(s.frame(), [VAULT, CELL]);
    history.getState().undo();
    expectFogOver(s.frame(), [HALL, VAULT, CELL]);

    // Outside the walls a click hides nothing.
    s.store.getState().setActiveTool('fog');
    const before = Object.keys(s.store.getState().objects.fog).length;
    click(s, 100, 104);
    expect(Object.keys(s.store.getState().objects.fog)).toHaveLength(before);
  });

  it('outlines the room under the pointer on the GM\'s canvas alone', async () => {
    const s = await scene();
    s.showMapImage(MAP);
    withWalls(s.store);
    s.store.getState().setFogTool({ shape: 'room' });
    s.store.getState().setActiveTool('fog');
    expect(accentAlong(s.rgba(), 16, 20, 60)).toBe(0);

    s.pointer('pointermove', 40, 48);
    const hall = s.rgba();
    // The hall's top wall is outlined, the vault's is not.
    expect(accentAlong(hall, 16, 20, 60)).toBe(40);
    expect(accentAlong(hall, 16, 70, 108)).toBe(0);
    expect(accentAlong(s.rgba(s.fog.getPlayerViewLayers()), 16, 20, 60)).toBe(0);

    s.pointer('pointermove', 90, 30);
    const vault = s.rgba();
    expect(accentAlong(vault, 16, 20, 60)).toBe(0);
    expect(accentAlong(vault, 16, 70, 108)).toBe(38);

    // Outside the walls nothing is outlined.
    s.pointer('pointermove', 100, 104);
    const outside = s.rgba();
    expect(accentAlong(outside, 16, 20, 108)).toBe(0);
  });

  it('makes an area of every room from the walls, each with its badge, in one undo step', async () => {
    const s = await scene();
    s.showMapImage(MAP);
    withWalls(s.store);
    const history = getHistoryStore(s.store)!;

    expect(s.store.getState().addRoomAreas(MAP)).toEqual({ rooms: 3, made: 3, full: false });
    expect(history.getState().pastStates).toHaveLength(1);
    const areas = fogAreaList(s.store.getState().objects.fog);
    expect(areas.map((area) => areaOutline(area).map(({ x, y }) => `${x},${y}`).sort()).sort()).toEqual([
      ['112,16', '112,80', '64,16', '64,80'],
      ['16,16', '16,80', '64,16', '64,80'],
      ['24,122', '24,98', '56,122', '56,98'],
    ]);
    expectFogOver(s.frame(), [HALL, VAULT, CELL]);

    // One badge in the middle of each room, on the GM's canvas alone.
    const spots = areas.map((area) => s.fog.areaBadgeSpot(area.id));
    expect(spots.map((spot) => `${spot?.x},${spot?.y}`).sort()).toEqual(['40,110', '40,48', '88,48']);
    const gm = s.rgba();
    const picture = s.rgba(s.fog.getGmViewLayers());
    const marked = (x: number, y: number): boolean => [0, 1, 2].some((channel) => Math.abs(gm[(y * SIZE + x) * 4 + channel]! - picture[(y * SIZE + x) * 4 + channel]!) > 8);
    for (const spot of spots) {
      let pixels = 0;
      for (let y = spot!.y - 14; y < spot!.y + 14; y++) for (let x = spot!.x - 14; x < spot!.x + 14; x++) if (marked(x, y)) pixels++;
      expect(pixels).toBeGreaterThan(300);
    }
    // No badge where there is no room.
    expect(marked(100, 104)).toBe(false);

    // A click on a room's badge reveals it: the vault and the cell stay hidden.
    s.store.getState().flipFogArea(areas.find((area) => areaOutline(area).some((corner) => corner.x === 16))!.id);
    expectFogOver(s.frame(), [VAULT, CELL]);

    // Again there is nothing to make.
    expect(s.store.getState().addRoomAreas(MAP)).toEqual({ rooms: 3, made: 0, full: false });
    history.getState().undo();
    history.getState().undo();
    expect(fogAreaList(s.store.getState().objects.fog)).toEqual([]);
    expectFogOver(s.frame(), []);
  });
});
