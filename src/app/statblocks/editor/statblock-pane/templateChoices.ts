/** What the Change template dialog lists and says. Pure. */

import { isReservedKey } from '../../model/reservedKeys';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { StatblockRole } from '../../model/roleTypes';
import { fieldByKey } from '../../model/fieldKeys';
import { displayNameKey, headerParts, hiddenHeaderParts } from '../../model/templateHeader';
import { fieldsShownBy, flattenReadingOrder } from '../../model/treeQueries';
import type { StatblockTemplate, TemplateField } from '../../model/templateTypes';
import type { FieldRecord } from '../../values/fieldValues';
import { t } from '../../../i18n';

export interface TemplateChoice {
  entry: LibraryTemplate;
  /** The roles that use it ("Monster"), or "Built-in". */
  detail: string | null;
}

export interface TemplateGroup {
  heading: string;
  items: TemplateChoice[];
}

/**
 * The templates by group: those the collection's roles use first, named
 * with their roles, then every other template of the library in its order.
 */
export function templateGroups(templates: readonly LibraryTemplate[], roles: readonly StatblockRole[]): TemplateGroup[] {
  const roleNames = new Map<string, string[]>();
  for (const role of roles) roleNames.set(role.templateId, [...(roleNames.get(role.templateId) ?? []), role.name]);
  const ofRoles = templates.filter((entry) => roleNames.has(entry.template.id));
  const others = templates.filter((entry) => !roleNames.has(entry.template.id));
  const groups: TemplateGroup[] = [
    { heading: t('statblockEditor.usedByCollection'), items: ofRoles.map((entry) => ({ entry, detail: roleNames.get(entry.template.id)?.join(', ') ?? null })) },
    { heading: t('statblockEditor.allTemplates'), items: others.map((entry) => ({ entry, detail: entry.builtIn ? t('statblockEditor.builtInDetail') : null })) },
  ];
  return groups.filter((group) => group.items.length > 0);
}

/** Obsidian's own properties, which the pane's tray edits as chips. */
export const NOTE_PROPERTY_KEYS: ReadonlySet<string> = new Set(['tags', 'aliases', 'cssclasses']);

/** Keys of the note the template does not read, by their own or a former key; never the markers and Obsidian's own. */
export function keysOutsideTemplate(record: FieldRecord, template: StatblockTemplate): string[] {
  const bound = new Set(template.fields.flatMap((field) => [field.key, ...(field.formerKeys ?? [])]));
  return Object.keys(record).filter((key) => !bound.has(key) && !NOTE_PROPERTY_KEYS.has(key) && !isReservedKey(key));
}

/** "Not shown with this template: speed, lair": the note's values a template would leave out. */
export function unshownKeys(record: FieldRecord, template: StatblockTemplate): string[] {
  return keysOutsideTemplate(record, template);
}

/**
 * The properties of the header's parts the template hides (a level or type
 * its system has no use for), in the header's order; not one the card shows
 * another way (a type in a line of the layout). The name is one where the
 * header shows a display name in its place: the card edits that, not `name`.
 */
export function hiddenFields(template: StatblockTemplate): TemplateField[] {
  const shown = new Set(flattenReadingOrder(template.layout.blocks).flatMap((block) => fieldsShownBy(block)));
  const name = displayNameKey(template.fields) ? headerParts(template).filter((part) => part.id === 'name') : [];
  return [...name, ...hiddenHeaderParts(template)]
    .filter((part) => !shown.has(part.key))
    .flatMap((part) => fieldByKey(template.fields, part.key) ?? []);
}
