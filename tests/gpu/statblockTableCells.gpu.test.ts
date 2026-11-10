import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { MarkdownRenderer, type App } from 'obsidian';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../src/app/statblocks/library/sessionRegistry';
import { TEMPLATE_FORMAT, type ScoresBlock, type StatblockTemplate } from '../../src/app/statblocks/model/templateTypes';
import { blockOf, renderPane, type PaneHarness } from '../unit/statblocks/editor/paneKit';
import { FakeSession, sampleTemplate } from '../unit/statblocks/template-editor/editorKit';
import { centreOf, mouse } from './realMouse';
import { frames, mount, useEditorStyles } from './sidePanesHarness';

vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({}) } }));
vi.mock('../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    loadedCollections: () => [],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const TOLERANCE = 0.5;
const MODIFIER = { formula: 'floor((value - 10) / 2)', display: 'signed' } as const;
const ROW: ScoresBlock = { id: 'scores01', type: 'scores', field: 'stats', orientation: 'row', columns: [MODIFIER] };
const LINES: ScoresBlock = { id: 'scores02', type: 'scores', field: 'stats', orientation: 'table', perLine: 3, columns: [{ ...MODIFIER, label: 'Mod' }] };
const LOOT: ScoresBlock = { id: 'loot0001', type: 'scores', field: 'loot', orientation: 'row' };
const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'table-cells-k7m2qa',
  fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'stats', label: 'Abilities', type: 'scores', addRows: false, addColumns: false, slots: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], align: ['center', 'center', 'center', 'center', 'center', 'center'] },
    { key: 'loot', label: 'Loot', type: 'scores', slots: ['Item', 'Qty', 'Notes'], rows: [['Rope', 1, '50 ft.'], ['Torch', 3]] },
  ],
  layout: { maxColumns: 1, blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }, ROW, LOOT, LINES] },
};
/** Obsidian's table variables as a theme might set them, so the test can tell they are read. */
const TABLE_THEME = 'body { --table-border-color: rgb(1, 2, 3); --table-border-width: 1px; --table-header-weight: 700; --size-2-2: 4px; --size-4-2: 8px; --size-4-4: 16px; }';

const apps: App[] = [];
afterEach(async () => {
  cleanup();
  for (const app of apps.splice(0)) {
    await releaseTemplateSessions(app);
    TemplateLibrary.release(app);
  }
  document.querySelectorAll('.atlas-test-pane, .atlas-test-theme').forEach((host) => host.remove());
});

async function pane(values: Record<string, unknown>): Promise<PaneHarness> {
  document.head.append(Object.assign(document.createElement('style'), { className: 'atlas-test-theme', textContent: TABLE_THEME }));
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'atlas-vtt-plugin atlas-test-pane' }));
  container.style.width = '440px';
  vi.spyOn(TemplateLibrary.prototype, 'get').mockReturnValue({
    template: TEMPLATE, name: 'Table cells', status: 'ok', builtIn: false, path: 'Templates/Table cells.atlastemplate',
  });
  const harness = await renderPane({ frontmatter: { statblock: true, 'atlas-template': TEMPLATE.id, name: 'Bog Hag', ...values }, container });
  apps.push(harness.app);
  await frames(3);
  return harness;
}

interface Box { left: number; top: number; right: number; bottom: number }
const boxOf = (element: Element): Box => {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
};

/** Every block and every cell of the card's tables. */
function gridBoxes(card: Element): Box[] {
  return [...card.querySelectorAll('[data-block-id], [data-table-row], th, td')].map(boxOf);
}

function expectSameBoxes(after: readonly Box[], before: readonly Box[], what: string): void {
  expect(after).toHaveLength(before.length);
  before.forEach((box, index) => {
    const now = after[index]!;
    for (const side of ['left', 'top', 'right', 'bottom'] as const) {
      expect(Math.abs(now[side] - box[side]), `${what}: box ${index} ${side} ${box[side]} → ${now[side]}`).toBeLessThanOrEqual(TOLERANCE);
    }
  });
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    await mouse.click(centreOf(element).x, centreOf(element).y);
    await frames(2);
  });
}

async function hover(x: number, y: number): Promise<void> {
  await act(async () => {
    await mouse.hover(x, y);
    await frames(3);
  });
}

/**
 * A Table typed in place (§7.6), as an Obsidian Live Preview table: clicking
 * a cell puts its field exactly over the cell's text, in its font, and no
 * cell or block of the card moves, filled or empty, as a grid or as lines.
 */
