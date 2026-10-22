import { afterEach, expect, it } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { ENCOUNTER_THUMBNAIL_DIR } from '../../src/app/encounters/encounterThumbnailFile';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => AssetService.resetInstance());

const A = `${ENCOUNTER_THUMBNAIL_DIR}/encounter-1.png`;
const B = `${ENCOUNTER_THUMBNAIL_DIR}/encounter-2.png`;

it('trashes an encounter\'s thumbnail with it, unless a copy still shows the same file', async () => {
  const vault = createInMemoryApp({ files: { [A]: 'png', [B]: 'png' } });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  const collection = AssetService.defaultCollectionId();
  const url = (path: string): string => `app://vault/${path}?1792500000000`;
  const make = (thumbnail: string): ReturnType<AssetService['createEncounter']> =>
    assets.createEncounter({ name: 'Ambush', collection, tokens: [], tags: [], thumbnailUrl: url(thumbnail) });

  const original = await make(A);
  const copy = await make(A);
  const other = await make(B);

  await assets.deleteAsset(other.id);
  expect(vault.files.has(B)).toBe(false);

  await assets.deleteAsset(original.id);
  expect(vault.files.has(A)).toBe(true);

  await assets.deleteAsset(copy.id);
  expect(vault.files.has(A)).toBe(false);
});
