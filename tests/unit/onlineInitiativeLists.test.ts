import { describe, expect, it, vi } from 'vitest';
import { HP_RESOURCE } from '../../src/app/resources/resourceDefinitions';
import type { RulesLookup } from '../../src/app/gameSystems/mapRules';
import type { TokenEntity } from '../../src/app/types';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';

const DEFINITIONS: ConditionDefinition[] = [
  { id: 'frightened', name: 'Frightened', color: '#aa2222', valued: true },
  { id: 'prone', name: 'Prone', color: '#2222aa', icon: 'skull' },
];
vi.mock('../../src/app/resources/collectionResources', () => ({ mapResources: () => [{ ...HP_RESOURCE }] }));
vi.mock('../../src/app/gameSystems/mapRules', () => ({ rulesForMap: () => ({ settings: null }), mapConditions: () => DEFINITIONS }));

import { sharedInitiative } from '../../src/app/online/gm/initiativeInputs';
import { parseInitiative } from '../../src/app/online/protocol/initiative';

const token = (id: string, extra: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'character', name: id, x: 0, y: 0, imagePath: '', ...extra } as TokenEntity);
const entry = (tokenId: string, order: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: tokenId, tokenId, name: tokenId, initiative: 10 - order, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order, ...extra,
});

function listOf(fromTurn: boolean | undefined): ReturnType<typeof sharedInitiative> {
  return sharedInitiative({
    state: {
      initiativeTrackerOpen: true,
      mapPath: 'map.atlasmap',
      initiative: { ...createDefaultInitiativeState(), isActive: true, round: 3, entries: [entry('ogre', 0), entry('rat', 1, { isActive: true }), entry('hero', 2)] },
      objects: { tokens: { ogre: token('ogre', { conditions: ['frightened', 'prone'], conditionValues: { frightened: 2 } }), rat: token('rat'), hero: token('hero') } },
    },
    shown: true,
    showNames: true,
    ...(fromTurn === undefined ? {} : { fromTurn }),
    rules: {} as RulesLookup,
    art: () => null,
  });
}

describe('the online players\' list as the GM lays it out', () => {
  it('says where the GM\'s list starts at the turn, and who acts in the next round', () => {
    const list = listOf(true);
    expect(list?.fromTurn).toBe(true);
    expect(list?.combatants.map((combatant) => [combatant.name, combatant.nextRound])).toEqual([['ogre', true], ['rat', undefined], ['hero', undefined]]);
  });

  it('sends the list in turn order and nothing more where the GM keeps it so', () => {
    for (const list of [listOf(false), listOf(undefined)]) {
      expect(list).not.toHaveProperty('fromTurn');
      expect(list?.combatants.some((combatant) => 'nextRound' in combatant)).toBe(false);
    }
  });

  it('sends the conditions the map shows players on a token, as its badges are sent', () => {
    const [ogre, rat] = listOf(true)?.combatants ?? [];
    expect(ogre?.conditions).toEqual([
      { colour: '#aa2222', glyph: { kind: 'text', text: 'F' }, value: 2 },
      { colour: '#2222aa', glyph: { kind: 'icon', icon: 'skull' }, value: null },
    ]);
    expect(rat).not.toHaveProperty('conditions');
  });

  it('reads it all back, and reads a list from an older GM, or one with conditions it cannot read, without them', () => {
    const list = listOf(true);
    expect(parseInitiative(JSON.parse(JSON.stringify(list)))).toEqual(list);

    const odd = JSON.parse(JSON.stringify(list)) as { fromTurn: unknown; combatants: Array<Record<string, unknown>> };
    odd.fromTurn = 'yes';
    odd.combatants[0]!.nextRound = 1;
    odd.combatants[0]!.conditions = [{ colour: 'red', glyph: { kind: 'text', text: 'F' }, value: null }];
    const read = parseInitiative(odd);
    expect(read).not.toHaveProperty('fromTurn');
    expect(read?.combatants[0]).not.toHaveProperty('nextRound');
    expect(read?.combatants[0]).not.toHaveProperty('conditions');
    expect(read?.combatants).toHaveLength(3);
  });
});
