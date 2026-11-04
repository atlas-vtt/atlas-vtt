// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { TFile, type App } from 'obsidian';
import { GENERIC_CREATURE } from '../../../../src/app/statblocks/presets/generic';
import { StatblockSheet } from '../../../../src/app/statblocks/render/StatblockSheet';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { NOTE_PATH, renderPane, type PaneHarness } from './paneKit';
import { stubLayout } from '../../../mocks/jsdomLayout';

const store = vi.hoisted(() => ({ tokens: [] as Array<Record<string, unknown>> }));
vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    initialize: async () => undefined,
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => store.tokens,
    getTokenAssets: async () => store.tokens,
    findTokenAssetByImagePath: (path: string) => store.tokens.find((token) => token.imagePath === path) ?? null,
    loadedTokenAssets: () => store.tokens,
    onReconciled: () => () => undefined,
    getDefaultCollectionId: () => 'campaign',
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});
vi.mock('../../../../src/app/services/AssetThumbnailService', () => ({
  AssetThumbnailService: { getInstance: () => ({
    stateOf: (asset: { thumbnailPath?: string }) => ({ path: asset.thumbnailPath, pending: false }),
    ensureThumbnails: () => undefined,
    onUpdated: () => () => undefined,
  }) },
}));
const links = vi.hoisted(() => ({
  linkTokenToStatblock: vi.fn(async () => true),
  unlinkToken: vi.fn(async () => true),
  createTokenFromStatblockImage: vi.fn(async () => 'Art/new.webp'),
  readStatblockImage: () => null,
}));
vi.mock('../../../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => links } }));
const ring = vi.hoisted(() => ({ setTokenRing: vi.fn(async () => undefined) }));
vi.mock('../../../../src/app/services/tokenRingSync', () => ring);
// The image workers have no Node build: vault images show without a thumbnail.
vi.mock('../../../../src/app/packages/components/asset-manager/vault-images/vaultImageThumbnails', () => ({
  VaultImageThumbnails: class {
    load(): Promise<null> { return Promise.resolve(null); }
    dispose(): void {}
  },
}));

const WARDEN_ART = 'Art/warden.webp';
const HAG_ART = 'Art/hag.webp';
const token = (id: string, name: string, imagePath: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, name, imagePath, type: 'token', collection: 'campaign', tags: [], createdAt: 0, modifiedAt: 0, ...extra,
});
const WARDEN = { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden', image: WARDEN_ART };

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

const apps: App[] = [];
afterEach(() => {
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});
beforeEach(() => {
  store.tokens = [
    token('warden', 'Marsh Warden', WARDEN_ART, { statblockPath: NOTE_PATH, showRing: false }),
    token('hag', 'Bog Hag', HAG_ART),
    token('rat', 'Giant Rat', 'Art/rat.webp'),
  ];
  for (const fn of [links.linkTokenToStatblock, links.unlinkToken, links.createTokenFromStatblockImage, ring.setTokenRing]) fn.mockClear();
});

async function pane(frontmatter: Record<string, unknown> = WARDEN): Promise<PaneHarness> {
  const files = { [NOTE_PATH]: '---\nstatblock: true\n---\n', [WARDEN_ART]: '', [HAG_ART]: '', 'Art/plain.png': '' };
  const harness = await renderPane({ frontmatter, files });
  apps.push(harness.app);
  return harness;
}

const socket = (): HTMLElement => screen.getByRole('button', { name: 'Link token art' });
async function open(): Promise<HTMLElement> {
  await act(async () => { fireEvent.click(socket()); });
  const dialog = await screen.findByRole('dialog', { name: 'Token art' });
  await within(dialog).findByRole('button', { name: /Bog Hag/ });
  return dialog;
}
const settle = async (): Promise<void> => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };

