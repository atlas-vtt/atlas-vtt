import { describe, expect, it, vi } from 'vitest';
import type { RulesLookup } from '../../src/app/gameSystems/mapRules';
import type { TokenEntity } from '../../src/app/types';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../src/app/types/initiativeTypes';

const collection = vi.hoisted(() => ({ initiative: undefined as unknown }));
vi.mock('../../src/app/resources/collectionResources', () => ({ mapResources: () => [] }));
vi.mock('../../src/app/gameSystems/mapRules', () => ({ rulesForMap: () => ({ settings: { initiative: collection.initiative } }), mapConditions: () => [] }));

import { sharedInitiative } from '../../src/app/online/gm/initiativeInputs';
import { parseInitiative } from '../../src/app/online/protocol/initiative';

const ALLIES = { id: 'side-allies', name: 'Allies' };
const THREE: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players', sides: [{ id: 'players' }, ALLIES, { id: 'opponents' }], sideRoll: '1d6' };

const token = (id: string, extra: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: '', ...extra } as TokenEntity);
const entry = (tokenId: string, order: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: tokenId, tokenId, name: tokenId, initiative: 0, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order, ...extra,
});

function share(initiative: InitiativeState, tokens: Record<string, TokenEntity>) {
  return sharedInitiative({
    state: { initiativeTrackerOpen: true, mapPath: 'map.atlasmap', initiative, objects: { tokens } },
    shown: true,
    showNames: true,
    rules: {} as RulesLookup,
    art: () => null,
  });
}

describe("the online players' list of a fight by sides with sides of the collection's own", () => {
  collection.initiative = THREE;
  const list = share(
    {
      ...createDefaultInitiativeState(), isActive: true, round: 1,
      sides: { first: 'players', active: 'players', order: THREE.sides!, roll: '1d6', rolls: { 1: { players: 4, 'side-allies': 4, opponents: 2 } } },
      entries: [entry('hero', 0), entry('hireling', 1), entry('ogre', 2)],
    },
    { hero: token('hero', { vision: { enabled: true } }), hireling: token('hireling', { side: 'side-allies' }), ogre: token('ogre') },
  );

  it('sends every side in the order it acts, with its roll and whether it has the turn', () => {
    expect(list?.sides).toEqual([
      { id: 'players', name: 'Players', roll: 4, turn: true },
      { id: 'side-allies', name: 'Allies', roll: 4, turn: true },
      { id: 'opponents', name: 'Opponents', roll: 2, turn: false },
    ]);
    expect(list?.activeSide).toBe('players');
  });

  it('names a named side\'s combatants by its id, and groups them with the opponents for older pages', () => {
    expect(list?.combatants.map((c) => [c.name, c.side, c.sideId])).toEqual([['hero', 'players', undefined], ['hireling', 'opponents', 'side-allies'], ['ogre', 'opponents', undefined]]);
  });

  it('reads the message back, and leaves out sides it cannot read rather than the list', () => {
    expect(parseInitiative(JSON.parse(JSON.stringify(list)))).toEqual(list);
    const broken = { ...JSON.parse(JSON.stringify(list)), sides: [{ id: '', name: 'x', roll: null, turn: false }] };
    expect(parseInitiative(broken)).not.toHaveProperty('sides');
    expect(parseInitiative(broken)?.combatants).toHaveLength(3);
    const older = JSON.parse(JSON.stringify(list)) as Record<string, unknown>;
    delete older.sides;
    expect(parseInitiative(older)).not.toHaveProperty('sides');
  });
});

describe("the online players' list of a fight by cards", () => {
  it('sends the cards where the numbers stand, so older pages show them too, and says they are cards', () => {
    collection.initiative = { mode: 'cards', roll: '1d20', firstSide: 'players' } satisfies InitiativeRules;
    const list = share(
      { ...createDefaultInitiativeState(), isActive: true, round: 1, cards: { deck: 10 }, entries: [entry('a', 0, { card: 3, initiative: 17, isActive: true }), entry('b', 1, { card: 7, awaitingInitiative: true }), entry('c', 2, { initiative: 12 })] },
      { a: token('a'), b: token('b'), c: token('c') },
    );
    expect(list?.byCards).toBe(true);
    // Numbered once a card is dealt, whatever number the entry holds
    expect(list?.combatants.map((c) => [c.initiative, c.turn, c.unnumbered])).toEqual([[3, true, undefined], [7, false, undefined], [0, false, true]]);
    expect(parseInitiative(JSON.parse(JSON.stringify(list)))).toEqual(list);
  });
});
