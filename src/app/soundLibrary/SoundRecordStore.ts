import { type App, type EventRef, type TAbstractFile } from 'obsidian';
import { RecordFiles, type RecordLayout } from '../services/recordFiles/RecordFiles';
import { freeNamedPath, nameStem } from '../services/recordFiles/recordNames';
import { parentPath } from '../utils/pathUtils';
import { runInBackground } from '../utils/backgroundTask';
import { RECORDS_FOLDER } from './soundFiles';
import { isNewerSound, readStoredSound, soundAfterMove, soundFileText, withChanges, type SoundChanges, type StoredSound } from './soundRecords';

const SUFFIX = '.json';
const NO_SOUNDS: readonly StoredSound[] = [];

const SOUND_LAYOUT: RecordLayout<StoredSound> = {
  root: RECORDS_FOLDER,
  kind: 'sound record',
  isRecordPath: (path) => parentPath(path) === RECORDS_FOLDER && path.toLowerCase().endsWith(SUFFIX),
  read: readStoredSound,
  text: soundFileText,
  namedPath: (path) => path,
  recordPathIn: (path) => path,
  freeNamedPath: (name, isTaken) => freeNamedPath(RECORDS_FOLDER, nameStem(name, 'sound'), SUFFIX, isTaken),
  isNamedAfter: () => true,
};

class SoundRecordFiles extends RecordFiles<StoredSound> {
  constructor(app: App) {
    super(app, SOUND_LAYOUT);
  }
}

/**
 * The GM's sound records, once for the whole vault: one file per sound in use in
 * `atlas-vtt/sounds/records/`, followed through the vault's events. A record follows its file when the
 * vault renames it, and a file that is missing leaves its record waiting: a record goes only when the
 * GM deletes it. One per app, released when the plugin unloads.
 */
export class SoundRecordStore {
  private static readonly instances = new WeakMap<App, SoundRecordStore>();

  static forApp(app: App): SoundRecordStore {
    let store = SoundRecordStore.instances.get(app);
    if (!store) {
      store = new SoundRecordStore(app);
      SoundRecordStore.instances.set(app, store);
    }
    return store;
  }

  static release(app: App): void {
    SoundRecordStore.instances.get(app)?.destroy();
    SoundRecordStore.instances.delete(app);
  }

  private readonly files: SoundRecordFiles;
  private readonly rename: EventRef;
  private started = false;

  private constructor(private readonly app: App) {
    this.files = new SoundRecordFiles(app);
    this.rename = app.vault.on('rename', (file: TAbstractFile, oldPath: string) => this.followRename(file.path, oldPath));
  }

  /** Settles once the record files have been read. */
  whenLoaded(): Promise<void> {
    this.started = true;
    return this.files.load();
  }

  /** Every record; the same array while nothing changed. Empty until they are read. */
  all(): readonly StoredSound[] {
    if (!this.started) {
      this.started = true;
      runInBackground(this.files.load(), 'Reading the sound records');
    }
    return this.files.isLoaded() ? this.files.entries() : NO_SOUNDS;
  }

  /** Writes new records at the paths their ids name, so two devices that made one record at once hold one file. */
  add(sounds: readonly StoredSound[]): void {
    for (const sound of sounds) this.files.createAt(`${RECORDS_FOLDER}/${sound.id}${SUFFIX}`, sound, (onDisk) => onDisk);
  }

  /** Changes the records named, each over what its file holds then. */
  update(ids: readonly string[], changes: SoundChanges, now = Date.now()): void {
    for (const id of ids) this.change(id, (stored) => withChanges(stored, changes, now));
  }

  /** Changes every record `change` answers for; null leaves one as it is. */
  rewrite(change: (stored: StoredSound) => StoredSound | null): boolean {
    let changed = false;
    for (const stored of this.files.entries()) {
      if (change(stored) === null) continue;
      changed = this.change(stored.id, (now) => change(now) ?? now) || changed;
    }
    return changed;
  }

  remove(id: string): void {
    this.files.remove(id);
  }

  /** Settles once everything saved so far is on disk. */
  flush(): Promise<void> {
    return this.files.flush();
  }

  onChange(listener: () => void): () => void {
    return this.files.onChange(listener);
  }

  private change(id: string, change: (stored: StoredSound) => StoredSound): boolean {
    const held = this.files.entries().find((stored) => stored.id === id);
    if (!held || isNewerSound(held)) return false;
    this.files.update(id, (stored) => (isNewerSound(stored) ? stored : change(stored)));
    return true;
  }

  private followRename(to: string, from: string): void {
    const now = Date.now();
    this.rewrite((stored) => soundAfterMove(stored, from, to, now));
  }

  private destroy(): void {
    this.app.vault.offref(this.rename);
    this.files.destroy();
  }
}
