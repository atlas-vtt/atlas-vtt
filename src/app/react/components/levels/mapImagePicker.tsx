import React from 'react';
import { createRoot } from 'react-dom/client';
import AssetManager from '../../../packages/components/asset-manager/AssetManager';
import { AtlasUIContext, type AtlasUIContextValue } from '../../root/AtlasUIContext';
import { ContextMenuProvider } from '../../root/ContextMenuContext';
import { ViewStoreProvider } from '../../ViewStoreContext';
import { portalHost } from '../../../host/portalHost';
import type { ViewAtlasStore } from '../../../storeFactory';

/** What a level's map is chosen for: the window's title, and a choice of no map where one is offered. */
export interface MapImagePickOptions {
  title: string;
  noneLabel?: string;
}

/**
 * Opens the asset manager on its Maps tab to choose a map of the library for a level (its map image or its roof),
 * in the scene's collection to begin with. `onChoose` gets the chosen image's path, or null for no map; closing the
 * window chooses nothing. The window lives over the view, as the asset manager does, inside the view's store, so it
 * opens where the scene's maps are.
 */
export function pickMapImage(ui: AtlasUIContextValue, store: ViewAtlasStore, options: MapImagePickOptions, onChoose: (path: string | null) => void): void {
  const container = portalHost().createDiv({ cls: ['atlas-vtt-plugin', 'atlas-map-picker-container'] });
  const root = createRoot(container);
  let open = true;

  const close = (): void => {
    if (!open) return;
    open = false;
    render(false);
  };
  const pick = {
    ...options,
    onPick: (path: string | null): void => {
      if (!open) return;
      close();
      onChoose(path);
    },
  };
  function render(isOpen: boolean): void {
    root.render(
      <AtlasUIContext.Provider value={ui}>
        <ViewStoreProvider store={store}>
          <ContextMenuProvider>
            <AssetManager
              isOpen={isOpen}
              onClose={close}
              pick={pick}
              onExitComplete={() => {
                root.unmount();
                container.remove();
              }}
            />
          </ContextMenuProvider>
        </ViewStoreProvider>
      </AtlasUIContext.Provider>,
    );
  }
  render(true);
}
