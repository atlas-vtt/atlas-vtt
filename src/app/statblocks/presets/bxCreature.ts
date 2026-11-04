// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A creature of the classic basic/expert style in Atlas' own form: armor
 * class, hit dice, attacks, movement, saves, morale, alignment, experience,
 * number appearing and treasure. The fields are the era's common mechanics;
 * no publisher's name or text.
 */

import type { BuiltInTemplate } from '../model/templateTypes';
import { builtIn, descriptionField, hiddenParts, nameField, portraitField, runInStat } from './presetParts';

export const BX_CREATURE: BuiltInTemplate = builtIn('builtin:bx-creature', 'B/X-style creature', 2, {
  fields: [
    nameField(),
    portraitField(),
    descriptionField(),
    // Text, so both armor scales fit: "7 [12]".
    { key: 'ac', label: 'Armor Class', type: 'text', meaning: 'armor' },
    // A rating, as hit dice read: "3+1*".
    { key: 'hit_dice', label: 'Hit Dice', type: 'rating', meaning: 'rating' },
    { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
    { key: 'movement', label: 'Movement', type: 'text' },
    { key: 'attacks', label: 'Attacks', type: 'text' },
    { key: 'saves', label: 'Saves', type: 'text' },
    { key: 'morale', label: 'Morale', type: 'number' },
    { key: 'alignment', label: 'Alignment', type: 'text' },
    { key: 'xp', label: 'XP', type: 'number' },
    { key: 'number_appearing', label: 'Number Appearing', type: 'text' },
    { key: 'treasure', label: 'Treasure', type: 'text' },
    { key: 'traits', label: 'Special Abilities', type: 'entries' },
  ],
  // The era's creatures name no type: hit dice are the level.
  ...hiddenParts('type'),
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      {
        id: 'bxstrip0', type: 'row', blocks: [
          { id: 'bxac0000', type: 'stat', field: 'ac', label: 'AC', look: 'stacked' },
          { id: 'bxmove00', type: 'stat', field: 'movement', label: 'MV', look: 'stacked' },
        ],
      },
      runInStat('bxattack', 'attacks'),
      runInStat('bxsaves0', 'saves'),
      runInStat('bxmoral0', 'morale'),
      runInStat('bxalign0', 'alignment'),
      runInStat('bxxp0000', 'xp'),
      runInStat('bxappear', 'number_appearing'),
      runInStat('bxtreasu', 'treasure'),
      { id: 'bxtraits', type: 'entries', field: 'traits', heading: 'Special Abilities', addLabel: 'Add ability' },
    ],
  },
  sample: { name: 'Creature name' },
});
