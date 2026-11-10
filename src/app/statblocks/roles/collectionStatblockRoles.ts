/**
 * Reading a collection's statblock roles: which ones it has, where a role's statblocks go,
 * which template a role starts from, and comparing two lists.
 */

import type { CollectionSettings } from '../../types/collectionSettingsTypes';
import type { SystemPreset } from '../../types/systemPresetTypes';
import type { StatblockRole } from '../model/roleTypes';
import type { TemplateId } from '../model/templateTypes';

/** The template a role starts from while its own is missing. */
export const GENERIC_ROLE_TEMPLATE_ID: TemplateId = 'builtin:generic-creature';

/** The roles of a collection whose system names none. Never change the ids: folders record them. */
export const GENERIC_STATBLOCK_ROLES: readonly StatblockRole[] = [
  { id: 'creature', name: 'Creature', templateId: GENERIC_ROLE_TEMPLATE_ID },
  { id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' },
];

type RoleSettings = Pick<CollectionSettings, 'statblockRoles' | 'systemPresetId'>;

/** A list of its own, or undefined: an empty list counts as none, so there is always a role to make a statblock with. */
function ownList(roles: readonly StatblockRole[] | undefined): readonly StatblockRole[] | undefined {
  return roles?.length ? roles : undefined;
}

/**
 * The roles of a collection: its own, else those of the preset it was set from, else the
 * generic pair (no game system, or one whose rules name no roles).
 */
export function collectionStatblockRoles(settings: RoleSettings, presets: readonly SystemPreset[]): readonly StatblockRole[] {
  const ofPreset = presets.find((preset) => preset.id === settings.systemPresetId)?.rules.statblockRoles;
  return ownList(settings.statblockRoles) ?? ownList(ofPreset) ?? GENERIC_STATBLOCK_ROLES;
}

/** Whether two lists offer the same roles, ids included since folders record them; none is the generic pair. */
export function sameStatblockRoles(a: readonly StatblockRole[] | undefined, b: readonly StatblockRole[] | undefined): boolean {
  const left = ownList(a) ?? GENERIC_STATBLOCK_ROLES;
  const right = ownList(b) ?? GENERIC_STATBLOCK_ROLES;
  return left.length === right.length
    && left.every((role, i) => role.id === right[i]!.id && role.name === right[i]!.name && role.templateId === right[i]!.templateId);
}

/**
 * What the collection stores after an edit of its roles: `next`, or nothing while it equals the
 * roles of its game system (`system`), so an untouched collection keeps following its preset.
 */
export function editedStatblockRoles(
  next: readonly StatblockRole[],
  system: readonly StatblockRole[] | undefined,
): readonly StatblockRole[] | undefined {
  return sameStatblockRoles(next, system) ? undefined : ownList(next);
}

/** The folder new statblocks of the role are created in; undefined for Obsidian's location for new notes. */
export function roleFolder(settings: Pick<CollectionSettings, 'statblockRoleFolders'>, roleId: string): string | undefined {
  const folders = settings.statblockRoleFolders;
  // Role ids are words like "constructor", which a plain lookup would find on every object
  return folders && Object.prototype.hasOwnProperty.call(folders, roleId) ? folders[roleId] : undefined;
}

/** The template a new statblock of the role starts from, and whether the role's own is missing (a warning chip). */
export interface RoleTemplate {
  templateId: TemplateId;
  missing: boolean;
}

/** The role's template while `hasTemplate` finds it, else the generic one. */
export function roleTemplate(role: StatblockRole, hasTemplate: (id: TemplateId) => boolean): RoleTemplate {
  return hasTemplate(role.templateId)
    ? { templateId: role.templateId, missing: false }
    : { templateId: GENERIC_ROLE_TEMPLATE_ID, missing: true };
}
