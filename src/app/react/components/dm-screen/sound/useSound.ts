import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { AssetService } from '../../../../services/AssetService';
import { presentedSceneOf } from '../../../../services/presentedScene';
import type { Mood, SoundRecord } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import type { SoundSnapshot } from '../../../../soundDirector/soundSnapshot';
import { MoodStore } from '../../../../soundLibrary/MoodStore';
import { soundRecordsOf } from '../../../../soundLibrary/soundRecords';

const NO_MOODS: readonly Mood[] = [];

/** One value of what the director shows; a part re-renders only when that value changes. */
export function useSoundValue<T>(director: SoundDirector, select: (snapshot: SoundSnapshot) => T): T {
  return useSyncExternalStore(
    useCallback((listener: () => void) => director.subscribe(listener), [director]),
    () => select(director.snapshot()),
  );
}

/** The collection records made now go to: the playing mood's, else the page's. */
export function useRecordCollection(director: SoundDirector, shown: string | null): string | null {
  return useSoundValue(director, ({ mix }) => mix.mood?.collectionId ?? null) ?? shown;
}

export function useMoods(app: App, collectionId: string | null): readonly Mood[] {
  const store = MoodStore.forApp(app);
  return useSyncExternalStore(
    useCallback((listener: () => void) => store.onChange(listener), [store]),
    () => (collectionId === null ? NO_MOODS : store.moodsOf(collectionId)),
  );
}

/** What `read` answers, read again whenever the library says it changed. Keep `read` the same function while nothing it reads changed; null reads nothing. */
export function useLibraryRead<T>(app: App, read: (() => Promise<T>) | null, initial: T): T {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (read === null) return undefined;
    let current = true;
    const refresh = (): void => {
      void read().then((answer) => {
        if (current) setValue(answer);
      });
    };
    refresh();
    const ref = app.workspace.on('atlas-vtt:refresh-assets', refresh);
    return () => {
      current = false;
      app.workspace.offref(ref);
    };
  }, [app, read]);
  return value;
}

const NO_RECORDS: readonly SoundRecord[] = [];

/** The sounds of a collection. */
export function useCollectionSounds(app: App, collectionId: string | null): readonly SoundRecord[] {
  const read = useMemo(() => (collectionId === null ? null : () => soundRecordsOf(AssetService.getInstance(app), collectionId)), [app, collectionId]);
  return useLibraryRead<readonly SoundRecord[]>(app, read, NO_RECORDS);
}

export interface CollectionChoice {
  collections: readonly { id: string; name: string }[];
  collectionId: string | null;
  setCollectionId: (id: string) => void;
}

const NO_COLLECTIONS: CollectionChoice['collections'] = [];

/** Which collection's moods show: the presented scene's, else the open map's, else the default, until the GM picks another. */
export function useSoundCollection(app: App, mapPath: string | null): CollectionChoice {
  const assets = AssetService.getInstance(app);
  const readCollections = useCallback(async (): Promise<CollectionChoice['collections']> => (await assets.getCollections()).map(({ id, name }) => ({ id, name })), [assets]);
  const collections = useLibraryRead(app, readCollections, NO_COLLECTIONS);
  const [picked, setPicked] = useState<string | null>(null);
  const presented = presentedSceneOf(app).get()?.filePath;
  const worked = collections.length === 0 ? null
    : (presented ? assets.getCollectionForMap(presented) : null) ?? (mapPath ? assets.getCollectionForMap(mapPath) : null) ?? assets.getDefaultCollectionId();
  const collectionId = picked !== null && collections.some((collection) => collection.id === picked) ? picked : worked;
  return { collections, collectionId, setCollectionId: setPicked };
}
