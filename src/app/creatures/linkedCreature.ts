import { TFile, type App } from 'obsidian';
import {
  bestiaryCreatureByName,
  getFantasyStatblocksApi,
  noteBasename,
  resolveCreatureFromFence,
  type FantasyStatblocksApi,
  type FantasyStatblocksCreature,
} from '../services/FantasyStatblocksService';
import { hasBestiaryFrontmatter, parseStatblockFence, resolveStatblockNote } from '../services/statblockNoteSource';
import { workSlices } from '../utils/workSlices';
import { namedTraitLists } from './frontmatterTraits';
import { boundedFields, namedStatblock } from './statblockValues';

/** The bestiary as one lookup, built once and reused for many notes. */
export interface BestiaryLookup {
  api: FantasyStatblocksApi | null;
  byPath: ReadonlyMap<string, FantasyStatblocksCreature>;
}

/** Fantasy Statblocks' note-backed creatures by note path; empty while the plugin is missing. */
export function bestiaryLookup(): BestiaryLookup {
  const api = getFantasyStatblocksApi();
  const byPath = new Map<string, FantasyStatblocksCreature>();
  for (const creature of api?.getBestiaryCreatures() ?? []) {
    if (creature.path) byPath.set(creature.path, creature);
  }
  return { api, byPath };
}

/** A bestiary creature with its `extends` applied, which only the plugin's name lookup does. */
function withExtensions(api: FantasyStatblocksApi | null, creature: FantasyStatblocksCreature): FantasyStatblocksCreature {
  if (!api || creature.extends === undefined) return creature;
  const resolved = bestiaryCreatureByName(api, creature.name);
  return resolved && resolved.path === creature.path ? resolved : creature;
}

/**
 * The creature a note's frontmatter defines, as Fantasy Statblocks' watcher parses it. A note is
 * not Atlas' own text, so all that is read of its frontmatter is read within one budget.
 */
function frontmatterCreature(app: App, file: TFile): FantasyStatblocksCreature {
  const frontmatter = boundedFields(app.metadataCache.getFileCache(file)?.frontmatter);
  const name = typeof frontmatter.name === 'string' && frontmatter.name.trim() ? frontmatter.name : file.basename;
  return { ...frontmatter, ...namedTraitLists(frontmatter), name, path: file.path };
}

/**
 * The creature a linked statblock note describes, with the fields Fantasy
 * Statblocks renders: its bestiary entry when the plugin parsed the note, else
 * the note's frontmatter (the plugin parses notes only with "auto parse" on),
 * else the note's ```statblock fence. A note that is none of these falls back
 * to the bestiary creature of the same name, as token links always have.
 *
 * While Fantasy Statblocks still parses the vault (`isBestiaryResolved`), null
 * means "not known yet": a creature read by name is not there until the parse
 * ends, and one that `extends` another comes without it. Show a placeholder
 * then, and do not take such an answer for the whole statblock.
 *
 * The creature is a copy within the limits every statblock is read in, named
 * by a text (`statblockValues.ts`): what tokens, resources, senses and the
 * filters read of a statblock, they read of this.
 */
export async function resolveLinkedCreature(
  app: App,
  notePath: string,
  bestiary: BestiaryLookup = bestiaryLookup(),
): Promise<FantasyStatblocksCreature | null> {
  const creature = await linkedCreatureAsGiven(app, notePath, bestiary);
  return creature && namedStatblock(creature);
}

/** The creature of a linked note as its source holds it; `resolveLinkedCreature` hands it on within the limits. */
async function linkedCreatureAsGiven(
  app: App,
  notePath: string,
  { api, byPath }: BestiaryLookup,
): Promise<FantasyStatblocksCreature | null> {
  const parsed = byPath.get(notePath);
  if (parsed) return withExtensions(api, parsed);

  const file = app.vault.getAbstractFileByPath(notePath);
  if (file instanceof TFile && file.extension === 'md') {
    const frontmatterOnly = hasBestiaryFrontmatter(app, file)
      && app.metadataCache.getFileCache(file)?.frontmatter?.statblock !== 'inline';
    if (frontmatterOnly) return frontmatterCreature(app, file);

    const params = parseStatblockFence(await app.vault.cachedRead(file));
    if (params) {
      const creature = await resolveCreatureFromFence(app, params, notePath);
      if (creature) return { ...creature, path: notePath };
    }
  }

  return api ? bestiaryCreatureByName(api, noteBasename(notePath)) : null;
}

/**
 * The creatures of the vault's statblock notes that the bestiary lacks: notes
 * Fantasy Statblocks renders from a ```statblock fence, which it never parses,
 * and statblock frontmatter it has not parsed. Tokens link to these like any
 * bestiary note. An aborted read stops at the next note.
 */
export async function unparsedStatblockNotes(
  app: App,
  bestiary: BestiaryLookup = bestiaryLookup(),
  signal?: AbortSignal,
): Promise<FantasyStatblocksCreature[]> {
  const creatures: FantasyStatblocksCreature[] = [];
  const pause = workSlices();
  for (const file of app.vault.getMarkdownFiles()) {
    await pause();
    if (signal?.aborted) break;
    if (bestiary.byPath.has(file.path) || !(await resolveStatblockNote(app, file))) continue;
    const creature = await resolveLinkedCreature(app, file.path, bestiary);
    const name = typeof creature?.name === 'string' && creature.name.trim() ? creature.name : file.basename;
    creatures.push({ ...creature, name, path: file.path });
  }
  return creatures;
}
