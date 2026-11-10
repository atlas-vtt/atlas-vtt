// SPDX-License-Identifier: AGPL-3.0-only AND LicenseRef-DRAW-STEEL-Creator-License

/**
 * The Draw Steel monster. `stamina` is what the Draw Steel system preset's
 * Stamina resource reads, and the five characteristics are one signed score
 * row. An ability's cost, keywords, kind, distance, target and power roll
 * results are parts of its entry.
 */

import { POWER_ROLL_DICE_SET_ID } from '../../gameSystems/builtInDiceSets';
import type { BuiltInTemplate } from '../model/templateTypes';
import { DRAW_STEEL_SOURCE } from './attributions';
import { builtIn, centredColumns, hiddenParts, nameField, portraitField, runInStat, stackedStat } from './presetParts';

export const DRAW_STEEL_MONSTER: BuiltInTemplate = builtIn('builtin:draw-steel-monster', 'Draw Steel', 5, {
  // A bonus without dice rolls with the system's dice set, whatever the collection rolls (revision 5).
  diceSetId: POWER_ROLL_DICE_SET_ID,
  source: DRAW_STEEL_SOURCE,
  fields: [
    nameField(),
    portraitField(),
    { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
    {
      key: 'organization', label: 'Organization', type: 'choice', open: true,
      options: ['Minion', 'Horde', 'Platoon', 'Elite', 'Leader', 'Solo'],
    },
    {
      key: 'role', label: 'Role', type: 'choice', open: true,
      options: ['Ambusher', 'Artillery', 'Brute', 'Controller', 'Defender', 'Harrier', 'Hexer', 'Mount', 'Support'],
    },
    { key: 'keywords', label: 'Keywords', type: 'list', meaning: 'traits' },
    { key: 'ev', label: 'EV', type: 'text' },
    { key: 'stamina', label: 'Stamina', type: 'number', meaning: 'hit-points' },
    { key: 'speed', label: 'Speed', type: 'text' },
    { key: 'size', label: 'Size', type: 'text', meaning: 'size' },
    { key: 'stability', label: 'Stability', type: 'number' },
    { key: 'free_strike', label: 'Free Strike', type: 'number' },
    { key: 'immunities', label: 'Immunity', type: 'text' },
    { key: 'weaknesses', label: 'Weakness', type: 'text' },
    { key: 'with_captain', label: 'With Captain', type: 'text' },
    {
      key: 'characteristics', label: 'Characteristics', type: 'scores', addRows: false, addColumns: false,
      slots: ['Might', 'Agility', 'Reason', 'Intuition', 'Presence'], align: centredColumns(5),
    },
    { key: 'traits', label: 'Traits', type: 'entries' },
    {
      key: 'abilities', label: 'Abilities', type: 'entries', prompt: 'Add an ability',
      entry: {
        extras: [
          { key: 'cost', label: 'Cost', type: 'text' },
          { key: 'keywords', label: 'Keywords', type: 'list' },
          { key: 'type', label: 'Type', type: 'text' },
          { key: 'distance', label: 'Distance', type: 'text' },
          { key: 'target', label: 'Target', type: 'text' },
          { key: 'tier1', label: '≤11', type: 'text' },
          { key: 'tier2', label: '12–16', type: 'text' },
          { key: 'tier3', label: '17+', type: 'text' },
        ],
      },
    },
    { key: 'villain_actions', label: 'Villain Actions', type: 'entries' },
  ],
  // A monster is named by its organization and role, not a type; its stat block has no description.
  ...hiddenParts('type', 'description'),
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      { id: 'dsline00', type: 'line', fields: ['organization', 'role'], pattern: '[{organization}][ {role}]' },
      { id: 'dskeywor', type: 'tags', field: 'keywords', look: 'comma' },
      {
        id: 'dsstrip0', type: 'row', blocks: [
          stackedStat('dsev0000', 'ev'),
          stackedStat('dsspeed0', 'speed'),
          stackedStat('dssize00', 'size'),
          stackedStat('dsstabil', 'stability'),
          stackedStat('dsfree00', 'free_strike'),
        ],
      },
      runInStat('dsimmune', 'immunities'),
      runInStat('dsweakne', 'weaknesses'),
      runInStat('dscaptai', 'with_captain'),
      { id: 'dschars0', type: 'scores', field: 'characteristics', orientation: 'row', display: 'signed' },
      { id: 'dstraits', type: 'entries', field: 'traits' },
      { id: 'dsabilit', type: 'entries', field: 'abilities', heading: 'Abilities', addLabel: 'Add ability' },
      { id: 'dsvillai', type: 'entries', field: 'villain_actions', heading: 'Villain Actions', addLabel: 'Add villain action' },
    ],
  },
  sample: { name: 'Creature name', characteristics: [0, 0, 0, 0, 0] },
});
