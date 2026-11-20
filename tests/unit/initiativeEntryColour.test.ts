import { describe, expect, it } from 'vitest';
import { initiativeEntryForToken } from '../../src/app/stores/initiativeEntries';
import { ENEMY_COLOR } from '../../src/app/initiative/tokenlessEnemies';
import type { TokenEntity } from '../../src/app/types';

const token = (changes: Partial<TokenEntity>): TokenEntity => ({ id: 't', kind: 'token', imagePath: 'goblin.png', x: 0, y: 0, size: 1, ...changes } as TokenEntity);

describe('a token joining initiative', () => {
  it('starts in the enemies\' red where it fights the players, and without a colour on their side', () => {
    expect(initiativeEntryForToken(token({})).color).toBe(ENEMY_COLOR);
    expect(initiativeEntryForToken(token({ side: 'opponents' })).color).toBe(ENEMY_COLOR);
    expect(initiativeEntryForToken(token({ vision: { enabled: true } } as Partial<TokenEntity>)).color).toBeUndefined();
    expect(initiativeEntryForToken(token({ side: 'players' })).color).toBeUndefined();
    // A side of the collection's own is neither
    expect(initiativeEntryForToken(token({ side: 'allies' })).color).toBeUndefined();
  });
});
