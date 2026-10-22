import { describe, expect, it } from 'vitest';
import { statblockModifierValue } from '../../src/app/initiative/modifierValue';
import { findModifierField, labelsOf, type ModifierStatblock } from '../../src/app/initiative/modifierFields';
import { statblockInitiativeModifier } from '../../src/app/initiative/initiativeModifier';
import { recordOf } from '../../src/app/statblocks/resolve/statblockRecord';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { collectionInitiativeRules } from '../../src/app/gameSystems/initiativeRules';
import type { TemplateField } from '../../src/app/statblocks/model/templateTypes';

const PF2E = collectionInitiativeRules({ systemPresetId: BUILT_IN_SYSTEM_PRESETS.find((p) => p.name === 'Pathfinder 2e')!.id }, BUILT_IN_SYSTEM_PRESETS);
const DND5E = collectionInitiativeRules({ systemPresetId: BUILT_IN_SYSTEM_PRESETS.find((p) => p.name === 'D&D 5e')!.id }, BUILT_IN_SYSTEM_PRESETS);

describe('a statblock value read as an initiative modifier, whatever its field\'s type', () => {
  it('reads numbers and the ways statblocks write them', () => {
    const cases: Array<[unknown, number]> = [
      [3, 3], [-1, -1], [0, 0], ['+3', 3], ['3', 3], ['-1', -1], ['−1', -1], ['–2', -2], [' +4 ', 4],
      ['+3 (13)', 3], ['+12; darkvision', 12], ['Perception +12; low-light vision', 12], ['Initiative: 3', 3],
      ['16 (+3)', 3], ['8 (−1)', -1],
    ];
    for (const [value, expected] of cases) expect(statblockModifierValue(value), String(value)).toBe(expected);
  });

  it('reads the first entry of a list that holds a number, as Fantasy Statblocks\' Pathfinder notes keep Perception', () => {
    expect(statblockModifierValue([{ name: 'Perception', desc: 'Perception +12; darkvision' }])).toBe(12);
    expect(statblockModifierValue([{ name: 'Senses', desc: 'darkvision' }, { name: 'Perception', desc: '+7' }])).toBe(7);
    expect(statblockModifierValue({ value: '+2' })).toBe(2);
    expect(statblockModifierValue(['+5'])).toBe(5);
  });

  it('reads no number from dice, fractions, prose or a name without a sign', () => {
    for (const value of ['1d4', '1d20+3', '2.5', 2.5, '+', '', 'fast', 'Dex 14', NaN, Infinity, null, undefined, true, {}, [], '99999999999999999999', [[[['+3']]]]]) {
      expect(statblockModifierValue(value), JSON.stringify(value)).toBeNull();
    }
  });

  it('reads an ability score as its modifier, and a signed number as a modifier already', () => {
    expect(statblockModifierValue(16, true)).toBe(3);
    expect(statblockModifierValue('16 (+3)', true)).toBe(3);
    expect(statblockModifierValue('9', true)).toBe(-1);
    expect(statblockModifierValue('+2', true)).toBe(2);
  });
});

const TEMPLATE_FIELDS: TemplateField[] = [
  { key: 'perc', label: 'Perception', type: 'entries' },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex', 'Con'] },
];

describe('the field the rules name, found in a statblock', () => {
  it('is found by key in any spelling', () => {
    expect(findModifierField({ fields: { perception: '+4' } }, 'Perception')).toEqual({ value: '+4', score: false });
    expect(findModifierField({ fields: { 'Init Bonus': 1 } }, 'init_bonus')).toEqual({ value: 1, score: false });
  });

  it('is found by its template\'s label, a score slot read as a score', () => {
    const statblock: ModifierStatblock = { fields: { perc: [{ name: 'Perception', desc: '+9' }], stats: [10, 14, 12] }, labels: labelsOf(TEMPLATE_FIELDS) };
    expect(statblockInitiativeModifier(statblock, { modifier: { field: 'perception' } })).toBe(9);
    expect(statblockInitiativeModifier(statblock, { modifier: { field: 'Dex' } })).toBe(2);
    // The key still wins over a label that names another field
    expect(statblockInitiativeModifier({ ...statblock, fields: { ...statblock.fields, dex: '+5' } }, { modifier: { field: 'dex' } })).toBe(5);
  });

  it('finds the SRD\'s DEX in a Fantasy Statblocks statblock\'s `stats` as people name it', () => {
    const captain: ModifierStatblock = { fields: { name: 'Bandit Captain', stats: [15, 16, 14, 14, 11, 14] }, fantasy: true };
    expect(statblockInitiativeModifier(captain, { modifier: { field: 'dex' } })).toBe(3);
    expect(statblockInitiativeModifier(captain, { modifier: { field: 'stats.dex' } })).toBe(3);
    expect(statblockInitiativeModifier(captain, { modifier: { field: 'Dexterity' } })).toBe(3);
    expect(statblockInitiativeModifier({ ...captain, fantasy: false }, { modifier: { field: 'dex' } })).toBeNull();
  });
});

