// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useAssetTags } from '../../src/app/packages/components/asset-manager/token-creator/useAssetTags';
import type { AssetService } from '../../src/app/services/AssetService';
import type { TagMetadata } from '../../src/app/services/AssetService';

const registered: Record<string, TagMetadata[]> = {
  Dungeons: [{ id: 'cave', name: 'Cave', group: 'maps' }, { id: 'boss', name: 'Boss', group: 'maps' }],
  Wilds: [{ id: 'forest', name: 'Forest', group: 'maps' }],
};
const service = {
  getCollectionTags: vi.fn(async (collection: string): Promise<TagMetadata[]> => registered[collection] ?? []),
} as unknown as AssetService;

afterEach(cleanup);

it('offers the tags the chosen collection registers, sorted by name', async () => {
  const { result } = renderHook(() => useAssetTags(service, true, 'Dungeons', 'maps'));

  await waitFor(() => expect(result.current.tags).toEqual(['Boss', 'Cave']));
  expect(service.getCollectionTags).toHaveBeenCalledWith('Dungeons', 'maps');
});

it('follows the collection the creator switches to', async () => {
  const { result, rerender } = renderHook(({ collection }) => useAssetTags(service, true, collection, 'maps'), {
    initialProps: { collection: 'Dungeons' },
  });
  await waitFor(() => expect(result.current.tags).toEqual(['Boss', 'Cave']));

  rerender({ collection: 'Wilds' });

  await waitFor(() => expect(result.current.tags).toEqual(['Forest']));
});
