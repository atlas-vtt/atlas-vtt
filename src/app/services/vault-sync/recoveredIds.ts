import { baseName } from '../../utils/pathUtils';
import { prettifyIdentifier } from '../collectionRecords';

/** A stable id for a record rebuilt from the file at `seed`, so repeated checks agree on it. */
export function recoveredId(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return `${prefix}-recovered-${Math.abs(hash).toString(36)}`;
}

/** Whether `id` was made by `recoveredId`: the same on every device that rebuilds the record from the same file. */
export const isRecoveredId = (id: string): boolean => id.includes('-recovered-');

/** The file name without its extension: `a/Cave.atlasmap` → `Cave`. */
export const stemOf = (path: string): string => baseName(path).replace(/\.[^.]+$/, '');

/** `Goblin_1748296015230_72a74x.webp` → `Goblin`: the name of token art without the suffix Atlas adds. */
export function recoveredTokenName(path: string): string {
  const stem = stemOf(path);
  const cleaned = stem
    .replace(/[-_]\d{10,}[-_][a-z0-9]{4,}$/i, '')
    .replace(/[-_]\d{10,}$/i, '');
  return prettifyIdentifier(cleaned || stem);
}
