import { D20_DICE_SET_ID } from '../builtInDiceSets';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { PATHFINDER_2E_LIGHTS } from '../lightPresets/pathfinder2e';
import { HP_RESOURCE } from '../../resources/resourceDefinitions';
import { PATHFINDER_2E_SENSES } from '../senses/pathfinder2e';
import { builtInPresetId, conditionsOf } from './presetHelpers';

/**
 * Pathfinder Second Edition (Remaster, Player Core): 5-foot squares, and
 * diagonals alternate 5 and 10 feet. The conditions are Player Core's list
 * without the five attitudes (social, not combat states), Observed (the
 * default state) and Broken (objects only). The eleven conditions with a
 * value (Frightened 2, Dying 1…) are valued.
 */
export const PATHFINDER_2E: SystemPreset = {
  id: builtInPresetId('pathfinder2e'),
  name: 'Pathfinder 2e',
  builtIn: true,
  rules: {
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'metric',
      diagonalRule: 'alternating',
      // Each square of difficult terrain costs 5 more feet; greater difficult terrain (10 more) is not modelled
      difficultTerrain: 'double',
      abstractRangeBands: [],
    },
    dice: { defaultRoll: '1d20', crit: 'natural' },
    diceSetId: D20_DICE_SET_ID,
    // Its statblock template's Initiative field is added to the d20.
    initiative: { mode: 'turn-order', roll: '1d20', firstSide: 'players', modifier: { field: 'initiative' } },
    conditions: conditionsOf('pathfinder2e', [
      { name: 'Blinded', color: '#475569', icon: 'blindfold', effect: 'blinded' },
      { name: 'Clumsy', color: '#ca8a04', icon: 'falling', valued: true },
      { name: 'Concealed', color: '#64748b', icon: 'fog' },
      { name: 'Confused', color: '#c026d3', icon: 'spiral-bloom' },
      { name: 'Controlled', color: '#9333ea', icon: 'puppet' },
      { name: 'Dazzled', color: '#facc15', icon: 'sun' },
      { name: 'Deafened', color: '#0891b2', icon: 'hearing-disabled' },
      { name: 'Doomed', color: '#1f2937', icon: 'grim-reaper', valued: true },
      { name: 'Drained', color: '#be123c', icon: 'life-tap', valued: true },
      { name: 'Dying', color: '#991b1b', icon: 'skull', valued: true },
      { name: 'Encumbered', color: '#78716c', icon: 'weight' },
      { name: 'Enfeebled', color: '#b45309', icon: 'arm-sling', valued: true },
      { name: 'Fascinated', color: '#ec4899', icon: 'eye' },
      { name: 'Fatigued', color: '#92400e', icon: 'tired-eye' },
      { name: 'Fleeing', color: '#7c3aed', icon: 'run' },
      { name: 'Frightened', color: '#6d28d9', icon: 'terror', valued: true },
      { name: 'Grabbed', color: '#ea580c', icon: 'grab' },
      { name: 'Hidden', color: '#475569', icon: 'hidden' },
      { name: 'Immobilized', color: '#0f766e', icon: 'spider-web' },
      { name: 'Invisible', color: '#c7d2fe', icon: 'invisible', effect: 'invisible' },
      { name: 'Off-Guard', color: '#dc2626', icon: 'cracked-shield' },
      { name: 'Paralyzed', color: '#38bdf8', icon: 'frozen-body' },
      { name: 'Persistent Damage', color: '#f97316', icon: 'flame' },
      { name: 'Petrified', color: '#78716c', icon: 'stoned-skull' },
      { name: 'Prone', color: '#d97706', icon: 'foot-trip' },
      { name: 'Quickened', color: '#22c55e', icon: 'lightning' },
      { name: 'Restrained', color: '#0d9488', icon: 'imprisoned' },
      { name: 'Sickened', color: '#65a30d', icon: 'vomiting', valued: true },
      { name: 'Slowed', color: '#0284c7', icon: 'snail', valued: true },
      { name: 'Stunned', color: '#fbbf24', icon: 'knocked-out-stars', valued: true },
      { name: 'Stupefied', color: '#a855f7', icon: 'brain-freeze', valued: true },
      { name: 'Unconscious', color: '#1e3a8a', icon: 'sleepy' },
      { name: 'Undetected', color: '#94a3b8', icon: 'ghost', effect: 'undetected' },
      { name: 'Unnoticed', color: '#334155', icon: 'hood', effect: 'undetected' },
      { name: 'Wounded', color: '#b91c1c', icon: 'bleeding-wound', valued: true },
    ]),
    resources: [{ ...HP_RESOURCE }],
    senses: PATHFINDER_2E_SENSES,
    lightPresets: PATHFINDER_2E_LIGHTS,
    statblockRoles: [{ id: 'creature', name: 'Creature', templateId: 'builtin:d20-creature' }],
    // Rarity is a trait in PF2e; Unique is the rarest.
    itemRarities: [
      { name: 'Common', tone: 'common' },
      { name: 'Uncommon', tone: 'uncommon' },
      { name: 'Rare', tone: 'rare' },
      { name: 'Unique', tone: 'legendary' },
    ],
  },
};
