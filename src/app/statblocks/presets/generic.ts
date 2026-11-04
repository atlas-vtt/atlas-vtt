// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The generic tier: Atlas' own templates for homebrew collections and the
 * fallback of systems without a template of their own. Their keys are the
 * conventional ones (`hp`, `size`, `type`, `level`, `difficulty`), so
 * resources, creature filters, senses and the token's difficulty label read
 * them without meanings.
 */

import type { BuiltInTemplate, TemplateField } from '../model/templateTypes';
import { builtIn, descriptionField, hiddenParts, nameField, portraitField, runInStat, sizeField, stackedStat } from './presetParts';

function combatFields(): TemplateField[] {
  return [
    { key: 'ac', label: 'Armor', type: 'number', meaning: 'armor' },
    { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
    { key: 'speed', label: 'Speed', type: 'text' },
    { key: 'senses', label: 'Senses', type: 'text', meaning: 'senses' },
  ];
}

function closingFields(): TemplateField[] {
  return [
    descriptionField(),
    { key: 'traits', label: 'Traits', type: 'entries' },
    { key: 'actions', label: 'Actions', type: 'entries', prompt: 'Add an action' },
  ];
}

export const GENERIC_CREATURE: BuiltInTemplate = builtIn('builtin:generic-creature', 'Creature', 2, {
  fields: [
    nameField(),
    portraitField(),
    sizeField(),
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
    ...combatFields(),
    ...closingFields(),
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      { id: 'gcstrip0', type: 'row', blocks: [stackedStat('gcsize00', 'size'), stackedStat('gcac0000', 'ac'), stackedStat('gcspeed0', 'speed')] },
      runInStat('gcsenses', 'senses'),
      { id: 'gctraits', type: 'entries', field: 'traits' },
      { id: 'gcaction', type: 'entries', field: 'actions', heading: 'Actions', addLabel: 'Add action' },
    ],
  },
  sample: { name: 'Creature name' },
});

export const GENERIC_NPC: BuiltInTemplate = builtIn('builtin:generic-npc', 'NPC', 2, {
  fields: [
    nameField(),
    portraitField(),
    { key: 'type', label: 'Who', type: 'text', meaning: 'creature-type' },
    { key: 'appearance', label: 'Appearance', type: 'text' },
    { key: 'personality', label: 'Personality', type: 'text' },
    { key: 'wants', label: 'Wants', type: 'text' },
    ...combatFields(),
    ...closingFields(),
  ],
  ...hiddenParts('level'),
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      runInStat('gnappear', 'appearance'),
      runInStat('gnperson', 'personality'),
      runInStat('gnwants0', 'wants'),
      { id: 'gnstrip0', type: 'row', blocks: [stackedStat('gnac0000', 'ac'), stackedStat('gnspeed0', 'speed')] },
      runInStat('gnsenses', 'senses'),
      { id: 'gntraits', type: 'entries', field: 'traits' },
      { id: 'gnaction', type: 'entries', field: 'actions', heading: 'Actions', addLabel: 'Add action' },
    ],
  },
  sample: { name: 'Character name' },
});

export const GENERIC_HAZARD: BuiltInTemplate = builtIn('builtin:generic-hazard', 'Hazard', 2, {
  fields: [
    nameField(),
    portraitField(),
    { key: 'type', label: 'Kind', type: 'text', meaning: 'creature-type' },
    { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
    { key: 'difficulty', label: 'Difficulty', type: 'number' },
    { key: 'trigger', label: 'Trigger', type: 'text' },
    descriptionField(),
    { key: 'effects', label: 'Effects', type: 'entries', prompt: 'Add an effect' },
    { key: 'countermeasures', label: 'Countermeasures', type: 'text' },
  ],
  ...hiddenParts('hp'),
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      runInStat('ghdiffic', 'difficulty'),
      runInStat('ghtrigge', 'trigger'),
      { id: 'gheffect', type: 'entries', field: 'effects', heading: 'Effects', addLabel: 'Add effect' },
      runInStat('ghcounte', 'countermeasures'),
    ],
  },
  sample: { name: 'Hazard name' },
});
