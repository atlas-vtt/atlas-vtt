// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BookCharacter } from '../../../../src/app/online/protocol/index.ts';
import type { BookScene } from '../../../../src/app/online/gm/book/bookScene.ts';
import type { PlayedCharacter } from '../../../../src/app/online/gm/book/characters.ts';
import { checkResourceEdit, type ResourceEdit } from '../../../../src/app/online/gm/book/resourceEdit.ts';
import { ResourceWrites, type TokenResourceEdit } from '../../../../src/app/online/gm/book/resourceWrites.ts';
import type { ResourceDefinition } from '../../../../src/app/resources/resourceTypes';
import { PartyReconciler } from '../../../../src/app/campaigns/partyValues/PartyReconciler';
import { partyKey } from '../../../../src/app/campaigns/partyValues/partyKeys';
import { holdTokens } from '../../../../src/app/lighting/sightOnDrop';
import { beginHistoryTransaction, endHistoryTransaction, runUntracked } from '../../../../src/app/stores/history';
import type { TokenEntity } from '../../../../src/app/types';
import { ANA, BEN, STORE_FACTORY, table as realTable, type StoreFactory } from './realStore.ts';
import { token } from './shareHarness.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: StoreFactory };

const DEFINITIONS: readonly ResourceDefinition[] = [
  { key: 'hp', name: 'Hit Points', field: 'hp', direction: 'drains', color: '#cc3333', visibleToPlayers: true },
  { key: 'ac', name: 'Armour', field: 'ac', direction: 'static', color: '#0000ff', visibleToPlayers: true },
  { key: 'doom', name: 'Doom', field: 'doom', direction: 'fills', color: '#111111', visibleToPlayers: false },
];
const OWNERS: Readonly<Record<string, string>> = { ogre: ANA, bear: BEN };
const VALUES = { hp: { current: 7, max: 12 }, ac: { current: 14, max: 14 }, doom: { current: 3, max: 9 } };
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

const sheet: BookCharacter = {
  name: 'Ogre', art: null, ring: null,
  resources: [
    { key: 'hp', name: 'Hit Points', colour: '#cc3333', direction: 'drains', current: 7, max: 12, editable: true },
    { key: 'ac', name: 'Armour', colour: '#0000ff', direction: 'static', current: 14, max: 14, editable: false },
  ],
};
const ogre: PlayedCharacter = { collection: 'Cairn', key: 'art/ogre.webp', tokenId: 'ogre', placed: { assetId: 'lib-ogre', imagePath: 'art/ogre.webp' }, sheet, statblockPath: null, drawnWith: { definitions: [], resources: undefined } };

function scene(tokens: readonly TokenEntity[]): BookScene {
  return { mapPath: 'map', collection: 'Cairn', resources: DEFINITIONS, tokens: Object.fromEntries(tokens.map((entry) => [entry.id, entry])), shown: () => new Map(), listedToken: () => undefined };
}

const check = (character: PlayedCharacter | null, at: BookScene | null, key: string, current = 5, from = ANA): ResourceEdit | null =>
  checkResourceEdit(from, character, at, (tokenId) => OWNERS[tokenId], { t: 'book-resource', key, current });

