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
import { useSoundValue } from './useSound';

interface DeskHeaderProps {
  app: App;
  director: SoundDirector;
  moods: readonly Mood[];
  holdsSound: boolean;
  onSaveAs: () => void;
}

function belowAnchor(anchor: HTMLElement): { x: number; y: number } {
  const box = anchor.getBoundingClientRect();
  return { x: box.left, y: box.bottom };
}

/** Who hears it, in one line; while a table runs online, also the way to what is sent. */
function PlayersLine({ director }: { director: SoundDirector }): React.JSX.Element | null {
  useSoundValue(director, (snapshot) => snapshot.playersRevision);
  const audience = useSoundValue(director, (snapshot) => snapshot.audience);
  const menu = useContextMenu();
  const { sounds } = director.players;
  if (sounds === null) return audience === null ? null : <span className="atlas-sound-who"><i aria-hidden="true" /><span>{audience}</span></span>;
  const open = (anchor: HTMLElement): void => {
    menu.open([
      { type: 'item', label: t('audio.players.send'), checked: sounds.sending, onClick: () => sounds.setSending(!sounds.sending) },
      { type: 'item', label: t('audio.players.prepare'), disabled: !sounds.sending, onClick: () => sounds.prepare() },
    ], belowAnchor(anchor), { returnFocus: anchor });
  };
  return (
    <button type="button" className="atlas-sound-who" data-off={!sounds.sending || undefined} onClick={(event) => open(event.currentTarget)}>
      <i aria-hidden="true" />
      <span>{sounds.sending ? (audience ?? t('audio.players.send')) : t('audio.players.notSending')}</span>
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
export function DeskHeader({ app, director, moods, holdsSound, onSaveAs }: DeskHeaderProps): React.JSX.Element {
  const active = useSoundValue(director, ({ mix }) => mix.mood);
  const store = MoodStore.forApp(app);
  const mood = moods.find((other) => other.id === active?.id) ?? null;
  const changed = useSoundValue(director, () => mood !== null && director.desk.differsFrom(mood));
  const needsTap = useSoundValue(director, (snapshot) => snapshot.lifecycle === 'needs-tap');
  const lastMix = useSoundValue(director, (snapshot) => snapshot.lastMix !== null);
  const menu = useContextMenu();

  const saveInto = (target: Mood): void => {
    if (director.desk.saveToMood(target)) showNotice(t('audio.saved', { name: target.name }));
  };

  const openMenu = (anchor: HTMLElement): void => {
    const entries: ContextMenuEntry[] = [];
    const others = moods.filter((other) => other.id !== mood?.id && !store.isReadOnly(other.id));
    if (others.length > 0) entries.push({ type: 'submenu', label: t('audio.saveToOther'), children: others.map((other) => ({ type: 'item' as const, label: other.name, onClick: () => saveInto(other) })) });
    entries.push({ type: 'item', label: t('audio.clearMix'), onClick: () => director.stop() });
    menu.open(entries, belowAnchor(anchor), { returnFocus: anchor });
  };

  const canSaveToMood = mood !== null && changed && !store.isReadOnly(mood.id);

  return (
    <header className="atlas-sound-desk__head">
      {holdsSound ? <span className="atlas-sound-desk__mix">{mood?.name ?? t('audio.unsavedMix')}</span> : <span className="atlas-sound-desk__state">{t('audio.nothing')}</span>}
      <span className="atlas-sound-desk__state">{changed ? t('audio.changed') : ''}</span>
      {canSaveToMood && <button type="button" className="atlas-sound-button" onClick={() => saveInto(mood)}>{t('audio.saveTo')}</button>}
      {holdsSound && <button type="button" className="atlas-sound-button atlas-sound-button--quiet" onClick={onSaveAs}>{t('audio.saveAsNew')}</button>}
      {holdsSound && <IconAction label={t('audio.mixMenu')} icon={MoreHorizontal} onClick={(event) => openMenu(event.currentTarget)} />}
      {needsTap && <button type="button" className="atlas-sound-button" onClick={() => director.tap()}>{t('audio.needsTap')}</button>}
      {!holdsSound && lastMix && <button type="button" className="atlas-sound-button atlas-sound-button--quiet" onClick={() => director.resume()}><RotateCcw aria-hidden="true" />{t('audio.resume')}</button>}
      <div className="atlas-sound-desk__end">
        <PlayersLine director={director} />
        <OutputButton director={director} />
      </div>
    </header>
  );
}
