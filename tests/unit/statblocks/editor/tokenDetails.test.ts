import { describe, expect, it } from 'vitest';
import { tokenDetails } from '../../../../src/app/statblocks/editor/token-socket/tokenDetails';
import type { CardToken } from '../../../../src/app/statblocks/editor/token-socket/useNoteTokens';

const token = (id: string, name: string, extra: Partial<CardToken> = {}): CardToken => ({ id, name, type: 'tokens', imageUrl: '', ...extra } as CardToken);

describe('telling same-named tokens apart', () => {
  it('names the statblock or the art file of tokens that share a name, and nothing for the others', () => {
    const details = tokenDetails([
      token('a', 'Aboleth', { statblockPath: 'Bestiary/Aboleth Elder.md' }),
      token('b', 'Aboleth', { imagePath: 'art/aboleth-young.webp' }),
      token('c', 'Goblin', { imagePath: 'art/goblin.webp' }),
    ]);
    expect(details.get('a')).toBe('on Aboleth Elder');
    expect(details.get('b')).toBe('aboleth-young');
    expect(details.has('c')).toBe(false);
  });
});
