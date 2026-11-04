// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { readTemplateFile } from '../../../../src/app/statblocks/library/templateFiles';
import { withHeader, withoutHeaderDuplicates } from '../../../../src/app/statblocks/model/headerDuplicates';
import { flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { renderSheet } from '../render/sheetTestKit';
import { shape, template } from '../template-editor/editorKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'tier', label: 'Tier', type: 'rating', meaning: 'rating' },
  { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
  { key: 'difficulty', label: 'Difficulty', type: 'number' },
  { key: 'hp', label: 'Hit points', type: 'number', meaning: 'hit-points' },
  { key: 'description', label: 'Description', type: 'markdown' },
  { key: 'motives', label: 'Motives', type: 'text' },
  { key: 'features', label: 'Features', type: 'entries' },
];

/**
 * A template as an earlier build of the editor wrote it in the maintainer's
 * vault: a header row of a section with the name and the token art, a row of
 * the level and the type, and the hit points and the description further down,
 * among blocks of its own.
 */
const OLD_HEADER: TemplateBlock[] = [
  { id: 'corehead', type: 'row', blocks: [{ id: 'headsec1', type: 'section', blocks: [{ id: 'corename', type: 'title', field: 'name', level: 1 }] }, { id: 'coretokn', type: 'image', field: 'image', shape: 'token' }] },
  { id: 'corevals', type: 'row', blocks: [{ id: 'corelevl', type: 'stat', field: 'tier', look: 'stacked' }, { id: 'coretype', type: 'stat', field: 'type', look: 'stacked' }] },
  { id: 'motives1', type: 'stat', field: 'motives', look: 'run-in' },
  { id: 'strip001', type: 'row', blocks: [{ id: 'diffic01', type: 'stat', field: 'difficulty', look: 'stacked' }, { id: 'hitpts01', type: 'stat', field: 'hp', look: 'stacked' }] },
  { id: 'descrip1', type: 'text', field: 'description' },
  { id: 'features', type: 'entries', field: 'features', heading: 'Features' },
];
const OLD = { ...template(OLD_HEADER, FIELDS, 'adversary-abc123'), layout: { maxColumns: 2 as const, blocks: OLD_HEADER } };

const VALUES = {
  name: 'Jagged Knife Bandit', image: 'https://example.com/bandit.png', tier: 1, type: 'Standard', difficulty: 12, hp: 5,
  description: 'A cunning criminal in a cloak.', motives: 'Steal, extort', features: [{ name: 'Throw', desc: 'Throws a knife.' }],
};

describe('a template whose layout repeats the header', () => {
  it('loses those blocks, nested ones too, and keeps everything else where it stood, an emptied row going and a row of one becoming its tile', () => {
    const read = withoutHeaderDuplicates(OLD);
    expect(shape(read.layout.blocks)).toBe('motives1 diffic01 features');
    expect(read.fields).toBe(OLD.fields);
    expect(withoutHeaderDuplicates(read)).toBe(read);
  });

  it('keeps a block that works the value out, and one that shows it with other values', () => {
    const experience: TemplateBlock = { id: 'xpline01', type: 'stat', field: 'tier', label: 'XP', look: 'run-in', pattern: '{tier|lookup:xp}' };
    const line: TemplateBlock = { id: 'typeline', type: 'line', fields: ['type', 'motives'], pattern: '{type}, {motives}' };
    const kept = template([experience, line], FIELDS);
    expect(withoutHeaderDuplicates(kept)).toBe(kept);
  });

  it('loses a block that only strings parts together, which the header shows each of', () => {
    const tierLine: TemplateBlock = { id: 'tierline', type: 'stat', field: 'tier', look: 'run-in', pattern: '{tier} {type}' };
    const read = withoutHeaderDuplicates(template([...OLD_HEADER, tierLine], FIELDS));
    expect(shape(read.layout.blocks)).toBe('motives1 diffic01 features');
    expect(read.header).toBeUndefined();
  });

  it('hides a part whose value a block that stays still shows beside others, so the type shows once', () => {
    const typeLine: TemplateBlock = { id: 'typeline', type: 'line', fields: ['type', 'motives'], pattern: '{type}, {motives}' };
    const read = withoutHeaderDuplicates(template([...OLD_HEADER, typeLine], FIELDS));
    expect(shape(read.layout.blocks)).toBe('motives1 diffic01 features typeline');
    expect(read.header).toEqual({ hidden: ['type'] });
  });

  it('hides a part whose block an older Atlas kept off the card', () => {
    const hidden = { id: 'corelevl', type: 'stat', field: 'tier', look: 'run-in', hidden: true } as unknown as TemplateBlock;
    expect(withoutHeaderDuplicates(template([hidden], FIELDS)).header).toEqual({ hidden: ['level'] });
  });

  it('is read from its file with one header, and written so with its next save', () => {
    const file = readTemplateFile('atlas-vtt/statblock-templates/Daggerheart Adversary.atlastemplate', serializeTemplate(OLD));
    const read = file.entry?.template as StatblockTemplate;
    expect(shape(read.layout.blocks)).toBe('motives1 diffic01 features');
    expect(JSON.parse(serializeTemplate(read)).layout.blocks.map((block: { id: string }) => block.id)).toEqual(['motives1', 'diffic01', 'features']);
    expect(withHeader(read)).toBe(read);
  });

  it('draws only the fixed header: one name, one token art, one level, type, hit points and description', () => {
    const { container } = renderSheet(withHeader(OLD), VALUES, { mode: 'editing' });
    const drawn = [...container.querySelectorAll('[data-block-id]')].map((frame) => frame.getAttribute('data-block-id'));
    expect(drawn.filter((id) => id?.startsWith('header-'))).toEqual([
      'header-name', 'header-level', 'header-type', 'header-hp', 'header-description', 'header-token',
    ]);
    expect(container.querySelectorAll('[data-block="title"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-block="image"]')).toHaveLength(1);
    for (const key of ['name', 'image', 'tier', 'type', 'hp', 'description']) {
      expect(container.querySelectorAll(`[data-prop="${key}"]`), key).toHaveLength(1);
    }
    expect(flattenReadingOrder(withHeader(OLD).layout.blocks).map((block) => block.id)).toEqual(['motives1', 'diffic01', 'features']);
  });

  it('loses a Title on the display name, which the header shows, and keeps one on a field that is no display name', () => {
    const titleField: TemplateField = { key: 'title', label: 'Title', type: 'text', meaning: 'display-name' };
    const heading: TemplateBlock = { id: 'titlehd1', type: 'title', field: 'title', level: 1, fallback: 'Creature' };
    const read = withoutHeaderDuplicates(template([heading, ...OLD_HEADER], [...FIELDS, titleField]));
    expect(shape(read.layout.blocks)).toBe('motives1 diffic01 features');
    const plain = template([heading], [...FIELDS, { key: 'title', label: 'Title', type: 'text' }]);
    expect(withoutHeaderDuplicates(plain)).toBe(plain);
  });
});

