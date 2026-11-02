import React, { useCallback } from 'react';
import type { App } from 'obsidian';
import type { Mood } from '../../../../sound/soundTypes';
import { MAX_MOOD_LAYERS } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { useAtlasStore } from '../../../ViewStoreContext';
import { AddAmbience, LayerStrip, MasterStrip, WaitingStrip } from './DeskStrips';
import { DeskHeader } from './DeskHeader';
import { MusicCard } from './MusicCard';
import { SilenceButton } from './SilenceButton';
import { useSoundValue } from './useSound';

interface SoundDeskProps {
  app: App;
  director: SoundDirector;
  collectionId: string | null;
  moods: readonly Mood[];
  onSaveAs: () => void;
}

const SEPARATOR = '\n';

/**
 * The live mix, which is also the editor of moods: what plays here is what Save takes. Strips that do
 * not fit scroll sideways in their row; Master and Silence stay where they are.
 */
export function SoundDesk({ app, director, collectionId, moods, onSaveAs }: SoundDeskProps): React.JSX.Element {
  // Which strips there are, not what they hold: a fader moving renders its own strip, and none of this.
  const layerKeys = useSoundValue(director, ({ mix }) => mix.table.layers.map((play) => play.sound.key).join(SEPARATOR));
  const waitingLayers = useSoundValue(director, ({ mix }) => mix.waitingLayers.map((layer) => layer.sound).join(SEPARATOR));
  const holdsSound = useSoundValue(director, ({ mix }) => mix.table.music !== null || mix.table.layers.length > 0 || mix.waitingMusic !== null || mix.waitingLayers.length > 0);
  const showLibrary = useAtlasStore((state) => state.showSoundLibrary);
  const chooseMusic = useCallback(() => showLibrary('music'), [showLibrary]);
  const layers = layerKeys === '' ? [] : layerKeys.split(SEPARATOR);
  const waiting = waitingLayers === '' ? [] : waitingLayers.split(SEPARATOR);

  return (
    <section className="atlas-sound-desk">
      <DeskHeader app={app} director={director} collectionId={collectionId} moods={moods} onSaveAs={onSaveAs} />
      <div className="atlas-sound-strips">
        <div className="atlas-sound-strips__mix">
          <MusicCard director={director} onChoose={chooseMusic} />
          {layers.map((key) => <LayerStrip key={key} director={director} soundKey={key} />)}
          {waiting.map((id) => <WaitingStrip key={id} director={director} soundId={id} />)}
          {layers.length + waiting.length < MAX_MOOD_LAYERS && <AddAmbience onPress={() => showLibrary('ambience')} />}
        </div>
        {holdsSound && <MasterStrip director={director} />}
        {holdsSound && <SilenceButton director={director} />}
      </div>
    </section>
  );
}