describe('the token socket', () => {
  it('is a button around the art that opens the token panel, focus in its search', async () => {
    await pane();
    expect(socket().getAttribute('aria-haspopup')).toBe('dialog');
    expect(socket().getAttribute('aria-expanded')).toBe('false');
    expect(socket().querySelector('.atlas-token-portrait--unframed')).not.toBeNull();
    const dialog = await open();
    expect(socket().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(within(dialog).getByRole('textbox', { name: 'Search tokens' }));
  });

  it('shows an empty socket that asks for art where the note names none and no token is linked', async () => {
    store.tokens = store.tokens.filter((entry) => entry.id !== 'warden');
    await pane({ ...WARDEN, image: undefined });
    expect(socket().classList.contains('atlas-sb-token-socket--empty')).toBe(true);
    expect(socket().textContent).toBe('Add token art');
  });

  it('lists the linked token as the statblock\'s image, and the collection\'s tokens to link', async () => {
    await pane();
    const dialog = await open();
    const linked = within(dialog).getByRole('list');
    expect(linked.textContent).toContain('Marsh Warden');
    expect(linked.textContent).toContain('Statblock image');
    const choices = within(dialog).getAllByRole('button').filter((button) => button.classList.contains('atlas-sb-token-choice'));
    expect(choices.map((choice) => choice.textContent)).toEqual(['Bog Hag', 'Giant Rat', 'Marsh Warden, linked']);
    expect(choices[2]!.getAttribute('aria-disabled')).toBe('true');
  });

  it('links a token chosen with a click, its art becoming the note\'s, and gives focus back to the socket', async () => {
    await pane();
    const dialog = await open();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Bog Hag' })); });
    await settle();
    // Beside the token linked already; the panel shows the link, so the service shows no notice of it.
    expect(links.linkTokenToStatblock).toHaveBeenCalledWith(HAG_ART, NOTE_PATH, { updateStatblockAvatar: true, notice: false });
    expect(screen.queryByRole('dialog', { name: 'Token art' })).toBeNull();
    expect(document.activeElement).toBe(socket());
  });

  it('searches with the keyboard; Escape empties the search, then closes and returns focus', async () => {
    await pane();
    socket().focus();
    const dialog = await open();
    const search = within(dialog).getByRole('textbox', { name: 'Search tokens' });
    fireEvent.change(search, { target: { value: 'rat' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect((search as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('dialog', { name: 'Token art' })).not.toBeNull();
    fireEvent.change(search, { target: { value: 'rat' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Giant Rat');
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: 'Escape' }); });
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Token art' })).toBeNull();
    expect(document.activeElement).toBe(socket());
  });

  it('opens with Enter on the socket and links the token in focus with Enter', async () => {
    await pane();
    socket().focus();
    await act(async () => { fireEvent.keyDown(socket(), { key: 'Enter' }); fireEvent.click(socket()); });
    const dialog = await screen.findByRole('dialog', { name: 'Token art' });
    await within(dialog).findByRole('button', { name: 'Bog Hag' });
    fireEvent.keyDown(within(dialog).getByRole('textbox', { name: 'Search tokens' }), { key: 'ArrowDown' });
    // A focused button activates on Enter as a click; jsdom only dispatches the click.
    await act(async () => { fireEvent.click(document.activeElement!); });
    await settle();
    expect(links.linkTokenToStatblock).toHaveBeenCalledWith(HAG_ART, NOTE_PATH, expect.anything());
  });

  it('moves between tokens with the arrow keys', async () => {
    await pane();
    const dialog = await open();
    fireEvent.keyDown(within(dialog).getByRole('textbox', { name: 'Search tokens' }), { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Bog Hag');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement?.textContent).toBe('Giant Rat');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement?.textContent).toBe('Bog Hag');
  });

  it('unlinks a linked token', async () => {
    await pane();
    const dialog = await open();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Unlink Marsh Warden' })); });
    await settle();
    expect(links.unlinkToken).toHaveBeenCalledWith(WARDEN_ART, { updateStatblockAvatar: true });
  });

  it('holds the search and the Ring switch in one row, above the tabs', async () => {
    await pane();
    const dialog = await open();
    const row = dialog.querySelector('.atlas-sb-token-panel__controls')!;
    expect(within(row as HTMLElement).getByRole('textbox', { name: 'Search tokens' })).not.toBeNull();
    expect(within(row as HTMLElement).getByRole('switch', { name: 'Ring' })).not.toBeNull();
    expect(within(dialog).getAllByRole('radio').map((tab) => tab.textContent)).toEqual(['Tokens', 'Vault images']);
  });

  it('shows the linked token\'s art where the note\'s picture is a file the vault no longer holds', async () => {
    await pane({ ...WARDEN, image: 'Art/gone.webp' });
    expect(socket().classList.contains('atlas-sb-token-socket--empty')).toBe(false);
    expect(socket().querySelector('img')?.getAttribute('src')).toContain(WARDEN_ART);
    const dialog = await open();
    // Its ring is the token's, which the switch sets.
    expect(within(dialog).getByRole('switch', { name: 'Ring' }).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('switches the ring of the token whose art the statblock shows', async () => {
    await pane();
    const dialog = await open();
    const toggle = within(dialog).getByRole('switch', { name: 'Ring' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await act(async () => { fireEvent.click(toggle); });
    await settle();
    expect(ring.setTokenRing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'warden', imagePath: WARDEN_ART }), true);
  });

  it('keeps the Ring switch, disabled with its reason, where the art is no token\'s', async () => {
    await pane({ ...WARDEN, image: 'Art/plain.png' });
    const dialog = await open();
    const toggle = within(dialog).getByRole('switch', { name: 'Ring' });
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(toggle.getAttribute('aria-describedby')!)?.textContent).toBe('This art belongs to no token');
    fireEvent.click(toggle);
    expect(ring.setTokenRing).not.toHaveBeenCalled();
  });

  it('offers to make a token of art no token links', async () => {
    store.tokens = store.tokens.filter((entry) => entry.id !== 'warden');
    await pane({ ...WARDEN, image: 'Art/plain.png' });
    const dialog = await open();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: /Create token from art/ })); });
    await settle();
    expect(links.createTokenFromStatblockImage).toHaveBeenCalledWith(NOTE_PATH, 'campaign');
  });

  it('is never drawn on the runtime card', () => {
    const { app } = createInMemoryApp({ files: { [WARDEN_ART]: '' } });
    render(<StatblockSheet template={GENERIC_CREATURE.template} name="Generic" fields={WARDEN} variant="full" app={app} sourcePath={NOTE_PATH} />);
    expect(document.querySelector('.atlas-sb-token-socket')).toBeNull();
    expect(document.querySelector('.atlas-sb-token-image')).not.toBeNull();
  });
});

describe('the Vault images tab', () => {
  // jsdom has no layout: the virtual grid gets a box to show its first rows in.
  stubLayout({ width: 800, height: 600 });

  it('writes a vault image chosen in the Vault images tab as the note\'s art, one write of the note, and closes', async () => {
    const { writer } = await pane();
    const dialog = await open();
    expect(within(dialog).queryByRole('button', { name: /Choose image/ })).toBeNull();
    await act(async () => { fireEvent.click(within(dialog).getByRole('radio', { name: 'Vault images' })); });
    expect(within(dialog).getByRole('textbox', { name: 'Search vault images' })).not.toBeNull();
    const plain = await within(dialog).findByRole('button', { name: 'plain' });
    expect(within(dialog).getByRole('button', { name: 'warden' }).getAttribute('aria-pressed')).toBe('true');
    await act(async () => { fireEvent.click(plain); });
    await settle();
    expect(writer.writes.at(-1)).toEqual({ path: NOTE_PATH, patches: [{ op: 'set', path: ['image'], base: WARDEN_ART, next: 'Art/plain.png' }] });
    expect(screen.queryByRole('dialog', { name: 'Token art' })).toBeNull();
  });
});

describe('closing the token panel', () => {
  it('closes on a press outside it', async () => {
    await pane();
    await open();
    await act(async () => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Token art' })).toBeNull());
  });
});
