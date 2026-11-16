/**
 * Applying queued writes to a note's text, one after another, the way the writer does at flush
 * time whatever its backend. Pure.
 */

import { applyFrontmatterPatches } from './frontmatterPatch';
import { frontmatterBounds } from './frontmatterBounds';
import { frontmatterProblem } from './frontmatterProblem';
import type { NotePatch } from './patchTypes';
import { readFrontmatterDoc, type FrontmatterModel } from './yamlDocument';
import { t } from '../../i18n';

/** Patches made from the frontmatter as the write finds it (the patcher's own reading); null where it cannot be read. */
export type PatchBuilder = (frontmatter: FrontmatterModel | null) => readonly NotePatch[];

/**
 * A change of the whole note made against the text the write lands in (a statblock code block
 * moved into the properties): the new text with the patches it applied, or why it cannot be made.
 */
export type NoteRewrite = (text: string) => { text: string; applied: readonly NotePatch[] } | { problem: string };

/** Patches given up front, built against the text the write lands in, or a rewrite of that text. */
export type WriteRequest = { patches: readonly NotePatch[] } | { build: PatchBuilder } | { rewrite: NoteRewrite };

export interface WriteResult {
  applied: readonly NotePatch[];
  conflicts: readonly NotePatch[];
  /** Why nothing was written: the note's properties cannot be read, or the patches could not be made. */
  problem: string | null;
}

/** The text after every request, and what each request did; a request with a problem changes nothing. */
export function applyWrites(text: string, requests: readonly WriteRequest[]): { text: string; results: WriteResult[] } {
  let current = text;
  const results = requests.map((request): WriteResult => {
    const problem = frontmatterProblem(current);
    if (problem) return { applied: [], conflicts: 'patches' in request ? request.patches : [], problem: problem.message };
    if ('rewrite' in request) {
      const rewritten = rewriteOf(request.rewrite, current);
      if ('problem' in rewritten) return { applied: [], conflicts: [], problem: rewritten.problem };
      current = rewritten.text;
      return { applied: rewritten.applied, conflicts: [], problem: null };
    }
    const built = patchesOf(request, current);
    if ('problem' in built) return { applied: [], conflicts: [], problem: built.problem };
    const result = applyFrontmatterPatches(current, built.patches);
    current = result.text;
    return { applied: result.applied, conflicts: result.conflicts, problem: null };
  });
  return { text: current, results };
}

function rewriteOf(rewrite: NoteRewrite, text: string): ReturnType<NoteRewrite> {
  try {
    return rewrite(text);
  } catch (error) {
    return { problem: error instanceof Error ? error.message : t('statblockEditor.changeUnprepared') };
  }
}

function patchesOf(request: Exclude<WriteRequest, { rewrite: NoteRewrite }>, text: string): { patches: readonly NotePatch[] } | { problem: string } {
  if ('patches' in request) return request;
  try {
    return { patches: request.build(frontmatterModel(text)) };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : t('statblockEditor.changeUnprepared') };
  }
}

/** The frontmatter as the patcher reads it: the values its patch bases are compared with. */
export function frontmatterModel(text: string): FrontmatterModel | null {
  const bounds = frontmatterBounds(text);
  return readFrontmatterDoc(text.slice(bounds.from, bounds.to))?.model ?? null;
}
