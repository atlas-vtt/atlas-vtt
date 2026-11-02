import type { App } from 'obsidian';
import { RecordFiles, type RecordLayout } from '../services/recordFiles/RecordFiles';
import type { StoredRecord } from '../services/recordFiles/recordLayout';
import { freeNamedPath, nameStem } from '../services/recordFiles/recordNames';
import { parentPath } from '../utils/pathUtils';
import { moodFileText, readStoredMood } from './moodFile';
import { MOODS_FOLDER } from './soundFiles';

const SUFFIX = '.json';

/** A file is named by its mood's id, never its name: two devices saving a mood of one name would write one path, of which sync keeps one. */
const MOOD_LAYOUT: RecordLayout<StoredRecord> = {
  root: MOODS_FOLDER,
  kind: 'mood',
  isRecordPath: (path) => parentPath(path) === MOODS_FOLDER && path.toLowerCase().endsWith(SUFFIX),
  read: readStoredMood,
  text: moodFileText,
  namedPath: (path) => path,
  recordPathIn: (path) => path,
  freeNamedPath: (name, isTaken) => freeNamedPath(MOODS_FOLDER, nameStem(name, 'mood'), SUFFIX, isTaken),
  isNamedAfter: () => true,
};

/** The GM's mood files: one per mood, followed through the vault's events like every record file. */
export class MoodFiles extends RecordFiles<StoredRecord> {
  constructor(app: App) {
    super(app, MOOD_LAYOUT);
  }
}
