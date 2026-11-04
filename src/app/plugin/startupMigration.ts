import { App } from 'obsidian';
import { DataFileMigration } from '../utils/dataFileMigration';
import { LIBRARY_FILE } from '../services/library/libraryPaths';

// `.atlas-data` is a dot folder, which the Vault API does not index, hence the adapter.
const MIGRATION_FLAG_PATH = 'atlas-vtt/.atlas-data/migration-completed.json';
const LEGACY_SETTINGS_PATH = 'atlas-vtt/settings.json';
const MIGRATED_SETTINGS_PATH = 'atlas-vtt/.atlas-data/settings.json';

/**
 * A flag without migrated settings means an earlier migration was interrupted;
 * dropping the flag lets it run again.
 */
async function clearStaleMigrationFlag(app: App): Promise<void> {
  const { adapter } = app.vault;
  if (!(await adapter.exists(MIGRATION_FLAG_PATH))) return;

  const migratedSettingsExist = await adapter.exists(MIGRATED_SETTINGS_PATH);
  const legacySettingsExist = await adapter.exists(LEGACY_SETTINGS_PATH);
  if (migratedSettingsExist || !legacySettingsExist) return;

  try {
    await adapter.remove(MIGRATION_FLAG_PATH);
  } catch (error) {
    console.error('[Atlas] Failed to remove stale migration flag:', error);
  }
}

/**
 * Moves plugin data files from their legacy locations into `atlas-vtt/.atlas-data`.
 * A vault whose library is in its files was set up by this version: a device
 * joining it (sync carries no `.atlas-data`, so no flag either) must not hide
 * synced files, which sync would then delete on every other device.
 */
export async function runStartupMigration(app: App): Promise<void> {
  if (await app.vault.adapter.exists(LIBRARY_FILE)) return;
  await clearStaleMigrationFlag(app);

  const migration = new DataFileMigration(app);
  if (await migration.needsMigration()) {
    await migration.migrate();
  }
}
