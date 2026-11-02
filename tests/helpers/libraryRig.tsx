import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { App } from 'obsidian';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { LibraryView } from '../../src/app/react/components/dm-screen/sound/library/LibraryView';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { AssetService } from '../../src/app/services/AssetService';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { SoundKind } from '../../src/app/sound/soundTypes';
import { SoundDirector } from '../../src/app/soundDirector/SoundDirector';
import { SoundLibrary } from '../../src/app/soundLibrary/SoundLibrary';
import { SoundRoots } from '../../src/app/soundLibrary/SoundRoots';
import type { SharedSoundRoots } from '../../src/app/soundLibrary/soundRootsStore';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { withSound } from '../mocks/experimentalFeatures';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { FakeSoundLocation } from './fakeSoundLocation';

export const COLLECTION = 'Fen';

export interface LibraryRig {
  app: App;
  library: SoundLibrary;
  director: SoundDirector;
  store: ViewAtlasStore;
  assets: AssetService;
  roots: SoundRoots;
  locations: Record<SoundKind, FakeSoundLocation>;
  local: Partial<Record<SoundKind, string>>;
  mount: (host: HTMLElement) => void;
  unmount: () => void;
}

export interface LibraryRigOptions {
  local?: Partial<Record<SoundKind, string>>;
  shared?: SharedSoundRoots;
  home?: string;
  seconds?: (url: string) => number | null;
}

/** The real view, director and records over roots held in memory: all that is missing is the disk. */
export async function libraryRig(options: LibraryRigOptions = {}): Promise<LibraryRig> {
  const { app } = createInMemoryApp({ folders: ['atlas-vtt/collections'] });
  Object.assign(app, { appId: `library-${Math.random()}` });
  new SettingsService(app);
  withSound(app);
  AssetService.resetInstance();
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  await assets.createCollection(COLLECTION);

  const locations = { music: new FakeSoundLocation(), ambience: new FakeSoundLocation() };
  const local: Partial<Record<SoundKind, string>> = { ...options.local };
  let shared: SharedSoundRoots = options.shared ?? {};
  const roots = new SoundRoots({
    shared: () => shared,
    setShared: (next) => { shared = next; },
    onSharedChange: () => () => undefined,
    local: (kind) => local[kind] ?? null,
    setLocal: (kind, path) => { if (path) local[kind] = path; else delete local[kind]; },
    vaultBase: () => '/vault',
    realPath: async (path) => path,
  });
  const library = new SoundLibrary({
    roots,
    open: (root) => locations[root.kind],
    home: () => options.home ?? null,
    probeSeconds: async (url) => options.seconds?.(url) ?? null,
  });
  SoundLibrary.provide(app, library);
  const director = SoundDirector.forApp(app);
  const store = createViewAtlasStore(app, `library-${Math.random()}`);
  store.setState({ persistenceEnabled: false, isDMScreenOpen: true, dmScreenPage: 'sound', soundView: 'library' });
  let root: Root | null = null;
  const value = { app, view: null, pixiApp: null, renderer: null } as AtlasUIContextValue;
  return {
    app, library, director, store, assets, roots, locations, local,
    mount: (host) => {
      root = createRoot(host);
      act(() => {
        root?.render(
          <AtlasUIContext.Provider value={value}>
            <ViewStoreProvider store={store}>
              <TooltipProvider>
                <ContextMenuProvider>
                  <LibraryView collectionId={COLLECTION} />
                </ContextMenuProvider>
              </TooltipProvider>
            </ViewStoreProvider>
          </AtlasUIContext.Provider>,
        );
      });
    },
    unmount: () => {
      act(() => root?.unmount());
      SoundLibrary.release(app);
      SoundDirector.release(app);
      assets.cancelScheduledChecks();
    },
  };
}
