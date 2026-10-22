import type { PlayerDrag, PlayerMove } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdTokens } from '../../../../src/app/lighting/sightOnDrop';
import { beginHistoryTransaction, endHistoryTransaction, runUntracked } from '../../../../src/app/stores/history';
import { DRAG_IDLE_MS } from '../../../../src/app/online/gm/playerDrags.ts';
import { ALIAS, ANA, BEN, SCENE, STORE_FACTORY, table as realTable, type Table, type StoreFactory } from './realStore.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: StoreFactory };
const table = (): ReturnType<typeof realTable> => realTable(createViewAtlasStore);

const drag = (x: number, y: number, id: string = ALIAS.ogre): PlayerDrag => ({ t: 'drag', scene: SCENE, id, x, y });
const move = (x: number, y: number, id: string = ALIAS.ogre): PlayerMove => ({ t: 'move', scene: SCENE, id, x, y });
const place = ({ store }: Table, id = 'ogre'): number[] => {
  const token = store.getState().objects.tokens[id];
  return [token?.x ?? Number.NaN, token?.y ?? Number.NaN];
};

/** Ana drags her ogre through a few places, a frame apart, as the browser streams them. */
function stream(t: Table, places: readonly (readonly [number, number])[]): void {
  for (const [x, y] of places) {
    t.moves.drag(ANA, drag(x, y));
    vi.advanceTimersByTime(33);
  }
}

/** The GM drags a token as Atlas's InteractionController does, from the press to the drop. */
function gmDrags({ store }: Table, id: string, to: { x: number; y: number }, during: () => void = () => undefined): void {
  store.getState().setSelection([id]);
  holdTokens(store, [id]);
  store.getState().setIsDragging(true);
  beginHistoryTransaction(store);
  store.getState().setTokenPositions([{ id, ...to }]);
  during();
  store.getState().setIsDragging(false);
  store.getState().dropTokens([{ id, ...to }]);
  endHistoryTransaction(store);
  holdTokens(store, []);
}

