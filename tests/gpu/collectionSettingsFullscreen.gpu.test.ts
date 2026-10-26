import '../setup/obsidianDom';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { withStatblockEditor } from '../mocks/experimentalFeatures';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { CollectionSettingsModal, type CollectionSettingsTab } from '../../src/app/react/components/CollectionSettingsModal';
import { AssetService } from '../../src/app/services/AssetService';
import { TABLE_FILES, TABLES_THEME } from './randomTablesHarness';

// The dialog reaches services that load Node's events module.
vi.mock('events', async () => import('eventemitter3'));

const OVERLAY_MARGIN = 32;
const modal = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-collection-settings-modal')!;
const box = (element: Element): DOMRect => element.getBoundingClientRect();

async function open(tab: CollectionSettingsTab, statblockEditor: boolean): Promise<void> {
  const { app } = createInMemoryApp({ files: TABLE_FILES });
  if (statblockEditor) withStatblockEditor(app);
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  render(createElement(AtlasUIContext.Provider, { value: { app, view: null, pixiApp: null, renderer: null } },
    createElement(CollectionSettingsModal, { isOpen: true, collectionId: assets.getDefaultCollectionId(), initialTab: tab, onClose: () => undefined })));
  await expect.poll(() => modal()).not.toBeNull();
}

/** The collection settings dialog fills the window, its tabs keep a readable width. */
describe('the collection settings dialog, fullscreen', () => {
  const style = document.createElement('style');
  style.textContent = TABLES_THEME + css;

  beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
  afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
  beforeEach(async () => {
    document.body.className = 'theme-dark';
    document.head.append(style);
    await page.viewport(1440, 900);
  });
  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('fills the window but for the overlay\'s margin, a form centred at a readable width', async () => {
    await open('grid', true);
    // Once the window has grown in
    await expect.poll(() => Math.round(box(modal()).left)).toBe(OVERLAY_MARGIN);
    const window = box(modal());
    expect(window.left).toBeCloseTo(OVERLAY_MARGIN, 0);
    expect(window.top).toBeCloseTo(OVERLAY_MARGIN, 0);
    expect(document.documentElement.clientWidth - window.right).toBeCloseTo(OVERLAY_MARGIN, 0);
    expect(document.documentElement.clientHeight - window.bottom).toBeCloseTo(OVERLAY_MARGIN, 0);
    const content = box(modal().querySelector('.atlas-collection-settings-content')!);
    const form = box(modal().querySelector('.atlas-collection-settings-page')!);
    expect(form.width).toBe(760);
    expect(form.left - content.left).toBeCloseTo(content.right - form.right, -1);
  });

  // Recovery buttons belong to the statblock template and are set up in the template editor.
  for (const statblockEditor of [true, false]) {
    it(`keeps the Resources tab a form at a readable width, with no recovery pane (statblock editor ${statblockEditor ? 'on' : 'off'})`, async () => {
      await open('resources', statblockEditor);
      expect(modal().querySelector('.atlas-csm-token-stage')).not.toBeNull();
      expect(modal().querySelector('.atlas-rc-pane')).toBeNull();
      expect(box(modal().querySelector('.atlas-collection-settings-page')!).width).toBeLessThanOrEqual(760);
    });
  }
});
