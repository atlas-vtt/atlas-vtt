import type { FieldValue } from '../model/templateTypes';
import { cacheFrontmatter, frontmatterBounds, readersAgree, type FrontmatterBounds } from './frontmatterBounds';
import { lookup, planPatch, type PatchPlan } from './frontmatterModel';
import { deepEqual } from './listIdentity';
import type { FieldPath, NotePatch, PatchResult } from './patchTypes';
import { isFlowCollection, nodeAt, readFrontmatterDoc, type FrontmatterDoc, type FrontmatterModel } from './yamlDocument';
import {
  appendPair, detectRenderStyle, insertItem, removeEntry, renameTopLevelKey, replaceValue, spliceText,
  type SpliceContext, type TextEdit,
} from './yamlSplice';
import { DEFAULT_RENDER_STYLE } from './yamlValueText';

/**
 * Applies patches to a note's frontmatter. Pure: no file, editor or clock.
 *
 * Each patch is planned on the values (`frontmatterModel.ts`), then spliced into the YAML text
 * by source range (`yamlSplice.ts`), finest edit first: a scalar in place, an entry's own lines,
 * the outermost flow collection around it, the whole top-level key. A candidate counts only if
 * the YAML then reads exactly as planned, so a patch is written right or not at all. The body
 * and every line no applied patch touched stay byte-identical. Notes whose frontmatter Obsidian's
 * readers see differently, or whose YAML has errors or duplicate keys, are never written: every
 * patch comes back as a conflict.
 */
export function applyFrontmatterPatches(text: string, patches: readonly NotePatch[]): PatchResult {
  const refused: PatchResult = { text, applied: [], conflicts: [...patches] };
  try {
    return patchedOrRefused(text, patches, refused);
  } catch {
    // Unexpected input reached a library throw: nothing is written, the caller sees conflicts.
    return refused;
  }
}

function patchedOrRefused(text: string, patches: readonly NotePatch[], refused: PatchResult): PatchResult {
  const bounds = frontmatterBounds(text);
  if (!readersAgree(text, bounds)) return refused;
  const yaml = text.slice(bounds.from, bounds.to);
  const read = readFrontmatterDoc(yaml);
  if (!read) return refused;
  let doc: FrontmatterDoc = read;

  const style = detectRenderStyle(doc);
  const applied: NotePatch[] = [];
  const conflicts: NotePatch[] = [];
  for (const patch of patches) {
    const plan = planPatch(doc.model, patch);
    const next: FrontmatterDoc | 'conflict' | 'unchanged' = plan.kind === 'conflict' || plan.kind === 'unchanged'
      ? plan.kind
      : writePlan({ doc, eol: bounds.lineEnding, style }, plan);
    if (next === 'conflict') conflicts.push(patch);
    else applied.push(patch);
    if (next !== 'conflict' && next !== 'unchanged') doc = next;
  }
  if (doc.text === yaml) return { text, applied, conflicts };

  const written = withFrontmatter(text, bounds, doc.text);
  return readsBack(written, text, bounds, doc) ? { text: written, applied, conflicts } : refused;
}

type WritablePlan = Exclude<PatchPlan, { kind: 'conflict' } | { kind: 'unchanged' }>;
type Attempt = () => string | null;

function writePlan(ctx: SpliceContext, plan: WritablePlan): FrontmatterDoc | 'conflict' {
  for (const attempt of attemptsFor(ctx, plan)) {
    const candidate = attempt();
    const doc = candidate === null ? null : verified(candidate, plan.model);
    if (doc) return doc;
  }
  return 'conflict';
}

/** Candidate texts for a plan, from the edit that touches least to the one that touches most. */
function attemptsFor(ctx: SpliceContext, plan: WritablePlan): Attempt[] {
  const edit = (build: () => TextEdit | null): Attempt => () => applyEdit(ctx.doc.text, build());
  switch (plan.kind) {
    case 'set': {
      const parent = plan.path.slice(0, -1);
      const leaf = plan.path[plan.path.length - 1];
      return [
        edit(() => replaceValue(ctx, plan.path, plan.value)
          ?? (typeof leaf === 'string' && parent.length > 0 ? appendPair(ctx, parent, leaf, plan.value) : null)),
        ...coarser(ctx, plan.path, plan.model),
      ];
    }
    case 'delete':
      return [edit(() => removeEntry(ctx, plan.path)), ...coarser(ctx, plan.path, plan.model)];
    case 'insert':
      return [edit(() => insertItem(ctx, [plan.list], plan.index, plan.item)), ...coarser(ctx, [plan.list], plan.model)];
    case 'remove':
      return [edit(() => removeEntry(ctx, [plan.list, plan.index])), ...coarser(ctx, [plan.list], plan.model)];
    case 'move':
      return [() => moveInPlace(ctx, plan), ...coarser(ctx, [plan.list], plan.model)];
    case 'rename':
      return renameAttempts(ctx, plan);
  }
}

