import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate, templateToJson } from '../../../../src/app/statblocks/format/templateFormat';
import { TEMPLATE_FORMAT, type StatblockTemplate, type TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import {
  EVERY_BLOCK, EVERY_BLOCK_JSON, FIVE_E_2024, FIVE_E_2024_JSON, MARSH_CREATURE, MARSH_CREATURE_JSON,
} from '../../../fixtures/statblockTemplateFixtures';

function reversedKeys<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).reverse()) as T;
}

function reversedBlock(block: TemplateBlock): TemplateBlock {
  if (block.type === 'section' || block.type === 'row') return reversedKeys({ ...block, blocks: block.blocks.map(reversedBlock) });
  return reversedKeys(block);
}

/** The template with the keys of every object it models in reverse order; records (lookups, sample) are content and keep theirs. */
function reversed(template: StatblockTemplate): StatblockTemplate {
  return reversedKeys({
    ...template,
    fields: template.fields.map(reversedKeys),
    layout: reversedKeys({ ...template.layout, blocks: template.layout.blocks.map(reversedBlock) }),
  });
}

function templateOf(text: string, allowBuiltIn = false): StatblockTemplate {
  const result = parseTemplate(text, { allowBuiltIn });
  if (result.template === null) throw new Error(result.problems.join(' '));
  return result.template;
}

describe('serializeTemplate', () => {
  it('writes the every-block template exactly as its file, in the fixed key order', () => {
    expect(serializeTemplate(EVERY_BLOCK)).toBe(EVERY_BLOCK_JSON);
  });

  it('writes 2-space JSON with a trailing newline', () => {
    const text = serializeTemplate(MARSH_CREATURE);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.split('\n')[1]).toBe('  "format": "atlas-statblock-template",');
    expect(JSON.parse(text)).toEqual(templateToJson(MARSH_CREATURE));
  });

  it('does not depend on the order of known keys in memory', () => {
    for (const template of [MARSH_CREATURE, FIVE_E_2024]) {
      expect(serializeTemplate(reversed(template))).toBe(serializeTemplate(template));
    }
  });

  it('writes the known keys of each object first, then unknown ones in the order they were read', () => {
    const json = templateToJson(EVERY_BLOCK);
    expect(Object.keys(json)).toEqual([
      'format', 'version', 'id', 'description', 'suits', 'derivedFrom', 'source', 'importedFrom', 'fields', 'layout',
      'lookups', 'sample', 'pinnedPreview', 'accent',
    ]);
    const stat = (json.layout as { blocks: Record<string, unknown>[] }).blocks[2];
    expect(Object.keys(stat ?? {})).toEqual([
      'id', 'type', 'field', 'label', 'look', 'pattern', 'display', 'rollFrom', 'rollable', 'showWhen', 'whenEmpty', 'fallback',
      'className', 'tooltip', 'emphasis',
    ]);
  });

  it('writes a container\'s children after its own keys', () => {
    const row = (templateToJson(EVERY_BLOCK).layout as { blocks: Record<string, unknown>[] }).blocks[0];
    expect(Object.keys(row ?? {})).toEqual(['id', 'type', 'align', 'blocks']);
  });

  it('leaves out keys holding undefined', () => {
    const template = { ...MARSH_CREATURE, description: undefined } as unknown as StatblockTemplate;
    expect(templateToJson(template)).not.toHaveProperty('description');
  });

  it('writes back what parsing kept after edits elsewhere, as Immer makes them', () => {
    const template = templateOf(JSON.stringify({
      format: TEMPLATE_FORMAT, version: 1, id: 'kept-abc123', fields: [{ key: 'hp', label: 'HP', type: 'vitality' }],
      layout: { maxColumns: 5, blocks: [{ id: 'aaaaaaa1', type: 'title', field: 'hp', level: 9 }] },
    }));
    const edited = produce(template, (draft) => {
      draft.description = 'Edited';
      const title = draft.layout.blocks[0];
      if (title?.type === 'title') title.pattern = '{hp}';
    });
    const written = JSON.parse(serializeTemplate(edited));
    expect(written.fields[0].type).toBe('vitality');
    expect(written.layout.maxColumns).toBe(5);
    expect(written.layout.blocks[0]).toEqual({ id: 'aaaaaaa1', type: 'title', field: 'hp', level: 9, pattern: '{hp}' });
    const chosen = produce(edited, (draft) => {
      draft.layout.maxColumns = 1;
    });
    expect(JSON.parse(serializeTemplate(chosen)).layout.maxColumns).toBe(1);
  });
});

describe('serialize ∘ parse', () => {
  it.each([
    ['Marsh creature', MARSH_CREATURE_JSON, false],
    ['5E 2024', FIVE_E_2024_JSON, true],
    ['every block', EVERY_BLOCK_JSON, false],
  ])('is a fixed point after one pass for %s', (_name, text, allowBuiltIn) => {
    const once = serializeTemplate(templateOf(text, allowBuiltIn));
    const twice = serializeTemplate(templateOf(once, allowBuiltIn));
    expect(twice).toBe(once);
    expect(JSON.parse(once)).toMatchObject({ format: TEMPLATE_FORMAT });
  });

  it('keeps every value of the plan\'s files', () => {
    expect(JSON.parse(serializeTemplate(templateOf(MARSH_CREATURE_JSON)))).toEqual(JSON.parse(MARSH_CREATURE_JSON));
  });

  it('reads back a block that folds while empty and a field meant as the display name', () => {
    const template = produce(MARSH_CREATURE, (draft) => {
      draft.fields.push({ key: 'title', label: 'Title', type: 'text', meaning: 'display-name' });
      draft.fields.push({ key: 'fage_stats', label: 'Fantasy AGE', type: 'scores', slots: ['Accuracy', 'Fighting'] });
      draft.layout.blocks.push({ id: 'fage0000', type: 'scores', field: 'fage_stats', orientation: 'row', whenEmpty: 'fold' });
    });
    const text = serializeTemplate(template);
    expect(JSON.parse(text)).toMatchObject({ layout: { blocks: expect.arrayContaining([expect.objectContaining({ id: 'fage0000', whenEmpty: 'fold' })]) } });
    const parsed = parseTemplate(text);
    expect(parsed.problems).toEqual([]);
    expect(parsed.template).toEqual(template);
    expect(serializeTemplate(templateOf(text))).toBe(text);
  });
});
