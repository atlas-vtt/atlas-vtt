import { describe, expect, it } from 'vitest';
import { movedThisTurn, movementTurn } from '../../../src/app/initiative/movedThisTurn';
import { movedInTurn, turnMoveAfter, withTurnMoves, type TurnMoves } from '../../../src/app/measure/turnMoves';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore, runHistoryTransaction } from '../../../src/app/stores/history';
import type { TokenEntity } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

describe('what tokens moved in a turn', () => {
  it('adds up within a turn and starts anew in another one', () => {
    let moves: TurnMoves = {};
    moves = withTurnMoves(moves, 'r1|a', ['a'], 10);
    moves = withTurnMoves(moves, 'r1|a', ['a', 'b'], 15);
    expect(moves).toEqual({ a: { turn: 'r1|a', distance: 25 }, b: { turn: 'r1|a', distance: 15 } });
    expect(movedInTurn(moves, 'r1|a', 'a')).toBe(25);
    expect(movedInTurn(moves, 'r1|b', 'a')).toBe(0);
    moves = withTurnMoves(moves, 'r1|b', ['a'], 5);
    expect(moves.a).toEqual({ turn: 'r1|b', distance: 5 });
    // What another token moved in the turn before is kept as it was, and counts for no other turn.
    expect(moves.b).toEqual({ turn: 'r1|a', distance: 15 });
    expect(movedInTurn(moves, 'r1|b', 'b')).toBe(0);
    expect(movedInTurn(moves, 'r1|b', 'nobody')).toBe(0);
  });

  it('counts nothing outside a fight, nor a distance that is no number above 0', () => {
    const moves: TurnMoves = { a: { turn: 't', distance: 10 } };
    expect(withTurnMoves(moves, null, ['a'], 10)).toBe(moves);
    for (const distance of [0, -5, NaN, Infinity]) expect(withTurnMoves(moves, 't', ['a'], distance)).toBe(moves);
    expect(withTurnMoves(moves, 't', [], 10)).toBe(moves);
    expect(turnMoveAfter(undefined, null, 10)).toBeNull();
    expect(movedInTurn(moves, null, 'a')).toBe(0);
    expect(movedInTurn(undefined, 't', 'a')).toBe(0);
    expect(movedInTurn({ a: { turn: 't', distance: NaN } }, 't', 'a')).toBe(0);
  });

  it('leaves the entries of tokens that did not move the objects they were', () => {
    const moves: TurnMoves = { a: { turn: 't', distance: 10 }, b: { turn: 't', distance: 3 } };
    const next = withTurnMoves(moves, 't', ['a'], 1);
    expect(next).not.toBe(moves);
    expect(next.b).toBe(moves.b);
    expect(moves.a).toEqual({ turn: 't', distance: 10 });
  });
});

const token = (id: string, x: number): TokenEntity => ({ id, kind: 'token', x, y: 0, imagePath: `${id}.png` });

interface Fight {
  store: ViewAtlasStore;
  /** Moves a token and counts the distance, as one drag does. */
  drag: (id: string, x: number, distance: number) => void;
  moved: (id: string) => number;
  steps: () => number;
  undo: () => void;
  redo: () => void;
}

