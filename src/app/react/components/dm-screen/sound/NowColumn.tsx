import React, { useCallback, useState } from 'react';
import { Plus, RotateCcw, Square, VolumeX, Volume2 } from 'lucide-react';
import type { App } from 'obsidian';
import { t } from '../../../../i18n';
import { Button } from '../../../../packages/components/primitives/button';
import InputModal from '../../../../packages/components/primitives/InputModal';
import type { Mood, SoundRecord } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { isPlaying } from '../../../../soundDirector/tableSound';
import { showNotice } from '../../../../ui/notice';
import { useContextMenu } from '../../../root/ContextMenuContext';
import { useAtlasStore } from '../../../ViewStoreContext';
import { MoodStore } from '../../../../soundLibrary/MoodStore';
import { AddSoundList } from './AddSoundList';
import { IconAction } from './IconAction';
import { LayerRow, WaitingLayerRow } from './LayerRow';
import { LevelSlider } from './LevelSlider';
import { MusicRow } from './MusicRow';
import { OutputLine } from './OutputLine';
import { useSoundValue } from './useSound';

interface NowColumnProps {
  app: App;
  director: SoundDirector;
  collectionId: string | null;
  moods: readonly Mood[];
  sounds: readonly SoundRecord[];
}

/** Faders of this table's own levels: they write through to the gain and reach the settings when let go. */
const ChannelLevels = React.memo(function ChannelLevels({ director }: { director: SoundDirector }): React.JSX.Element {
  const levels = director.channelLevels();
  return (
    <div className="atlas-sound-channels">
      {([['musicDb', t('audio.music')], ['ambienceDb', t('audio.ambience')], ['masterDb', t('audio.master')]] as const).map(([key, label]) => (
        <div key={key} className="atlas-sound-channel">
          <span>{label}</span>
          <LevelSlider
            label={t('audio.level', { name: label })}
            value={levels[key]}
            onChange={(db) => director.setChannelLevels({ [key]: db }, false)}
            onCommit={(db) => director.setChannelLevels({ [key]: db }, true)}
          />
        </div>
      ))}
    </div>
  );
});

const SilenceButton = React.memo(function SilenceButton({ director }: { director: SoundDirector }): React.JSX.Element {
  const silenced = useSoundValue(director, ({ mix }) => mix.table.silenced);
  const playing = useSoundValue(director, ({ mix }) => isPlaying(mix.table, director.now()));
  return (
    <button type="button" className="atlas-sound-silence" aria-pressed={silenced} disabled={!playing} onClick={() => director.desk.toggleSilence()}>
      {silenced ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      {silenced ? t('audio.bringBack') : t('audio.silence')}
    </button>
  );
});

const SEPARATOR = '\n';

/** The live mix, which is also the editor of moods: what plays here is what Save takes. */
export function NowColumn({ app, director, collectionId, moods, sounds }: NowColumnProps): React.JSX.Element {
  // Which rows there are, not what they hold: a fader moving renders its own row, and none of this.
  const layerKeys = useSoundValue(director, ({ mix }) => mix.table.layers.map((play) => play.sound.key).join(SEPARATOR));
  const waitingLayers = useSoundValue(director, ({ mix }) => mix.waitingLayers.map((layer) => layer.sound).join(SEPARATOR));
  const holdsSound = useSoundValue(director, ({ mix }) => mix.table.music !== null || mix.table.layers.length > 0 || mix.waitingMusic !== null || mix.waitingLayers.length > 0);
  const activeMood = useSoundValue(director, ({ mix }) => (mix.mood?.collectionId === collectionId ? mix.mood.id : null));
  const lifecycle = useSoundValue(director, (snapshot) => snapshot.lifecycle);
  const lastMix = useSoundValue(director, (snapshot) => snapshot.lastMix);
  const openAssetManager = useAtlasStore((state) => state.openAssetManager);
  const menu = useContextMenu();
  const [adding, setAdding] = useState(false);
  const [namingMood, setNamingMood] = useState(false);

  const saveTo = useCallback((anchor: HTMLElement): void => {
    if (collectionId === null) return;
    const box = anchor.getBoundingClientRect();
    const ordered = [...moods.filter((mood) => mood.id === activeMood), ...moods.filter((mood) => mood.id !== activeMood)];
    menu.open(ordered.map((mood) => ({
      type: 'item' as const,
      label: mood.name,
      checked: mood.id === activeMood,
      disabled: MoodStore.forApp(app).isReadOnly(collectionId, mood.id),
      onClick: () => {
        if (director.desk.saveToMood(collectionId, mood)) showNotice(t('audio.saved', { name: mood.name }));
      },
    })), { x: box.left, y: box.bottom }, { returnFocus: anchor });
  }, [activeMood, app, collectionId, director, menu, moods]);

  return (
    <section className="atlas-sound-now" aria-label={t('audio.now')}>
      <header className="atlas-sound-now__header">
        <h3>{t('audio.now')}</h3>
        <Button type="button" variant="ghost" disabled={!holdsSound || collectionId === null} onClick={() => setNamingMood(true)}>{t('audio.saveAs')}</Button>
        <Button type="button" variant="ghost" disabled={!holdsSound || moods.length === 0} onClick={(event) => saveTo(event.currentTarget)}>{t('audio.saveTo')}</Button>
        <IconAction label={t('audio.stop')} icon={Square} disabled={!holdsSound} onClick={() => director.stop()} />
      </header>
      {lifecycle === 'needs-tap' && <button type="button" className="atlas-sound-banner" onClick={() => director.tap()}>{t('audio.needsTap')}</button>}
      {!holdsSound && lastMix && <button type="button" className="atlas-sound-banner" onClick={() => director.resume()}><RotateCcw aria-hidden="true" />{t('audio.resume')}</button>}
      <div className="atlas-sound-now__rows">
        <MusicRow director={director} />
        {layerKeys !== '' && layerKeys.split(SEPARATOR).map((key) => <LayerRow key={key} director={director} soundKey={key} />)}
        {waitingLayers !== '' && waitingLayers.split(SEPARATOR).map((id) => <WaitingLayerRow key={id} director={director} soundId={id} />)}
        {adding
          ? <AddSoundList director={director} sounds={sounds} onLibrary={() => openAssetManager()} onClose={() => setAdding(false)} />
          : <Button type="button" variant="ghost" className="atlas-sound-now__add" onClick={() => setAdding(true)}><Plus aria-hidden="true" />{t('audio.add.open')}</Button>}
      </div>
      <footer className="atlas-sound-now__footer">
        <ChannelLevels director={director} />
        <OutputLine director={director} />
        <SilenceButton director={director} />
      </footer>
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
    </section>
  );
}
