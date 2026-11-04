/**
 * The one resolver: a statblock note as every consumer reads it, with the
 * template it renders with (§4.10, §5.3, §6.1).
 *
 * - Native notes read their frontmatter from the metadata cache, never Fantasy
 *   Statblocks' bestiary copy, which lags behind Atlas' writes. Renamed keys
 *   are aliased to their current key, and the template's meanings point at
 *   unusual keys. A template the library lacks gives the auto template.
 * - Fantasy Statblocks' statblocks keep `linkedCreatureFor`'s order. While the
 *   plugin is loaded it renders them (no template); while it is missing,
 *   frontmatter and inline fences render with the auto template, and a fence
 *   that only names a creature or another note cannot be read at all.
 */

import { TFile, type App } from 'obsidian';
import {
  bestiaryLookup,
  frontmatterCreature,
  linkedCreatureFor,
  type BestiaryLookup,
} from '../../creatures/linkedCreature';
import { layoutForCreature, type FantasyStatblocksCreature } from '../../services/FantasyStatblocksService';
import { autoTemplate } from '../model/autoTemplate';
import type { ResolveContext, ResolvedStatblock, StatblockSource, TemplateLookup } from '../model/resolvedTypes';
import { withHeaderFields } from '../model/templateHeader';
import { cachedFrontmatter, statblockSourceOf, type FrontmatterRecord } from '../notes/statblockSource';
import { withReferencesFilled } from '../values/fillReferences';
import { statblockLookup } from '../values/statblockLookup';
import { NO_MEANINGS, meaningsOf, withFormerKeysAliased } from './fieldMeanings';

export type AtlasSource = Extract<StatblockSource, { kind: 'atlas' }>;
export type FenceSource = Extract<StatblockSource, { kind: 'fs-fence' }>;
export type StatblockRecord = Readonly<Record<string, unknown>>;

export interface VaultResolveContext extends ResolveContext {
  /** One bestiary lookup for many notes (`CreatureIndex` builds one per batch); read anew when absent. */
  bestiary?: BestiaryLookup;
}

/** A native statblock: its template from the lookup (former keys aliased, meanings read), else the auto template. */
export function resolveNative(
  path: string,
  source: AtlasSource,
  frontmatter: FrontmatterRecord,
  templates: TemplateLookup,
): ResolvedStatblock {
  const found = templates.get(source.templateId);
  if (!found) {
    const fields = frontmatterCreature(frontmatter, path);
    return { path, source, fields, template: autoTemplate(fields), templateStatus: 'missing', lookName: null, meanings: NO_MEANINGS };
  }
  const fields = frontmatterCreature(withFormerKeysAliased(frontmatter, found.template.fields), path);
  const { fields: templateFields } = withHeaderFields(found.template);
  const shownFields = withReferencesFilled(fields, templateFields, statblockLookup(found.template, fields, templateFields));
  return {
    path,
    source,
    fields,
    template: found.template,
    templateStatus: found.status,
    lookName: found.name,
    meanings: meaningsOf(found.template.fields),
    ...(shownFields !== fields && { shownFields }),
  };
}

/** A Fantasy Statblocks statblock: the plugin renders it while loaded, the auto template while it is missing. */
export function resolveFantasy(
  path: string,
  source: StatblockSource,
  creature: StatblockRecord,
  fantasy: { loaded: boolean; layoutName: string | null },
): ResolvedStatblock {
  return fantasy.loaded
    ? { path, source, fields: creature, template: null, templateStatus: null, lookName: fantasy.layoutName, meanings: NO_MEANINGS }
    : { path, source, fields: creature, template: autoTemplate(creature), templateStatus: 'auto', lookName: null, meanings: NO_MEANINGS };
}

/**
 * A fence read without Fantasy Statblocks: its own YAML with the auto
 * template, where it defines fields. A fence that only names a bestiary
 * creature or another note gives null: only the plugin can read it.
 */
export function resolveInlineFence(path: string, source: FenceSource): ResolvedStatblock | null {
  if (autoTemplate(source.params).fields.length === 0) return null;
  return resolveFantasy(path, source, frontmatterCreature(source.params, path), { loaded: false, layoutName: null });
}

/** The layout a creature asks for by name, as Fantasy Statblocks reads `layout`. */
export function requestedLayout(creature: StatblockRecord): string | null {
  return typeof creature.layout === 'string' ? creature.layout : null;
}

/** The FS layout a creature renders with: the plugin's match, else the name it asks for. */
export function fantasyLayoutName(app: App, creature: FantasyStatblocksCreature): string | null {
  return layoutForCreature(app, creature)?.name ?? requestedLayout(creature);
}

/** What a creature the predicate did not find came from: the bestiary's parse of the note, else a creature of its name. */
function bestiarySource(path: string, creature: StatblockRecord, bestiary: BestiaryLookup): StatblockSource {
  if (bestiary.byPath.has(path)) return { kind: 'fs-frontmatter' };
  return { kind: 'fs-fence', params: { creature: creature.name } };
}

/** The statblock of a vault note, or null when it defines none Atlas can read. */
export async function resolveStatblock(app: App, path: string, context: VaultResolveContext): Promise<ResolvedStatblock | null> {
  const file = app.vault.getAbstractFileByPath(path);
  const note = file instanceof TFile ? file : null;
  const source = note ? await statblockSourceOf(app, note) : null;
  if (note && source?.kind === 'atlas') return resolveNative(path, source, cachedFrontmatter(app, note) ?? {}, context.templates);

  const bestiary = context.bestiary ?? bestiaryLookup();
  const loaded = bestiary.api !== null;
  const creature = await linkedCreatureFor(app, path, source, bestiary);
  if (!creature) return !loaded && source?.kind === 'fs-fence' ? resolveInlineFence(path, source) : null;
  return resolveFantasy(path, source ?? bestiarySource(path, creature, bestiary), creature, {
    loaded,
    layoutName: loaded ? fantasyLayoutName(app, creature) : null,
  });
}
