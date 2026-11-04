import { D20_DICE_SET_ID } from '../builtInDiceSets';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { SHADOWDARK_LIGHTS } from '../lightPresets/shadowdark';
import type { TimerWidget } from '../../types/widgetTypes';
import { HP_RESOURCE } from '../../resources/resourceDefinitions';
import { SHADOWDARK_SENSES } from '../senses/shadowdark';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/** Torches (and lanterns and the Light spell) burn for one hour of real time. */
const SHADOWDARK_TORCH: TimerWidget = {
  id: 'shadowdark-torch',
  type: 'timer',
  label: 'Torch',
  icon: 'torch',
  visible: true,
  visibleToPlayers: true,
  value: 60 * 60,
  duration: 60 * 60,
  direction: 'down',
  order: 0,
  scope: 'collection',
};

/**
 * Shadowdark measures loosely: close is 5 feet, near up to 30 feet, far within
 * sight. The rules give no grid conversion, so the squares assume 5-foot squares;
 * double near (the MV of fast monsters, a lantern's light) is 60 feet.
 * Conditions are the ones the rules name as states: dying (valued, for the
 * rounds left on its death timer),
 * the Conditions rule's blindness and immobility, spells and hiding.
 */
export const SHADOWDARK: SystemPreset = {
  id: builtInPresetId('shadowdark'),
  name: 'Shadowdark',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'abstract',
      diagonalRule: 'equidistant',
      abstractRangeBands: [
        { name: 'Close', maxSquares: 1 },
        { name: 'Near', maxSquares: 6 },
        { name: 'Double Near', maxSquares: 12 },
        // The last band also names every longer distance.
        { name: 'Far', maxSquares: 13 },
      ],
    },
    dice: { defaultRoll: '1d20', crit: 'natural' },
    diceSetId: D20_DICE_SET_ID,
    conditions: conditionsOf('shadowdark', [
      { name: 'Dying', color: '#991b1b', icon: 'skull', valued: true },
      { name: 'Unconscious', color: '#1e3a8a', icon: 'sleepy' },
      { name: 'Blinded', color: '#475569', icon: 'blindfold', effect: 'blinded' },
      { name: 'Deafened', color: '#0891b2', icon: 'hearing-disabled' },
      { name: 'Paralyzed', color: '#38bdf8', icon: 'frozen-body' },
      { name: 'Immobilized', color: '#0d9488', icon: 'spider-web' },
      { name: 'Invisible', color: '#c7d2fe', icon: 'invisible', effect: 'invisible' },
      { name: 'Hidden', color: '#64748b', icon: 'hidden' },
      { name: 'Surprised', color: '#f59e0b', icon: 'surprised' },
      { name: 'Focus', color: '#7c3aed', icon: 'meditation' },
    ]),
    senses: SHADOWDARK_SENSES,
    lightPresets: SHADOWDARK_LIGHTS,
    widgets: [SHADOWDARK_TORCH],
    resources: [{ ...HP_RESOURCE }],
    statblockRoles: [{ id: 'monster', name: 'Monster', templateId: 'builtin:bx-creature' }],
  },
};
