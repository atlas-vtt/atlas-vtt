import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { renderPane, type PaneHarness } from '../unit/statblocks/editor/paneKit';
import { centreOf, mouse } from './realMouse';
import { frames, useEditorStyles } from './sidePanesHarness';

// Dice links and the token socket reach the map view and the token link service, whose Node `events` has no browser build.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({}) } }));
vi.mock('../../src/app/statblocks/editor/create/createFlow', () => ({
  createStatblock: async () => null,
  startStatblockCreation: async () => null,
}));
vi.mock('../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const WARDEN = { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden', hp: 14 };
const ROUNDING = 0.6;

const apps: App[] = [];
afterEach(() => {
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

/** The pane in the plugin's scope, 480 px wide, as the panel beside a note holds it. */
async function pane(): Promise<PaneHarness> {
  document.querySelectorAll('.atlas-test-pane').forEach((host) => host.remove());
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'atlas-vtt-plugin atlas-test-pane' }));
  container.style.width = '480px';
  const harness = await renderPane({ frontmatter: WARDEN, container, actions: { showProperties: vi.fn(), changeCollection: vi.fn(), editTemplate: vi.fn() } });
  apps.push(harness.app);
  await frames(2);
  return harness;
}

const opacityOf = (element: Element): number => Number(getComputedStyle(element).opacity);

/** The statblock's ⋯ (§7.2), under its card. */
describe('the statblock\'s options under its card', () => {
  useEditorStyles();

  it('stands under the card at its right edge, leaves the token art as far from the card\'s right as from its top, and shows only while the pointer is over the panel', async () => {
    const harness = await pane();
    const card = harness.result.container.querySelector<HTMLElement>('.atlas-sb-pane-card')!;
    expect(card.querySelector('.atlas-sb-card-menu')).toBeNull();
    const menu = harness.result.container.querySelector<HTMLElement>('.atlas-sb-card-menu')!;
    const button = menu.querySelector<HTMLElement>('button')!;
    const sheet = card.querySelector<HTMLElement>('.atlas-statblock')!.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(sheet.bottom);
    expect(Math.abs(sheet.right - box.right)).toBeLessThanOrEqual(ROUNDING);

    const socket = card.querySelector('.atlas-sb-token-socket, .atlas-sb-token-image')!.getBoundingClientRect();
    expect(Math.abs((sheet.right - socket.right) - (socket.top - sheet.top))).toBeLessThanOrEqual(ROUNDING);

    expect(opacityOf(menu)).toBe(0);
    await act(async () => {
      await mouse.move(centreOf(card).x, centreOf(card).y);
      await frames(12);
    });
    expect(opacityOf(menu)).toBe(1);
    await page.screenshot({ element: harness.result.container.querySelector<HTMLElement>('.atlas-sb-pane')!, path: '__screenshots__/card-menu/under-card.png' });
  });
});
