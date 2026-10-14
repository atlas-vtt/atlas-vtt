import type { SystemPreset } from '../../types/systemPresetTypes';
import { HP_RESOURCE } from '../../resources/resourceDefinitions';
import { ResourceDefinition } from '../../resources/resourceTypes';
import { builtInPresetId, conditionsOf } from './presetHelpers';

const FOCUS_RESOURCE: Readonly<ResourceDefinition> = {
  key: 'focus',
  name: 'Focus',
  field: 'focus',
  direction: 'drains',
  color: '#6366f1',
  visibleToPlayers: false,
};

const INVESTITURE_RESOURCE: Readonly<ResourceDefinition> = {
  key: 'investiture',
  name: 'Investiture',
  field: 'investiture',
  direction: 'drains',
  color: '#14b8a6',
  visibleToPlayers: false,
};

/**
 * Cosmere RPG: 5-foot squares counted equally in every direction
 * Players have two additional resource pools: Focus and Investiture
 */
export const COSMERE_RPG: SystemPreset = {
  id: builtInPresetId('cosmereRpg'),
  name: 'Cosmere RPG',
  builtIn: true,
  rules: {
    // note: the initiative of this system works without a dice roll. There are two turn types:
    // fast or slow. Any player can choose either a fast turn or a slow turn (and so do adversaries)
    // then the game is resolved as such: first go the fast players, then the fast adversaries, then
    // the slow players and lastly the slow adversaries. Within their turn players can choose who
    // goes first etc, there's no fixed order within a turn.
    // `Initiative: sides` feels the closer to this system but I think it would be nice to have 
    // built-in support for this kind of initiative system
    initiative: {
      mode: 'sides',
      firstSide: 'players',
      roll: '1d20'
    },
    gridDefaults: {
      unitType: 'feet',
      unitDistance: 5,
      measurementMode: 'metric',
      diagonalRule: 'equidistant',
      abstractRangeBands: [],
    },
    dice: { defaultRoll: '1d20', crit: 'natural' },
    conditions: conditionsOf('cosmereRpg', [
      { name: 'Afflicted', color: '#ca8a04', icon: 'vomiting' },
      { name: 'Blinded', color: '#475569', icon: 'blindfold', effect: 'blinded' },
      { name: 'Depleted', color: '#64748b', icon: 'life-tap' },
      { name: 'Disoriented', color: '#c026d3', icon: 'spiral-bloom' },
      { name: 'Determined', color: '#9333ea', icon: 'meditation' },
      { name: 'Exhausted', color: '#be123c', icon: 'tired-eye', valued: true },
      { name: 'Flying', color: '#facc15', icon: 'wings', effect: 'airborne' },
      { name: 'Focused', color: '#22c55e', icon: 'lightning' },
      { name: 'Hidden', color: '#475569', icon: 'hidden' },
      { name: 'Immobilized', color: '#0f766e', icon: 'spider-web' },
      { name: 'Invisible', color: '#c7d2fe', icon: 'invisible', effect: 'invisible' },
      { name: 'Prone', color: '#d97706', icon: 'foot-trip' },
      { name: 'Restrained', color: '#0d9488', icon: 'imprisoned' },
      { name: 'Slowed', color: '#0284c7', icon: 'snail' },
      { name: 'Stunned', color: '#fbbf24', icon: 'knocked-out-stars' },
      { name: 'Surprised', color: '#f59e0b', icon: 'surprised' },
      { name: 'Unconscious', color: '#1e3a8a', icon: 'sleepy' },
      { name: 'Injured', color: '#be123c', icon: 'broken-bone', valued: true },

      // todo: we also have Diminished and Enhanced that are a bit special
      // they are valued but their value is in the form of Attribute + amount
      // e.g. [Speed -2] or [Strength +2]
      // I don't think this can be done with the current code so I'm leaving
      // them out for now
    ]),
    resources: [
      // In this system reaching 0 HP makes the PC unconscious and they gain an injury
      // The PC rolls a 1d20 (subtracting 5 for each injury they already have) and if the result
      // is lower than 6 then they effectively die.
      // Not sure how to translate this into a resource so I'm leaving this out for now.
      { ...HP_RESOURCE, defeatedWhenSpent: false },
      { ...FOCUS_RESOURCE },
      { ...INVESTITURE_RESOURCE },
    ],
  },
};

