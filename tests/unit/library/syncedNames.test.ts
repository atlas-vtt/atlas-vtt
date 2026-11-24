import { describe, expect, it } from 'vitest';
import { CAMPAIGNS_FOLDER } from '../../../src/app/campaigns/campaignPaths';
import { LOOT_HISTORY_FOLDER } from '../../../src/app/loot/lootHistoryPaths';
import type { NoteAsset, TokenAsset } from '../../../src/app/services/AssetService';
import { COLLECTIONS_DIR, GLOBAL_ASSETS_DIR } from '../../../src/app/services/assetPaths';
import { COLLECTION_DATA_DIR } from '../../../src/app/services/collectionBundle/installRecord';
import { DICE_SET_FOLDER } from '../../../src/app/services/diceSets/DiceSetFiles';
import {
  COLLECTION_FILE, INSTALL_FILE, LIBRARY_FILE, collectionFilePath, installFilePath, recordFilePath,
} from '../../../src/app/services/library/libraryPaths';
import { SYSTEM_PRESET_FOLDER } from '../../../src/app/services/systemPresets/presetFiles';
import { SNAPSHOTS_FOLDER } from '../../../src/app/snapshots/snapshotPaths';
import { TEMPLATE_FOLDER } from '../../../src/app/statblocks/library/templatePaths';

const token: TokenAsset = { id: 'token-1', type: 'token', name: 'Bog hag', tags: [], collection: 'Fen', imagePath: 'atlas-vtt/collections/Fen/tokens/hag.webp', size: 1, createdAt: 1, modifiedAt: 1 };
const note: NoteAsset = { id: 'note-1', type: 'note', name: 'The ford', tags: [], collection: 'Fen', notePath: 'Notes/The ford.md', createdAt: 1, modifiedAt: 1 };

/** The folders and the file of a path that sync tools leave behind: a name beginning with a dot (Obsidian Sync, Remotely Save, Self-hosted LiveSync) or an underscore (Remotely Save). */
const skippedBySync = (path: string): string[] => path.split('/').filter((name) => /^[._]/.test(name));

describe('the names Atlas gives what a vault syncs', () => {
  it('begin with neither a dot nor an underscore in any library file, so every sync tool carries the library', () => {
    const paths = [LIBRARY_FILE, COLLECTION_FILE, INSTALL_FILE, collectionFilePath('Fen'), installFilePath('Fen'), recordFilePath(token), recordFilePath(note)];
    expect(paths.map((path) => [path, skippedBySync(path)])).toEqual(paths.map((path) => [path, []]));
    expect(recordFilePath(note)).toBe('atlas-vtt/collections/Fen/notes/note-1.json');
  });

  it('begin with neither in the folders the library lies in', () => {
    const folders = [COLLECTIONS_DIR, GLOBAL_ASSETS_DIR, SYSTEM_PRESET_FOLDER, DICE_SET_FOLDER, TEMPLATE_FOLDER, CAMPAIGNS_FOLDER, SNAPSHOTS_FOLDER, LOOT_HISTORY_FOLDER];
    expect(folders.map((folder) => [folder, skippedBySync(folder)])).toEqual(folders.map((folder) => [folder, []]));
  });

  it("keep this device's cache in a dot folder, which no sync tool carries to another device", () => {
    expect(skippedBySync(COLLECTION_DATA_DIR)).toEqual(['.atlas-data']);
  });
});
