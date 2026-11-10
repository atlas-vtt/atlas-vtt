import type { App } from 'obsidian';
import { BUILT_IN_DICE_SET_PREFIX } from '../../gameSystems/builtInDiceSets';
import { DICE_SET_FORMAT } from '../../gameSystems/diceSetValidation';
import { ATLAS_VTT_DIR } from '../assetPaths';
import { RecordFolderFiles } from '../vaultRecords/RecordFolderFiles';
import type { RecordFolderSpec } from '../vaultRecords/recordFolder';

/** One JSON file per dice set, named after it; the id inside is the set's identity. */
export const DICE_SET_FOLDER = `${ATLAS_VTT_DIR}/dice-sets`;

export const DICE_SET_FOLDER_SPEC: RecordFolderSpec = {
  folder: DICE_SET_FOLDER,
  format: DICE_SET_FORMAT,
  fallbackName: 'Dice set',
  reservedIdPrefix: BUILT_IN_DICE_SET_PREFIX,
  noun: 'dice set',
};

/**
 * The vault's dice sets as files, one per set, followed as every library folder is
 * (`RecordFolderFiles`), so they sync and every collection and template of the vault
 * shares them. One per app, opened by the plugin and released when it unloads.
 */
export class DiceSetFiles extends RecordFolderFiles {
  private static readonly instances = new WeakMap<App, DiceSetFiles>();

  static open(app: App): DiceSetFiles {
    let files = DiceSetFiles.instances.get(app);
    if (!files) {
      files = new DiceSetFiles(app);
      DiceSetFiles.instances.set(app, files);
    }
    return files;
  }

  /** The app's sets once the plugin opened them; undefined before (and in tests that open none). */
  static forApp(app: App | undefined): DiceSetFiles | undefined {
    return app ? DiceSetFiles.instances.get(app) : undefined;
  }

  static release(app: App): void {
    DiceSetFiles.instances.get(app)?.destroy();
    DiceSetFiles.instances.delete(app);
  }

  private constructor(app: App) {
    super(app, DICE_SET_FOLDER_SPEC);
  }
}
