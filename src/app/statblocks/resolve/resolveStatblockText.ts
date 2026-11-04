/**
 * The resolver for note text that is not in the vault, such as the notes of a
 * bundle under review: the same record `resolveStatblock` gives, with the
 * bundle's own templates looked up before the library. A note whose template
 * is in neither renders with the auto template and status `missing`.
 */

import type { App } from 'obsidian';
import { fantasyFrontmatterCreature } from '../../creatures/linkedCreature';
import { getFantasyStatblocksApi, resolveCreatureFromFence } from '../../services/FantasyStatblocksService';
import type { LibraryTemplate, ResolveContext, ResolvedStatblock, TemplateLookup } from '../model/resolvedTypes';
import type { TemplateId } from '../model/templateTypes';
import { frontmatterOfText, statblockSourceFromText } from '../notes/statblockSource';
import { fantasyLayoutName, resolveFantasy, resolveInlineFence, resolveNative } from './resolveStatblock';

export interface TextResolveContext extends ResolveContext {
  /** Resolves fences that name a bestiary creature or another note, and FS layout names. */
  app: App;
  /** Templates that travel with the text (a bundle's own), read from their files; found before the library's. */
  bundleTemplates?: readonly LibraryTemplate[];
}

function withBundleTemplates(templates: TemplateLookup, bundle: readonly LibraryTemplate[]): TemplateLookup {
  if (bundle.length === 0) return templates;
  const byId = new Map<TemplateId, LibraryTemplate>();
  for (const entry of bundle) if (!byId.has(entry.template.id)) byId.set(entry.template.id, entry);
  return { get: (id) => byId.get(id) ?? templates.get(id) };
}

/** The statblock note text defines, or null when it defines none Atlas can read. */
export async function resolveStatblockText(text: string, path: string, context: TextResolveContext): Promise<ResolvedStatblock | null> {
  const source = statblockSourceFromText(text);
  if (!source) return null;
  const frontmatter = frontmatterOfText(text) ?? {};
  if (source.kind === 'atlas') {
    return resolveNative(path, source, frontmatter, withBundleTemplates(context.templates, context.bundleTemplates ?? []));
  }

  const loaded = getFantasyStatblocksApi() !== null;
  const creature = source.kind === 'fs-frontmatter'
    ? fantasyFrontmatterCreature(frontmatter, path)
    : await resolveCreatureFromFence(context.app, source.params, path);
  if (!creature) return !loaded && source.kind === 'fs-fence' ? resolveInlineFence(path, source) : null;
  return resolveFantasy(path, source, { ...creature, path }, {
    loaded,
    layoutName: loaded ? fantasyLayoutName(context.app, creature) : null,
  });
}
