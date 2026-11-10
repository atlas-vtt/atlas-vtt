/**
 * Where a template is used (§8.7): the native statblocks that name it and the
 * collections' roles that start from it. Read from the metadata cache and the
 * loaded asset index; no file is read.
 */

import type { App } from 'obsidian';
import { AssetService } from '../../services/AssetService';
import { systemPresetsOf } from '../../services/mapCollectionRules';
import type { TemplateId } from '../model/templateTypes';
import { cachedTemplateId } from '../notes/statblockSource';
import { collectionStatblockRoles } from '../roles/collectionStatblockRoles';

export interface TemplateUsage {
  /** Paths of the statblock notes that name the template, sorted. */
  notes: readonly string[];
  /** The roles that start from it: each collection's own, or its system's. */
  roles: ReadonlyArray<{ collectionId: string; roleId: string; roleName: string }>;
}

/** The template each native statblock names, by note path; from the metadata cache. */
function nativeTemplates(app: App): Array<{ path: string; templateId: TemplateId }> {
  return app.vault.getMarkdownFiles().flatMap((file) => {
    const templateId = cachedTemplateId(app, file);
    return templateId === null ? [] : [{ path: file.path, templateId }];
  });
}

/** Paths of the native statblocks that name the template, sorted. */
export function templateNotes(app: App, id: TemplateId): string[] {
  return nativeTemplates(app).filter((note) => note.templateId === id).map((note) => note.path).sort();
}

/** How many native statblocks name each template, in one pass over the metadata cache. */
export function templateNoteCounts(app: App): ReadonlyMap<TemplateId, number> {
  const counts = new Map<TemplateId, number>();
  for (const { templateId } of nativeTemplates(app)) counts.set(templateId, (counts.get(templateId) ?? 0) + 1);
  return counts;
}

export function templateUsage(app: App, id: TemplateId): TemplateUsage {
  const notes = templateNotes(app, id);
  const presets = systemPresetsOf(app);
  const roles = AssetService.getInstance(app).loadedCollections().flatMap((collection) =>
    collectionStatblockRoles(collection.settings ?? { conditions: [] }, presets)
      .filter((role) => role.templateId === id)
      .map((role) => ({ collectionId: collection.id, roleId: role.id, roleName: role.name })));
  return { notes, roles };
}
