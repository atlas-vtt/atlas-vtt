/**
 * Moving a layout's statblocks to Atlas as one batch (§6.4), one note after
 * the other with progress and Cancel. A frontmatter statblock takes the
 * template in place (`atlas-template` alone; values and `layout:` stay). A
 * note with one ```statblock fence gets the fence's statblock as its
 * properties, and the fence leaves the body; the note keeps its path, so
 * tokens linked to it keep their link. Every write goes through the note
 * writer: an open note changes in its editor, one undo step. A note that
 * holds other values than its statblock is left as it was, until a second
 * batch is told to move those notes with their statblocks' values.
 */

import type { App } from 'obsidian';
import { bestiaryCreatureByName, getFantasyStatblocksApi, isBestiaryResolved } from '../../../services/FantasyStatblocksService';
import { convertFenceText, severalFencesReason, type FenceConflictRule } from '../../fs/fenceConversion';
import { fenceStatblock, layoutName } from '../../fs/fenceStatblock';
import { BY_PATH } from '../../fs/fsLayoutNotes';
import type { LayoutStatblocks } from '../../fs/fsLayoutStatblocks';
import { findStatblockFences } from '../../fs/statblockFences';
import type { TemplateId } from '../../model/templateTypes';
import { NoteFieldWriter } from '../../notes/NoteFieldWriter';
import { eachNote, type NoteBatchOptions } from '../../notes/noteBatch';
import { switchTemplates } from '../../notes/templateSwitch';
import { t } from '../../../i18n';

/** A note left as it was, with why. */
export interface LeftStatblock {
  path: string;
  reason: string;
  /** The keys the note holds other values for than its statblock, where those alone kept it back: `moveWithStatblockValues` moves it. */
  conflicts?: readonly string[];
}

export interface StatblockMoveResult {
  moved: string[];
  skipped: LeftStatblock[];
  /** Notes a cancel kept from being reached. */
  notReached: string[];
}

type MoveItem = { path: string; kind: keyof LayoutStatblocks };
type Left = Omit<LeftStatblock, 'path'>;

/** Why a fence that builds on a bestiary creature cannot be moved now; null where it names none or the creature can be read. */
function creatureProblem(params: Readonly<Record<string, unknown>>): string | null {
  const named = params.creature ?? params.monster;
  if (typeof named !== 'string') return null;
  const api = getFantasyStatblocksApi();
  if (!api) return t('statblockEditor.fs.basedOn', { name: named });
  if (!isBestiaryResolved(api)) return t('statblockEditor.fs.reading');
  return bestiaryCreatureByName(api, named) ? null : t('statblockEditor.fs.noCreature', { name: named });
}

async function switchFrontmatter(app: App, path: string, templateId: TemplateId): Promise<string | null> {
  const result = await switchTemplates(app, [{ path, from: null }], templateId);
  return result.switched.length > 0 ? null : result.skipped[0]?.reason ?? t('statblockEditor.fs.leftAsIs');
}

const because = (reason: string): Left => ({ reason });

/** Moves the note's one fence into its properties; why it was left as it was, or null. */
async function moveFenceNote(app: App, path: string, templateId: TemplateId, conflicts: FenceConflictRule): Promise<Left | null> {
  const file = app.vault.getFileByPath(path);
  if (!file) return because(t('statblockEditor.noteGone'));
  const text = await app.vault.read(file);
  const fences = findStatblockFences(text);
  const [fence] = fences;
  if (!fence) return because(t('statblockEditor.fenceGone'));
  if (fences.length > 1) return because(severalFencesReason(fences.length));
  if (!fence.params) return because(t('statblockEditor.fenceUnreadable'));
  const problem = creatureProblem(fence.params);
  if (problem) return because(problem);

  const { name, values } = await fenceStatblock(app, fence.params, path);
  const conversion = { fence: text.slice(fence.from, fence.to), name, values, layout: layoutName(fence.params.layout), templateId };
  const writer = NoteFieldWriter.forApp(app);
  // The writer hands on the reason alone; the keys in the way are those of the text the write found.
  let keys: readonly string[] | undefined;
  const outcome = await writer.rewriteNow(path, (current) => {
    const converted = convertFenceText(current, conversion, { conflicts });
    keys = 'problem' in converted ? converted.conflicts : undefined;
    return converted;
  });
  await writer.flush(path);
  if (outcome.problem === null) return null;
  return keys ? { reason: outcome.problem, conflicts: keys } : because(outcome.problem);
}

/** Moves one statblock; the note as it was left, or null once it is moved. */
async function moveOne(app: App, { path, kind }: MoveItem, templateId: TemplateId, conflicts: FenceConflictRule): Promise<LeftStatblock | null> {
  try {
    if (kind === 'frontmatter') {
      const reason = await switchFrontmatter(app, path, templateId);
      return reason === null ? null : { path, reason };
    }
    const left = await moveFenceNote(app, path, templateId, conflicts);
    return left && { path, ...left };
  } catch (error) {
    console.error(`[Atlas] Moving the statblock of ${path} failed:`, error);
    return { path, reason: `Couldn't move it: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Moves the statblocks, by path; Cancel stops at the next note. A note that holds other values than its statblock is left as it was. */
export async function moveStatblocks(
  app: App, statblocks: LayoutStatblocks, templateId: TemplateId, options: NoteBatchOptions = {},
): Promise<StatblockMoveResult> {
  const items: MoveItem[] = [
    ...statblocks.frontmatter.map((path): MoveItem => ({ path, kind: 'frontmatter' })),
    ...statblocks.fences.map((path): MoveItem => ({ path, kind: 'fences' })),
  ].sort((a, b) => BY_PATH.compare(a.path, b.path));
  const result: StatblockMoveResult = { moved: [], skipped: [], notReached: [] };
  const rest = await eachNote(items, async (item) => {
    const left = await moveOne(app, item, templateId, 'refuse');
    if (left) result.skipped.push(left);
    else result.moved.push(item.path);
  }, options);
  result.notReached.push(...rest.map(({ path }) => path));
  return result;
}

/** The notes a batch left only because they hold other values than their statblocks. */
export function notesWithOtherValues(result: StatblockMoveResult): LeftStatblock[] {
  return result.skipped.filter((note) => note.conflicts !== undefined);
}

/**
 * Moves the notes an earlier batch left for their other values, this time with the statblock's
 * value in the place of the note's: the GM's explicit choice, one batch. Returns what both
 * batches did together; a note Cancel kept this one from stays among those still to choose for.
 */
export async function moveWithStatblockValues(
  app: App, earlier: StatblockMoveResult, templateId: TemplateId, options: NoteBatchOptions = {},
): Promise<StatblockMoveResult> {
  const outcomes = new Map<string, LeftStatblock | null>();
  await eachNote(notesWithOtherValues(earlier), async ({ path }) => {
    outcomes.set(path, await moveOne(app, { path, kind: 'fences' }, templateId, 'fence'));
  }, options);
  return {
    moved: [...earlier.moved, ...[...outcomes].flatMap(([path, left]) => (left === null ? [path] : []))],
    skipped: earlier.skipped.flatMap((note) => {
      const now = outcomes.get(note.path);
      return now === null ? [] : [now ?? note];
    }),
    notReached: earlier.notReached,
  };
}
