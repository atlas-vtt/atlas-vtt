import { POWER_ROLL_DICE_SET_ID } from '../builtInDiceSets';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { HP_RESOURCE } from '../../resources/resourceDefinitions';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/**
 * Draw Steel measures distance in squares, so a square is 1 unit and a Speed 5
 * move reads 5u; every diagonal counts 1. Conditions are the nine of the core
 * rules.
 */
export const DRAW_STEEL: SystemPreset = {
  id: builtInPresetId('drawsteel'),
  name: 'Draw Steel',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'units',
      unitDistance: 1,
      measurementMode: 'metric',
      diagonalRule: 'equidistant',
      // Each square of difficult terrain costs 1 more square of movement
      difficultTerrain: 'double',
      abstractRangeBands: [],
    },
    // A power roll is 2d10; a 19 or 20 on the two dice together, before any bonus, is a critical hit.
    dice: { defaultRoll: '2d10', crit: 'high-total' },
    diceSetId: POWER_ROLL_DICE_SET_ID,
    conditions: conditionsOf('drawsteel', [
      { name: 'Bleeding', color: '#b91c1c', icon: 'bleeding-wound' },
      { name: 'Dazed', color: '#facc15', icon: 'knocked-out-stars' },
      { name: 'Frightened', color: '#7c3aed', icon: 'terror' },
      { name: 'Grabbed', color: '#ea580c', icon: 'grab' },
      { name: 'Prone', color: '#d97706', icon: 'foot-trip' },
      { name: 'Restrained', color: '#0d9488', icon: 'imprisoned' },
      { name: 'Slowed', color: '#0284c7', icon: 'snail' },
      { name: 'Taunted', color: '#ec4899', icon: 'eye' },
      { name: 'Weakened', color: '#b45309', icon: 'arm-sling' },
    ]),
    // Stamina is the system's hit points and keeps their key, so tokens keep their values when a collection changes system.
    resources: [{ ...HP_RESOURCE, name: 'Stamina', field: 'stamina' }],
    statblockRoles: [{ id: 'monster', name: 'Monster', templateId: 'builtin:draw-steel-monster' }],
  },
};
