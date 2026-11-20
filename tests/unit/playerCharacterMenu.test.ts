import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { InteractionController } from '../../src/app/pixi/token-renderer/InteractionController';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { AssetService } from '../../src/app/services/AssetService';
import { RECORD_KEY } from '../../src/app/services/library/recordFile';
import { setPlayerCharacters } from '../../src/app/react/components/context-menu/playerCharacterMenu';
import { buildAssetContextMenuEntries, type AssetContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/assetContextMenu';
import type { TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';
import type { Token } from '../../src/app/types';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));

const FEN = 'atlas-vtt/collections/Fen';
const record = (id: string): Record<string, unknown> => ({
  format: 1, id, type: 'token', name: id, imagePath: `${FEN}/tokens/${id}.webp`, tags: [], collection: 'Fen', createdAt: 1, modifiedAt: 1,
});

const MAKE = 'Make player character';
const UNMAKE = 'No longer a player character';

async function library(): Promise<InMemoryApp & { assets: AssetService }> {
  AssetService.resetInstance();
  const vault = createInMemoryApp({
    files: {
      'atlas-vtt/library.json': JSON.stringify({ defaultCollectionId: 'Fen', vaultId: 'vault-a' }),
      [`${FEN}/collection.json`]: JSON.stringify({ uid: 'uid-fen', version: 1, tags: {}, settings: {}, createdAt: 1, modifiedAt: 1 }),
      ...Object.fromEntries(['ranger', 'wolf'].flatMap((id) => [
        [`${FEN}/tokens/${id}.webp`, 'IMG'],
        [`${FEN}/tokens/${id}.json`, JSON.stringify({ [RECORD_KEY]: record(id) })],
      ])),
    },
    folders: ['atlas-vtt/collections'],
  });
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return { ...vault, assets };
}

const itemLabels = (entries: readonly ContextMenuEntry[]): string[] => entries.flatMap((entry) => (entry.type === 'item' ? [entry.label] : []));

function click(entries: readonly ContextMenuEntry[], label: string): void {
  const item = entries.find((entry) => entry.type === 'item' && entry.label === label);
  if (item?.type !== 'item') throw new Error(`no "${label}" item`);
  void item.onClick();
}

beforeEach(() => AssetService.resetInstance());

describe('the map token menu', () => {
  async function setup(isPlayerView = false) {
    const vault = await library();
    const store = createViewAtlasStore(vault.app, `pc-${Math.random()}`);
    const tokens: Record<string, Token> = {
      named: { id: 'named', kind: 'token', imagePath: 'elsewhere.webp', assetId: 'ranger', x: 0, y: 0 },
      older: { id: 'older', kind: 'token', imagePath: `${FEN}/tokens/wolf.webp`, x: 0, y: 0 },
      stranger: { id: 'stranger', kind: 'token', imagePath: 'loose.png', x: 0, y: 0 },
    };
    store.setState({ persistenceEnabled: false, activeTool: 'select', objects: { ...store.getState().objects, tokens } });
    const controller = new InteractionController({} as Viewport, store, {} as GridSystem, {} as EventEmitter, vault.app as unknown as App, isPlayerView);
    const rightClick = (id: string): ContextMenuEntry[] => {
      controller.handleViewportTokenPointerDown(
        id, { button: 2, stopPropagation: () => {}, clientX: 0, clientY: 0, global: { x: 0, y: 0 } } as unknown as FederatedPointerEvent,
      );
      return opened.entries;
    };
    return { ...vault, store, rightClick };
  }

  it('never offers to make a placed token a player character: that is the asset manager\'s', async () => {
    const labels = itemLabels((await setup()).rightClick('named'));
    expect(labels).not.toContain(MAKE);
    expect(labels).not.toContain(UNMAKE);
    expect(labels).toContain('Edit token');
  });
});

describe('the asset manager card menu', () => {
  const card = (id: string, playerCharacter?: true): TokenAsset => ({
    id, name: id, type: 'tokens', imageUrl: '', imagePath: `${FEN}/tokens/${id}.webp`, modifiedAt: 0, ...(playerCharacter && { playerCharacter }),
  });

  function entriesFor(app: App, assets: AssetService, clicked: TokenAsset, selected: TokenAsset[]): ContextMenuEntry[] {
    const deps = { app, assetService: assets, folders: [], transferTargets: [], selectedAssetIds: selected.map((a) => a.id), assets: selected } as unknown as AssetContextMenuDeps;
    return buildAssetContextMenuEntries(clicked, selected, deps);
  }

  it('marks every selected token the way the clicked card decides', async () => {
    const { app, assets } = await library();
    const ranger = card('ranger');
    const wolf = card('wolf', true);
    click(entriesFor(app as unknown as App, assets, ranger, [ranger, wolf]), MAKE);
    await vi.waitFor(async () => {
      expect(await assets.getAssetById('ranger')).toMatchObject({ playerCharacter: true });
      expect(await assets.getAssetById('wolf')).toMatchObject({ playerCharacter: true });
    });

    click(entriesFor(app as unknown as App, assets, card('wolf', true), [card('wolf', true)]), UNMAKE);
    await vi.waitFor(async () => expect(await assets.getAssetById('wolf')).not.toHaveProperty('playerCharacter'));
  });
});

describe('marking player characters', () => {
  it('tells the lists to reload even when the save fails', async () => {
    const { app } = createInMemoryApp();
    const failing = { setPlayerCharacters: vi.fn(async () => { throw new Error('disk full'); }) } as unknown as AssetService;
    await expect(setPlayerCharacters(app as unknown as App, failing, ['ranger'], true)).rejects.toThrow('disk full');
    expect(app.workspace.trigger).toHaveBeenCalledWith('atlas-vtt:refresh-assets');
  });
});
