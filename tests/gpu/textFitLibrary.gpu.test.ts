import '../setup/obsidianDom';
import React from 'react';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App, TFile } from 'obsidian';
import css from '../../styles/main.scss?inline';
import { setLocale } from '../../src/app/i18n';
import { TRANSLATIONS } from '../../src/app/i18n/languages';
import { QuestIndex } from '../../src/app/campaigns/quests/QuestIndex';
import { Dashboard } from '../../src/app/react/components/dashboard/Dashboard';
import { AssetService } from '../../src/app/services/AssetService';
import { mapThumbnailPath } from '../../src/app/utils/dataFileMigration';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { questVault } from '../mocks/questVault';
import { DAY, mountDashboard, paintedMap } from './dashboardHarness';
import { mountTablesWindow, RARITY_SETTINGS, TABLE_SETTINGS, TABLES_THEME } from './randomTablesHarness';
import { openCreateCollection, openCreator, openLibrary, releaseLibrarySurfaces } from './textFitLibrarySurfaces';
import { LANGUAGES, describeMisfits, textMisfits } from './textFit';

const views = vi.hoisted(() => {
  const item = (name: string, type: string, price: string, extra: Record<string, string> = {}): { path: string; name: string; values: Record<string, string> } => ({
    path: `Items/${name}.md`, name, values: { 'note.type': type, 'note.price': price, ...extra },
  });
  return {
    Weapons: [item('Longsword', 'Weapon', '20', { 'note.damage': 'd8' })],
    Armor: [item('Chainmail', 'Armor', '40', { 'note.armor': '2' })],
    Tools: [item('Lantern', 'Tool', '10', { 'note.description': 'Burns six hours on a flask of oil.' })],
    Magic: [
      item('Potion of Healing', 'Potion', '50', { 'note.rarity': 'Common' }),
      item('Bag of Holding', 'Wondrous item', '500', { 'note.rarity': 'Uncommon' }),
      item('Flame Tongue', 'Weapon', '5000', { 'note.rarity': 'Rare' }),
      item('Staff of Power', 'Staff', '95500', { 'note.rarity': 'Very rare' }),
      item("Grandmother's Locket of the Drowned Galleries", 'Trinket', '', { 'note.rarity': 'Heirloom' }),
    ],
  } as Record<string, { path: string; name: string; values: Record<string, string> }[]>;
});

