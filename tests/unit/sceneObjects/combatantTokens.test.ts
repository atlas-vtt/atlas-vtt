import { describe, expect, it } from 'vitest';
import { withLevelDeleted } from '../../../src/app/levels/levelEdits';
import { createViewAtlasStore, type ViewAtlasState, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { runUntracked } from '../../../src/app/stores/history';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

/**
 * A combatant lives as long as its token: whatever takes the token away (a removal, an undo, a
 * level deleted with what stands on it, a map switch) takes its entry out of the tracker. The
 * store keeps the tracker's entries in step with the scene, with or without a tracker drawn.
 */

const level = (id: string, bottom: number): SceneLevel => ({ id, elevation: { bottom, top: bottom + 10 }, background: null });

/** A fight in turn order between `a`, `b` (no hit points left) and `c`, `a` holding the turn, and a party member. */
function fight(): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `combatant-tokens-${Math.random()}`);
  store.setState({ persistenceEnabled: false, mapLoaded: true });
  const state = store.getState();
  state.addTokens(['a', 'b', 'c'].map((id) => ({ id, x: 0, y: 0, imagePath: `${id}.png`, resources: { hp: { current: id === 'b' ? 0 : 7, max: 7 } } })));
  for (const id of ['a', 'b', 'c']) state.addToInitiative({ tokenId: id, name: id, initiative: 0, initiativeModifier: 0, imagePath: `${id}.png`, isNPC: true });
  state.addToInitiative({ partyMemberId: 'hero', name: 'Hero', initiative: 0, initiativeModifier: 0, imagePath: '', isNPC: false });
  state.startCombat();
  return store;
}

const listed = (state: ViewAtlasState): (string | undefined)[] => state.initiative.entries.map((entry) => entry.tokenId ?? entry.partyMemberId);
const turnHolder = (state: ViewAtlasState): string | undefined => state.initiative.entries.find((entry) => entry.isActive)?.tokenId;

describe('a combatant whose token is gone', () => {
  it('leaves the tracker in the write that removes the token, the turn passing by the defeated', () => {
    const store = fight();
    const heard: (string | undefined)[][] = [];
    store.subscribe((state) => heard.push(listed(state)));

    store.getState().removeObjects(['a']);

    expect(heard).toEqual([['b', 'c', 'hero']]);
    expect(turnHolder(store.getState())).toBe('c');
  });

  it('stays out of the tracker when one undo brings the token back', () => {
    const store = fight();
    store.getState().removeObjects(['a']);

    store.temporal.getState().undo();

    expect(store.getState().objects.tokens.a).toBeDefined();
    expect(listed(store.getState())).toEqual(['b', 'c', 'hero']);
  });

  it('leaves the tracker when an undo takes its token away', () => {
    const store = fight();
    store.getState().addTokens([{ id: 'd', x: 0, y: 0, imagePath: 'd.png' }]);
    store.getState().addToInitiative({ tokenId: 'd', name: 'd', initiative: 0, initiativeModifier: 0, imagePath: 'd.png', isNPC: true });

    store.temporal.getState().undo();

    expect(store.getState().objects.tokens.d).toBeUndefined();
    expect(listed(store.getState())).toEqual(['a', 'b', 'c', 'hero']);
  });

  it('leaves the tracker when its level is deleted with what stands on it', () => {
    const store = fight();
    store.getState().setLevels([level('ground', 0), level('tower', 10)]);
    store.getState().updateTokens([{ id: 'c', changes: { level: 'tower' } }]);

    runUntracked(store, () => store.getState().applyLevelScene(withLevelDeleted(store.getState(), 'tower', null)));

    expect(store.getState().objects.tokens.c).toBeUndefined();
    expect(listed(store.getState())).toEqual(['a', 'b', 'hero']);
  });

  it("leaves the tracker on a map switch, while the party's entries stay", () => {
    const store = fight();

    store.getState().clearMapState();

    expect(listed(store.getState())).toEqual(['hero']);
  });
});
