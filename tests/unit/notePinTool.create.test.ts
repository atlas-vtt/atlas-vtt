// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { App, TFolder } from 'obsidian';
import { NotePinTool } from '../../src/app/tools/NotePinTool';
import { noteCreateEntry } from '../../src/app/tools/pinCreateEntries';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const MAP_PATH = 'maps/town.atlasmap';

/** A vault with Obsidian's folder for new notes set to `Notes`. */
function vaultWithNotesFolder(files: Record<string, string>): { app: App; getNewFileParent: ReturnType<typeof vi.fn> } {
  const { app } = createInMemoryApp({ files });
  const getNewFileParent = vi.fn(() => app.vault.getFolderByPath('Notes') as TFolder);
  Object.assign(app.fileManager, { getNewFileParent, generateMarkdownLink: vi.fn((file: { path: string }, _source: string, subpath?: string, alias?: string) => `[[${file.path}${subpath ?? ''}|${alias ?? ''}]]`) });
  // The dropdown lists the vault's notes and maps
  Object.assign(app.vault, { getAllLoadedFiles: () => [] });
  return { app, getNewFileParent };
}

describe('noteCreateEntry', () => {
  it('creates an empty note in the folder for new notes, seen from the map', async () => {
    const { app, getNewFileParent } = vaultWithNotesFolder({ 'Notes/Inn.md': '' });
    const path = await noteCreateEntry(app, MAP_PATH).create('Cellar');
    expect(getNewFileParent).toHaveBeenCalledWith(MAP_PATH);
    expect(path).toEqual({ path: 'Notes/Cellar.md' });
    expect(await app.vault.adapter.read('Notes/Cellar.md')).toBe('');
  });

  it('numbers a name the folder already holds, in any letter case', async () => {
    const { app } = vaultWithNotesFolder({ 'Notes/Inn.md': '', 'Notes/inn 2.md': '' });
    expect(await noteCreateEntry(app, MAP_PATH).create('Inn')).toEqual({ path: 'Notes/Inn 3.md' });
  });
});

