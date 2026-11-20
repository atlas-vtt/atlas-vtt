import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { expect } from 'vitest';
import { App } from 'obsidian';
import { Content } from '../../src/app/packages/components/asset-manager/components/Content';
import { AssetManagerWindow } from '../../src/app/packages/components/asset-manager/components/AssetManagerWindow';
import { Header } from '../../src/app/packages/components/asset-manager/components/Header';
import { LocationBar } from '../../src/app/packages/components/asset-manager/components/LocationBar';
import { Sidebar } from '../../src/app/packages/components/asset-manager/components/Sidebar';
import { ActiveFilterBar } from '../../src/app/packages/components/asset-manager/components/search/ActiveFilterBar';
import { NavigationHistory } from '../../src/app/packages/components/asset-manager/NavigationHistory';
import { CreateCollectionModal } from '../../src/app/packages/components/asset-manager/CreateCollectionModal';
import { TokenCreator } from '../../src/app/packages/components/asset-manager/TokenCreator';
import type { AnyAsset, Folder, Tab } from '../../src/app/packages/components/asset-manager/types';
import type { CreatureFilterPanel } from '../../src/app/packages/components/asset-manager/hooks/useCreatureFilters';
import { activeFilterChips } from '../../src/app/packages/components/asset-manager/search/activeFilterChips';
import { factsOf } from '../../src/app/creatures/creatureFacts';
import { evaluateCreatureFilters } from '../../src/app/creatures/creatureFilterEngine';
import { toggleExcludedOption, toggleOption, withRange } from '../../src/app/creatures/creatureSelection';
import type { IndexedCreature } from '../../src/app/creatures/CreatureIndex';
import { emptyCreatureSelection, type CreatureFilterDefinition } from '../../src/app/types/creatureFilterTypes';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { AssetService } from '../../src/app/services/AssetService';
import { SystemPresetFiles } from '../../src/app/services/systemPresets/SystemPresetFiles';
import { t } from '../../src/app/i18n';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/**
 * The library's surfaces for the text fit test, each mounted as the product shows it: the asset manager's window
 * (sidebar, header, filter chips, location, cards) with its menus and filter panel opened, the token and map
 * creators, and the dialog that creates a collection.
 */

const noop = (): void => undefined;
const settle = (ms = 300): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const query = (selector: string): HTMLElement => document.querySelector<HTMLElement>(selector)!;

const CREATURES: Record<string, IndexedCreature> = Object.fromEntries([
  ['olm', { cr: '1/4', type: 'monstrosity (amphibian)', alignment: 'chaotic evil', traits: ['Amphibious', 'Blood frenzy'], source: 'Rise of the Blood Olms' }],
  ['sexton', { cr: 3, type: 'humanoid', alignment: 'lawful neutral', traits: ['Undying devotion'], source: 'Hollow Oak' }],
  ['horned king', { cr: 12, type: 'fey', alignment: 'neutral evil', traits: ['Legendary resistance', 'Antlered crown'], source: 'Hollow Oak' }],
].map(([name, fields]) => [name as string, { path: name as string, fields: fields as Record<string, unknown>, templateId: null, meanings: {}, lookName: 'Basic 5e' }]));

/** The Characters tab's filters, in the language now set, with a range, two values picked and one excluded. */
function creaturePanel(): { panel: CreatureFilterPanel; definitions: CreatureFilterDefinition[] } {
  const definitions: CreatureFilterDefinition[] = [
    { id: 'cr', label: t('creatureFilter.cr'), kind: 'range', field: 'cr' },
    { id: 'type', label: t('creatureFilter.type'), kind: 'options', fields: ['type'], values: 'category' },
    { id: 'traits', label: t('creatureFilter.traits'), kind: 'options', fields: ['traits'] },
    { id: 'alignment', label: t('creatureFilter.alignment'), kind: 'options', fields: ['alignment'], values: 'alignment', match: 'all' },
    { id: 'source', label: t('creatureFilter.source'), kind: 'options', fields: ['source'] },
  ];
  const facts = [...Object.keys(CREATURES), 'unlinked'].map((path) => factsOf(path === 'unlinked' ? {} : { statblockPath: path }, (key) => CREATURES[key] ?? null, definitions));
  let selection = emptyCreatureSelection();
  selection = withRange(selection, 'cr', { min: 1, max: 12 });
  selection = toggleOption(selection, 'traits', 'amphibious');
  selection = toggleOption(selection, 'traits', 'blood frenzy');
  selection = toggleExcludedOption(selection, 'source', 'hollow oak');
  const result = evaluateCreatureFilters(facts, definitions, selection);
  return {
    definitions,
    panel: { definitions, selection, setSelection: noop, result, wordFacets: result.facets, activeCount: 3, pending: false },
  };
}

