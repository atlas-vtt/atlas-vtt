import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { heldInMix, type HeldInMix } from '../../../../../soundDirector/libraryDesk';
import { useSoundValue } from '../useSound';

/** The library's version: a render reads what it needs and hears of every change. */
export function useLibraryVersion(library: SoundLibrary): number {
  return useSyncExternalStore(useCallback((listener: () => void) => library.onChange(listener), [library]), () => library.version);
}

/** What the mix holds, by file. It changes only when a commit or a copy does, so a fader's move renders no row. */
export function useHeldInMix(director: SoundDirector): ReadonlyMap<string, HeldInMix> {
  const list = useSoundValue(director, ({ mix }) => mix);
  const copies = useSoundValue(director, (snapshot) => snapshot.shelfRevision);
  return useMemo(() => heldInMix(director), [director, list, copies]);
}

/** A row's length, once it is known. */
export function useFileSeconds(library: SoundLibrary, read: () => number | null | undefined): number | null | undefined {
  return useSyncExternalStore(useCallback((listener: () => void) => library.onLengths(listener), [library]), read);
}
