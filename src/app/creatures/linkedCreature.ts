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

/** The lists whose entries Fantasy Statblocks' watcher stores as `{ name, desc }`. */
const TRAIT_LISTS = ['traits', 'actions', 'bonus_actions', 'reactions', 'legendary_actions'];

/** A trait's text as Fantasy Statblocks' watcher writes it: the parts of a list or a map in a row. */
function traitText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(traitText).join(' ');
  if (value && typeof value === 'object') return Object.entries(value).flat().map(traitText).join(' ');
  return '';
}

/**
 * A trait list whose `[name, description]` entries are the `{ name, desc }` a statblock's blocks read.
 * Its other entries stay as they are: a list of plain words is what the Traits filter reads.
 */
function withNamedTraits(list: unknown): unknown {
  if (!Array.isArray(list)) return list;
  return list.map((entry: unknown) =>
    (Array.isArray(entry) ? { name: traitText(entry[0]), desc: traitText(entry.slice(1)) } : entry));
}

/** The creature a note's frontmatter defines, as Fantasy Statblocks' watcher parses it. */
function frontmatterCreature(app: App, file: TFile): FantasyStatblocksCreature {
  const frontmatter: Record<string, unknown> = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const name = typeof frontmatter.name === 'string' && frontmatter.name.trim() ? frontmatter.name : file.basename;
  const creature: FantasyStatblocksCreature = { ...frontmatter, name, path: file.path };
  for (const list of TRAIT_LISTS) {
    if (list in frontmatter) creature[list] = withNamedTraits(frontmatter[list]);
  }
  return creature;
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
 */
export async function resolveLinkedCreature(
  app: App,
  notePath: string,
  bestiary: BestiaryLookup = bestiaryLookup(),
): Promise<FantasyStatblocksCreature | null> {
  const { api, byPath } = bestiary;
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