const LONG = 'The Horned King of the Hollow Oak, Lord of the Antlered Court';
const PIXEL = 'data:image/gif;base64,R0lGODlhAgACAIAAAP///wAAACH5BAAAAAAALAAAAAACAAIAAAIChFEAOw==';
const FOLDERS: Folder[] = ['Blue Mouth Caves', 'Underground river and its many drowned galleries', 'Olms'].map((name, index) => ({
  id: `folder-${index}`, name, type: 'tokens', path: `folder-${index}`,
}));

/** Cards of the tab with names as GMs give them, one long, the first two selected. */
function assetsOf(tab: Tab): AnyAsset[] {
  const names = [LONG, 'Blood olm', 'Sexton of the Hollow Oak', 'Mustard', 'Hilda', 'Ferryman'];
  return names.map((name, index): AnyAsset => {
    const base = { id: `${tab}-${index}`, name, thumbnailUrl: PIXEL, folderId: null, modifiedAt: 0 };
    if (tab === 'maps') return { ...base, type: 'maps', imageUrl: PIXEL, mapFilePath: 'map.webp' };
    if (tab === 'scenes') return { ...base, type: 'scenes' };
    if (tab === 'encounters') return { ...base, type: 'encounters', tokens: [], tokenPreviews: [{ url: PIXEL }, { url: PIXEL }, { url: PIXEL }] };
    return { ...base, type: 'tokens', imageUrl: PIXEL };
  });
}

function content(tab: Tab, app: App): React.ReactElement {
  return (
    <Content
      activeTab={tab} assets={assetsOf(tab)} folders={tab === 'tokens' ? FOLDERS : []} selectedAssetIds={[`${tab}-0`, `${tab}-1`]}
      selectedFolderIds={[]} selectedFolderId={null} folderDepth={0} refinement="" loading={false} showSkeleton={false}
      assetCount={6} collection="Blue Mouth Caves" collectionName="Blue Mouth Caves" failed={false} onRetry={noop}
      onAssetDelete={noop} onLinkStatblock={noop}
      onAssetSelect={noop} onAssetContextMenu={noop} onFolderSelection={noop} onFolderContextMenu={noop} onFolderDoubleClick={noop}
      onContentContextMenu={noop} onClearSelection={noop} onSelectAll={noop} onClose={noop}
      collapsedSections={{ folders: false, assets: false }} setCollapsedSections={noop}
      draggedItems={null} setDraggedItems={noop} dropTarget={null} setDropTarget={noop} onDrop={noop}
      view={null} app={app} assetService={null} spawnCounts={{ [`${tab}-0`]: 3 }} onSpawnCountChange={noop}
      scrollKey={tab} scrollMemory={{ scrollTopOf: () => 0, setScrollTop: noop }}
    />
  );
}

export type LibraryOpening = 'rest' | 'create' | 'filters' | 'collections' | 'collection-menu' | 'chips' | 'armarium';

