// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A creature of the d20 family in Atlas' own form: armor, hit points, six
 * abilities with their modifiers, saves, skills, attacks and special
 * abilities, rated by level. No system's name or text.
 */

import type { BuiltInTemplate } from '../model/templateTypes';
import { builtIn, centredColumns, nameField, portraitField, sizeField } from './presetParts';

const MODIFIER = 'floor((value - 10) / 2)';

export const D20_CREATURE: BuiltInTemplate = builtIn('builtin:d20-creature', 'd20 creature', 4, {
  fields: [
    nameField(),
    portraitField(),
    sizeField(),
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    { key: 'alignment', label: 'Alignment', type: 'text' },
    { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
    { key: 'ac', label: 'AC', type: 'number', meaning: 'armor' },
    { key: 'hp', label: 'HP', type: 'number', meaning: 'hit-points' },
    { key: 'hit_dice', label: 'Hit Dice', type: 'dice' },
    { key: 'initiative', label: 'Initiative', type: 'number', meaning: 'initiative' },
    { key: 'speed', label: 'Speed', type: 'text' },
    {
      key: 'stats', label: 'Abilities', type: 'scores', addRows: false, addColumns: false, slots: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], align: centredColumns(6),
      slotKeys: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
    },
    { key: 'saves', label: 'Saves', type: 'pairs' },
    { key: 'skillsaves', label: 'Skills', type: 'pairs' },
    { key: 'senses', label: 'Senses', type: 'text', meaning: 'senses' },
    { key: 'languages', label: 'Languages', type: 'text' },
    {
      key: 'attacks', label: 'Attacks', type: 'entries', prompt: 'Add an attack',
      entry: { extras: [{ key: 'bonus', label: 'Bonus', type: 'text' }, { key: 'damage', label: 'Damage', type: 'text' }] },
    },
    { key: 'traits', label: 'Special Abilities', type: 'entries' },
    { key: 'description', label: 'Description', type: 'markdown' },
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      { id: 'dtline00', type: 'line', fields: ['size', 'alignment'], pattern: '{size}[, {alignment}]' },
      { id: 'dtdivid0', type: 'divider' },
      {
        id: 'dtstrip0', type: 'row', blocks: [
          { id: 'dtac0000', type: 'stat', field: 'ac', look: 'stacked' },
          { id: 'dtspeed0', type: 'stat', field: 'speed', look: 'stacked' },
          {
            id: 'dtinit00', type: 'stat', field: 'initiative', look: 'stacked', display: 'signed',
            whenEmpty: 'fallback', fallback: '{=floor((stats.1 - 10) / 2)|signed}',
          },
        ],
      },
      {
        id: 'dtstats0', type: 'scores', field: 'stats', orientation: 'row',
        columns: [{ label: 'Mod', formula: MODIFIER, display: 'signed' }],
      },
      { id: 'dtsaves0', type: 'pairs', field: 'saves', label: 'Saves', display: 'signed' },
      { id: 'dtskill0', type: 'pairs', field: 'skillsaves', label: 'Skills', display: 'signed' },
      { id: 'dtsenses', type: 'stat', field: 'senses', look: 'run-in' },
      { id: 'dtlangs0', type: 'stat', field: 'languages', look: 'run-in' },
      { id: 'dtdivid1', type: 'divider' },
      { id: 'dtattack', type: 'entries', field: 'attacks', heading: 'Attacks', addLabel: 'Add attack' },
      { id: 'dttraits', type: 'entries', field: 'traits', heading: 'Special Abilities', addLabel: 'Add ability' },
    ],
  },
  sample: { name: 'Creature name' },
});
