import { useSyncExternalStore } from 'react';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';

/** A failed download: said on its own button, which offers it again. */
export type PackDownload = { phase: 'idle' } | { phase: 'downloading'; share: number } | { phase: 'failed' };

interface DownloadState {
  current: PackDownload;
  listeners: Set<() => void>;
}

// One download per library and offer, whichever page started it, so the DM screen and the Sound tab show the same one.
const downloads = new WeakMap<SoundLibrary, Map<string, DownloadState>>();

function stateOf(library: SoundLibrary, offer: string): DownloadState {
  let offers = downloads.get(library);
  if (!offers) {
    offers = new Map();
    downloads.set(library, offers);
  }
  let state = offers.get(offer);
  if (!state) {
    state = { current: { phase: 'idle' }, listeners: new Set() };
    offers.set(offer, state);
  }
  return state;
}

function announce(state: DownloadState, next: PackDownload): void {
  state.current = next;
  for (const listener of state.listeners) listener();
}

/** Runs `install` unless this offer is downloading already, telling every page showing it how far it got; `done` runs after a whole install. */
export function startPackDownload(library: SoundLibrary, offer: string, install: (onStep: (share: number) => void) => Promise<void>, done: () => void): void {
  const state = stateOf(library, offer);
  if (state.current.phase === 'downloading') return;
  announce(state, { phase: 'downloading', share: 0 });
  install((share) => announce(state, { phase: 'downloading', share })).then(
    () => {
      announce(state, { phase: 'idle' });
      done();
    },
    (error: unknown) => {
      console.error(`[Atlas] Could not download ${offer}`, error);
      announce(state, { phase: 'failed' });
    },
  );
}

export function usePackDownload(library: SoundLibrary, offer: string): PackDownload {
  const state = stateOf(library, offer);
  return useSyncExternalStore((listener) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }, () => state.current);
}
