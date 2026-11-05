import React from 'react';
import { MoreHorizontal, RotateCcw, Speaker } from 'lucide-react';
import type { App } from 'obsidian';
import { t } from '../../../../i18n';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { listOutputDevices } from '../../../../sound/engine/outputDevice';
import { ROOM_IDS, type Mood } from '../../../../sound/soundTypes';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { MoodStore } from '../../../../soundLibrary/MoodStore';
import { confirmAction } from '../../../../ui/confirmDialog';
import { showNotice, showNoticeWithAction } from '../../../../ui/notice';
import { useContextMenu, type ContextMenuEntry } from '../../../root/ContextMenuContext';
import { IconAction } from './IconAction';
import { CutTooltip } from './CutTooltip';
import { announceSound } from './SoundLiveRegion';
import { useSoundValue } from './useSound';
import { ROOM_ICONS, roomName, useRoom } from './useRoomName';

interface DeskHeaderProps {
  app: App;
  director: SoundDirector;
  moods: readonly Mood[];
  holdsSound: boolean;
  onSaveAs: () => void;
}

/** Long enough to read the notice and reach its Undo. */
const UNDO_NOTICE_MS = 8000;

function belowAnchor(anchor: HTMLElement): { x: number; y: number } {
  const box = anchor.getBoundingClientRect();
  return { x: box.left, y: box.bottom };
}

/** Who hears it, in one line; while a table runs online, also the way to what is sent. */
function PlayersLine({ director }: { director: SoundDirector }): React.JSX.Element | null {
  useSoundValue(director, (snapshot) => snapshot.playersRevision);
  const audience = useSoundValue(director, (snapshot) => snapshot.audience);
  const detail = useSoundValue(director, (snapshot) => snapshot.audienceDetail);
  const stopped = useSoundValue(director, ({ mix }) => mix.table.silenced);
  const menu = useContextMenu();
  const { sounds } = director.players;
  if (sounds === null) return audience === null ? null : <span className="atlas-sound-who"><i aria-hidden="true" /><span>{audience}</span></span>;
  const open = (anchor: HTMLElement): void => {
    menu.open([
      { type: 'item', label: t('audio.players.send'), checked: sounds.sending, onClick: () => sounds.setSending(!sounds.sending) },
      { type: 'item', label: t('audio.players.prepare'), disabled: !sounds.sending, onClick: () => sounds.prepare() },
    ], belowAnchor(anchor), { returnFocus: anchor, label: t('audio.players.menuLabel') });
  };
  const row = (
    <button type="button" className="atlas-sound-who" aria-haspopup="menu" data-off={!sounds.sending || undefined} data-stopped={stopped || undefined} onClick={(event) => open(event.currentTarget)}>
      <i aria-hidden="true" />
      <span>{sounds.sending ? (audience ?? t('audio.players.sending')) : t('audio.players.notSending')}</span>
    </button>
  );
  // Who that is, by name, and why someone does not hear: the count alone left a cold run guessing.
  // Below the row, at its end: it belongs to the row, not to the mood tiles above.
  return sounds.sending && detail !== null ? <LabelTooltip label={detail} side="bottom" align="end" describe>{row}</LabelTooltip> : row;
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
    ], belowAnchor(anchor), { returnFocus: anchor, label: t('audio.outputNamed', { device: output?.label ?? t('audio.outputDefault') }) });
  };
  const device = output ? output.label || t('audio.outputUnnamed') : t('audio.outputDefault');
  return (
    <button type="button" className="atlas-sound-output" aria-haspopup="menu" aria-label={t('audio.outputNamed', { device })} onClick={(event) => void open(event.currentTarget)}>
      <Speaker aria-hidden="true" />
      <span>{device}</span>
    </button>
  );
}

