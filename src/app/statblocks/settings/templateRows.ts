/** What the Statblocks tab lists under Templates (§9). Pure. */

import type { LibraryTemplate } from '../model/resolvedTypes';
import type { StatblockRole } from '../model/roleTypes';
import type { TemplateId } from '../model/templateTypes';
import { t } from '../../i18n';

export interface TemplateRow {
  entry: LibraryTemplate;
  /** The roles of the collection that start from it. */
  roleNames: string[];
  /** How many statblocks name it. */
  count: number;
}

/**
 * The templates the collection's roles start from first, in the roles' order,
 * then every other template of the vault's own. Built-ins no role uses are
 * left to the gallery; a role's missing template has no row.
 */
export function templateRows(
  templates: readonly LibraryTemplate[], roles: readonly StatblockRole[], counts: ReadonlyMap<TemplateId, number>,
): TemplateRow[] {
  const byId = new Map(templates.map((entry) => [entry.template.id, entry]));
  const roleNames = new Map<TemplateId, string[]>();
  for (const role of roles) roleNames.set(role.templateId, [...(roleNames.get(role.templateId) ?? []), role.name]);
  const ofRoles = [...roleNames.keys()].map((id) => byId.get(id)).filter((entry): entry is LibraryTemplate => entry !== undefined);
  const others = templates.filter((entry) => !entry.builtIn && !roleNames.has(entry.template.id));
  return [...ofRoles, ...others].map((entry) => ({
    entry,
    roleNames: roleNames.get(entry.template.id) ?? [],
    count: counts.get(entry.template.id) ?? 0,
  }));
}

/** "Built-in · Monster, NPC" and "23 statblocks": what a row says beside the name. */
export function rowDetail(row: TemplateRow): string {
  return [row.entry.builtIn ? t('statblockEditor.builtInDetail') : null, row.roleNames.join(', ') || null].filter((part) => part !== null).join(' · ');
}

export function usageText(count: number): string {
  if (count === 0) return t('statblockEditor.notUsed');
  return t('statblockEditor.statblockCount', { count });
}
