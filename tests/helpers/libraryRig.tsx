import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { App } from 'obsidian';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { LibraryView } from '../../src/app/react/components/dm-screen/sound/library/LibraryView';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { SoundKind } from '../../src/app/sound/soundTypes';
import { SoundDirector } from '../../src/app/soundDirector/SoundDirector';
import { MoodStore } from '../../src/app/soundLibrary/MoodStore';
import { SoundLibrary } from '../../src/app/soundLibrary/SoundLibrary';
import { SoundRecordStore } from '../../src/app/soundLibrary/SoundRecordStore';
import { SoundRoots } from '../../src/app/soundLibrary/SoundRoots';
import type { SharedSoundRoots } from '../../src/app/soundLibrary/soundRootsStore';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { withSound } from '../mocks/experimentalFeatures';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { FakeSoundLocation } from './fakeSoundLocation';

export interface LibraryRig {
  app: App;
  library: SoundLibrary;
  director: SoundDirector;
  store: ViewAtlasStore;
  records: SoundRecordStore;
  roots: SoundRoots;
  locations: Record<SoundKind, FakeSoundLocation>;
  local: Partial<Record<SoundKind, string>>;
  /** Mounts the library, or `page` in its place. */
  mount: (host: HTMLElement, page?: React.ReactNode) => void;
  unmount: () => void;
}

export interface LibraryRigOptions {
  local?: Partial<Record<SoundKind, string>>;
  shared?: SharedSoundRoots;
  seconds?: (url: string) => number | null;
}

/** The real library over roots held in memory, provided for `app`. */
export function fakeLibrary(app: App, options: LibraryRigOptions = {}): Pick<LibraryRig, 'library' | 'roots' | 'locations' | 'local'> {
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
    probeSeconds: async (url) => options.seconds?.(url) ?? null,
  });
  SoundLibrary.provide(app, library);
  return { library, roots, locations, local };
}

/** The library as the Sound page holds it: the page keeps the search, which narrows its moods too. */
function SearchedLibrary(): React.JSX.Element | null {
  const [query, setQuery] = useState('');
  return <LibraryView query={query} onQuery={setQuery} />;
}

/** The real view, director and records over roots held in memory: all that is missing is the disk. */
export async function libraryRig(options: LibraryRigOptions = {}): Promise<LibraryRig> {
  const { app } = createInMemoryApp({ folders: ['atlas-vtt/collections'] });
  Object.assign(app, { appId: `library-${Math.random()}` });
  new SettingsService(app);
  withSound(app);
  const records = SoundRecordStore.forApp(app);
  await records.whenLoaded();

  const { library, roots, locations, local } = fakeLibrary(app, options);
  const director = SoundDirector.forApp(app);
  const store = createViewAtlasStore(app, `library-${Math.random()}`);
  store.setState({ persistenceEnabled: false, isDMScreenOpen: true, dmScreenPage: 'sound' });
  let root: Root | null = null;
  const value = { app, view: null, pixiApp: null, renderer: null } as AtlasUIContextValue;
  return {
    app, library, director, store, records, roots, locations, local,
    mount: (host, page) => {
      root = createRoot(host);
      act(() => {
        root?.render(
          <AtlasUIContext.Provider value={value}>
            <ViewStoreProvider store={store}>
              <TooltipProvider>
                <ContextMenuProvider>
                  {page ?? <SearchedLibrary />}
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
      MoodStore.release(app);
      SoundRecordStore.release(app);
    },
  };
}
