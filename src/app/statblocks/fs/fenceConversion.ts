/**
 * Moving a ```statblock fence into its own note's properties (§6.4): the
 * fence's values become a native statblock in the frontmatter (`statblock:
 * true`, `atlas-template`, `name`, the fence's `layout:`, every value) and the
 * fence leaves the body; the rest of the body stays byte for byte. A value the
 * frontmatter already holds alike, however it is written, stays as the note
 * has it. One it holds differently is never written over, and the note is
 * left as it was, with why, unless the caller says the statblock's values
 * win (`conflicts: 'fence'`). Pure.
 */

import type { FieldValue, TemplateId } from '../model/templateTypes';
import { frontmatterModel } from '../notes/applyWrites';
import { applyFrontmatterPatches } from '../notes/frontmatterPatch';
import { frontmatterProblem } from '../notes/frontmatterProblem';
import type { NotePatch } from '../notes/patchTypes';
import { TEMPLATE_KEY } from '../notes/statblockSource';
import type { FrontmatterModel } from '../notes/yamlDocument';
import { holdsNothing, sameStatblockValue } from './fenceValueMatch';
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

/** Where the note's properties hold another value than the fence under one key: the note is left as it was, or the fence's value takes its place. */
export type FenceConflictRule = 'refuse' | 'fence';

export interface FenceConversionOptions {
  /** Unset: `refuse`. */
  conflicts?: FenceConflictRule;
}

export type FenceConversionResult =
  | { text: string; applied: readonly NotePatch[] }
  /** `conflicts`: the fence's keys the note holds other values for, given where those alone keep the note from moving. */
  | { problem: string; conflicts?: readonly string[] };

/** The value of `statblock:` that a fence note may hold and the conversion replaces: Fantasy Statblocks' `inline`. */
const INLINE = 'inline';
const NAMED_KEYS = 3;

/** "hp", "hp and ac", "hp, ac and speed", "hp, ac, speed and 2 more". */
export function keyList(keys: readonly string[]): string {
  const named = keys.slice(0, NAMED_KEYS);
  const rest = keys.length - named.length;
  const parts = rest > 0 ? [...named, `${rest} more`] : named;
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

/** Why a note with several fences is left as it is. */
export function severalFencesReason(count: number): string {
  return t('statblockEditor.fs.severalFences', { count });
}

const set = (key: string, next: FieldValue, base?: FieldValue): NotePatch => ({ op: 'set', path: [key], base, next });

/**
 * The patches that make the note's frontmatter the fence's statblock, and the keys of the fence
 * the note holds other values for. A key the note lacks, or has without a value, takes the
 * fence's; one it holds alike keeps the note's own spelling. Where it holds another value, the
 * patch applies only by the `fence` rule: by `refuse` its base is not what the note holds, so
 * the patcher gives it back as a conflict.
 */
function conversionPatches(
  model: FrontmatterModel, conversion: FenceConversion, rule: FenceConflictRule,
): { patches: NotePatch[]; conflicts: string[] } {
  const markers = new Set(['statblock', TEMPLATE_KEY]);
  const values: Array<[string, FieldValue]> = [
    ['name', conversion.name],
    ...(conversion.layout !== null ? [['layout', conversion.layout] satisfies [string, FieldValue]] : []),
    ...Object.entries(conversion.values).filter(([key]) => !markers.has(key) && key !== 'name' && key !== 'layout'),
  ];
  const patches = [set('statblock', true, model.statblock === INLINE ? INLINE : undefined), set(TEMPLATE_KEY, conversion.templateId)];
  const conflicts: string[] = [];
  for (const [key, value] of values) {
    const held = Object.prototype.hasOwnProperty.call(model, key) ? model[key] : undefined;
    if (held === undefined) patches.push(set(key, value));
    else if (sameStatblockValue(held, value)) continue;
    else if (holdsNothing(held)) patches.push(set(key, value, held));
    else {
      conflicts.push(key);
      patches.push(set(key, value, rule === 'fence' ? held : undefined));
    }
  }
  return { patches, conflicts };
}

/** The note's text with its one fence moved into its properties, or why it cannot be. */
export function convertFenceText(text: string, conversion: FenceConversion, options: FenceConversionOptions = {}): FenceConversionResult {
  const fences = findStatblockFences(text);
  const [fence] = fences;
  if (!fence) return { problem: t('statblockEditor.fenceGone') };
  if (fences.length > 1) return { problem: severalFencesReason(fences.length) };
  if (text.slice(fence.from, fence.to) !== conversion.fence) return { problem: t('statblockEditor.fs.changedWhileMoving') };

  const without = text.slice(0, fence.from) + text.slice(fence.to);
  const problem = frontmatterProblem(without);
  if (problem) return { problem: problem.message };
  const rule = options.conflicts ?? 'refuse';
  const { patches, conflicts } = conversionPatches(frontmatterModel(without) ?? {}, conversion, rule);
  const result = applyFrontmatterPatches(without, patches);
  if (result.conflicts.length > 0) {
    const keys = result.conflicts.flatMap((patch) => (patch.op === 'set' ? [String(patch.path[0])] : []));
    const refusal = { problem: t('statblockEditor.fs.otherValues', { keys: keyList(keys) }) };
    // The statblock's values settle a refusal only where nothing else is in the way.
    return rule === 'refuse' && keys.every((key) => conflicts.includes(key)) ? { ...refusal, conflicts: keys } : refusal;
  }
  return { text: result.text, applied: result.applied };
}
