import { describe, expect, it } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { PartyReconciler } from '../../src/app/campaigns/partyValues/PartyReconciler';
import { partyKey } from '../../src/app/campaigns/partyValues/partyKeys';
import type { PartyContext } from '../../src/app/campaigns/partyValues/partyReconcile';
import { getHistoryStore, runUntracked } from '../../src/app/stores/history';
import { resourceUpdate } from '../../src/app/resources/resourceValues';
import type { TokenInput } from '../../src/app/types/viewState';

const CAMPAIGN = 'campaign-1';
const HP = partyKey(CAMPAIGN, 'pc-ayla', 'hp');
const context: PartyContext = {
  campaignId: CAMPAIGN,
  characterOf: (token) => (token.assetId === 'pc-ayla' ? 'pc-ayla' : null),
};

function scene(): { store: ViewAtlasStore; reconciler: PartyReconciler; history: NonNullable<ReturnType<typeof getHistoryStore>> } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `party-${Math.random()}`);
  const reconciler = new PartyReconciler(store);
  reconciler.setContext(context);
  return { store, reconciler, history: getHistoryStore(store)! };
}

const ayla = (x: number, hp: number): TokenInput => ({
  kind: 'character', x, y: 0, imagePath: 'ayla.png', assetId: 'pc-ayla', resources: { hp: { current: hp, max: 20 } },
} as TokenInput);

const hpOf = (store: ViewAtlasStore, id: string): number | undefined => store.getState().objects.tokens[id]?.resources?.hp?.current;

describe('a player character\'s values in a view store', () => {
  it('keeps a value mirrored in after a move when the move is undone', () => {
    const { store, history } = scene();
    const id = store.getState().addToken(ayla(0, 20));
    expect(store.getState().partyValues[HP]).toEqual({ current: 20, max: 20 });
    store.getState().moveToken(id, 140, 0);
    const steps = history.getState().pastStates.length;

    // Another view or device sets the value: Atlas's own write, no step.
    runUntracked(store, () => store.setState({ partyValues: { ...store.getState().partyValues, [HP]: { current: 5, max: 20 } } }));
    expect(hpOf(store, id)).toBe(5);
    expect(history.getState().pastStates).toHaveLength(steps);

    history.getState().undo();
    expect(store.getState().objects.tokens[id]?.x).toBe(0);
    expect(hpOf(store, id)).toBe(5);
    expect(store.getState().partyValues[HP]?.current).toBe(5);

    history.getState().redo();
    expect(store.getState().objects.tokens[id]?.x).toBe(140);
    expect(hpOf(store, id)).toBe(5);
  });

  it('puts the token and the party back together when a value\'s step is undone and redone', () => {
    const { store, history } = scene();
    const [a, b] = store.getState().addTokens([ayla(0, 20), ayla(70, 20)]);
    const steps = history.getState().pastStates.length;
    const live = store.getState().objects.tokens[a!]!;
    store.getState().updateToken(a!, resourceUpdate(live, 'hp', { current: 12, max: 20 }, false));
    expect(history.getState().pastStates).toHaveLength(steps + 1);
    expect([hpOf(store, a!), hpOf(store, b!), store.getState().partyValues[HP]?.current]).toEqual([12, 12, 12]);

    history.getState().undo();
    expect([hpOf(store, a!), hpOf(store, b!), store.getState().partyValues[HP]?.current]).toEqual([20, 20, 20]);

    history.getState().redo();
    expect([hpOf(store, a!), hpOf(store, b!), store.getState().partyValues[HP]?.current]).toEqual([12, 12, 12]);
  });

  it('gives a loaded scene the party\'s values without an undo step', () => {
    const { store, history } = scene();
    runUntracked(store, () => store.setState({ partyValues: { [HP]: { current: 3, max: 20 } } }));
    store.getState().setMapLoading(true);
    history.getState().pause();
    store.setState({ objects: { ...store.getState().objects, tokens: { t: { ...ayla(0, 20), id: 't', kind: 'character' } as never } } });
    expect(hpOf(store, 't')).toBe(20);
    store.getState().setMapLoading(false);
    history.getState().resume();
    expect(hpOf(store, 't')).toBe(3);
    expect(history.getState().pastStates).toHaveLength(0);
  });

  it('leaves values per token while no campaign is followed', () => {
    const { store, reconciler } = scene();
    reconciler.setContext(null);
    const [a, b] = store.getState().addTokens([ayla(0, 20), ayla(70, 20)]);
    store.getState().updateToken(a!, resourceUpdate(store.getState().objects.tokens[a!]!, 'hp', { current: 1, max: 20 }, false));
    expect([hpOf(store, a!), hpOf(store, b!)]).toEqual([1, 20]);
    expect(store.getState().partyValues).toEqual({});
  });

  it('adopts the tokens\' values when a campaign starts to be followed', () => {
    const { store, reconciler } = scene();
    reconciler.setContext(null);
    const [a, b] = store.getState().addTokens([ayla(0, 14), ayla(70, 9)]);
    reconciler.setContext(context);
    expect(store.getState().partyValues[HP]).toEqual({ current: 14, max: 20 });
    expect([hpOf(store, a!), hpOf(store, b!)]).toEqual([14, 14]);
  });
});
