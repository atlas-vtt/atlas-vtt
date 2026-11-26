// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { ATLAS_VERSION } from '../../../src/app/services/MapPersistence';
import { getDataFilePath } from '../../../src/app/utils/dataFileMigration';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const MAP = 'maps/fight.atlasmap';

const entry = (name: string, order: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: `e-${name}`, tokenId: name, name, initiative: 20 - order, initiativeModifier: 0, imagePath: `${name}.png`, isActive: false, isNPC: true, order, ...extra,
});

/** A store that opened a scene file whose initiative is `initiative`, its combatants' tokens on the map. */
async function opened(initiative: { entries: readonly Record<string, unknown>[] } & Record<string, unknown>): Promise<ViewAtlasStore> {
  const tokens = Object.fromEntries(initiative.entries.map(({ tokenId }) => [tokenId, { id: tokenId, kind: 'token', x: 0, y: 0, imagePath: `${String(tokenId)}.png` }]));
  const file = { version: ATLAS_VERSION, state: { version: ATLAS_VERSION, mapPath: MAP, objects: { tokens }, initiative } };
  const world = createInMemoryApp({ files: { [getDataFilePath(MAP)]: JSON.stringify(file) } });
  world.app.vault.getFileByPath = world.app.vault.getAbstractFileByPath as typeof world.app.vault.getFileByPath;
  const store = createViewAtlasStore(world.app, `saved-turn-place-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath(MAP);
  await store.persist.rehydrate();
  return store;
}

/** The round, who carries the turn and who sits the round out. */
function turn(store: ViewAtlasStore): string {
  const { round, entries } = store.getState().initiative;
  const sitting = entries.filter((candidate) => candidate.sitsOut).map((candidate) => candidate.name).join('') || 'nobody';
  return `round ${round}, turn at ${entries.find((candidate) => candidate.isActive)?.name ?? 'nobody'}, ${sitting} sits out`;
}

/** A fight in turn order in round 2, saved with nobody carrying the turn and its place as `currentIndex`: b sits the round out. */
const roundTwo = (currentIndex: unknown, carrier?: string): Promise<ViewAtlasStore> => opened({
  entries: [entry('a', 0, carrier === 'a' ? { isActive: true } : {}), entry('b', 1, { sitsOut: true }), entry('c', 2)],
  ...(currentIndex !== undefined && { currentIndex }), round: 2, isActive: true, satOut: { 2: ['e-a'] },
});

afterEach(() => vi.restoreAllMocks());

describe('the place of the turn in a saved fight', () => {
  it('past the last combatant: Next begins a new round, whose marks clear', async () => {
    const store = await roundTwo(3);
    store.getState().nextTurn();
    expect(turn(store)).toBe('round 3, turn at a, nobody sits out');
    expect(store.getState().initiative.satOut).toEqual({ 2: ['e-a'], 3: ['e-b'] });
  });

  it('past the last combatant of a fight by cards: Next deals the new round', async () => {
    const store = await opened({
      entries: [entry('a', 0, { card: 1 }), entry('b', 1, { card: 2 })],
      currentIndex: 2, round: 1, isActive: true, cards: { deck: 10, eachRound: true, kept: { 1: { 'e-a': 1, 'e-b': 2 } } },
    });
    // This shuffle deals 2 and 3: the new round's cards differ from the first round's
    vi.spyOn(Math, 'random').mockReturnValue(0);
    store.getState().nextTurn();
    const { round, entries } = store.getState().initiative;
    expect([round, entries.map(({ name, card, isActive }) => `${name}:${card}${isActive ? '*' : ''}`).join(' ')]).toEqual([2, 'a:2* b:3']);
  });

  it('that an earlier Atlas left waiting at a delayed combatant goes on from there once opened', async () => {
    const store = await opened({ entries: [entry('a', 0), entry('b', 1, { delayed: true }), entry('c', 2)], currentIndex: 1, round: 1, isActive: true });
    store.getState().nextTurn();
    expect(turn(store)).toBe('round 1, turn at c, nobody sits out');
  });

  // The steps the version before the turn was held by one entry took from these places. Where its
  // steps threw on a place, they go from no place, or past the last combatant from the last one;
  // from just past the last one, its Previous gave the last combatant the turn again.
  it.each([
    [-1, 'round 2, turn at a, b sits out', 'round 1, turn at c, a sits out'],
    [0, 'round 2, turn at c, b sits out', 'round 1, turn at c, a sits out'],
    [1, 'round 2, turn at c, b sits out', 'round 2, turn at a, b sits out'],
    [2, 'round 3, turn at a, nobody sits out', 'round 2, turn at a, b sits out'],
    [2.5, 'round 3, turn at a, nobody sits out', 'round 2, turn at a, b sits out'],
    [3, 'round 3, turn at a, nobody sits out', 'round 2, turn at a, b sits out'],
    [7, 'round 3, turn at a, nobody sits out', 'round 2, turn at a, b sits out'],
    [null, 'round 2, turn at c, b sits out', 'round 1, turn at c, a sits out'],
    ['1', 'round 2, turn at c, b sits out', 'round 2, turn at a, b sits out'],
    [-2, 'round 2, turn at a, b sits out', 'round 1, turn at c, a sits out'],
    [0.5, 'round 2, turn at a, b sits out', 'round 1, turn at c, a sits out'],
    [1.5, 'round 2, turn at a, b sits out', 'round 1, turn at c, a sits out'],
    ['NaN', 'round 2, turn at a, b sits out', 'round 1, turn at c, a sits out'],
    [undefined, 'round 2, turn at a, b sits out', 'round 1, turn at c, a sits out'],
  ])('saved as %j: Next and Previous step from it', async (currentIndex, afterNext, afterPrevious) => {
    const forward = await roundTwo(currentIndex);
    forward.getState().nextTurn();
    const back = await roundTwo(currentIndex);
    back.getState().previousTurn();
    expect([turn(forward), turn(back)]).toEqual([afterNext, afterPrevious]);
  });

  it.each([1, 3])('saved as %j while another combatant carries the turn: that one has it', async (currentIndex) => {
    const forward = await roundTwo(currentIndex, 'a');
    forward.getState().nextTurn();
    const back = await roundTwo(currentIndex, 'a');
    back.getState().previousTurn();
    expect([turn(forward), turn(back)]).toEqual(['round 2, turn at c, b sits out', 'round 1, turn at c, a sits out']);
  });
});
