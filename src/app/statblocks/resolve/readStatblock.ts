/**
 * Resolving a vault note once, for what reads a statblock a single time
 * (linking a token, placing one, an import, the link dialog's list), with the
 * app's template library. Views that stay open follow the library instead
 * (`CreatureIndex`), so they never wait for it.
 */

import type { App } from 'obsidian';
import type { BestiaryLookup } from '../../creatures/linkedCreature';
import { TemplateLibrary } from '../library/TemplateLibrary';
import type { ResolvedStatblock, TemplateLookup } from '../model/resolvedTypes';
import { isBuiltInTemplateId } from '../model/templateTypes';
import { resolveStatblock } from './resolveStatblock';

/**
 * The app's template library as the resolver's lookup: templates as saved.
 * The library is made only once a native note names a template.
 */
export function libraryTemplates(app: App): TemplateLookup {
  return { get: (id) => TemplateLibrary.forApp(app).get(id) };
}

/** Resolves once the library has read the templates the vault held when it started. */
export function libraryLoaded(library: TemplateLibrary): Promise<void> {
  if (!library.isLoading()) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = library.subscribe(() => {
      if (library.isLoading()) return;
      stop();
      resolve();
    });
  });
}

/**
 * A vault note's statblock (`resolveStatblock`), or null when it defines none
 * Atlas can read. A native note whose template the library has not read yet
 * is read again once it has, so its meanings and renamed keys count.
 */
export async function readStatblock(app: App, path: string, bestiary?: BestiaryLookup): Promise<ResolvedStatblock | null> {
  const waiting = new Set<TemplateLibrary>();
  const templates: TemplateLookup = {
    get: (id) => {
      const library = TemplateLibrary.forApp(app);
      if (library.isLoading() && !isBuiltInTemplateId(id)) waiting.add(library);
      return library.get(id);
    },
  };
  const context = { templates, ...(bestiary && { bestiary }) };
  const resolved = await resolveStatblock(app, path, context);
  const [library] = waiting;
  if (!library || resolved?.templateStatus !== 'missing') return resolved;
  await libraryLoaded(library);
  return resolveStatblock(app, path, context);
}
