import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { EventEmitter } from 'events';
import type { App, TFile } from 'obsidian';
import { InteractionController } from '../../../../src/app/pixi/token-renderer/InteractionController';
import type { GridSystem } from '../../../../src/app/grid/GridSystem';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import type { ContextMenuEntry } from '../../../../src/app/react/components/context-menu/AtlasContextMenu';
import { AssetService } from '../../../../src/app/services/AssetService';
import { StatblockDialogService } from '../../../../src/app/services/StatblockDialogService';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { frontmatterOfText } from '../../../../src/app/statblocks/notes/statblockSource';
import { createStatblock } from '../../../../src/app/statblocks/editor/create/createFlow';
import { openStatblockEditor } from '../../../../src/app/statblocks/editor/openStatblockEditor';
import type { Character } from '../../../../src/app/types';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));
vi.mock('../../../../src/app/services/StatblockDialogService', () => ({
  StatblockDialogService: vi.fn(function StatblockDialogService(this: { showStatblockDialog: unknown }) {
    this.showStatblockDialog = vi.fn();
  }),
}));
vi.mock('../../../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: vi.fn(() => ({})) } }));
vi.mock('../../../../src/app/statblocks/editor/openStatblockEditor', () => ({ openStatblockEditor: vi.fn(async () => undefined) }));
vi.mock('../../../../src/app/statblocks/editor/create/createFlow', () => ({ createStatblock: vi.fn(async () => null) }));

const NATIVE = 'Bestiary/Marsh Warden.md';
const FANTASY = 'Bestiary/Goblin.md';
const MAP = 'atlas-vtt/collections/marsh/scenes/Village.atlasmap';

function setup(statblockPath?: string, editorOn = true): { app: App; store: ReturnType<typeof createViewAtlasStore>; rightClick: () => void } {
  const { app, files } = createInMemoryApp({
    files: {
      [NATIVE]: '---\nstatblock: true\natlas-template: builtin:generic-creature\nname: Marsh Warden\n---\n',
      [FANTASY]: '---\nstatblock: true\nname: Goblin\n---\n',
    },
  });
  app.metadataCache.getFileCache = vi.fn((file: TFile) => ({ frontmatter: frontmatterOfText(files.get(file.path) ?? '') ?? undefined }));
  Object.assign(app.workspace, { openLinkText: vi.fn(async () => undefined) });
  if (editorOn) withStatblockEditor(app);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    getDefaultCollectionId: () => 'default',
    getCollectionSettings: () => ({ conditions: [] }),
    getCollectionForMap: (path: string) => (path === MAP ? 'marsh' : null),
    // The token was placed from no library token, so it can be no player character.
    loadedTokenAssets: () => [],
  } as unknown as AssetService);

  const store = createViewAtlasStore(app, `statblock-menu-${Math.random()}`);
  const warden = { id: 'w', kind: 'character', imagePath: 'art/warden.webp', x: 0, y: 0, name: 'Marsh Warden', ...(statblockPath ? { statblockPath } : {}) } as Character;
  store.setState({ persistenceEnabled: false, mapPath: MAP, activeTool: 'select', selectedIds: [], objects: { ...store.getState().objects, tokens: { w: warden } } });
  const controller = new InteractionController({} as Viewport, store, {} as GridSystem, {} as EventEmitter, app as unknown as App);
  const rightClick = (): void => controller.handleViewportTokenPointerDown(
    'w', { button: 2, stopPropagation: () => {}, clientX: 0, clientY: 0, global: { x: 0, y: 0 } } as unknown as FederatedPointerEvent,
  );
  return { app: app as unknown as App, store, rightClick };
}

const labels = (): string[] => opened.entries.flatMap((entry) => (entry.type === 'custom' ? [] : [entry.label]));
const entryNamed = (label: string): ContextMenuEntry | undefined =>
  opened.entries.find((entry) => entry.type !== 'custom' && entry.label === label);

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(openStatblockEditor).mockClear();
  vi.mocked(createStatblock).mockClear();
  opened.entries = [];
});

describe('the map token menu and statblocks', () => {
  it('shows only Link statblock while the switch is off, and gives its dialog no New statblock', () => {
    const { app, rightClick } = setup(undefined, false);
    rightClick();
    expect(labels()).toContain('Link statblock…');
    expect(labels()).not.toContain('Create statblock');

    const link = entryNamed('Link statblock…');
    if (link?.type === 'item') void link.onClick();
    const dialog = vi.mocked(StatblockDialogService).mock.instances.at(-1) as unknown as { showStatblockDialog: ReturnType<typeof vi.fn> };
    expect(dialog.showStatblockDialog.mock.calls[0]?.[4]).toBeUndefined();
    TemplateLibrary.release(app);
  });

  it('offers Create statblock beside Link statblock, with the map\'s collection, linking the token on this map', async () => {
    const { app, store, rightClick } = setup();
    rightClick();
    const names = labels();
    expect(names.indexOf('Create statblock')).toBe(names.indexOf('Link statblock…') + 1);

    const create = entryNamed('Create statblock');
    if (create?.type !== 'submenu' || typeof create.children === 'function') throw new Error('expected the role menu');
    const creature = create.children[0];
    if (creature?.type === 'item') void creature.onClick();
    const creation = vi.mocked(createStatblock).mock.calls[0]![1];
    expect(creation).toEqual(expect.objectContaining({
      collectionId: 'marsh', roleId: 'creature', name: 'Marsh Warden', tokenImagePath: 'art/warden.webp', from: 'map',
    }));
    creation.onLinked?.(NATIVE);
    expect(store.getState().objects.tokens.w).toEqual(expect.objectContaining({ statblockPath: NATIVE }));

    const link = entryNamed('Link statblock…');
    if (link?.type === 'item') void link.onClick();
    const dialog = vi.mocked(StatblockDialogService).mock.instances.at(-1) as unknown as { showStatblockDialog: ReturnType<typeof vi.fn> };
    expect(dialog.showStatblockDialog.mock.calls[0]?.[4]).toEqual(expect.objectContaining({ choices: expect.any(Array) }));
    TemplateLibrary.release(app);
  });

  it('offers nothing about the statblock of a token that has one: editing and unlinking are the asset manager\'s', () => {
    const { rightClick } = setup(NATIVE);
    rightClick();
    expect(labels()).toContain('Edit token');
    for (const label of ['Edit Statblock', 'Unlink statblock', 'Link statblock…', 'Create statblock']) expect(labels()).not.toContain(label);
  });
});
