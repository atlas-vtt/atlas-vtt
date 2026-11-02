import React, { useCallback, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { formatList, t } from '../../../../i18n';
import { MAX_MOOD_LAYERS, type Mood, type SoundKind } from '../../../../sound/soundTypes';
import { dragToMix } from '../../../../soundDirector/libraryDesk';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { carriesSounds, readSoundDrag } from '../../../../soundLibrary/soundDrag';
import { SoundLibrary } from '../../../../soundLibrary/SoundLibrary';
import { SoundRecordStore } from '../../../../soundLibrary/SoundRecordStore';
import { showNotice } from '../../../../ui/notice';
import { runInBackground } from '../../../../utils/backgroundTask';
import { baseName } from '../../../../utils/pathUtils';
import { AddAmbience, LayerStrip, MasterStrip, WaitingStrip } from './DeskStrips';
import { DeskHeader } from './DeskHeader';
import { MusicCard } from './MusicCard';
import { SilenceButton } from './SilenceButton';
import { useMoreToScroll } from './useMoreToScroll';
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
 * not fit scroll sideways in their row; Master and Silence stay where they are.
 */
export function SoundDesk({ app, director, moods, onSaveAs }: SoundDeskProps): React.JSX.Element {
  // Which strips there are, not what they hold: a fader moving renders its own strip, and none of this.
  const layerKeys = useSoundValue(director, ({ mix }) => mix.table.layers.map((play) => play.sound.key).join(SEPARATOR));
  const waitingLayers = useSoundValue(director, ({ mix }) => mix.waitingLayers.map((layer) => layer.sound).join(SEPARATOR));
  const holdsSound = useSoundValue(director, ({ mix }) => mix.table.music !== null || mix.table.layers.length > 0 || mix.waitingMusic !== null || mix.waitingLayers.length > 0);
  const section = useRef<HTMLElement>(null);
  const choose = useCallback((kind: SoundKind): void => {
    SoundLibrary.forApp(app).place.show(kind);
    const library = section.current?.parentElement?.querySelector('.atlas-sound-lib');
    library?.querySelector<HTMLElement>('.atlas-sound-lib__rows, button')?.focus();
  }, [app]);
  const chooseMusic = useCallback(() => choose('music'), [choose]);
  const [dropTarget, setDropTarget] = useState(false);
  const mix = useRef<HTMLDivElement>(null);
  useMoreToScroll(mix);
  const layers = layerKeys === '' ? [] : layerKeys.split(SEPARATOR);
  const waiting = waitingLayers === '' ? [] : waitingLayers.split(SEPARATOR);

  const drop = (event: React.DragEvent): void => {
    if (!carriesSounds(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(false);
    const drag = readSoundDrag(event.dataTransfer);
    if (!drag) return;
    runInBackground(dragToMix({ records: SoundRecordStore.forApp(app), library: SoundLibrary.forApp(app), director, notify: showNotice }, drag), 'Adding to the mix', t('audio.couldNotAdd', { files: formatList([...drag.files.map((file) => file.name), ...drag.folders.map((folder) => baseName(folder.path))]) }));
  };

  return (
    <section
      ref={section}
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
        <div ref={mix} className="atlas-sound-strips__mix">
          <MusicCard director={director} onChoose={chooseMusic} />
          {layers.map((key) => <LayerStrip key={key} director={director} soundKey={key} />)}
          {waiting.map((id) => <WaitingStrip key={id} director={director} soundId={id} />)}
          {layers.length + waiting.length < MAX_MOOD_LAYERS && <AddAmbience onPress={() => choose('ambience')} />}
        </div>
        {holdsSound && <MasterStrip director={director} />}
        {holdsSound && <SilenceButton director={director} />}
      </div>
    </section>
  );
}
