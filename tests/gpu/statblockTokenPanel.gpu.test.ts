import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App, TFile } from 'obsidian';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { NOTE_PATH, renderPane, type PaneHarness } from '../unit/statblocks/editor/paneKit';
import { frames, useEditorStyles } from './sidePanesHarness';

// Dice links and the token link service reach Node's `events`, which has no browser build.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({ readStatblockImage: () => null }) } }));
vi.mock('../../src/app/statblocks/editor/create/createFlow', () => ({
  createStatblock: async () => null,
  startStatblockCreation: async () => null,
}));

const WARDEN_ART = 'atlas-vtt/assets/warden.webp';
const token = (id: string, name: string, imagePath: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, name, imagePath, type: 'token', collection: 'campaign', tags: [], createdAt: 0, modifiedAt: 0, ...extra,
});
const tokens = [
  token('warden', 'Marsh Warden', WARDEN_ART, { statblockPath: NOTE_PATH }),
  token('hag', 'Bog Hag', 'atlas-vtt/assets/hag.webp'),
  token('rat', 'Giant Rat', 'atlas-vtt/assets/rat.webp'),
  token('wolf', 'Dire Wolf', 'atlas-vtt/assets/wolf.webp'),
  token('heron', 'Grey Heron', 'atlas-vtt/assets/heron.webp'),
  token('toad', 'Bog Toad', 'atlas-vtt/assets/toad.webp'),
];
vi.mock('../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/services/AssetService')>();
  const assets = {
    initialize: async () => undefined,
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => tokens,
    getTokenAssets: async () => tokens,
    loadedTokenAssets: () => tokens,
    findTokenAssetByImagePath: (path: string) => tokens.find((each) => each.imagePath === path) ?? null,
    onReconciled: () => () => undefined,
    getDefaultCollectionId: () => 'campaign',
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});
vi.mock('../../src/app/services/AssetThumbnailService', () => ({
  AssetThumbnailService: { getInstance: () => ({
    stateOf: () => ({ path: undefined, pending: false }),
    ensureThumbnails: () => undefined,
    onUpdated: () => () => undefined,
  }) },
}));

/** A flat picture standing in for art: a disc for tokens, a square for vault images. */
function picture(path: string, disc: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d')!;
  let hash = 0;
  for (const char of path) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  context.fillStyle = `hsl(${hash} 45% 45%)`;
  if (disc) {
    context.beginPath();
    context.arc(48, 48, 44, 0, Math.PI * 2);
    context.fill();
  } else {
    context.fillRect(0, 0, 96, 96);
  }
  return canvas.toDataURL();
}
vi.mock('../../src/app/packages/components/asset-manager/vault-images/vaultImageThumbnails', () => ({
  VaultImageThumbnails: class {
    load(file: TFile): Promise<string> { return Promise.resolve(picture(file.path, false)); }
    dispose(): void {}
  },
}));

const VAULT_IMAGES = ['Art/Bog lantern.png', 'Art/Drowned bell.png', 'Art/Heron king.png', 'Art/Marsh map.jpg', 'Art/Reed crown.png', 'Art/Witch light.png'];
const WARDEN = { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden', image: 'Art/gone.webp' };
/** The tolerance of positions measured at a pixel ratio of 1. */
const ROUNDING = 0.6;

const apps: App[] = [];
afterEach(() => {
  cleanup();
  document.querySelectorAll('.atlas-sb-token-popover').forEach((popover) => popover.remove());
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

/** The pane in the plugin's scope, its token art drawn as flat pictures. */
async function pane(): Promise<PaneHarness> {
  document.querySelectorAll('.atlas-test-pane').forEach((host) => host.remove());
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'atlas-vtt-plugin atlas-test-pane' }));
  container.style.width = '520px';
  const files = Object.fromEntries([NOTE_PATH, ...tokens.map((each) => String(each.imagePath)), ...VAULT_IMAGES].map((path) => [path, '']));
  const harness = await renderPane({ frontmatter: WARDEN, files, container });
  vi.mocked(harness.app.vault.getResourcePath).mockImplementation((file: TFile) => picture(file.path, true));
  apps.push(harness.app);
  return harness;
}

