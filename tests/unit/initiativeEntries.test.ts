import { describe, expect, it } from 'vitest';
import type { Character } from '../../src/app/types';
import { initiativeEntryForToken } from '../../src/app/stores/initiativeEntries';

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
      statblockPath: 'Creatures/Goblin.md', initiative: 0, initiativeModifier: 0,
      isNPC: true,
    });
  });
});
