import type { App } from 'obsidian';
import type { PresetStorage } from '../SystemPresetService';
import { RecordFolderFiles } from '../vaultRecords/RecordFolderFiles';
import { PRESET_FOLDER_SPEC } from './presetFiles';

/**
 * The user's game system presets as vault files (`presetFiles.ts`), one per preset, followed
 * as every library folder is (`RecordFolderFiles`). One per app, opened by the plugin and
 * released when it unloads.
 */
export class SystemPresetFiles extends RecordFolderFiles implements PresetStorage {
  private static readonly instances = new WeakMap<App, SystemPresetFiles>();

  static open(app: App): SystemPresetFiles {
    let files = SystemPresetFiles.instances.get(app);
    if (!files) {
      files = new SystemPresetFiles(app);
      SystemPresetFiles.instances.set(app, files);
    }
    return files;
  }

  /** The app's presets once the plugin opened them; undefined before (and in tests that open none). */
  static forApp(app: App | undefined): SystemPresetFiles | undefined {
    return app ? SystemPresetFiles.instances.get(app) : undefined;
  }

  static release(app: App): void {
    SystemPresetFiles.instances.get(app)?.destroy();
    SystemPresetFiles.instances.delete(app);
  }

  private constructor(app: App) {
    super(app, PRESET_FOLDER_SPEC);
  }
}
