import { D20_ROLL_UNDER_DICE_SET_ID } from '../builtInDiceSets';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { CAIRN_LIGHTS } from '../lightPresets/cairn';
import { HP_RESOURCE } from '../../resources/resourceDefinitions';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/**
 * Cairn 2e: a character moves up to 40ft and takes one action per turn, with
 * no grid rule of its own, so the squares assume 5 feet (8 squares a turn) and
 * every diagonal counts 1. Conditions are the states its core rules name:
 * Deprived and Fatigue (valued, one per slot it fills), Critical Damage (a
 * failed STR save leaves a character crawling until stabilised), DEX 0
 * paralyses, WIL 0 makes delirious, and failed morale saves send foes fleeing.
 */
export const CAIRN: SystemPreset = {
  id: builtInPresetId('cairn'),
  name: 'Cairn',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'metric',
      diagonalRule: 'equidistant',
      abstractRangeBands: [],
    },
    // Saves roll under an attribute on a d20: a 1 always succeeds, a 20 always fails.
    dice: { defaultRoll: '1d20', crit: 'roll-under' },
    diceSetId: D20_ROLL_UNDER_DICE_SET_ID,
    // Side initiative: each round the PCs act, then their opponents; nothing is rolled for the order.
    initiative: { mode: 'sides', roll: '1d20', firstSide: 'players' },
    conditions: conditionsOf('cairn', [
      { name: 'Deprived', color: '#b45309', icon: 'rations' },
      { name: 'Fatigue', color: '#78716c', icon: 'weight', valued: true },
      { name: 'Critical Damage', color: '#991b1b', icon: 'bleeding-wound' },
      { name: 'Paralyzed', color: '#38bdf8', icon: 'frozen-body' },
      { name: 'Delirious', color: '#7c3aed', icon: 'spiral-bloom' },
      { name: 'Fleeing', color: '#f59e0b', icon: 'run' },
    ]),
    resources: [
      // Hit Protection is only the ability to avoid damage: at 0 a character still stands.
      { ...HP_RESOURCE, defeatedWhenSpent: false },
      // Damage past 0 HP comes off STR, and STR 0 is death. The Cairn layout keeps it first in `stats`.
      { key: 'str', name: 'STR', field: 'stats.0', direction: 'drains', color: '#dc2626', defeatedWhenSpent: true, visibleToPlayers: false },
    ],
    lightPresets: CAIRN_LIGHTS,
    statblockRoles: [{ id: 'creature', name: 'Creature', templateId: 'builtin:cairn-creature' }],
  },
};
