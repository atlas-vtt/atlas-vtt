// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';

vi.mock('../../../../src/app/statblocks/render/LinkedStatblock', () => ({ LinkedStatblock: () => null }));
vi.mock('../../../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: vi.fn() } }));
vi.mock('../../../../src/app/statblocks/editor/openStatblockEditor', () => ({ openStatblockEditor: vi.fn(async () => undefined) }));
vi.mock('../../../../src/app/statblocks/editor/create/createFlow', () => ({ createStatblock: vi.fn(async () => null) }));

import StatblockLinkModal from '../../../../src/app/packages/components/asset-manager/StatblockLinkModal';
import { buildAssetContextMenuEntries, type AssetContextMenuDeps } from '../../../../src/app/packages/components/asset-manager/contextMenus/assetContextMenu';
import { useAssetCardHandlers } from '../../../../src/app/packages/components/asset-manager/hooks/useAssetCardHandlers';
import type { TokenAsset } from '../../../../src/app/packages/components/asset-manager/types';
import { AssetService } from '../../../../src/app/services/AssetService';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { createStatblock } from '../../../../src/app/statblocks/editor/create/createFlow';
import { openStatblockEditor } from '../../../../src/app/statblocks/editor/openStatblockEditor';
import type { RoleChoice } from '../../../../src/app/statblocks/editor/create/roleChoices';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { noteHarness, type NoteHarness } from '../notes/noteHarness';

const NATIVE = 'Bestiary/Marsh Warden.md';
const FANTASY = 'Bestiary/Goblin.md';
const WARDEN: TokenAsset = { id: 't1', name: 'Marsh Warden', type: 'tokens', imageUrl: 'app://art/warden.webp', imagePath: 'art/warden.webp', modifiedAt: 0 };

let harness: NoteHarness;
const app = (): App => harness.app as unknown as App;

beforeEach(() => {
  harness = noteHarness({
    [NATIVE]: '---\nstatblock: true\natlas-template: builtin:generic-creature\nname: Marsh Warden\n---\n',
    [FANTASY]: '---\nstatblock: true\nname: Goblin\n---\n',
  });
  Object.assign(harness.app.workspace, { openLinkText: vi.fn(async () => undefined) });
  Object.assign(harness.app.vault, { getMarkdownFiles: () => [] });
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getDefaultCollectionId: () => 'default',
    getCollectionSettings: () => ({ conditions: [] }),
  } as unknown as AssetService);
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  TemplateLibrary.release(app());
  vi.restoreAllMocks();
  vi.mocked(openStatblockEditor).mockClear();
  vi.mocked(createStatblock).mockClear();
});

function cardMenu(asset: TokenAsset): { labels: string[]; entries: ReturnType<typeof buildAssetContextMenuEntries>; onClose: ReturnType<typeof vi.fn> } {
  const onClose = vi.fn();
  const deps = { app: app(), onClose, folders: [], transferTargets: [], selectedAssetIds: [asset.id], assets: [asset], collectionId: 'marsh' } as unknown as AssetContextMenuDeps;
  const entries = buildAssetContextMenuEntries(asset, [asset], deps);
  return { entries, onClose, labels: entries.flatMap((entry) => (entry.type === 'custom' ? [] : [entry.label])) };
}

describe('the token card\'s menu', () => {
  it('offers Create statblock for a token without one, only while the switch is on', () => {
    expect(cardMenu(WARDEN).labels).not.toContain('Create statblock');
    withStatblockEditor(app());
    expect(cardMenu({ ...WARDEN, statblockPath: NATIVE }).labels).not.toContain('Create statblock');

    const { entries, onClose, labels } = cardMenu(WARDEN);
    expect(labels.indexOf('Create statblock')).toBe(labels.indexOf('Link Statblock') + 1);
    const create = entries.find((entry) => entry.type === 'submenu' && entry.label === 'Create statblock');
    if (create?.type !== 'submenu' || typeof create.children === 'function') throw new Error('expected the role menu');
    const first = create.children[0];
    if (first?.type === 'item') void first.onClick();
    expect(onClose).toHaveBeenCalled();
    expect(createStatblock).toHaveBeenCalledWith(app(), expect.objectContaining({
      collectionId: 'marsh', roleId: 'creature', name: 'Marsh Warden', tokenImagePath: 'art/warden.webp', from: 'asset-manager',
    }));
  });
});

