import { describe, expect, it } from 'vitest';
import type { Character } from '../../src/app/types';
import { initiativeEntryForToken } from '../../src/app/stores/initiativeEntries';
import { hasInitiative, setInitiative } from '../../src/app/initiative/awaitingInitiative';

const character: Character = {
  id: 'goblin', kind: 'character', name: 'Goblin', x: 10, y: 20,
  imagePath: 'goblin.webp', statblockPath: 'Creatures/Goblin.md',
};

describe('new initiative entries', () => {
  it.each([undefined, false, true])('uses the default icon with an unused flag of %s', (playerLinked) => {
    const savedToken = {
      ...character,
      ...(playerLinked !== undefined ? { playerLinked } : {}),
      playerId: 'old-player', playerCharacterId: 'old-character',
    };

    expect(initiativeEntryForToken(savedToken)).toEqual({
      tokenId: 'goblin', name: 'Goblin', imagePath: 'goblin.webp',
      statblockPath: 'Creatures/Goblin.md', initiative: 0, awaitingInitiative: true, initiativeModifier: 0,
      isNPC: true,
    });
  });
});

describe('a combatant waiting for its initiative', () => {
  it('waits from being added until a number is rolled or typed', () => {
    const entry = initiativeEntryForToken(character);
    expect(hasInitiative(entry)).toBe(false);
    const rolled = { ...entry };
    setInitiative(rolled, 0);
    expect(rolled.awaitingInitiative).toBeUndefined();
    expect(hasInitiative(rolled)).toBe(true);
  });

  it('counts the number of an entry an older version wrote, which knows nothing of waiting', () => {
    expect(hasInitiative({ initiative: 0 })).toBe(true);
    // An older version rolled over the flag it kept
    expect(hasInitiative({ initiative: 14, awaitingInitiative: true })).toBe(true);
  });
});
