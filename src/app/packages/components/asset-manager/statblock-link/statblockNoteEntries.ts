import type { App, TFile } from 'obsidian';
import type { BestiaryLookup } from '../../../../creatures/linkedCreature';
import type { FantasyStatblocksCreature } from '../../../../services/FantasyStatblocksService';
import { cachedFrontmatter, frontmatterSource, statblockSourceOf } from '../../../../statblocks/notes/statblockSource';
import { NO_MEANINGS } from '../../../../statblocks/resolve/fieldMeanings';
import { readStatblock } from '../../../../statblocks/resolve/readStatblock';
import { workSlices } from '../../../../utils/workSlices';
import { statblockEntry, type StatblockEntry } from './statblockEntries';

/** An entry read from its note. */
export interface NoteEntry extends StatblockEntry {
  /** A native statblock: its own note is read, never the bestiary's copy of it. */
  native: boolean;
}

/** Whether Fantasy Statblocks' copy of a creature comes from a native statblock, which the note itself describes better. */
export function isNativeCreature(creature: FantasyStatblocksCreature): boolean {
  return frontmatterSource(creature)?.kind === 'atlas';
}

function isNativeNote(app: App, file: TFile): boolean {
  return frontmatterSource(cachedFrontmatter(app, file))?.kind === 'atlas';
}

/**
 * The vault's statblock notes a token can link to that the bestiary does not
 * describe: every native statblock, with its template's meanings, and the
 * notes Fantasy Statblocks never parsed (```statblock fences, frontmatter with
 * "auto parse" off, any note while the plugin is missing). A note whose
 * statblock cannot be read is listed under its file name. An aborted read
 * stops at the next note.
 */
export async function statblockNoteEntries(app: App, bestiary: BestiaryLookup, signal?: AbortSignal): Promise<NoteEntry[]> {
  const entries: NoteEntry[] = [];
  const pause = workSlices();
  for (const file of app.vault.getMarkdownFiles()) {
    await pause();
    if (signal?.aborted) break;
    const native = isNativeNote(app, file);
    if (!native && (bestiary.byPath.has(file.path) || !(await statblockSourceOf(app, file)))) continue;
    const statblock = await readStatblock(app, file.path, bestiary);
    entries.push({ ...statblockEntry(file.path, statblock?.fields ?? {}, statblock?.meanings ?? NO_MEANINGS, file.basename), native });
  }
  return entries;
}
