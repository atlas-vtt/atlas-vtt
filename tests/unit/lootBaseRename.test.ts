import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/plugin/atlasLeaves', () => ({ getLoadedAtlasView: () => null }));

import { AssetService } from '../../src/app/services/AssetService';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeEach(() => Reflect.set(AssetService, 'instance', null));

describe('moving a loot base in the vault', () => {
  it('keeps the collections that roll on it pointed at its new place', async () => {
    const { app } = createInMemoryApp({ files: { 'Loot/Items.base': 'views: []' } });
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const collectionId = assets.getDefaultCollectionId();
    await assets.updateCollectionSettings(collectionId, { lootBases: ['Loot/Items.base', 'Loot/Rings.base'] });

    await new FileReferenceService(app).handleFilesMoved([
      { from: 'Loot/Items.base', to: 'Reference/Gear.base' },
      { from: 'Notes/Tavern.md', to: 'Notes/Inn.md' },
    ]);

    expect(assets.getCollectionSettings(collectionId).lootBases).toEqual(['Reference/Gear.base', 'Loot/Rings.base']);
  });

  it('keeps the collections that roll on a table note pointed at its new place, every field kept', async () => {
    const { app } = createInMemoryApp({ files: { 'Adventures/Brew.md': '' } });
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const collectionId = assets.getDefaultCollectionId();
    await assets.updateCollectionSettings(collectionId, {
      lootBases: ['Loot/Items.base'],
      randomTables: [
        { path: 'Adventures/Brew.md', table: 'Rumours', index: 1, kind: 'text', hiddenColumns: ['True?'] },
        { path: 'Weather.md', index: 0, kind: 'text' },
      ],
    });

    await new FileReferenceService(app).handleFilesMoved([{ from: 'Adventures/Brew.md', to: 'Archive/Brew.md' }]);

    const settings = assets.getCollectionSettings(collectionId);
    expect(settings.randomTables).toEqual([
      { path: 'Archive/Brew.md', table: 'Rumours', index: 1, kind: 'text', hiddenColumns: ['True?'] },
      { path: 'Weather.md', index: 0, kind: 'text' },
    ]);
    expect(settings.lootBases).toEqual(['Loot/Items.base']);
  });
});
