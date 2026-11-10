// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A creature of the percentile (d100) family in Atlas' own form: eight
 * characteristics, hit and magic points, damage bonus, build, armor, attacks,
 * skills and sanity loss. No system's name or text.
 */

import { PERCENTILE_DICE_SET_ID } from '../../gameSystems/builtInDiceSets';
import type { BuiltInTemplate } from '../model/templateTypes';
import { builtIn, centredColumns, descriptionField, hiddenParts, nameField, portraitField, runInStat, stackedStat } from './presetParts';

export const PERCENTILE_CREATURE: BuiltInTemplate = builtIn('builtin:percentile-creature', 'Percentile creature', 5, {
  // A bonus without dice rolls with the system's dice set, whatever the collection rolls (revision 5).
  diceSetId: PERCENTILE_DICE_SET_ID,
  fields: [
    nameField(),
    portraitField(),
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    {
      key: 'stats', label: 'Characteristics', type: 'scores', addRows: false, addColumns: false, slots: ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU'], align: centredColumns(8),
    },
    { key: 'hp', label: 'HP', type: 'number', meaning: 'hit-points' },
    { key: 'mp', label: 'MP', type: 'number' },
    { key: 'move', label: 'Move', type: 'text' },
    { key: 'build', label: 'Build', type: 'number' },
    { key: 'damage_bonus', label: 'Damage Bonus', type: 'text' },
    { key: 'armor', label: 'Armor', type: 'text', meaning: 'armor' },
    {
      key: 'attacks', label: 'Attacks', type: 'entries', prompt: 'Add an attack',
      entry: { extras: [{ key: 'chance', label: 'Chance', type: 'text' }, { key: 'damage', label: 'Damage', type: 'text' }] },
    },
    { key: 'skills', label: 'Skills', type: 'pairs' },
    { key: 'sanity_loss', label: 'Sanity Loss', type: 'text' },
    { key: 'traits', label: 'Special Abilities', type: 'entries' },
    descriptionField(),
  ],
  ...hiddenParts('level'),
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      { id: 'pcstats0', type: 'scores', field: 'stats', orientation: 'row' },
      {
        id: 'pcstrip0', type: 'row', blocks: [
          stackedStat('pcmp0000', 'mp'), stackedStat('pcmove00', 'move'), stackedStat('pcbuild0', 'build'),
        ],
      },
      runInStat('pcdamage', 'damage_bonus'),
      runInStat('pcarmor0', 'armor'),
      runInStat('pcsanity', 'sanity_loss'),
      { id: 'pcattack', type: 'entries', field: 'attacks', heading: 'Attacks', addLabel: 'Add attack' },
      { id: 'pcskill0', type: 'pairs', field: 'skills', label: 'Skills' },
      { id: 'pctraits', type: 'entries', field: 'traits', heading: 'Special Abilities', addLabel: 'Add ability' },
    ],
  },
  sample: { name: 'Creature name' },
});
