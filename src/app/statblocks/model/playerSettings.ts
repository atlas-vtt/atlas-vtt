/**
 * What players may do with a template's fields, as the template editor sets it. Pure. The template
 * stores only exceptions (`StatblockTemplate.players`): a field set back to what its kind lets a
 * player do by default loses its key, and a record left empty goes. An edit that changes nothing
 * returns the very template, so a session records no step for it.
 */

import { fieldByKey } from './fieldKeys';
import type { FieldKey, PlayerAccess, StatblockTemplate, TemplateField } from './templateTypes';

/** What a player may do with a field the template says nothing about: a spell list they read, every other value they change. */
export function defaultPlayerAccess(field: TemplateField): PlayerAccess {
  return field.type === 'spells' ? 'read' : 'edit';
}

/** The settings offered for fields set together, the default first: spell lists are never changed by a player. */
export function playerAccessChoices(fields: readonly TemplateField[]): PlayerAccess[] {
  return fields.length > 0 && fields.every((field) => field.type === 'spells') ? ['read', 'hidden'] : ['edit', 'read', 'hidden'];
}

/**
 * The template with every field of `keys` set to `access` for players (an Abilities tile's lists,
 * a Metric's numbers), each stored only where it differs from the field's default. A setting kept
 * under a key the field had before a rename is dropped with it, so the new one is what counts. A
 * spell list told `edit` keeps its default, since players never change one. Keys the template has
 * no field for are left alone.
 */
export function withPlayerAccess(template: StatblockTemplate, keys: readonly FieldKey[], access: PlayerAccess): StatblockTemplate {
  const players: Record<FieldKey, string> = { ...template.players };
  let changed = false;
  for (const key of keys) {
    const field = fieldByKey(template.fields, key);
    if (!field) continue;
    for (const former of [field.key, ...(field.formerKeys ?? [])]) {
      if (!Object.hasOwn(players, former)) continue;
      delete players[former];
      changed = true;
    }
    const own = playerAccessChoices([field]).includes(access) ? access : defaultPlayerAccess(field);
    if (own !== defaultPlayerAccess(field)) {
      players[field.key] = own;
      changed = true;
    }
  }
  if (!changed || samePlayers(template.players, players)) return template;
  const next: StatblockTemplate = { ...template, players };
  if (Object.keys(players).length === 0) delete next.players;
  return next;
}

function samePlayers(was: Readonly<Record<FieldKey, string>> | undefined, now: Readonly<Record<FieldKey, string>>): boolean {
  const before = was ?? {};
  const keys = Object.keys(now);
  return keys.length === Object.keys(before).length && keys.every((key) => before[key] === now[key]);
}
