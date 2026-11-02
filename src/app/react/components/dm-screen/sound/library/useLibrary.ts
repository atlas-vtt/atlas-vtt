import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { AssetService, type SoundAsset } from '../../../../../services/AssetService';
import { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { heldInMix, type HeldInMix } from '../../../../../soundDirector/libraryDesk';
import { useSoundValue } from '../useSound';

const NO_SOUNDS: readonly SoundAsset[] = [];

/** The library's version: a render reads what it needs and hears of every change. */
export function useLibraryVersion(library: SoundLibrary): number {
  return useSyncExternalStore(useCallback((listener: () => void) => library.onChange(listener), [library]), () => library.version);
}

/** Every sound record, in every collection, read again whenever the library says it changed. */
export function useAllSounds(app: App): readonly SoundAsset[] {
  const [sounds, setSounds] = useState<readonly SoundAsset[]>(NO_SOUNDS);
  useEffect(() => {
    let current = true;
    const assets = AssetService.getInstance(app);
    const read = (): void => {
      void assets.getAssets(undefined, 'sound').then((records) => {
        if (current) setSounds(records);
      });
    };
    read();
    const ref = app.workspace.on('atlas-vtt:refresh-assets', read);
    return () => {
      current = false;
      app.workspace.offref(ref);
    };
  }, [app]);
  return sounds;
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
