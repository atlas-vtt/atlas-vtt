import { describe, expect, it } from 'vitest';
import { filterAssets, filterFolders, matchingAssets, type AssetFilter } from '../../src/app/packages/components/asset-manager/utils/assetFilter';
import type { AnyAsset, Folder, TokenAsset } from '../../src/app/packages/components/asset-manager/types';

const token = (name: string, folderId: string | null, tags: string[] = []): TokenAsset => ({
  id: name, name, type: 'tokens', imageUrl: '', modifiedAt: 0, folderId, tags,
});
const folder = (id: string, parentId: string | null): Folder => ({ id, name: id, type: 'tokens', parentId, path: id });
const names = (assets: AnyAsset[]): string[] => assets.map((asset) => asset.name);

// root ─ Goblin
//  ├ monsters ─ Wolf
//  │  └ undead ─ Ghoul
//  └ npcs ─ Innkeeper
const folders = [folder('monsters', null), folder('undead', 'monsters'), folder('npcs', null)];
const assets = [
  token('Goblin', null, ['Forest']),
  token('Wolf', 'monsters', ['Forest', 'Beast']),
  token('Ghoul', 'undead', ['forest-id']),
  token('Innkeeper', 'npcs'),
];
const forest = { id: 'forest-id', name: 'Forest' };
const filter = (overrides: Partial<AssetFilter>): AssetFilter => ({ tab: 'tokens', folderId: null, search: '', tags: [], ...overrides });

describe('filterAssets', () => {
  it('lists only the open folder while nothing narrows the list', () => {
    expect(names(filterAssets(assets, filter({})))).toEqual(['Goblin']);
    expect(names(filterAssets(assets, filter({ folderId: 'monsters' })))).toEqual(['Wolf']);
  });

  it('finds tagged assets in every folder of the tab, wherever the GM stands', () => {
    expect(names(filterAssets(assets, filter({ tags: [forest] })))).toEqual(['Goblin', 'Wolf', 'Ghoul']);
    expect(names(filterAssets(assets, filter({ folderId: 'undead', tags: [forest] })))).toEqual(['Goblin', 'Wolf', 'Ghoul']);
  });

  it('lists every folder of the tab while other filters narrow the list', () => {
    expect(names(filterAssets(assets, filter({ folderId: 'monsters', narrowed: true })))).toEqual(['Goblin', 'Wolf', 'Ghoul', 'Innkeeper']);
    expect(filterFolders(folders, filter({ narrowed: true }))).toEqual([]);
  });

  it('searches every folder of the tab, and takes a search of blanks for none', () => {
    expect(names(filterAssets(assets, filter({ search: 'o' })))).toEqual(['Goblin', 'Wolf', 'Ghoul']);
    expect(names(filterAssets(assets, filter({ folderId: 'monsters', search: 'o' })))).toEqual(['Goblin', 'Wolf', 'Ghoul']);
    expect(names(filterAssets(assets, filter({ folderId: 'monsters', search: '  ' })))).toEqual(['Wolf']);
  });

  it('requires every selected tag and the search', () => {
    expect(names(filterAssets(assets, filter({ tags: [forest, { id: 'beast', name: 'Beast' }] })))).toEqual(['Wolf']);
    expect(names(filterAssets(assets, filter({ tags: [forest], search: 'gh' })))).toEqual(['Ghoul']);
  });
});

describe('matchingAssets', () => {
  it('is what a filter shows, from every folder, also while nothing narrows the list yet', () => {
    expect(names(matchingAssets(assets, filter({ folderId: 'monsters' })))).toEqual(['Goblin', 'Wolf', 'Ghoul', 'Innkeeper']);
    expect(names(matchingAssets(assets, filter({ folderId: 'npcs', tags: [forest] })))).toEqual(names(filterAssets(assets, filter({ folderId: 'npcs', tags: [forest] }))));
  });
});

describe('filterFolders', () => {
  it('shows the open folder\'s subfolders and hides them while a search or tag filters', () => {
    expect(filterFolders(folders, filter({})).map((f) => f.id)).toEqual(['monsters', 'npcs']);
    expect(filterFolders(folders, filter({ tags: [forest] }))).toEqual([]);
    expect(filterFolders(folders, filter({ search: 'wolf' }))).toEqual([]);
  });
});