// The surfaces reach services that load Node's events module.
vi.mock('events', async () => import('eventemitter3'));
// Opening an asset and previewing its statblock reach into services that need Node; neither happens here.
vi.mock('../../src/app/packages/components/asset-manager/hooks/useOpenAsset', () => ({ useOpenAsset: () => (): Promise<void> => Promise.resolve() }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetStatblockPreview', () => ({ useAssetStatblockPreview: (): void => undefined }));
// A map's sharp picture comes from its tile pyramid; here it is the painted picture itself.
vi.mock('../../src/app/react/components/dashboard/mapPicture', () => ({
  mapPictureUrl: (app: App, path: string): Promise<string | null> => {
    const file = app.vault.getFileByPath(path);
    return Promise.resolve(file ? app.vault.getResourcePath(file) : null);
  },
  releaseMapPictures: (): void => undefined,
}));
vi.mock('../../src/app/services/worldMap', () => ({ campaignWorldMap: () => Promise.resolve('atlas-vtt/assets/The Wide World.webp'), worldMapArtwork: () => Promise.resolve(null) }));
// Obsidian runs base views off screen; here every view answers at once with its items.
vi.mock('../../src/app/loot/lootQueryView', () => ({
  lootBasesAvailable: (): boolean => true,
  LootBaseQuery: class {
    constructor(_app: unknown, private readonly config: { views: { name: string }[] }, _path: string, private readonly listener: { onSnapshot: (snapshot: unknown) => void }) {}
    start(): Promise<void> {
      const entries = views[this.config.views[0]?.name ?? ''] ?? [];
      const order = ['note.type', 'note.rarity', 'note.price', 'note.damage', 'note.armor', 'note.description'];
      queueMicrotask(() => this.listener.onSnapshot({ entries, order, displayNames: { 'note.damage': 'Damage', 'note.armor': 'Armor' } }));
      return Promise.resolve();
    }
    stop(): void {}
  },
}));

/**
 * Every language Atlas speaks, on the library and the pages outside the map, at a wide and a narrow window: no text
 * spills out of its box, is cut off without an ellipsis, or lies on a control or on other text.
 */
const WINDOWS = [{ width: 1440, height: 900 }, { width: 760, height: 900 }] as const;
type Size = (typeof WINDOWS)[number];
const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const h = React.createElement;
const opened: App[] = [];
/** The pages scroll; tall enough that all of each is in view, so all of it is measured. */
const TALL = 2400;

const CAMPAIGN = 'Rise of the Blood Olms beneath the Hollow Oak';
const quest = (properties: string): string => `---\natlas-type: quest\ncampaign: ${CAMPAIGN}\n${properties}\n---\nThe olms rise when the river runs red.\n`;
const SCENE = 'atlas-vtt/collections/Cairn/scenes/Blue Mouth Caves.atlasmap';
const WORLD = 'atlas-vtt/assets/The Wide World.webp';

/** A campaign's page with its quests, every group unfolded. */
async function openCampaignPage(size: Size): Promise<Element> {
  await page.viewport(size.width, TALL);
  const { app } = questVault({
    [SCENE]: JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, mapPath: SCENE, objects: {} } }),
    [mapThumbnailPath(SCENE)]: 'JPG',
    [WORLD]: 'WEBP',
    'Quests/The crown under the root of the Hollow Oak.md': quest('kind: main\nstatus: active\nexperience: 1200\nrewards: [Favour of the Horned King, A seat at the Hollow Oak]'),
    "Quests/Rescue the miller's daughter.md": quest('kind: main\nstatus: open\nexperience: 400'),
    'Quests/Olm eggs for the alchemist.md': quest('kind: side\nstatus: open\nexperience: 150\nrewards: [3 gold pieces]'),
    'Quests/Clear the cellar.md': quest('kind: main\nstatus: done\nexperience: 100'),
    'Quests/Save the ferryman.md': quest('kind: side\nstatus: failed'),
  });
  const world = paintedMap(170, 600, 400);
  vi.mocked(app.vault.getResourcePath).mockImplementation((file: TFile) => (file.path === WORLD ? world : ''));
  QuestIndex.open(app);
  opened.push(app);
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const [scene] = await assets.getAssets(undefined, 'scene');
  const storage = memoryCampaigns([{ id: 'a', name: CAMPAIGN, createdAt: Date.now() - 30 * DAY, lastPlayed: Date.now() - 2 * DAY, worldMap: scene!.id, description: 'Blue Mouth Caves, below the Hollow Oak.' }]);
  render(h('div', { className: 'workspace-leaf-content atlas-dashboard-view atlas-vtt-plugin', style: { width: `${size.width}px`, height: `${TALL}px` } },
    h(Dashboard, { app, campaignStorage: storage, onOpenScene: vi.fn(), onCreateMap: vi.fn(), onOpenAssetManager: vi.fn() })));
  await expect.poll(() => document.querySelector('.campaign-card')).not.toBeNull();
  fireEvent.click(document.querySelector('.campaign-card')!);
  await expect.poll(() => document.querySelectorAll('.campaign-quest').length).toBe(3);
  fireEvent.click(document.querySelector('.campaign-quests__fold')!);
  await expect.poll(() => document.querySelectorAll('.campaign-quest').length).toBe(5);
  await settle();
  return document.querySelector('.atlas-dashboard-view')!;
}

/** The start page with campaigns, one played, and a party on its last scene. */
async function openStartPage(size: Size): Promise<Element> {
  await mountDashboard('dark', ({ scenes }) => [
    { id: 'a', name: CAMPAIGN, createdAt: Date.now() - 30 * DAY, lastPlayed: Date.now() - 2 * DAY, worldMap: scenes.get('Blue Mouth Caves')!, lastScene: scenes.get('Blue Mouth Caves')! },
    { id: 'b', name: 'The Witherwild', createdAt: Date.now() - 12 * DAY, lastPlayed: Date.now() - 9 * DAY },
    { id: 'c', name: 'Dolmenwood', createdAt: Date.now() - 3 * 60 * 60 * 1000 },
  ], { size: { width: size.width, height: TALL }, party: [{ name: 'Aria Thornwood of the Low Marches', art: 'art/aria.webp', picture: paintedMap(10, 96, 96), ring: true }] });
  await expect.poll(() => document.querySelectorAll('.campaign-card').length).toBeGreaterThanOrEqual(3);
  await settle(800);
  return document.querySelector('.atlas-dashboard-view')!;
}

const lootPanel = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-loot-roller')!;

async function roll(cards: number, store: Awaited<ReturnType<typeof mountTablesWindow>>['store']): Promise<void> {
  const before = store.getState().lootRoller.lastRoll?.id;
  fireEvent.click(lootPanel().querySelector('.atlas-loot-roll-button')!);
  await expect.poll(() => store.getState().lootRoller.lastRoll?.id).not.toBe(before);
  await expect.poll(() => lootPanel().querySelectorAll('.atlas-loot-list__cards > li').length).toBe(cards);
}

const lootSize = (size: Size): { width: number; height: number } | undefined => (size.width < 1000 ? { width: 620, height: 560 } : undefined);

