import type { PlayerDrag, PlayerMove } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snapTokenCenter } from '../../../../src/app/grid/gridPlacement';
import { createHexLayout, isHexGridType, nearestHexCenter } from '../../../../src/app/grid/hexGeometry';
import { squareCellCentre } from '../../../../src/app/grid/squareLattice';
import { runUntracked } from '../../../../src/app/stores/history';
import type { GridState } from '../../../../src/app/types/gridTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { sceneWalls } from '../../../../src/app/online/gm/moveCheck.ts';
import { DRAG_IDLE_MS } from '../../../../src/app/online/gm/playerDrags.ts';
import { ALIAS, ANA, SCENE, STORE_FACTORY, table as realTable, type Table, type StoreFactory } from './realStore.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: StoreFactory };

const MAP = { width: 2000, height: 1500 };
const GAP = 4.5;
type Line = readonly [number, number, number, number];
/** A room around the ogre (at 105, 105, on a grid of 70 px cells) whose east wall at x 200 runs through the cells of column 2. */
const ROOM: readonly Line[] = [[20, 20, 200, 20], [200, 20, 200, 200], [200, 200, 20, 200], [20, 200, 20, 20]];

interface Scene {
  readonly walls?: readonly Line[];
  /** Whether players see the scene lit: only then do walls stop their tokens. */
  readonly lit?: boolean;
  readonly grid?: Partial<GridState>;
  /** The ogre's size and place, where a test needs another than a medium token at (105, 105). */
  readonly ogre?: { readonly size: number; readonly x: number; readonly y: number };
}

