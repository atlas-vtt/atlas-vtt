import { baseName, parentPath } from '../utils/pathUtils';

/** Names as people sort them: case aside, and "roar 2" before "roar 10". */
const byName = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/**
 * The order the sound picker lists files in before anything is typed: the sounds picked recently
 * first, the latest first (paths no longer among `files` are passed over), then every other sound
 * grouped by its folder and by name within it, so a vault's folders read as kinds of sound.
 */
export function orderSoundFiles<F extends { path: string }>(files: readonly F[], recent: readonly string[]): F[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const first = recent.flatMap((path) => byPath.get(path) ?? []);
  const shown = new Set(first);
  const rest = files
    .filter((file) => !shown.has(file))
    .sort((a, b) => byName(parentPath(a.path), parentPath(b.path)) || byName(baseName(a.path), baseName(b.path)));
  return [...first, ...rest];
}