/** The loot roller over magic items of every rarity, rolled, with its rarity menu open where the bar folds it. */
async function openLootRarities(size: Size): Promise<Element> {
  const { store } = await mountTablesWindow('dark', lootSize(size), RARITY_SETTINGS);
  await expect.poll(() => lootPanel()?.querySelectorAll('.atlas-loot-rarity').length).toBe(6);
  for (let i = 0; i < 3; i++) fireEvent.click(lootPanel().querySelector('.atlas-loot-stepper__button:last-of-type')!);
  let next = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => [0.05, 0.3, 0.5, 0.9][next++ % 4]!);
  await roll(4, store);
  const menu = lootPanel().querySelector<HTMLElement>('.atlas-loot-rarity-menu__trigger');
  if (menu && menu.getClientRects().length > 0) fireEvent.click(menu);
  await settle();
  return document.body;
}

/** Random tables: a text table rolled twice, then the history of the rolls. */
async function openTables(size: Size, tab: 'result' | 'history'): Promise<Element> {
  const { store } = await mountTablesWindow('dark', lootSize(size), TABLE_SETTINGS);
  await expect.poll(() => lootPanel()?.querySelector('button.atlas-tables-row') != null).toBe(true);
  fireEvent.click(within(lootPanel().querySelector<HTMLElement>('.atlas-loot-roller__sidebar')!).getAllByRole('button').find((button) => button.textContent?.includes('Rumours'))!);
  fireEvent.click(lootPanel().querySelector('.atlas-loot-stepper__button:last-of-type')!);
  vi.spyOn(Math, 'random').mockReturnValueOnce(0.4).mockReturnValue(0.9);
  await roll(2, store);
  if (tab === 'history') fireEvent.click(lootPanel().querySelectorAll<HTMLElement>('[role="tab"]')[1]!);
  await settle();
  return lootPanel();
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** The misfits of `root` with each of its scroll areas scrolled through, so text below the fold is measured too. */
async function misfitsScrolled(root: Element): Promise<string[]> {
  const found = describeMisfits(textMisfits(root));
  const areas = [...root.querySelectorAll<HTMLElement>('*')].filter((element) => {
    const style = getComputedStyle(element);
    return /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
  });
  for (const area of areas) {
    while (area.scrollTop + area.clientHeight < area.scrollHeight - 1) {
      const before = area.scrollTop;
      area.scrollTop += Math.max(40, area.clientHeight * 0.8);
      if (area.scrollTop === before) break;
      await nextFrame();
      await nextFrame();
      found.push(...describeMisfits(textMisfits(root)));
    }
  }
  return found;
}

const SURFACES: ReadonlyArray<{ name: string; open: (size: Size) => Promise<Element> }> = [
  ...(['rest', 'create', 'filters', 'collections', 'collection-menu', 'chips', 'armarium'] as const)
    .map((opening) => ({ name: `asset manager, ${opening}`, open: () => openLibrary('tokens', opening) })),
  { name: 'asset manager, encounters', open: () => openLibrary('encounters', 'rest') },
  { name: 'asset manager, maps', open: () => openLibrary('maps', 'rest') },
  { name: 'token creator', open: () => openCreator('token') },
  { name: 'map creator', open: () => openCreator('map') },
  { name: 'create collection', open: () => openCreateCollection('details') },
  { name: 'create collection, own system', open: () => openCreateCollection('custom') },
  { name: 'start page', open: openStartPage },
  { name: 'campaign page', open: openCampaignPage },
  { name: 'loot rarities', open: openLootRarities },
  { name: 'random tables', open: (size) => openTables(size, 'result') },
  { name: 'random tables, history', open: (size) => openTables(size, 'history') },
];

describe('the library\'s text fits its place in every language', () => {
  const style = document.createElement('style');
  style.textContent = TABLES_THEME + css;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => {
    MotionGlobalConfig.skipAnimations = false;
    setLocale('en', TRANSLATIONS);
  });
  beforeEach(() => {
    document.body.className = 'theme-dark';
    document.head.append(style);
  });
  afterEach(() => {
    cleanup();
    style.remove();
  });

  for (const language of LANGUAGES) {
    it(`fits in ${language}`, async () => {
      setLocale(language, TRANSLATIONS);
      const found: string[] = [];
      for (const size of WINDOWS) {
        for (const surface of SURFACES) {
          await page.viewport(size.width, size.height);
          document.body.className = 'theme-dark';
          const root = await surface.open(size);
          found.push(...(await misfitsScrolled(root)).map((line) => `${surface.name} @${size.width}: ${line}`));
          cleanup();
          for (const app of opened.splice(0)) QuestIndex.release(app as Parameters<typeof QuestIndex.release>[0]);
          releaseLibrarySurfaces();
          AssetService.resetInstance();
          vi.restoreAllMocks();
        }
      }
      expect([...new Set(found)]).toEqual([]);
    }, 600_000);
  }
});
