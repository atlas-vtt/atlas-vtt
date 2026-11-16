import type { App } from 'obsidian';
import { t } from '../../../../../i18n';
import type { SoundKind } from '../../../../../sound/soundTypes';
import { pickSoundFile } from '../../../../../soundLibrary/SoundFolderPicker';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import type { SoundRecordStore } from '../../../../../soundLibrary/SoundRecordStore';
import { showNotice } from '../../../../../ui/notice';

/** What a relink needs of a sound whose file is not found: the record, its root, and its name to ask with. */
export interface MissingSound {
  id: string;
  kind: SoundKind;
  name: string;
}

/** Whether a missing sound's root can be read here, so that a file of it can be picked. */
export const mayRelink = (library: SoundLibrary, kind: SoundKind): boolean => library.locationOf(kind) !== null && library.filesOf(kind).length > 0;

/**
 * Points a sound whose file is not found at a file of its root the GM picks. Its moods, tags and trim stay with
 * the record; what was prepared from the old file plays on until the new one is read.
 */
export function relinkSound(app: App, library: SoundLibrary, records: SoundRecordStore, sound: MissingSound): void {
  const files = library.filesOf(sound.kind);
  pickSoundFile(app, files.map(({ entry }) => ({ label: entry.path, path: entry.path })), t('audio.library.relinkTitle', { name: sound.name }), (path) => {
    const entry = files.find((file) => file.entry.path === path)?.entry;
    const audioPath = library.audioPathOf(sound.kind, path);
    if (!entry || audioPath === null) return;
    records.update([sound.id], { audioPath, audioSize: entry.size });
    showNotice(t('audio.library.relinked', { name: sound.name }));
  });
}
