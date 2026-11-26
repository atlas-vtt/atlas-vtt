// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import type { TokenEntity } from '../../../src/app/types';
import type { InitiativeRules } from '../../../src/app/types/initiativeRulesTypes';
import { getDataFilePath } from '../../../src/app/utils/dataFileMigration';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const MAP = 'maps/fight.atlasmap';
const SIDES: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players' };
const CARDS: InitiativeRules = { mode: 'cards', roll: '1d20', firstSide: 'players', dealEachRound: true };

interface Scene {
  readonly world: InMemoryApp;
  readonly store: ViewAtlasStore;
}

/** A loaded scene at `MAP` whose combatants are `names`, numbered from 20 down in that order; `players` see. */
function scene(names: readonly string[], players: readonly string[] = []): Scene {
  const world = createInMemoryApp();
  world.app.vault.getFileByPath = world.app.vault.getAbstractFileByPath as typeof world.app.vault.getFileByPath;
  world.app.vault.getFolderByPath = world.app.vault.getAbstractFileByPath as typeof world.app.vault.getFolderByPath;
  const store = createViewAtlasStore(world.app, `saved-fight-${names.join('-')}`);
  store.setState({ mapPath: MAP, mapLoaded: true });
  const tokens: Record<string, TokenEntity> = {};
  for (const name of names) {
    tokens[name] = { id: name, kind: 'token', x: 0, y: 0, imagePath: `${name}.png`, ...(players.includes(name) && { vision: { enabled: true } }) } as TokenEntity;
  }
  store.setState((state) => ({ objects: { ...state.objects, tokens } }));
  for (const name of names) store.getState().addToInitiative({ tokenId: name, name, initiative: 0, initiativeModifier: 0, imagePath: `${name}.png`, isNPC: true });
  return { world, store };
}

const idOf = (store: ViewAtlasStore, name: string): string => store.getState().initiative.entries.find((entry) => entry.name === name)!.id;
const number = (store: ViewAtlasStore, name: string, initiative: number): void => store.getState().updateInitiativeEntry(idOf(store, name), { initiative });
const fileOf = ({ files }: InMemoryApp): string => files.get(getDataFilePath(MAP))!;

async function saved({ world, store }: Scene): Promise<string> {
  await store.flushStorage();
  return fileOf(world);
}

/** The initiative of a saved scene, as written, with each entry id given as its combatant's name: ids are random. */
function savedInitiative(file: string, store: ViewAtlasStore): string {
  let text = JSON.stringify((JSON.parse(file) as { state: { initiative: unknown } }).state.initiative);
  for (const entry of store.getState().initiative.entries) text = text.replaceAll(entry.id, entry.name);
  return text;
}

/** The scene file after Atlas opened the saved scene in another tab and saved it again. */
async function openedAndSaved(world: InMemoryApp): Promise<string> {
  const store = createViewAtlasStore(world.app, 'saved-fight-reopened');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath(MAP);
  await store.persist.rehydrate();
  store.setState({ mapLoaded: true });
  store.getState().setPersistenceEnabled(true);
  await store.flushStorage();
  return fileOf(world);
}

afterEach(() => vi.restoreAllMocks());