describe('a player\'s streamed drag on the real Atlas store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves the token live while holding it, and its drop is one undo step that puts it on top', () => {
    const t = table();
    stream(t, [[150, 120], [300, 200], [500, 260]]);
    expect(place(t)).toEqual([500, 260]);
    expect(t.store.getState().heldTokens).toEqual({ ogre: { x: 105, y: 105 } });
    expect(t.history.getState().pastStates).toHaveLength(0);

    t.moves.receive(ANA, move(525, 245));
    expect(place(t)).toEqual([525, 245]);
    expect(t.store.getState().objects.tokens.ogre?.layer).toBe(3);
    expect(t.store.getState().heldTokens).toEqual({});
    expect(t.history.getState().pastStates).toHaveLength(1);
    expect(t.sent).toEqual([]);

    t.history.getState().undo();
    expect(place(t)).toEqual([105, 105]);
    expect(t.store.getState().objects.tokens.ogre?.layer).toBe(0);
  });

  it('ignores a place off the map and puts the token back when it may no longer be the player\'s', () => {
    const t = table();
    stream(t, [[150, 120], [-40, 120]]);
    expect(place(t)).toEqual([150, 120]);
    runUntracked(t.store, () => t.store.setState((draft) => {
      const ogre = draft.objects.tokens.ogre;
      if (ogre !== undefined) ogre.isHidden = true;
    }));
    t.moves.drag(ANA, drag(200, 140));
    expect(place(t)).toEqual([105, 105]);
    expect(t.store.getState().heldTokens).toEqual({});
    expect(t.history.getState().pastStates).toHaveLength(0);
    // The transaction is closed: the GM's next write is a step of its own.
    t.store.getState().moveToken('wolf', 600, 105);
    expect(t.history.getState().pastStates).toHaveLength(1);
  });

  it.each([
    ['its player stops sending', (): void => void vi.advanceTimersByTime(DRAG_IDLE_MS + 1_000)],
    ['its player leaves', (t: Table): void => t.moves.playerLeft(ANA)],
  ])('ends where the token is when %s, closing its step and letting go', (_, end) => {
    const t = table();
    stream(t, [[150, 120], [300, 200]]);
    end(t);
    expect(place(t)).toEqual([300, 200]);
    expect(t.store.getState().heldTokens).toEqual({});
    expect(t.history.getState().pastStates).toHaveLength(1);
    t.store.getState().moveToken('wolf', 600, 105);
    expect(t.history.getState().pastStates).toHaveLength(2);
    t.history.getState().undo();
    t.history.getState().undo();
    expect(place(t)).toEqual([105, 105]);
  });

  it('puts the token back on a cancel, letting go and leaving no undo step; another player\'s cancel changes nothing', () => {
    const t = table();
    stream(t, [[150, 120], [300, 200]]);
    t.moves.dragCancel(BEN, { t: 'drag-cancel', scene: SCENE, id: ALIAS.ogre });
    t.moves.dragCancel(ANA, { t: 'drag-cancel', scene: 'another scene', id: ALIAS.ogre });
    expect(place(t)).toEqual([300, 200]);
    t.moves.dragCancel(ANA, { t: 'drag-cancel', scene: SCENE, id: ALIAS.ogre });
    expect(place(t)).toEqual([105, 105]);
    expect(t.store.getState().heldTokens).toEqual({});
    expect(t.history.getState().pastStates).toHaveLength(0);
    // The transaction is closed: a late drop is no drag's, and the GM's next write is a step of its own.
    t.store.getState().moveToken('wolf', 600, 105);
    expect(t.history.getState().pastStates).toHaveLength(1);
  });

  it('keeps going while the player holds the token still, since the browser repeats its place', () => {
    const t = table();
    stream(t, [[150, 120]]);
    for (let second = 0; second < 5; second += 1) {
      vi.advanceTimersByTime(1_000);
      t.moves.drag(ANA, drag(150, 120));
    }
    expect(t.store.getState().heldTokens).toEqual({ ogre: { x: 105, y: 105 } });
    t.moves.receive(ANA, move(175, 105));
    expect(t.history.getState().pastStates).toHaveLength(1);
  });

  it('gives way to the GM taking the same token: the drag so far is its own step and the player\'s drop is refused', () => {
    const t = table();
    stream(t, [[150, 120], [300, 200]]);
    gmDrags(t, 'ogre', { x: 735, y: 315 }, () => {
      t.moves.drag(ANA, drag(320, 210));
      expect(place(t)).toEqual([735, 315]);
    });
    t.moves.drag(ANA, drag(340, 220));
    t.moves.receive(ANA, move(385, 245));
    expect(place(t)).toEqual([735, 315]);
    expect(t.sent).toEqual([{ body: { t: 'move-refused', scene: SCENE, id: ALIAS.ogre, x: 735, y: 315 }, to: ANA }]);
    expect(t.store.getState().heldTokens).toEqual({});
    expect(t.history.getState().pastStates).toHaveLength(2);
    t.history.getState().undo();
    expect(place(t)).toEqual([300, 200]);
    t.history.getState().undo();
    expect(place(t)).toEqual([105, 105]);

    // Her next drag is her own again.
    stream(t, [[150, 150]]);
    t.moves.receive(ANA, move(175, 175));
    expect(place(t)).toEqual([175, 175]);
  });

  it('pauses for the GM dragging another token, and the player\'s drop becomes a step of its own after it', () => {
    const t = table();
    stream(t, [[150, 120], [300, 200]]);
    gmDrags(t, 'wolf', { x: 945, y: 105 }, () => {
      t.moves.drag(ANA, drag(320, 210));
      expect(place(t)).toEqual([300, 200]);
      t.moves.receive(ANA, move(385, 245));
    });
    vi.advanceTimersByTime(1);
    expect(place(t)).toEqual([385, 245]);
    expect(t.history.getState().pastStates).toHaveLength(3);
    t.history.getState().undo();
    expect(place(t)).toEqual([300, 200]);
    expect(place(t, 'wolf')).toEqual([945, 105]);
  });

  it('closes when the scene unloads mid-drag', () => {
    const t = table();
    stream(t, [[150, 120]]);
    runUntracked(t.store, () => t.store.setState((draft) => {
      draft.isMapLoading = true;
    }));
    t.moves.drag(ANA, drag(300, 200));
    expect(place(t)).toEqual([150, 120]);
    runUntracked(t.store, () => t.store.setState((draft) => {
      draft.isMapLoading = false;
    }));
    t.history.getState().clear();
    // The transaction is closed: the GM's next write is a step of its own, and a drag starts afresh.
    t.store.getState().moveToken('wolf', 600, 105);
    expect(t.history.getState().pastStates).toHaveLength(1);
    t.moves.drag(ANA, drag(300, 200));
    t.moves.receive(ANA, move(315, 175));
    expect(t.history.getState().pastStates).toHaveLength(2);
  });

  it('shares one step between two players dragging at once, and refuses a drag of someone else\'s token', () => {
    const t = table();
    t.moves.drag(BEN, drag(150, 120));
    expect(place(t)).toEqual([105, 105]);
    t.moves.drag(ANA, drag(150, 120));
    t.moves.drag(BEN, drag(400, 300, ALIAS.bear));
    expect(t.store.getState().heldTokens).toEqual({ ogre: { x: 105, y: 105 }, bear: { x: 315, y: 105 } });
    t.moves.receive(ANA, move(175, 175));
    expect(t.store.getState().heldTokens).toEqual({ bear: { x: 315, y: 105 } });
    expect(t.history.getState().pastStates).toHaveLength(0);
    t.moves.receive(BEN, move(385, 315, ALIAS.bear));
    expect(t.store.getState().heldTokens).toEqual({});
    expect(t.history.getState().pastStates).toHaveLength(1);
    t.history.getState().undo();
    expect([place(t), place(t, 'bear')]).toEqual([[105, 105], [315, 105]]);
  });
});
