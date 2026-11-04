/**
 * Whether a vault note shows as a statblock, for the places that choose
 * between a statblock and a plain note (the token hover preview, the DM
 * screen's statblock cards).
 */

import type { App, TFile } from 'obsidian';
import { getFantasyStatblocksApi, hasCreatureForNotePath } from '../../services/FantasyStatblocksService';
import { cachedFrontmatter, frontmatterSource, statblockSourceOf } from '../notes/statblockSource';

/**
 * True where the metadata cache or Fantasy Statblocks' bestiary already says
 * the note shows as a statblock; false where only its text can tell (a
 * ```statblock fence). The bestiary counts a creature parsed from the note and
 * one of the note's name, which token links have always fallen back to.
 */
export function statblockNoteKnown(app: App, file: TFile): boolean {
  if (file.extension !== 'md') return false;
  return frontmatterSource(cachedFrontmatter(app, file)) !== null || hasCreatureForNotePath(file.path);
}

/** Whether a vault note shows as a statblock: the predicate (`statblockSourceOf`) or the bestiary finds one for it. */
export async function isStatblockNote(app: App, file: TFile): Promise<boolean> {
  return statblockNoteKnown(app, file) || (await statblockSourceOf(app, file)) !== null;
}

/**
 * A frontmatter statblock (`statblock: true`) that Fantasy Statblocks, loaded,
 * has not parsed: its "Parse Frontmatter" is off by default, and the plugin then
 * draws the note only through a fence in its text. Native notes and notes the
 * bestiary knows are never such a note.
 */
export function unparsedFrontmatterStatblock(app: App, file: TFile): boolean {
  return getFantasyStatblocksApi() !== null
    && frontmatterSource(cachedFrontmatter(app, file))?.kind === 'fs-frontmatter'
    && !hasCreatureForNotePath(file.path);
}
