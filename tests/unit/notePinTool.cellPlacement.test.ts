// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { App, TFolder } from 'obsidian';
import { NotePinTool } from '../../src/app/tools/NotePinTool';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { GridState } from '../../src/app/types/gridTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const MAP_PATH = 'maps/town.atlasmap';

type Store = ReturnType<typeof createViewAtlasStore>;

describe('NotePinTool placing a pin on a cell with Shift', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.empty();
  });

  function tool(grid: Partial<GridState>): { store: Store; eventBus: EventEmitter } {
    const { app } = createInMemoryApp({ files: { 'Notes/Inn.md': '' } });
    Object.assign(app.fileManager, { getNewFileParent: () => app.vault.getFolderByPath('Notes') as TFolder });
    Object.assign(app.vault, { getAllLoadedFiles: () => [] });
    const store = createViewAtlasStore(app as App, 'pin-cell-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(MAP_PATH);
    store.getState().setGrid({ ...store.getState().grid, ...grid } as GridState);
    store.temporal.getState().clear();
    const eventBus = new EventEmitter();
    const pinTool = new NotePinTool(eventBus, app as App, store);
    cleanup = () => pinTool.destroy();
    store.getState().setActiveTool('note-pin');
    return { store, eventBus };
  }

  /** Clicks with the tool and creates the note `Cellar` in the picker that opens. */
  async function placeAt(eventBus: EventEmitter, worldX: number, worldY: number, shiftKey: boolean): Promise<void> {
    eventBus.emit('canvas-click', { x: 0, y: 0, worldX, worldY, shiftKey });
    await Promise.resolve();
    const input = document.querySelector<HTMLInputElement>('#atlas-note-pin-dropdown .pin-search-input')!;
    input.value = 'Cellar';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const pins = (store: Store): unknown[] => Object.values(store.getState().objects.pins);

  it('puts the pin in the centre of the square under the pointer, as one undo step', async () => {
    const { store, eventBus } = tool({ type: 'square', size: 70, offsetX: 10, offsetY: 20, snapToGrid: false });
    await placeAt(eventBus, 100, 100, true);
    expect(pins(store)).toEqual([expect.objectContaining({ x: 115, y: 125, notePath: 'Notes/Cellar.md' })]);
    expect(pins(store)[0]).not.toHaveProperty('hex');
    expect(store.temporal.getState().pastStates).toHaveLength(1);
  });

  it('pins where clicked without Shift, also with Snap to grid on', async () => {
    const { store, eventBus } = tool({ type: 'square', size: 70, offsetX: 0, offsetY: 0, snapToGrid: true });
    await placeAt(eventBus, 100, 100, false);
    expect(pins(store)).toEqual([expect.objectContaining({ x: 100, y: 100 })]);
  });

  it('still links the hex under the pointer on a hex grid', async () => {
    const { store, eventBus } = tool({ type: 'hex-vertical', size: 70, offsetX: 0, offsetY: 0 });
    await placeAt(eventBus, 40, 45, true);
    const [pin] = pins(store) as { x: number; y: number; hex?: boolean }[];
    expect(pin?.hex).toBe(true);
    expect(pin?.x).toBeCloseTo(35);
    expect(pin?.y).toBeCloseTo(70 / Math.sqrt(3));
  });

  it('pins where clicked with Shift on a scene without a grid', async () => {
    const { store, eventBus } = tool({ enabled: false, type: 'square', size: 70, offsetX: 0, offsetY: 0 });
    await placeAt(eventBus, 100, 100, true);
    expect(pins(store)).toEqual([expect.objectContaining({ x: 100, y: 100 })]);
  });

  it('previews the pin in the centre of the highlighted square while Shift is held', () => {
    const { eventBus } = tool({ type: 'square', size: 70, offsetX: 0, offsetY: 0 });
    const cell = vi.fn();
    const pin = vi.fn();
    eventBus.on('hex-link-preview', cell);
    eventBus.on('pin-preview-update', pin);
    eventBus.emit('viewport-pointer-move', { worldX: 100, worldY: 30, shiftKey: true });
    expect(cell).toHaveBeenLastCalledWith({ x: 105, y: 35 });
    expect(pin).toHaveBeenLastCalledWith(expect.objectContaining({ x: 105, y: 35 }));
    eventBus.emit('viewport-pointer-move', { worldX: 100, worldY: 30, shiftKey: false });
    expect(pin).toHaveBeenLastCalledWith(expect.objectContaining({ x: 100, y: 30 }));
  });
});