describe('a player\'s edit of a resource, checked', () => {
  const cave = scene([token('ogre', { resources: VALUES }), token('bear', { resources: VALUES })]);

  it('goes to the token of the player\'s own character in the shared scene', () => {
    expect(check(ogre, cave, 'hp', 99)).toEqual({ kind: 'token', from: ANA, tokenId: 'ogre', key: 'hp', current: 99 });
  });

  it('is refused for a fixed resource, one the sheet does not offer, a token given away, and a player without a character', () => {
    expect(check(ogre, cave, 'doom')).toBeNull();
    expect(check(ogre, cave, 'ac')).toBeNull();
    expect(check(ogre, cave, 'mana')).toBeNull();
    expect(check({ ...ogre, sheet: { ...sheet, resources: [{ ...sheet.resources[0]!, editable: false }] } }, cave, 'hp')).toBeNull();
    expect(check(ogre, cave, 'hp', 5, BEN)).toBeNull();
    expect(check(null, cave, 'hp')).toBeNull();
  });

  it('takes a resource hidden from players: the character is the player\'s own', () => {
    const withDoom: PlayedCharacter = { ...ogre, sheet: { ...sheet, resources: [...sheet.resources, { key: 'doom', name: 'Doom', colour: '#111111', direction: 'fills', current: 3, max: 9, editable: true }] } };
    expect(check(withDoom, cave, 'doom', 4)).toEqual({ kind: 'token', from: ANA, tokenId: 'ogre', key: 'doom', current: 4 });
    expect(check(ogre, { ...cave, resources: DEFINITIONS.map((definition) => ({ ...definition, visibleToPlayers: false })) }, 'hp')).toMatchObject({ kind: 'token' });
  });

  it('goes to the character\'s values while the shared scene holds no token of it, or no scene is shared', () => {
    const elsewhere = scene([token('bear', { resources: VALUES })]);
    expect(check(ogre, elsewhere, 'hp', 3)).toEqual({ kind: 'character', from: ANA, placed: ogre.placed, key: 'hp', current: 3 });
    expect(check(ogre, null, 'hp', 3)).toMatchObject({ kind: 'character' });
    expect(check(ogre, elsewhere, 'ac')).toBeNull();
  });
});

/** A real Atlas store with the ogre and the bear holding resources, no history, and the writes of their players. */
function writes(): ReturnType<typeof realTable> & { readonly resources: ResourceWrites; readonly answers: (number | null)[] } {
  const real = realTable(createViewAtlasStore);
  runUntracked(real.store, () => real.store.setState((draft) => {
    for (const id of ['ogre', 'bear']) {
      const held = draft.objects.tokens[id];
      if (held !== undefined) held.resources = { ...VALUES };
    }
  }));
  const resources = new ResourceWrites(real.store, {
    definitions: () => DEFINITIONS,
    ownerOf: (tokenId) => OWNERS[tokenId],
    now: () => Date.now(),
    setTimer: (run, ms) => setTimeout(run, ms) as unknown as number,
    clearTimer: (timer) => clearTimeout(timer),
  });
  resources.start();
  return { ...real, resources, answers: [] };
}

const edit = (current: number, key = 'hp', from = ANA, tokenId = 'ogre'): TokenResourceEdit => ({ kind: 'token', from, tokenId, key, current });

