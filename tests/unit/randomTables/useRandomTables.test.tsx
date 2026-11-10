// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { fakeQueries } from '../../mocks/fakeLootQueries';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { useRandomTables } from '../../../src/app/react/components/randomTables/useRandomTables';
import { AssetService } from '../../../src/app/services/AssetService';
import { BREW_NOTE } from '../../fixtures/tableNotes';

vi.mock('../../../src/app/plugin/atlasLeaves', () => ({ getLoadedAtlasView: () => null }));
vi.mock('../../../src/app/loot/lootQueryView', () => import('../../mocks/fakeLootQueries'));

beforeEach(() => {
  fakeQueries.reset();
  Reflect.set(AssetService, 'instance', null);
});

describe('the random tables of a collection', () => {
  it('lists the views of its loot bases and the tables of its notes, grouped by kind', async () => {
    const { app } = createInMemoryApp({
      files: {
        'Loot/Items.base': 'views:\n  - type: table\n    name: Weapons\n',
        'Adventures/Brew.md': BREW_NOTE,
        'Gear.md': '| Item | Price |\n| --- | --- |\n| Rope | 1 sp |\n',
      },
    });
    const assets = AssetService.getInstance(app);
    await assets.initialize();
    const collectionId = assets.getDefaultCollectionId();
    await assets.updateCollectionSettings(collectionId, {
      lootBases: ['Loot/Items.base'],
      lootCurrency: 'gp',
      randomTables: [
        { path: 'Adventures/Brew.md', table: '🗣️ Rumours in the Taproom', index: 1, kind: 'text', hiddenColumns: ['True?'] },
        { path: 'Gear.md', index: 0, kind: 'items' },
      ],
    });

    const { result } = renderHook(() => useRandomTables(app, collectionId));
    await waitFor(() => expect(fakeQueries.started).toHaveLength(1));
    fakeQueries.of('Weapons').listener.onSnapshot({ entries: [{ path: 'Items/Axe.md', name: 'Axe', values: {} }], order: [], displayNames: {} });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.items.bases.map((base) => base.views.map((view) => view.items.map((item) => item.name)))).toEqual([[['Axe']]]);
    expect(result.current.items.tables.map((table) => table.items?.map((item) => item.name))).toEqual([['Rope']]);
    expect(result.current.text.map((table) => [table.table?.name, table.table?.die?.label])).toEqual([['🗣️ Rumours in the Taproom', 'd6']]);
    expect(result.current.currency).toBe('gp');
  });
});
