import { useMemo } from 'react';
import type { App } from 'obsidian';
import type { IndexedCreature } from '../../../creatures/CreatureIndex';
import { initiativeFieldSuggestions } from '../../../initiative/initiativeFieldSuggestions';
import { modifierStatblocksOf, type NamedModifierStatblock } from '../../../initiative/modifierPreview';
import type { FieldSuggestion } from '../../../resources/resourceFieldSuggestions';
import type { StatblockTemplate } from '../../../statblocks/model/templateTypes';
import { useTemplates } from './useRoleTemplates';

/** What the initiative settings offer for the modifier's field, and the statblocks its preview reads. */
export interface ModifierFieldOffer {
  suggestions: readonly FieldSuggestion[];
  statblocks: readonly NamedModifierStatblock[];
}

/**
 * The fields of the role templates and of the templates the collection's statblocks use, with the
 * statblocks as initiative reads them, read while `active`.
 */
export function useModifierFieldOffer(
  app: App | null,
  roleTemplates: readonly StatblockTemplate[],
  creatures: readonly IndexedCreature[],
  active: boolean,
): ModifierFieldOffer {
  const ids = useMemo(() => {
    const roleIds = new Set(roleTemplates.map((template) => template.id));
    return [...new Set(creatures.flatMap((creature) => (creature.templateId && !roleIds.has(creature.templateId) ? [creature.templateId] : [])))];
  }, [roleTemplates, creatures]);
  const used = useTemplates(app, ids, active);
  return useMemo(() => {
    const templates = [...roleTemplates, ...used];
    const statblocks = modifierStatblocksOf(creatures, templates);
    return { suggestions: initiativeFieldSuggestions(templates, statblocks), statblocks };
  }, [roleTemplates, used, creatures]);
}
