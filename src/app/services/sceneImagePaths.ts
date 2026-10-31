import { TFile, type App } from 'obsidian';
import { sceneImagePaths } from '../levels/levelFile';
import { isPersistedMapEnvelope } from './MapPersistence';

interface ReadPaths {
  mtime: number;
  paths: Promise<readonly string[]>;
}

const NONE: readonly string[] = [];
const read = new Map<string, ReadPaths>();

/**
 * The map images a scene file shows (its background and every level's images), read once per
 * version of the file; none where it cannot be read. Only the processing signs ask, and only while a
 * map is being processed, so a scene file is not read just to show its card or tab.
 */
export function sceneImagePathsOf(app: App, scenePath: string): Promise<readonly string[]> {
  const file = app.vault.getAbstractFileByPath(scenePath);
  if (!(file instanceof TFile)) return Promise.resolve(NONE);
  const known = read.get(scenePath);
  if (known?.mtime === file.stat.mtime) return known.paths;
  const paths = app.vault.cachedRead(file).then(
    (text) => {
      const envelope: unknown = JSON.parse(text);
      return isPersistedMapEnvelope(envelope) && envelope.state ? sceneImagePaths(envelope.state) : NONE;
    },
  ).catch(() => NONE);
  read.set(scenePath, { mtime: file.stat.mtime, paths });
  return paths;
}
