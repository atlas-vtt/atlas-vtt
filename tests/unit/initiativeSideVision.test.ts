import { describe, expect, it } from 'vitest';
import { initiativeCardMenu } from '../../src/app/react/components/initiativeCardMenu';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import type { Token } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const entry = { id: 'e', tokenId: 'wolf', name: 'Wolf', initiative: 0, initiativeModifier: 0 } as InitiativeEntry;
const noop = (): void => undefined;

function scene(wolf: Partial<Token>) {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `sides-${Math.random()}`);
  const tokens = { wolf: { id: 'wolf', kind: 'token', imagePath: 'wolf.webp', x: 0, y: 0, ...wolf } as Token };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens } });
  const history = getHistoryStore(store)!;
  const wolfNow = (): Token | undefined => store.getState().objects.tokens.wolf as Token | undefined;
  /** Presses the card menu's "Move to Players" or "Move to Opponents" entry, as the tracker wires it (`updateTokens`). */
  const move = (): void => {
    const sides = [{ id: 'players', name: 'Players' }, { id: 'opponents', name: 'Opponents' }];
    const entries = initiativeCardMenu(entry, wolfNow(), { bySides: true, sides, cards: false, fightRuns: false, swapTargets: [] }, {
      roll: noop, moveToFront: noop, moveToBack: noop, edit: noop, setSitsOut: noop, remove: noop, delay: noop, actNow: noop, swapCard: noop,
      updateToken: (changes) => store.getState().updateTokens([{ id: 'wolf', changes }]),
    });
    const item = entries.find((candidate): candidate is Extract<ContextMenuEntry, { type: 'item' }> => candidate.type === 'item' && /^Move to (Players|Opponents)$/.test(candidate.label));
    if (!item) throw new Error('no side move in the menu');
    void item.onClick();
  };
  return { store, history, wolf: wolfNow, move };
}

describe('moving a token to the players\' side', () => {
  it('switches its vision on with the move, in one undo step', () => {
    const { history, wolf, move } = scene({ vision: { enabled: false, range: 30 } });
    const before = history.getState().pastStates.length;
    move();
    expect([wolf()?.side, wolf()?.vision]).toEqual(['players', { enabled: true, range: 30 }]);
    expect(history.getState().pastStates.length).toBe(before + 1);
    history.getState().undo();
    expect([wolf()?.side, wolf()?.vision]).toEqual([undefined, { enabled: false, range: 30 }]);
  });

  it('never switches vision off: a move to the opponents keeps it, and vision the GM switched off stays off', () => {
    const { store, wolf, move } = scene({ side: 'players', vision: { enabled: true } });
    move();
    expect([wolf()?.side, wolf()?.vision]).toEqual(['opponents', { enabled: true }]);
    move();
    store.getState().updateTokens([{ id: 'wolf', changes: { vision: { enabled: false } } }]);
    expect([wolf()?.side, wolf()?.vision]).toEqual(['players', { enabled: false }]);
  });
});
