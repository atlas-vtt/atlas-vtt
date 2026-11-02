import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatList, t } from '../../../../i18n';
import InputModal from '../../../../packages/components/primitives/InputModal';
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
import { AddSoundList } from './AddSoundList';
import { LibraryView } from './library/LibraryView';
import { MeterBoard } from './meterBoard';
import { MoodGrid } from './MoodGrid';
import { SoundDesk } from './SoundDesk';
import { SoundHeader } from './SoundHeader';
import { useCollectionSounds, useMoods, useSoundCollection, useSoundValue } from './useSound';
import { useMeterLoop } from './useMeterLoop';
import { useSoundKeys } from './useSoundKeys';
import { MeterBoardContext } from './VerticalFader';

interface SoundPaneProps {
  active: boolean;
  /** The DM screen's top row, where the page's own controls stand. */
  headerSlot: HTMLElement | null;
}

/**
 * The DM screen's Sound page. It sends intents only: what plays belongs to the app's `SoundDirector`,
 * so this page can close at any moment and the music goes on. A press changes the room; nothing here
 * ever has to be searched for during play.
 */
export function SoundPane({ active, headerSlot }: SoundPaneProps): React.JSX.Element {
  const { app, view } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const soundView = useAtlasStore((state) => state.soundView);
  const openAssetManager = useAtlasStore((state) => state.openAssetManager);
  const setSoundView = useAtlasStore((state) => state.setSoundView);
  const director = SoundDirector.forApp(app);
  const collection = useSoundCollection(app, mapPath);
  const { collectionId } = collection;
  const moods = useMoods(app, collectionId);
  const sounds = useCollectionSounds(app, collectionId);
  const rootRef = useRef<HTMLDivElement>(null);
  const [board] = useState(() => new MeterBoard());
  const [namingMood, setNamingMood] = useState(false);
  const sameCollectionAsMap = mapPath !== null && collectionId !== null && AssetService.getInstance(app).getCollectionForMap(mapPath) === collectionId;
  const sounding = useSoundValue(director, ({ mix }) => mix.table.music !== null || mix.table.layers.length > 0);
  const moodsRead = collectionId !== null && MoodStore.forApp(app).isLoaded(collectionId);

  const moveMood = useCallback((mood: Mood, index: number): void => {
    if (collectionId === null) return;
    const order = orderForMove(moods, mood.id, index);
    if (order !== null) MoodStore.forApp(app).saveMood(collectionId, { ...mood, order });
  }, [app, collectionId, moods]);
  const nameNewMood = useCallback(() => setNamingMood(true), []);

  useSoundKeys({ active, rootRef, viewId: view?.viewId, director, collectionId, moods, moveMood });
  useMeterLoop(board, director, rootRef, active && sounding);

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
    <MeterBoardContext.Provider value={board}>
      {active && headerSlot && createPortal(<SoundHeader {...collection} />, headerSlot)}
      <div
        className="atlas-sound-pane"
        ref={rootRef}
        onDragOver={(event) => { if (mayCarryAudio(event.dataTransfer)) event.preventDefault(); }}
        onDrop={drop}
      >
        {soundView === 'library' ? (
          <div className="atlas-sound-stage atlas-sound-stage--library">
            <LibraryView />
            <AddSoundList director={director} sounds={sounds} onLibrary={() => openAssetManager()} onClose={() => setSoundView('moods')} />
          </div>
        ) : (
          <div className="atlas-sound-stage">
            {moods.length > 0 && collectionId !== null && <MoodGrid app={app} director={director} collectionId={collectionId} moods={moods} sameCollectionAsMap={sameCollectionAsMap} moveMood={moveMood} onNewMood={nameNewMood} />}
            {moods.length === 0 && moodsRead && (
              <div className="atlas-sound-no-moods">
                <h2>{t('audio.mood.none')}</h2>
                <p>{t('audio.mood.noneHint')}</p>
              </div>
            )}
          </div>
        )}
        <SoundDesk app={app} director={director} collectionId={collectionId} moods={moods} onSaveAs={nameNewMood} />
        <InputModal
          isOpen={namingMood}
          onClose={() => setNamingMood(false)}
          title={t('audio.saveAsTitle')}
          validation={(value) => (value.trim() === '' ? t('audio.nameEmpty') : null)}
          onConfirm={(name) => {
            if (collectionId !== null) director.desk.saveAsMood(collectionId, name.trim());
            setNamingMood(false);
          }}
        />
      </div>
    </MeterBoardContext.Provider>
  );
}
