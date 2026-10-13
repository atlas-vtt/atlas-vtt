import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { TFile } from 'obsidian';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SNAPSHOT_THUMBNAIL_SIZE, type ThumbnailSize } from '../../src/app/services/MapThumbnailService';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';
import { AssetService } from '../../src/app/services/AssetService';

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const ui = vi.hoisted(() => ({ current: { app: {}, view: {} } as { app: unknown; view: unknown } }));
const dialogs = vi.hoisted(() => ({ confirmAction: vi.fn() }));
const menu = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ui.current,
}));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal: menu.open }));
vi.mock('../../src/app/ui/confirmDialog', () => ({ confirmAction: dialogs.confirmAction }));

import { SceneSnapshotsPanel } from '../../src/app/react/components/command-palette/SceneSnapshotsPanel';

interface FakeView {
  viewId: string;
  file: TFile;
  saveMap: ReturnType<typeof vi.fn>;
  reloadActiveScene: ReturnType<typeof vi.fn>;
  serviceManager: { renderMapThumbnailWhenDrawn: ReturnType<typeof vi.fn<(size: ThumbnailSize) => Promise<ArrayBuffer>>> };
}

function mapWithGoblinAt(x: number): string {
  return JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, mapPath: MAP_PATH, objects: { tokens: { g: { id: 'g', x, y: 0, imagePath: 'goblin.webp' } } } } });
}

/** Renders the page for the map at `mapPath`; one in a collection folder becomes a scene when the vault is checked. */
async function renderPanel(mapPath = MAP_PATH): Promise<{ vault: InMemoryApp; view: FakeView; onClose: ReturnType<typeof vi.fn> }> {
  const vault = createInMemoryApp({ files: { [mapPath]: mapWithGoblinAt(10) } });
  AssetService.resetInstance();
  await AssetService.getInstance(vault.app).initialize();
  const view: FakeView = {
    viewId: 'view-1',
    file: new TFile(mapPath),
    saveMap: vi.fn(async () => {}),
    reloadActiveScene: vi.fn(async (rewrite: (file: TFile) => Promise<void>) => rewrite(new TFile(mapPath))),
    serviceManager: { renderMapThumbnailWhenDrawn: vi.fn(async () => new TextEncoder().encode('JPG').buffer) },
  };
  ui.current = { app: vault.app, view };
  const store = create(() => ({ mapPath }));
  const onClose = vi.fn();
  render(<ViewStoreProvider store={store}><SceneSnapshotsPanel onRestore={onClose} /></ViewStoreProvider>);
  return { vault, view, onClose };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  AssetService.resetInstance();
});

interface MenuItem { type: string; label?: string; onClick?: () => unknown }

/** Right-clicks the card and runs the context menu item labelled `label`. */
function chooseFromMenu(cardName: string, label: string): void {
  fireEvent.contextMenu(screen.getByRole('group', { name: cardName }));
  const entries = menu.open.mock.calls.at(-1)?.[0] as MenuItem[];
  act(() => { void entries.find((entry) => entry.label === label)?.onClick?.(); });
}

/** The goblin's x position stored in the only snapshot of the map. */
function savedGoblinX(vault: InMemoryApp): number | undefined {
  const path = [...vault.files.keys()].find((file) => file.endsWith('.json') && file.includes('/snapshots/'));
  const snapshot = path ? JSON.parse(vault.files.get(path)!) as { state: { objects: { tokens: { g: { x: number } } } } } : null;
  return snapshot?.state.objects.tokens.g.x;
}

async function saveSnapshot(): Promise<void> {
  // The page finds the scene's snapshot folder first; until then there is nowhere to save.
  await waitFor(() => expect(screen.getByRole('button', { name: /New snapshot/ }).hasAttribute('disabled')).toBe(false));
  const count = screen.queryAllByRole('group').length;
  fireEvent.click(screen.getByRole('button', { name: /New snapshot/ }));
  await waitFor(() => expect(screen.queryAllByRole('group')).toHaveLength(count + 1));
}

