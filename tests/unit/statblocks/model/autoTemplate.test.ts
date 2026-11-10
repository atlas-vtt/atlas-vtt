import { describe, expect, it } from 'vitest';
import { autoTemplate } from '../../../../src/app/statblocks/model/autoTemplate';
import { shownHeaderParts } from '../../../../src/app/statblocks/model/templateHeader';
import { isLegalSubtree } from '../../../../src/app/statblocks/model/treeEdit';
import { fieldsShownBy, flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import { TEMPLATE_FORMAT, TEMPLATE_VERSION, type FieldValue } from '../../../../src/app/statblocks/model/templateTypes';
import { int, mulberry32, pick, type Random } from './treeFixtures';

// The note of plan §5.5, as the metadata cache reads it.
const marshWarden = {
  statblock: true,
  'atlas-template': 'marsh-creature-k7m2qa',
  name: 'Marsh Warden',
  image: 'atlas-vtt/assets/tokens/marsh-warden.webp',
  size: 'Large',
  ac: 14,
  hit_dice: '7d10 + 14',
  stats: [18, 8, 15, 6, 12, 7],
  saves: [{ intelligence: 5 }],
  skillsaves: { perception: 3, stealth: '+4' },
  languages: ['Sylvan', 'Common'],
  traits: [{ name: 'Rooted', desc: 'While it has not moved this turn, it cannot be pushed.' }],
  description: 'The wardens grow where the old causeway sank.\n\nThey remember it.',
};

describe('autoTemplate', () => {
  it('fills the header from the record and lays out one block per other field, in the record\'s order', () => {
    const template = autoTemplate(marshWarden);
    expect(template).toMatchObject({ format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id: 'auto', layout: { maxColumns: 2 } });
    expect(template.header).toEqual({ hidden: ['level', 'type', 'hp'] });
    expect(template.fields).toEqual([
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'image', label: 'Image', type: 'image' },
      { key: 'description', label: 'Description', type: 'markdown', meaning: 'description' },
      { key: 'size', label: 'Size', type: 'text' },
      { key: 'ac', label: 'Armor class', type: 'number' },
      { key: 'hit_dice', label: 'Hit dice', type: 'text' },
      { key: 'stats', label: 'Abilities', type: 'scores', slots: ['1', '2', '3', '4', '5', '6'] },
      { key: 'saves', label: 'Saving throws', type: 'pairs' },
      { key: 'skillsaves', label: 'Skills', type: 'pairs' },
      { key: 'languages', label: 'Languages', type: 'list' },
      { key: 'traits', label: 'Traits', type: 'entries' },
    ]);
    expect(template.layout.blocks).toStrictEqual([
      { id: 'auto0000', type: 'stat', field: 'size', look: 'run-in' },
      { id: 'auto0001', type: 'stat', field: 'ac', look: 'run-in' },
      { id: 'auto0002', type: 'stat', field: 'hit_dice', look: 'run-in' },
      { id: 'auto0003', type: 'scores', field: 'stats', orientation: 'row' },
      { id: 'auto0004', type: 'pairs', field: 'saves' },
      { id: 'auto0005', type: 'pairs', field: 'skillsaves' },
      { id: 'auto0006', type: 'tags', field: 'languages', look: 'comma' },
      { id: 'auto0007', type: 'entries', field: 'traits', heading: 'Traits' },
    ]);
  });

  it('shows Fantasy Statblocks\' challenge as the level, under its own key', () => {
    const template = autoTemplate({ name: 'Wolf', cr: '1/4', type: 'beast', hp: 11 });
    expect(template.fields).toEqual([
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'cr', label: 'Challenge rating', type: 'text', meaning: 'rating' },
      { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
      { key: 'hp', label: 'Hit points', type: 'number', meaning: 'hit-points' },
    ]);
    expect(template.header).toEqual({ hidden: ['description'] });
    expect(template.layout.blocks).toEqual([]);
  });

  it('is the same for the same record', () => {
    expect(autoTemplate(marshWarden)).toStrictEqual(autoTemplate({ ...marshWarden }));
  });

  it('reads entries that keep their text under "text"', () => {
    const template = autoTemplate({ features: [{ name: 'Relentless', text: 'Can act twice.' }] });
    expect(template.fields).toEqual([{ key: 'features', label: 'Features', type: 'entries', entry: { textKey: 'text' } }]);
  });

  it('reads FS spell lists', () => {
    const template = autoTemplate({ spells: ['It casts from memory.', { 'Cantrips (at will)': 'light, mage hand' }] });
    expect(template.fields).toEqual([{ key: 'spells', label: 'Spells', type: 'spells' }]);
    expect(template.layout.blocks).toEqual([{ id: 'auto0000', type: 'spells', field: 'spells', heading: 'Spells' }]);
  });

  it('leaves out reserved, ignored and empty fields and shapes no block shows', () => {
    const template = autoTemplate({
      statblock: true, layout: 'Basic 5e Layout', tags: ['monster'], aliases: ['W'], token: 'x.png', 'atlas-template': 'x',
      monster: 'Bandit', bestiary: false, secret: 'gm', blank: '  ', none: null, emptyList: [], emptyRecord: {},
      nested: { speed: { walk: '30 ft.' } }, flag: true, mixed: [1, 'two'], speeds: { walk: '30 ft.' },
      level: 0,
    }, new Set(['secret']));
    expect(template.fields).toEqual([{ key: 'level', label: 'Level', type: 'number', meaning: 'rating' }]);
  });

  it('lays out nothing of the header, and hides every part an empty record holds nothing of', () => {
    expect(autoTemplate({ hp: 7 }).layout.blocks).toEqual([]);
    expect(autoTemplate({ image: 'a.png' }).layout.blocks).toEqual([]);
    expect(autoTemplate({})).toEqual({
      format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id: 'auto', fields: [],
      header: { hidden: ['level', 'type', 'hp', 'description'] }, layout: { maxColumns: 2, blocks: [] },
    });
    expect(autoTemplate({ name: 'Wolf' }, new Set(['name'])).fields).toEqual([]);
  });
});

