import { describe, expect, it } from 'vitest';
import { nearestShownFolder, withoutPartyOnlyFolders } from '../../src/app/packages/components/asset-manager/utils/partyFolders';
import type { Folder } from '../../src/app/packages/components/asset-manager/types';

const folder = (id: string, parentId: string | null = null): Folder => ({ id, name: id, type: 'tokens', path: id, parentId });

describe('folders of the Characters tab', () => {
  const folders = [folder('Campaign'), folder('Heroes', 'Campaign'), folder('Villains', 'Campaign'), folder('Allies'), folder('Empty')];

  it('leaves out a folder, and its parents, that only player characters fill', () => {
    const nested = [folder('Campaign'), folder('Heroes', 'Campaign'), folder('Allies')];
    const shown = withoutPartyOnlyFolders(nested, [{ folderId: 'Allies' }], new Set(['Heroes']));
    expect(shown.map((f) => f.id)).toEqual(['Allies']);
  });

  it('keeps a parent whose other folder stays, even when that one is empty', () => {
    const shown = withoutPartyOnlyFolders(folders, [{ folderId: 'Allies' }], new Set(['Heroes']));
    expect(shown.map((f) => f.id)).toEqual(['Campaign', 'Villains', 'Allies', 'Empty']);
  });

  it('keeps every folder that also holds another token, in it or below it', () => {
    const shown = withoutPartyOnlyFolders(folders, [{ folderId: 'Villains' }, { folderId: 'Heroes' }], new Set(['Heroes', 'Allies']));
    expect(shown.map((f) => f.id)).toEqual(['Campaign', 'Heroes', 'Villains', 'Empty']);
  });

  it('returns the very same list without player characters in folders', () => {
    expect(withoutPartyOnlyFolders(folders, [], new Set())).toBe(folders);
  });
});

describe('the folder an open hidden folder leads to', () => {
  const all = [folder('Campaign'), folder('Heroes', 'Campaign'), folder('Paladins', 'Heroes'), folder('Allies')];

  it('is the folder itself while it shows, or one this tab does not know', () => {
    expect(nearestShownFolder('Allies', all, all)).toBe('Allies');
    expect(nearestShownFolder('Elsewhere', all, [])).toBe('Elsewhere');
    expect(nearestShownFolder(null, all, [])).toBeNull();
  });

  it('is the nearest folder above it that shows, else the root', () => {
    expect(nearestShownFolder('Paladins', all, [all[0]!, all[3]!])).toBe('Campaign');
    expect(nearestShownFolder('Paladins', all, [all[3]!])).toBeNull();
  });
});