describe('a saved fight', () => {
  it('in turn order is written as every version reads it, and opened and saved again byte for byte', async () => {
    const fight = scene(['a', 'b', 'c', 'd']);
    const { store } = fight;
    ['a', 'b', 'c', 'd'].forEach((name, at) => number(store, name, 20 - at));
    store.getState().startCombat();
    store.getState().nextTurn();
    store.getState().setInitiativeSitsOut(idOf(store, 'd'), true);
    store.getState().delayInitiativeTurn(idOf(store, 'c'));
    store.getState().nextTurn();
    store.getState().delayInitiativeTurn(idOf(store, 'a'));
    store.getState().actNowInInitiative(idOf(store, 'a'));
    const file = await saved(fight);

    expect(savedInitiative(file, store)).toBe('{"entries":[{"tokenId":"a","name":"a","initiative":19,"initiativeModifier":0,"imagePath":"a.png","isNPC":true,"id":"a","order":0,"isActive":true,"tieBreak":0,"isDefeated":false},{"tokenId":"b","name":"b","initiative":19,"initiativeModifier":0,"imagePath":"b.png","isNPC":true,"id":"b","order":1,"isActive":false,"isDefeated":false},{"tokenId":"c","name":"c","initiative":18,"initiativeModifier":0,"imagePath":"c.png","isNPC":true,"id":"c","order":2,"isActive":false,"delayed":true,"isDefeated":false},{"tokenId":"d","name":"d","initiative":17,"initiativeModifier":0,"imagePath":"d.png","isNPC":true,"id":"d","order":3,"isActive":false,"isDefeated":false}],"currentIndex":0,"round":2,"isActive":true,"satOut":{"2":["d"]}}');
    expect(await openedAndSaved(fight.world)).toBe(file);
  });

  it('by sides is written as every version reads it, and opened and saved again byte for byte', async () => {
    const fight = scene(['hero', 'goblin', 'rat'], ['hero']);
    const { store } = fight;
    store.getState().startCombat(SIDES);
    store.getState().nextTurn();
    store.getState().nextTurn();
    const file = await saved(fight);

    expect(savedInitiative(file, store)).toBe('{"entries":[{"tokenId":"hero","name":"hero","initiative":0,"initiativeModifier":0,"imagePath":"hero.png","isNPC":true,"id":"hero","order":0,"isActive":false,"isDefeated":false},{"tokenId":"goblin","name":"goblin","initiative":0,"initiativeModifier":0,"imagePath":"goblin.png","isNPC":true,"id":"goblin","order":1,"isActive":false,"isDefeated":false},{"tokenId":"rat","name":"rat","initiative":0,"initiativeModifier":0,"imagePath":"rat.png","isNPC":true,"id":"rat","order":2,"isActive":false,"isDefeated":false}],"currentIndex":-1,"round":2,"isActive":true,"sides":{"first":"players","active":"players"}}');
    expect(await openedAndSaved(fight.world)).toBe(file);
  });

  it('by cards is written as every version reads it, and opened and saved again byte for byte', async () => {
    const fight = scene(['a', 'b', 'c']);
    const { store } = fight;
    // A deck that is never shuffled: it deals 1, 2, 3 in order
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    store.getState().startCombat(CARDS);
    store.getState().nextTurn();
    store.getState().nextTurn();
    store.getState().nextTurn();
    store.getState().nextTurn();
    const file = await saved(fight);

    expect(savedInitiative(file, store)).toBe('{"entries":[{"tokenId":"a","name":"a","initiative":0,"initiativeModifier":0,"imagePath":"a.png","isNPC":true,"id":"a","order":0,"isActive":false,"card":1,"isDefeated":false},{"tokenId":"b","name":"b","initiative":0,"initiativeModifier":0,"imagePath":"b.png","isNPC":true,"id":"b","order":1,"isActive":true,"card":2,"isDefeated":false},{"tokenId":"c","name":"c","initiative":0,"initiativeModifier":0,"imagePath":"c.png","isNPC":true,"id":"c","order":2,"isActive":false,"card":3,"isDefeated":false}],"currentIndex":1,"round":2,"isActive":true,"cards":{"deck":10,"eachRound":true,"kept":{"1":{"a":1,"b":2,"c":3}}}}');
    expect(await openedAndSaved(fight.world)).toBe(file);
  });

  it('that ended, or never started, is written as every version reads it', async () => {
    const waiting = scene(['a', 'b']);
    const file = await saved(waiting);
    expect(savedInitiative(file, waiting.store)).toBe('{"entries":[{"tokenId":"a","name":"a","initiative":0,"initiativeModifier":0,"imagePath":"a.png","isNPC":true,"id":"a","order":0,"isActive":true,"isDefeated":false},{"tokenId":"b","name":"b","initiative":0,"initiativeModifier":0,"imagePath":"b.png","isNPC":true,"id":"b","order":1,"isActive":false,"isDefeated":false}],"currentIndex":-1,"round":0,"isActive":false}');
    expect(await openedAndSaved(waiting.world)).toBe(file);

    const ended = scene(['a', 'b']);
    number(ended.store, 'a', 5);
    number(ended.store, 'b', 9);
    ended.store.getState().startCombat();
    ended.store.getState().nextTurn();
    ended.store.getState().endCombat();
    expect(savedInitiative(await saved(ended), ended.store)).toBe('{"entries":[{"tokenId":"b","name":"b","initiative":9,"initiativeModifier":0,"imagePath":"b.png","isNPC":true,"id":"b","order":0,"isActive":false,"isDefeated":false},{"tokenId":"a","name":"a","initiative":5,"initiativeModifier":0,"imagePath":"a.png","isNPC":true,"id":"a","order":1,"isActive":false,"isDefeated":false}],"currentIndex":-1,"round":0,"isActive":false}');
  });

  it('waiting at a combatant that delayed while nobody else could act is written as every version reads it', async () => {
    const fight = scene(['a', 'b', 'c']);
    const { store } = fight;
    ['a', 'b', 'c'].forEach((name, at) => number(store, name, 20 - at));
    store.getState().updateInitiativeEntry(idOf(store, 'a'), { hiddenFromPlayers: true });
    store.getState().updateInitiativeEntry(idOf(store, 'b'), { hiddenFromPlayers: true });
    store.getState().startCombat();
    store.getState().delayInitiativeTurn(idOf(store, 'c'));
    const file = await saved(fight);

    expect(savedInitiative(file, store)).toBe('{"entries":[{"tokenId":"a","name":"a","initiative":20,"initiativeModifier":0,"imagePath":"a.png","isNPC":true,"id":"a","order":0,"isActive":false,"hiddenFromPlayers":true,"isDefeated":false},{"tokenId":"b","name":"b","initiative":19,"initiativeModifier":0,"imagePath":"b.png","isNPC":true,"id":"b","order":1,"isActive":false,"hiddenFromPlayers":true,"isDefeated":false},{"tokenId":"c","name":"c","initiative":18,"initiativeModifier":0,"imagePath":"c.png","isNPC":true,"id":"c","order":2,"isActive":false,"delayed":true,"isDefeated":false}],"currentIndex":2,"round":1,"isActive":true}');
    expect(await openedAndSaved(fight.world)).toBe(file);
  });
});
