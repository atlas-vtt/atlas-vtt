import type { App } from 'obsidian';
import { t } from '../../../i18n';
import { presentedSceneOf } from '../../../services/presentedScene';
import { licenceNoteDue, loadSendToPlayers, saveSendToPlayers } from '../../../soundDirector/deviceFacts';
import { openedDirector } from '../../../soundDirector/directorRegistry';
import { showNotice } from '../../../ui/notice';
import type { AssetPublisher } from '../assets/AssetPublisher.ts';
import type { Timers } from '../companionTimers.ts';
import { isRecord, parsePlayerSoundState, type PlayerSoundState } from '../../protocol/index.ts';
import { TableSoundShare, type SoundSharePorts } from './TableSoundShare.ts';

const LICENSED_SOURCES = 'https://freesound.org/help/faq/';
/** Where this device keeps what pages last told it, across a reload of the plugin: a device fact, never synced. */
const HEARD_KEY = 'atlas-vtt-sound-heard';
/** A reload is seconds; what is older than this belongs to another session. */
const HEARD_KEPT_MS = 10 * 60_000;

/** What pages told before a reload, while it is recent; entries a page could not have sent are dropped. */
function recallHeard(app: App): Array<readonly [string, PlayerSoundState]> {
  const kept: unknown = app.loadLocalStorage(HEARD_KEY);
  if (!isRecord(kept) || typeof kept.at !== 'number' || Date.now() - kept.at > HEARD_KEPT_MS || !Array.isArray(kept.pages)) return [];
  return kept.pages.flatMap((entry: unknown): Array<readonly [string, PlayerSoundState]> => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !isRecord(entry[1])) return [];
    const state = parsePlayerSoundState(entry[1]);
    return state ? [[entry[0], state]] : [];
  });
}

/** The one line the first upload brings, with where licensed sounds can be had. */
function licenceNote(): DocumentFragment {
  return createFragment((note) => {
    note.appendText(`${t('audio.players.note')} `);
    note.createEl('a', { text: t('audio.players.noteLink'), href: LICENSED_SOURCES, cls: 'external-link', attr: { target: '_blank', rel: 'noopener noreferrer' } });
  });
}

export type TableSoundDeps = Pick<SoundSharePorts, 'send' | 'sendTime' | 'connected' | 'nameOf'> & { readonly app: App; readonly publisher: AssetPublisher; readonly timers: Timers };

/** A table's sound share on the app's director, its store, its presented scene and this device's choices; null where no director was opened. */
export function tableSoundShare({ app, publisher, timers, send, sendTime, connected, nameOf }: TableSoundDeps): TableSoundShare | null {
  const director = openedDirector(app);
  if (director === undefined) return null;
  const presented = presentedSceneOf(app);
  return new TableSoundShare({
    director,
    timers,
    send,
    sendTime,
    connected,
    ...(nameOf && { nameOf }),
    copyRef: (copy, read, use, handed) => publisher.storing.copyRef(copy, read, use, handed),
    segmentsRef: (key, codecVersion, segments, use, handed) => publisher.storing.segmentsRef(key, codecVersion, segments, use, handed),
    segmentsTaken: () => publisher.storing.segmentsTaken(),
    copyState: (id) => publisher.copyState(id),
    presentedPath: () => presented.get()?.filePath ?? null,
    onPresentedChange: (listener) => presented.onChange(listener),
    loadSending: () => loadSendToPlayers(app),
    saveSending: (on) => saveSendToPlayers(app, on),
    uploadsBegan: () => {
      if (licenceNoteDue(app)) showNotice(licenceNote(), 0);
    },
    recallHeard: () => recallHeard(app),
    rememberHeard: (pages) => app.saveLocalStorage(HEARD_KEY, { at: Date.now(), pages }),
  });
}
