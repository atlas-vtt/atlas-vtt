/**
 * Moving a ```statblock fence into its own note's properties (§6.4): the
 * fence's values become a native statblock in the frontmatter (`statblock:
 * true`, `atlas-template`, `name`, the fence's `layout:`, every value) and the
 * fence leaves the body; the rest of the body stays byte for byte. A value the
 * frontmatter already holds differently is never written over: the note is
 * then left as it was, with why. Pure.
 */

import type { FieldValue, TemplateId } from '../model/templateTypes';
import { frontmatterModel } from '../notes/applyWrites';
import { applyFrontmatterPatches } from '../notes/frontmatterPatch';
import { frontmatterProblem } from '../notes/frontmatterProblem';
import type { NotePatch } from '../notes/patchTypes';
import { TEMPLATE_KEY } from '../notes/statblockSource';
import { findStatblockFences } from './statblockFences';
import { t } from '../../i18n';

/** What the fence's statblock holds, as the note will keep it. */
export interface FenceConversion {
  /** The fence's text as it was read: the note is converted only while it still holds exactly this one fence. */
  fence: string;
  name: string;
  values: Readonly<Record<string, FieldValue>>;
  /** The fence's own `layout:`, kept so Fantasy Statblocks draws the note with it; null where it names none. */
  layout: string | null;
  templateId: TemplateId;
}

export type FenceConversionResult = { text: string; applied: readonly NotePatch[] } | { problem: string };

/** The value of `statblock:` that a fence note may hold and the conversion replaces: Fantasy Statblocks' `inline`. */
const INLINE = 'inline';
const NAMED_KEYS = 3;

/** "hp", "hp and ac", "hp, ac and speed", "hp, ac, speed and 2 more". */
function keyList(keys: readonly string[]): string {
  const named = keys.slice(0, NAMED_KEYS);
  const rest = keys.length - named.length;
  const parts = rest > 0 ? [...named, `${rest} more`] : named;
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

/** Why a note with several fences is left as it is. */
export function severalFencesReason(count: number): string {
  return t('statblockEditor.fs.severalFences', { count });
}

/** The patches that make the note's frontmatter the fence's statblock; each applies only where the note holds nothing else there. */
function conversionPatches(statblock: FieldValue | undefined, conversion: FenceConversion): NotePatch[] {
  const set = (key: string, next: FieldValue, base?: FieldValue): NotePatch => ({ op: 'set', path: [key], base, next });
  const own = new Set(['statblock', TEMPLATE_KEY, 'name', 'layout']);
  return [
    set('statblock', true, statblock === INLINE ? INLINE : undefined),
    set(TEMPLATE_KEY, conversion.templateId),
    set('name', conversion.name),
    ...(conversion.layout !== null ? [set('layout', conversion.layout)] : []),
    ...Object.entries(conversion.values).filter(([key]) => !own.has(key)).map(([key, value]) => set(key, value)),
  ];
}

/** The note's text with its one fence moved into its properties, or why it cannot be. */
export function convertFenceText(text: string, conversion: FenceConversion): FenceConversionResult {
  const fences = findStatblockFences(text);
  const [fence] = fences;
  if (!fence) return { problem: t('statblockEditor.fenceGone') };
  if (fences.length > 1) return { problem: severalFencesReason(fences.length) };
  if (text.slice(fence.from, fence.to) !== conversion.fence) return { problem: t('statblockEditor.fs.changedWhileMoving') };

  const without = text.slice(0, fence.from) + text.slice(fence.to);
  const problem = frontmatterProblem(without);
  if (problem) return { problem: problem.message };
  const model = frontmatterModel(without);
  const result = applyFrontmatterPatches(without, conversionPatches(model?.statblock, conversion));
  if (result.conflicts.length > 0) {
    const keys = result.conflicts.flatMap((patch) => (patch.op === 'set' ? [String(patch.path[0])] : []));
    return { problem: t('statblockEditor.fs.otherValues', { keys: keyList(keys) }) };
  }
  return { text: result.text, applied: result.applied };
}