/** The space the mix's reverb rings in, changed right here: the old room rings out under the new. */
function RoomButton({ director }: { director: SoundDirector }): React.JSX.Element {
  const room = useRoom(director);
  const menu = useContextMenu();
  const Icon = ROOM_ICONS[room];
  const open = (anchor: HTMLElement): void => {
    menu.open(ROOM_IDS.map((id) => ({ type: 'item' as const, label: roomName(id), checked: id === room, onClick: () => director.desk.setRoom(id) })), belowAnchor(anchor), { returnFocus: anchor, label: t('audio.room.choose', { room: roomName(room) }) });
  };
  return (
    <button type="button" className="atlas-sound-output atlas-sound-room" aria-haspopup="menu" aria-label={t('audio.room.choose', { room: roomName(room) })} onClick={(event) => open(event.currentTarget)}>
      <Icon aria-hidden="true" />
      <span>{roomName(room)}</span>
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

  // A save replaces what the mood held: its notice can put that back.
  const saveInto = (target: Mood): void => {
    const before = moods.find((other) => other.id === target.id) ?? target;
    if (!director.desk.saveToMood(target)) return;
    announceSound(t('audio.saved', { name: target.name }));
    showNoticeWithAction(t('audio.saved', { name: target.name }), t('audio.undo'), () => {
      if (!store.saveMood(before)) return;
      showNotice(t('audio.restored', { name: before.name }));
      announceSound(t('audio.restored', { name: before.name }));
    }, UNDO_NOTICE_MS);
  };

  // Another mood's sounds are replaced, and the mix's own is only offered once it changed: that one asks.
  const saveIntoOther = async (target: Mood): Promise<void> => {
    const sure = await confirmAction({
      title: t('audio.saveIntoTitle', { name: target.name }),
      message: [t('audio.saveIntoMessage', { name: target.name })],
      confirmLabel: t('audio.saveTo'),
    });
    if (sure) saveInto(target);
  };

  const clearMix = async (): Promise<void> => {
    const sure = await confirmAction({ title: t('audio.clearMixTitle'), message: [t('audio.clearMixMessage')], confirmLabel: t('audio.clearMix'), destructive: true });
    if (sure) director.stop();
  };

  // Back to the mood as it is saved, as a press of its tile plays it; Undo plays the mix as it was again.
  const backToMood = (target: Mood): void => {
    const before = director.desk.mixNow(target.fadeSeconds);
    director.press(target);
    announceSound(t('audio.backToMoodDone', { name: target.name }));
    showNoticeWithAction(t('audio.backToMoodDone', { name: target.name }), t('audio.undo'), () => director.desk.playMix({ id: target.id }, before, true), UNDO_NOTICE_MS);
  };

  const openMenu = (anchor: HTMLElement): void => {
    const entries: ContextMenuEntry[] = [];
    if (mood && changed) entries.push({ type: 'item', label: t('audio.backToMood', { name: mood.name }), onClick: () => backToMood(mood) });
    const others = moods.filter((other) => other.id !== mood?.id && !store.isReadOnly(other.id));
    if (others.length > 0) entries.push({ type: 'submenu', label: t('audio.saveToOther'), children: others.map((other) => ({ type: 'item' as const, label: other.name, onClick: () => void saveIntoOther(other) })) });
    entries.push({ type: 'item', label: t('audio.clearMix'), destructive: true, onClick: () => void clearMix() });
    menu.open(entries, belowAnchor(anchor), { returnFocus: anchor, label: t('audio.mixMenu') });
  };

  const canSaveToMood = mood !== null && changed && !store.isReadOnly(mood.id);

  return (
    <header className="atlas-sound-desk__head">
      {holdsSound ? <CutTooltip><span className="atlas-sound-desk__mix">{mood?.name ?? t('audio.unsavedMix')}</span></CutTooltip> : <span className="atlas-sound-desk__state">{t('audio.nothing')}</span>}
      <span className="atlas-sound-desk__state">{changed ? t('audio.changed') : ''}</span>
      {canSaveToMood && <button type="button" className="atlas-sound-button" onClick={() => saveInto(mood)}>{t('audio.saveTo')}</button>}
      {holdsSound && <button type="button" className="atlas-sound-button atlas-sound-button--quiet" onClick={onSaveAs}>{t('audio.saveAsNew')}</button>}
      {holdsSound && <IconAction label={t('audio.mixMenu')} icon={MoreHorizontal} onClick={(event) => openMenu(event.currentTarget)} />}
      {holdsSound && <RoomButton director={director} />}
      {needsTap && <button type="button" className="atlas-sound-button" onClick={() => director.tap()}>{t('audio.needsTap')}</button>}
      {!holdsSound && lastMix && <button type="button" className="atlas-sound-button atlas-sound-button--quiet" onClick={() => director.resume()}><RotateCcw aria-hidden="true" />{t('audio.resume')}</button>}
      <div className="atlas-sound-desk__end">
        <PlayersLine director={director} />
        <OutputButton director={director} />
      </div>
    </header>
  );
}
