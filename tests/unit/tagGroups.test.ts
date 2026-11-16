import { expect, it } from 'vitest';
import type { Asset } from '../../src/app/services/AssetService';
import { groupLegacyTags, tagGroupOf } from '../../src/app/services/tagGroups';
import { tagChangesForAssets, tagGroupOfTab, tagPickerOptions, toggleAssetTag } from '../../src/app/packages/components/asset-manager/utils/assetTags';

const asset = (type: Asset['type'], tags: string[]): Asset => ({ id: type, name: type, type, tags, collection: 'default', createdAt: 0, modifiedAt: 0 }) as Asset;

it('groups tokens with encounters and maps with scenes', () => {
  expect([tagGroupOf('token'), tagGroupOf('encounter'), tagGroupOf('map'), tagGroupOf('scene'), tagGroupOf('note')])
    .toEqual(['tokens', 'tokens', 'maps', 'maps', null]);
  expect([tagGroupOfTab('tokens'), tagGroupOfTab('encounters'), tagGroupOfTab('maps'), tagGroupOfTab('scenes')])
    .toEqual(['tokens', 'tokens', 'maps', 'maps']);
});

it('leaves grouped tags alone and groups older tags by the assets that carry them', () => {
  const grouped = { 'maps:forest': { id: 'forest', name: 'Forest', group: 'maps' as const } };
  expect(groupLegacyTags(grouped, [])).toBeNull();

  const legacy = { boss: { id: 'boss', name: 'Boss' }, ...grouped };
  expect(groupLegacyTags(legacy, [asset('encounter', ['boss'])])).toEqual({
    'tokens:boss': { id: 'boss', name: 'Boss', group: 'tokens' },
    ...grouped,
  });
});

it('adds a tag by name and removes it whether it was stored by id or name', () => {
  const tag = { id: 'big-dragon', name: 'Big Dragon' };
  expect(toggleAssetTag(undefined, tag)).toEqual(['Big Dragon']);
  expect(toggleAssetTag(['big-dragon', 'beast'], tag)).toEqual(['beast']);
  expect(toggleAssetTag(['Big Dragon'], tag)).toEqual([]);
});

it('gives a tag to the assets that lack it until all hold it, and only then takes it from all', () => {
  const tag = { id: 'big-dragon', name: 'Big Dragon' };
  const [byName, byId, bare] = [
    { ...asset('token', ['Big Dragon', 'boss']), id: 'by-name' },
    { ...asset('token', ['big-dragon']), id: 'by-id' },
    { ...asset('token', ['beast']), id: 'bare' },
  ] as const;
  expect(tagChangesForAssets([byName, byId, bare] as never, tag)).toEqual([{ asset: bare, tags: ['beast', 'Big Dragon'] }]);
  expect(tagChangesForAssets([byName, byId] as never, tag)).toEqual([
    { asset: byName, tags: ['boss'] },
    { asset: byId, tags: [] },
  ]);
});

it('lists matching tags with the pinned ones first', () => {
  const tags = [{ id: 'c', name: 'Cave' }, { id: 'a', name: 'Arctic' }, { id: 'b', name: 'Beach' }];
  expect(tagPickerOptions(tags, new Set(['c']), '').map((tag) => tag.name)).toEqual(['Cave', 'Arctic', 'Beach']);
  expect(tagPickerOptions(tags, new Set(), ' A ').map((tag) => tag.name)).toEqual(['Arctic', 'Beach', 'Cave']);
  expect(tagPickerOptions(tags, new Set(), 'ea').map((tag) => tag.name)).toEqual(['Beach']);
});