describe('a Table cell typed in its place', () => {
  useEditorStyles();

  for (const [name, values] of Object.entries({ filled: { stats: [18, 14, 16, 10, 13] }, empty: {} })) {
    it(`keeps every box of the card where it was: ${name}`, async () => {
      const harness = await pane(values);
      const card = harness.result.container.querySelector('.atlas-statblock')!;
      const cells = [...card.querySelectorAll('[data-table-row]')].map((cell) => ({
        block: cell.closest('[data-block-id]')!.getAttribute('data-block-id')!,
        row: cell.getAttribute('data-table-row')!,
        col: cell.getAttribute('data-table-col')!,
      }));
      expect(cells.length).toBe(6 + 6 + 9 + 6);
      for (const { block, row, col } of cells) {
        const before = gridBoxes(card);
        const cell = blockOf(harness.result.container, block).querySelector(`[data-table-row="${row}"][data-table-col="${col}"]`)!;
        const font = getComputedStyle(cell);
        await click(cell);
        const input = cell.querySelector('textarea');
        // The abilities' names are the template's: only the loot table's header is typed.
        if (row === '-1' && block !== 'loot0001') {
          expect(input, `${block} header ${col} is not typed`).toBeNull();
          continue;
        }
        expect(document.activeElement, `${block} ${row}:${col} is typed`).toBe(input);
        expectSameBoxes(gridBoxes(card), before, `${name}: ${block} ${row}:${col}`);
        const inside = boxOf(input!);
        const around = boxOf(cell);
        expect(inside.left).toBeGreaterThanOrEqual(around.left - TOLERANCE);
        expect(inside.right).toBeLessThanOrEqual(around.right + TOLERANCE);
        expect(getComputedStyle(input!).fontSize).toBe(font.fontSize);
        expect(getComputedStyle(input!).fontWeight).toBe(font.fontWeight);
        expect(getComputedStyle(input!).textAlign).toBe(font.textAlign);
        await act(async () => {
          await userEvent.keyboard('{Escape}');
          await frames(2);
        });
      }
    });
  }
});

describe('a Table drawn as Obsidian draws a Markdown table', () => {
  useEditorStyles();

  it('takes its borders, padding and header weight from the theme\'s table variables', async () => {
    const harness = await pane({ stats: [18, 14, 16, 10, 13, 8] });
    const loot = blockOf(harness.result.container, 'loot0001');
    const header = getComputedStyle(loot.querySelector('th')!);
    const cell = getComputedStyle(loot.querySelector('td')!);
    expect(header.fontWeight).toBe('700');
    for (const style of [header, cell]) {
      expect(style.borderTopColor).toBe('rgb(1, 2, 3)');
      expect(style.borderLeftWidth).toBe('1px');
      expect([style.paddingTop, style.paddingLeft]).toEqual(['4px', '8px']);
    }
    expect(getComputedStyle(loot.querySelector('table')!).borderCollapse).toBe('collapse');
  });

  it('keeps the card laid out alike with the room it keeps around itself for its handles', async () => {
    const harness = await pane({});
    const loot = blockOf(harness.result.container, 'loot0001');
    const table = boxOf(loot.querySelector('table')!);
    const frame = boxOf(loot);
    expect(Math.abs(table.top - frame.top)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(table.bottom - frame.bottom)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(table.left - frame.left)).toBeLessThanOrEqual(TOLERANCE);
  });

  it('fills the width of its block, however few its columns', async () => {
    const harness = await pane({});
    for (const id of ['loot0001', 'scores01']) {
      const block = harness.result.container.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
      const table = boxOf(block.querySelector('table')!);
      const frame = boxOf(block);
      expect(Math.abs(table.left - frame.left), id).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(table.right - frame.right), id).toBeLessThanOrEqual(TOLERANCE);
    }
  });
});

describe('a Table cell holding Markdown', () => {
  useEditorStyles();

  it('draws a link inside its cell, inline, one line high as a cell of plain text is', async () => {
    // Obsidian's renderer for a link: a paragraph around the anchor, which the cell unwraps.
    vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_app, markdown, el) => {
      el.insertAdjacentHTML('beforeend', `<p>${markdown.replace(/\[\[([^\]]+)\]\]/g, '<a class="internal-link" data-href="$1">$1</a>')}</p>`);
      return Promise.resolve();
    });
    const harness = await pane({ loot: [['[[Rope]]', 1, '50 ft.'], ['Torch', 3, '1 hour']] });
    const rows = [...blockOf(harness.result.container, 'loot0001').querySelectorAll('tbody tr')];
    const [linked, plain] = rows.map((row) => row.querySelector('td')!);
    expect(linked!.querySelector('a.internal-link')?.textContent).toBe('Rope');
    expect(linked!.querySelector('p')).toBeNull();
    const height = (row: Element): number => row.getBoundingClientRect().height;
    expect(Math.abs(height(rows[0]!) - height(rows[1]!))).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(boxOf(linked!).bottom - boxOf(linked!).top - (boxOf(plain!).bottom - boxOf(plain!).top))).toBeLessThanOrEqual(TOLERANCE);
  });
});

