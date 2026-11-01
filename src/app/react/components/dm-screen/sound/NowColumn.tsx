import React, { useCallback, useState } from 'react';
import { Plus, RotateCcw, Save, VolumeX, Volume2 } from 'lucide-react';
import type { App } from 'obsidian';
import { t } from '../../../../i18n';
import { Button } from '../../../../packages/components/primitives/button';
import InputModal from '../../../../packages/components/primitives/InputModal';
import type { Mood, SoundRecord } from '../../../../sound/soundTypes';
import { soundingMusic } from '../../../../soundDirector/musicList';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { isPlaying } from '../../../../soundDirector/tableSound';
import { showNotice } from '../../../../ui/notice';
import { useContextMenu } from '../../../root/ContextMenuContext';
import { useAtlasStore } from '../../../ViewStoreContext';
import { AddSoundList } from './AddSoundList';
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

function ChannelLevels({ director }: { director: SoundDirector }): React.JSX.Element {
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
}

/** The live mix, which is also the editor of moods: what plays here is what Save takes. */
export function NowColumn({ app, director, collectionId, moods, sounds }: NowColumnProps): React.JSX.Element {
  const mix = useSoundValue(director, (snapshot) => snapshot.mix);
  const lifecycle = useSoundValue(director, (snapshot) => snapshot.lifecycle);
  const lastMix = useSoundValue(director, (snapshot) => snapshot.lastMix);
  const openAssetManager = useAtlasStore((state) => state.openAssetManager);
  const menu = useContextMenu();
  const [adding, setAdding] = useState(false);
  const [namingMood, setNamingMood] = useState(false);
  const { table, listChange, waitingMusic, waitingLayers } = mix;
  const play = soundingMusic(table, director.now());
  const list = listChange ?? play;
  const holdsSound = table.music !== null || table.layers.length > 0 || waitingMusic !== null || waitingLayers.length > 0;

  const saveTo = useCallback((anchor: HTMLElement): void => {
    if (collectionId === null) return;
    const box = anchor.getBoundingClientRect();
    const active = mix.mood?.collectionId === collectionId ? mix.mood.id : null;
    const ordered = [...moods.filter((mood) => mood.id === active), ...moods.filter((mood) => mood.id !== active)];
    menu.open(ordered.map((mood) => ({
      type: 'item' as const,
      label: mood.name,
      checked: mood.id === active,
      onClick: () => {
        if (director.desk.saveToMood(collectionId, mood)) showNotice(t('audio.saved', { name: mood.name }));
      },
    })), { x: box.left, y: box.bottom }, { returnFocus: anchor });
  }, [collectionId, director, menu, mix.mood, moods]);

  return (
    <section className="atlas-sound-now" aria-label={t('audio.now')}>
      <header className="atlas-sound-now__header">
        <h3>{t('audio.now')}</h3>
        <Button type="button" variant="ghost" disabled={!holdsSound || collectionId === null} onClick={() => setNamingMood(true)}><Save aria-hidden="true" />{t('audio.saveAs')}</Button>
        <Button type="button" variant="ghost" disabled={!holdsSound || moods.length === 0} onClick={(event) => saveTo(event.currentTarget)}>{t('audio.saveTo')}</Button>
      </header>
      {lifecycle === 'needs-tap' && <button type="button" className="atlas-sound-banner" onClick={() => director.tap()}>{t('audio.needsTap')}</button>}
      {!holdsSound && lastMix && <button type="button" className="atlas-sound-banner" onClick={() => director.resume()}><RotateCcw aria-hidden="true" />{t('audio.resume')}</button>}
      <div className="atlas-sound-now__rows">
        <MusicRow director={director} music={table.music} tracks={list?.tracks ?? []} shuffle={list?.shuffle ?? false} waitingTracks={waitingMusic?.tracks ?? []} />
        {table.layers.map((layer) => <LayerRow key={layer.sound.key} director={director} play={layer} />)}
        {waitingLayers.map((layer) => <WaitingLayerRow key={layer.sound} director={director} soundId={layer.sound} />)}
        {adding
          ? <AddSoundList director={director} sounds={sounds} onLibrary={() => openAssetManager()} onClose={() => setAdding(false)} />
          : <Button type="button" variant="ghost" className="atlas-sound-now__add" onClick={() => { app.workspace.trigger('atlas-vtt:refresh-assets'); setAdding(true); }}><Plus aria-hidden="true" />{t('audio.add.open')}</Button>}
      </div>
      <footer className="atlas-sound-now__footer">
        <ChannelLevels director={director} />
        <OutputLine director={director} />
        <button
          type="button"
          className="atlas-sound-silence"
          aria-pressed={table.silenced}
          disabled={!isPlaying(table, director.now())}
          onClick={() => director.desk.toggleSilence()}
        >
          {table.silenced ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          {table.silenced ? t('audio.bringBack') : t('audio.silence')}
        </button>
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
