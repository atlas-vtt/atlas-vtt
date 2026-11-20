/**
 * A collection's statblock roles as creating a statblock reads them: the
 * choices the role menu lists, what a new statblock can start from (the roles
 * and the library's templates), the role chosen with the collection's
 * settings, and the template a statblock of that role starts from.
 */

import type { App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import { systemPresetsOf } from '../../../services/mapCollectionRules';
import type { CollectionSettings } from '../../../types/collectionSettingsTypes';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { StatblockRole } from '../../model/roleTypes';
import type { TemplateId } from '../../model/templateTypes';
import { libraryLoaded } from '../../resolve/readStatblock';
import { collectionStatblockRoles, roleTemplate } from '../../roles/collectionStatblockRoles';
import { collectionRoles } from '../collectionContext';
import { roleChoicesOf, type RoleChoice } from './roleChoices';
import { templateOffers, type TemplateOffer } from './templateOffers';

export interface ChosenRole {
  collectionId: string;
  settings: CollectionSettings;
  role: StatblockRole;
}

/** The roles a new statblock of the collection (the default one for null) can be made with, as the role menu lists them. */
export function roleChoicesFor(app: App, collectionId: string | null): RoleChoice[] {
  const id = collectionId ?? AssetService.getInstance(app).getDefaultCollectionId();
  const library = TemplateLibrary.forApp(app);
  return roleChoicesOf(collectionRoles(app, id, systemPresetsOf(app)), library, library.isLoading());
}

/**
 * What a new statblock of the collection (the default one for null) can start from, as every entry point lists it
 * (`templateOffers`): `preferred` first, the collection's roles, then `templates`, the library's or the part of it the
 * entry point lists. Read as the library stands: while it still reads the vault a role's own template may count as
 * missing, so whoever creates from a role's offer asks for the role's template again (`roleTemplateId`).
 */
export function collectionOffers(
  app: App, collectionId: string | null, templates: readonly LibraryTemplate[], preferred: TemplateId | null = null,
): TemplateOffer[] {
  const id = collectionId ?? AssetService.getInstance(app).getDefaultCollectionId();
  const library = TemplateLibrary.forApp(app);
  const roles = collectionRoles(app, id, systemPresetsOf(app));
  const choices = roleChoicesOf(roles, library, library.isLoading());
  return templateOffers({
    roles: roles.map((role, index) => ({
      roleId: role.id,
      name: role.name,
      templateId: roleTemplate(role, (templateId) => library.get(templateId) !== null).templateId,
      templateName: choices[index]?.templateName ?? '',
    })),
    templates,
    preferred,
    changedAt: (entry) => (entry.path ? app.vault.getFileByPath(entry.path)?.stat.mtime ?? 0 : 0),
  });
}

/** The role with this id in the collection (the default one for null); its first role when it has none of that id any more. */
export function chosenRole(app: App, collectionId: string | null, roleId: string): ChosenRole | null {
  const assets = AssetService.getInstance(app);
  const id = collectionId ?? assets.getDefaultCollectionId();
  const settings = assets.getCollectionSettings(id);
  const roles = collectionStatblockRoles(settings, systemPresetsOf(app));
  const role = roles.find((candidate) => candidate.id === roleId) ?? roles[0];
  return role ? { collectionId: id, settings, role } : null;
}

/**
 * The template a new statblock of the role starts from: the role's own, or the
 * generic one where the library lacks it once it has read the vault's
 * templates, so a role's own template is never taken for missing.
 */
export async function roleTemplateId(app: App, role: StatblockRole): Promise<TemplateId> {
  const library = TemplateLibrary.forApp(app);
  await libraryLoaded(library);
  return roleTemplate(role, (id) => library.get(id) !== null).templateId;
}
