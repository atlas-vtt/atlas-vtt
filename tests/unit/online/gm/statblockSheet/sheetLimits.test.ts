// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { drawnStatblock, statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { MAX_ABILITIES, MAX_GM_FRAME, MAX_SHEET_DEPTH, MAX_SHEET_NODES, MAX_SHEET_TEXT, parseBookStatblock, type SheetNode } from '../../../../../src/app/online/protocol/index.ts';
import type { TemplateBlock, TemplateField } from '../../../../../src/app/statblocks/model/templateTypes';
import { templateOf } from '../../../statblocks/render/sheetTestKit';
import { resolvedOf } from './sheetKit';

const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;
const HUGE = `${'Words that go on and on, '.repeat(4000)}end.`;
const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

function depthOf(nodes: readonly SheetNode[]): number {
  return nodes.reduce((most, node) => {
    const inner = node.k === 'section' || node.k === 'row' ? depthOf(node.nodes) : node.k === 'tabs' ? Math.max(0, ...node.tabs.map((tab) => depthOf(tab.nodes))) : -1;
    return Math.max(most, inner + 1);
  }, 0);
}

describe('a drawn statblock within the protocol\'s limits', () => {
  it('holds a thousand abilities and huge texts within what the page reads and one GM frame', async () => {
    const fields: TemplateField[] = [
      { key: 'name', label: 'Name', type: 'text' },
      ...range(500).map((index): TemplateField => ({ key: `v${index}`, label: `Value ${index}`, type: 'markdown' })),
      { key: 'actions', label: 'Actions', type: 'entries' },
    ];
    const blocks: TemplateBlock[] = [
      ...range(500).map((index): TemplateBlock => ({ id: `t${String(index).padStart(7, '0')}`, type: 'text', field: `v${index}` })),
      { id: 'list0001', type: 'entries', field: 'actions' },
    ];
    const note = {
      name: 'Ana',
      ...Object.fromEntries(range(500).map((index) => [`v${index}`, `${index} ${HUGE.slice(0, 1500)}`])),
      actions: range(1000).map((index) => ({ name: `Ability ${index}`, desc: `${index} ${HUGE}` })),
    };
    const { statblock, texts } = await drawnStatblock({ resolved: resolvedOf(templateOf(fields, blocks), note), definitions: [], resources: undefined });
    expect(parseBookStatblock(statblock)).toEqual(statblock);
    expect(bytes({ t: 'book-statblock', statblock })).toBeLessThan(MAX_GM_FRAME);
    expect(statblock!.blocks.length).toBeGreaterThan(0);
    expect(statblock!.blocks.length).toBeLessThanOrEqual(MAX_SHEET_NODES);
    const abilities = statblock!.abilities.flatMap((component) => component.tabs.flatMap((tab) => tab.entries));
    expect(abilities.length).toBeGreaterThan(0);
    expect(abilities.length).toBeLessThanOrEqual(MAX_ABILITIES);
    expect(abilities.every((entry) => entry.text.opening.length <= MAX_SHEET_TEXT)).toBe(true);
    expect(abilities[0]?.text.whole).toBeDefined();
    expect(texts.length).toBeGreaterThan(0);
  });

  it('flattens a layout nested deeper than a page reads', () => {
    const fields: TemplateField[] = [{ key: 'name', label: 'Name', type: 'text' }, { key: 'speed', label: 'Speed', type: 'text' }];
    const nest = (depth: number): TemplateBlock => (depth === 0
      ? { id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' }
      : { id: `sec${String(depth).padStart(5, '0')}`, type: 'section', heading: `Level ${depth}`, blocks: [nest(depth - 1)] });
    const statblock = statblockSheet({ resolved: resolvedOf(templateOf(fields, [nest(10)]), { name: 'Ana', speed: '30 ft.' }), definitions: [], resources: undefined });
    expect(parseBookStatblock(statblock)).toEqual(statblock);
    expect(depthOf(statblock!.blocks)).toBeLessThanOrEqual(MAX_SHEET_DEPTH);
    expect(JSON.stringify(statblock)).toContain('30 ft.');
  });
});
