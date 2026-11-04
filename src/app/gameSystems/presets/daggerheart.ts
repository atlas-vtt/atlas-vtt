import { D20_DICE_SET_ID } from '../builtInDiceSets';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { HP_RESOURCE, STRESS_RESOURCE } from '../../resources/resourceDefinitions';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/**
 * Daggerheart measures in range bands. The SRD's optional grid conversion
 * (1-inch squares of about 5 feet): Melee 1 square, Very Close 3, Close 6,
 * Far 12, Very Far 13 or more.
 */
export const DAGGERHEART: SystemPreset = {
  id: builtInPresetId('daggerheart'),
  name: 'Daggerheart',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'abstract',
      diagonalRule: 'equidistant',
      abstractRangeBands: [
        { name: 'Melee', maxSquares: 1 },
        { name: 'Very Close', maxSquares: 3 },
        { name: 'Close', maxSquares: 6 },
        { name: 'Far', maxSquares: 12 },
        // The last band also names every longer distance.
        { name: 'Very Far', maxSquares: 13 },
      ],
    },
    // Adversary statblocks roll a d20; player characters' duality dice come with character sheets.
    dice: { defaultRoll: '1d20', crit: 'natural' },
    diceSetId: D20_DICE_SET_ID,
    conditions: conditionsOf('daggerheart', [
      { name: 'Hidden', color: '#475569', icon: 'hidden' },
      { name: 'Restrained', color: '#0d9488', icon: 'imprisoned' },
      { name: 'Vulnerable', color: '#dc2626', icon: 'cracked-shield' },
    ]),
    // Every Daggerheart character and adversary tracks Hit Points and Stress.
    resources: [{ ...HP_RESOURCE }, { ...STRESS_RESOURCE }],
    statblockRoles: [
      { id: 'adversary', name: 'Adversary', templateId: 'builtin:generic-creature' },
      { id: 'environment', name: 'Environment', templateId: 'builtin:generic-hazard' },
    ],
    itemRarities: [
      { name: 'Common', tone: 'common' },
      { name: 'Uncommon', tone: 'uncommon' },
      { name: 'Rare', tone: 'rare' },
      { name: 'Legendary', tone: 'legendary' },
    ],
  },
};