/** The asset manager's window at `tab`, with one of its menus or panels opened. */
export async function openLibrary(tab: Tab, opening: LibraryOpening): Promise<Element> {
  const { panel, definitions } = creaturePanel();
  const tags = [{ id: 'forest', name: 'Forest' }, { id: 'undead', name: 'Undead and other restless dead' }, { id: 'beast', name: 'Beast' }];
  const chips = activeFilterChips({
    selection: panel.selection, definitions, facets: panel.result.facets, tagIds: ['undead'], tags, setSelection: noop, setTagIds: noop,
  });
  const search = { suggestionsFor: () => null, commit: (text: string) => text, chips, activeCount: chips.length, panel: tab === 'tokens' ? panel : null, reset: noop };
  const app = new App();
  render(
    <TooltipProvider>
      <div className="atlas-vtt-plugin atlas-global-asset-manager-container">
        <AssetManagerWindow isOpen onClose={noop} overlayRef={null}>
          <div className="atlas-asset-manager-container">
            <Sidebar
              selectedTagIds={['undead']} onSelectTag={noop} onClearTags={noop} countedAssets={[]} tags={tags}
              collections={[
                { id: 'Blue Mouth Caves', uid: 'a', name: 'Blue Mouth Caves', isDefault: true },
                { id: 'Lockwood Manor', uid: 'b', name: 'Lockwood Manor and the Forgotten Crypts below it', isDefault: false },
              ]}
              selectedCollection="Blue Mouth Caves" onSelectCollection={noop} onManageTags={noop}
              onEditCollectionSettings={noop} onExportCollection={noop} onImportCollection={noop} onShareCollection={noop}
            />
            <Header
              app={app} search="" onSearch={noop} query={search} activeTab={tab} onTabChange={noop}
              assetCounts={{ scenes: 12, maps: 34, encounters: 5, tokens: 412, party: 4 }}
              onCreateTokens={noop} onCreateMap={noop} onGenerateDungeon={noop} onCreateEncounter={noop} onCreateCollection={noop} onCreateFolder={noop}
              sidebarToggleLabel={t('am.hideSidebar')} onToggleSidebar={noop}
              sel={{ navigationHistory: new NavigationHistory(), handleNavigateBack: noop, handleNavigateForward: noop }}
              onShowArmarium={noop}
              armarium={opening === 'armarium' ? { onBack: noop, onReload: noop, onShare: noop, page: 'https://atlas-vtt.dev/armarium' } : undefined}
            />
            <div className="atlas-asset-manager-body">
              <div className="atlas-asset-manager-library">
                <ActiveFilterBar groups={chips} onReset={noop} />
                <LocationBar
                  activeTab={tab} path={FOLDERS} onNavigateToFolder={noop}
                  sort={{ sortBy: 'rating', sortOptions: ['name', 'date', 'type', 'rating'], setSortBy: noop, sortOrder: 'asc', setSortOrder: noop }}
                />
                <div className="atlas-asset-manager-main">{content(tab, app)}</div>
              </div>
            </div>
          </div>
        </AssetManagerWindow>
      </div>
    </TooltipProvider>,
  );
  await expect.poll(() => document.querySelector('.atlas-asset-card')).not.toBeNull();
  await settle();
  const click = (selector: string): void => { fireEvent.click(query(selector)); };
  if (opening === 'create') click('.atlas-asset-manager-create-btn');
  if (opening === 'filters') click('.atlas-am-filters-btn');
  if (opening === 'collections') click('.atlas-collection-dropdown-trigger');
  if (opening === 'collection-menu') click('.atlas-collection-more-btn');
  if (opening === 'chips') click('.atlas-active-filter-group .atlas-active-filter');
  await settle();
  return document.body;
}

/** A painted picture to drop on a creator, so its preview cards and footer show. */
async function picture(name: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'hsl(30, 40%, 50%)';
  context.fillRect(0, 0, 256, 256);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((made) => resolve(made!), 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}

/** The token or map creator with two pictures added. */
export async function openCreator(mode: 'token' | 'map'): Promise<Element> {
  const { app } = createInMemoryApp();
  AssetService.resetInstance();
  await AssetService.getInstance(app).initialize();
  const files = await Promise.all([picture(`${LONG}.png`), picture('Olm.png')]);
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <TooltipProvider><div className="atlas-vtt-plugin"><TokenCreator isOpen mode={mode} onClose={noop} initialFiles={files} /></div></TooltipProvider>
    </AtlasUIContext.Provider>,
  );
  await expect.poll(() => document.querySelectorAll('.atlas-token-creator__footer').length).toBe(1);
  await expect.poll(() => document.querySelector('.atlas-token-creator__status')?.textContent ?? '', { timeout: 20_000 }).not.toMatch(/\d+ \/ \d+/);
  await settle(600);
  return query('.atlas-token-creator__window');
}

const presetApps: App[] = [];

/** Lets go of the preset files the collection dialogs opened. */
export function releaseLibrarySurfaces(): void {
  for (const app of presetApps.splice(0)) SystemPresetFiles.release(app);
}

/** The dialog that creates a collection, at its first step or at the step that sets up a game system. */
export async function openCreateCollection(step: 'details' | 'custom'): Promise<Element> {
  const { app } = createInMemoryApp();
  presetApps.push(app);
  SystemPresetFiles.open(app);
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <TooltipProvider>
        <div className="atlas-vtt-plugin"><CreateCollectionModal existingNames={[]} onClose={noop} onCreated={noop} /></div>
      </TooltipProvider>
    </AtlasUIContext.Provider>,
  );
  await expect.poll(() => document.querySelectorAll('.atlas-create-collection [role="radio"]').length).toBeGreaterThan(2);
  if (step === 'custom') {
    fireEvent.change(query('#atlas-new-collection-name'), { target: { value: 'Lockwood Manor' } });
    const choices = document.querySelectorAll<HTMLElement>('.atlas-create-collection [role="radio"]');
    fireEvent.click(choices[choices.length - 1]!);
    const buttons = document.querySelectorAll<HTMLButtonElement>('.atlas-create-collection__footer button');
    fireEvent.click(buttons[buttons.length - 1]!);
    await expect.poll(() => document.querySelector('.atlas-create-collection__back')).not.toBeNull();
  }
  await settle();
  return query('.atlas-create-collection');
}
