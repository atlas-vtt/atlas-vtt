// SPDX-License-Identifier: CC-BY-SA-4.0 OR GPL-3.0-only

/**
 * The Cairn creature. Keys follow the Cairn collection's notes: `title` keeps
 * the display name those notes hold beside a bestiary name ("Bandit (Cairn)"),
 * which the header shows, and `stats` holds STR, DEX and WIL in that order, so
 * the Cairn system preset's STR resource (`stats.0`) reads it.
 */

import { D20_ROLL_UNDER_DICE_SET_ID } from '../../gameSystems/builtInDiceSets';
import type { BuiltInTemplate } from '../model/templateTypes';
import { CAIRN_SOURCE } from './attributions';
import { builtIn, centredColumns, descriptionField, hiddenParts, nameField, portraitField, runInStat, stackedStat } from './presetParts';

export const CAIRN_CREATURE: BuiltInTemplate = builtIn('builtin:cairn-creature', 'Cairn', 5, {
  // A bonus without dice rolls with the system's dice set, whatever the collection rolls (revision 5).
  diceSetId: D20_ROLL_UNDER_DICE_SET_ID,
  source: CAIRN_SOURCE,
  fields: [
    nameField(),
    { key: 'title', label: 'Display Name', type: 'text' },
    portraitField(),
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    { key: 'hp', label: 'HP', type: 'number', meaning: 'hit-points' },
    { key: 'armor', label: 'Armor', type: 'number', meaning: 'armor' },
    { key: 'stats', label: 'Attributes', type: 'scores', slots: ['STR', 'DEX', 'WIL'], addRows: false, addColumns: false, align: centredColumns(3) },
    { key: 'attacks', label: 'Attacks', type: 'text' },
    descriptionField(),
    { key: 'abilities', label: 'Abilities', type: 'entries' },
    { key: 'critical_damage', label: 'Critical Damage', type: 'text' },
  ],
  // Cairn rates no creature by level.
  ...hiddenParts('level'),
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      stackedStat('caarmor0', 'armor'),
      { id: 'castats0', type: 'scores', field: 'stats', orientation: 'row' },
      runInStat('caattack', 'attacks'),
      { id: 'caabilit', type: 'entries', field: 'abilities', addLabel: 'Add ability' },
      runInStat('cacritic', 'critical_damage'),
    ],
  },
  sample: { name: 'Creature name', title: 'Creature name' },
});