describe('initiative read from the statblocks users brought (Discord, 2026-10-15 to 17)', () => {
  // As Fantasy Statblocks' Pathfinder 2e import writes a creature: `modifier` from its Perception, and Perception as entries
  const pathfinderImport = {
    layout: 'Basic Pathfinder 2e Layout', name: 'Goblin Warrior', level: 'Creature -1', modifier: 5,
    perception: [{ name: 'Perception', desc: 'Perception +5; darkvision' }],
  };

  it('rolls a Fantasy Statblocks Pathfinder import with the field typed as "perception", in any case', () => {
    for (const field of ['perception', 'Perception']) {
      expect(statblockInitiativeModifier({ fields: pathfinderImport, fantasy: true }, { modifier: { field } })).toBe(5);
    }
  });

  it('rolls it by the Pathfinder 2e rules too, from Fantasy Statblocks\' own initiative modifier', () => {
    expect(statblockInitiativeModifier({ fields: pathfinderImport, fantasy: true }, PF2E)).toBe(5);
  });

  it('rolls a native note whose template keeps Perception as entries', () => {
    const native: ModifierStatblock = { fields: { name: 'Goblin', perc: [{ name: 'Perception', desc: '+4' }] }, labels: labelsOf(TEMPLATE_FIELDS) };
    expect(statblockInitiativeModifier(native, { modifier: { field: 'perception' } })).toBe(4);
  });

  it('rolls a 5e creature of a fence statblock (the TTRPG CLI\'s notes) by its DEX', () => {
    const fence = { name: 'Goblin', stats: [8, 14, 10, 10, 8, 8], cr: '1/4' };
    expect(statblockInitiativeModifier({ fields: fence, fantasy: true }, DND5E)).toBe(2);
    expect(statblockInitiativeModifier({ fields: fence, fantasy: true }, { modifier: { field: 'stats.dex' } })).toBe(2);
  });

  it('reads a fence\'s own values over the note\'s properties, and a frontmatter statblock\'s properties over the bestiary\'s copy', () => {
    const fields = { name: 'Goblin', level: 'Creature -1', perception: '+5' };
    const frontmatter = { level: 3, perception: 'see body', tags: ['monster'] };
    expect(recordOf(fields, frontmatter, true)).toEqual({ ...fields, tags: ['monster'] });
    expect(recordOf(fields, frontmatter, false)).toEqual({ name: 'Goblin', ...frontmatter });
    expect(recordOf(undefined, frontmatter, false)).toEqual(frontmatter);
  });
});

describe('the collection\'s statblocks as the settings preview them', () => {
  it('reads a native statblock with its template\'s labels and one without a template as Fantasy Statblocks\'', async () => {
    const { modifierStatblocksOf, modifierPreview } = await import('../../src/app/initiative/modifierPreview');
    const template = { id: 'pf2e-vault', fields: TEMPLATE_FIELDS } as unknown as Parameters<typeof modifierStatblocksOf>[1][number];
    const statblocks = modifierStatblocksOf([
      { path: 'Bestiary/Goblin.md', fields: { perc: [{ name: 'Perception', desc: '+4' }] }, templateId: 'pf2e-vault', meanings: {}, lookName: null },
      { path: 'Bestiary/Captain.md', fields: { name: 'Bandit Captain', stats: [15, 16, 14, 14, 11, 14] }, templateId: null, meanings: {}, lookName: null },
    ], [template]);
    expect(statblocks.map(({ name, fantasy }) => [name, fantasy])).toEqual([['Goblin', false], ['Bandit Captain', true]]);
    expect(modifierPreview(statblocks, { modifier: { field: 'Perception' } })).toEqual({ total: 2, read: 1, example: { name: 'Goblin', modifier: 4 } });
    expect(modifierPreview(statblocks, DND5E)).toEqual({ total: 2, read: 1, example: { name: 'Bandit Captain', modifier: 3 } });
  });
});