describe('a Table\'s handles and add buttons', () => {
  useEditorStyles();

  it('stand at its edges, as Obsidian\'s: a row\'s handle at its left, a column\'s over its top, the add bars along the bottom and the right', async () => {
    const harness = await pane({});
    const loot = blockOf(harness.result.container, 'loot0001');
    const table = boxOf(loot.querySelector('table')!);
    const cell = loot.querySelector('[data-table-row="1"][data-table-col="0"]')!;
    const row = boxOf(cell.parentElement!);
    const rowHandle = cell.querySelector('.atlas-sb-sheet-table__handle--row')!;
    await hover(centreOf(cell).x, centreOf(cell).y);
    await hover(boxOf(rowHandle).left + 4, centreOf(rowHandle).y);
    expect(getComputedStyle(rowHandle).opacity).toBe('1');
    expect(Math.abs(boxOf(rowHandle).right - row.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxOf(rowHandle).top - row.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxOf(rowHandle).bottom - row.bottom)).toBeLessThanOrEqual(1);

    const head = loot.querySelector('[data-table-row="-1"][data-table-col="1"]')!;
    const columnHandle = head.querySelector('.atlas-sb-sheet-table__handle--column')!;
    expect(Math.abs(boxOf(columnHandle).bottom - boxOf(head).top)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxOf(columnHandle).left - boxOf(head).left)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxOf(columnHandle).right - boxOf(head).right)).toBeLessThanOrEqual(1);

    const addRow = boxOf(loot.querySelector('.atlas-sb-sheet-table__add--row')!);
    const addColumn = boxOf(loot.querySelector('.atlas-sb-sheet-table__add--column')!);
    expect(Math.abs(addRow.top - table.bottom)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(addRow.left - table.left)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(addRow.right - table.right)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(addColumn.left - table.right)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(addColumn.top - table.top)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(addColumn.bottom - table.bottom)).toBeLessThanOrEqual(TOLERANCE);
  });

  it('take no click meant for the block under them while the table is not pointed at', async () => {
    const harness = await pane({});
    const loot = blockOf(harness.result.container, 'loot0001');
    await hover(2, 2);
    for (const element of loot.querySelectorAll('.atlas-sb-sheet-table__handle, .atlas-sb-sheet-table__add')) {
      expect(getComputedStyle(element).pointerEvents).toBe('none');
      expect(getComputedStyle(element).opacity).toBe('0');
    }
  });

  it('add a row from the bar under the table, typed at once in its first cell', async () => {
    const harness = await pane({});
    const loot = blockOf(harness.result.container, 'loot0001');
    const table = boxOf(loot.querySelector('table')!);
    await hover(table.left + 10, table.bottom - 4);
    await act(async () => {
      await mouse.click(table.left + 20, table.bottom + 6);
      await frames(3);
    });
    expect(harness.writer.patches().at(-1)).toMatchObject({ next: [['Rope', 1, '50 ft.'], ['Torch', 3], []] });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Item, row 3');
  });
});

describe('a Table in the template editor', () => {
  useEditorStyles();

  it('types its starting table in place, the card around it unmoved', async () => {
    const sample = sampleTemplate();
    const template: StatblockTemplate = {
      ...sample,
      fields: [...sample.fields, TEMPLATE.fields[2]!],
      layout: { ...sample.layout, blocks: [...sample.layout.blocks, LOOT] },
    };
    const root = mount(new FakeSession(template), 1100);
    await frames(3);
    const card = root.querySelector('.atlas-statblock')!;
    const before = gridBoxes(card);
    const cell = root.querySelector('[data-block-id="loot0001"] [data-table-row="0"][data-table-col="2"]')!;
    await click(cell);
    expect(document.activeElement).toBe(cell.querySelector('textarea'));
    expectSameBoxes(gridBoxes(card), before, 'template editor');
  });
});

interface Corner { x: number; y: number }

describe('a Metric\'s number ×', () => {
  useEditorStyles();

  it('is centred on each number\'s top right corner', async () => {
    const sample = sampleTemplate();
    const template: StatblockTemplate = {
      ...sample,
      fields: [...sample.fields, { key: 'major', label: 'Major', type: 'number' }, { key: 'severe', label: 'Severe', type: 'number' }],
      layout: { ...sample.layout, blocks: [...sample.layout.blocks, { id: 'metric01', type: 'metric', fields: ['major', 'severe'] }] },
    };
    const root = mount(new FakeSession(template), 1100);
    await frames(3);
    const metric = root.querySelector('[data-block-id="metric01"]')!;
    metric.scrollIntoView({ block: 'center' });
    await frames(2);
    await click(metric.querySelector('[data-metric-index="0"]')!);
    await frames(2);
    const buttons: Corner[] = [...document.querySelectorAll('.atlas-te-part-remove')].map((button) => centreOf(button));
    const corners: Corner[] = [...metric.querySelectorAll('[data-metric-index]')].map((number) => ({ x: boxOf(number).right, y: boxOf(number).top }));
    expect(buttons).toHaveLength(2);
    buttons.forEach((button, index) => {
      expect(Math.abs(button.x - corners[index]!.x)).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(button.y - corners[index]!.y)).toBeLessThanOrEqual(TOLERANCE);
    });
  });
});
