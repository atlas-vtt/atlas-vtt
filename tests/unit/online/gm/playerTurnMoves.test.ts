import type { PlayerDrag, PlayerMove } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { movedThisTurn } from '../../../../src/app/initiative/movedThisTurn';
import { playerMoveDistance } from '../../../../src/app/online/gm/playerTurnMoves.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { runUntracked } from '../../../../src/app/stores/history';
import type { InitiativeState } from '../../../../src/app/types/initiativeTypes';
import { ALIAS, ANA, SCENE, STORE_FACTORY, table as realTable, type StoreFactory, type Table } from './realStore.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: StoreFactory };

const move = (x: number, y: number): PlayerMove => ({ t: 'move', scene: SCENE, id: ALIAS.ogre, x, y });
const drag = (x: number, y: number): PlayerDrag => ({ t: 'drag', scene: SCENE, id: ALIAS.ogre, x, y });

/** A table whose map counts movement per turn, 5 ft a 70 px cell along x, with the ogre's turn running. */
function fight(): Table {
  const t = realTable(createViewAtlasStore, () => null, () => false, (_id, from, to) => (Math.abs(to.x - from.x) / 70) * 5);
  const initiative = { isActive: true, round: 1, entries: [{ id: 'e-ogre', tokenId: 'ogre', isActive: true }] } as unknown as InitiativeState;
  runUntracked(t.store, () => t.store.setState((draft) => {
    (draft as { initiative?: InitiativeState }).initiative = initiative;
  }));
  return t;
}

const moved = ({ store }: Table): number => movedThisTurn(store.getState() as Parameters<typeof movedThisTurn>[0], 'ogre');

describe('a player\'s move where the map counts movement per turn', () => {
  it('adds up over the player\'s own drops, and undo gives a drop\'s distance back', () => {
    const t = fight();
    t.moves.receive(ANA, move(245, 105));
    t.moves.receive(ANA, move(385, 105));
    expect(moved(t)).toBe(20);
    t.history.getState().undo();
    expect(moved(t)).toBe(10);
  });

  it('counts a streamed drag from where it began to its drop', () => {
    const t = fight();
    t.moves.drag(ANA, drag(150, 105));
    t.moves.drag(ANA, drag(240, 105));
    t.moves.receive(ANA, move(245, 105));
    expect(moved(t)).toBe(10);
  });

  it('measures a drop as the drag ruler does: snapped cells by the map\'s rules, in its game units', () => {
    const { store } = fight();
    const state = store.getState() as unknown as SceneState;
    const grid = state.grid!;
    const cell = grid.size;
    const at = (column: number): { x: number; y: number } => ({ x: grid.offsetX + (column + 0.5) * cell, y: grid.offsetY + 0.5 * cell });
    expect(playerMoveDistance(state, null, 'ogre', at(1), at(3))).toBe(10);
    expect(playerMoveDistance(state, null, 'ogre', at(1), at(1))).toBeNull();
  });
});
