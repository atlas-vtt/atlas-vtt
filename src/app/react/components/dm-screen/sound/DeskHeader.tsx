import React from 'react';
import { MoreHorizontal, RotateCcw, Speaker } from 'lucide-react';
import type { App } from 'obsidian';
import { t } from '../../../../i18n';
import { listOutputDevices } from '../../../../sound/engine/outputDevice';
import type { Mood } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { MoodStore } from '../../../../soundLibrary/MoodStore';
import { showNotice } from '../../../../ui/notice';
import { useContextMenu, type ContextMenuEntry } from '../../../root/ContextMenuContext';
import { IconAction } from './IconAction';
import { useMoods, useSoundValue } from './useSound';

interface DeskHeaderProps {
  app: App;
  director: SoundDirector;
  collectionId: string | null;
  moods: readonly Mood[];
  onSaveAs: () => void;
}

function belowAnchor(anchor: HTMLElement): { x: number; y: number } {
  const box = anchor.getBoundingClientRect();
  return { x: box.left, y: box.bottom };
}

/** Who hears it, in one line; while a table runs online, also the way to what is sent. */
function PlayersLine({ director, collectionId }: { director: SoundDirector; collectionId: string | null }): React.JSX.Element | null {
  useSoundValue(director, (snapshot) => snapshot.playersRevision);
  const audience = useSoundValue(director, (snapshot) => snapshot.audience);
  const menu = useContextMenu();
  const { sounds } = director.players;
  if (sounds === null) return audience === null ? null : <span className="atlas-sound-who"><i aria-hidden="true" />{audience}</span>;
  const open = (anchor: HTMLElement): void => {
    menu.open([
      { type: 'item', label: t('audio.players.send'), checked: sounds.sending, onClick: () => sounds.setSending(!sounds.sending) },
      { type: 'item', label: t('audio.players.prepare'), disabled: !sounds.sending || collectionId === null, onClick: () => { if (collectionId !== null) sounds.prepare(collectionId); } },
    ], belowAnchor(anchor), { returnFocus: anchor });
  };
  return (
    <button type="button" className="atlas-sound-who" data-off={!sounds.sending || undefined} onClick={(event) => open(event.currentTarget)}>
      <i aria-hidden="true" />
      {sounds.sending ? (audience ?? t('audio.players.send')) : t('audio.players.notSending')}
    </button>
  );
}

/** The output of this device, chosen right here. */
function OutputButton({ director }: { director: SoundDirector }): React.JSX.Element {
  const output = useSoundValue(director, (snapshot) => snapshot.output);
  const menu = useContextMenu();
  const open = async (anchor: HTMLElement): Promise<void> => {
    const devices = await listOutputDevices();
    menu.open([
      { type: 'item', label: t('audio.outputDefault'), checked: output === null, onClick: () => director.setOutput(null) },
      ...devices.map((device, index) => {
        const label = device.label || t('audio.outputNumbered', { n: index + 1 });
        return { type: 'item' as const, label, checked: output?.id === device.id, onClick: () => director.setOutput({ id: device.id, label }) };
      }),
    ], belowAnchor(anchor), { returnFocus: anchor });
  };
  return (
    <button type="button" className="atlas-sound-output" aria-label={t('audio.output')} onClick={(event) => void open(event.currentTarget)}>
      <Speaker aria-hidden="true" />
      <span>{output ? output.label || t('audio.outputUnnamed') : t('audio.outputDefault')}</span>
    </button>
  );
}

/** The mix's name and how it stands to its mood, what can be done with it, and who hears it. */
export function DeskHeader({ app, director, collectionId, moods, onSaveAs }: DeskHeaderProps): React.JSX.Element {
  const active = useSoundValue(director, ({ mix }) => mix.mood);
  const activeMoods = useMoods(app, active?.collectionId ?? null);
  const store = MoodStore.forApp(app);
  const mood = activeMoods.find((other) => other.id === active?.id) ?? null;
  const holdsSound = useSoundValue(director, ({ mix }) => mix.table.music !== null || mix.table.layers.length > 0 || mix.waitingMusic !== null || mix.waitingLayers.length > 0);
  const changed = useSoundValue(director, () => mood !== null && director.desk.differsFrom(mood));
  const needsTap = useSoundValue(director, (snapshot) => snapshot.lifecycle === 'needs-tap');
  const lastMix = useSoundValue(director, (snapshot) => snapshot.lastMix !== null);
  const menu = useContextMenu();

  const saveInto = (target: Mood, targetCollection: string): void => {
    if (director.desk.saveToMood(targetCollection, target)) showNotice(t('audio.saved', { name: target.name }));
  };

  const openMenu = (anchor: HTMLElement): void => {
    const others = collectionId === null ? [] : moods.filter((other) => other.id !== mood?.id && !store.isReadOnly(collectionId, other.id));
    const entries: ContextMenuEntry[] = [];
    if (others.length > 0 && collectionId !== null) {
      entries.push({ type: 'submenu', label: t('audio.saveToOther'), children: others.map((other) => ({ type: 'item' as const, label: other.name, onClick: () => saveInto(other, collectionId) })) });
    }
    entries.push({ type: 'item', label: t('audio.clearMix'), onClick: () => director.stop() });
    menu.open(entries, belowAnchor(anchor), { returnFocus: anchor });
  };

  const canSaveToMood = mood !== null && active !== null && changed && !store.isReadOnly(active.collectionId, mood.id);

  return (
    <header className="atlas-sound-desk__head">
      {holdsSound ? <span className="atlas-sound-desk__mix">{mood?.name ?? t('audio.unsavedMix')}</span> : <span className="atlas-sound-desk__state">{t('audio.nothing')}</span>}
      <span className="atlas-sound-desk__state">{changed ? t('audio.changed') : ''}</span>
      {canSaveToMood && <button type="button" className="atlas-sound-button" onClick={() => saveInto(mood, active.collectionId)}>{t('audio.saveTo')}</button>}
      {holdsSound && collectionId !== null && <button type="button" className="atlas-sound-button atlas-sound-button--quiet" onClick={onSaveAs}>{t('audio.saveAsNew')}</button>}
      {holdsSound && <IconAction label={t('audio.mixMenu')} icon={MoreHorizontal} onClick={(event) => openMenu(event.currentTarget)} />}
      {needsTap && <button type="button" className="atlas-sound-button" onClick={() => director.tap()}>{t('audio.needsTap')}</button>}
      {!holdsSound && lastMix && <button type="button" className="atlas-sound-button atlas-sound-button--quiet" onClick={() => director.resume()}><RotateCcw aria-hidden="true" />{t('audio.resume')}</button>}
      <div className="atlas-sound-desk__end">
        <PlayersLine director={director} collectionId={collectionId} />
        <OutputButton director={director} />
      </div>
    </header>
  );
}
