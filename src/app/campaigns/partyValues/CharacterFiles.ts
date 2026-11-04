import type { App } from 'obsidian';
import { RecordFiles } from '../../services/recordFiles/RecordFiles';
import { CHARACTERS_LAYOUT, type StoredCharacters } from './charactersFile';

/** The campaigns' characters files (`charactersFile.ts`), one per campaign folder that keeps values. */
export class CharacterFiles extends RecordFiles<StoredCharacters> {
  constructor(app: App) {
    super(app, CHARACTERS_LAYOUT);
  }
}