/** A scene with the tokens a and b in the tracker, a first. */
function fight(): Fight {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `turn-moves-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ objects: { ...store.getState().objects, tokens: { a: token('a', 0), b: token('b', 70) } } });
  for (const id of ['a', 'b']) store.getState().addToInitiative({ tokenId: id, name: id, initiative: id === 'a' ? 20 : 10, initiativeModifier: 0, imagePath: '', isNPC: true });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return {
    store,
    drag: (id, x, distance) => runHistoryTransaction(store, () => {
      store.getState().moveToken(id, x, 0);
      store.getState().countTurnMove([id], distance);
    }),
    moved: (id) => movedThisTurn(store.getState(), id),
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    redo: () => history.getState().redo(),
  };
}

describe('movement counted per turn in the store', () => {
  it('adds up over the drags of a turn, each one undo step with its move', () => {
    const { store, drag, moved, steps } = fight();
    store.getState().startCombat();
    drag('a', 140, 10);
    drag('a', 280, 15);
    expect(moved('a')).toBe(25);
    expect(moved('b')).toBe(0);
    expect(steps()).toBe(2);
  });

  it('gives the distance back when the move is undone, and counts it again when it is redone', () => {
    const { store, drag, moved, undo, redo } = fight();
    store.getState().startCombat();
    drag('a', 140, 10);
    drag('a', 0, 15);
    undo();
    expect(store.getState().objects.tokens.a!.x).toBe(140);
    expect(moved('a')).toBe(10);
    undo();
    // Back where it began, though it stood there after its second move too: the count follows the steps, not the place.
    expect(store.getState().objects.tokens.a!.x).toBe(0);
    expect(moved('a')).toBe(0);
    redo();
    redo();
    expect(moved('a')).toBe(25);
  });

  it('starts every token at 0 when the turn passes on, and knows the turn again when the GM steps back', () => {
    const { store, drag, moved } = fight();
    store.getState().startCombat();
    drag('a', 140, 30);
    store.getState().nextTurn();
    expect(moved('a')).toBe(0);
    drag('b', 210, 20);
    expect(moved('b')).toBe(20);
    store.getState().previousTurn();
    expect(moved('a')).toBe(30);
    expect(moved('b')).toBe(0);
    // Round 2: its turn has come again.
    store.getState().nextTurn();
    store.getState().nextTurn();
    expect(store.getState().initiative.round).toBe(2);
    expect(moved('a')).toBe(0);
  });

  it('counts for nobody once the fight ends, nor in the same turn of the next fight', () => {
    const { store, drag, moved } = fight();
    store.getState().startCombat();
    drag('a', 140, 30);
    const first = movementTurn(store.getState());
    store.getState().endCombat();
    expect(movementTurn(store.getState())).toBeNull();
    expect(moved('a')).toBe(0);
    store.getState().startCombat();
    expect(store.getState().initiative.round).toBe(1);
    expect(movementTurn(store.getState())).not.toBe(first);
    expect(moved('a')).toBe(0);
  });

  it('counts by sides while a side holds the turn', () => {
    const { store, drag, moved } = fight();
    store.getState().startCombat({ mode: 'sides', roll: '1d20', firstSide: 'opponents' });
    drag('a', 140, 10);
    drag('b', 210, 20);
    expect([moved('a'), moved('b')]).toEqual([10, 20]);
    store.getState().nextTurn();
    expect([moved('a'), moved('b')]).toEqual([0, 0]);
  });

  it('counts nothing outside a fight and makes no undo step of it', () => {
    const { store, moved, steps } = fight();
    const before = store.getState().turnMoves;
    store.getState().countTurnMove(['a'], 30);
    expect(store.getState().turnMoves).toBe(before);
    expect(moved('a')).toBe(0);
    expect(steps()).toBe(0);
  });

  it('is never saved with the scene, and a turn change is no undo step', () => {
    const { store, drag, steps } = fight();
    store.getState().startCombat();
    drag('a', 140, 30);
    store.getState().nextTurn();
    store.getState().endCombat();
    expect(steps()).toBe(1);
    store.getState().setPersistenceEnabled(true);
    const saved = store.persist.getOptions().partialize?.(store.getState()) as Record<string, unknown>;
    expect(saved).toHaveProperty('initiative');
    expect(saved).not.toHaveProperty('turnMoves');
    expect(saved).not.toHaveProperty('fightsStarted');
  });

  it('starts empty when another scene is loaded into the view', () => {
    const { store, drag } = fight();
    store.getState().startCombat();
    drag('a', 140, 30);
    store.getState().clearMapState();
    expect(store.getState().turnMoves).toEqual({});
  });
});
