import { TFile, type App } from 'obsidian';
import {
  bestiaryCreatureByName,
  getFantasyStatblocksApi,
  noteBasename,
  resolveCreatureFromFence,
  type FantasyStatblocksApi,
  type FantasyStatblocksCreature,
} from '../services/FantasyStatblocksService';
import type { StatblockSource } from '../statblocks/model/resolvedTypes';
import { cachedFrontmatter, statblockSourceOf, type FrontmatterRecord } from '../statblocks/notes/statblockSource';
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

/** A statblock record from frontmatter, named after the note when it names nothing. */
export function frontmatterCreature(frontmatter: FrontmatterRecord, path: string): FantasyStatblocksCreature {
  const name = typeof frontmatter.name === 'string' && frontmatter.name.trim() ? frontmatter.name : noteBasename(path) || path;
  return { ...frontmatter, name, path };
}

/**
 * The creature a Fantasy Statblocks note's frontmatter defines, as the plugin's watcher parses it. A note is
 * not Atlas' own text, so all that is read of its frontmatter is read within one budget.
 */
export function fantasyFrontmatterCreature(frontmatter: FrontmatterRecord, path: string): FantasyStatblocksCreature {
  const fields = boundedFields(frontmatter);
  return frontmatterCreature({ ...fields, ...namedTraitLists(fields) }, path);
}

function markdownFile(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile && file.extension === 'md' ? file : null;
}

/**
 * The creature a statblock note describes, given what the predicate found in
 * it (`statblockSourceOf`). Native notes read only their own frontmatter, never
 * the bestiary's copy, which lags behind Atlas' writes. Everything else keeps
 * Fantasy Statblocks' order: its bestiary entry when the plugin parsed the
 * note, else the note's frontmatter (the plugin parses notes only with "auto
 * parse" on), else the note's ```statblock fence, else the bestiary creature
 * of the note's name, as token links always have.
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
export async function linkedCreatureFor(
  app: App,
  notePath: string,
  source: StatblockSource | null,
  bestiary: BestiaryLookup,
): Promise<FantasyStatblocksCreature | null> {
  const creature = await linkedCreatureAsGiven(app, notePath, source, bestiary);
  return creature && namedStatblock(creature);
}

/** The creature of a linked note as its source holds it; `linkedCreatureFor` hands it on within the limits. */
async function linkedCreatureAsGiven(
  app: App,
  notePath: string,
  source: StatblockSource | null,
  { api, byPath }: BestiaryLookup,
): Promise<FantasyStatblocksCreature | null> {
  const parsed = source?.kind === 'atlas' ? undefined : byPath.get(notePath);
  if (parsed) return withExtensions(api, parsed);

  const file = markdownFile(app, notePath);
  if (file && source?.kind === 'atlas') return frontmatterCreature(cachedFrontmatter(app, file) ?? {}, notePath);
  if (file && source?.kind === 'fs-frontmatter') return fantasyFrontmatterCreature(cachedFrontmatter(app, file) ?? {}, notePath);
  if (source?.kind === 'fs-fence') {
    const creature = await resolveCreatureFromFence(app, source.params, notePath);
    if (creature) return { ...creature, path: notePath };
  }

  return api ? bestiaryCreatureByName(api, noteBasename(notePath)) : null;
}

/** The creature a linked statblock note describes (`linkedCreatureFor`), for a caller that has not asked what the note holds. */
export async function resolveLinkedCreature(
  app: App,
  notePath: string,
  bestiary: BestiaryLookup = bestiaryLookup(),
): Promise<FantasyStatblocksCreature | null> {
  const file = markdownFile(app, notePath);
  return linkedCreatureFor(app, notePath, file ? await statblockSourceOf(app, file) : null, bestiary);
}
