import { useCallback, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import type { Mood } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import type { SoundSnapshot } from '../../../../soundDirector/soundSnapshot';
import { MoodStore } from '../../../../soundLibrary/MoodStore';
import type { StoredSound } from '../../../../soundLibrary/soundRecords';
import { SoundRecordStore } from '../../../../soundLibrary/SoundRecordStore';

/** One value of what the director shows; a part re-renders only when that value changes. */
export function useSoundValue<T>(director: SoundDirector, select: (snapshot: SoundSnapshot) => T): T {
  return useSyncExternalStore(
    useCallback((listener: () => void) => director.subscribe(listener), [director]),
    () => select(director.snapshot()),
  );
}

/** One value of a store that tells when it changed. */
export function useStoreValue<T>(store: { onChange(listener: () => void): () => void }, read: () => T): T {
  return useSyncExternalStore(useCallback((listener: () => void) => store.onChange(listener), [store]), read);
}

export function useMoods(app: App): readonly Mood[] {
  const store = MoodStore.forApp(app);
  return useStoreValue(store, () => store.moods());
}

export function useStoredSounds(app: App): readonly StoredSound[] {
  const store = SoundRecordStore.forApp(app);
  return useStoreValue(store, () => store.all());
}
