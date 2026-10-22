import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTHORABLE_BLOCK_TYPES, BLOCK_TYPES, PALETTE_GROUPS, PRIMITIVE_IDS, PRIMITIVES, bindsFieldType, blockSpec, canContain, createBlock,
  isAuthorableBlockType, naturalBlockFor, primitiveOf, rowSizeOf,
} from '../../../../src/app/statblocks/model/blockCatalogue';
import { isLegalSubtree } from '../../../../src/app/statblocks/model/treeEdit';
import { FIELD_TYPES, type BlockType } from '../../../../src/app/statblocks/model/templateTypes';
import { idsFrom } from './treeFixtures';

const ALL_TYPES: BlockType[] = [
  'section', 'row', 'tabs', 'title', 'line', 'stat', 'metric', 'scores', 'tags', 'text', 'entries', 'pairs', 'track', 'counters', 'image',
  'spells', 'heading', 'divider', 'script', 'opaque',
];

const lucideIcon = (name: string): boolean =>
  existsSync(resolve(__dirname, '../../../../node_modules/lucide-react/dist/esm/icons', `${name}.js`));

describe('block catalogue', () => {
  it('describes every block type, labelled in sentence case with a lucide icon', () => {
    expect([...BLOCK_TYPES].sort()).toEqual([...ALL_TYPES].sort());
    for (const type of ALL_TYPES) {
      const spec = blockSpec(type);
      expect(spec.type).toBe(type);
      // Sentence case; only proper names (Fantasy Statblocks, Atlas) keep their capitals.
      expect(spec.label.replace(/Fantasy Statblocks|Atlas/, '')).toMatch(/^[A-Z]?[a-z ]*$/);
      expect(lucideIcon(spec.icon), `${type}: ${spec.icon}`).toBe(true);
    }
  });

  it('offers every block but scripts and unknown blocks to authors', () => {
    expect([...AUTHORABLE_BLOCK_TYPES].sort()).toEqual(ALL_TYPES.filter((type) => type !== 'script' && type !== 'opaque').sort());
    expect(isAuthorableBlockType('script')).toBe(false);
    expect(isAuthorableBlockType('opaque')).toBe(false);
    for (const type of AUTHORABLE_BLOCK_TYPES) expect(primitiveOf(type).kinds).toContain(type);
  });

  it('names every authorable block by the primitive it is, and its kind where the primitive has several', () => {
    expect(Object.fromEntries(AUTHORABLE_BLOCK_TYPES.map((type) => [type, blockSpec(type).label]))).toEqual({
      section: 'Section', row: 'Side by side', tabs: 'Tabs', title: 'Heading', line: 'Line', stat: 'Value', metric: 'Metric', scores: 'Table', tags: 'List',
      text: 'Text', entries: 'List', pairs: 'List', track: 'Track', counters: 'Counters', image: 'Picture', spells: 'List', heading: 'Heading', divider: 'Divider',
    });
    expect(PRIMITIVES.list.kinds.map((type) => blockSpec(type).kind)).toEqual(['A word', 'A label and a value', 'A name and text', 'A group with items']);
    expect(PRIMITIVES.heading.kinds.map((type) => blockSpec(type).kind)).toEqual(['Typed', 'From a property']);
    expect(primitiveOf('script')).toBeNull();
  });

  it('gives every primitive a lucide icon, a palette group and the block a new one gets, among its own kinds', () => {
    const groups = PALETTE_GROUPS.map((group) => group.id);
    for (const id of PRIMITIVE_IDS) {
      const primitive = PRIMITIVES[id];
      expect(lucideIcon(primitive.icon), id).toBe(true);
      expect(groups).toContain(primitive.group);
      expect(primitive.kinds).toContain(primitive.inserts);
      expect(Boolean(primitive.kindSetting), id).toBe(primitive.kinds.length > 1);
    }
    expect(PRIMITIVES.list.inserts).toBe('entries');
    expect(PRIMITIVES.heading.inserts).toBe('heading');
    // Each block type is the kind of exactly one primitive.
    expect(PRIMITIVE_IDS.flatMap((id) => PRIMITIVES[id].kinds).sort()).toEqual([...AUTHORABLE_BLOCK_TYPES].sort());
  });

  it('binds no field to layout blocks, headings and dividers', () => {
    for (const type of ['section', 'row', 'tabs', 'heading', 'divider', 'script', 'opaque'] as const) expect(blockSpec(type).binds).toEqual([]);
    expect(blockSpec('stat').binds).toEqual(['text', 'number', 'rating', 'dice', 'choice']);
    expect(bindsFieldType('track', 'number')).toBe(true);
    expect(bindsFieldType('tags', 'text')).toBe(false);
  });

  it('names the FS block type each block exports to', () => {
    expect(Object.fromEntries(ALL_TYPES.map((type) => [type, blockSpec(type).fsType]))).toEqual({
      section: 'group', row: 'inline', tabs: 'group', title: 'heading', line: 'subheading', stat: 'property', metric: 'table', scores: 'table',
      tags: 'property', text: 'text', entries: 'traits', pairs: 'saves', track: 'property', counters: 'property', image: 'image',
      spells: 'spells', heading: 'text', divider: null, script: 'javascript', opaque: null,
    });
  });

  it('lets the root and Sections take every block, Rows every block but a Row and Tabs, Tabs only Sections, and nothing else any', () => {
    for (const child of ALL_TYPES) {
      expect(canContain('root', child)).toBe(true);
      expect(canContain('section', child)).toBe(true);
      expect(canContain('row', child)).toBe(child !== 'row' && child !== 'tabs');
      expect(canContain('tabs', child)).toBe(child === 'section');
      for (const leaf of ALL_TYPES.filter((type) => type !== 'section' && type !== 'row' && type !== 'tabs')) expect(canContain(leaf, child)).toBe(false);
    }
  });

  it('makes a new Tabs block with two empty tabs, "Tab 1" and "Tab 2"', () => {
    const tabs = createBlock('tabs', idsFrom('tabs0001', 'tab00001', 'tab00002'));
    expect(tabs).toEqual({
      id: 'tabs0001', type: 'tabs', blocks: [
        { id: 'tab00001', type: 'section', heading: 'Tab 1', blocks: [] },
        { id: 'tab00002', type: 'section', heading: 'Tab 2', blocks: [] },
      ],
    });
    expect(isLegalSubtree(tabs)).toBe(true);
  });

  it('sizes blocks inside a Row by their own size, else their type', () => {
    expect(rowSizeOf({ id: 'a', type: 'stat', field: 'ac', look: 'run-in' })).toBe('fit');
    expect(rowSizeOf({ id: 'a', type: 'stat', field: 'ac', look: 'run-in', size: 'fill' })).toBe('fill');
    expect(rowSizeOf({ id: 'a', type: 'section', blocks: [] })).toBe('fill');
  });

  it('gives every field type a natural block that binds it', () => {
    for (const fieldType of FIELD_TYPES) expect(bindsFieldType(naturalBlockFor(fieldType), fieldType), fieldType).toBe(true);
    expect(Object.fromEntries(FIELD_TYPES.map((type) => [type, naturalBlockFor(type)]))).toEqual({
      text: 'stat', markdown: 'text', number: 'stat', rating: 'stat', dice: 'stat', choice: 'stat', list: 'tags',
      scores: 'scores', entries: 'entries', pairs: 'pairs', image: 'image', spells: 'spells', counters: 'counters',
    });
  });
});