describe('NotePinTool creating a note', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.empty();
  });

  async function openDropdown(): Promise<{ app: App; store: ReturnType<typeof createViewAtlasStore>; input: HTMLInputElement }> {
    const { app } = vaultWithNotesFolder({ 'Notes/Inn.md': '', [MAP_PATH]: '{}' });
    const store = createViewAtlasStore(app, 'pin-create-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(MAP_PATH);
    const eventBus = new EventEmitter();
    const tool = new NotePinTool(eventBus, app, store);
    cleanup = () => tool.destroy();
    store.getState().setActiveTool('note-pin');
    eventBus.emit('canvas-click', { x: 0, y: 0, worldX: 40, worldY: 60, shiftKey: false });
    await Promise.resolve();
    const input = document.querySelector<HTMLInputElement>('#atlas-note-pin-dropdown .pin-search-input')!;
    return { app, store, input };
  }

  const typeAndPress = (input: HTMLInputElement, value: string, key: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  };
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it('pins the note it created', async () => {
    const { app, store, input } = await openDropdown();
    expect(document.querySelector('.pin-create-item')).toBeNull();

    typeAndPress(input, 'Cellar', 'Enter');
    await settle();

    const pins = Object.values(store.getState().objects.pins);
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ x: 40, y: 60, notePath: 'Notes/Cellar.md' });
    const note = app.vault.getFileByPath('Notes/Cellar.md')!;
    expect(await app.vault.read(note)).toBe(`[[${MAP_PATH}#pin=${encodeURIComponent(pins[0]!.id)}|View on map - Cellar]]\n`);
    expect(document.getElementById('atlas-note-pin-dropdown')).toBeNull();
  });

  it('adds the return link when opening a pin recreates its deleted note', async () => {
    const { app } = vaultWithNotesFolder({ [MAP_PATH]: '{}' });
    const store = createViewAtlasStore(app, 'pin-recreated-note-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(MAP_PATH);
    Object.assign(app.workspace, {
      openLinkText: vi.fn(async () => {
        await app.vault.create('Notes/Deleted.md', 'Recreated note');
      }),
    });
    const tool = new NotePinTool(new EventEmitter(), app, store);
    cleanup = () => tool.destroy();

    const id = store.getState().addNotePin(40, 60, 'Notes/Deleted.md');
    const pin = store.getState().objects.pins[id]!;
    tool.openLinkedNote(pin);
    await settle();

    const note = app.vault.getFileByPath('Notes/Deleted.md')!;
    expect(await app.vault.read(note)).toBe(
      `Recreated note\n\n[[${MAP_PATH}#pin=${encodeURIComponent(id)}|View on map - Deleted]]\n`,
    );
  });

  it('updates the existing backlink when a pin is renamed', async () => {
    const { app } = vaultWithNotesFolder({ 'Notes/Inn.md': 'An inn', [MAP_PATH]: '{}' });
    const store = createViewAtlasStore(app, 'pin-rename-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(MAP_PATH);
    store.getState().setMapLoaded(true);
    const tool = new NotePinTool(new EventEmitter(), app, store);
    cleanup = () => tool.destroy();

    const id = store.getState().addNotePin(40, 60, 'Notes/Inn.md');
    const note = app.vault.getFileByPath('Notes/Inn.md')!;
    await app.vault.process(note, () => `An inn\n\n[[${MAP_PATH}#pin=${encodeURIComponent(id)}|View on map - Inn]]\n`);

    store.getState().updateNotePin(id, { name: 'The Market' });
    await settle();

    expect(await app.vault.read(note)).toBe(
      `An inn\n\n[[${MAP_PATH}#pin=${encodeURIComponent(id)}|View on map - The Market]]\n`,
    );
  });

  it('keeps the backlink when a map reload temporarily clears its pins', async () => {
    const { app } = vaultWithNotesFolder({ 'Notes/Inn.md': 'An inn', [MAP_PATH]: '{}' });
    const store = createViewAtlasStore(app, 'pin-reload-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(MAP_PATH);
    store.getState().setMapLoaded(true);
    const tool = new NotePinTool(new EventEmitter(), app, store);
    cleanup = () => tool.destroy();

    const id = store.getState().addNotePin(40, 60, 'Notes/Inn.md');
    const note = app.vault.getFileByPath('Notes/Inn.md')!;
    await app.vault.process(note, () =>
      `An inn\n\n[[${MAP_PATH}#pin=${encodeURIComponent(id)}|View on map - Inn]]\n`,
    );

    store.getState().setMapLoading(true);
    store.getState().clearMapState();
    store.getState().setMapLoading(false);
    store.getState().setMapLoaded(true);
    await settle();

    expect(await app.vault.read(note)).toBe(
      `An inn\n\n[[${MAP_PATH}#pin=${encodeURIComponent(id)}|View on map - Inn]]\n`,
    );
  });

  it('removes only the deleted pin backlink from its note', async () => {
    const { app } = vaultWithNotesFolder({ 'Notes/Inn.md': 'An inn', [MAP_PATH]: '{}' });
    const store = createViewAtlasStore(app, 'pin-delete-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(MAP_PATH);
    store.getState().setMapLoaded(true);
    const tool = new NotePinTool(new EventEmitter(), app, store);
    cleanup = () => tool.destroy();

    const firstId = store.getState().addNotePin(40, 60, 'Notes/Inn.md');
    const secondId = store.getState().addNotePin(80, 90, 'Notes/Inn.md');
    const note = app.vault.getFileByPath('Notes/Inn.md')!;
    await app.vault.process(note, () =>
      `An inn\n\n[[${MAP_PATH}#pin=${encodeURIComponent(firstId)}|View on map - Inn]]\n[[${MAP_PATH}#pin=${encodeURIComponent(secondId)}|View on map - Inn]]\n`,
    );

    store.getState().deleteNotePin(firstId);
    await settle();

    expect(await app.vault.read(note)).toBe(
      `An inn\n\n[[${MAP_PATH}#pin=${encodeURIComponent(secondId)}|View on map - Inn]]\n`,
    );
  });

  it('places no pin for a name that cannot be a note', async () => {
    const { store, input } = await openDropdown();
    typeAndPress(input, 'A/B', 'Enter');
    await settle();
    expect(Object.keys(store.getState().objects.pins)).toHaveLength(0);
  });
});