describe('scene snapshots page', () => {
  it('saves the current map under the next default name without asking', async () => {
    const { view } = await renderPanel();
    expect(await screen.findByText(/No snapshots yet/)).toBeTruthy();

    await saveSnapshot();
    await saveSnapshot();

    expect(screen.getAllByRole('group').map((card) => card.getAttribute('aria-label')).sort()).toEqual(['Snapshot 1', 'Snapshot 2']);
    expect(view.saveMap).toHaveBeenCalledTimes(2);
    // The map view's own thumbnail render, at the snapshot card's size: lit and without GM overlays like a scene card's
    expect(view.serviceManager.renderMapThumbnailWhenDrawn.mock.calls).toEqual([[SNAPSHOT_THUMBNAIL_SIZE], [SNAPSHOT_THUMBNAIL_SIZE]]);
    const thumbnail = screen.getByRole('button', { name: 'Restore Snapshot 1' }).querySelector('img');
    expect(thumbnail?.getAttribute('src')).toMatch(/^app:\/\/vault\/atlas-vtt\/collections\/c\/snapshots\/[^/]+\/.*\.jpg\?v=\d+$/);
  });

  it('renames in place: Enter keeps the new name, Escape cancels', async () => {
    await renderPanel();
    await saveSnapshot();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Snapshot 1' }));
    const input = screen.getByRole('textbox', { name: 'Snapshot name' });
    fireEvent.change(input, { target: { value: 'Boss fight' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('group', { name: 'Boss fight' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Boss fight' }));
    const again = screen.getByRole('textbox', { name: 'Snapshot name' });
    fireEvent.change(again, { target: { value: 'Discarded' } });
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('group', { name: 'Boss fight' })).toBeTruthy();
  });

  it('keeps the name when the rename loses focus, and never allows an empty name', async () => {
    await renderPanel();
    await saveSnapshot();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Snapshot 1' }));
    const input = screen.getByRole('textbox', { name: 'Snapshot name' });
    fireEvent.change(input, { target: { value: 'Ambush' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('group', { name: 'Ambush' })).toBeTruthy();

    chooseFromMenu('Ambush', 'Rename');
    const cleared = screen.getByRole('textbox', { name: 'Snapshot name' });
    fireEvent.change(cleared, { target: { value: '  ' } });
    fireEvent.blur(cleared);
    expect(screen.getByRole('group', { name: 'Ambush' })).toBeTruthy();
  });

  it('restores a snapshot into the map after confirmation and closes the palette', async () => {
    const { vault, view, onClose } = await renderPanel();
    await saveSnapshot();

    vault.files.set(MAP_PATH, mapWithGoblinAt(99));
    dialogs.confirmAction.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restore Snapshot 1' }));

    await waitFor(() => expect(view.reloadActiveScene).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    const map = JSON.parse(vault.files.get(MAP_PATH)!) as { state: { objects: { tokens: { g: { x: number } } } } };
    expect(map.state.objects.tokens.g.x).toBe(10);
  });

  it('leaves the map alone when the restore is not confirmed', async () => {
    const { view, onClose } = await renderPanel();
    await saveSnapshot();

    dialogs.confirmAction.mockResolvedValueOnce(false);
    chooseFromMenu('Snapshot 1', 'Restore');

    await waitFor(() => expect(dialogs.confirmAction).toHaveBeenCalled());
    expect(view.reloadActiveScene).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('overwrites a snapshot with the current map after confirmation', async () => {
    const { vault, view } = await renderPanel();
    await saveSnapshot();

    vault.files.set(MAP_PATH, mapWithGoblinAt(42));
    dialogs.confirmAction.mockResolvedValueOnce(false);
    chooseFromMenu('Snapshot 1', 'Overwrite with current map');
    await waitFor(() => expect(dialogs.confirmAction).toHaveBeenCalledTimes(1));
    expect(savedGoblinX(vault)).toBe(10);

    dialogs.confirmAction.mockResolvedValueOnce(true);
    chooseFromMenu('Snapshot 1', 'Overwrite with current map');
    await waitFor(() => expect(savedGoblinX(vault)).toBe(42));
    expect(view.serviceManager.renderMapThumbnailWhenDrawn).toHaveBeenLastCalledWith(SNAPSHOT_THUMBNAIL_SIZE);
    expect(view.serviceManager.renderMapThumbnailWhenDrawn).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('group', { name: 'Snapshot 1' })).toBeTruthy();
  });

  it('offers snapshots for a map outside every collection too, kept beside it', async () => {
    await renderPanel('Elsewhere/Loose.atlasmap');
    expect(await screen.findByText(/No snapshots yet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /New snapshot/ }).hasAttribute('disabled')).toBe(false);
  });

  it('deletes a snapshot from the context menu after confirmation', async () => {
    await renderPanel();
    await saveSnapshot();

    dialogs.confirmAction.mockResolvedValueOnce(true);
    chooseFromMenu('Snapshot 1', 'Delete');
    expect(await screen.findByText(/No snapshots yet/)).toBeTruthy();
  });
});
