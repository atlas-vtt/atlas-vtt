/**
 * Importing Fantasy Statblocks layouts as templates (§6.2): from the plugin
 * (its layout manager, feature-detected, read only) or from a layout file.
 * A layout is imported once: its template is found again by the layout's id,
 * then by its name (`importedFrom`), so the 300 notes of one layout share one
 * template. The conversion is `fsLayoutToTemplate`, which never runs the
 * layout's JavaScript; scripts that drew tracks of boxes become Track blocks.
 */

import type { App } from 'obsidian';
import { findLayout } from '../../services/FantasyStatblocksService';
import { parseJsonText } from '../format/jsonValues';
import { createTemplateFile } from '../library/templateActions';
import { TemplateLibrary } from '../library/TemplateLibrary';
import type { LibraryTemplate } from '../model/resolvedTypes';
import { newTemplateId } from '../model/templateIds';
import type { TemplateId } from '../model/templateTypes';
import { libraryLoaded } from '../resolve/readStatblock';
import { fsLayoutToTemplate, isFsLayout } from './fsLayoutToTemplate';
import type { FsImportReport, FsLayout, FsLayoutResolver } from './fsLayoutTypes';
import { withTracksInPlace } from './fsTrackReplacement';
import { t } from '../../i18n';

/** What names a layout: FS's id, and its name, which a layout file keeps when FS gives it a new id. */
export interface LayoutIdentity {
  id: string;
  name: string;
}

/** The template a layout gave, now or before. */
export interface FsLayoutImport {
  id: TemplateId;
  /** The template's name: its file's basename. */
  name: string;
  path: string;
  /** The import's report; null when the layout had been imported before. */
  report: FsImportReport | null;
}

const FALLBACK_NAME = t('statblockEditor.fs.importedName');

/** How `layout` blocks find the layouts they include: exact matches among the plugin's. */
export function pluginLayoutResolver(app: App): FsLayoutResolver {
  return (idOrName) => findLayout(app, idOrName);
}

/** A layout's id and name as its template records them (`importedFrom`); a layout file is untrusted, so either may be missing. */
export function identityOf(layout: Pick<FsLayout, 'id' | 'name'>): LayoutIdentity {
  const id: unknown = layout.id;
  const name: unknown = layout.name;
  return { id: typeof id === 'string' ? id : '', name: typeof name === 'string' ? name : '' };
}

/** Whether a template was imported from the layout: the same id, else the same name. */
function importedBy(entry: LibraryTemplate, key: 'layoutId' | 'layoutName', value: string): boolean {
  return value !== '' && !entry.builtIn && entry.template.importedFrom?.[key] === value;
}

/** The template the layout was imported as before: found by the layout's id, then by its name. */
export function findImportedTemplate(templates: readonly LibraryTemplate[], layout: LayoutIdentity): LibraryTemplate | null {
  return templates.find((entry) => importedBy(entry, 'layoutId', layout.id))
    ?? templates.find((entry) => importedBy(entry, 'layoutName', layout.name))
    ?? null;
}

/** A layout file's text as a layout, or the sentence that says why it is none. */
export function readLayoutText(text: string): { layout: FsLayout } | { problem: string } {
  const parsed = parseJsonText(text);
  if (!('value' in parsed)) return { problem: t('statblockEditor.fs.notJson') };
  return isFsLayout(parsed.value) ? { layout: parsed.value } : { problem: t('statblockEditor.fs.notLayout') };
}

/** The last import of each app: imports run one after the other, so a second import of a layout finds the first's template. */
const lastImport = new WeakMap<App, Promise<unknown>>();

/** The template of the layout: the one imported before, else a new one made from it now. */
export function importFsLayout(app: App, layout: FsLayout, resolveLayout?: FsLayoutResolver): Promise<FsLayoutImport> {
  const before = lastImport.get(app) ?? Promise.resolve();
  const next = before.catch(() => undefined).then(() => importOnce(app, layout, identityOf(layout), resolveLayout ?? pluginLayoutResolver(app)));
  lastImport.set(app, next);
  return next;
}

async function importOnce(app: App, layout: FsLayout, identity: LayoutIdentity, resolveLayout: FsLayoutResolver): Promise<FsLayoutImport> {
  const library = TemplateLibrary.forApp(app);
  // A template imported in an earlier session counts only once the library has read it.
  await libraryLoaded(library);
  const found = findImportedTemplate(library.list(), identity);
  if (found?.path) return { id: found.template.id, name: found.name, path: found.path, report: null };
  const name = identity.name.trim() || FALLBACK_NAME;
  const { template, report } = withTracksInPlace(fsLayoutToTemplate(layout, { id: newTemplateId(name), resolveLayout }));
  const created = await createTemplateFile(app, name, template);
  return { id: created.id, name: library.get(created.id)?.name ?? name, path: created.path, report };
}
