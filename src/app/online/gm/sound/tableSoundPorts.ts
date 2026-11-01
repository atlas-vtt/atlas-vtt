import type { App } from 'obsidian';
import { t } from '../../../i18n';
import { presentedSceneOf } from '../../../services/presentedScene';
import { licenceNoteDue, loadSendToPlayers, saveSendToPlayers } from '../../../soundDirector/deviceFacts';
import { SoundDirector } from '../../../soundDirector/SoundDirector';
import { showNotice } from '../../../ui/notice';
import type { AssetPublisher } from '../assets/AssetPublisher.ts';
import type { Timers } from '../companionTimers.ts';
import { TableSoundShare, type SoundSharePorts } from './TableSoundShare.ts';

const LICENSED_SOURCES = 'https://freesound.org/help/faq/';

/** The one line the first upload brings, with where licensed sounds can be had. */
function licenceNote(): DocumentFragment {
  const note = document.createDocumentFragment();
  note.append(`${t('audio.players.note')} `);
  const link = document.createElement('a');
  link.href = LICENSED_SOURCES;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = 'external-link';
  link.textContent = t('audio.players.noteLink');
  note.append(link);
  return note;
}

export type TableSoundDeps = Pick<SoundSharePorts, 'send' | 'sendTime' | 'connected'> & { readonly app: App; readonly publisher: AssetPublisher; readonly timers: Timers };

/** A table's sound share on the app's director, its store, its presented scene and this device's choices. */
export function tableSoundShare({ app, publisher, timers, send, sendTime, connected }: TableSoundDeps): TableSoundShare {
  const presented = presentedSceneOf(app);
  return new TableSoundShare({
    director: SoundDirector.forApp(app),
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
