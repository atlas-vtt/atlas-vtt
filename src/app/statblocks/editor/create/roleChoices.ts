/**
 * The roles a new statblock can be made with (§7.3), as the role menu lists
 * them: each role's name and, muted beside it, the template it starts from.
 * Pure: the collection's roles and the library come in.
 */

import type { TemplateLookup } from '../../model/resolvedTypes';
import type { StatblockRole } from '../../model/roleTypes';
import { GENERIC_ROLE_TEMPLATE_ID } from '../../roles/collectionStatblockRoles';

export interface RoleChoice {
  roleId: string;
  /** In the system's words: "Monster", "NPC". */
  name: string;
  /** The template a statblock of the role starts from; empty while the library is still reading the vault. */
  templateName: string;
}

/** "New statblock…" in a dialog: the roles to make one with, and what choosing one does. */
export interface NewStatblockOption {
  choices: readonly RoleChoice[];
  onChoose: (roleId: string) => void;
}

/**
 * One choice per role, in the collection's order. A role whose template the
 * library lacks starts from the generic template (`roleTemplate`), so the menu
 * names that one; while the library still reads the vault it names none.
 */
export function roleChoicesOf(roles: readonly StatblockRole[], templates: TemplateLookup, loading: boolean): RoleChoice[] {
  return roles.map((role) => {
    const own = templates.get(role.templateId);
    const shown = own ?? (loading ? null : templates.get(GENERIC_ROLE_TEMPLATE_ID));
    return { roleId: role.id, name: role.name, templateName: shown?.name ?? '' };
  });
}
