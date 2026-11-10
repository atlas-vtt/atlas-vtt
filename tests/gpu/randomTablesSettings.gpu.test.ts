import '../setup/obsidianDom';
import { createElement } from 'react';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { CollectionSettingsModal } from '../../src/app/react/components/CollectionSettingsModal';
import { AssetService } from '../../src/app/services/AssetService';
import { RARITY_SETTINGS, TABLE_FILES, TABLE_SETTINGS, TABLES_THEME } from './randomTablesHarness';

// The dialog reaches services that load Node's events module.
vi.mock('events', async () => import('eventemitter3'));
vi.mock('../../src/app/loot/lootQueryView', () => ({
  lootBasesAvailable: (): boolean => true,
  LootBaseQuery: class {
    constructor(_app: unknown, private readonly config: { views: { name: string }[] }, _path: string, private readonly listener: { onSnapshot: (snapshot: unknown) => void }) {}
    start(): Promise<void> {
      const entries = [{ path: `Cairn/Items/${this.config.views[0]?.name ?? ''}.md`, name: 'Rope', values: {} }];
      queueMicrotask(() => this.listener.onSnapshot({ entries, order: [], displayNames: {} }));
      return Promise.resolve();
    }
    stop(): void {}
  },
}));

const tab = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-collection-settings-modal')!;
const rect = (element: Element): DOMRect => element.getBoundingClientRect();
const heights = (selector: string): number[] => [...tab().querySelectorAll(selector)].map((element) => Math.round(rect(element).height));

async function open(theme: 'light' | 'dark'): Promise<void> {
  document.body.className = `theme-${theme}`;
  const { app } = createInMemoryApp({ files: TABLE_FILES });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const collectionId = assets.getDefaultCollectionId();
  await assets.updateCollectionSettings(collectionId, { ...TABLE_SETTINGS, itemRarities: RARITY_SETTINGS.itemRarities });
  render(createElement(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } },
    createElement(CollectionSettingsModal, { isOpen: true, collectionId, initialTab: 'loot', onClose: () => undefined })));
  await expect.poll(() => tab()?.querySelectorAll('.atlas-rt-row').length).toBe(5);
  await expect.poll(() => tab().querySelector('.atlas-rt-row .atlas-tables-row__fact')?.textContent).toBeTruthy();
}

describe('the Random tables tab of the collection settings', () => {
  const style = document.createElement('style');
  style.textContent = TABLES_THEME + css;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
  beforeEach(() => { document.head.append(style); });
  afterEach(() => {
    cleanup();
    style.remove();
  });

  for (const [theme, width, height] of [['light', 1280, 900], ['dark', 1280, 900], ['dark', 720, 640]] as const) {
    it(`lays its rows out compactly, one height each, in ${theme} at ${width} px`, async () => {
      await page.viewport(width, height);
      await open(theme);
      // Compact rows and no prose over the controls.
      expect(tab().querySelectorAll('.atlas-csm-hint')).toHaveLength(0);
      expect(new Set(heights('.atlas-rt-row__head')).size).toBe(1);
      expect(new Set(heights('.atlas-rt-rarity')).size).toBe(1);
      // Every row ends inside the dialog's content.
      const content = rect(tab().querySelector('.atlas-rt-note')!);
      for (const row of tab().querySelectorAll('.atlas-rt-row__head, .atlas-rt-rarity')) expect(rect(row).right).toBeLessThanOrEqual(content.right + 0.5);

      const rumours = within(tab()).getByRole('button', { name: /Rumours in the Taproom/ });
      fireEvent.click(rumours);
      const hidden = within(tab()).getByRole('button', { name: 'True?' });
      expect(hidden.getAttribute('aria-pressed')).toBe('true');
      await page.screenshot({ path: `__screenshots__/random-tables-settings-${theme}-${width}.png`, element: tab() });

      fireEvent.click(within(tab()).getByRole('button', { name: 'Add from a note' }));
      fireEvent.click(within(tab().querySelector<HTMLElement>('.atlas-linked-note-list')!).getByText('Aurifex'));
      await expect.poll(() => tab().querySelectorAll('.atlas-rt-picker__table').length).toBe(2);
      tab().querySelector('.atlas-rt-picker')!.scrollIntoView();
      await page.screenshot({ path: `__screenshots__/random-tables-settings-${theme}-${width}-picker.png`, element: tab() });
    });
  }
});
