import { describe, expect, it } from 'vitest';
import { characterOf, characterOfNote } from '../../../src/app/characters/playerCharacters';
import type { TokenAsset } from '../../../src/app/services/AssetService';

const token = (id: string, createdAt: number, extra: Partial<TokenAsset> = {}): TokenAsset =>
  ({ id, type: 'token', name: id, imagePath: `${id}.webp`, tags: [], collection: 'c', createdAt, modifiedAt: createdAt, ...extra }) as TokenAsset;

const DRUID = token('druid', 10, { playerCharacter: true, statblockPath: 'Party/Ash.md' });
const BEAR = token('bear', 20, { playerCharacter: true, statblockPath: 'Party/Ash.md' });
const WOLF = token('wolf', 5, { playerCharacter: false, statblockPath: 'Party/Ash.md' });
const LONER = token('loner', 30, { playerCharacter: true });
const GOBLIN = token('goblin', 1, { statblockPath: 'Bestiary/Goblin.md' });
const TOKENS = [BEAR, DRUID, WOLF, LONER, GOBLIN];

describe('which character a library token stands for', () => {
  it('is, for every player character linking one note, the first of them made: its forms are one character', () => {
    expect(characterOf(BEAR, TOKENS)?.id).toBe('druid');
    expect(characterOf(DRUID, TOKENS)?.id).toBe('druid');
    expect(characterOfNote(TOKENS, 'Party/Ash.md')?.id).toBe('druid');
  });

  it('is the token itself for a player character without a note, and none for any other token', () => {
    expect(characterOf(LONER, TOKENS)?.id).toBe('loner');
    expect(characterOf(WOLF, TOKENS)).toBeNull();
    expect(characterOf(GOBLIN, TOKENS)).toBeNull();
    expect(characterOfNote(TOKENS, 'Bestiary/Goblin.md')).toBeNull();
  });
});