describe('createBlock', () => {
  it.each([
    ['section', undefined, { blocks: [] }],
    ['row', undefined, { blocks: [] }],
    ['title', undefined, { field: 'name', level: 1 }],
    ['line', 'size', { fields: ['size'] }],
    ['line', undefined, { fields: [] }],
    ['stat', 'ac', { field: 'ac', look: 'run-in' }],
    ['stat', undefined, { field: '', look: 'run-in' }],
    ['metric', 'major', { fields: ['major'] }],
    ['metric', undefined, { fields: [''] }],
    ['scores', 'stats', { field: 'stats', orientation: 'row' }],
    ['tags', 'languages', { field: 'languages', look: 'comma' }],
    ['text', 'description', { field: 'description' }],
    ['entries', 'actions', { field: 'actions' }],
    ['pairs', 'saves', { field: 'saves' }],
    ['track', 'hp', { field: 'hp', look: 'boxes', counts: 'down' }],
    ['image', undefined, { field: 'image', shape: 'token' }],
    ['spells', 'spells', { field: 'spells' }],
    ['heading', undefined, { text: 'Heading', level: 'section' }],
    ['divider', undefined, {}],
  ] as const)('makes a %s (field %s) with its defaults', (type, field, defaults) => {
    expect(createBlock(type, idsFrom('abcd1234'), field)).toStrictEqual({ id: 'abcd1234', type, ...defaults });
  });
});
