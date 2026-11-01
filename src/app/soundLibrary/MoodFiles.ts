import type { App } from 'obsidian';
import { RecordFiles, type RecordLayout } from '../services/recordFiles/RecordFiles';
import type { StoredRecord } from '../services/recordFiles/recordLayout';
import { freeNamedPath, nameStem } from '../services/recordFiles/recordNames';
import { parentPath } from '../utils/pathUtils';
import { moodFileText, readStoredMood } from './moodFile';
import { moodsFolderOf } from './moodPaths';

const SUFFIX = '.json';

/** A file is named by its mood's id, never its name: two devices saving a mood of one name would write one path, of which sync keeps one. */
function moodLayout(collectionId: string): RecordLayout<StoredRecord> {
  const root = moodsFolderOf(collectionId);
  return {
    root,
    kind: 'mood',
    isRecordPath: (path) => parentPath(path) === root && path.toLowerCase().endsWith(SUFFIX),
    read: readStoredMood,
    text: moodFileText,
    namedPath: (path) => path,
    recordPathIn: (path) => path,
    freeNamedPath: (name, isTaken) => freeNamedPath(root, nameStem(name, 'mood'), SUFFIX, isTaken),
    isNamedAfter: () => true,
  };
}

/** The mood files of one collection: one per mood, followed through the vault's events like every record file. */
export class MoodFiles extends RecordFiles<StoredRecord> {
  constructor(app: App, collectionId: string) {
    super(app, moodLayout(collectionId));
  }
}