/** Rewrites the outermost flow collection on the path, then the whole top-level key. */
function coarser(ctx: SpliceContext, path: FieldPath, model: FrontmatterModel): Attempt[] {
  const attempts: Attempt[] = [];
  const flowAt = path.findIndex((_, index) => isFlowCollection(nodeAt(ctx.doc, path.slice(0, index + 1))));
  const flowPath = path.slice(0, flowAt + 1);
  const flowValue = valueAt(model, flowPath);
  if (flowAt >= 0 && flowValue !== undefined) {
    attempts.push(() => applyEdit(ctx.doc.text, replaceValue(ctx, flowPath, flowValue)));
  }
  const key = path[0];
  return typeof key === 'string' ? [...attempts, ...topLevelAttempts(ctx, key, model)] : attempts;
}

/**
 * The top-level key written whole as the model has it: in its old style, then in yaml's
 * default style (yaml 2.9.1 writes a wrong indentation indicator for a block scalar that
 * starts with a space when it indents by other than 2).
 */
function topLevelAttempts(ctx: SpliceContext, key: string, model: FrontmatterModel): Attempt[] {
  const value = valueAt(model, [key]);
  const exists = Object.prototype.hasOwnProperty.call(ctx.doc.model, key);
  const rewrite = (keepStyle: boolean): Attempt => () => {
    const context = keepStyle ? ctx : { ...ctx, style: DEFAULT_RENDER_STYLE };
    if (value === undefined) return applyEdit(ctx.doc.text, removeEntry(context, [key]));
    return applyEdit(ctx.doc.text, exists ? replaceValue(context, [key], value, keepStyle) : appendPair(context, [], key, value));
  };
  return [rewrite(true), rewrite(false)];
}

/** A rename in place; failing that, the old key's lines out and the new key appended. */
function renameAttempts(ctx: SpliceContext, plan: Extract<WritablePlan, { kind: 'rename' }>): Attempt[] {
  const removed = (): string | null => applyEdit(ctx.doc.text, removeEntry(ctx, [plan.from]));
  if (plan.dropFrom) return [removed];
  const value = valueAt(plan.model, [plan.to]);
  return [
    () => applyEdit(ctx.doc.text, renameTopLevelKey(ctx, plan.from, plan.to)),
    () => {
      const text = removed();
      const doc = text === null ? null : readFrontmatterDoc(text);
      return doc && value !== undefined ? applyEdit(doc.text, appendPair({ ...ctx, doc }, [], plan.to, value)) : null;
    },
  ];
}

/** A move as two line edits: the item's lines out, the same item in at its new place. */
function moveInPlace(ctx: SpliceContext, plan: Extract<WritablePlan, { kind: 'move' }>): string | null {
  const removed = applyEdit(ctx.doc.text, removeEntry(ctx, [plan.list, plan.from]));
  const doc = removed === null ? null : readFrontmatterDoc(removed);
  const item = valueAt(plan.model, [plan.list, plan.to]);
  if (!doc || item === undefined) return null;
  return applyEdit(doc.text, insertItem({ ...ctx, doc }, [plan.list], plan.to, item));
}

/** The candidate's document if it reads as `model` and leaves the closing `---` where it is. */
function verified(candidate: string, model: FrontmatterModel): FrontmatterDoc | null {
  if (candidate !== '' && !candidate.endsWith('\n')) return null;
  if (`\n${candidate}`.includes('\n---') || /\r(?!\n)/.test(candidate)) return null;
  const doc = readFrontmatterDoc(candidate);
  return doc && deepEqual(doc.model, model) ? doc : null;
}

/**
 * The last line of defence: both of Obsidian's readers find the written frontmatter, the body
 * is intact, and the metadata cache's reading (line breaks made `\n`) holds the patched values.
 */
function readsBack(written: string, original: string, bounds: FrontmatterBounds, doc: FrontmatterDoc): boolean {
  const after = frontmatterBounds(written);
  if (!after.exists || after.bom !== bounds.bom || !readersAgree(written, after)) return false;
  if (written.slice(after.from, after.to) !== doc.text) return false;
  if (written.slice(after.contentStart) !== original.slice(bounds.contentStart)) return false;
  const cached = cacheFrontmatter(written);
  const reread = cached === null ? null : readFrontmatterDoc(cached);
  return reread !== null && deepEqual(reread.model, doc.model);
}

function withFrontmatter(text: string, bounds: FrontmatterBounds, yaml: string): string {
  if (bounds.exists) return text.slice(0, bounds.from) + yaml + text.slice(bounds.to);
  const opening = text.slice(0, bounds.contentStart);
  return `${opening}---${bounds.lineEnding}${yaml}---${bounds.lineEnding}${text.slice(bounds.contentStart)}`;
}

function applyEdit(text: string, edit: TextEdit | null): string | null {
  return edit ? spliceText(text, edit) : null;
}

function valueAt(model: FrontmatterModel, path: FieldPath): FieldValue | undefined {
  const found = lookup(model, path);
  return found.kind === 'value' ? found.value : undefined;
}
