import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../src/app/statblocks/library/sessionRegistry';
import { TEMPLATE_FORMAT, type ScoresBlock, type StatblockTemplate } from '../../src/app/statblocks/model/templateTypes';
import { blockOf, renderPane, type PaneHarness } from '../unit/statblocks/editor/paneKit';
import { centreOf, mouse } from './realMouse';
import { frames, useEditorStyles } from './sidePanesHarness';

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

const NAMES = ['Accuracy', 'Communication', 'Constitution', 'Dexterity', 'Fighting', 'Intelligence', 'Perception', 'Strength', 'Willpower'];
const WIDE: ScoresBlock = { id: 'fage0001', type: 'scores', field: 'fage', orientation: 'row' };
const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'table-bands-p4x8wd',
  fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'fage', label: 'Abilities', type: 'scores', slots: NAMES, rows: [NAMES.map((_, at) => at + 1)] },
  ],
  layout: { maxColumns: 1, blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }, WIDE] },
};

const apps: App[] = [];
afterEach(async () => {
  cleanup();
  for (const app of apps.splice(0)) {
    await releaseTemplateSessions(app);
    TemplateLibrary.release(app);
  }
  document.querySelectorAll('.atlas-test-pane').forEach((host) => host.remove());
});

async function pane(): Promise<PaneHarness> {
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'atlas-vtt-plugin atlas-test-pane' }));
  container.style.width = '440px';
  vi.spyOn(TemplateLibrary.prototype, 'get').mockReturnValue({
    template: TEMPLATE, name: 'Table bands', status: 'ok', builtIn: false, path: 'Templates/Table bands.atlastemplate',
  });
  const harness = await renderPane({ frontmatter: { statblock: true, 'atlas-template': TEMPLATE.id, name: 'Ogre' }, container });
  apps.push(harness.app);
  await frames(3);
  return harness;
}

function bandsOf(block: Element): HTMLTableElement[] {
  return [...block.querySelectorAll<HTMLTableElement>('table.atlas-sb-sheet-table__grid')];
}

/**
 * A Table too wide for the statblock pane, typed in place: it wraps into
 * bands as Fantasy Statblocks wraps its tables, typing a cell never moves it
 * into another band, and a column's handle drags it between bands.
 */
describe('a Table wrapped into bands, edited in place', () => {
  useEditorStyles();

  it('wraps within the pane, with every column once', async () => {
    const harness = await pane();
    const block = blockOf(harness.result.container, 'fage0001');
    const bands = bandsOf(block);
    expect(bands.length).toBeGreaterThan(1);
    for (const band of bands) expect(band.getBoundingClientRect().right).toBeLessThanOrEqual(block.getBoundingClientRect().right + 0.5);
    expect([...block.querySelectorAll('thead th')].map((name) => name.textContent)).toEqual(NAMES);
  });

  it('keeps its bands while a cell is typed, however wide the text grows', async () => {
    const harness = await pane();
    const block = blockOf(harness.result.container, 'fage0001');
    const count = bandsOf(block).length;
    const cell = block.querySelector('[data-table-row="0"][data-table-col="1"]')!;
    await act(async () => {
      await mouse.click(centreOf(cell).x, centreOf(cell).y);
      await frames(2);
    });
    const input = cell.querySelector('textarea')!;
    expect(document.activeElement).toBe(input);
    await act(async () => {
      await userEvent.keyboard('Supercalifragilisticexpialidocious');
      await frames(3);
    });
    expect(bandsOf(block)).toHaveLength(count);
    expect(document.activeElement).toBe(input);
  });

  it('drags a column from the second band into the first, where the line showed', async () => {
    const harness = await pane();
    const block = blockOf(harness.result.container, 'fage0001');
    const [first, second] = bandsOf(block);
    const moved = second!.querySelector('thead th')!;
    const from = Number(moved.getAttribute('data-table-col'));
    const target = first!.querySelector('[data-table-row="-1"][data-table-col="1"]')!;
    const handle = moved.querySelector<HTMLElement>('.atlas-sb-sheet-table__handle--column')!;
    await act(async () => {
      await mouse.hover(centreOf(moved).x, centreOf(moved).y);
      await frames(2);
    });
    const start = centreOf(handle);
    const end = centreOf(target);
    await act(async () => {
      await mouse.down(start.x, start.y);
      for (let step = 1; step <= 12; step++) {
        await mouse.move(start.x + ((end.x - start.x) * step) / 12, start.y + ((end.y - start.y) * step) / 12);
        await frames(1);
      }
    });
    const line = block.querySelector<HTMLElement>('.atlas-sb-sheet-table__drop--column')!;
    expect(line, 'the drop line shows').not.toBeNull();
    const lineBox = line.getBoundingClientRect();
    const firstBox = first!.getBoundingClientRect();
    expect(Math.abs(lineBox.left + lineBox.width / 2 - target.getBoundingClientRect().left), 'the line stands before the column it lands on').toBeLessThanOrEqual(1);
    expect(lineBox.top).toBeGreaterThanOrEqual(firstBox.top - 0.5);
    expect(lineBox.bottom).toBeLessThanOrEqual(firstBox.bottom + 0.5);
    await act(async () => {
      await mouse.up(end.x, end.y);
      await frames(3);
    });
    const expected = [...NAMES];
    const [name] = expected.splice(from, 1);
    expected.splice(1, 0, name!);
    expect(JSON.stringify(harness.writer.patches().at(-1))).toContain(JSON.stringify(expected));
  });
});
