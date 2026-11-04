import type { App } from 'obsidian';
import { ensureAdapterFolder } from '../../plugin/vaultFolders';

const DATA_FOLDER = 'atlas-vtt/.atlas-data';
/**
 * Online play's settings, the running table with its secret, and that table's log. They are facts
 * of this device, so they live in the folder no sync tool carries and never in the plugin's data.
 */
const DATA_PATH = `${DATA_FOLDER}/online.json`;
/** A data file that could not be read is kept here, since the next save writes a new one. */
const UNREADABLE_PATH = `${DATA_FOLDER}/online.unreadable.json`;

/** Where online play keeps its data on this device. */
export interface OnlineDataFile {
  /** The stored data, or null when there is none or it cannot be read. */
  read(): Promise<unknown>;
  write(data: unknown): Promise<void>;
}

export function onlineDataFile(app: App): OnlineDataFile {
  const { adapter } = app.vault;
  return {
    read: async () => {
      if (!(await adapter.exists(DATA_PATH))) return null;
      try {
        return JSON.parse(await adapter.read(DATA_PATH)) as unknown;
      } catch (error) {
        console.error('[Atlas] Online play\'s data could not be read:', error);
        if (await adapter.exists(UNREADABLE_PATH)) await adapter.remove(UNREADABLE_PATH);
        await adapter.copy(DATA_PATH, UNREADABLE_PATH);
        return null;
      }
    },
    write: async (data) => {
      await ensureAdapterFolder(app, DATA_FOLDER);
      await adapter.write(DATA_PATH, JSON.stringify(data));
    },
  };
}
