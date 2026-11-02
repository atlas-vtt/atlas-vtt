import { useMemo } from 'react';
import type { App } from 'obsidian';
import { t } from '../../../../../i18n';
import { nativeFolderPicker } from '../../../../../services/electronRemote';
import { AssetService, type SoundAsset } from '../../../../../services/AssetService';
import type { SoundKind } from '../../../../../sound/soundTypes';
import { fileToMix, folderToMix, prepareFolder, takeFromMix, type HeldInMix, type LibraryDeskDeps, type MixIntent } from '../../../../../soundDirector/libraryDesk';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { editFiles, recordOfFile, unrecordedSound } from '../../../../../soundLibrary/libraryRecords';
import { makeLibraryFolder, moveEntries, renameEntry, trashEntries, usesOf, type LibraryEntry } from '../../../../../soundLibrary/libraryOperations';
import { MoodStore } from '../../../../../soundLibrary/MoodStore';
import { runLibraryImport } from '../../../../../soundLibrary/runLibraryImport';
import { AUDIO_ACCEPT, isAudioPath } from '../../../../../soundLibrary/soundFiles';
import { pickFolder, type FolderChoice } from '../../../../../soundLibrary/SoundFolderPicker';
import type { LibraryFile, SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { SoundPathTakenError, TrashUnavailableError } from '../../../../../soundLibrary/soundLocation';
import { safeName } from '../../../../../soundLibrary/soundPaths';
import { defaultSoundKind, soundRecordOf, type SoundChanges } from '../../../../../soundLibrary/soundRecords';
import { confirmAction } from '../../../../../ui/confirmDialog';
import { promptForText } from '../../../../../ui/textInputDialog';
import { showNotice } from '../../../../../ui/notice';
import { runInBackground } from '../../../../../utils/backgroundTask';

const refresh = (app: App): void => { app.workspace.trigger('atlas-vtt:refresh-assets'); };

/** Tells why an operation on the library's files failed, in the GM's terms. */
function failure(error: unknown): string {
  if (error instanceof TrashUnavailableError) return t('audio.library.noTrash');
  if (error instanceof SoundPathTakenError) return t('audio.library.nameTaken');
  console.error('[Atlas] The sound library could not do that', error);
  return t('audio.library.failed');
}

export interface LibraryActions {
  toMix(files: readonly LibraryFile[], intent: MixIntent): void;
  takeOut(held: HeldInMix): void;
  preview(file: LibraryFile): void;
  playFolder(kind: SoundKind, folder: string, shuffle: boolean): void;
  prepare(kind: SoundKind, folder: string): void;
  link(kind: SoundKind, anchor: Window): void;
  unlink(kind: SoundKind): void;
  askNewFolder(kind: SoundKind, folder: string): void;
  importInto(files: readonly File[], kind: SoundKind, folder: string): void;
  pickImport(doc: Document, kind: SoundKind, folder: string): void;
  /** Files whose kind no root says yet: their names decide. */
  importLoose(files: readonly File[]): void;
  pickLoose(doc: Document): void;
  rename(entry: LibraryEntry, name: string): void;
  move(entries: readonly LibraryEntry[], kind: SoundKind, folder: string): void;
  askMove(entries: readonly LibraryEntry[]): void;
  remove(entries: readonly LibraryEntry[]): void;
  forget(sound: SoundAsset): void;
  edit(files: readonly LibraryFile[], changes: SoundChanges): void;
  askCredit(files: readonly LibraryFile[], current: string, name: string): void;
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
export function useLibraryActions(app: App, library: SoundLibrary, director: SoundDirector, collectionId: string | null): LibraryActions {
  return useMemo(() => {
    const assets = AssetService.getInstance(app);
    const deps: LibraryDeskDeps = { assets, library, director, notify: (message) => showNotice(message) };
    const context = { library, assets };
    const inUse = (): string => director.snapshot().mix.mood?.collectionId ?? collectionId ?? assets.getDefaultCollectionId();
    const run = (task: Promise<unknown>, what: string): void => {
      runInBackground(task.then(() => refresh(app)).catch((error: unknown) => { showNotice(failure(error)); }), what);
    };

    const actions: LibraryActions = {
      toMix: (files, intent) => run(fileToMix(deps, files, intent, inUse()), 'Sending sounds to the mix'),
      takeOut: (held) => takeFromMix(director, held),
      preview: (file) => {
        const audioPath = library.audioPathOf(file.kind, file.path);
        if (audioPath === null) return;
        runInBackground(assets.getAssets(undefined, 'sound').then((sounds) => {
          const held = recordOfFile(sounds, audioPath, inUse());
          director.preview(held ? soundRecordOf(held) : unrecordedSound(file, audioPath, inUse()));
        }), 'Previewing a sound');
      },
      playFolder: (kind, folder, shuffle) => run(folderToMix(deps, kind, folder, shuffle, inUse()), 'Playing a folder'),
      prepare: (kind, folder) => {
        runInBackground(prepareFolder(deps, kind, folder, inUse()).then((count) => {
          showNotice(t('audio.library.preparing', { count }));
        }), 'Preparing a folder');
      },
      link: (kind, win) => {
        const dialog = nativeFolderPicker(win);
        const title = t(kind === 'music' ? 'audio.library.linkMusic' : 'audio.library.linkAmbience');
        if (dialog) {
          run(dialog(title).then(async (path) => {
            if (path !== null && await library.roots.linkChosen(kind, path) === 'overlap') showNotice(t('audio.library.overlap'));
          }), 'Linking a sound folder');
          return;
        }
        const folders: FolderChoice<string>[] = app.vault.getAllFolders(true).map((folder) => ({ label: folder.path, value: folder.path === '/' ? '' : folder.path }));
        pickFolder(app, folders, title, (path) => {
          if (library.roots.linkVault(kind, path) === 'overlap') showNotice(t('audio.library.overlap'));
        });
      },
      unlink: (kind) => library.roots.unlink(kind),
      askNewFolder: (kind, folder) => {
        run(promptForText({ title: t('audio.library.newFolder'), confirmLabel: t('audio.library.create') }).then(async (text) => {
          if (text === null) return;
          const name = safeName(text);
          if (name === null) showNotice(t('audio.library.badName'));
          else await makeLibraryFolder(context, kind, folder, name);
        }), 'Making a folder');
      },
      importInto: (files, kind, folder) => run(runLibraryImport(library, files, kind, folder), 'Importing sounds'),
      pickImport: (doc, kind, folder) => pickFiles(doc, (files) => actions.importInto(files, kind, folder)),
      importLoose: (files) => {
        for (const kind of ['music', 'ambience'] as const) {
          const mine = files.filter((file) => !isAudioPath(file.name) ? kind === 'music' : defaultSoundKind(file.name, null) === kind);
          if (mine.length > 0) actions.importInto(mine, kind, '');
        }
      },
      pickLoose: (doc) => pickFiles(doc, actions.importLoose),
      rename: (entry, name) => run(renameEntry(context, entry, name), 'Renaming in the library'),
      move: (entries, kind, folder) => run(moveEntries(context, entries, kind, folder), 'Moving in the library'),
      askMove: (entries) => {
        const choices = (['music', 'ambience'] as const).flatMap((kind): FolderChoice<{ kind: SoundKind; folder: string }>[] => {
          const label = t(kind === 'music' ? 'audio.music' : 'audio.ambience');
          if (!library.locationOf(kind)) return [];
          const folders = new Set<string>(['']);
          const walk = (folder: string): void => {
            for (const sub of library.listing(kind, folder)?.folders ?? []) {
              folders.add(sub.path);
              walk(sub.path);
            }
          };
          walk('');
          return [...folders].map((folder) => ({ label: folder === '' ? label : `${label} / ${folder.split('/').join(' / ')}`, value: { kind, folder } }));
        });
        pickFolder(app, choices, t('audio.library.moveTo'), ({ kind, folder }) => actions.move(entries, kind, folder));
      },
      remove: (entries) => {
        const task = usesOf(context, MoodStore.forApp(app), entries).then(async (uses) => {
          const sure = await confirmAction({
            title: t('audio.library.deleteTitle', { count: entries.length }),
            message: uses.moods > 0 ? [t('audio.library.deleteUses', { count: uses.moods })] : [],
            confirmLabel: t('audio.mood.delete'),
            destructive: true,
          });
          if (sure) await trashEntries(context, entries, uses.sounds);
        });
        run(task, 'Deleting in the library');
      },
      forget: (sound) => {
        run(confirmAction({ title: t('audio.library.forgetTitle', { name: sound.name }), message: [], confirmLabel: t('audio.mood.delete'), destructive: true }).then(async (sure) => {
          if (sure) await assets.deleteAsset(sound.id);
        }), 'Forgetting a sound');
      },
      edit: (files, changes) => run(editFiles(assets, library, files, inUse(), changes), 'Changing sounds'),
      askCredit: (files, current, name) => {
        run(promptForText({ title: t('audio.creditTitle', { name }), confirmLabel: t('audio.library.save'), initialValue: current, placeholder: t('audio.creditPlaceholder') }).then(async (credit) => {
          if (credit !== null) await editFiles(assets, library, files, inUse(), { credit });
        }), 'Changing a credit');
      },
    };
    return actions;
  }, [app, library, director, collectionId]);
}
