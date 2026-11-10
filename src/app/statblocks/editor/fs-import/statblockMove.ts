/**
 * Moving a layout's statblocks to Atlas as one batch (§6.4), one note after
 * the other with progress and Cancel. A frontmatter statblock takes the
 * template in place (`atlas-template` alone; values and `layout:` stay). A
 * note with one ```statblock fence gets the fence's statblock as its
 * properties, and the fence leaves the body; the note keeps its path, so
 * tokens linked to it keep their link. Every write goes through the note
 * writer: an open note changes in its editor, one undo step.
 */

import type { App } from 'obsidian';
import { bestiaryCreatureByName, getFantasyStatblocksApi, isBestiaryResolved } from '../../../services/FantasyStatblocksService';
import { convertFenceText, severalFencesReason } from '../../fs/fenceConversion';
import { fenceStatblock, layoutName } from '../../fs/fenceStatblock';
import { BY_PATH } from '../../fs/fsLayoutNotes';
import type { LayoutStatblocks } from '../../fs/fsLayoutStatblocks';
import { findStatblockFences } from '../../fs/statblockFences';
import type { TemplateId } from '../../model/templateTypes';
import { NoteFieldWriter } from '../../notes/NoteFieldWriter';
import { eachNote, type NoteBatchOptions } from '../../notes/noteBatch';
import { switchTemplates } from '../../notes/templateSwitch';
import { t } from '../../../i18n';

export interface StatblockMoveResult {
  moved: string[];
  /** Notes left as they were, with why. */
  skipped: Array<{ path: string; reason: string }>;
  /** Notes a cancel kept from being reached. */
  notReached: string[];
}

type MoveItem = { path: string; kind: keyof LayoutStatblocks };

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

/** Moves the note's one fence into its properties; the reason it was left as it was, or null. */
export async function moveFenceNote(app: App, path: string, templateId: TemplateId): Promise<string | null> {
  const file = app.vault.getFileByPath(path);
  if (!file) return t('statblockEditor.noteGone');
  const text = await app.vault.read(file);
  const fences = findStatblockFences(text);
  const [fence] = fences;
  if (!fence) return t('statblockEditor.fenceGone');
  if (fences.length > 1) return severalFencesReason(fences.length);
  if (!fence.params) return t('statblockEditor.fenceUnreadable');
  const problem = creatureProblem(fence.params);
  if (problem) return problem;

  const { name, values } = await fenceStatblock(app, fence.params, path);
  const conversion = { fence: text.slice(fence.from, fence.to), name, values, layout: layoutName(fence.params.layout), templateId };
  const writer = NoteFieldWriter.forApp(app);
  const outcome = await writer.rewriteNow(path, (current) => convertFenceText(current, conversion));
  await writer.flush(path);
  return outcome.problem;
}

/** Moves the statblocks, by path; Cancel stops at the next note. */
export async function moveStatblocks(
  app: App, statblocks: LayoutStatblocks, templateId: TemplateId, options: NoteBatchOptions = {},
): Promise<StatblockMoveResult> {
  const items: MoveItem[] = [
    ...statblocks.frontmatter.map((path): MoveItem => ({ path, kind: 'frontmatter' })),
    ...statblocks.fences.map((path): MoveItem => ({ path, kind: 'fences' })),
  ].sort((a, b) => BY_PATH.compare(a.path, b.path));
  const result: StatblockMoveResult = { moved: [], skipped: [], notReached: [] };
  const rest = await eachNote(items, async ({ path, kind }) => {
    let reason: string | null;
    try {
      reason = kind === 'frontmatter' ? await switchFrontmatter(app, path, templateId) : await moveFenceNote(app, path, templateId);
    } catch (error) {
      console.error(`[Atlas] Moving the statblock of ${path} failed:`, error);
      reason = `Couldn't move it: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (reason === null) result.moved.push(path);
    else result.skipped.push({ path, reason });
  }, options);
  result.notReached.push(...rest.map(({ path }) => path));
  return result;
}
