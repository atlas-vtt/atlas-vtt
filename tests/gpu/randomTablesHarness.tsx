import React from 'react';
import { render } from '@testing-library/react';
import type { App } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';
import { RandomTables } from '../../src/app/react/components/randomTables/RandomTablesPanel';
import { AssetService } from '../../src/app/services/AssetService';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import { DASHBOARD_THEME } from './dashboardTheme';
import { AURIFEX_NOTE } from '../fixtures/tableNotes';

/** Obsidian's theme colours the cards and chips read, beside the dashboard's variables. */
export const TABLES_THEME = `${DASHBOARD_THEME}
  .theme-light { --color-orange: #ec7500; --color-yellow: #e0ac00; --color-green: #08b94e; --color-blue: #086ddd; --color-purple: #7852ee; --link-color: hsl(258, 88%, 66%); --background-secondary-alt: var(--color-base-05); }
  .theme-dark { --color-orange: #e9973f; --color-yellow: #e0de71; --color-green: #44cf6e; --color-blue: #027aff; --color-purple: #a882ff; --link-color: hsl(255, 89.8%, 75.9%); --background-secondary-alt: var(--color-base-05); }
  .atlas-tables-map { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: var(--background-secondary); }
`;

/** A Cairn collection's notes: tables as GMs write them, and a master table over the loot base's views. */
export const TABLE_FILES: Record<string, string> = {
  '5e/Magic items.base': 'views:\n  - type: table\n    name: Magic\n',
  'Cairn/Items.base': 'views:\n  - type: table\n    name: Weapons\n  - type: table\n    name: Armor\n  - type: table\n    name: Tools\n',
  'Adventures/A Most Potent Brew.md': `## Rumours in the Taproom

| d6 | Rumour | True? |
| --- | --- | --- |
| 1 | "The brewery was built on the stones of a wizard's tower." | Yes |
| 2 | "Hilda waters her ale down with holy water." | No |
| 3 | "The old wizard kept a pet that ate fire." | Yes |
| 4 | "The rats are a curse from the rival brewery." | No |
| 5 | "Workers hear crackling behind the cellar wall." | Yes |
| 6 | "Whatever's down there spits flame." | Partly |

## Cellar encounters

| d6 | Encounter |
| --- | --- |
| 1 | Two giant rats fighting over a dead centipede |
| 2 | A brewery cat, Mustard, who hisses at hidden things |
| 3 | Ale seeps through the ceiling; the smell draws a swarm of rats |
| 4 | A ghostly whisper repeats the first line of the riddle |
| 5 | A loose flagstone hides a 10 ft. fall into a cistern with \`2d6\` gp |
| 7 | Nothing but warm air and a faint crackling |
`,
  'Cairn/Treasure hoard.md': `## Treasure hoard

| d6 | Find |
| --- | --- |
| 1-3 | [[Cairn/Items.base#Tools]] |
| 4-5 | [[Cairn/Items.base#Weapons]] |
| 6 | [[Cairn/Items.base#Armor]] |
`,
  'Cairn/Backgrounds/Aurifex.md': AURIFEX_NOTE,
  'Cairn/NPC traits.md': '## Traits\n\n| d20 | Trait |\n| --- | --- |\n' + Array.from({ length: 20 }, (_, i) => `| ${i + 1} | Trait ${i + 1} |`).join('\n') + '\n',
};

export const TABLE_SETTINGS: Partial<CollectionSettings> = {
  lootBases: ['Cairn/Items.base'],
  lootCurrency: 'gp',
  randomTables: [
    { path: 'Cairn/Treasure hoard.md', table: 'Treasure hoard', index: 0, kind: 'items' },
    { path: 'Adventures/A Most Potent Brew.md', table: 'Rumours in the Taproom', index: 0, kind: 'text', hiddenColumns: ['True?'] },
    { path: 'Adventures/A Most Potent Brew.md', table: 'Cellar encounters', index: 1, kind: 'text' },
    { path: 'Cairn/NPC traits.md', table: 'Traits', index: 0, kind: 'text' },
  ],
};

/** A 5e collection's magic items, painted by the collection's own rarity words, one of them its own. */
export const RARITY_SETTINGS: Partial<CollectionSettings> = {
  lootBases: ['5e/Magic items.base'],
  lootCurrency: 'gp',
  itemRarities: [
    { name: 'Common', tone: 'common' },
    { name: 'Uncommon', tone: 'uncommon' },
    { name: 'Rare', tone: 'rare' },
    { name: 'Very rare', tone: 'epic' },
    { name: 'Legendary', tone: 'legendary' },
    { name: 'Heirloom', tone: 'legendary' },
  ],
};

export interface TablesWindow {
  app: App;
  store: ViewAtlasStore;
}

/** The window open over a map view of the Cairn collection, in `theme`, at `size` or its default size. */
export async function mountTablesWindow(theme: 'light' | 'dark', size?: { width: number; height: number }, settings = TABLE_SETTINGS): Promise<TablesWindow> {
  document.body.className = `theme-${theme}`;
  const { app } = createInMemoryApp({ files: TABLE_FILES });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const collectionId = assets.getDefaultCollectionId();
  await assets.updateCollectionSettings(collectionId, settings);
  const store = createViewAtlasStore(app, `random-tables-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ mapPath: `atlas-vtt/collections/${collectionId}/scenes/Cellar.atlasmap` });
  store.getState().updateLootRoller({ position: { x: 16, y: 16 }, ...(size && { size }) });
  store.getState().setLootRollerOpen(true);
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}>
        <ContextMenuProvider>
          <div className="atlas-vtt-plugin atlas-tables-map"><RandomTables /></div>
        </ContextMenuProvider>
      </ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { app, store };
}