describe('a player\'s edit on the real Atlas store', () => {
  it('is one undo step of the GM\'s, clamped to the resource\'s range, and undo takes back only that value', () => {
    const { store, history, resources, answers } = writes();
    const bear = store.getState().objects.tokens.bear;
    resources.write(edit(99), (taken) => answers.push(taken));
    expect(store.getState().objects.tokens.ogre?.resources?.hp).toEqual({ current: 12, max: 12 });
    expect(store.getState().objects.tokens.bear).toBe(bear);
    expect(history.getState().pastStates).toHaveLength(1);
    resources.write(edit(-4), (taken) => answers.push(taken));
    expect(store.getState().objects.tokens.ogre?.resources?.hp).toEqual({ current: 0, max: 12 });
    expect(history.getState().pastStates).toHaveLength(2);
    expect(answers).toEqual([12, 0]);

    history.getState().undo();
    expect(store.getState().objects.tokens.ogre?.resources?.hp).toEqual({ current: 12, max: 12 });
    expect(store.getState().objects.tokens.ogre?.resources?.doom).toEqual(VALUES.doom);
  });

  it('writes nothing and makes no step for the value the token holds, but answers it', () => {
    const { history, resources, answers } = writes();
    resources.write(edit(7), (taken) => answers.push(taken));
    expect(history.getState().pastStates).toHaveLength(0);
    expect(answers).toEqual([7]);
  });

  it('refuses another player\'s token, a fixed resource, and a scene that loads', () => {
    const { store, history, resources, answers } = writes();
    resources.write(edit(1, 'hp', ANA, 'bear'), (taken) => answers.push(taken));
    resources.write(edit(1, 'ac'), (taken) => answers.push(taken));
    runUntracked(store, () => store.setState((draft) => void (draft.isMapLoading = true)));
    resources.write(edit(1), (taken) => answers.push(taken));
    expect(answers).toEqual([null, null, null]);
    expect(history.getState().pastStates).toHaveLength(0);
  });

  it('writes a resource hidden from players to the player\'s own token', () => {
    const { store, history, resources, answers } = writes();
    resources.write(edit(5, 'doom'), (taken) => answers.push(taken));
    expect(store.getState().objects.tokens.ogre?.resources?.doom).toEqual({ current: 5, max: 9 });
    expect(history.getState().pastStates).toHaveLength(1);
    expect(answers).toEqual([5]);
  });

  it('waits while the GM holds tokens, the latest edit winning, and becomes a step of its own after the GM\'s drop', async () => {
    const { store, history, resources, answers } = writes();
    holdTokens(store, ['bear']);
    beginHistoryTransaction(store);
    store.getState().setIsDragging(true);
    store.getState().moveToken('bear', 400, 200);

    resources.write(edit(5), (taken) => answers.push(taken));
    resources.write(edit(3), (taken) => answers.push(taken));
    await tick();
    expect(store.getState().objects.tokens.ogre?.resources?.hp?.current).toBe(7);
    expect(answers).toEqual([]);

    store.getState().setIsDragging(false);
    store.getState().dropTokens([{ id: 'bear', x: 420, y: 210 }]);
    endHistoryTransaction(store);
    holdTokens(store, []);
    await tick();

    expect(store.getState().objects.tokens.ogre?.resources?.hp?.current).toBe(3);
    expect(answers).toEqual([3]);
    expect(history.getState().pastStates).toHaveLength(2);
    history.getState().undo();
    expect(store.getState().objects.tokens.ogre?.resources?.hp?.current).toBe(7);
    expect(store.getState().objects.tokens.bear?.x).toBe(420);
  });

  it('refuses a waiting edit whose token the GM gave away meanwhile, and every edit still waiting when it stops', async () => {
    const { store, resources, answers } = writes();
    holdTokens(store, ['bear']);
    resources.write(edit(5), (taken) => answers.push(taken));
    runUntracked(store, () => store.setState((draft) => void delete draft.objects.tokens.ogre));
    holdTokens(store, []);
    await tick();
    expect(answers).toEqual([null]);

    holdTokens(store, ['bear']);
    resources.write(edit(5, 'hp', BEN, 'bear'), (taken) => answers.push(taken));
    resources.stop();
    expect(answers).toEqual([null, null]);
  });

  it('is one step with the played campaign\'s value and the character\'s other tokens, which undo takes back together', () => {
    const { store, history, resources, answers } = writes();
    runUntracked(store, () => store.setState((draft) => {
      const held = draft.objects.tokens.ogre;
      if (held !== undefined) held.assetId = 'lib-ogre';
      draft.objects.tokens.twin = token('twin', { assetId: 'lib-ogre', resources: { ...VALUES } });
    }));
    const reconciler = new PartyReconciler(store as never);
    reconciler.setContext({ campaignId: 'campaign-1', characterOf: (held) => (held.assetId === 'lib-ogre' ? 'lib-ogre' : null) });
    history.getState().clear();
    const hp = (): unknown[] => [store.getState().objects.tokens.ogre?.resources?.hp?.current, store.getState().objects.tokens.twin?.resources?.hp?.current, (store.getState() as unknown as { partyValues: Record<string, { current: number }> }).partyValues[partyKey('campaign-1', 'lib-ogre', 'hp')]?.current];

    resources.write(edit(2), (taken) => answers.push(taken));
    expect(hp()).toEqual([2, 2, 2]);
    expect(history.getState().pastStates).toHaveLength(1);
    history.getState().undo();
    expect(hp()).toEqual([7, 7, 7]);
    reconciler.destroy();
  });
});