function table({ walls = [], lit = true, grid, ogre }: Scene = {}): Table {
  let t: Table | null = null;
  t = realTable(createViewAtlasStore, () => (t === null ? null : sceneWalls(t.store.getState().objects.walls, lit, MAP)));
  const { store } = t;
  runUntracked(store, () => store.setState((draft) => {
    draft.objects.walls = Object.fromEntries(walls.map(([x1, y1, x2, y2], index) => [`w${index}`, {
      id: `w${index}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 },
    } satisfies WallSegment]));
    if (grid !== undefined && draft.grid !== null) Object.assign(draft.grid, grid);
    if (ogre !== undefined && draft.objects.tokens.ogre !== undefined) Object.assign(draft.objects.tokens.ogre, ogre);
  }));
  t.history.getState().clear();
  return t;
}

const drag = (x: number, y: number): PlayerDrag => ({ t: 'drag', scene: SCENE, id: ALIAS.ogre, x, y });
const move = (x: number, y: number): PlayerMove => ({ t: 'move', scene: SCENE, id: ALIAS.ogre, x, y });
const place = ({ store }: Table): { x: number; y: number } => {
  const ogre = store.getState().objects.tokens.ogre;
  return { x: ogre?.x ?? Number.NaN, y: ogre?.y ?? Number.NaN };
};
const refusedAt = (x: number, y: number): Table['sent'] => [{ body: { t: 'move-refused', scene: SCENE, id: ALIAS.ogre, x, y }, to: ANA }];

function stream(t: Table, places: readonly (readonly [number, number])[]): void {
  for (const [x, y] of places) {
    t.moves.drag(ANA, drag(x, y));
    vi.advanceTimersByTime(33);
  }
}

/** Where the GM's own drop of a token of `size` at a place ends, as Atlas's grid snaps it (`GridSystem.snapTokenCenter`). */
function gmDrop(t: Table, x: number, y: number, size = 1): { x: number; y: number } {
  const grid = t.store.getState().grid;
  if (grid === null) throw new Error('the scene has no grid');
  const { type, size: cell, offsetX = 0, offsetY = 0 } = grid;
  return snapTokenCenter({ x, y }, size, type, cell, (point) => (isHexGridType(type)
    ? nearestHexCenter(createHexLayout(type, cell, offsetX, offsetY), point)
    : squareCellCentre({ size: cell, offsetX, offsetY }, point)));
}

describe('where a player\'s dropped token ends, on the real Atlas store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ends on the cell the GM\'s own drop would put it on, and its player hears where', () => {
    const t = table({ lit: false });
    stream(t, [[150, 120], [300, 200]]);
    expect(place(t)).toEqual({ x: 300, y: 200 });
    t.moves.receive(ANA, move(300, 200));
    expect(place(t)).toEqual(gmDrop(t, 300, 200));
    expect(place(t)).toEqual({ x: 315, y: 175 });
    expect(t.sent).toEqual(refusedAt(315, 175));
    expect(t.history.getState().pastStates).toHaveLength(1);
  });

  it('takes the snapped place its player sent without a word, also one a rounding off', () => {
    const t = table({ lit: false });
    stream(t, [[300, 200]]);
    t.moves.receive(ANA, move(315 + 1e-9, 175 - 1e-9));
    expect(place(t)).toEqual({ x: 315, y: 175 });
    expect(t.sent).toEqual([]);
  });

  it('never rests against a wall off its cell: dragged at a wall that runs through a cell, it ends on the nearest cell it reaches', () => {
    // The wall at x 150 lies before the centre of column 2 (x 175), which the token cannot reach.
    const t = table({ walls: [...ROOM, [150, 20, 150, 200]] });
    stream(t, [[130, 105], [300, 105]]);
    expect(place(t)).toEqual({ x: 150 - GAP, y: 105 });
    t.moves.receive(ANA, move(150 - GAP, 105));
    expect(place(t)).toEqual({ x: 105, y: 105 });
    expect(t.sent).toEqual(refusedAt(105, 105));
    expect(t.store.getState().heldTokens).toEqual({});
  });

  it('ends on the cell before a wall when the drop names a place beyond it', () => {
    const t = table({ walls: ROOM });
    stream(t, [[150, 110], [300, 110]]);
    t.moves.receive(ANA, move(315, 105));
    expect(place(t)).toEqual({ x: 175, y: 105 });
    expect(t.sent).toEqual(refusedAt(175, 105));
  });

  it('puts a token of an even footprint where cells meet, a cell before a wall on a grid line', () => {
    // A large token (two cells wide) snaps to where cells meet; the wall lies on the grid line at x 210.
    const t = table({ walls: [[210, 0, 210, 400]], ogre: { size: 1.5, x: 140, y: 140 } });
    stream(t, [[180, 140], [300, 140]]);
    expect(place(t)).toEqual({ x: 210 - GAP, y: 140 });
    t.moves.receive(ANA, move(210 - GAP, 140));
    expect(place(t)).toEqual({ x: 140, y: 140 });
    expect(place(t)).toEqual(gmDrop(t, 150, 140, 1.5));
  });

  it('ends on the centre of a hex on a hex grid', () => {
    const t = table({ lit: false, grid: { type: 'hex-vertical' } });
    stream(t, [[300, 200]]);
    t.moves.receive(ANA, move(300, 200));
    const hex = gmDrop(t, 300, 200);
    expect(hex).not.toEqual({ x: 300, y: 200 });
    expect(place(t)).toEqual(hex);
  });

  it('stays on the map: dropped in a cell the map\'s edge cuts, whose centre lies off it, it ends on the cell before', () => {
    // The map is 1500 px high: the cells of row 21 begin at y 1470 and have their centres at 1505.
    const t = table({ lit: false });
    stream(t, [[1085, 1490]]);
    t.moves.receive(ANA, move(1085, 1490));
    expect(place(t)).toEqual({ x: 1085, y: 1435 });
    expect(t.sent).toEqual(refusedAt(1085, 1435));
  });

  it('stays where it was dropped on a scene whose grid does not snap', () => {
    const t = table({ lit: false, grid: { snapToGrid: false } });
    stream(t, [[300, 200]]);
    t.moves.receive(ANA, move(301, 202));
    expect(place(t)).toEqual({ x: 301, y: 202 });
    expect(t.sent).toEqual([]);
  });

  it('snaps a move sent without a drag, and takes no step a wall keeps the token from', () => {
    const t = table({ walls: ROOM });
    t.moves.receive(ANA, move(160, 100));
    expect(place(t)).toEqual({ x: 175, y: 105 });
    expect(t.sent).toEqual(refusedAt(175, 105));
    t.moves.receive(ANA, move(245, 105));
    expect(place(t)).toEqual({ x: 175, y: 105 });
    expect(t.history.getState().pastStates).toHaveLength(1);
  });

  it.each([
    ['stops sending', (): void => void vi.advanceTimersByTime(DRAG_IDLE_MS + 1_000)],
    ['leaves', (t: Table): void => t.moves.playerLeft(ANA)],
  ])('is put down on its cell when its player %s mid-drag', (_, end) => {
    const t = table({ walls: ROOM });
    stream(t, [[150, 110], [300, 110]]);
    expect(place(t).x).toBeCloseTo(200 - GAP, 1);
    end(t);
    expect(place(t)).toEqual({ x: 175, y: 105 });
    expect(t.store.getState().heldTokens).toEqual({});
  });
});
