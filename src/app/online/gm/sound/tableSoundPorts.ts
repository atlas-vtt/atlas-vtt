import type { App } from 'obsidian';
import { t } from '../../../i18n';
import { presentedSceneOf } from '../../../services/presentedScene';
import { licenceNoteDue, loadSendToPlayers, saveSendToPlayers } from '../../../soundDirector/deviceFacts';
import { openedDirector } from '../../../soundDirector/directorRegistry';
import { showNotice } from '../../../ui/notice';
import type { AssetPublisher } from '../assets/AssetPublisher.ts';
import type { Timers } from '../companionTimers.ts';
import { TableSoundShare, type SoundSharePorts } from './TableSoundShare.ts';

const LICENSED_SOURCES = 'https://freesound.org/help/faq/';

/** The one line the first upload brings, with where licensed sounds can be had. */
function licenceNote(): DocumentFragment {
  return createFragment((note) => {
    note.appendText(`${t('audio.players.note')} `);
    note.createEl('a', { text: t('audio.players.noteLink'), href: LICENSED_SOURCES, cls: 'external-link', attr: { target: '_blank', rel: 'noopener noreferrer' } });
  });
}

export type TableSoundDeps = Pick<SoundSharePorts, 'send' | 'sendTime' | 'connected'> & { readonly app: App; readonly publisher: AssetPublisher; readonly timers: Timers };

/** A table's sound share on the app's director, its store, its presented scene and this device's choices; null where no director was opened. */
export function tableSoundShare({ app, publisher, timers, send, sendTime, connected }: TableSoundDeps): TableSoundShare | null {
  const director = openedDirector(app);
  if (director === undefined) return null;
  const presented = presentedSceneOf(app);
  return new TableSoundShare({
    director,
    timers,
    send,
    sendTime,
    connected,
    copyRef: (copy, read, use, handed) => publisher.storing.copyRef(copy, read, use, handed),
    copyState: (id) => publisher.copyState(id),
    presentedPath: () => presented.get()?.filePath ?? null,
    onPresentedChange: (listener) => presented.onChange(listener),
    loadSending: () => loadSendToPlayers(app),
    saveSending: (on) => saveSendToPlayers(app, on),
    uploadsBegan: () => {
      if (licenceNoteDue(app)) showNotice(licenceNote(), 0);
    },
  });
}
