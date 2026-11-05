import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { heldInMix, type HeldInMix } from '../../../../../soundDirector/libraryDesk';
import { musicPosition } from '../../../../../soundDirector/musicList';
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

const SOUNDING_POLL_MS = 250;

/** The track the music is on: a list goes on by itself, so this reads the clock too. Paused music (by the GM or by Stop all) stays on its track. */
export function useSoundingKey(director: SoundDirector): string | null {
  const read = useCallback((): string | null => {
    const { table, paused } = director.snapshot().mix;
    const held = table.music ? null : (paused ?? null);
    const play = held?.play ?? table.music;
    return (play && musicPosition(play, held?.at ?? director.now())?.track.key) ?? null;
  }, [director]);
  const [key, setKey] = useState(read);
  useEffect(() => {
    const update = (): void => setKey(read());
    update();
    const timer = window.setInterval(update, SOUNDING_POLL_MS);
    const stop = director.subscribe(update);
    return () => {
      window.clearInterval(timer);
      stop();
    };
  }, [director, read]);
  return key;
}

/** A row's length, once it is known. */
export function useFileSeconds(library: SoundLibrary, read: () => number | null | undefined): number | null | undefined {
  return useSyncExternalStore(useCallback((listener: () => void) => library.onLengths(listener), [library]), read);
}
