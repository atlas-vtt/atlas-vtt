/**
 * Switching notes to another template as one batch (a template replaced on delete, a role's
 * notes moved on): one `atlas-template` patch per note through `NoteFieldWriter`, each note's
 * backend chosen as it is written, with progress and Cancel. A note whose template changed
 * since the list was made keeps it, so a batch cut short or run twice leaves a correct state.
 */

import type { App } from 'obsidian';
import type { FieldValue, TemplateId } from '../model/templateTypes';
import { NoteFieldWriter, type WriteOutcome } from './NoteFieldWriter';
import { eachNote, type NoteBatchOptions } from './noteBatch';
import type { NotePatch } from './patchTypes';
import { TEMPLATE_KEY } from './statblockSource';
import { t } from '../../i18n';

export interface TemplateSwitchNote {
  path: string;
  /**
   * The template the note was listed with: it switches only while it still names this one.
   * Null for a statblock of Fantasy Statblocks, which switches only while it names none
   * (no `atlas-template`, or an empty one).
   */
  from: TemplateId | null;
}

export type TemplateSwitchOptions = NoteBatchOptions;

export interface TemplateSwitchResult {
  switched: string[];
  /** Notes left as they were, with why. */
  skipped: Array<{ path: string; reason: string }>;
  /** Notes a cancel kept from being reached; they keep their template. */
  notReached: string[];
}

export async function switchTemplates(
  app: App,
  notes: readonly TemplateSwitchNote[],
  to: TemplateId,
  options: TemplateSwitchOptions = {},
): Promise<TemplateSwitchResult> {
  const writer = NoteFieldWriter.forApp(app);
  const result: TemplateSwitchResult = { switched: [], skipped: [], notReached: [] };
  const rest = await eachNote(notes, async (note) => {
    const outcome = await switchNote(writer, note, to);
    if (outcome.applied.length > 0) result.switched.push(note.path);
    else result.skipped.push({ path: note.path, reason: skipReason(outcome) });
  }, options);
  result.notReached.push(...rest.map(({ path }) => path));
  return result;
}

/** Whether a value of `atlas-template` names no template: absent, empty or blank, as the predicate reads it. */
function namesNone(value: FieldValue | undefined): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/**
 * Writes one note's switch. A note listed with no template is patched from what it holds when
 * the write finds it, so an empty `atlas-template` is switched as well. A batch does not wait
 * out the disk coalescing: each note is written before the next.
 */
async function switchNote(writer: NoteFieldWriter, note: TemplateSwitchNote, to: TemplateId): Promise<WriteOutcome> {
  const set = (base: FieldValue | undefined): NotePatch => ({ op: 'set', path: [TEMPLATE_KEY], base, next: to });
  const outcome = note.from === null
    ? writer.patchNow(note.path, (frontmatter) => (frontmatter && namesNone(frontmatter[TEMPLATE_KEY]) ? [set(frontmatter[TEMPLATE_KEY])] : []))
    : writer.write(note.path, [set(note.from)]);
  await writer.flush(note.path);
  return outcome;
}

function skipReason(outcome: WriteOutcome): string {
  return outcome.problem ?? t('statblockEditor.templateChangedMeanwhile');
}
