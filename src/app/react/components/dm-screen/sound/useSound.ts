import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { AssetService } from '../../../../services/AssetService';
import { presentedSceneOf } from '../../../../services/presentedScene';
import type { Mood, SoundRecord } from '../../../../sound/soundTypes';
import { SoundDirector, type SoundSnapshot } from '../../../../soundDirector/SoundDirector';
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

/** The sounds of a collection, read again whenever the library says it changed. */
export function useCollectionSounds(app: App, collectionId: string | null): readonly SoundRecord[] {
  const [sounds, setSounds] = useState<readonly SoundRecord[]>([]);
  useEffect(() => {
    if (collectionId === null) return undefined;
    let current = true;
    const read = (): void => {
      void soundRecordsOf(AssetService.getInstance(app), collectionId).then((records) => {
        if (current) setSounds(records);
      });
    };
    read();
    const ref = app.workspace.on('atlas-vtt:refresh-assets', read);
    return () => {
      current = false;
      app.workspace.offref(ref);
    };
  }, [app, collectionId]);
  return sounds;
}

export interface CollectionChoice {
  collections: readonly { id: string; name: string }[];
  collectionId: string | null;
  setCollectionId: (id: string) => void;
}

/** Which collection's moods show: the presented scene's, else the open map's, else the default, until the GM picks another. */
export function useSoundCollection(app: App, mapPath: string | null): CollectionChoice {
  const assets = AssetService.getInstance(app);
  const [collections, setCollections] = useState<CollectionChoice['collections']>([]);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    const read = (): void => {
      void assets.getCollections().then((list) => {
        if (current) setCollections(list.map(({ id, name }) => ({ id, name })));
      });
    };
    read();
    const ref = app.workspace.on('atlas-vtt:refresh-assets', read);
    return () => {
      current = false;
      app.workspace.offref(ref);
    };
  }, [app, assets]);
  const presented = presentedSceneOf(app).get()?.filePath;
  const worked = collections.length === 0 ? null
    : (presented ? assets.getCollectionForMap(presented) : null) ?? (mapPath ? assets.getCollectionForMap(mapPath) : null) ?? assets.getDefaultCollectionId();
  const collectionId = picked !== null && collections.some((collection) => collection.id === picked) ? picked : worked;
  return { collections, collectionId, setCollectionId: setPicked };
}
