// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { NotePinTool } from '../../src/app/tools/NotePinTool';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { canRunMapHotkeys } from '../../src/app/keyboard/mapHotkeys';
import { showNotice } from '../../src/app/ui/notice';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

const VIEW_ID = 'pin-picker-view';

type Store = ReturnType<typeof createViewAtlasStore>;

describe('The note pin picker', () => {
  let store: Store;
  let eventBus: EventEmitter;
  let tool: NotePinTool;

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.mocked(showNotice).mockClear();
    // The map's shortcuts run only for the view of the active leaf
    document.body.createDiv({ cls: 'workspace-leaf mod-active' }).createDiv({ attr: { 'data-view-id': VIEW_ID } });
    const { app } = createInMemoryApp({ files: { 'Notes/Dunmore.md': '' } });
    Object.assign(app.vault, { getAllLoadedFiles: () => app.vault.getFiles() });
    store = createViewAtlasStore(app, VIEW_ID);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/world.atlasmap');
    eventBus = new EventEmitter();
    tool = new NotePinTool(eventBus, app, store);
    store.getState().setActiveTool('note-pin');
  });

  afterEach(() => {
    tool.destroy();
    document.body.empty();
  });

  const picker = (): HTMLElement | null => document.getElementById('atlas-note-pin-dropdown');
  const search = (): HTMLInputElement => picker()!.querySelector<HTMLInputElement>('.pin-search-input')!;
  const pins = (): unknown[] => Object.values(store.getState().objects.pins);
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  async function open(worldX = 300, worldY = 200): Promise<HTMLElement> {
    eventBus.emit('canvas-click', { x: 0, y: 0, worldX, worldY, shiftKey: false });
    await Promise.resolve();
    return picker()!;
  }

  /** Presses `key` on `target` as a keyboard does, and says whether the map's shortcuts may take it. */
  function pressOn(target: HTMLElement, key: string): boolean {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return canRunMapHotkeys(event, VIEW_ID);
  }

  it('keeps a key pressed on one of its buttons from the map, whose D would hide every pin', async () => {
    expect(pressOn(document.body, 'd')).toBe(true);
    const dropdown = await open();
    const icon = dropdown.querySelector<HTMLButtonElement>('.pin-icon-row [data-icon="combat"]')!;
    icon.click();
    icon.focus();

    expect(pressOn(icon, 'd')).toBe(false);
    expect(pressOn(icon, 'Tab')).toBe(false);
    // Typed on a button, a name is meant for the search
    expect(document.activeElement).toBe(search());
  });

  it('gives the map its shortcuts back once it has closed', async () => {
    const dropdown = await open();
    const icon = dropdown.querySelector<HTMLButtonElement>('.pin-icon-row [data-icon="combat"]')!;
    icon.focus();
    pressOn(icon, 'Escape');
    await settle();

    expect(picker()).toBeNull();
    expect(pins()).toEqual([]);
    expect(pressOn(document.body, 'd')).toBe(true);
  });

  it('places nothing in the players\' view, where no pin shows, and says why', async () => {
    store.getState().setGMView(false);
    await open();

    expect(picker()).toBeNull();
    expect(showNotice).toHaveBeenCalledWith('Switch to GM View (D) to place pins');

    store.getState().setGMView(true);
    await open();
    search().value = 'Dunmore';
    search().dispatchEvent(new Event('input'));
    search().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(pins()).toEqual([expect.objectContaining({ x: 300, y: 200, notePath: 'Notes/Dunmore.md' })]);
  });

  it('shows the pin under the pointer again after another tool closed it', async () => {
    const preview = vi.fn();
    eventBus.on('pin-preview-update', preview);
    await open();

    store.getState().setActiveTool('move');
    expect(picker()).toBeNull();
    // The placement that waited for the picker ends, and with it the hold on the preview
    await new Promise((resolve) => setTimeout(resolve, 200));
    store.getState().setActiveTool('note-pin');
    preview.mockClear();
    eventBus.emit('viewport-pointer-move', { worldX: 40, worldY: 50, shiftKey: false });

    expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ x: 40, y: 50 }));
    expect(pins()).toEqual([]);
  });
});
