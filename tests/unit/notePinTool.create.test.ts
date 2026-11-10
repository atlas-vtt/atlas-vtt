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
  Object.assign(app.fileManager, { getNewFileParent });
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

  async function openDropdown(): Promise<{ store: ReturnType<typeof createViewAtlasStore>; input: HTMLInputElement }> {
    const { app } = vaultWithNotesFolder({ 'Notes/Inn.md': '' });
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
    return { store, input };
  }

  const typeAndPress = (input: HTMLInputElement, value: string, key: string): void => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  };
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it('pins the note it created', async () => {
    const { store, input } = await openDropdown();
    expect(document.querySelector('.pin-create-item')).toBeNull();

    typeAndPress(input, 'Cellar', 'Enter');
    await settle();

    const pins = Object.values(store.getState().objects.pins);
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ x: 40, y: 60, notePath: 'Notes/Cellar.md' });
    expect(document.getElementById('atlas-note-pin-dropdown')).toBeNull();
  });

  it('places no pin for a name that cannot be a note', async () => {
    const { store, input } = await openDropdown();
    typeAndPress(input, 'A/B', 'Enter');
    await settle();
    expect(Object.keys(store.getState().objects.pins)).toHaveLength(0);
  });
});
