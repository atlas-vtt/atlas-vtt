import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cdp, page } from 'vitest/browser';
import type { App } from 'obsidian';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { NotePanelRoot } from '../../src/app/statblocks/editor/note-panel/NotePanelRoot';
import { paneCardWidth } from '../../src/app/statblocks/editor/note-panel/paneCardWidth';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { serializeTemplate } from '../../src/app/statblocks/format/templateFormat';
import { EMBER_KEEPER, EMBER_KEEPER_NOTE } from '../fixtures/emberKeeperTemplate';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { FakeSource, FakeWriter } from '../unit/statblocks/editor/paneKit';
import { THEME, frames } from './sidePanesHarness';

vi.mock('../../src/app/services/statblockDiceLinks', () => ({ attachDiceRolling: () => () => undefined, diceLinkProps: () => ({}), linkDiceIn: () => undefined }));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({}) } }));
vi.mock('../../src/app/statblocks/editor/create/createFlow', () => ({ createStatblock: async () => null, startStatblockCreation: async () => null }));
vi.mock('../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }], getAssets: async () => [], getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [], getCollectionSettings: () => ({ conditions: [] }), loadedCollections: () => [],
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

/**
 * The card a player's page lays the sheet out at is the card the GM sees beside the note: its width
 * in the note panel is what `paneCardWidth` says for the panel's width, for a one-column template up
 * to its feed width and for a wider one the whole pane. Screenshots of the GM's card for the Ember
 * Keeper fixture go to `tests/gpu/__screenshots__/player-sheet/gm-card-<width>.png` (the player's page is
 * compared with them).
 */
const NOTE_PATH = 'Characters/Ember Keeper.md';
const SHOTS = '__screenshots__/player-sheet';
const OBSIDIAN = `
  * { box-sizing: border-box; }
  .workspace-leaf-content { position: relative; display: flex; flex-direction: column; width: 1400px; height: 2400px; }
  .view-header { height: 40px; flex: none; }
  .view-content { width: 100%; height: calc(100% - 40px); }
`;
const h = React.createElement;
const noop = (): void => undefined;
const apps: App[] = [];

async function noteView(panelWidth: number): Promise<HTMLElement> {
  const { app } = createInMemoryApp({ files: {
    [NOTE_PATH]: '---\nstatblock: true\n---\n',
    'atlas-vtt/statblock-templates/Ember Keeper.atlastemplate': serializeTemplate(EMBER_KEEPER),
  } });
  apps.push(app);
  vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter: EMBER_KEEPER_NOTE });
  const leaf = document.body.createDiv({ cls: ['workspace-leaf-content', 'atlas-sb-note', 'atlas-sb-note--hide-properties'] });
  leaf.createDiv({ cls: 'view-header' });
  const content = leaf.createDiv({ cls: 'view-content' });
  content.createDiv({ cls: ['markdown-source-view', 'mod-cm6', 'is-live-preview'] });
  const host = content.createDiv({ cls: ['atlas-vtt-plugin', 'atlas-sb-note-panel'] });
  host.style.setProperty('--atlas-sb-panel-width', `${panelWidth}px`);
  const source = new FakeSource();
  source.set(NOTE_PATH, EMBER_KEEPER_NOTE);
  await act(async () => {
    render(h(TooltipProvider, null, h(NotePanelRoot, {
      pane: {
        app, services: { source, writer: new FakeWriter() }, notePath: NOTE_PATH, collectionId: 'campaign', propertiesShown: false,
        announcement: '', focusRequest: 0, pendingCommit: { current: null }, actions: { showProperties: noop, changeCollection: noop },
      },
      width: panelWidth, stacked: false, availableWidth: () => content.clientWidth, onResize: noop, onCancelResize: noop, onResetWidth: noop,
    })), { container: host });
  });
  await vi.waitFor(() => expect(leaf.querySelector('[data-block-id="tbarmo00"]')).not.toBeNull(), { timeout: 5000 });
  await act(async () => { await frames(4); });
  return leaf;
}

describe('the card a player\'s sheet is laid out at', () => {
  const style = document.createElement('style');
  style.textContent = THEME + OBSIDIAN + css;
  beforeEach(async () => {
    // The browser's own window as large as the frame, so screenshots are taken at one pixel per CSS pixel.
    await cdp().send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2400, deviceScaleFactor: 1, mobile: false });
    await page.viewport(1440, 2400);
    document.head.append(style);
  });
  afterEach(async () => {
    await cdp().send('Emulation.clearDeviceMetricsOverride');
    cleanup();
    style.remove();
    document.body.replaceChildren();
    for (const app of apps.splice(0)) TemplateLibrary.release(app);
  });

  it.each([[600], [420], [1000]])('is as wide in a %ipx panel as paneCardWidth says', async (panelWidth) => {
    const leaf = await noteView(panelWidth);
    const card = leaf.querySelector<HTMLElement>('.atlas-sb-pane-card .atlas-statblock')!;
    expect(Math.abs(card.getBoundingClientRect().width - paneCardWidth(panelWidth, EMBER_KEEPER.layout.maxColumns))).toBeLessThanOrEqual(1);
    if (panelWidth === 600) {
      await page.screenshot({ path: `${SHOTS}/gm-card-${panelWidth}.png`, element: card });
    }
  });
});
