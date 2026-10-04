import { describe, expect, it } from 'vitest';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function viewStore(): ViewAtlasStore {
  const store = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `toolbar-editing-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  return store;
}

describe('toolbar edit mode in the view store', () => {
  it('is off in a new view', () => {
    expect(viewStore().getState().isToolbarEditing).toBe(false);
  });

  it('closes the dice tray when it starts, which hangs where the tray goes', () => {
    const store = viewStore();
    store.getState().setDiceTrayOpen(true);
    store.getState().setToolbarEditing(true);
    expect(store.getState()).toMatchObject({ isToolbarEditing: true, isDiceTrayOpen: false });
  });

  it.each([
    ['the command palette', (store: ViewAtlasStore): void => store.getState().setCommandPaletteOpen(true)],
    ['the dice tray', (store: ViewAtlasStore): void => store.getState().setDiceTrayOpen(true)],
    ['the asset manager', (store: ViewAtlasStore): void => store.getState().openAssetManager()],
  ])('ends when %s opens', (_panel, open) => {
    const store = viewStore();
    store.getState().setToolbarEditing(true);
    open(store);
    expect(store.getState().isToolbarEditing).toBe(false);
  });

  it('stays on when those panels close', () => {
    const store = viewStore();
    store.getState().setToolbarEditing(true);
    store.getState().setCommandPaletteOpen(false);
    store.getState().setDiceTrayOpen(false);
    store.getState().closeAssetManager();
    expect(store.getState().isToolbarEditing).toBe(true);
  });

  it('is never saved with the scene', () => {
    const store = viewStore();
    store.getState().setToolbarEditing(true);
    store.setState({ persistenceEnabled: true });
    expect(store.persist.getOptions().partialize?.(store.getState())).not.toHaveProperty('isToolbarEditing');
  });
});
