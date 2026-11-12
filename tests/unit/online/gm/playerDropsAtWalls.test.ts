import type { PlayerDrag, PlayerMove, SnapGrid } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runUntracked } from '../../../../src/app/stores/history';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { sceneWalls } from '../../../../src/app/online/gm/moveCheck.ts';
import { ALIAS, ANA, SCENE, STORE_FACTORY, table as realTable, type Table, type StoreFactory } from './realStore.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: StoreFactory };

const MAP = { width: 2000, height: 1500 };
/** Cells of 90 px from (10, 10): the cell from x 190 to 280 has its centre at 235, beyond the wall at x 200 that runs through it. */
const GRID: SnapGrid = { type: 'square', size: 90, offsetX: 10, offsetY: 10 };
const GAP = 4.5;

/** The ogre's table with a wall from (200, 0) to (200, 1000), snapping to `snap`. */
function table(snap: SnapGrid | null): Table {
  let t: Table | null = null;
  t = realTable(createViewAtlasStore, () => (t === null ? null : sceneWalls(t.store.getState().objects.walls, true, MAP)), () => false, snap);
  const { store } = t;
  const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 200, y: 0 }, p2: { x: 200, y: 1000 } };
  runUntracked(store, () => store.setState((draft) => {
    draft.objects.walls = { w: wall };
  }));
  return t;
}

const drag = (x: number, y: number): PlayerDrag => ({ t: 'drag', scene: SCENE, id: ALIAS.ogre, x, y });
const move = (x: number, y: number): PlayerMove => ({ t: 'move', scene: SCENE, id: ALIAS.ogre, x, y });
const place = ({ store }: Table): { x: number; y: number } => {
  const ogre = store.getState().objects.tokens.ogre;
  return { x: ogre?.x ?? Number.NaN, y: ogre?.y ?? Number.NaN };
};

/** Drags the ogre east into the wall: it stops against it, at (200 - gap, 110). */
function pushIntoWall(t: Table): void {
  for (const [x, y] of [[150, 110], [400, 110]] as const) {
    t.moves.drag(ANA, drag(x, y));
    vi.advanceTimersByTime(33);
  }
  expect(place(t).x).toBeCloseTo(200 - GAP, 1);
}

describe('a player\'s token put down against a wall on a grid that snaps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rests in the cell before the wall when an older page drops it where the drag stopped, and its player hears where', () => {
    const t = table(GRID);
    pushIntoWall(t);
    const stop = place(t);
    t.moves.receive(ANA, move(stop.x, stop.y));
    expect(place(t)).toEqual({ x: 145, y: 145 });
    expect(t.sent).toEqual([{ body: { t: 'move-refused', scene: SCENE, id: ALIAS.ogre, x: 145, y: 145 }, to: ANA }]);
  });

  it('takes a drop on a cell it reaches as it is', () => {
    const t = table(GRID);
    pushIntoWall(t);
    t.moves.receive(ANA, move(145, 145));
    expect(place(t)).toEqual({ x: 145, y: 145 });
    expect(t.sent).toEqual([]);
  });

  it('rests on the cell it came from when a step takes it into the wall', () => {
    const t = table(GRID);
    runUntracked(t.store, () => t.store.setState((draft) => {
      const ogre = draft.objects.tokens.ogre;
      if (ogre !== undefined) Object.assign(ogre, { x: 145, y: 145 });
    }));
    t.moves.receive(ANA, move(235, 145));
    expect(place(t)).toEqual({ x: 145, y: 145 });
    expect(t.sent).toEqual([{ body: { t: 'move-refused', scene: SCENE, id: ALIAS.ogre, x: 145, y: 145 }, to: ANA }]);
  });

  it('stays where the drag stopped on a grid that does not snap', () => {
    const t = table(null);
    pushIntoWall(t);
    const stop = place(t);
    t.moves.receive(ANA, move(stop.x, stop.y));
    expect(place(t)).toEqual(stop);
    expect(t.sent).toEqual([]);
  });
});
