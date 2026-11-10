import type { App } from 'obsidian';
import { RecordFiles, type RecordLayout } from '../recordFiles/RecordFiles';
import {
  freeRecordPath,
  isNamedAfter,
  isRecordPath,
  readRecordText,
  recordText,
  type RecordFolderSpec,
  type StoredRecord,
} from './recordFolder';

/** How a folder of records named after themselves (`recordFolder.ts`) lies in the vault. */
function folderLayout(spec: RecordFolderSpec): RecordLayout<StoredRecord> {
  return {
    root: spec.folder,
    kind: spec.noun,
    isRecordPath: (path) => isRecordPath(spec, path),
    read: (text) => readRecordText(spec, text),
    text: (record) => recordText(spec, record),
    namedPath: (path) => path,
    recordPathIn: (path) => path,
    freeNamedPath: (name, isTaken) => freeRecordPath(spec, name, isTaken),
    isNamedAfter: (path, name) => isNamedAfter(spec, path, name),
  };
}

/**
 * A folder of library records as vault files (`recordFolder.ts`), one per record, kept as every
 * kind of record file is (`RecordFiles`): followed through creates, edits, deletes and renames,
 * written in order in the background.
 */
export class RecordFolderFiles extends RecordFiles<StoredRecord> {
  constructor(app: App, spec: RecordFolderSpec) {
    super(app, folderLayout(spec));
  }

  /**
   * Writes a new record file. `apart` names it with a piece of its id: devices that carry their
   * records over at once could otherwise each write a file of the same name, of which sync keeps
   * one. Its next edit gives it the plain name when that is free.
   */
  override create(entry: StoredRecord, apart = false): void {
    super.create(entry, apart ? `${typeof entry.name === 'string' ? entry.name : ''} (${entry.id.slice(-6)})` : entry.name);
  }
}
