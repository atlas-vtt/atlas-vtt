import { describe, expect, it, vi } from 'vitest';
import type { RulesLookup } from '../../src/app/gameSystems/mapRules';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';

vi.mock('../../src/app/resources/collectionResources', () => ({ mapResources: () => [] }));
vi.mock('../../src/app/gameSystems/mapRules', () => ({ rulesForMap: () => ({ settings: null }), mapConditions: () => [] }));

import { sharedInitiative } from '../../src/app/online/gm/initiativeInputs';
import { parseInitiative } from '../../src/app/online/protocol/initiative';

const token = (id: string): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: '' });
const entry = (tokenId: string, order: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: tokenId, tokenId, name: tokenId, initiative: 0, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order, ...extra,
});

describe('online players and a combatant without a number yet', () => {
  const list = sharedInitiative({
    state: {
      initiativeTrackerOpen: true,
      mapPath: 'map.atlasmap',
      initiative: {
        ...createDefaultInitiativeState(),
        entries: [entry('ogre', 0, { initiative: 12 }), entry('rat', 1, { awaitingInitiative: true }), entry('slime', 2)],
      },
      objects: { tokens: { ogre: token('ogre'), rat: token('rat'), slime: token('slime') } },
    },
    shown: true,
    showNames: false,
    rules: {} as RulesLookup,
    art: () => null,
  });

  it('are told which combatant waits for its number, and a 0 rolled or saved by an older Atlas is a number', () => {
    expect(list?.combatants.map((combatant) => [combatant.initiative, combatant.unnumbered])).toEqual([[12, undefined], [0, true], [0, undefined]]);
  });

  it('read the flag back, and read anything but `true` from a GM as a number', () => {
    expect(parseInitiative(JSON.parse(JSON.stringify(list)))).toEqual(list);
    const odd = JSON.parse(JSON.stringify(list)) as { combatants: Array<Record<string, unknown>> };
    odd.combatants[1]!.unnumbered = 'yes';
    expect(parseInitiative(odd)?.combatants[1]).not.toHaveProperty('unnumbered');
  });
});
