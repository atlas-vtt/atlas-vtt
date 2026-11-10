import { describe, expect, it } from 'vitest';
import { derivedBlockId, isBlockId } from '../../../../src/app/statblocks/format/blockIds';
import { AUTHORABLE_BLOCK_TYPES, createBlock } from '../../../../src/app/statblocks/model/blockCatalogue';
import { MAX_BLOCK_DEPTH } from '../../../../src/app/statblocks/format/parseBlocks';
import { parseTemplate, type TemplateParseResult } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { TEMPLATE_FORMAT, type StatblockTemplate, type TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { blocksOf, expectSound, plain } from './templateMutations';

const FIELDS = ['name', 'hp', 'stats', 'saves', 'traits', 'image', 'stress', 'spells', 'keywords'].map((key) => ({ key, label: key, type: 'text' }));

function fileWith(blocks: unknown[]): Record<string, unknown> {
  return { format: TEMPLATE_FORMAT, version: 1, id: 'blocks-abc123', fields: FIELDS, layout: { maxColumns: 2, blocks } };
}

function read(blocks: unknown[]): TemplateParseResult & { template: StatblockTemplate } {
  const result = parseTemplate(fileWith(blocks));
  if (result.template === null) throw new Error(result.problems.join(' '));
  return { ...result, template: result.template };
}

function writtenBlocks(template: StatblockTemplate): unknown {
  return JSON.parse(serializeTemplate(template)).layout.blocks;
}

describe('known blocks', () => {
  it('fills in a missing required choice with its first option, silently', () => {
    const { template, problems } = read([
      { id: 'aaaaaaa1', type: 'title', field: 'name' },
      { id: 'aaaaaaa2', type: 'stat', field: 'hp' },
      { id: 'aaaaaaa3', type: 'scores', field: 'stats' },
      { id: 'aaaaaaa4', type: 'tags', field: 'keywords' },
      { id: 'aaaaaaa5', type: 'track', field: 'stress' },
      { id: 'aaaaaaa6', type: 'image', field: 'image' },
      { id: 'aaaaaaa7', type: 'heading', text: 'Actions' },
      { id: 'aaaaaaa8', type: 'script', fs: { type: 'javascript' } },
    ]);
    expect(problems).toEqual([]);
    expect(template.layout.blocks).toEqual([
      { id: 'aaaaaaa1', type: 'title', field: 'name', level: 1 },
      { id: 'aaaaaaa2', type: 'stat', field: 'hp', look: 'run-in' },
      { id: 'aaaaaaa3', type: 'scores', field: 'stats', orientation: 'row' },
      { id: 'aaaaaaa4', type: 'tags', field: 'keywords', look: 'comma' },
      { id: 'aaaaaaa5', type: 'track', field: 'stress', look: 'boxes', counts: 'down' },
      { id: 'aaaaaaa6', type: 'image', field: 'image', shape: 'token' },
      { id: 'aaaaaaa7', type: 'heading', text: 'Actions', level: 'section' },
      { id: 'aaaaaaa8', type: 'script', summary: '', fs: { type: 'javascript' } },
    ]);
  });

  it('reads an unknown choice as the first option and writes the file\'s choice back', () => {
    const { template, problems } = read([{ id: 'aaaaaaa1', type: 'stat', field: 'hp', look: 'tilted', display: 'roman' }]);
    expect(plain(template.layout.blocks)).toEqual([{ id: 'aaaaaaa1', type: 'stat', field: 'hp', look: 'run-in' }]);
    expect(problems).toEqual([
      expect.stringContaining('"look" is "tilted", not run-in or stacked; "run-in" is used'),
      expect.stringContaining('"display" is "roman", not plain or signed; it is ignored'),
    ]);
    expect(writtenBlocks(template)).toEqual([{ id: 'aaaaaaa1', type: 'stat', field: 'hp', look: 'tilted', display: 'roman' }]);
  });

  it('keeps unknown keys on blocks and writes them after the known ones', () => {
    const { template } = read([{ future: 1, type: 'stat', id: 'aaaaaaa1', look: 'stacked', field: 'hp', zebra: 'z', alpha: 'a' }]);
    expect(serializeTemplate(template)).toContain([
      '"id": "aaaaaaa1",', '"type": "stat",', '"field": "hp",', '"look": "stacked",', '"future": 1,', '"zebra": "z",', '"alpha": "a"',
    ].join('\n        '));
  });

  it('reads conditions of each kind and ignores ones whose parts do not fit together', () => {
    const conditions = [
      { field: 'hp', is: 'present', value: 'ignored' },
      { field: 'hp', is: 'equal', value: 'x' },
      { field: 'hp', is: 'not-equal', value: false },
      { field: 'hp', is: 'above', value: 3 },
      { field: 'hp', is: 'below', value: '3' },
      { field: 'hp', is: 'equal', value: [1] },
      { field: '', is: 'present' },
      { field: 'hp', is: 'between' },
    ];
    const { template, problems } = read(conditions.map((showWhen, index) => ({ id: `cccccc0${index}`, type: 'divider', showWhen })));
    const read_ = template.layout.blocks.map((block) => plain(block.type === 'opaque' ? undefined : block.showWhen));
    expect(read_).toEqual([
      { field: 'hp', is: 'present' }, conditions[1], conditions[2], conditions[3], undefined, undefined, conditions[6], undefined,
    ]);
    expect(problems).toHaveLength(3);
    expect(writtenBlocks(template)).toEqual(conditions.map((showWhen, index) => ({ id: `cccccc0${index}`, type: 'divider', showWhen })));
  });

  it('leaves out score columns that are no objects and keeps the list for writing back', () => {
    const columns = [{ label: 'Mod', formula: 'value', display: 'signed' }, 7];
    const { template } = read([{ id: 'aaaaaaa1', type: 'scores', field: 'stats', orientation: 'row', columns }]);
    expect(plain(template.layout.blocks[0])).toMatchObject({ columns: [columns[0]] });
    expect(writtenBlocks(template)).toEqual([{ id: 'aaaaaaa1', type: 'scores', field: 'stats', orientation: 'row', columns }]);
  });
});

describe('word list looks', () => {
  it('reads bullets and numbered beside comma and chips, and an unknown look as comma, kept for writing back', () => {
    const looks = ['comma', 'chips', 'bullets', 'numbered'];
    const { template, problems } = read(looks.map((look, index) => ({ id: `ttttttt${index}`, type: 'tags', field: 'keywords', look })));
    expect(problems).toEqual([]);
    expect(template.layout.blocks.map((block) => block.type === 'tags' && block.look)).toEqual(looks);
    const unknown = read([{ id: 'tttttttx', type: 'tags', field: 'keywords', look: 'cloud' }]);
    expect(unknown.template.layout.blocks[0]).toMatchObject({ look: 'comma' });
    expect(writtenBlocks(unknown.template)).toEqual([{ id: 'tttttttx', type: 'tags', field: 'keywords', look: 'cloud' }]);
  });
});

describe('tabs', () => {
  it('reads and writes a Tabs block of Sections and a Spells block with the tabs look as they were', () => {
    const blocks = [
      {
        id: 'tabs0001', type: 'tabs', className: 'kinds', blocks: [
          { id: 'tab00001', type: 'section', heading: 'Spells', blocks: [{ id: 'spells01', type: 'spells', field: 'spells', look: 'tabs' }] },
          { id: 'tab00002', type: 'section', headingField: 'name', blocks: [] },
        ],
      },
    ];
    const { template, problems } = read(blocks);
    expect(problems).toEqual([]);
    expect(template.layout.blocks).toEqual(blocks);
    expect(writtenBlocks(template)).toEqual(blocks);
  });

  it('reads and writes the heading of a Tabs block, written before its tabs', () => {
    const blocks = [{
      id: 'tabs0001', type: 'tabs', heading: 'Spellbook', blocks: [
        { id: 'tab00001', type: 'section', heading: 'Cantrips', blocks: [{ id: 'entries1', type: 'entries', field: 'spells' }] },
      ],
    }];
    const { template, problems } = read(blocks);
    expect(problems).toEqual([]);
    expect(template.layout.blocks[0]).toMatchObject({ type: 'tabs', heading: 'Spellbook' });
    const written = writtenBlocks(template) as Array<Record<string, unknown>>;
    expect(written).toEqual(blocks);
    expect(Object.keys(written[0]!)).toEqual(['id', 'type', 'heading', 'blocks']);
    expect(read([{ ...blocks[0], heading: 3 }]).problems).toEqual([expect.stringContaining('heading')]);
  });

  it('reads a Spells look it does not know as the lines, keeping it to write back', () => {
    const { template, problems } = read([{ id: 'spells01', type: 'spells', field: 'spells', look: 'cards' }]);
    expect(plain(template.layout.blocks[0])).toEqual({ id: 'spells01', type: 'spells', field: 'spells' });
    expect(problems).toEqual([expect.stringContaining('look')]);
    expect(writtenBlocks(template)).toEqual([{ id: 'spells01', type: 'spells', field: 'spells', look: 'cards' }]);
  });
});

describe('blocks the editor makes', () => {
  it('reads every new block as createBlock makes it, unbound fields included', () => {
    let next = 0;
    const blocks = AUTHORABLE_BLOCK_TYPES.map((type) => createBlock(type, () => `new${String(next++).padStart(5, '0')}`));
    expect(blocks.some((block) => 'field' in block && block.field === '')).toBe(true);
    const { template, problems } = read(blocks);
    expect(problems).toEqual([]);
    expect(template.layout.blocks).toEqual(blocks);
    expect(writtenBlocks(template)).toEqual(blocks);
  });
});

describe('blocks it cannot use', () => {
  it.each([
    ['a type it does not know', { id: 'aaaaaaa1', type: 'carousel', slides: [{ a: 1 }] }, /"carousel"/],
    ['no type', { id: 'aaaaaaa1', field: 'hp' }, /type nothing/],
    ['the in-memory type "opaque"', { id: 'aaaaaaa1', type: 'opaque', raw: {} }, /"opaque"/],
    ['a Title without a field', { id: 'aaaaaaa1', type: 'title', level: 2 }, /has no valid "field"/],
    ['a Line whose fields are no list', { id: 'aaaaaaa1', type: 'line', fields: 'hp' }, /has no valid "fields"/],
    ['a Heading without text', { id: 'aaaaaaa1', type: 'heading' }, /has no valid "text"/],
    ['a Script without its FS block', { id: 'aaaaaaa1', type: 'script', summary: 'x' }, /has no valid "fs"/],
  ])('keeps %s opaque and writes it back exactly', (_name, block, problem) => {
    const { template, problems } = read([block]);
    expect(template.layout.blocks).toEqual([{ id: 'aaaaaaa1', type: 'opaque', raw: block }]);
    expect(problems).toEqual([expect.stringMatching(problem)]);
    expect(writtenBlocks(template)).toEqual([block]);
  });

  it('keeps the raw key order of an opaque block', () => {
    const block = { zeta: 1, type: 'carousel', alpha: { b: 2, a: 1 }, id: 'aaaaaaa1' };
    expect(serializeTemplate(read([block]).template)).toContain(JSON.stringify(block, null, 2).split('\n').join('\n      '));
  });

  it('leaves out entries that are no blocks and writes the list back as it was', () => {
    const blocks = [5, { id: 'aaaaaaa1', type: 'divider' }, null, 'title'];
    const { template, problems } = read(blocks);
    expect(template.layout.blocks).toEqual([{ id: 'aaaaaaa1', type: 'divider' }]);
    expect(problems).toHaveLength(3);
    expect(writtenBlocks(template)).toEqual(blocks);
  });

  it(`keeps blocks nested deeper than ${MAX_BLOCK_DEPTH} opaque`, () => {
    let block: Record<string, unknown> = { type: 'title', field: 'name' };
    for (let level = 0; level < MAX_BLOCK_DEPTH + 5; level += 1) block = { type: 'section', blocks: [block] };
    const { template } = read([block]);
    expectSound(template);
    const all = blocksOf(template.layout.blocks);
    expect(all).toHaveLength(MAX_BLOCK_DEPTH + 1);
    expect(all.slice(0, -1).every((each) => each.type === 'section')).toBe(true);
    expect(all.at(-1)?.type).toBe('opaque');
    const again = parseTemplate(serializeTemplate(template));
    expect(serializeTemplate(again.template as StatblockTemplate)).toBe(serializeTemplate(template));
  });

  it('leaves out what is nested too deep to write back, and never throws', () => {
    let block: unknown = { type: 'title', field: 'name' };
    for (let level = 0; level < 400; level += 1) block = { type: 'carousel', blocks: [block] };
    const { template, problems } = read([block]);
    expect(template.layout.blocks).toEqual([]);
    expect(problems).toEqual([expect.stringContaining('cannot be kept')]);
    expect(() => serializeTemplate(template)).not.toThrow();
  });
});

describe('block ids', () => {
  const idsOf = (template: StatblockTemplate): string[] => blocksOf(template.layout.blocks).map((block) => block.id);

  it('derives an id from the block\'s place when the file has none', () => {
    const { template, problems } = read([{ type: 'divider' }, { type: 'row', blocks: [{ type: 'divider' }] }]);
    expect(problems).toEqual([]);
    expect(idsOf(template)).toEqual([derivedBlockId([0], 0), derivedBlockId([1], 0), derivedBlockId([1, 0], 0)]);
    expect(idsOf(template).every(isBlockId)).toBe(true);
  });

  it('gives a block with a malformed id a new one', () => {
    const { template, problems } = read([{ id: 'Header', type: 'divider' }, { id: 7, type: 'divider' }]);
    expect(idsOf(template)).toEqual([derivedBlockId([0], 0), derivedBlockId([1], 0)]);
    expect(problems).toEqual([expect.stringContaining('"Header" is not 8'), expect.stringContaining('7 is not 8')]);
  });

  it('keeps the first of two equal ids and gives the second a new one', () => {
    const { template, problems } = read([
      { id: 'samesame', type: 'divider' }, { type: 'row', blocks: [{ id: 'samesame', type: 'divider' }] },
    ]);
    expect(idsOf(template)).toEqual(['samesame', derivedBlockId([1], 0), derivedBlockId([1, 0], 0)]);
    expect(problems).toEqual([expect.stringContaining('already used')]);
  });

  it('never hands out an id a later block holds in the file', () => {
    const taken = derivedBlockId([0], 0);
    const { template } = read([{ type: 'divider' }, { id: taken, type: 'divider' }]);
    expect(idsOf(template)).toEqual([derivedBlockId([0], 1), taken]);
  });

  it('gives opaque blocks ids too, and writes them back without one', () => {
    const { template } = read([{ type: 'carousel' }]);
    expect(isBlockId(template.layout.blocks[0]?.id)).toBe(true);
    expect(writtenBlocks(template)).toEqual([{ type: 'carousel' }]);
  });

  it('writes derived ids, so the next read keeps them', () => {
    const first = read([{ type: 'divider' }, { type: 'section', blocks: [{ type: 'title', field: 'name' }] }]).template;
    const second = parseTemplate(serializeTemplate(first));
    expect(second.problems).toEqual([]);
    expect(idsOf(second.template as StatblockTemplate)).toEqual(idsOf(first));
  });
});

describe('the layout', () => {
  it('reads maxColumns 1 to 3 and defaults to 2', () => {
    const layoutOf = (layout: unknown): unknown => plain(parseTemplate({ ...fileWith([]), layout }).template?.layout);
    expect(layoutOf({ maxColumns: 3, columnWidth: 18.5, blocks: [] })).toEqual({ maxColumns: 3, columnWidth: 18.5, blocks: [] });
    expect(layoutOf({ blocks: [] })).toEqual({ maxColumns: 2, blocks: [] });
    expect(layoutOf({ maxColumns: 4, columnWidth: -1, blocks: [] })).toEqual({ maxColumns: 2, blocks: [] });
  });

  it('keeps unknown layout keys', () => {
    const layout = { maxColumns: 1, blocks: [] as TemplateBlock[], gap: 's' };
    expect(parseTemplate({ ...fileWith([]), layout }).template?.layout).toEqual(layout);
  });
});
