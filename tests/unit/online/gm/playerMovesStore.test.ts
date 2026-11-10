import type { PlayerMove } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { holdTokens } from '../../../../src/app/lighting/sightOnDrop';
import { beginHistoryTransaction, endHistoryTransaction, runUntracked } from '../../../../src/app/stores/history';
import { ALIAS, ANA, SCENE, STORE_FACTORY, table as realTable, type StoreFactory } from './realStore.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: StoreFactory };
const table = (): ReturnType<typeof realTable> => realTable(createViewAtlasStore);

const move = (x: number, y: number): PlayerMove => ({ t: 'move', scene: SCENE, id: ALIAS.ogre, x, y });
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

describe('a player\'s move on the real Atlas store', () => {
  it('is one undo step that puts the token on top, and undo takes back only that token', () => {
    const { store, history, moves } = table();
    const bear = store.getState().objects.tokens.bear;
    moves.receive(ANA, move(735, 315));
    const ogre = store.getState().objects.tokens.ogre;
    expect([ogre?.x, ogre?.y]).toEqual([735, 315]);
    expect(ogre?.layer).toBe(3);
    expect(history.getState().pastStates).toHaveLength(1);
    expect(store.getState().objects.tokens.bear).toBe(bear);

    runUntracked(store, () => store.getState().moveToken('wolf', 945, 105));
    history.getState().undo();
    const after = store.getState().objects.tokens;
    expect([after.ogre?.x, after.ogre?.y, after.ogre?.layer]).toEqual([105, 105, 0]);
    expect(after.bear).toBe(bear);
    expect(after.wolf?.x).toBe(945);
    expect(history.getState().futureStates).toHaveLength(1);
  });

  it('waits while the GM holds tokens, leaves the hold alone, and becomes a step of its own after the GM\'s drop', async () => {
    const { store, history, moves } = table();
    holdTokens(store, ['bear']);
    beginHistoryTransaction(store);
    store.getState().setIsDragging(true);
    store.getState().moveToken('bear', 400, 200);
    const held = store.getState().heldTokens;

    moves.receive(ANA, move(735, 315));
    await tick();
    expect(store.getState().objects.tokens.ogre?.x).toBe(105);
    expect(store.getState().heldTokens).toBe(held);

    // The drop as Atlas's InteractionController ends a drag: flag, place, close the step, let go.
    store.getState().setIsDragging(false);
    store.getState().dropTokens([{ id: 'bear', x: 420, y: 210 }]);
    endHistoryTransaction(store);
    holdTokens(store, []);
    await tick();

    expect(store.getState().objects.tokens.ogre?.x).toBe(735);
    expect(history.getState().pastStates).toHaveLength(2);
    history.getState().undo();
    expect(store.getState().objects.tokens.ogre?.x).toBe(105);
    expect(store.getState().objects.tokens.bear?.x).toBe(420);
  });

  it('is refused after the GM\'s drop when the GM moved that very token meanwhile', async () => {
    const { store, history, moves, sent } = table();
    holdTokens(store, ['ogre']);
    moves.receive(ANA, move(735, 315));
    store.getState().dropTokens([{ id: 'ogre', x: 1050, y: 105 }]);
    await tick();
    expect(store.getState().objects.tokens.ogre?.x).toBe(1050);
    expect(history.getState().pastStates).toHaveLength(1);
    expect(sent).toEqual([{ body: { t: 'move-refused', scene: SCENE, id: ALIAS.ogre, x: 1050, y: 105 }, to: ANA }]);
  });
});
