/**
 * What the initiative settings show while the GM chooses the modifier's field: how many of the
 * collection's statblocks the rules read a modifier from, with one as an example, so a field that
 * reads nothing shows at once and not only at the table.
 */

import type { IndexedCreature } from '../creatures/CreatureIndex';
import type { ModifierSources } from '../gameSystems/initiativeModifierSources';
import type { StatblockTemplate } from '../statblocks/model/templateTypes';
import { statblockInitiativeModifier } from './initiativeModifier';
import { labelsOf, type FieldLabels, type ModifierStatblock } from './modifierFields';

/** A statblock of the collection as initiative reads it, with the name it goes by. */
export interface NamedModifierStatblock extends ModifierStatblock {
  name: string;
}

export interface ModifierPreview {
  /** The statblocks looked at. */
  total: number;
  /** How many of them give a modifier. */
  read: number;
  /** The first that gives one. */
  example: { name: string; modifier: number } | null;
}

function nameOf(creature: IndexedCreature): string {
  const { name } = creature.fields;
  if (typeof name === 'string' && name.trim() !== '') return name.trim();
  return creature.path.split('/').pop()?.replace(/\.md$/i, '') ?? creature.path;
}

/**
 * The collection's statblocks as initiative reads them: a native one with its template's labels
 * (where `templates` holds its template), one without a template as Fantasy Statblocks'.
 */
export function modifierStatblocksOf(creatures: readonly IndexedCreature[], templates: readonly StatblockTemplate[]): NamedModifierStatblock[] {
  const labels = new Map<string, FieldLabels>();
  const labelsFor = (template: StatblockTemplate): FieldLabels => {
    const known = labels.get(template.id);
    if (known) return known;
    const made = labelsOf(template.fields);
    labels.set(template.id, made);
    return made;
  };
  return creatures.map((creature) => {
    const template = creature.templateId === null ? undefined : templates.find((candidate) => candidate.id === creature.templateId);
    return {
      name: nameOf(creature),
      fields: creature.fields,
      meanings: creature.meanings,
      fantasy: creature.templateId === null,
      ...(template && { labels: labelsFor(template) }),
    };
  });
}

/** How the rules' `sources` read the statblocks: in reading order, as a roll does. */
export function modifierPreview(statblocks: readonly NamedModifierStatblock[], sources: ModifierSources): ModifierPreview {
  let read = 0;
  let example: ModifierPreview['example'] = null;
  for (const statblock of statblocks) {
    const modifier = statblockInitiativeModifier(statblock, sources);
    if (modifier === null) continue;
    read += 1;
    example ??= { name: statblock.name, modifier };
  }
  return { total: statblocks.length, read, example };
}
