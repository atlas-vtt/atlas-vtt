/**
 * Fantasy Statblocks blocks Atlas cannot express: JavaScript, conditions in
 * JavaScript, buttons. They are kept whole in `script` blocks, which the
 * native renderer never runs (it shows the values they read), each with a phrase
 * saying what it does. Tracks of boxes drawn by a script have a declarative
 * replacement.
 */

import { jsonRecordCopy, own } from '../format/jsonValues';
import { labelFromKey } from '../model/fieldKeys';
import { codeFieldRefs } from '../model/scriptReads';
import type { BlockIdSource } from '../model/templateIds';
import type { FieldKey, ScriptBlock, TemplateField, TrackBlock } from '../model/templateTypes';
import { FsFieldRegistry, type ImportContext } from './fsImportState';
import { t } from '../../i18n';

/** Quantities that count what is used up, as the DM screen counts them (`resources/statblockQuantities.ts`). */
const COUNTING_UP: ReadonlySet<string> = new Set(['stress', 'strain', 'wounds']);
const MAX_NAMED_KEYS = 3;
const LOOP_BOUND = /<=?\s*(?:Number\s*\(\s*)?(monster\s*(?:\?\.|\.)\s*[A-Za-z_$][\w$]*|monster\s*\[\s*(["'])[^"'\n]{1,64}\2\s*\])/g;

export interface TrackReplacement {
  /** Track blocks to put where the script was, in the order it draws them. */
  blocks: TrackBlock[];
  /** The number fields they show; add those the template lacks. */
  fields: TemplateField[];
}

/** The keys a script counts boxes up to (`for (…; i < monster.hp; …)` beside a checkbox): tracks drawn with code. */
export function trackKeys(code: string): FieldKey[] {
  if (!/checkbox/i.test(code) || !/\bfor\s*\(/.test(code)) return [];
  const keys: FieldKey[] = [];
  for (const match of code.matchAll(LOOP_BOUND)) {
    for (const key of codeFieldRefs(match[1] ?? '')) if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** "a", "a and b", "a, b and c". */
function words(list: readonly string[]): string {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1] ?? ''}`;
}

function stringAt(record: Readonly<Record<string, unknown>>, key = 'code'): string {
  const code = own(record, key);
  return typeof code === 'string' ? code : '';
}

/** "level, role, size and more": the first keys code reads. */
function keyList(keys: readonly string[]): string {
  return keys.length > MAX_NAMED_KEYS ? t('statblockEditor.fs.andMore', { keys: keys.slice(0, MAX_NAMED_KEYS).join(', ') }) : words(keys);
}

function drawnTracks(record: Readonly<Record<string, unknown>>): string[] {
  return own(record, 'type') === 'javascript' ? trackKeys(stringAt(record)).filter((key) => FsFieldRegistry.usable(key)) : [];
}

/** What a kept block does, as a phrase without a full stop; `label` names the field a formatted block shows. */
export function scriptSummary(record: Readonly<Record<string, unknown>>, label: string | undefined): string {
  switch (own(record, 'type')) {
    case 'javascript': {
      const tracks = drawnTracks(record);
      if (tracks.length > 0) return t('statblockEditor.fs.jsTracks', { names: words(tracks.map(labelFromKey)) });
      const keys = codeFieldRefs(stringAt(record));
      return keys.length === 0 ? 'JavaScript' : t('statblockEditor.fs.jsReading', { keys: keyList(keys) });
    }
    case 'action':
      if (stringAt(record, 'callback').trim()) return t('statblockEditor.fs.jsButton');
      return stringAt(record, 'action').trim() ? t('statblockEditor.fs.commandButton') : t('statblockEditor.fs.button');
    case 'ifelse': {
      const conditions = own(record, 'conditions');
      const branches = Array.isArray(conditions) ? conditions.length : 0;
      return branches > 1 ? t('statblockEditor.fs.jsBranches', { count: branches }) : t('statblockEditor.fs.jsShown');
    }
    default: {
      if (label) return t('statblockEditor.fs.jsFormatted', { name: label });
      // A line of its own making: name what it reads
      const keys = keyList(codeFieldRefs(stringAt(record, 'callback')));
      return keys ? t('statblockEditor.fs.jsFormatted', { name: `${keys.charAt(0).toUpperCase()}${keys.slice(1)}` }) : t('statblockEditor.fs.jsBlock');
    }
  }
}

/**
 * The FS block kept whole as a `script` block, its report note added. With
 * `ruleMoved` its rule leaves it for the Divider the caller puts after it.
 * Null when the block cannot be written as JSON (it is then left out).
 */
export function scriptBlock(
  record: Readonly<Record<string, unknown>>, label: string | undefined, ruleMoved: boolean, ctx: ImportContext,
): ScriptBlock | null {
  const copy = jsonRecordCopy(record);
  if (!copy) return null;
  if (ruleMoved) delete copy.hasRule;
  const block: ScriptBlock = { id: ctx.nextId(), type: 'script', summary: scriptSummary(record, label), fs: copy };
  ctx.tally.scripts.push({
    blockId: block.id,
    summary: block.summary,
    suggestion: drawnTracks(record).length > 0 ? 'track' : null,
  });
  return block;
}

/**
 * Track blocks that can stand in for a script that draws tracks of boxes
 * (`for (…; i < monster.hp; …)` making checkboxes), one per key it counts
 * to, or null when it draws none. Hit points count down, stress up.
 */
export function suggestedTrackReplacement(block: ScriptBlock, nextId: BlockIdSource): TrackReplacement | null {
  const keys = drawnTracks(block.fs);
  if (keys.length === 0) return null;
  return {
    blocks: keys.map((key): TrackBlock => ({
      id: nextId(),
      type: 'track',
      field: key,
      resource: key,
      look: 'boxes',
      counts: COUNTING_UP.has(key.toLowerCase()) ? 'up' : 'down',
    })),
    fields: keys.map((key): TemplateField => ({ key, label: labelFromKey(key), type: 'number' })),
  };
}
