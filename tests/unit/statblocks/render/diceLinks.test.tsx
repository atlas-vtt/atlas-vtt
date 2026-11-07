// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react';
import { MarkdownRenderer } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockEl, fakeApp, renderSheet, templateOf } from './sheetTestKit';

vi.mock('../../../../src/app/atlasViewType', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

/** Obsidian's renderer for the inline Markdown a value holds: `**bold**` and `[[Note]]`, in a paragraph. */
function fakeObsidianMarkdown(markdown: string): string {
  return `<p>${markdown
    .replace(/\[\[([^\]]+)\]\]/g, '<a class="internal-link" data-href="$1">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p>`;
}

const FIELDS: TemplateField[] = [
  { key: 'gear', label: 'Gear', type: 'scores', slots: ['Item', 'Damage'] },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex'] },
  { key: 'hp', label: 'Hit Points', type: 'text' },
  { key: 'speed', label: 'Speed', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'markdown' },
  { key: 'actions', label: 'Actions', type: 'entries', entry: { extras: [{ key: 'damage', label: 'Damage', type: 'text' }] } },
];
const BLOCKS: TemplateBlock[] = [
  { id: 'gear0001', type: 'scores', field: 'gear', orientation: 'row' },
  { id: 'stats001', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)', display: 'signed' }] },
  { id: 'hpstat01', type: 'stat', field: 'hp' },
  { id: 'line0001', type: 'line', fields: ['speed'] },
  { id: 'notes001', type: 'text', field: 'notes' },
  { id: 'actions1', type: 'entries', field: 'actions' },
];
const template = templateOf(FIELDS, BLOCKS);

interface Roll {
  formula: string;
  source: unknown;
}

beforeEach(() => {
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_app, markdown, el) => {
    el.insertAdjacentHTML('beforeend', fakeObsidianMarkdown(markdown));
    return Promise.resolve();
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function links(el: Element): string[] {
  return [...el.querySelectorAll<HTMLElement>('.atlas-dice-link')].map((link) => link.dataset.formula ?? '');
}

function cells(el: Element): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('td.atlas-sb-sheet-table__cell')];
}

describe('dice in table cells', () => {
  const gear = [['Sword', '2d6+3'], ['Dagger', '(1d8)'], ['Bow', '+5'], ['**Axe**', '**heavy** 1d6']];

  it('link in every cell, with and without Markdown, as in the other blocks', () => {
    const rolls: Roll[] = [];
    const table = blockEl(renderSheet(template, { gear }, { app: fakeApp(rolls), sourcePath: 'Goblin.md' }).container, 'gear0001')!;
    const [, damage, , paren, , bonus, axe, heavy] = cells(table);
    expect(links(damage!)).toEqual(['2d6+3']);
    expect(links(paren!)).toEqual(['1d8']);
    expect(paren!.textContent).toBe('(1d8)');
    expect(links(bonus!)).toEqual(['+5']);
    expect(heavy!.querySelector('strong')?.textContent).toBe('heavy');
    expect(links(heavy!)).toEqual(['1d6']);
    expect(links(axe!)).toEqual([]);
  });

  it('link the same where the card draws no Markdown (no app)', () => {
    const table = blockEl(renderSheet(template, { gear }).container, 'gear0001')!;
    expect(links(table)).toEqual(['2d6+3', '1d8', '+5', '1d6']);
  });

  it('roll on a click, a bare bonus as a bare bonus for the default dice', () => {
    const rolls: Roll[] = [];
    const table = blockEl(renderSheet(template, { gear }, { app: fakeApp(rolls), sourcePath: 'Goblin.md' }).container, 'gear0001')!;
    for (const link of table.querySelectorAll<HTMLElement>('.atlas-dice-link')) act(() => { link.click(); });
    expect(rolls.map((roll) => roll.formula)).toEqual(['2d6+3', '1d8', '+5', '1d6']);
  });

  it('link the signed modifiers of a worked-out row', () => {
    const table = blockEl(renderSheet(template, { stats: [18, 9] }).container, 'stats001')!;
    expect(links(table)).toEqual(['+4', '-1']);
  });
});

describe('dice in parentheses', () => {
  it.each([
    ['at the start', '(2d6 + 3) piercing', ['2d6+3']],
    ['at the end', 'Bite (d8)', ['d8']],
    ['after a number', 'Hit: 19 (2d10 + 8) slashing', ['2d10+8']],
    ['as a bare bonus', 'Claws (+5)', ['+5']],
    ['with a negative bonus after a plus', '(3d6 + -1)', ['3d6-1']],
    ['with a true minus', '(1d4 − 1)', ['1d4-1']],
    ['with two dice', '(2d6 - 1d4)', ['2d6-1d4']],
  ])('link %s of a Line, a Stat and a Text', (_, text, formulas) => {
    for (const app of [undefined, fakeApp()]) {
      const { container } = renderSheet(template, { speed: text, hp: text, notes: text }, { app });
      for (const id of ['line0001', 'hpstat01', 'notes001']) expect(links(blockEl(container, id)!), `${id} ${app ? 'markdown' : 'plain'}`).toEqual(formulas);
      cleanup();
    }
  });

  it('link in an ability text and its parts, never in its name', () => {
    const actions = [{ name: '+1 Longsword', damage: '(1d8 + 1)', desc: 'Melee: +4 to hit, 5 (1d8 + 1) slashing.' }];
    const block = blockEl(renderSheet(template, { actions }, { app: fakeApp() }).container, 'actions1')!;
    expect(links(block.querySelector('.atlas-sb-trait-name')!)).toEqual([]);
    expect(links(block.querySelector('.atlas-sb-entry-extra')!)).toEqual(['1d8+1']);
    expect(links(block)).toEqual(['1d8+1', '+4', '1d8+1']);
  });
});
