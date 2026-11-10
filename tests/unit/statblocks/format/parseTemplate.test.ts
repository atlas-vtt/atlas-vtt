import { describe, expect, it } from 'vitest';
import { isBlockId } from '../../../../src/app/statblocks/format/blockIds';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { TEMPLATE_FORMAT, type StatblockTemplate, type TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import {
  EVERY_BLOCK, EVERY_BLOCK_JSON, FIVE_E_2024, FIVE_E_2024_JSON, MARSH_CREATURE, MARSH_CREATURE_JSON, NEWER_BLOCK,
} from '../../../fixtures/statblockTemplateFixtures';
import { blocksOf, plain } from './templateMutations';

const minimal = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: TEMPLATE_FORMAT, version: 1, id: 'tiny-abc123', fields: [], layout: { maxColumns: 2, blocks: [] }, ...extra,
});

function withoutIds(blocks: readonly TemplateBlock[]): unknown[] {
  return blocks.map(({ id: _id, ...block }) => ('blocks' in block ? { ...block, blocks: withoutIds(block.blocks) } : block));
}

function parsed(input: unknown): StatblockTemplate {
  const result = parseTemplate(input);
  if (result.template === null) throw new Error(`no template: ${result.problems.join(' ')}`);
  return result.template;
}

describe('parseTemplate: the plan\'s templates', () => {
  it('reads the Marsh creature (§5.4) exactly, without problems', () => {
    expect(parseTemplate(MARSH_CREATURE_JSON)).toEqual({ template: MARSH_CREATURE, status: 'ok', problems: [] });
  });

  it('reads the same from a value already parsed', () => {
    expect(parseTemplate(JSON.parse(MARSH_CREATURE_JSON))).toEqual(parseTemplate(MARSH_CREATURE_JSON));
  });

  it('refuses the 5E 2024 file: its id belongs to a built-in', () => {
    const result = parseTemplate(FIVE_E_2024_JSON);
    expect(result.status).toBe('reserved');
    expect(result.template).toBeNull();
    expect(result.problems).toEqual([expect.stringContaining('builtin:5e-2024-monster')]);
  });

  it('reads the 5E 2024 template (§5.8) with allowBuiltIn and derives the block ids it leaves out', () => {
    const result = parseTemplate(FIVE_E_2024_JSON, { allowBuiltIn: true });
    expect(result.status).toBe('ok');
    expect(result.problems).toEqual([]);
    const template = result.template as StatblockTemplate;
    expect({ ...template, layout: { ...template.layout, blocks: withoutIds(template.layout.blocks) } })
      .toEqual({ ...FIVE_E_2024, layout: { ...FIVE_E_2024.layout, blocks: withoutIds(FIVE_E_2024.layout.blocks) } });
    const ids = blocksOf(template.layout.blocks).map((block) => block.id);
    expect(ids.every(isBlockId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('derives the same ids every time', () => {
    const first = parseTemplate(FIVE_E_2024_JSON, { allowBuiltIn: true });
    const second = parseTemplate(FIVE_E_2024_JSON, { allowBuiltIn: true });
    expect(second).toEqual(first);
  });

  it('reads every block type, keeps a newer block opaque and keeps unknown keys', () => {
    const result = parseTemplate(EVERY_BLOCK_JSON);
    expect(result.status).toBe('ok');
    expect(result.template).toEqual(EVERY_BLOCK);
    expect(result.problems).toEqual([expect.stringContaining('"carousel"')]);
    expect(result.template?.layout.blocks.at(-1)).toEqual({ id: NEWER_BLOCK.id, type: 'opaque', raw: NEWER_BLOCK });
  });

  it('does not share objects with its input', () => {
    const file = JSON.parse(EVERY_BLOCK_JSON);
    const template = parsed(file);
    file.layout.blocks[14].slides[0].label = 'Changed';
    file.pinnedPreview.width = 1;
    expect(template).toEqual(EVERY_BLOCK);
  });
});

describe('parseTemplate: what is no template', () => {
  it.each([
    ['broken JSON', '{"format": ', /not valid JSON/],
    ['an empty file', '', /not valid JSON/],
    ['null', 'null', /holds null/],
    ['a list', '[]', /holds a list/],
    ['a string', '"template"', /holds "template"/],
    ['another format', JSON.stringify(minimal({ format: 'atlas-map' })), /"format" is "atlas-map"/],
    ['no format', JSON.stringify(minimal({ format: undefined })), /"format" is nothing/],
    ['no version', JSON.stringify(minimal({ version: undefined })), /"version"/],
    ['version 0', JSON.stringify(minimal({ version: 0 })), /"version" is 0/],
    ['a fractional version', JSON.stringify(minimal({ version: 1.5 })), /"version" is 1.5/],
    ['a version as text', JSON.stringify(minimal({ version: '1' })), /"version" is "1"/],
    ['no id', JSON.stringify(minimal({ id: undefined })), /"id" is nothing/],
    ['an id with spaces', JSON.stringify(minimal({ id: 'my template-abc123' })), /"id"/],
    ['an id without its suffix', JSON.stringify(minimal({ id: 'marsh-creature' })), /"id"/],
    ['an upper-case id', JSON.stringify(minimal({ id: 'Marsh-ABC123' })), /"id"/],
    ['a numeric id', JSON.stringify(minimal({ id: 7 })), /"id" is 7/],
  ])('%s is invalid', (_name, text, problem) => {
    const result = parseTemplate(text);
    expect(result.status).toBe('invalid');
    expect(result.template).toBeNull();
    expect(result.problems).toEqual([expect.stringMatching(problem)]);
  });

  it('reads a file that starts with a byte order mark', () => {
    expect(parseTemplate(`﻿${MARSH_CREATURE_JSON}`).template).toEqual(MARSH_CREATURE);
  });

  it('refuses any id claiming the built-in prefix, well formed or not', () => {
    expect(parseTemplate(minimal({ id: 'builtin:generic-creature' })).status).toBe('reserved');
    expect(parseTemplate(minimal({ id: 'builtin:Not A Slug' })).status).toBe('reserved');
    expect(parseTemplate(minimal({ id: 'builtin:Not A Slug' }), { allowBuiltIn: true }).status).toBe('invalid');
  });

  it('still reads vault templates with allowBuiltIn', () => {
    expect(parseTemplate(MARSH_CREATURE_JSON, { allowBuiltIn: true }).template).toEqual(MARSH_CREATURE);
  });

  it('never throws, even on an object whose getters throw', () => {
    const hostile = new Proxy(minimal(), { get: () => { throw new Error('trap'); } });
    expect(() => parseTemplate(hostile)).not.toThrow();
    expect(parseTemplate(hostile)).toMatchObject({ status: 'invalid', template: null });
    const getter = { ...minimal(), get description(): string { throw new Error('no'); } };
    expect(parseTemplate(getter)).toMatchObject({ status: 'invalid', problems: [expect.stringContaining('no')] });
  });
});

describe('parseTemplate: newer formats', () => {
  it('reads a newer template as far as it can and marks it read-only', () => {
    const file = { ...JSON.parse(MARSH_CREATURE_JSON), version: 2, futureSetting: true };
    const result = parseTemplate(file);
    expect(result.status).toBe('newer');
    expect(result.template).toEqual({ ...MARSH_CREATURE, version: 2, futureSetting: true });
  });

  it('keeps blocks of types it does not know in a newer template', () => {
    const file = minimal({ version: 7, layout: { maxColumns: 2, blocks: [{ id: 'abcdefgh', type: 'carousel', items: [1] }] } });
    const result = parseTemplate(file);
    expect(result.status).toBe('newer');
    expect(result.template?.layout.blocks).toEqual([{ id: 'abcdefgh', type: 'opaque', raw: { id: 'abcdefgh', type: 'carousel', items: [1] } }]);
  });
});

describe('parseTemplate: repairing the body', () => {
  it('reads a template without fields or layout as empty and says so', () => {
    const result = parseTemplate({ format: TEMPLATE_FORMAT, version: 1, id: 'bare-abc123' });
    expect(result.status).toBe('ok');
    expect(result.template).toEqual({ format: TEMPLATE_FORMAT, version: 1, id: 'bare-abc123', fields: [], layout: { maxColumns: 2, blocks: [] } });
    expect(result.problems).toEqual([expect.stringContaining('"fields"'), expect.stringContaining('"layout"')]);
  });

  it('keeps fields and a layout it cannot read for writing back', () => {
    const template = parsed(minimal({ fields: 'none', layout: 4 }));
    expect(template.fields).toEqual([]);
    expect(template.layout).toEqual({ maxColumns: 2, blocks: [] });
    const written = JSON.parse(serializeTemplate(template));
    expect(written.fields).toBe('none');
    expect(written.layout).toBe(4);
  });

  it('ignores template values of the wrong kind, keeping them in the file', () => {
    const result = parseTemplate(minimal({ description: 5, suits: ['npc', 3], sample: [1] }));
    expect(result.template?.description).toBeUndefined();
    expect(result.template?.suits).toEqual(['npc']);
    expect(result.template?.sample).toBeUndefined();
    expect(result.problems).toHaveLength(3);
    const written = JSON.parse(serializeTemplate(result.template as StatblockTemplate));
    expect(written).toMatchObject({ description: 5, suits: ['npc', 3], sample: [1] });
  });

  it('reads "Roll as a bonus" only where it is on, and keeps another value as written', () => {
    const fields = [{ key: 'agi', label: 'Agility', type: 'number' }, { key: 'exp', label: 'Experiences', type: 'pairs' }];
    const result = parseTemplate(minimal({
      fields,
      layout: { maxColumns: 2, blocks: [
        { id: 'traits01', type: 'metric', fields: ['agi'], rollable: true },
        { id: 'experie1', type: 'pairs', field: 'exp', rollable: 'yes' },
      ] },
    }));
    const [metric, pairs] = result.template?.layout.blocks ?? [];
    expect(metric).toMatchObject({ type: 'metric', rollable: true });
    expect(pairs).not.toHaveProperty('rollable');
    expect(result.problems).toHaveLength(1);
    const written = JSON.parse(serializeTemplate(result.template as StatblockTemplate)) as { layout: { blocks: unknown[] } };
    expect(written.layout.blocks).toMatchObject([{ rollable: true }, { rollable: 'yes' }]);
  });

  it('reads derivedFrom, source and importedFrom only when whole', () => {
    const template = parsed(minimal({
      derivedFrom: { templateId: 'builtin:generic-creature', revision: -1 },
      source: { system: '5E', label: 'SRD', licences: ['CC-BY-4.0', 'Proprietary'], attribution: 'A', licenceUrl: 'u', modification: 'm' },
      importedFrom: { layoutName: 'Basic' },
    }));
    expect(plain(template.derivedFrom)).toEqual({ templateId: 'builtin:generic-creature' });
    expect(plain(template.source?.licences)).toEqual(['CC-BY-4.0']);
    expect(template.importedFrom).toBeUndefined();
    expect(parsed(minimal({ source: { system: '5E' } })).source).toBeUndefined();
    expect(parsed(minimal({ derivedFrom: { revision: 2 } })).derivedFrom).toBeUndefined();
  });

  it('reads numbers in lookup tables as text and leaves out what is no text', () => {
    const template = parsed(minimal({ lookups: { xp: { '1': 200, '2': '450', '3': true }, broken: 'no' } }));
    expect(template.lookups).toEqual({ xp: { '1': '200', '2': '450' } });
    expect(JSON.parse(serializeTemplate(template)).lookups).toEqual({ xp: { '1': 200, '2': '450', '3': true }, broken: 'no' });
    expect(parsed(minimal({ lookups: { xp: { '1': 200 } } })).lookups).toEqual({ xp: { '1': '200' } });
  });

  it('names blocks that show a field the template does not define, and keeps them', () => {
    const result = parseTemplate(minimal({
      fields: [{ key: 'hp', label: 'HP', type: 'number' }],
      layout: { maxColumns: 2, blocks: [
        { id: 'aaaaaaaa', type: 'stat', field: 'hp', look: 'run-in', rollFrom: 'hit_dice' },
        { id: 'bbbbbbbb', type: 'line', fields: ['size', 'hp'], showWhen: { field: 'gone', is: 'present' } },
      ] },
    }));
    expect(result.status).toBe('ok');
    expect(result.template?.layout.blocks).toHaveLength(2);
    expect(result.problems).toEqual([
      expect.stringMatching(/Block 1 \(stat\) names the field "hit_dice"/),
      expect.stringMatching(/Block 2 \(line\) names the field "size"/),
      expect.stringMatching(/Block 2 \(line\) names the field "gone"/),
    ]);
  });
});
