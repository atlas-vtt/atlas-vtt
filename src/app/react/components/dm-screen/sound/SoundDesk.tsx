import React, { useRef, useState } from 'react';
import type { App } from 'obsidian';
import { formatList, t } from '../../../../i18n';
import type { Mood } from '../../../../sound/soundTypes';
import { fileToMix } from '../../../../soundDirector/libraryDesk';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { carriesSounds, readSoundDrag } from '../../../../soundLibrary/soundDrag';
import { SoundLibrary } from '../../../../soundLibrary/SoundLibrary';
import { SoundRecordStore } from '../../../../soundLibrary/SoundRecordStore';
import { showNotice } from '../../../../ui/notice';
import { runInBackground } from '../../../../utils/backgroundTask';
import { LayerStrip, MasterStrip, WaitingStrip } from './DeskStrips';
import { DeskHeader } from './DeskHeader';
import { DeskIdle } from './DeskIdle';
import { MusicCard } from './MusicCard';
import { StopAllButton } from './StopAllButton';
import { useLibraryVersion } from './library/useLibrary';
import { useMoreToScroll } from './useMoreToScroll';
import { MoreStrips } from './MoreStrips';
import { useSoundValue } from './useSound';

interface SoundDeskProps {
  app: App;
  director: SoundDirector;
  moods: readonly Mood[];
  onSaveAs: () => void;
}

const SEPARATOR = '\n';

/**
 * The live mix, which is also the editor of moods: what plays here is what Save takes. Strips that do
 * not fit scroll sideways in their row; Master and Stop all stay where they are.
 */
export function SoundDesk({ app, director, moods, onSaveAs }: SoundDeskProps): React.JSX.Element {
  // Which strips there are, not what they hold: a fader moving renders its own strip, and none of this.
  const layerKeys = useSoundValue(director, ({ mix }) => mix.table.layers.map((play) => play.sound.key).join(SEPARATOR));
  const waitingLayers = useSoundValue(director, ({ mix }) => mix.waitingLayers.map((layer) => layer.sound).join(SEPARATOR));
  const holdsSound = useSoundValue(director, ({ mix }) => mix.table.music !== null || mix.paused !== undefined || mix.table.layers.length > 0 || mix.waitingMusic !== null || mix.waitingLayers.length > 0);
  const library = SoundLibrary.forApp(app);
  useLibraryVersion(library);
  const hasLibrary = library.rootOf('music').status !== 'unlinked' || library.rootOf('ambience').status !== 'unlinked';
  const [dropTarget, setDropTarget] = useState(false);
  const mix = useRef<HTMLDivElement>(null);
  const more = useMoreToScroll(mix);
  const layers = layerKeys === '' ? [] : layerKeys.split(SEPARATOR);
  const waiting = waitingLayers === '' ? [] : waitingLayers.split(SEPARATOR);

  const drop = (event: React.DragEvent): void => {
    if (!carriesSounds(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(false);
    const drag = readSoundDrag(event.dataTransfer);
    if (!drag) return;
    runInBackground(fileToMix({ records: SoundRecordStore.forApp(app), library: SoundLibrary.forApp(app), director, notify: showNotice }, drag.files, 'next'), 'Adding to the mix', t('audio.couldNotAdd', { files: formatList(drag.files.map((file) => file.name)) }));
  };

  return (
    <section
      className="atlas-sound-desk"
      onDragOver={(event) => {
        if (!carriesSounds(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(false);
      }}
      onDrop={drop}
    >
      <DeskHeader app={app} director={director} moods={moods} holdsSound={holdsSound} onSaveAs={onSaveAs} />
      <div className="atlas-sound-strips" data-drop-target={dropTarget || undefined}>
        {/* Strips out of view are named at the edge they lie past, not left to a fade alone. */}
        <div className="atlas-sound-strips__view">
          <MoreStrips row={mix} side="start" count={more.before} />
          <div ref={mix} className="atlas-sound-strips__mix">
            <MusicCard director={director} />
            {layers.map((key) => <LayerStrip key={key} director={director} soundKey={key} />)}
            {waiting.map((id) => <WaitingStrip key={id} director={director} soundId={id} />)}
          </div>
          <MoreStrips row={mix} side="end" count={more.after} />
        </div>
        {!holdsSound && <DeskIdle moodCount={moods.length} hasLibrary={hasLibrary} />}
        {holdsSound && <MasterStrip director={director} />}
        {holdsSound && <StopAllButton director={director} />}
      </div>
    </section>
  );
}
