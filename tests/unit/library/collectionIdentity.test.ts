import { afterEach, describe, expect, it } from 'vitest';
import { AssetService } from '../../../src/app/services/AssetService';
import { derivedCollectionRecord } from '../../../src/app/services/collectionRecords';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

afterEach(() => AssetService.resetInstance());

describe('derivedCollectionRecord', () => {
  it('gives a collection worked out from its folder the uid it had before', () => {
    expect(derivedCollectionRecord('Default').uid).toBe('collection-2faaveaf735');
  });
});

describe('ensureOwnCollectionUid', () => {
  it('gives a collection worked out from its folder a uid no other vault shares, written to its file', async () => {
    const vault = createInMemoryApp({ folders: ['atlas-vtt/collections/Default'] });
    const assets = AssetService.getInstance(vault.app);
    await assets.initialize();
    expect((await assets.getCollection('Default'))?.uid).toBe(derivedCollectionRecord('Default').uid);

    await assets.ensureOwnCollectionUid('Default');

    const uid = (await assets.getCollection('Default'))?.uid;
    expect(uid).not.toBe(derivedCollectionRecord('Default').uid);
    expect(JSON.parse(vault.files.get('atlas-vtt/collections/Default/collection.json')!)).toMatchObject({ uid });

    await assets.ensureOwnCollectionUid('Default');
    expect((await assets.getCollection('Default'))?.uid).toBe(uid);
  });
});
