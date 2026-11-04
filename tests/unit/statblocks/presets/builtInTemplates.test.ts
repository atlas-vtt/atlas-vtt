import { describe, expect, it } from 'vitest';
import { isExpressionError } from '../../../../src/app/statblocks/expressions/errors';
import { parsePattern } from '../../../../src/app/statblocks/expressions/patternParse';
import { renderPattern } from '../../../../src/app/statblocks/expressions/pattern';
import { isBlockId } from '../../../../src/app/statblocks/format/blockIds';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { allBuiltInTemplates, builtInTemplate } from '../../../../src/app/statblocks/library/builtInTemplates';
import { bindsFieldType, canContain } from '../../../../src/app/statblocks/model/blockCatalogue';
import { headerKey, headerParts, withHeaderFields } from '../../../../src/app/statblocks/model/templateHeader';
import { fieldsShownBy, flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import { isReservedKey } from '../../../../src/app/statblocks/model/reservedKeys';
import { sampleRecord } from '../../../../src/app/statblocks/model/sampleValues';
import { isValidTemplateId } from '../../../../src/app/statblocks/model/templateIds';
import { BUILT_IN_TEMPLATES } from '../../../../src/app/statblocks/presets';
import { readerFor } from '../../../../src/app/statblocks/values/fieldValues';
import { columnFormulas, formulaReads, patternReads, patternsOf, placedBlocks } from './builtInWalk';

const SHIPPED = [
  ['builtin:generic-creature', 'Creature'],
  ['builtin:generic-npc', 'NPC'],
  ['builtin:generic-hazard', 'Hazard'],
  ['builtin:d20-creature', 'd20 creature'],
  ['builtin:bx-creature', 'B/X-style creature'],
  ['builtin:percentile-creature', 'Percentile creature'],
  ['builtin:narrative-npc', 'Narrative NPC'],
  ['builtin:5e-2024-monster', '5E (2024 rules)'],
  ['builtin:5e-2014-monster', '5E (2014 rules)'],
  ['builtin:cairn-creature', 'Cairn'],
  ['builtin:draw-steel-monster', 'Draw Steel'],
  ['builtin:fate-npc', 'Fate NPC'],
];

const each = BUILT_IN_TEMPLATES.map((builtIn) => [builtIn.id, builtIn] as const);

describe('the built-in templates', () => {
  it('are the twelve of v1, under their fixed ids and names', () => {
    expect(BUILT_IN_TEMPLATES.map((builtIn) => [builtIn.id, builtIn.name])).toEqual(SHIPPED);
  });

  it('carry their own id in the template and a valid one', () => {
    for (const builtIn of BUILT_IN_TEMPLATES) {
      expect(builtIn.template.id).toBe(builtIn.id);
      expect(isValidTemplateId(builtIn.id)).toBe(true);
      expect(Number.isSafeInteger(builtIn.revision) && builtIn.revision >= 1).toBe(true);
    }
  });

  it('are frozen, so no reader can change what every other reader sees', () => {
    for (const builtIn of BUILT_IN_TEMPLATES) {
      expect(Object.isFrozen(builtIn)).toBe(true);
      expect(Object.isFrozen(builtIn.template.fields[0])).toBe(true);
      expect(Object.isFrozen(builtIn.template.layout.blocks)).toBe(true);
    }
    expect(Object.isFrozen(BUILT_IN_TEMPLATES)).toBe(true);
  });

  it('are looked up by id in the library, each with a field for every part of its header and frozen', () => {
    expect(allBuiltInTemplates().map((builtIn) => builtIn.id)).toEqual(BUILT_IN_TEMPLATES.map((builtIn) => builtIn.id));
    for (const builtIn of BUILT_IN_TEMPLATES) {
      const read = builtInTemplate(builtIn.id);
      expect(read).toEqual({ ...builtIn, template: withHeaderFields(builtIn.template) });
      expect(read && Object.isFrozen(read.template.layout.blocks)).toBe(true);
      expect(read && withHeaderFields(read.template), builtIn.id).toBe(read?.template);
    }
    // A system keeps its own keys: 5E's challenge stays `cr`, Draw Steel's hit points `stamina`.
    const fiveE = builtInTemplate('builtin:5e-2024-monster')?.template;
    expect(fiveE && headerKey(fiveE.fields, 'level')).toBe('cr');
    const drawSteel = builtInTemplate('builtin:draw-steel-monster')?.template;
    expect(drawSteel && headerKey(drawSteel.fields, 'hp')).toBe('stamina');
    expect(builtInTemplate('builtin:nothing')).toBeNull();
    expect(builtInTemplate('generic-creature')).toBeNull();
    expect(builtInTemplate('constructor')).toBeNull();
  });
});

describe.each(each)('%s', (_id, builtIn) => {
  const { template } = builtIn;
  const keys = new Set(template.fields.map((field) => field.key));
  const fieldOf = (key: string): (typeof template.fields)[number] | undefined => template.fields.find((field) => field.key === key);
  const placed = placedBlocks(template.layout.blocks);

  it('parses as a built-in with no problems', () => {
    const result = parseTemplate(template, { allowBuiltIn: true });
    expect(result.problems).toEqual([]);
    expect(result.status).toBe('ok');
  });

  it('is refused as a file, so no file can stand in for it', () => {
    expect(parseTemplate(serializeTemplate(template)).status).toBe('reserved');
  });

  it('writes and reads back unchanged (serialize ∘ parse is a fixed point)', () => {
    const text = serializeTemplate(template);
    const read = parseTemplate(text, { allowBuiltIn: true });
    if (read.template === null) throw new Error('the written template does not read');
    expect(serializeTemplate(read.template)).toBe(text);
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(template)));
  });

  it('has unique, usable field keys and unique block ids', () => {
    expect(keys.size).toBe(template.fields.length);
    for (const key of keys) expect(isReservedKey(key), key).toBe(false);
    const ids = placed.map(({ block }) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isBlockId(id), id).toBe(true);
  });

  it('nests only what the catalogue allows and binds fields of the types each block shows', () => {
    for (const { block, parent } of placed) {
      expect(canContain(parent, block.type), `${block.type} in ${parent}`).toBe(true);
      const bound = block.type === 'line' ? block.fields : 'field' in block && typeof block.field === 'string' ? [block.field] : [];
      for (const key of bound) {
        const field = fieldOf(key);
        expect(field, `${block.id} shows ${key}`).toBeDefined();
        if (field) expect(bindsFieldType(block.type, field.type), `${block.id} (${block.type}) shows ${field.type}`).toBe(true);
      }
    }
  });

  it('reads only defined fields and defined lookup tables in its patterns and formulas', () => {
    const tables = new Set(Object.keys(template.lookups ?? {}));
    for (const { block } of placed) {
      for (const pattern of patternsOf(block)) {
        const reads = patternReads(pattern);
        for (const key of reads.keys) expect(keys.has(key), `${block.id} reads ${key}`).toBe(true);
        for (const table of reads.tables) expect(tables.has(table), `${block.id} looks up ${table}`).toBe(true);
      }
      for (const formula of columnFormulas(block)) {
        for (const key of formulaReads(formula)) expect(keys.has(key), `${block.id} computes from ${key}`).toBe(true);
      }
    }
  });

  it('renders every pattern over its sample without a problem', () => {
    const record = sampleRecord(template);
    for (const { block } of placed) {
      for (const pattern of patternsOf(block)) {
        const ast = parsePattern(pattern);
        if (isExpressionError(ast)) throw new Error(ast.message);
        const rendered = renderPattern(ast, readerFor(record, template.fields), { lookups: template.lookups });
        expect(rendered.problems, `${block.id}: ${pattern}`).toEqual([]);
        expect(rendered.text, `${block.id}: ${pattern}`).not.toBe('');
      }
    }
  });

  it('gives a sample only for fields it defines, with a neutral name', () => {
    for (const key of Object.keys(template.sample ?? {})) expect(keys.has(key), key).toBe(true);
    expect(String(template.sample?.name)).toMatch(/^(Creature|Character|Hazard) name$/);
  });

  it('starts with the name and the portrait', () => {
    expect(template.fields[0]).toEqual({ key: 'name', label: 'Name', type: 'text' });
    expect(keys.has('image')).toBe(true);
  });

  it('leaves the header to Atlas: defines a field for each part it shows, and lays out no block that shows only one', () => {
    for (const part of headerParts(template)) {
      if (!part.hidden) expect(keys.has(part.key), `${part.id} shows ${part.key}`).toBe(true);
      const alone = flattenReadingOrder(template.layout.blocks).filter((block) => {
        const shown = fieldsShownBy(block);
        return shown.length === 1 && shown[0] === part.key && block.type !== 'stat';
      });
      expect(alone.map((block) => block.id), `${part.id} laid out again`).toEqual([]);
    }
    expect(flattenReadingOrder(template.layout.blocks).filter((block) => block.type === 'title' || block.type === 'image')).toEqual([]);
  });
});
