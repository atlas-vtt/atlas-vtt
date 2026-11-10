import { describe, expect, it } from 'vitest';
import { sampleRecord, sampleValueFor } from '../../../../src/app/statblocks/model/sampleValues';
import {
  FIELD_TYPES, TEMPLATE_FORMAT, TEMPLATE_VERSION, type FieldType, type StatblockTemplate, type TemplateField,
} from '../../../../src/app/statblocks/model/templateTypes';

const field = (type: FieldType, extra: Partial<TemplateField> = {}): TemplateField => ({ key: 'k', label: 'Speed', type, ...extra });

describe('sampleValueFor', () => {
  it.each([
    ['number', 10],
    ['rating', '1'],
    ['dice', '2d6 + 3'],
    ['text', '30 ft.'],
    ['choice', '30 ft.'],
    ['list', ['Example one', 'Example two']],
    ['scores', []],
    ['image', null],
  ] as const)('%s → %j', (type, sample) => {
    expect(sampleValueFor(field(type))).toEqual(sample);
  });

  it('has a sample for every field type', () => {
    for (const type of FIELD_TYPES) expect(sampleValueFor(field(type))).not.toBeUndefined();
  });

  it('never shows a property\'s name as its value', () => {
    const named = (key: string, label: string, type: FieldType): TemplateField => ({ key, label, type });
    const cases = [
      named('languages', 'Languages', 'text'), named('senses', 'Senses', 'text'), named('type', 'Type', 'text'),
      named('alignment', 'Alignment', 'text'), named('damage_vulnerabilities', 'Damage Vulnerabilities', 'text'),
      named('motive', 'Motives', 'text'), named('quirk', 'Quirk', 'text'), named('mood', 'Mood', 'choice'),
    ];
    for (const one of cases) {
      const sample = String(sampleValueFor(one)).toLowerCase();
      expect(sample, one.key).not.toBe(one.key.replace(/_/g, ' '));
      expect(sample, one.key).not.toBe(one.label.toLowerCase());
    }
  });

  it('reads like a statblock: hit points match their dice, and lists have names of their own', () => {
    expect(sampleValueFor({ key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' })).toBe(22);
    expect(sampleValueFor({ key: 'hit_dice', label: 'Hit Dice', type: 'dice' })).toBe('4d8 + 4');
    expect(sampleValueFor({ key: 'senses', label: 'Senses', type: 'text' })).toMatch(/passive Perception/);
    const actions = sampleValueFor({ key: 'actions', label: 'Actions', type: 'entries' }) as Array<{ name: string }>;
    const traits = sampleValueFor({ key: 'traits', label: 'Traits', type: 'entries' }) as Array<{ name: string }>;
    expect(actions[0]?.name).toBe('Multiattack');
    expect(traits.map((entry) => entry.name)).not.toEqual(actions.map((entry) => entry.name));
    expect(sampleValueFor({ key: 'saves', label: 'Saving Throws', type: 'pairs' })).toEqual({ dexterity: 2, wisdom: 3 });
  });

  it('fills every slot, picks Medium or the first option and keys pairs by slot', () => {
    expect(sampleValueFor(field('scores', { slots: ['Str', 'Dex', 'Con'] }))).toEqual([14, 12, 13]);
    expect(sampleValueFor(field('choice', { options: ['Tiny', 'Small'] }))).toBe('Tiny');
    expect(sampleValueFor(field('choice', { options: ['Tiny', 'Medium'], meaning: 'size' }))).toBe('Medium');
    expect(sampleValueFor(field('pairs', { slots: ['Str', 'Dex'] }))).toEqual({ str: 1, dex: 1 });
    expect(sampleValueFor(field('pairs', { slots: ['Str'], slotKeys: ['strength'] }))).toEqual({ strength: 1 });
  });

  it('writes entries with the field\'s own entry keys and extras', () => {
    const shape = { nameKey: 'title', textKey: 'text', extras: [
      { key: 'range', label: 'Range', type: 'text' as const },
      { key: 'cost', label: 'Cost', type: 'number' as const },
      { key: 'damage', label: 'Damage', type: 'dice' as const },
      { key: 'tags', label: 'Tags', type: 'list' as const },
    ] };
    const entries = sampleValueFor({ key: 'features', label: 'Features', type: 'entries', entry: shape }) as Array<Record<string, unknown>>;
    expect(entries[0]).toEqual({
      title: 'Keen Senses', range: 'Close', cost: 1, damage: '2d6 + 3', tags: ['Example one', 'Example two'],
      text: 'The creature notices what moves nearby, even in dim light.',
    });
  });
});

describe('sampleRecord', () => {
  it('samples every field and lets the template\'s own samples win', () => {
    const template: StatblockTemplate = {
      format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id: 'marsh-creature-k7m2qa',
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'hp', label: 'Hit Points', type: 'number' },
        { key: 'image', label: 'Portrait', type: 'image' },
      ],
      layout: { maxColumns: 2, blocks: [] },
      sample: { name: 'Creature name', speed: '30 ft.' },
    };
    expect(sampleRecord(template)).toEqual({ name: 'Creature name', hp: 22, image: null, speed: '30 ft.' });
  });

  it('leaves every number empty for the template editor, the template\'s own samples and abilities\' number parts too', () => {
    const template: StatblockTemplate = {
      format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id: 'marsh-creature-k7m2qa',
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'hp', label: 'Hit Points', type: 'number' },
        { key: 'cr', label: 'Challenge', type: 'rating' },
        { key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX'] },
        { key: 'actions', label: 'Actions', type: 'entries', entry: { extras: [{ key: 'cost', label: 'Cost', type: 'number' }, { key: 'range', label: 'Range', type: 'text' }] } },
      ],
      layout: { maxColumns: 2, blocks: [] },
      sample: { name: 'Creature name', hp: 40 },
    };
    const record = sampleRecord(template, { numbers: false });
    expect(Object.keys(record).sort()).toEqual(['actions', 'name']);
    expect(record.name).toBe('Creature name');
    const [first] = record.actions as Array<Record<string, unknown>>;
    expect(first).toHaveProperty('range');
    expect(first).not.toHaveProperty('cost');
  });
});
