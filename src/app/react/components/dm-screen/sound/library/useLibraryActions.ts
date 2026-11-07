import { useMemo } from 'react';
import type { App } from 'obsidian';
import { t } from '../../../../../i18n';
import { nativeFolderPicker } from '../../../../../services/electronRemote';
import type { SoundKind } from '../../../../../sound/soundTypes';
import { fileToMix, listToMix, prepareFiles, takeFromMix, type HeldInMix, type LibraryDeskDeps, type MixIntent } from '../../../../../soundDirector/libraryDesk';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { editFiles, recordsByFile, soundOfFile } from '../../../../../soundLibrary/libraryRecords';
import { moveEntries, renameEntry, trashEntries, usesOf, type LibraryEntry } from '../../../../../soundLibrary/libraryOperations';
import { MoodStore } from '../../../../../soundLibrary/MoodStore';
import { runLibraryImport } from '../../../../../soundLibrary/runLibraryImport';
import { AUDIO_ACCEPT, isAudioPath } from '../../../../../soundLibrary/soundFiles';
import { pickFolder } from '../../../../../soundLibrary/SoundFolderPicker';
import type { LibraryFile, SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { SoundPathReservedError, SoundPathTakenError, SoundVaultPathError, TrashUnavailableError } from '../../../../../soundLibrary/soundLocation';
import type { LinkOutcome } from '../../../../../soundLibrary/SoundRoots';
import { defaultSoundKind, type SoundChanges, type StoredSound } from '../../../../../soundLibrary/soundRecords';
import { SoundRecordStore } from '../../../../../soundLibrary/SoundRecordStore';
import { addTag, cleanTag, removeTag, renameTag, tagsOfFiles, toggleTag, tracksHolding, type TrackTags } from '../../../../../soundLibrary/soundTags';
import { confirmAction } from '../../../../../ui/confirmDialog';
import { mayRelink, relinkSound, type MissingSound } from './relinkSound';
import { stemOf } from '../../../../../soundLibrary/soundPaths';
import { baseName } from '../../../../../utils/pathUtils';
import { promptForText } from '../../../../../ui/textInputDialog';
import { showNotice } from '../../../../../ui/notice';
import { runInBackground } from '../../../../../utils/backgroundTask';

/** Tells why an operation on the library's files failed, in the GM's terms. */
function failure(error: unknown): string {
  if (error instanceof TrashUnavailableError) return t('audio.library.noTrash');
  if (error instanceof SoundPathTakenError) return t('audio.library.nameTaken');
  if (error instanceof SoundPathReservedError) return t('audio.library.reserved');
  if (error instanceof SoundVaultPathError) return t('audio.library.holdsVault');
  console.error('[Atlas] The sound library could not do that', error);
  return t('audio.library.failed');
}

export interface LibraryActions {
  toMix: (files: readonly LibraryFile[], intent: MixIntent) => void;
  takeOut: (held: HeldInMix) => void;
  preview: (file: LibraryFile) => void;
  playList: (files: readonly LibraryFile[], shuffle: boolean) => void;
  /** Makes copies of a root's files, or of those below `folder` without a notice. */
  prepare: (kind: SoundKind, folder?: string) => void;
  link: (kind: SoundKind, anchor: Window) => void;
  unlink: (kind: SoundKind) => void;
  importInto: (files: readonly File[], kind: SoundKind) => void;
  pickImport: (doc: Document, kind: SoundKind) => void;
  /** Files whose kind no root says yet: their names decide. */
  importLoose: (files: readonly File[]) => void;
  pickLoose: (doc: Document) => void;
  rename: (entry: LibraryEntry, name: string) => void;
  move: (entries: readonly LibraryEntry[], kind: SoundKind) => void;
  remove: (entries: readonly LibraryEntry[]) => void;
  forget: (sound: StoredSound) => void;
  /** A sound whose file is not found, pointed at a file of its root the GM picks. */
  relink: (sound: MissingSound) => void;
  mayRelink: (kind: SoundKind) => boolean;
  edit: (files: readonly LibraryFile[], changes: SoundChanges) => void;
  /** Files' tags as the records stand at this moment, for a menu that stays open through its own changes. */
  tagsOf: (files: readonly LibraryFile[]) => TrackTags[];
  onRecords: (listener: () => void) => () => void;
  tag: (files: readonly LibraryFile[], tag: string) => void;
  toggleTag: (files: readonly LibraryFile[], tag: string) => void;
  askNewTag: (files: readonly LibraryFile[]) => void;
  /** How many tracks' records hold a tag, in both roots. */
  tracksWithTag: (tag: string) => number;
  askRenameTag: (tag: string) => void;
  askRemoveTag: (tag: string) => void;
}

function pickFiles(doc: Document, then: (files: File[]) => void): void {
  const input = doc.body.createEl('input', { type: 'file', cls: 'atlas-hidden-file-input', attr: { accept: AUDIO_ACCEPT, multiple: true } });
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.remove();
    then(files);
  });
  input.addEventListener('cancel', () => input.remove());
  input.click();
}

