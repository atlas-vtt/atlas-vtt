import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { heldInMix, type HeldInMix } from '../../../../../soundDirector/libraryDesk';
import { useSoundValue, useStoreValue } from '../useSound';

/** The library's version: a render reads what it needs and hears of every change. */
export function useLibraryVersion(library: SoundLibrary): number {
  return useStoreValue(library, () => library.version);
}

/** What the mix holds, by file; the same map while that does, so a fader's move renders nothing of the library that stands beside it. */
export function useHeldInMix(director: SoundDirector): ReadonlyMap<string, HeldInMix> {
  const held = useSoundValue(director, () => JSON.stringify([...heldInMix(director)]));
  return useMemo(() => new Map<string, HeldInMix>(JSON.parse(held) as [string, HeldInMix][]), [held]);
}

/** A row's length, once it is known. */
export function useFileSeconds(library: SoundLibrary, read: () => number | null | undefined): number | null | undefined {
  return useSyncExternalStore(useCallback((listener: () => void) => library.onLengths(listener), [library]), read);
}
