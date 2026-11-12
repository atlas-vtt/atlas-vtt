import { TFile, type App } from 'obsidian';
import { isLootBaseLoaded, isLootBaseUnreadable, LootBaseReader, needsBases, readBase } from './LootBaseReader';
import { wholeBaseQueryConfig } from './lootBaseQuery';
import { LootBaseQuery, lootBasesAvailable } from './lootQueryView';

/** The items each view of the base shows; null when the base is gone, Obsidian cannot run it or a view cannot be read. */
function readViews(app: App, path: string): Promise<string[] | null> {
  return new Promise((resolve, reject) => {
    const reader: LootBaseReader = new LootBaseReader(app, path, (base) => {
      if (!isLootBaseLoaded(base)) return;
      // After this answer from Obsidian's view, not while it is still reporting.
      queueMicrotask(() => reader.stop());
      resolve(base.missing || needsBases(base) || isLootBaseUnreadable(base) ? null : base.views.flatMap((view) => view.items.map((item) => item.id)));
    });
    reader.load().catch(reject);
  });
}

/** The files the base's own filters hold, whatever its views show of them; none for a base without filters of its own. */
async function readWholeBase(app: App, path: string): Promise<string[] | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const text = await app.vault.cachedRead(file).catch(() => null);
  // What could not be read is reported by the views' reader.
  if (text === null) return null;
  const config = wholeBaseQueryConfig(readBase(text, path));
  if (!config) return [];
  if (!lootBasesAvailable()) return null;
  return new Promise((resolve, reject) => {
    const answer = (paths: string[] | null): void => {
      queueMicrotask(() => query.stop());
      resolve(paths);
    };
    const query: LootBaseQuery = new LootBaseQuery(app, config, path, {
      onSnapshot: (snapshot) => answer(snapshot.entries.map((entry) => entry.path)),
      onUnavailable: () => answer(null),
      onUnreadable: () => answer(null),
    });
    query.start().catch(reject);
  });
}

/**
 * Every file a loot base holds, read once: what its own filters find and what
 * each of its views shows, linked from anywhere or not. Null when the base is
 * gone, Obsidian cannot run it (the Bases core plugin is off) or its results cannot be read.
 */
export async function readLootBaseItems(app: App, path: string): Promise<string[] | null> {
  const [shown, held] = await Promise.all([readViews(app, path), readWholeBase(app, path)]);
  return shown && held ? [...new Set([...shown, ...held])] : null;
}
