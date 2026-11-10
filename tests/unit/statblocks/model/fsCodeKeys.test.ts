import { describe, expect, it } from 'vitest';
import { FS_CODE_KEYS, findCode, isCodeKey, stripCode } from '../../../../src/app/statblocks/model/fsCodeKeys';
import { TEMPLATE_FORMAT, TEMPLATE_VERSION, type StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { deepFreeze, int, mulberry32, pick, type Random } from './treeFixtures';

describe('isCodeKey', () => {
  it.each([
    ['callback', {}, true],
    ['diceCallback', {}, true],
    ['diceParsing', {}, true],
    ['modifier', {}, false],
    ['modifier', { blockType: 'table' }, true],
    ['modifier', { blockType: 'property' }, false],
    ['code', { blockType: 'javascript' }, true],
    ['code', {}, false],
    ['condition', { list: 'conditions' }, true],
    ['condition', {}, false],
    ['parser', { list: 'diceParsing' }, true],
    ['parser', { list: 'other' }, false],
    ['desc', { blockType: 'table', list: 'conditions' }, false],
  ] as const)('%s in %j: %s', (key, context, code) => {
    expect(isCodeKey(key, context)).toBe(code);
  });

  it('lists each rule once', () => {
    expect(new Set(FS_CODE_KEYS.map((rule) => `${rule.key}|${rule.blockType ?? ''}|${rule.list ?? ''}`)).size).toBe(FS_CODE_KEYS.length);
  });
});

function templateWithCode(): StatblockTemplate {
  return deepFreeze({
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    id: 'imported-abc123',
    fields: [{ key: 'modifier', label: 'Initiative modifier', type: 'number' }],
    layout: { maxColumns: 2, blocks: [
      { id: 'p1', type: 'stat', field: 'hp', look: 'run-in', fsExtras: { diceCallback: 'return []', dice: true } },
      { id: 's1', type: 'section', blocks: [
        { id: 'js', type: 'script', summary: 'HP track', fs: { type: 'javascript', code: 'el.remove()' } },
        { id: 'sc', type: 'scores', field: 'stats', orientation: 'row', fsExtras: { modifier: 'return 1', calculate: true } },
      ] },
      { id: 'p2', type: 'stat', field: 'modifier', look: 'run-in', callback: 'return 2' } as never,
      { id: 'op', type: 'opaque', raw: { type: 'ifelse', conditions: [{ condition: 'return true', nested: [
        { type: 'table', modifier: 'return 3', properties: ['stats'] },
        { type: 'property', modifier: 'not code here' },
      ] }] } },
    ] },
    sample: { modifier: 2 },
    importedFrom: { layoutId: 'abc', layoutName: 'Basic 5e', extras: { diceParsing: [{ regex: 'x', parser: 'return 4' }], columns: 2 } },
  });
}

describe('findCode', () => {
  it('finds code in fsExtras, unknown keys, opaque and script blocks and layout extras', () => {
    expect(findCode(templateWithCode())).toEqual([
      ['layout', 'blocks', 0, 'fsExtras', 'diceCallback'],
      ['layout', 'blocks', 1, 'blocks', 0],
      ['layout', 'blocks', 1, 'blocks', 1, 'fsExtras', 'modifier'],
      ['layout', 'blocks', 2, 'callback'],
      ['layout', 'blocks', 3, 'raw', 'conditions', 0, 'condition'],
      ['layout', 'blocks', 3, 'raw', 'conditions', 0, 'nested', 0, 'modifier'],
      ['importedFrom', 'extras', 'diceParsing'],
    ]);
  });

  it('finds the parser of a dice parsing list read on its own', () => {
    expect(findCode({ diceParsing: [{ regex: 'x', parser: 'y' }] })).toEqual([['diceParsing']]);
  });

  it('counts a value too deep to check as code', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 80; i++) deep = { inner: deep };
    expect(findCode(deep)).toEqual([Array.from({ length: 64 }, () => 'inner')]);
    expect(findCode({ type: 'script', summary: 's', fs: {} })).toEqual([[]]);
  });

  it('finds nothing in a template without code', () => {
    const template: StatblockTemplate = {
      format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id: 'clean-abc123',
      fields: [{ key: 'condition', label: 'Condition', type: 'text' }, { key: 'code', label: 'Code', type: 'text' }],
      layout: { maxColumns: 2, blocks: [{ id: 'a', type: 'stat', field: 'condition', look: 'run-in', fsExtras: { cls: 'x' } }] },
      sample: { condition: 'Poisoned', code: 'A1', modifier: 2 },
    };
    expect(findCode(template)).toEqual([]);
    expect(stripCode(template)).toStrictEqual(template);
  });
});