async function openPanel(): Promise<HTMLElement> {
  const socket = document.querySelector<HTMLElement>('.atlas-sb-token-socket')!;
  await act(async () => {
    socket.click();
    await frames(12);
  });
  return document.querySelector<HTMLElement>('.atlas-sb-token-panel')!;
}

const rect = (element: Element): DOMRect => element.getBoundingClientRect();
const px = (value: string): number => Number.parseFloat(value) || 0;

describe('the token art panel', () => {
  useEditorStyles();

  it('holds the search and the Ring switch in one row, has no rules, and keeps its size across its tabs', async () => {
    await pane();
    const panel = await openPanel();
    const style = getComputedStyle(panel);
    const border = px(style.borderLeftWidth);
    const inner = { left: rect(panel).left + border, right: rect(panel).right - border };
    const inset = 12;

    const header = panel.querySelector<HTMLElement>('.atlas-sb-token-panel__header')!;
    const body = panel.querySelector<HTMLElement>('.atlas-sb-token-panel__body')!;
    for (const part of [header, body]) {
      expect(px(getComputedStyle(part).borderTopWidth) + px(getComputedStyle(part).borderBottomWidth)).toBe(0);
    }
    expect(panel.querySelector('.atlas-sb-token-panel__footer')).toBeNull();

    // One row: the search fills it from the panel's text edge; the switch ends on the far edge.
    const search = rect(panel.querySelector('.atlas-sb-token-panel__search')!);
    const toggle = rect(panel.querySelector('.atlas-sb-token-panel__controls .atlas-toggle')!);
    const label = rect(panel.querySelector('.atlas-sb-token-panel__controls .atlas-dropdown-toggle-row__label')!);
    expect(Math.abs((search.top + search.bottom) / 2 - (toggle.top + toggle.bottom) / 2)).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs((label.top + label.bottom) / 2 - (toggle.top + toggle.bottom) / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(search.left - inner.left - inset)).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs(inner.right - toggle.right - inset)).toBeLessThanOrEqual(ROUNDING);
    expect(label.left).toBeGreaterThan(search.right);
    expect(search.width).toBeGreaterThan(rect(panel).width / 2);

    // The tabs come next, across the panel, and the choices under them.
    const tabs = rect(panel.querySelector('.atlas-sb-token-panel__sources')!);
    const row = rect(panel.querySelector('.atlas-sb-token-panel__controls')!);
    expect(Math.abs(row.height - search.height)).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs(toggle.height - search.height)).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs(tabs.top - row.bottom - inset)).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs(tabs.left - inner.left - inset)).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs(inner.right - tabs.right - inset)).toBeLessThanOrEqual(ROUNDING);
    const choices = rect(panel.querySelector('.atlas-sb-token-panel__choices')!);
    expect(Math.abs(choices.top + 2 - tabs.bottom - inset)).toBeLessThanOrEqual(ROUNDING);
    expect(panel.querySelectorAll('.atlas-sb-token-choice').length).toBe(tokens.length);
    await page.screenshot({ element: panel, path: '__screenshots__/token-art-panel/tokens.png' });

    const height = rect(panel).height;
    await act(async () => {
      [...panel.querySelectorAll<HTMLElement>('[role="radio"]')].find((tab) => tab.textContent === 'Vault images')!.click();
      await frames(12);
    });
    expect(panel.querySelector<HTMLInputElement>('.atlas-sb-token-panel__search')!.placeholder).toBe('Search images or folders…');
    expect(panel.querySelectorAll('.atlas-vault-images__card').length).toBeGreaterThan(0);
    expect(Math.abs(rect(panel).height - height)).toBeLessThanOrEqual(ROUNDING);
    await act(async () => { await frames(12); });
    await page.screenshot({ element: panel, path: '__screenshots__/token-art-panel/vault.png' });
  });

  it('shows the linked token\'s art in the socket where the note\'s picture is gone', async () => {
    await pane();
    const socket = document.querySelector<HTMLElement>('.atlas-sb-token-socket')!;
    expect(socket.classList.contains('atlas-sb-token-socket--empty')).toBe(false);
    expect(socket.querySelector('img')).not.toBeNull();
  });
});
