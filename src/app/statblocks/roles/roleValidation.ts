/**
 * Statblock roles as they are stored and edited: reading a stored list field by field, giving
 * roles added in a dialog their ids, and what keeps a list from being saved.
 */

import { draftResourceKey, isDraftResourceKey, resourceKey } from '../../resources/resourceDefinitions';
import type { StatblockRole, StatblockRoleFolders } from '../model/roleTypes';
import { isRecord } from '../format/jsonValues';
import { isValidTemplateId } from '../model/templateIds';
import { t } from '../../i18n';

/** What `resourceKey` gives a name without a letter or digit to key by. */
const FALLBACK_ROLE_ID = 'role';
/** What `resourceKey` makes of a name: lower-case letters and digits joined by single hyphens. */
const ROLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `id` can be a stored role's id; one added in a dialog has a draft id until it is saved. */
export function isStatblockRoleId(id: unknown): id is string {
  return typeof id === 'string' && ROLE_ID.test(id);
}

/** Names compare without case and surrounding space: "NPC" and " npc" are one name. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** A stored role, or null when its id, name or template id cannot be used. */
export function parseStatblockRole(raw: unknown): StatblockRole | null {
  if (!isRecord(raw) || !isStatblockRoleId(raw.id)) return null;
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  if (typeof raw.templateId !== 'string' || !isValidTemplateId(raw.templateId)) return null;
  return { id: raw.id, name: raw.name.trim(), templateId: raw.templateId };
}

/**
 * The usable roles of a stored list, the first kept where ids or names repeat. A template id
 * nothing in the vault has is kept: the role then starts from the generic template
 * (`roleTemplate`). Undefined when `raw` is no list.
 */
export function parseStatblockRoles(raw: unknown): StatblockRole[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = new Set<string>();
  const names = new Set<string>();
  return raw.flatMap((entry) => {
    const role = parseStatblockRole(entry);
    if (!role || ids.has(role.id) || names.has(nameKey(role.name))) return [];
    ids.add(role.id);
    names.add(nameKey(role.name));
    return [role];
  });
}

/** The folders of a stored record that name a folder for a role id; undefined when none does. */
export function parseStatblockRoleFolders(raw: unknown): StatblockRoleFolders | undefined {
  if (!isRecord(raw)) return undefined;
  const entries = Object.entries(raw).flatMap(([roleId, folder]): Array<[string, string]> =>
    (isStatblockRoleId(roleId) && typeof folder === 'string' && folder.trim() ? [[roleId, folder.trim()]] : []));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** A placeholder id for a role added in a dialog; `savedStatblockRoles` replaces it when the role is saved. */
export function draftRoleId(): string {
  return draftResourceKey();
}

/**
 * Roles as they are saved: names trimmed, and a role added in a dialog takes its id from the
 * name it has now, as resources take their keys (`withFinalKeys`), so adding "Monster" again
 * after removing it finds its folder again. Saved roles keep their id whatever they are renamed to.
 */
export function savedStatblockRoles(roles: readonly StatblockRole[]): StatblockRole[] {
  const taken = roles.filter((role) => !isDraftResourceKey(role.id)).map((role) => role.id);
  return roles.map((role) => {
    const name = role.name.trim();
    if (!isDraftResourceKey(role.id)) return { ...role, name };
    const id = resourceKey(name, taken, FALLBACK_ROLE_ID);
    taken.push(id);
    return { ...role, id, name };
  });
}

/**
 * Folders as they are saved: trimmed, a blank one left out (Obsidian's location); undefined when
 * none is left. A folder chosen for a role added in the dialog goes with it to the id the role
 * is saved with (`savedStatblockRoles` of `roles`), and is left out once that role is gone.
 */
export function savedRoleFolders(folders: StatblockRoleFolders, roles: readonly StatblockRole[] = []): StatblockRoleFolders | undefined {
  const saved = savedStatblockRoles(roles);
  const finalIds = new Map(roles.map((role, i) => [role.id, saved[i]!.id]));
  const entries = Object.entries(folders).flatMap(([roleId, folder]): Array<[string, string]> => {
    const id = isDraftResourceKey(roleId) ? finalIds.get(roleId) : roleId;
    return id && folder.trim() ? [[id, folder.trim()]] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** Why the role at `index` cannot be saved: no name, or a name an earlier role has. Null when it can. */
export function roleNameProblem(roles: readonly StatblockRole[], index: number): string | null {
  const role = roles[index];
  if (!role) return null;
  if (!role.name.trim()) return t('statblockEditor.role.enterName');
  const key = nameKey(role.name);
  return roles.slice(0, index).some((other) => nameKey(other.name) === key) ? t('statblockEditor.role.taken') : null;
}

/** Whether every role has a name and no two share one. */
export function statblockRolesAreValid(roles: readonly StatblockRole[]): boolean {
  return roles.every((_role, index) => roleNameProblem(roles, index) === null);
}
