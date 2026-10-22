// Pure, immutable edits of a template's fields (§8.8). An edit that cannot be
// made, or changes nothing, returns the very template it was given, so a
// session records no undo step for it. Note data is never touched here: a
// removed field's values stay in the notes, a renamed key stays readable
// through `formerKeys`.

import { recoveryWithFieldRenamed } from '../../recovery/recoveryFieldRename';
import {
  formulaCanName, formulaReads, formulaRefs, patternFormulas, refReads, renameFormulaRefs, renamePatternRefs, renamedRef,
} from '../expressions/patternRename';
import { patternRefs } from '../expressions/patternRefs';
import { fieldKeysOf, keyProblem } from './fieldKeys';
import { blockPatterns, fieldsShownBy, flattenReadingOrder } from './treeQueries';
import {
  isContainerBlock,
  type Condition, type FieldKey, type ScoreColumn, type StatblockTemplate, type TemplateBlock, type TemplateField,
} from './templateTypes';

type OptionalFieldKeys = { [K in keyof TemplateField]-?: Record<never, never> extends Pick<TemplateField, K> ? K : never }[keyof TemplateField];

/**
 * Changes to a field. An optional key given as `undefined` is removed. The key
 * changes only through `renameFieldKey`, which also keeps `formerKeys`.
 */
export type FieldChanges = {
  [K in Exclude<keyof TemplateField, 'key' | 'formerKeys'>]?: K extends OptionalFieldKeys ? TemplateField[K] | undefined : TemplateField[K];
};

/** The keys of other fields, current and former; a key may take none of them. */
function keysOfOthers(template: StatblockTemplate, except: FieldKey | null): Set<FieldKey> {
  return fieldKeysOf(template.fields.filter((field) => field.key !== except));
}

/** Appends a field. Refused when `keyProblem` objects to its key: taken now or before a rename, reserved, or malformed. */
export function addField(template: StatblockTemplate, field: TemplateField): StatblockTemplate {
  if (keyProblem(field.key, keysOfOthers(template, null)) !== null) return template;
  return { ...template, fields: [...template.fields, field] };
}

/** Changes a field's label, type, meaning and other settings. */
export function updateField(template: StatblockTemplate, key: FieldKey, changes: FieldChanges): StatblockTemplate {
  const index = template.fields.findIndex((field) => field.key === key);
  const field = template.fields[index];
  if (!field) return template;
  const updated: Record<string, unknown> = { ...field };
  let changed = false;
  for (const [name, value] of Object.entries(changes)) {
    if (name === 'key' || name === 'formerKeys') continue;
    if (value === undefined ? !Object.hasOwn(updated, name) : updated[name] === value) continue;
    changed = true;
    if (value === undefined) delete updated[name];
    else updated[name] = value;
  }
  if (!changed) return template;
  const fields = template.fields.slice();
  fields[index] = updated as unknown as TemplateField;
  return { ...template, fields };
}

/** Whether one of a block's Scores column formulas reads `key`. */
function columnsRead(block: TemplateBlock, key: FieldKey): boolean {
  return block.type === 'scores' && (block.columns ?? []).some((column) => column.formula !== undefined && formulaReads(column.formula, key));
}

/** The keys a block shows: its bound fields, its patterns' references and its Scores column formulas'. */
export function keysShownBy(block: TemplateBlock): FieldKey[] {
  const columns = block.type === 'scores' ? (block.columns ?? []).flatMap((column) => (column.formula ? formulaRefs(column.formula) : [])) : [];
  return [...fieldsShownBy(block, patternRefs), ...columns];
}

/** Whether a block reads `key` in any way: shows it (column formulas included) or names it in its condition. */
function blockReads(block: TemplateBlock, key: FieldKey): boolean {
  return keysShownBy(block).includes(key)
    || (block.showWhen !== undefined && refReads(block.showWhen.field, key));
}

/** The blocks that read a field: show it, compute from it in a column formula, or name it in a condition. */
export function blocksReadingField(template: StatblockTemplate, key: FieldKey): TemplateBlock[] {
  return flattenReadingOrder(template.layout.blocks).filter((block) => blockReads(block, key));
}

/** Fields no block shows, in form order: the editor lists them apart, ready to place. */
export function fieldsNotShown(template: StatblockTemplate): TemplateField[] {
  const shown = new Set(flattenReadingOrder(template.layout.blocks).flatMap(keysShownBy));
  return template.fields.filter((field) => !shown.has(field.key));
}

/**
 * Takes a field out of the template, and its sample value. Refused while a
 * block reads it (`blocksReadingField`): remove or rebind those first. The
 * notes keep their values; the statblock pane lists them as not in the template.
 */
export function removeField(template: StatblockTemplate, key: FieldKey): StatblockTemplate {
  if (!template.fields.some((field) => field.key === key) || blocksReadingField(template, key).length > 0) return template;
  const fields = template.fields.filter((field) => field.key !== key);
  return withKeyMoved({ ...template, fields }, key, null);
}

/**
 * The template with what its sample and its player settings hold under `from` moved to `to`, or
 * dropped for null: they follow a field's key, so a rename keeps them and a field added later under
 * a removed key starts without them.
 */
function withKeyMoved(template: StatblockTemplate, from: FieldKey, to: FieldKey | null): StatblockTemplate {
  const moved = <T>(record: Record<FieldKey, T> | undefined): Record<FieldKey, T> | undefined => {
    if (!record || !Object.hasOwn(record, from)) return record;
    const entries = Object.entries(record).filter(([key]) => key !== from);
    const value = record[from];
    return Object.fromEntries(to === null || value === undefined ? entries : [...entries, [to, value]]);
  };
  const sample = moved(template.sample);
  const players = moved(template.players);
  if (sample === template.sample && players === template.players) return template;
  return { ...template, ...(sample && { sample }), ...(players && { players }) };
}