function randomValue(random: Random, depth: number): FieldValue {
  const roll = int(random, 0, depth > 2 ? 4 : 9);
  switch (roll) {
    case 0: return pick(random, ['', ' ', 'text', 'two\nlines', '+3', '1/4']);
    case 1: return pick(random, [0, -2, 14, 2.5, Number.NaN]);
    case 2: return random() < 0.5;
    case 3: return null;
    case 4: return Array.from({ length: int(random, 0, 6) }, () => int(random, 1, 20));
    case 5: return Array.from({ length: int(random, 0, 3) }, () => pick(random, ['Common', 'Elvish']));
    case 6: return Array.from({ length: int(random, 0, 3) }, () => ({ name: 'Bite', [pick(random, ['desc', 'text'])]: 'Hits.' }));
    case 7: return { dex: int(random, -2, 5), con: pick(random, [1, '+2']) };
    case 8: return Array.from({ length: int(random, 0, 3) }, () => ({ [pick(random, ['str', 'dex'])]: int(random, 0, 5) }));
    default: return Array.from({ length: int(random, 0, 3) }, () => randomValue(random, depth + 1));
  }
}

describe('autoTemplate on random records', () => {
  it('shows every field it makes exactly once, with unique ids and only the record\'s keys', () => {
    const keys = ['name', 'image', 'hp', 'ac', 'stats', 'traits', 'saves', 'speed', 'tags', 'layout', 'notes', 'k1', 'k2'];
    for (let seed = 1; seed <= 400; seed++) {
      const random = mulberry32(seed);
      const record: Record<string, FieldValue> = {};
      for (const key of keys) if (random() < 0.6) record[key] = randomValue(random, 0);
      const template = autoTemplate(record);
      const blocks = flattenReadingOrder(template.layout.blocks);
      expect(new Set(blocks.map((block) => block.id)).size, `seed ${seed}`).toBe(blocks.length);
      expect(blocks.every((block) => /^[0-9a-z]{8}$/.test(block.id))).toBe(true);
      expect(template.layout.blocks.every(isLegalSubtree)).toBe(true);
      const fieldKeys = template.fields.map((field) => field.key);
      const header = shownHeaderParts(template).map((part) => part.key).filter((key) => fieldKeys.includes(key));
      const body = blocks.flatMap((block) => fieldsShownBy(block));
      expect([...header, ...body].sort(), `seed ${seed}`).toEqual(fieldKeys.sort());
      for (const field of template.fields) expect(Object.keys(record), `seed ${seed}`).toContain(field.key);
    }
  });
});
