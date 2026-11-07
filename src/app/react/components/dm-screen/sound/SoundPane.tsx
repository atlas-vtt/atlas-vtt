import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import { formatList, t } from '../../../../i18n';
import InputModal from '../../../../packages/components/primitives/InputModal';
import type { Mood } from '../../../../sound/soundTypes';
import { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { MoodStore } from '../../../../soundLibrary/MoodStore';
import { orderForMove } from '../../../../soundLibrary/moodOrdering';
import { mayCarryAudio } from '../../../../soundLibrary/soundFiles';
import { soundRecordOf } from '../../../../soundLibrary/soundRecords';
import { runLibraryImport } from '../../../../soundLibrary/runLibraryImport';
import { SoundLibrary } from '../../../../soundLibrary/SoundLibrary';
import { useScrollbarGutter } from '../../../../packages/components/primitives/useScrollbarGutter';
import { runInBackground } from '../../../../utils/backgroundTask';
import { useAtlasUI } from '../../../root/AtlasUIContext';
import { LibraryView } from './library/LibraryView';
import { MeterBoard } from './meterBoard';
import { MoodGrid } from './MoodGrid';
import { SoundDesk } from './SoundDesk';
import { announceSound, SoundLiveRegion } from './SoundLiveRegion';
import { useMoods, useSoundValue, useStoredSounds } from './useSound';
import { useMeterLoop } from './useMeterLoop';
import { useSoundKeys } from './useSoundKeys';
import { MeterBoardContext } from './VerticalFader';

interface SoundPaneProps {
  active: boolean;
}

/**
 * False for the page's first frame, true from the next: the library (its virtual list measures itself, the
 * page's largest part) mounts a frame after the moods and the desk, so opening the screen does not ask for all of
 * it in one frame. The screen fades in over that frame, so nothing is seen missing.
 */
function useSecondFrame(rootRef: React.RefObject<HTMLElement | null>): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const view = rootRef.current?.ownerDocument.defaultView ?? window;
    const frame = view.requestAnimationFrame(() => setReady(true));
    return () => view.cancelAnimationFrame(frame);
  }, [rootRef]);
  return ready;
}

/**
 * The Sound page, on the DM screen and in a tab of its own (`SoundView`). It sends intents only: what
 * plays belongs to the app's `SoundDirector`, so this page can close at any moment and the music goes
 * on. A press changes the room; nothing here ever has to be searched for during play.
 */
export function SoundPane({ active }: SoundPaneProps): React.JSX.Element {
  const { app, view } = useAtlasUI();
  const director = SoundDirector.forApp(app);
  const moods = useMoods(app);
  const sounds = useStoredSounds(app);
  const rootRef = useRef<HTMLDivElement>(null);
  const [board] = useState(() => new MeterBoard());
  const [namingMood, setNamingMood] = useState(false);
  // The library's search narrows the moods too: one field finds tracks on the left and moods on the right.
  const [query, setQuery] = useState('');
  const searching = useDeferredValue(query.trim());
  const [moodsSide, setMoodsSide] = useState<HTMLElement | null>(null);
  useScrollbarGutter(moodsSide);
  const sounding = useSoundValue(director, ({ mix }) => mix.table.music !== null || mix.table.layers.length > 0);
  const moodsRead = MoodStore.forApp(app).isLoaded();

  const moveMood = useCallback((mood: Mood, index: number): void => {
    const order = orderForMove(moods, mood.id, index);
    if (order !== null) MoodStore.forApp(app).saveMood({ ...mood, order });
  }, [app, moods]);
  const nameNewMood = useCallback(() => setNamingMood(true), []);

  useSoundKeys({ active, rootRef, viewId: view?.viewId, director, moods, moveMood });
  const libraryShown = useSecondFrame(rootRef);
  useMeterLoop(board, director, rootRef, active && sounding);

  useEffect(() => () => director.preview(null), [director]);

  // What is in use is made ready ahead of being pressed.
  useEffect(() => {
    if (active) director.shelf.request(sounds.map(soundRecordOf));
  }, [active, director, sounds]);

  const drop = (event: React.DragEvent): void => {
    if (!mayCarryAudio(event.dataTransfer)) return;
    event.preventDefault();
    const files = [...event.dataTransfer.files];
    const library = SoundLibrary.forApp(app);
    runInBackground(runLibraryImport(library, files, library.place.current.kind), 'Importing sounds', t('audio.couldNotAdd', { files: formatList(files.map((file) => file.name)) }));
  };

  return (
    <MeterBoardContext.Provider value={board}>
      <div
        className="atlas-sound-pane"
        ref={rootRef}
        onDragOver={(event) => { if (mayCarryAudio(event.dataTransfer)) event.preventDefault(); }}
        onDrop={drop}
      >
        <div className="atlas-sound-stage">
          {libraryShown ? <LibraryView query={query} onQuery={setQuery} /> : <div className="atlas-sound-lib" aria-busy="true" />}
          <div className="atlas-sound-moods" ref={setMoodsSide}>
            {moods.length > 0 && <MoodGrid app={app} director={director} moods={moods} search={searching} moveMood={moveMood} onNewMood={nameNewMood} />}
            {moods.length === 0 && moodsRead && (
              <div className="atlas-sound-no-moods">
                <h2>{t('audio.mood.none')}</h2>
                <p>{t('audio.mood.noneHint')}</p>
              </div>
            )}
          </div>
        </div>
        <SoundDesk app={app} director={director} moods={moods} onSaveAs={nameNewMood} />
        <SoundLiveRegion director={director} />
        <InputModal
          isOpen={namingMood}
          onClose={() => setNamingMood(false)}
          title={t('audio.saveAsTitle')}
          label={t('audio.mood.name')}
          confirmLabel={t('audio.saveMood')}
          validation={(value) => (value.trim() === '' ? t('audio.nameEmpty') : null)}
          onConfirm={(name) => {
            director.desk.saveAsMood(name.trim());
            announceSound(t('audio.announce.savedNew', { name: name.trim() }));
            setNamingMood(false);
          }}
        />
      </div>
    </MeterBoardContext.Provider>
  );
}
