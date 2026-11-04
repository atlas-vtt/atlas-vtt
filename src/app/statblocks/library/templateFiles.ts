/**
 * The library's view of template files, without Obsidian: what one file holds
 * once read, and which file holds each id when several claim it.
 */

import { migrateTemplate } from '../format/migrateTemplate';
import { withHeader } from '../model/headerDuplicates';
import { parseTemplate, type TemplateParseStatus } from '../format/parseTemplate';
import type { LibraryTemplate } from '../model/resolvedTypes';
import type { BuiltInTemplate, TemplateId } from '../model/templateTypes';

export const TEMPLATE_EXTENSION = 'atlastemplate';

/** One `.atlastemplate` file as the library read it. */
export interface TemplateFile {
  path: string;
  /** The file's basename, which is the template's name. */
  name: string;
  status: TemplateParseStatus;
  /** Plain sentences from reading the file; a usable template may have some too. */
  problems: readonly string[];
  /** The text it was read from. */
  text: string;
  /** What the library hands out while this file holds its id; null for a file that is no template or claims a built-in's id. */
  entry: LibraryTemplate | null;
}

export interface TemplateIndex {
  byId: ReadonlyMap<TemplateId, LibraryTemplate>;
  /** Files whose id a file with a lower path holds: path → that file's path. */
  duplicates: ReadonlyMap<string, string>;
}

const BY_NAME = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function isTemplatePath(path: string): boolean {
  return path.endsWith(`.${TEMPLATE_EXTENSION}`);
}

/** Whether a path is a folder's own or lies inside it. */
export function isWithin(path: string, folder: string): boolean {
  return path === folder || path.startsWith(`${folder}/`);
}

/** "atlas-vtt/statblock-templates/Marsh creature.atlastemplate" → "Marsh creature". */
export function templateName(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

/** Reads a file's text; a template of an older format, or one without a field for a part of its header, is mended in memory, never written back here. */
export function readTemplateFile(path: string, text: string): TemplateFile {
  const result = parseTemplate(text);
  const name = templateName(path);
  const template = result.template ? withHeader(migrateTemplate(result.template)) : null;
  const usable = result.status === 'ok' || result.status === 'newer' ? result.status : null;
  const entry: LibraryTemplate | null = template && usable ? { template, name, status: usable, builtIn: false, path } : null;
  return { path, name, status: result.status, problems: result.problems, text, entry };
}

/** The same file at another path: renamed, or moved with its folder. */
export function movedTemplateFile(file: TemplateFile, path: string): TemplateFile {
  const name = templateName(path);
  return { ...file, path, name, entry: file.entry && { ...file.entry, name, path } };
}

export function builtInEntry(builtIn: BuiltInTemplate): LibraryTemplate {
  return { template: builtIn.template, name: builtIn.name, status: 'ok', builtIn: true, path: null };
}

/**
 * Which file holds each id: the one with the lowest path, compared by code
 * units so every machine agrees. The others are duplicates; nothing is
 * rewritten, a new id is written only when the user asks for one.
 */
export function indexTemplateFiles(files: Iterable<TemplateFile>): TemplateIndex {
  const byId = new Map<TemplateId, LibraryTemplate>();
  const holders = new Map<TemplateId, string>();
  const duplicates = new Map<string, string>();
  const ordered = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of ordered) {
    if (!file.entry) continue;
    const id = file.entry.template.id;
    const holder = holders.get(id);
    if (holder === undefined) {
      byId.set(id, file.entry);
      holders.set(id, file.path);
    } else {
      duplicates.set(file.path, holder);
    }
  }
  return { byId, duplicates };
}

/** Built-ins in their registry's order, then the vault's templates by name. */
export function listTemplates(builtIns: readonly LibraryTemplate[], index: TemplateIndex): LibraryTemplate[] {
  const vault = [...index.byId.values()].sort((a, b) => BY_NAME.compare(a.name, b.name) || (a.path ?? '').localeCompare(b.path ?? ''));
  return [...builtIns, ...vault];
}
