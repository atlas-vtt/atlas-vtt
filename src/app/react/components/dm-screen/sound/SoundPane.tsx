import React, { useCallback, useEffect, useId, useRef } from 'react';
import { formatList, t } from '../../../../i18n';
import { Select } from '../../../../packages/components/primitives/Select';
import { AssetService } from '../../../../services/AssetService';
import type { Mood } from '../../../../sound/soundTypes';
import { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { MoodStore } from '../../../../soundLibrary/MoodStore';
import { orderForMove } from '../../../../soundLibrary/moodOrdering';
import { mayCarryAudio } from '../../../../soundLibrary/soundFiles';
import { runSoundImport } from '../../../../soundLibrary/runSoundImport';
import { runInBackground } from '../../../../utils/backgroundTask';
import { useAtlasUI } from '../../../root/AtlasUIContext';
import { useAtlasStore } from '../../../ViewStoreContext';
import { MoodGrid } from './MoodGrid';
import { NowColumn } from './NowColumn';
import { SoundSources } from './SoundSources';
import { useCollectionSounds, useMoods, useSoundCollection } from './useSound';
import { useSoundKeys } from './useSoundKeys';

/**
 * The DM screen's Sound page. It sends intents only: what plays belongs to the app's `SoundDirector`,
 * so this page can close at any moment and the music goes on. A press changes the room; nothing here
 * ever has to be searched for during play.
 */
export function SoundPane({ active }: { active: boolean }): React.JSX.Element {
  const { app, view } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const director = SoundDirector.forApp(app);
  const { collections, collectionId, setCollectionId } = useSoundCollection(app, mapPath);
  const moods = useMoods(app, collectionId);
  const sounds = useCollectionSounds(app, collectionId);
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const sameCollectionAsMap = mapPath !== null && collectionId !== null && AssetService.getInstance(app).getCollectionForMap(mapPath) === collectionId;

  const moveMood = useCallback((mood: Mood, index: number): void => {
    if (collectionId === null) return;
    const order = orderForMove(moods, mood.id, index);
    if (order !== null) MoodStore.forApp(app).saveMood(collectionId, { ...mood, order });
  }, [app, collectionId, moods]);

  useSoundKeys({ active, rootRef, viewId: view?.viewId, director, collectionId, moods, moveMood });

  useEffect(() => () => director.preview(null), [director]);

  // What a collection holds is made ready ahead of being added.
  useEffect(() => {
    if (active) director.shelf.request(sounds);
  }, [active, director, sounds]);

  const drop = (event: React.DragEvent): void => {
    if (!mayCarryAudio(event.dataTransfer) || collectionId === null) return;
    event.preventDefault();
    const files = [...event.dataTransfer.files];
    runInBackground(runSoundImport(app, AssetService.getInstance(app), files, collectionId), 'Adding sounds', t('audio.couldNotAdd', { files: formatList(files.map((file) => file.name)) }));
  };

  return (
    <div
      className="atlas-sound-pane"
      ref={rootRef}
      onDragOver={(event) => { if (mayCarryAudio(event.dataTransfer)) event.preventDefault(); }}
      onDrop={drop}
    >
      <section className="atlas-sound-moods" aria-label={t('audio.moods')}>
        <header className="atlas-sound-moods__header">
          <h3 id={labelId}>{t('audio.moods')}</h3>
          {collections.length > 1 && collectionId !== null && (
            <div className="atlas-sound-moods__collection">
              <Select
                value={collectionId}
                options={collections.map(({ id, name }) => ({ value: id, label: name }))}
                onChange={setCollectionId}
                labelledBy={labelId}
              />
            </div>
          )}
        </header>
        {moods.length === 0 ? <SoundSources /> : collectionId !== null && <MoodGrid app={app} director={director} collectionId={collectionId} moods={moods} sameCollectionAsMap={sameCollectionAsMap} moveMood={moveMood} />}
      </section>
      <NowColumn app={app} director={director} collectionId={collectionId} moods={moods} sounds={sounds} />
    </div>
  );
}
