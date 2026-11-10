// SPDX-License-Identifier: AGPL-3.0-only AND CC-BY-4.0

/**
 * The 5E monster of the 2024 rules (SRD 5.2.1), the default of every 5E
 * collection. Keys follow the Basic 5e layout of Fantasy Statblocks and the
 * SRD notes made with it (`saves: [{ intelligence: 5 }]`), so those notes
 * render without migration.
 */

import { D20_DICE_SET_ID } from '../../gameSystems/builtInDiceSets';
import type { BuiltInTemplate } from '../model/templateTypes';
import { SRD_5_2_1_SOURCE } from './attributions';
import { experienceTable, proficiencyTable } from './fiveEChallenge';
import { builtIn, hiddenParts, nameField, portraitField, runInStat, sizeField } from './presetParts';

const MODIFIER = 'floor((value - 10) / 2)';
const DEXTERITY_MODIFIER = 'floor((stats.1 - 10) / 2)';

export const FIVE_E_2024_MONSTER: BuiltInTemplate = builtIn('builtin:5e-2024-monster', '5E (2024 rules)', 5, {
  // A bonus without dice rolls with the system's dice set, whatever the collection rolls (revision 5).
  diceSetId: D20_DICE_SET_ID,
  source: SRD_5_2_1_SOURCE,
  fields: [
    nameField(),
    portraitField(),
    sizeField(),
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    { key: 'subtype', label: 'Subtype', type: 'text' },
    { key: 'alignment', label: 'Alignment', type: 'text' },
    { key: 'ac', label: 'AC', type: 'number', meaning: 'armor' },
    { key: 'initiative', label: 'Initiative', type: 'number', meaning: 'initiative' },
    { key: 'hp', label: 'HP', type: 'number', meaning: 'hit-points' },
    { key: 'hit_dice', label: 'Hit Dice', type: 'dice' },
    { key: 'speed', label: 'Speed', type: 'text' },
    {
      key: 'stats', label: 'Abilities', type: 'scores', addRows: false, addColumns: false, slots: ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'],
      slotKeys: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
    },
    { key: 'saves', label: 'Saving Throws', type: 'pairs' },
    { key: 'skillsaves', label: 'Skills', type: 'pairs' },
    { key: 'damage_vulnerabilities', label: 'Vulnerabilities', type: 'text' },
    { key: 'damage_resistances', label: 'Resistances', type: 'text' },
    { key: 'damage_immunities', label: 'Damage Immunities', type: 'text' },
    { key: 'condition_immunities', label: 'Condition Immunities', type: 'text' },
    { key: 'gear', label: 'Gear', type: 'text' },
    { key: 'senses', label: 'Senses', type: 'text', meaning: 'senses' },
    { key: 'languages', label: 'Languages', type: 'text' },
    { key: 'cr', label: 'CR', type: 'rating', meaning: 'rating' },
    { key: 'traits', label: 'Traits', type: 'entries' },
    { key: 'actions', label: 'Actions', type: 'entries' },
    { key: 'bonus_actions', label: 'Bonus Actions', type: 'entries' },
    { key: 'reactions', label: 'Reactions', type: 'entries' },
    { key: 'legendary_description', label: 'Legendary Actions intro', type: 'markdown' },
    { key: 'legendary_actions', label: 'Legendary Actions', type: 'entries' },
    { key: 'spells', label: 'Spells', type: 'spells' },
  ],
  // A stat block of these rules has no description; the challenge rating is the level, its XP and PB a line below.
  ...hiddenParts('description'),
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      { id: 'b5line00', type: 'line', fields: ['size', 'subtype', 'alignment'], pattern: '{size}[ ({subtype})][, {alignment}]' },
      { id: 'b5divid0', type: 'divider' },
      {
        id: 'b5row001', type: 'row', align: 'start', blocks: [
          runInStat('b5ac0000', 'ac'),
          {
            id: 'b5init00', type: 'stat', field: 'initiative', look: 'run-in', pattern: '{initiative|signed} ({=initiative + 10})',
            whenEmpty: 'fallback', fallback: `{=${DEXTERITY_MODIFIER}|signed} ({=${DEXTERITY_MODIFIER} + 10})`,
          },
        ],
      },
      runInStat('b5speed0', 'speed'),
      {
        id: 'b5stats0', type: 'scores', field: 'stats', orientation: 'table', perLine: 3, columns: [
          { label: 'Mod', formula: MODIFIER, display: 'signed' },
          { label: 'Save', field: 'saves', formula: MODIFIER, display: 'signed' },
        ],
      },
      { id: 'b5skill0', type: 'pairs', field: 'skillsaves', label: 'Skills', display: 'signed' },
      { id: 'b5vuln00', type: 'stat', field: 'damage_vulnerabilities', label: 'Vulnerabilities', look: 'run-in' },
      { id: 'b5resi00', type: 'stat', field: 'damage_resistances', label: 'Resistances', look: 'run-in' },
      {
        id: 'b5immu00', type: 'stat', field: 'damage_immunities', label: 'Immunities', look: 'run-in',
        pattern: '{damage_immunities, condition_immunities|join:; }',
      },
      runInStat('b5gear00', 'gear'),
      runInStat('b5sense0', 'senses'),
      { id: 'b5lang00', type: 'stat', field: 'languages', look: 'run-in', whenEmpty: 'fallback', fallback: 'None' },
      { id: 'b5cr0000', type: 'stat', field: 'cr', label: 'XP', look: 'run-in', pattern: '{cr|lookup:xp}[; PB {cr|lookup:pb}]' },
      { id: 'b5trait0', type: 'entries', field: 'traits', heading: 'Traits' },
      { id: 'b5actio0', type: 'entries', field: 'actions', heading: 'Actions', addLabel: 'Add action' },
      // Hidden while empty: a statblock gains spells without its template changing (revision 2).
      { id: 'b5spell0', type: 'spells', field: 'spells', heading: 'Spellcasting' },
      { id: 'b5bonus0', type: 'entries', field: 'bonus_actions', heading: 'Bonus Actions' },
      { id: 'b5react0', type: 'entries', field: 'reactions', heading: 'Reactions' },
      {
        id: 'b5legen0', type: 'entries', field: 'legendary_actions', heading: 'Legendary Actions',
        introField: 'legendary_description',
      },
    ],
  },
  lookups: { xp: experienceTable(), pb: proficiencyTable() },
  sample: { name: 'Creature name', ac: 13, hp: 22, stats: [14, 12, 13, 10, 11, 8] },
});
