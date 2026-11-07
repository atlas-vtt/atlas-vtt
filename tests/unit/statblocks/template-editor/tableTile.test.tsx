// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { SurfaceMenuProvider } from '../../../../src/app/statblocks/editor/interaction/SurfaceMenuProvider';
import { commitLabel } from '../../../../src/app/statblocks/editor/template-editor/labelCommit';
import { labelTargetOf } from '../../../../src/app/statblocks/editor/template-editor/labelTargets';
import { TemplateEditor, type TemplateEditorHost } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { newTable, tableParts, withTemplateTable } from '../../../../src/app/statblocks/model/tableColumns';
import { insertColumn, renameColumn, setCell } from '../../../../src/app/statblocks/model/tableEdits';
import type { ScoresBlock, StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate } from './editorKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const TABLE: ScoresBlock = { id: 'scores01', type: 'scores', field: 'stats', orientation: 'row' };
const STATS: TemplateField = { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex', 'Con'] };

/** The sample template with a Table of `stats` after its values. */
function withTable(field: TemplateField = STATS, block: ScoresBlock = TABLE): StatblockTemplate {
  const sample = sampleTemplate();
  return { ...sample, fields: [...sample.fields, field], layout: { ...sample.layout, blocks: [...sample.layout.blocks, block] } };
}

const statsOf = (template: StatblockTemplate): TemplateField | undefined => template.fields.find((field) => field.key === 'stats');

describe('a Table\'s starting table in the template', () => {
  it('is written into its property: names, keys kept through a rename, alignments and rows, each left out where it says nothing', () => {
    const template = withTable({ ...STATS, slotKeys: ['strength'] });
    const grid = tableParts(template, 'scores01')!.grid;
    const renamed = withTemplateTable(template, 'scores01', renameColumn(grid, 0, 'Might'));
    expect(statsOf(renamed)).toMatchObject({ slots: ['Might', 'Dex', 'Con'], slotKeys: ['strength'] });
    expect(statsOf(renamed)).not.toHaveProperty('rows');
    // A column named for the first time takes its name's key.
    const named = withTemplateTable(template, 'scores01', renameColumn(insertColumn(grid, 3), 3, 'Int'));
    expect(statsOf(named)).toMatchObject({ slots: ['Str', 'Dex', 'Con', 'Int'], slotKeys: ['strength'] });
    const filled = withTemplateTable(template, 'scores01', setCell(grid, 0, 1, 10));
    expect(statsOf(filled)).toMatchObject({ rows: [[null, 10]] });
    expect(withTemplateTable(template, 'scores01', grid)).toBe(template);
  });

  it('starts a Table named on the card as a new one: three columns over two rows, which statblocks may add to', () => {
    const unbound = withTable(STATS, { ...TABLE, field: '' });
    expect(labelTargetOf(unbound.layout.blocks.at(-1)!, unbound.fields)).toEqual({ kind: 'new-field', text: 'Table' });
    const bound = commitLabel(unbound, 'scores01', 'Weapons', []);
    expect(bound.template.fields.at(-1)).toEqual({ key: 'weapons', label: 'Weapons', type: 'scores', ...newTable() });
    // Once named, a Table has no label on the card: its column names are typed in its header row.
    expect(labelTargetOf({ ...TABLE, field: 'weapons' }, bound.template.fields)).toBeNull();
  });
});

const host: TemplateEditorHost = { save: vi.fn(async () => null), close: vi.fn() };

function setup(session: FakeSession): HTMLElement {
  render(
    <TooltipProvider>
      <SurfaceMenuProvider ownerId="te">
        <TemplateEditor session={session} host={host} collectionId={null} />
      </SurfaceMenuProvider>
    </TooltipProvider>,
  );
  return document.querySelector<HTMLElement>('.atlas-te-stage [data-block-id="scores01"]')!;
}

const cellAt = (frame: HTMLElement, row: number, col: number): HTMLElement => frame.querySelector<HTMLElement>(`[data-table-row="${row}"][data-table-col="${col}"]`)!;
const typing = (): HTMLTextAreaElement => document.activeElement as HTMLTextAreaElement;

describe('a Table tile in the template editor', () => {
  it('selects its tile and types the cell clicked; each cell typed is one step of the starting table', () => {
    const session = new FakeSession(withTable());
    const frame = setup(session);
    fireEvent.click(cellAt(frame, 0, 1));
    expect(frame.getAttribute('data-te-selected')).not.toBeNull();
    expect(typing().tagName).toBe('TEXTAREA');
    expect(typing().getAttribute('aria-label')).toBe('Dex');
    fireEvent.change(typing(), { target: { value: '12' } });
    act(() => { fireEvent.keyDown(typing(), { key: 'Tab' }); });
    expect(statsOf(session.template)?.rows).toEqual([[null, 12]]);
    expect(typing().getAttribute('aria-label')).toBe('Con');
    fireEvent.change(typing(), { target: { value: '14' } });
    act(() => { fireEvent.keyDown(typing(), { key: 'Escape' }); });
    expect(statsOf(session.template)?.rows).toEqual([[null, 12]]);
    expect(session.steps).toBe(1);
  });

  it('names its columns in the header row, and Tab past the last cell adds a row', () => {
    const session = new FakeSession(withTable());
    const frame = setup(session);
    fireEvent.click(cellAt(frame, -1, 2));
    expect(typing().value).toBe('Con');
    fireEvent.change(typing(), { target: { value: 'Constitution' } });
    act(() => { fireEvent.keyDown(typing(), { key: 'Tab' }); });
    expect(statsOf(session.template)?.slots).toEqual(['Str', 'Dex', 'Constitution']);
    // Renamed, a column keeps its key, so a value written by name still finds it.
    expect(statsOf(session.template)?.slotKeys).toEqual(['str', 'dex', 'con']);
    act(() => { fireEvent.keyDown(typing(), { key: 'Tab' }); });
    act(() => { fireEvent.keyDown(typing(), { key: 'Tab' }); });
    expect(typing().getAttribute('aria-label')).toBe('Constitution');
    act(() => { fireEvent.keyDown(typing(), { key: 'Tab' }); });
    expect(statsOf(session.template)?.rows).toEqual([[], []]);
    expect(typing().getAttribute('aria-label')).toBe('Str, row 2');
  });

  it('adds a row and a column from its add buttons and from a cell\'s menu, each one step', () => {
    const session = new FakeSession(withTable());
    const frame = setup(session);
    fireEvent.click(screen.getByRole('button', { name: 'Add column to the right' }));
    expect(statsOf(session.template)?.slots).toEqual(['Str', 'Dex', 'Con', '']);
    fireEvent.click(screen.getByRole('button', { name: 'Add row below' }));
    expect(statsOf(session.template)?.rows).toEqual([[], []]);
    expect(session.steps).toBe(2);
    fireEvent.contextMenu(cellAt(frame, 0, 0));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Row'), expect.stringContaining('Column'), expect.stringContaining('Sort by column (A to Z)'),
    ]));
  });

  it('draws its table as the card does in a template that takes no edits', () => {
    const session = new FakeSession(withTable(), { readOnly: true, readOnlyReason: 'newer' });
    const frame = setup(session);
    fireEvent.click(cellAt(frame, 0, 0));
    expect(frame.querySelector('textarea')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add row below' })).toBeNull();
  });
});
