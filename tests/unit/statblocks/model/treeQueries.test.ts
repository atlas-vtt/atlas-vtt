import { describe, expect, it } from 'vitest';
import {
  blocksShowingField, boundField, collectBlockIds, fieldsShownBy, findBlock, flattenReadingOrder, isWithin,
} from '../../../../src/app/statblocks/model/treeQueries';
import type { TemplateBlock, TemplateLayout } from '../../../../src/app/statblocks/model/templateTypes';

const layout: TemplateLayout = {
  maxColumns: 2,
  blocks: [
    { id: 'head', type: 'row', blocks: [
      { id: 'sec', type: 'section', headingField: 'name', blocks: [
        { id: 'title', type: 'title', field: 'name', level: 1, pattern: '{name}[ ({nickname})]' },
        { id: 'line', type: 'line', fields: ['size', 'type'] },
      ] },
      { id: 'img', type: 'image', field: 'image', shape: 'token' },
    ] },
    { id: 'hp', type: 'stat', field: 'hp', look: 'run-in', rollFrom: 'hit_dice', fallback: '{=con * 2}' },
    { id: 'scores', type: 'scores', field: 'stats', orientation: 'table', columns: [
      { label: 'Mod', formula: 'floor((value - 10) / 2)' }, { label: 'Save', field: 'saves' },
    ] },
    { id: 'legend', type: 'entries', field: 'legendary_actions', introField: 'legendary_description' },
    { id: 'static', type: 'text', text: 'Read aloud.' },
    { id: 'unbound', type: 'stat', field: '', look: 'run-in' },
    { id: 'rule', type: 'divider' },
  ],
};

/** A stand-in for `expressions/`: every `{name}` reference. */
const refsOf = (pattern: string): string[] => [...pattern.matchAll(/\{=?\s*([a-z_]+)/g)].map((match) => match[1] ?? '');

describe('findBlock', () => {
  it('finds a block with its parent, index and depth', () => {
    expect(findBlock(layout.blocks, 'line')).toMatchObject({ parentId: 'sec', index: 1, depth: 2 });
    expect(findBlock(layout.blocks, 'hp')).toMatchObject({ parentId: null, index: 1, depth: 0 });
    expect(findBlock(layout.blocks, 'nope')).toBeNull();
  });
});

describe('flattenReadingOrder and ids', () => {
  it('lists every block before its children', () => {
    expect(flattenReadingOrder(layout.blocks).map((block) => block.id)).toEqual([
      'head', 'sec', 'title', 'line', 'img', 'hp', 'scores', 'legend', 'static', 'unbound', 'rule',
    ]);
    expect(collectBlockIds(layout.blocks).size).toBe(11);
  });

  it('knows what lies within a block', () => {
    expect(isWithin(layout.blocks, 'head', 'line')).toBe(true);
    expect(isWithin(layout.blocks, 'head', 'head')).toBe(true);
    expect(isWithin(layout.blocks, 'sec', 'img')).toBe(false);
    expect(isWithin(layout.blocks, 'nope', 'line')).toBe(false);
  });
});

describe('fields a block shows', () => {
  const block = (id: string): TemplateBlock => {
    const found = findBlock(layout.blocks, id);
    if (!found) throw new Error(id);
    return found.block;
  };

  it.each([
    ['sec', ['name']],
    ['title', ['name']],
    ['line', ['size', 'type']],
    ['hp', ['hp', 'hit_dice']],
    ['scores', ['stats', 'saves']],
    ['legend', ['legendary_actions', 'legendary_description']],
    ['static', []],
    ['unbound', []],
    ['rule', []],
    ['head', []],
  ])('%s shows %j', (id, keys) => {
    expect(fieldsShownBy(block(id))).toEqual(keys);
  });

  it('adds what patterns and fallbacks refer to when told how to read them', () => {
    expect(fieldsShownBy(block('title'), refsOf)).toEqual(['name', 'nickname']);
    expect(fieldsShownBy(block('hp'), refsOf)).toEqual(['hp', 'hit_dice', 'con']);
  });

  it('finds the blocks that show a field in reading order', () => {
    expect(blocksShowingField(layout, 'name').map((shown) => shown.id)).toEqual(['sec', 'title']);
    expect(blocksShowingField(layout, 'nickname').map((shown) => shown.id)).toEqual([]);
    expect(blocksShowingField(layout, 'nickname', refsOf).map((shown) => shown.id)).toEqual(['title']);
  });

  it('names the field a block is bound to', () => {
    expect(boundField(block('line'))).toBe('size');
    expect(boundField(block('static'))).toBeUndefined();
    expect(boundField(block('sec'))).toBeUndefined();
    expect(boundField(block('img'))).toBe('image');
  });
});
