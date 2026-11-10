import type { PlayerDrag, PlayerMove } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runUntracked } from '../../../../src/app/stores/history';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { sceneWalls } from '../../../../src/app/online/gm/moveCheck.ts';
import { ALIAS, ANA, SCENE, STORE_FACTORY, table as realTable, type Table, type StoreFactory } from './realStore.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: StoreFactory };

const MAP = { width: 2000, height: 1500 };
/** The room the ogre (at 105, 105) stands in: its east wall at x 200 has a door from y 80 to 140. */
const ROOM: readonly (readonly [number, number, number, number, Partial<WallSegment>?])[] = [
  [20, 20, 200, 20], [200, 20, 200, 80], [200, 80, 200, 140, { type: 'door', closed: true }], [200, 140, 200, 200], [200, 200, 20, 200], [20, 200, 20, 20],
];
const GAP = 4.5;

/** The ogre's table with the room's walls in the store, the door as given; `lit` says whether players see the scene lit. */
function table(door: Partial<WallSegment>, lit = true): Table {
  let t: Table | null = null;
  t = realTable(createViewAtlasStore, () => (t === null ? null : sceneWalls(t.store.getState().objects.walls, lit, MAP)));
  const { store } = t;
  runUntracked(store, () => store.setState((draft) => {
    draft.objects.walls = Object.fromEntries(ROOM.map(([x1, y1, x2, y2, changes], index) => [`w${index}`, {
      id: `w${index}`, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...changes, ...(changes && door),
    } satisfies WallSegment]));
  }));
  return t;
}

const drag = (x: number, y: number): PlayerDrag => ({ t: 'drag', scene: SCENE, id: ALIAS.ogre, x, y });
const move = (x: number, y: number): PlayerMove => ({ t: 'move', scene: SCENE, id: ALIAS.ogre, x, y });
const place = ({ store }: Table): { x: number; y: number } => {
  const ogre = store.getState().objects.tokens.ogre;
  return { x: ogre?.x ?? Number.NaN, y: ogre?.y ?? Number.NaN };
};

function stream(t: Table, places: readonly (readonly [number, number])[]): void {
  for (const [x, y] of places) {
    t.moves.drag(ANA, drag(x, y));
    vi.advanceTimersByTime(33);
  }
}

describe('a player\'s token on a lit scene with walls, on the real Atlas store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const [name, door] of [['closed', { closed: true }], ['locked', { closed: true, locked: true }], ['secret', { type: 'secret-door', closed: true }]] as const) {
    it(`stays in the room while dragged at a ${name} door, lands before it, and the drag is one undo step`, () => {
      const t = table(door);
      stream(t, [[150, 110], [300, 110], [400, 170]]);
      expect(place(t).x).toBeLessThanOrEqual(200 - GAP + 0.01);
      expect(place(t).y).toBeLessThan(200);

      t.moves.receive(ANA, move(385, 175));
      const landed = place(t);
      expect(landed.x).toBeLessThanOrEqual(200 - GAP + 0.01);
      expect(landed.x).toBeGreaterThan(190);
      expect(t.sent).toEqual([{ body: { t: 'move-refused', scene: SCENE, id: ALIAS.ogre, x: landed.x, y: landed.y }, to: ANA }]);
      expect(t.store.getState().heldTokens).toEqual({});
      expect(t.history.getState().pastStates).toHaveLength(1);
      t.history.getState().undo();
      expect(place(t)).toEqual({ x: 105, y: 105 });
    });
  }

  it('slides along a wall while dragged past it', () => {
    const t = table({ closed: true });
    stream(t, [[150, 60], [400, 60], [400, 160]]);
    expect(place(t).x).toBeCloseTo(200 - GAP, 1);
    expect(place(t).y).toBeCloseTo(160, 1);
  });

  it('leaves through an open door', () => {
    const t = table({ closed: false });
    stream(t, [[150, 110], [300, 110]]);
    expect(place(t)).toEqual({ x: 300, y: 110 });
    t.moves.receive(ANA, move(315, 105));
    expect(place(t)).toEqual({ x: 315, y: 105 });
    expect(t.sent).toEqual([]);
    expect(t.history.getState().pastStates).toHaveLength(1);
  });

  it('steps up to a closed door by moves of its own, and a step a wall keeps it from writes nothing', () => {
    const t = table({ closed: true });
    t.moves.receive(ANA, move(175, 105));
    expect(place(t)).toEqual({ x: 175, y: 105 });
    t.moves.receive(ANA, move(245, 105));
    expect(place(t)).toEqual({ x: 200 - GAP, y: 105 });
    expect(t.history.getState().pastStates).toHaveLength(2);
    t.moves.receive(ANA, move(315, 105));
    expect(place(t)).toEqual({ x: 200 - GAP, y: 105 });
    expect(t.history.getState().pastStates).toHaveLength(2);
    expect(t.sent.map(({ body }) => body)).toEqual([
      { t: 'move-refused', scene: SCENE, id: ALIAS.ogre, x: 200 - GAP, y: 105 },
      { t: 'move-refused', scene: SCENE, id: ALIAS.ogre, x: 200 - GAP, y: 105 },
    ]);
  });

  it('moves through walls as before on a scene players do not see lit', () => {
    const t = table({ closed: true }, false);
    stream(t, [[300, 110]]);
    t.moves.receive(ANA, move(735, 315));
    expect(place(t)).toEqual({ x: 735, y: 315 });
    expect(t.sent).toEqual([]);
  });

  it('leaves the GM\'s own moves alone', () => {
    const t = table({ closed: true });
    t.store.getState().moveToken('ogre', 735, 315);
    expect(place(t)).toEqual({ x: 735, y: 315 });
  });
});
