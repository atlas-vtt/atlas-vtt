// SPDX-License-Identifier: AGPL-3.0-only AND CC-BY-4.0

/**
 * The 5E monster of the 2014 rules (SRD 5.1). It has the 2024 template's keys
 * but initiative and gear; the abilities are a row with one modifier each,
 * saving throws and the two immunities stand on lines of their own, and the
 * challenge shows XP only.
 */

import { D20_DICE_SET_ID } from '../../gameSystems/builtInDiceSets';
import type { BuiltInTemplate } from '../model/templateTypes';
import { SRD_5_1_SOURCE } from './attributions';
import { experienceTable } from './fiveEChallenge';
import { builtIn, centredColumns, hiddenParts, nameField, portraitField, runInStat, sizeField } from './presetParts';

export const FIVE_E_2014_MONSTER: BuiltInTemplate = builtIn('builtin:5e-2014-monster', '5E (2014 rules)', 6, {
  // A bonus without dice rolls with the system's dice set, whatever the collection rolls (revision 6).
  diceSetId: D20_DICE_SET_ID,
  source: SRD_5_1_SOURCE,
  fields: [
    nameField(),
    portraitField(),
    sizeField(),
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    { key: 'subtype', label: 'Subtype', type: 'text' },
    { key: 'alignment', label: 'Alignment', type: 'text' },
    { key: 'ac', label: 'Armor Class', type: 'number', meaning: 'armor' },
    { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
    { key: 'hit_dice', label: 'Hit Dice', type: 'dice' },
    { key: 'speed', label: 'Speed', type: 'text' },
    {
      key: 'stats', label: 'Abilities', type: 'scores', addRows: false, addColumns: false, slots: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], align: centredColumns(6),
      slotKeys: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
    },
    { key: 'saves', label: 'Saving Throws', type: 'pairs' },
    { key: 'skillsaves', label: 'Skills', type: 'pairs' },
    { key: 'damage_vulnerabilities', label: 'Damage Vulnerabilities', type: 'text' },
    { key: 'damage_resistances', label: 'Damage Resistances', type: 'text' },
    { key: 'damage_immunities', label: 'Damage Immunities', type: 'text' },
    { key: 'condition_immunities', label: 'Condition Immunities', type: 'text' },
    { key: 'senses', label: 'Senses', type: 'text', meaning: 'senses' },
    { key: 'languages', label: 'Languages', type: 'text' },
    { key: 'cr', label: 'Challenge', type: 'rating', meaning: 'rating' },
    { key: 'traits', label: 'Traits', type: 'entries' },
    { key: 'actions', label: 'Actions', type: 'entries' },
    { key: 'bonus_actions', label: 'Bonus Actions', type: 'entries' },
    { key: 'reactions', label: 'Reactions', type: 'entries' },
    { key: 'legendary_description', label: 'Legendary Actions intro', type: 'markdown' },
    { key: 'legendary_actions', label: 'Legendary Actions', type: 'entries' },
    { key: 'spells', label: 'Spells', type: 'spells' },
  ],
  // A stat block of these rules has no description; the challenge is the level, its XP a line below.
  ...hiddenParts('description'),
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      { id: 'e4line00', type: 'line', fields: ['size', 'subtype', 'alignment'], pattern: '{size}[ ({subtype})][, {alignment}]' },
      { id: 'e4divid0', type: 'divider' },
      runInStat('e4ac0000', 'ac'),
      runInStat('e4speed0', 'speed'),
      { id: 'e4divid1', type: 'divider' },
      {
        id: 'e4stats0', type: 'scores', field: 'stats', orientation: 'row',
        columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)', display: 'signed' }],
      },
      { id: 'e4divid2', type: 'divider' },
      { id: 'e4saves0', type: 'pairs', field: 'saves', label: 'Saving Throws', display: 'signed' },
      { id: 'e4skill0', type: 'pairs', field: 'skillsaves', label: 'Skills', display: 'signed' },
      runInStat('e4vuln00', 'damage_vulnerabilities'),
      runInStat('e4resi00', 'damage_resistances'),
      runInStat('e4immu00', 'damage_immunities'),
      runInStat('e4cond00', 'condition_immunities'),
      runInStat('e4sense0', 'senses'),
      { id: 'e4lang00', type: 'stat', field: 'languages', look: 'run-in', whenEmpty: 'fallback', fallback: '—' },
      { id: 'e4cr0000', type: 'stat', field: 'cr', label: 'XP', look: 'run-in', pattern: '{cr|lookup:xp}' },
      { id: 'e4divid3', type: 'divider' },
      { id: 'e4trait0', type: 'entries', field: 'traits' },
      // Hidden while empty: a statblock gains spells without its template changing (revision 2).
      { id: 'e4spell0', type: 'spells', field: 'spells', heading: 'Spellcasting' },
      { id: 'e4actio0', type: 'entries', field: 'actions', heading: 'Actions', addLabel: 'Add action' },
      { id: 'e4bonus0', type: 'entries', field: 'bonus_actions', heading: 'Bonus Actions' },
      { id: 'e4react0', type: 'entries', field: 'reactions', heading: 'Reactions' },
      {
        id: 'e4legen0', type: 'entries', field: 'legendary_actions', heading: 'Legendary Actions',
        introField: 'legendary_description',
      },
    ],
  },
  lookups: { xp: experienceTable() },
  sample: { name: 'Creature name', ac: 13, hp: 22, stats: [14, 12, 13, 10, 11, 8] },
});