describe('stripCode', () => {
  it('removes every piece of code and keeps the rest', () => {
    const template = templateWithCode();
    const stripped = stripCode(template);
    expect(findCode(stripped)).toEqual([]);
    expect(stripped.layout.blocks).toStrictEqual([
      { id: 'p1', type: 'stat', field: 'hp', look: 'run-in', fsExtras: { dice: true } },
      { id: 's1', type: 'section', blocks: [
        { id: 'sc', type: 'scores', field: 'stats', orientation: 'row', fsExtras: { calculate: true } },
      ] },
      { id: 'p2', type: 'stat', field: 'modifier', look: 'run-in' },
      { id: 'op', type: 'opaque', raw: { type: 'ifelse', conditions: [{ nested: [
        { type: 'table', properties: ['stats'] },
        { type: 'property', modifier: 'not code here' },
      ] }] } },
    ]);
    expect(stripped.importedFrom).toStrictEqual({ layoutId: 'abc', layoutName: 'Basic 5e', extras: { columns: 2 } });
    expect(stripped.sample).toStrictEqual({ modifier: 2 });
    expect(stripped.fields).toStrictEqual(template.fields);
  });

  it('packs a template that hides a diceCallback in fsExtras without it', () => {
    const template: StatblockTemplate = {
      format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id: 'hidden-abc123', fields: [],
      layout: { maxColumns: 1, blocks: [{ id: 'a', type: 'divider', fsExtras: { diceCallback: 'fetch("x")' } }] },
    };
    expect(JSON.stringify(stripCode(template))).not.toContain('diceCallback');
  });

  it('leaves nothing of a script block given on its own', () => {
    expect(stripCode({ type: 'script', summary: 's', fs: {} })).toBeUndefined();
    expect(stripCode('text')).toBe('text');
  });
});

const KEYS = ['callback', 'diceCallback', 'diceParsing', 'modifier', 'code', 'condition', 'parser', 'conditions', 'fsExtras', 'nested', 'name', 'type', 'blocks'];
const TYPES = ['table', 'javascript', 'ifelse', 'script', 'scores', 'stat', 'property'];

function randomJson(random: Random, depth: number): unknown {
  const roll = int(random, 0, depth > 5 ? 2 : 5);
  if (roll === 0) return pick(random, ['x', 'return 1', '']);
  if (roll === 1) return int(random, 0, 9);
  if (roll === 2) return pick(random, [true, null]);
  if (roll === 3) return Array.from({ length: int(random, 0, 3) }, () => randomJson(random, depth + 1));
  const record: Record<string, unknown> = {};
  for (let i = int(random, 0, 4); i > 0; i--) {
    const key = pick(random, KEYS);
    record[key] = key === 'type' ? pick(random, TYPES) : randomJson(random, depth + 1);
  }
  return record;
}

describe('stripCode on random values', () => {
  it('leaves no code, is idempotent and never changes its input', () => {
    let withCode = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const value = deepFreeze(randomJson(mulberry32(seed), 0));
      const stripped = stripCode(value);
      expect(findCode(stripped), `seed ${seed}`).toEqual([]);
      expect(stripCode(stripped), `seed ${seed}`).toStrictEqual(stripped);
      if (findCode(value).length === 0) expect(stripped, `seed ${seed}`).toStrictEqual(value);
      else withCode++;
    }
    expect(withCode).toBeGreaterThan(200);
  });
});
