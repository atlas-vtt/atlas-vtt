/**
 * The notes that hold a ```statblock fence (§6.4), found without freezing the
 * window: the metadata cache names the candidates (a code block, or
 * `statblock: inline`, in a note no frontmatter makes a statblock), only those
 * are read, in slices, and what a note held is kept until the file changes.
 */

import type { App, TFile } from 'obsidian';
import { workSlices } from '../../utils/workSlices';
import { frontmatterSource } from '../notes/statblockSource';
import { findStatblockFences } from './statblockFences';

/** A note's fences, by their params (null: a fence whose YAML cannot be read). */
export type FenceParams = ReadonlyArray<Record<string, unknown> | null>;

export interface FenceNote {
  path: string;
  fences: FenceParams;
}

interface FenceRead {
  mtime: number;
  size: number;
  fences: FenceParams;
}

const reads = new WeakMap<App, Map<string, FenceRead>>();

function readsOf(app: App): Map<string, FenceRead> {
  let known = reads.get(app);
  if (!known) {
    known = new Map();
    reads.set(app, known);
  }
  return known;
}

/** Whether the metadata cache leaves room for a fence; a note the cache has not read yet is left for later. */
function mayHoldFence(app: App, file: TFile): boolean {
  const cache = app.metadataCache.getFileCache(file);
  if (!cache || frontmatterSource(cache.frontmatter) !== null) return false;
  if (cache.frontmatter?.statblock === 'inline') return true;
  return cache.sections?.some((section) => section.type === 'code') ?? true;
}

async function fencesOf(app: App, file: TFile): Promise<FenceParams> {
  const known = readsOf(app);
  const { mtime, size } = file.stat;
  const hit = known.get(file.path);
  if (hit && hit.mtime === mtime && hit.size === size) return hit.fences;
  const fences = findStatblockFences(await app.vault.cachedRead(file)).map((fence) => fence.params);
  known.set(file.path, { mtime, size, fences });
  return fences;
}

/**
 * The notes among `paths` (every Markdown note when absent) that hold at
 * least one statblock fence, in the order given. Stops early, with what it
 * found so far, once `signal` is aborted.
 */
export async function fenceNotes(app: App, paths?: readonly string[], signal?: AbortSignal): Promise<FenceNote[]> {
  const files = paths
    ? paths.map((path) => app.vault.getFileByPath(path)).filter((file): file is TFile => file !== null && file.extension === 'md')
    : app.vault.getMarkdownFiles();
  const pause = workSlices();
  const found: FenceNote[] = [];
  for (const file of files) {
    if (signal?.aborted) break;
    if (mayHoldFence(app, file)) {
      const fences = await fencesOf(app, file);
      if (fences.length > 0) found.push({ path: file.path, fences });
    }
    await pause();
  }
  return found;
}
