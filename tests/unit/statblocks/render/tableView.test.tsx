// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ScoresBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockEl, renderSheet, templateOf } from './sheetTestKit';

afterEach(cleanup);

const MOD = { label: 'Mod', formula: 'floor((value - 10) / 2)' };
const STATS: TemplateField = { key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX', 'CON'], align: ['center', null, 'end'] };
const ABILITIES: ScoresBlock = { id: 'scores01', type: 'scores', field: 'stats', orientation: 'row', columns: [MOD] };
const LOOT: TemplateField = {
  key: 'loot', label: 'Loot', type: 'scores', slots: ['Item', 'Qty'], rows: [['Rope', 1], ['Torch', 3]],
};
const LOOT_BLOCK: ScoresBlock = { id: 'loot0001', type: 'scores', field: 'loot', orientation: 'row' };

const abilities = templateOf([STATS], [ABILITIES]);
const loot = templateOf([LOOT], [LOOT_BLOCK]);

const texts = (root: Element, selector: string): string[] => [...root.querySelectorAll(selector)].map((cell) => cell.textContent ?? '');
const rows = (root: Element): string[][] => [...root.querySelectorAll('tbody tr:not(.atlas-sb-sheet-table__derived)')]
  .map((row) => texts(row, 'td.atlas-sb-sheet-table__cell'));
const BLANK = '​';

describe('a Table as Obsidian draws a Markdown table', () => {
  it('draws the header row of column names over its rows, then its worked-out rows after their labels', () => {
    const { container } = renderSheet(abilities, { stats: [14, 'd8', '1 per day'] });
    const table = blockEl(container, 'scores01')!;
    expect(texts(table, 'thead th')).toEqual(['STR', 'DEX', 'CON']);
    expect(rows(table)).toEqual([['14', 'd8', '1 per day']]);
    // No formula is worked out over a value written as text.
    expect(texts(table, 'tr.atlas-sb-sheet-table__derived th')).toEqual(['Mod']);
    expect(texts(table, 'td.atlas-sb-sheet-table__worked')).toEqual(['2', BLANK, BLANK]);
    expect(table.querySelector('.atlas-sb-problem')).toBeNull();
  });

  it('aligns each column, its name and its cells alike', () => {
    const { container } = renderSheet(abilities, { stats: [14, 12, 13] });
    const table = blockEl(container, 'scores01')!;
    const aligns = [...table.querySelectorAll<HTMLElement>('thead th, td.atlas-sb-sheet-table__cell')].map((cell) => cell.style.textAlign);
    expect(aligns).toEqual(['center', '', 'end', 'center', '', 'end']);
  });

  it('keeps an empty table\'s shape while a statblock is filled in, and draws nothing of it where one is read', () => {
    const editing = renderSheet(abilities, {}, { mode: 'editing' });
    const table = blockEl(editing.container, 'scores01')!;
    expect(texts(table, 'thead th')).toEqual(['STR', 'DEX', 'CON']);
    expect(rows(table)).toEqual([[BLANK, BLANK, BLANK]]);
    expect(table.textContent).not.toContain('Add abilities');
    cleanup();
    expect(blockEl(renderSheet(abilities, {}).container, 'scores01')).toBeNull();
  });

  it('shows a statblock without a value its template\'s starting table, read and edited alike', () => {
    for (const mode of ['view', 'editing'] as const) {
      const { container } = renderSheet(loot, {}, { mode });
      expect(rows(blockEl(container, 'loot0001')!)).toEqual([['Rope', '1'], ['Torch', '3']]);
      cleanup();
    }
  });

  it('draws a statblock\'s own rows and its own columns', () => {
    const { container } = renderSheet(loot, { loot: { columns: ['Item', 'Weight', 'Qty'], rows: [['Rope', 5, 1], ['Lantern']] } });
    const table = blockEl(container, 'loot0001')!;
    expect(texts(table, 'thead th')).toEqual(['Item', 'Weight', 'Qty']);
    expect(rows(table)).toEqual([['Rope', '5', '1'], ['Lantern', BLANK, BLANK]]);
  });

  it('leaves out the header row where the template hides it, and the worked-out rows where the table holds several rows', () => {
    const { container } = renderSheet(templateOf([{ ...STATS, header: false }], [ABILITIES]), { stats: [[10, 12, 14], [8, 9, 10]] });
    const table = blockEl(container, 'scores01')!;
    expect(table.querySelector('thead')).toBeNull();
    expect(rows(table)).toEqual([['10', '12', '14'], ['8', '9', '10']]);
    expect(table.querySelector('.atlas-sb-sheet-table__derived')).toBeNull();
  });

  it('draws a table of one row as lines where its look asks, and as a grid once it holds several rows', () => {
    const lines: ScoresBlock = { ...ABILITIES, orientation: 'table', perLine: 3 };
    const one = renderSheet(templateOf([STATS], [lines]), { stats: [14, 12, 13] });
    expect(blockEl(one.container, 'scores01')!.querySelectorAll('table.atlas-sb-score-group')).toHaveLength(3);
    cleanup();
    const several = renderSheet(templateOf([STATS], [lines]), { stats: [[14, 12, 13], [1, 2, 3]] });
    expect(blockEl(several.container, 'scores01')!.querySelector('table.atlas-sb-sheet-table__grid')).not.toBeNull();
  });
});
