import { TEMPLATE_FORMAT, TEMPLATE_VERSION, type StatblockTemplate } from '../../src/app/statblocks/model/templateTypes';
import type { RecoveryButton } from '../../src/app/recovery/recoveryTypes';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';

/** A player character's template: hit points in the header, Stress as a track, Hit Dice and features as counters. */
export const ADVENTURER: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: TEMPLATE_VERSION,
  id: 'adventurer-a1b2c3',
  fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'image', label: 'Token art', type: 'image' },
    { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
    { key: 'type', label: 'Class', type: 'text', meaning: 'creature-type' },
    { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
    { key: 'ac', label: 'Armor Class', type: 'number' },
    { key: 'speed', label: 'Speed', type: 'text' },
    { key: 'con', label: 'CON modifier', type: 'number' },
    { key: 'stress', label: 'Stress', type: 'number' },
    { key: 'hit_dice', label: 'Hit Dice', type: 'counters', counterRows: [{ name: 'd10', max: 5 }] },
    { key: 'features', label: 'Features', type: 'counters', counterRows: [{ name: 'Second Wind', max: 1 }, { name: 'Action Surge', max: 1 }] },
    { key: 'actions', label: 'Actions', type: 'entries' },
  ],
  header: { hidden: ['description'] },
  layout: {
    maxColumns: 2,
    blocks: [
      { id: 'statac01', type: 'stat', field: 'ac', look: 'run-in' },
      { id: 'statsp01', type: 'stat', field: 'speed', look: 'run-in' },
      { id: 'statcn01', type: 'stat', field: 'con', look: 'run-in', display: 'signed' },
      { id: 'track001', type: 'track', field: 'stress', resource: 'stress', look: 'boxes', counts: 'up' },
      { id: 'countr01', type: 'counters', field: 'hit_dice' },
      { id: 'countr02', type: 'counters', field: 'features' },
      { id: 'entrie01', type: 'entries', field: 'actions', heading: 'Actions' },
    ],
  },
  sample: { name: 'Mira Ashgrove', level: 4, type: 'Fighter', hp: 38, ac: 17, speed: '30 ft.', con: 3, stress: 6 },
};

export const RESOURCES: ResourceDefinition[] = [
  { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#ef4444', visibleToPlayers: true, defeatedWhenSpent: true, slot: 0 },
  { key: 'stress', name: 'Stress', field: 'stress', direction: 'fills', color: '#8b5cf6', visibleToPlayers: true, slot: 1 },
  { key: 'ac', name: 'AC', field: 'ac', direction: 'static', color: '#64748b', visibleToPlayers: true, slot: 2 },
];

export const CONDITIONS: ConditionDefinition[] = [
  { id: 'exhaustion', name: 'Exhaustion', color: '#f59e0b', valued: true },
  { id: 'frightened', name: 'Frightened', color: '#ec4899', valued: true },
  { id: 'poisoned', name: 'Poisoned', color: '#84cc16' },
];

/** The adventurer's recovery buttons: a Short rest that spends Hit Dice, a Long rest that restores everything. */
export const BUTTONS: RecoveryButton[] = [
  {
    id: 'rest-short1',
    name: 'Short rest',
    rules: [
      { target: { kind: 'resource', field: 'hp' }, does: 'spend', from: { kind: 'counters', field: 'hit_dice', rows: 'all' }, each: '1d10+@con' },
      { target: { kind: 'counters', field: 'features', rows: ['rest-short1'] }, does: 'full' },
    ],
  },
  {
    id: 'rest-long01',
    name: 'Long rest',
    rules: [
      { target: { kind: 'resource', field: 'hp' }, does: 'full' },
      { target: { kind: 'resource', field: 'stress' }, does: 'set', to: 0 },
      { target: { kind: 'counters', field: 'hit_dice', rows: 'all' }, does: 'share', share: 0.5, round: 'down', min: 1 },
      { target: { kind: 'condition', id: 'exhaustion' }, does: 'step', by: -1 },
    ],
  },
];