/** Every intent of the library's rows. All of it runs in the background; a press is never held up by a disk. */
export function useLibraryActions(app: App, library: SoundLibrary, director: SoundDirector): LibraryActions {
  return useMemo(() => {
    const records = SoundRecordStore.forApp(app);
    const deps: LibraryDeskDeps = { records, library, director, notify: showNotice };
    const context = { library, records };
    const run = (task: Promise<unknown>, what: string): void => {
      runInBackground(task.catch((error: unknown) => { showNotice(failure(error)); }), what);
    };
    const linkOutcome = (outcome: LinkOutcome): void => {
      if (outcome === 'overlap') showNotice(t('audio.library.overlap'));
      if (outcome === 'reserved') showNotice(t('audio.library.reserved'));
    };

    const actions: LibraryActions = {
      toMix: (files, intent) => run(fileToMix(deps, files, intent), 'Sending sounds to the mix'),
      takeOut: (held) => takeFromMix(director, held),
      preview: (file) => {
        const audioPath = library.audioPathOf(file.kind, file.path);
        if (audioPath === null) return;
        runInBackground(records.whenLoaded().then(() => {
          director.preview(soundOfFile(recordsByFile(records.all(), library), file, audioPath));
        }), 'Previewing a sound');
      },
      playList: (files, shuffle) => run(listToMix(deps, files, shuffle), 'Playing a list'),
      prepare: (kind, folder) => {
        const files = library.filesOf(kind).filter(({ entry }) => folder === undefined || entry.path.startsWith(`${folder}/`));
        runInBackground(prepareFiles(deps, files.map(({ entry }) => ({ ...entry, kind }))).then((count) => {
          if (folder === undefined) showNotice(t('audio.library.preparing', { count }));
        }), 'Preparing a root');
      },
      link: (kind, win) => {
        const dialog = nativeFolderPicker(win);
        const title = t(kind === 'music' ? 'audio.library.linkMusic' : 'audio.library.linkAmbience');
        if (dialog) {
          run(dialog(title).then(async (path) => {
            if (path !== null) linkOutcome(await library.roots.linkChosen(kind, path));
          }), 'Linking a sound folder');
          return;
        }
        const folders = app.vault.getAllFolders(true).map((folder) => ({ label: folder.path, path: folder.path === '/' ? '' : folder.path }));
        pickFolder(app, folders, title, (path) => linkOutcome(library.roots.linkVault(kind, path)));
      },
      unlink: (kind) => library.roots.unlink(kind),
      importInto: (files, kind) => run(runLibraryImport(library, files, kind), 'Importing sounds'),
      pickImport: (doc, kind) => pickFiles(doc, (files) => actions.importInto(files, kind)),
      importLoose: (files) => {
        for (const kind of ['music', 'ambience'] as const) {
          const mine = files.filter((file) => !isAudioPath(file.name) ? kind === 'music' : defaultSoundKind(file.name, null) === kind);
          if (mine.length > 0) actions.importInto(mine, kind);
        }
      },
      pickLoose: (doc) => pickFiles(doc, actions.importLoose),
      rename: (entry, name) => run(renameEntry(context, entry, name), 'Renaming in the library'),
      move: (entries, kind) => run(moveEntries(context, entries, kind), 'Moving in the library'),
      remove: (entries) => {
        const task = usesOf(context, MoodStore.forApp(app), entries).then(async (uses) => {
          const sure = await confirmAction({
            title: entries.length === 1 && entries[0] ? t('audio.library.deleteOneTitle', { name: stemOf(baseName(entries[0].path)) }) : t('audio.library.deleteTitle', { count: entries.length }),
            message: uses.moods > 0 ? [t('audio.library.deleteUses', { count: uses.moods })] : [],
            confirmLabel: t('audio.library.moveToTrash'),
            destructive: true,
          });
          if (sure) await trashEntries(context, entries, uses.sounds);
        });
        run(task, 'Deleting in the library');
      },
      relink: (sound) => relinkSound(app, library, records, sound),
      mayRelink: (kind) => mayRelink(library, kind),
      forget: (sound) => {
        run(confirmAction({ title: t('audio.library.forgetTitle', { name: sound.name }), message: [t('audio.library.forgetMessage')], confirmLabel: t('audio.library.forget'), destructive: true }).then(async (sure) => {
          if (sure) records.remove(sound.id);
        }), 'Forgetting a sound');
      },
      edit: (files, changes) => run(editFiles(records, library, files, changes), 'Changing sounds'),
      tagsOf: (files) => tagsOfFiles(records.all(), library, files),
      onRecords: (listener) => records.onChange(listener),
      tag: (files, tag) => run(addTag(records, library, files, tag), 'Tagging sounds'),
      toggleTag: (files, tag) => run(toggleTag(records, library, files, tag), 'Tagging sounds'),
      askNewTag: (files) => {
        run(promptForText({ title: t('audio.library.newTag'), confirmLabel: t('audio.library.create') }).then(async (text) => {
          const tag = text === null ? null : cleanTag(text);
          if (tag !== null) await addTag(records, library, files, tag);
        }), 'Tagging sounds');
      },
      tracksWithTag: (tag) => tracksHolding(records.all(), library, tag),
      askRenameTag: (from) => {
        run(promptForText({ title: t('audio.library.renameTag', { name: from }), confirmLabel: t('audio.library.save'), initialValue: from }).then((text) => {
          const to = text === null ? null : cleanTag(text);
          if (to === null || to === from) return;
          renameTag(records, from, to);
          library.place.renameTag(from, to);
        }), 'Renaming a tag');
      },
      askRemoveTag: (tag) => {
        const count = tracksHolding(records.all(), library, tag);
        run(confirmAction({ title: t('audio.library.removeTagTitle', { name: tag, count }), message: [], confirmLabel: t('audio.library.removeTag'), destructive: true }).then((sure) => {
          if (sure) removeTag(records, tag);
        }), 'Removing a tag');
      },
    };
    return actions;
  }, [app, library, director]);
}
