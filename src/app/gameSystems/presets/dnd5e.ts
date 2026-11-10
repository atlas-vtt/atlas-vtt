import { D20_DICE_SET_ID } from '../builtInDiceSets';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { DND_5E_LIGHTS } from '../lightPresets/dnd5e';
import { HP_RESOURCE } from '../../resources/resourceDefinitions';
import { DEFAULT_ITEM_RARITIES } from '../itemRarities';
import { DND_5E_SENSES } from '../senses/dnd5e';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/** D&D 5th edition: 5-foot squares, every diagonal counts 5 feet, the 15 SRD conditions. */
export const DND_5E: SystemPreset = {
  id: builtInPresetId('dnd5e'),
  name: 'D&D 5e',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'metric',
      diagonalRule: 'equidistant',
      // Every foot moved in difficult terrain costs one more (2014 and 2024 rules)
      difficultTerrain: 'double',
      // A cone is as wide as it is long at every point: 2 × atan(1/2)
      coneAngle: 53.13,
      abstractRangeBands: [],
    },
    dice: { defaultRoll: '1d20', crit: 'natural' },
    diceSetId: D20_DICE_SET_ID,
    // The statblock's Initiative is added to the d20; Fantasy Statblocks' SRD creatures have none,
    // so their DEX, the second of their six scores, gives it instead.
    initiative: {
      mode: 'turn-order', roll: '1d20', firstSide: 'players',
      modifier: { field: 'initiative' }, modifierFallback: { field: 'stats.1', abilityScore: true },
    },
    conditions: conditionsOf('dnd5e', [
      { name: 'Blinded', color: '#475569', icon: 'blindfold', effect: 'blinded' },
      { name: 'Charmed', color: '#db2777', icon: 'heart' },
      { name: 'Deafened', color: '#0891b2', icon: 'hearing-disabled' },
      { name: 'Exhaustion', color: '#92400e', icon: 'tired-eye', valued: true },
      { name: 'Frightened', color: '#7c3aed', icon: 'terror' },
      { name: 'Grappled', color: '#ea580c', icon: 'grab' },
      { name: 'Incapacitated', color: '#b91c1c', icon: 'knockout' },
      { name: 'Invisible', color: '#c7d2fe', icon: 'invisible', effect: 'invisible' },
      { name: 'Paralyzed', color: '#38bdf8', icon: 'frozen-body' },
      { name: 'Petrified', color: '#78716c', icon: 'stoned-skull' },
      { name: 'Poisoned', color: '#16a34a', icon: 'poison' },
      { name: 'Prone', color: '#d97706', icon: 'foot-trip' },
      { name: 'Restrained', color: '#0d9488', icon: 'imprisoned' },
      { name: 'Stunned', color: '#facc15', icon: 'knocked-out-stars' },
      { name: 'Unconscious', color: '#1e3a8a', icon: 'sleepy' },
    ]),
    resources: [{ ...HP_RESOURCE }],
    senses: DND_5E_SENSES,
    lightPresets: DND_5E_LIGHTS,
    // 5e writes NPCs in the monster statblock format.
    statblockRoles: [
      { id: 'monster', name: 'Monster', templateId: 'builtin:5e-2024-monster' },
      { id: 'npc', name: 'NPC', templateId: 'builtin:5e-2024-monster' },
    ],
    // The classic ladder is 5e's own: Common to Legendary, and Artifact.
    itemRarities: DEFAULT_ITEM_RARITIES,
  },
};
