import type { TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import {
  fieldLabels, indexInto, readerFor, readField, scoreAt, slotKeyOf, splitRef,
} from '../../../../src/app/statblocks/values/fieldValues';

const STATS: TemplateField = {
  key: 'stats', label: 'Abilities', type: 'scores',
  slots: ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'],
  slotKeys: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
};
const HP: TemplateField = { key: 'hp', label: 'Hit Points', type: 'number', formerKeys: ['hit_points', 'health'] };
const SAVES: TemplateField = { key: 'saves', label: 'Saving Throws', type: 'pairs' };
const FIELDS = [STATS, HP, SAVES];

describe('readField', () => {
  it('reads the field by its key', () => {
    expect(readField({ hp: 52, hit_points: 3 }, HP)).toEqual({ value: 52, key: 'hp', viaFormerKey: false });
  });

  it('reads the first present former key while the key is absent', () => {
    expect(readField({ health: 9, hit_points: 7 }, HP)).toEqual({ value: 7, key: 'hit_points', viaFormerKey: true });
    expect(readField({ health: 9 }, HP)).toEqual({ value: 9, key: 'health', viaFormerKey: true });
    expect(readField({ hp: undefined, health: 9 }, HP)).toEqual({ value: 9, key: 'health', viaFormerKey: true });
  });

  it('counts a key holding null as present', () => {
    expect(readField({ hp: null, hit_points: 7 }, HP)).toEqual({ value: null, key: 'hp', viaFormerKey: false });
  });

  it('reads nothing under the field key when no key is present', () => {
    expect(readField({}, HP)).toEqual({ value: undefined, key: 'hp', viaFormerKey: false });
    expect(readField(Object.create({ hp: 4 }) as Record<string, unknown>, HP).value).toBeUndefined();
  });
});

describe('refs', () => {
  it('split at the first dot', () => {
    expect(splitRef('hp')).toEqual({ key: 'hp', index: null });
    expect(splitRef('stats.1')).toEqual({ key: 'stats', index: '1' });
    expect(splitRef('a.b.c')).toEqual({ key: 'a', index: 'b.c' });
  });

  it('index lists by position and records and pairs by name', () => {
    expect(indexInto([10, 14], '1')).toBe(14);
    expect(indexInto([10, 14], '2')).toBeUndefined();
    expect(indexInto([{ intelligence: 5 }], 'Intelligence')).toBe(5);
    expect(indexInto({ Dex: 5, dex: 6 }, 'dex')).toBe(6);
    expect(indexInto({ Dex: 5 }, 'DEX')).toBe(5);
    expect(indexInto('text', '0')).toBeUndefined();
    expect(indexInto(undefined, '0')).toBeUndefined();
  });
});

describe('readerFor', () => {
  const record = {
    hit_points: 7,
    stats: [21, 14, 20, 16, 13, 18],
    saves: [{ dexterity: 6 }, { wisdom: 5 }],
    speed: '30 ft.',
    'odd.key': 'whole',
    odd: { key: 'part' },
  };
  const read = readerFor(record, FIELDS);

  it('reads template fields through former keys and other keys as they are', () => {
    expect(read('hp')).toBe(7);
    expect(read('speed')).toBe('30 ft.');
    expect(read('missing')).toBeUndefined();
  });

  it('reads indexes into lists, pairs and records', () => {
    expect(read('stats.1')).toBe(14);
    expect(read('saves.dexterity')).toBe(6);
    expect(read('saves.Wisdom')).toBe(5);
    expect(read('stats.9')).toBeUndefined();
    expect(read('hp.0')).toBeUndefined();
  });

  it('reads a key that holds a dot whole before splitting it', () => {
    expect(read('odd.key')).toBe('whole');
  });

  it('answers each ref once', () => {
    const changing: Record<string, unknown> = { speed: 'old' };
    const once = readerFor(changing, []);
    expect(once('speed')).toBe('old');
    changing.speed = 'new';
    expect(once('speed')).toBe('old');
    expect(readerFor(changing, [])('speed')).toBe('new');
  });
});

describe('field labels', () => {
  it('names refs by the template', () => {
    const labelOf = fieldLabels(FIELDS);
    expect(labelOf('hp')).toBe('Hit Points');
    expect(labelOf('stats.1')).toBe('Dex');
    expect(labelOf('stats.7')).toBe('Abilities 8');
    expect(labelOf('saves.dex')).toBe('Saving Throws dex');
    expect(labelOf('speed')).toBeUndefined();
    expect(labelOf('speed.0')).toBeUndefined();
  });
});

describe('scores', () => {
  it('names slots by their keys, else their labels in lower case', () => {
    expect(slotKeyOf(STATS, 1)).toBe('dexterity');
    expect(slotKeyOf({ slots: ['Might', 'Agility'] }, 1)).toBe('agility');
    expect(slotKeyOf({}, 0)).toBeUndefined();
  });

  it('reads a slot from a list, or from a record by key or label', () => {
    expect(scoreAt({ stats: [21, 14] }, STATS, 1)).toBe(14);
    expect(scoreAt({ stats: [21, '—'] }, STATS, 1)).toBe('—');
    expect(scoreAt({ stats: [21] }, STATS, 4)).toBeUndefined();
    expect(scoreAt({ stats: { dexterity: 12 } }, STATS, 1)).toBe(12);
    expect(scoreAt({ stats: [{ DEX: 13 }] }, STATS, 1)).toBe(13);
    expect(scoreAt({}, STATS, 0)).toBeUndefined();
  });
});