describe('the card\'s statblock button (D9)', () => {
  function handlers(): { open: (path: string) => void; onClose: ReturnType<typeof vi.fn> } {
    const onClose = vi.fn();
    const { result } = renderHook(() => useAssetCardHandlers({
      app: app(), openAsset: vi.fn(), selectedAssetIds: [], setDraggedItems: vi.fn(),
      onAssetSelect: vi.fn(), onAssetContextMenu: vi.fn(), onSpawnCountChange: vi.fn(), onArtNeeded: vi.fn(), onClose,
    }));
    return { open: (path) => result.current.onOpenStatblock(path), onClose };
  }

  it('opens a native statblock\'s note and gets the asset manager out of the way', () => {
    withStatblockEditor(app());
    const { open, onClose } = handlers();
    open(NATIVE);
    expect(openStatblockEditor).toHaveBeenCalledWith(app(), { notePath: NATIVE, collectionId: null, from: 'asset-manager' });
    expect(onClose).toHaveBeenCalled();
  });

  it('opens the note as before while the switch is off', () => {
    const { open, onClose } = handlers();
    open(NATIVE);
    open(FANTASY);
    expect(harness.app.workspace.openLinkText).toHaveBeenCalledWith('', NATIVE, true);
    expect(harness.app.workspace.openLinkText).toHaveBeenCalledWith('', FANTASY, true);
    expect(openStatblockEditor).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens a Fantasy Statblocks statblock\'s note as before (M6)', () => {
    withStatblockEditor(app());
    const { open } = handlers();
    open(FANTASY);
    expect(harness.app.workspace.openLinkText).toHaveBeenCalledWith('', FANTASY, true);
    expect(openStatblockEditor).not.toHaveBeenCalled();
  });
});

describe('the link dialog\'s New statblock…', () => {
  const MONSTER: RoleChoice = { roleId: 'monster', name: 'Monster', templateName: 'Creature' };
  const NPC: RoleChoice = { roleId: 'npc', name: 'NPC', templateName: 'NPC' };

  function dialog(choices?: RoleChoice[]): { onClose: ReturnType<typeof vi.fn>; onChoose: ReturnType<typeof vi.fn> } {
    const onClose = vi.fn();
    const onChoose = vi.fn();
    render(
      <StatblockLinkModal
        isOpen
        onClose={onClose}
        asset={{ name: 'Marsh Warden' }}
        onLink={vi.fn()}
        app={app()}
        {...(choices ? { newStatblock: { choices, onChoose } } : {})}
      />,
    );
    return { onClose, onChoose };
  }

  it('is absent without the option, which the statblock editor\'s switch gives', () => {
    dialog();
    expect(screen.queryByRole('button', { name: /New statblock/ })).toBeNull();
  });

  it('closes the dialog and creates with the one role', () => {
    const { onClose, onChoose } = dialog([MONSTER]);
    fireEvent.click(screen.getByRole('button', { name: 'New statblock' }));
    expect(onClose).toHaveBeenCalled();
    expect(onChoose).toHaveBeenCalledWith('monster');
  });

  it('leaves Escape to its role menu while the menu is open', async () => {
    const { onClose, onChoose } = dialog([MONSTER, NPC]);
    const trigger = screen.getByRole('button', { name: 'New statblock…' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    await act(async () => { fireEvent.keyDown(menu, { key: 'Escape' }); });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /NPC/ }));
    expect(onClose).toHaveBeenCalled();
    expect(onChoose).toHaveBeenCalledWith('npc');
  });
});
