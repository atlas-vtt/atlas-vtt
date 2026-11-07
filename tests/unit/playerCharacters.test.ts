import { describe, expect, it } from 'vitest';
import { isPlayerCharacter, libraryTokenOf, playerCharactersLinking } from '../../src/app/characters/playerCharacters';
import { tokenFromFile, tokenToFile } from '../../src/app/resources/resourceFileFormat';
import type { TokenAsset } from '../../src/app/services/AssetService';
import type { Character } from '../../src/app/types';

const record = (id: string, imagePath: string, playerCharacter?: true): TokenAsset => ({
  id, type: 'token', name: id, imagePath, tags: [], collection: 'Fen', createdAt: 1, modifiedAt: 1, ...(playerCharacter && { playerCharacter }),
});

describe('the library token of a placed token', () => {
  const ranger = record('ranger', 'art/ranger.webp', true);
  const copy = record('ranger-copy', 'art/ranger-copy.webp');

  it('is the one its asset id names, else the one whose art it shows', () => {
    expect(libraryTokenOf({ assetId: 'ranger-copy', imagePath: 'art/ranger.webp' }, [ranger, copy])).toBe(copy);
    expect(libraryTokenOf({ assetId: 'gone', imagePath: 'art/ranger.webp' }, [ranger, copy])).toBe(ranger);
    expect(libraryTokenOf({ imagePath: 'loose.png' }, [ranger, copy])).toBeNull();
  });

  it('is a player character only where its record says true', () => {
    expect(isPlayerCharacter(ranger)).toBe(true);
    expect(isPlayerCharacter(copy)).toBe(false);
  });

  it('stays named through the scene file format', () => {
    const placed: Character = { id: 't1', kind: 'character', name: 'Ranger', imagePath: 'art/ranger.webp', assetId: 'ranger', x: 0, y: 0, resources: { hp: { current: 3, max: 9 } } };
    const file = tokenToFile(placed);
    expect(file).toMatchObject({ assetId: 'ranger', hp: { current: 3, max: 9 } });
    expect(tokenFromFile(file)).toMatchObject({ assetId: 'ranger' });
  });
});

describe('the player characters of a statblock note', () => {
  const linked = (id: string, name: string, statblockPath: string, playerCharacter?: true): TokenAsset => ({ ...record(id, `${id}.webp`, playerCharacter), name, statblockPath });

  it('are the player characters linking the note, by name', () => {
    const tokens = [
      linked('z', 'Zed', 'Mira.md', true),
      linked('m', 'Mira', 'Mira.md', true),
      linked('wolf', 'Wolf', 'Mira.md'),
      linked('o', 'Other', 'Other.md', true),
    ];
    expect(playerCharactersLinking(tokens, 'Mira.md').map((token) => token.id)).toEqual(['m', 'z']);
    expect(playerCharactersLinking(tokens, 'Nobody.md')).toEqual([]);
  });
});