/** Why `from` cannot be renamed to `to`, in plain words, or null when it can. */
export function renameKeyProblem(template: StatblockTemplate, from: FieldKey, to: FieldKey): string | null {
  if (!template.fields.some((field) => field.key === from)) return `The template has no field “${from}”.`;
  if (to === from) return null;
  const problem = keyProblem(to, keysOfOthers(template, from));
  if (problem) return problem;
  const inFormula = flattenReadingOrder(template.layout.blocks).some((block) => columnsRead(block, from)
    || blockPatterns(block).some((pattern) => patternFormulas(pattern).some((formula) => formulaReads(formula, from))));
  return inFormula && !formulaCanName(to)
    ? `A formula reads “${from}”, and formulas can't name a key with a hyphen. Choose a key without one.`
    : null;
}

/** A field reference renamed where it reads `from`; any other reference unchanged. */
function rekey(ref: FieldKey, from: FieldKey, to: FieldKey): FieldKey {
  return renamedRef(ref, from, to) ?? ref;
}

function renamedCondition(condition: Condition, from: FieldKey, to: FieldKey): Condition {
  const field = rekey(condition.field, from, to);
  return field === condition.field ? condition : { ...condition, field };
}

function renamedColumn(column: ScoreColumn, from: FieldKey, to: FieldKey): ScoreColumn {
  const field = column.field === undefined ? undefined : rekey(column.field, from, to);
  const formula = column.formula === undefined ? undefined : renameFormulaRefs(column.formula, from, to);
  if (field === column.field && formula === column.formula) return column;
  return { ...column, ...(field !== undefined && { field }), ...(formula !== undefined && { formula }) };
}

/** One block with every reference to `from` naming `to`; unchanged blocks come back as they were. */
function renamedBlock(block: TemplateBlock, from: FieldKey, to: FieldKey): TemplateBlock {
  // Script and unknown blocks are written back exactly as they were read.
  if (block.type === 'script' || block.type === 'opaque') return block;
  const next: Record<string, unknown> = { ...block };
  const set = (name: string, value: unknown, before: unknown): void => { if (value !== before) next[name] = value; };
  const asText = (pattern: string | undefined): string | undefined => (pattern === undefined ? undefined : renamePatternRefs(pattern, from, to));
  if ('field' in block && typeof block.field === 'string') set('field', rekey(block.field, from, to), block.field);
  if (block.type === 'line' || block.type === 'metric') {
    const fields = block.fields.map((key) => rekey(key, from, to));
    if (fields.some((key, index) => key !== block.fields[index])) next.fields = fields;
  }
  if (block.type === 'section' && block.headingField !== undefined) set('headingField', rekey(block.headingField, from, to), block.headingField);
  if (block.type === 'stat' && block.rollFrom !== undefined) set('rollFrom', rekey(block.rollFrom, from, to), block.rollFrom);
  if (block.type === 'entries' && block.introField !== undefined) set('introField', rekey(block.introField, from, to), block.introField);
  if (block.type === 'scores' && block.columns) {
    const columns = block.columns.map((column) => renamedColumn(column, from, to));
    if (columns.some((column, index) => column !== block.columns?.[index])) next.columns = columns;
  }
  if (block.type === 'title' || block.type === 'line' || block.type === 'stat') set('pattern', asText(block.pattern), block.pattern);
  set('fallback', asText(block.fallback), block.fallback);
  if (block.showWhen) set('showWhen', renamedCondition(block.showWhen, from, to), block.showWhen);
  if (isContainerBlock(block)) {
    const blocks = renamedBlocks(block.blocks, from, to);
    if (blocks !== block.blocks) next.blocks = blocks;
  }
  const changed = Object.keys(next).some((name) => next[name] !== (block as unknown as Record<string, unknown>)[name]);
  return changed ? (next as unknown as TemplateBlock) : block;
}

function renamedBlocks(blocks: TemplateBlock[], from: FieldKey, to: FieldKey): TemplateBlock[] {
  const renamed = blocks.map((block) => renamedBlock(block, from, to));
  return renamed.some((block, index) => block !== blocks[index]) ? renamed : blocks;
}

/**
 * Renames a field's key. The old key goes first onto `formerKeys` (newest
 * first; renaming back to a former key takes it off), and every block that
 * names it, every pattern, Scores column, Line field and condition, the
 * sample and the player settings, name the new one. Notes are not
 * rewritten: they keep reading the old key until a batch or their next edit
 * moves the value. Refused, with the template returned as it was, while
 * `renameKeyProblem` names a problem.
 */
export function renameFieldKey(template: StatblockTemplate, from: FieldKey, to: FieldKey): StatblockTemplate {
  if (to === from || renameKeyProblem(template, from, to) !== null) return template;
  const fields = template.fields.map((field): TemplateField => {
    const tracks = field.tracks?.max === from ? { ...field.tracks, max: to } : field.tracks;
    if (field.key !== from) return tracks === field.tracks || !tracks ? field : { ...field, tracks };
    const formerKeys = [from, ...(field.formerKeys ?? []).filter((key) => key !== to && key !== from)];
    return { ...field, key: to, formerKeys, ...(tracks && { tracks }) };
  });
  const blocks = renamedBlocks(template.layout.blocks, from, to);
  const renamed: StatblockTemplate = { ...template, fields, layout: blocks === template.layout.blocks ? template.layout : { ...template.layout, blocks } };
  if (template.recovery) renamed.recovery = recoveryWithFieldRenamed(template.recovery, from, to);
  return withKeyMoved(renamed, from, to);
}
