import { describe, expect, it, vi } from 'vitest';
import { HP_RESOURCE } from '../../src/app/resources/resourceDefinitions';
import type { RulesLookup } from '../../src/app/gameSystems/mapRules';
import type { TokenEntity } from '../../src/app/types';
import { createDefaultInitiativeState, type InitiativeEntry } from '../../src/app/types/initiativeTypes';

vi.mock('../../src/app/resources/collectionResources', () => ({ mapResources: () => [{ ...HP_RESOURCE }] }));
vi.mock('../../src/app/gameSystems/mapRules', () => ({ rulesForMap: () => ({ settings: null }), mapConditions: () => [] }));

import { sharedInitiative } from '../../src/app/online/gm/initiativeInputs';
import { parseInitiative } from '../../src/app/online/protocol/initiative';

const token = (id: string, hp: number): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: '', resources: { hp: { current: hp, max: 10 } } });
const entry = (tokenId: string, order: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: tokenId, tokenId, name: tokenId, initiative: 10 - order, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order, ...extra,
});

describe("the online players' list of a fight", () => {
  const list = sharedInitiative({
    state: {
      initiativeTrackerOpen: true,
      mapPath: 'map.atlasmap',
      initiative: { ...createDefaultInitiativeState(), isActive: true, round: 1, entries: [entry('ogre', 0, { isActive: true }), entry('rat', 1), entry('hero', 2, { delayed: true })] },
      objects: { tokens: { ogre: token('ogre', 4), rat: token('rat', 0), hero: token('hero', 8) } },
    },
    shown: true,
    showNames: false,
    rules: {} as RulesLookup,
    art: () => null,
  });

  it('says who is defeated and who delayed, only where it is so', () => {
    expect(list?.combatants.map((combatant) => [combatant.turn, combatant.defeated, combatant.delayed])).toEqual([
      [true, undefined, undefined], [false, true, undefined], [false, undefined, true],
    ]);
  });

  it('reads the flags back, and reads a list from an older GM without them', () => {
    expect(parseInitiative(JSON.parse(JSON.stringify(list)))).toEqual(list);
    const older = JSON.parse(JSON.stringify(list)) as { combatants: Array<Record<string, unknown>> };
    for (const combatant of older.combatants) { delete combatant.defeated; delete combatant.delayed; }
    expect(parseInitiative(older)?.combatants.every((combatant) => !combatant.defeated && !combatant.delayed)).toBe(true);
    // Anything but `true` reads as unset, never as a broken message
    older.combatants[0]!.defeated = 'yes';
    expect(parseInitiative(older)?.combatants[0]).not.toHaveProperty('defeated');
  });
});
