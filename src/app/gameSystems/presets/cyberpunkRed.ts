import { EXPLODING_D10_DICE_SET_ID } from '../builtInDiceSets';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { HP_RESOURCE } from '../../resources/resourceDefinitions';
import { CYBERPUNK_RED_SENSES } from '../senses/cyberpunkRed';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/**
 * Cyberpunk RED: a square is 2 m/yds and a diagonal step costs one square.
 * Weapon range brackets change their DV per weapon, so the ruler shows metres.
 * Conditions are the rules' named states that last during play: the wound
 * states, Unconscious, Prone, Grappled, On Fire, Critical Injury, and the
 * Damaged Eye and Damaged Ear injuries flashbangs and teargas cause.
 */
export const CYBERPUNK_RED: SystemPreset = {
  id: builtInPresetId('cyberpunkred'),
  name: 'Cyberpunk RED',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'meters',
      unitDistance: 2,
      measurementMode: 'metric',
      diagonalRule: 'equidistant',
      abstractRangeBands: [],
    },
    // A 10 rolls one more d10 and adds it, a 1 rolls one more and subtracts it; neither goes on.
    dice: { defaultRoll: '1d10', crit: 'natural', explode: { dice: 'default', repeats: false, highFaces: 1, lowFaces: 1 } },
    diceSetId: EXPLODING_D10_DICE_SET_ID,
    // Initiative is REF + 1d10, highest first.
    initiative: { mode: 'turn-order', roll: '1d10', firstSide: 'players' },
    conditions: conditionsOf('cyberpunkred', [
      { name: 'Seriously Wounded', color: '#dc2626', icon: 'bleeding-wound' },
      { name: 'Mortally Wounded', color: '#7f1d1d', icon: 'heartbeat' },
      { name: 'Unconscious', color: '#1e3a8a', icon: 'sleepy' },
      { name: 'Prone', color: '#d97706', icon: 'foot-trip' },
      { name: 'Grappled', color: '#ea580c', icon: 'grab' },
      { name: 'On Fire', color: '#f97316', icon: 'flame' },
      { name: 'Critical Injury', color: '#be123c', icon: 'broken-bone' },
      { name: 'Damaged Eye', color: '#475569', icon: 'bleeding-eye' },
      { name: 'Damaged Ear', color: '#0891b2', icon: 'hearing-disabled' },
    ]),
    resources: [{ ...HP_RESOURCE }],
    senses: CYBERPUNK_RED_SENSES,
    statblockRoles: [{ id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' }],
  },
};
