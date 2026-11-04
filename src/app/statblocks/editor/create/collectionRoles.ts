/**
 * A collection's statblock roles as creating a statblock reads them: the
 * choices the role menu lists, the role chosen with the collection's settings,
 * and the template a statblock of that role starts from.
 */

import type { App } from 'obsidian';
import { AssetService } from '../../../services/AssetService';
import { systemPresetsOf } from '../../../services/mapCollectionRules';
import type { CollectionSettings } from '../../../types/collectionSettingsTypes';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import type { StatblockRole } from '../../model/roleTypes';
import type { TemplateId } from '../../model/templateTypes';
import { libraryLoaded } from '../../resolve/readStatblock';
import { collectionStatblockRoles, roleTemplate } from '../../roles/collectionStatblockRoles';
import { collectionRoles } from '../collectionContext';
import { roleChoicesOf, type RoleChoice } from './roleChoices';

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
