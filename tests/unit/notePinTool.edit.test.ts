// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { NotePinTool } from '../../src/app/tools/NotePinTool';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

let cleanup: (() => void) | null = null;

function setup(icon: string): { store: ReturnType<typeof createViewAtlasStore>; pinId: string } {
  const { app } = createInMemoryApp({ files: { 'notes/Tavern.md': '# Tavern' } });
  // The dropdown lists the vault's notes and maps
  Object.assign(app.vault, { getAllLoadedFiles: () => [] });
  const store = createViewAtlasStore(app, 'pin-edit-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/town.atlasmap');
  const tool = new NotePinTool(new EventEmitter(), app, store);
  const pinId = store.getState().addNotePin(10, 20, 'notes/Tavern.md', icon);
  cleanup = () => tool.destroy();
  return { store, pinId };
}

async function editPin(store: ReturnType<typeof createViewAtlasStore>, pinId: string): Promise<HTMLElement> {
  const pin = store.getState().objects.pins[pinId];
  window.dispatchEvent(new CustomEvent('atlas-pin-action', { detail: { action: 'edit', pin } }));
  await Promise.resolve();
  return document.getElementById('atlas-note-pin-dropdown')!;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('NotePinTool editing a pin', () => {
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('applies a picked icon at once, keeps the linked note and closes', async () => {
    const { store, pinId } = setup('pin');
    const dropdown = await editPin(store, pinId);

    dropdown.querySelector<HTMLButtonElement>('.pin-icon-row [data-icon="combat"]')!.click();
    await settle();

    expect(store.getState().objects.pins[pinId]).toMatchObject({ icon: 'combat', notePath: 'notes/Tavern.md' });
    expect(document.getElementById('atlas-note-pin-dropdown')).toBeNull();
  });

  it('applies a place picked in the location flyout', async () => {
    const { store, pinId } = setup('pin');
    const dropdown = await editPin(store, pinId);

    dropdown.querySelector<HTMLButtonElement>('.pin-place-flyout [data-icon="manor"]')!.click();
    await settle();

    expect(store.getState().objects.pins[pinId]).toMatchObject({ icon: 'manor', notePath: 'notes/Tavern.md' });
    expect(document.getElementById('atlas-note-pin-dropdown')).toBeNull();
  });

  it('leaves the pin untouched when its current icon is picked again', async () => {
    const { store, pinId } = setup('combat');
    const pinsBefore = store.getState().objects.pins;
    const dropdown = await editPin(store, pinId);

    dropdown.querySelector<HTMLButtonElement>('.pin-icon-row [data-icon="combat"]')!.click();
    await settle();

    expect(store.getState().objects.pins).toBe(pinsBefore);
  });

  it('does not start listening for outside clicks once it has closed', async () => {
    const { store, pinId } = setup('pin');
    await editPin(store, pinId);
    const listen = vi.spyOn(document, 'addEventListener');

    cleanup?.();
    cleanup = null;
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(listen.mock.calls.filter(([type]) => type === 'mousedown')).toHaveLength(0);
    listen.mockRestore();
  });
});
