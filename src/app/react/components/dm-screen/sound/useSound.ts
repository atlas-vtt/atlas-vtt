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

export function useMoods(app: App): readonly Mood[] {
  const store = MoodStore.forApp(app);
  return useSyncExternalStore(useCallback((listener: () => void) => store.onChange(listener), [store]), () => store.moods());
}

/** Every sound record. */
export function useStoredSounds(app: App): readonly StoredSound[] {
  const store = SoundRecordStore.forApp(app);
  return useSyncExternalStore(useCallback((listener: () => void) => store.onChange(listener), [store]), () => store.all());
}
