import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { AssetService, type SoundAsset } from '../../../../../services/AssetService';
import { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { heldInMix, type HeldInMix } from '../../../../../soundDirector/libraryDesk';
import { useLibraryRead, useSoundValue } from '../useSound';

const NO_SOUNDS: readonly SoundAsset[] = [];

/** The library's version: a render reads what it needs and hears of every change. */
export function useLibraryVersion(library: SoundLibrary): number {
  return useSyncExternalStore(useCallback((listener: () => void) => library.onChange(listener), [library]), () => library.version);
}

/** Every sound record, in every collection. */
export function useAllSounds(app: App): readonly SoundAsset[] {
  const read = useCallback((): Promise<readonly SoundAsset[]> => AssetService.getInstance(app).getAssets(undefined, 'sound'), [app]);
  return useLibraryRead(app, read, NO_SOUNDS);
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
