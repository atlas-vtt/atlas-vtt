import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';

const ViewStoreContext = createContext<ViewAtlasStore | null>(null);

export const ViewStoreProvider: React.FC<{
  store: ViewAtlasStore;
  children: React.ReactNode;
}> = ({ store, children }) => {
  return (
    <ViewStoreContext.Provider value={store}>
      {children}
    </ViewStoreContext.Provider>
  );
};

/** The view's store instance, for imperative `getState()` / `subscribe()` access. */
export const useViewStoreHook = (): ViewAtlasStore => {
  const store = useContext(ViewStoreContext);
  if (!store) {
    throw new Error('useViewStoreHook must be used within a ViewStoreProvider');
  }
  return store;
};

/** Subscribes the component to a slice of the view's store. */
export const useAtlasStore = <T,>(selector: (state: ViewAtlasState) => T): T => {
  const store = useContext(ViewStoreContext);
  if (!store) {
    throw new Error('useAtlasStore must be used within a ViewStoreProvider');
  }
  return useStore(store, selector);
};

export const useViewStore = useAtlasStore;

const subscribeToNothing = (): (() => void) => () => {};

/**
 * Like `useAtlasStore`, for components that also render where no map view (and so no store)
 * exists, such as the global asset manager. Returns `fallback` there.
 */
export const useOptionalAtlasStore = <T,>(selector: (state: ViewAtlasState) => T, fallback: T): T => {
  const store = useContext(ViewStoreContext);
  return useSyncExternalStore(
    store ? store.subscribe : subscribeToNothing,
    () => (store ? selector(store.getState()) : fallback)
  );
};
