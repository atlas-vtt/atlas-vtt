import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../src/app/statblocks/library/sessionRegistry';
import { TEMPLATE_FORMAT, type StatblockTemplate, type TemplateBlock, type TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { renderPane } from '../unit/statblocks/editor/paneKit';
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

const TABLES = 6;
const COLUMNS = ['Roll', 'Item', 'Weight', 'Value', 'Notes', 'Source'];
const ROWS = Array.from({ length: 20 }, (_, row) => COLUMNS.map((name, col) => (col === 0 ? row + 1 : `${name} ${row} of the hoard`)));
const TABLE_FIELDS: TemplateField[] = Array.from({ length: TABLES }, (_, at) => ({ key: `loot${at}`, label: `Loot ${at + 1}`, type: 'scores', slots: COLUMNS, rows: ROWS }));
const TABLE_BLOCKS: TemplateBlock[] = Array.from({ length: TABLES }, (_, at) => ({ id: `loot000${at}`, type: 'scores', field: `loot${at}`, orientation: 'row' }));
const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'large-tables-q7m2kc',
  fields: [{ key: 'name', label: 'Name', type: 'text' }, ...TABLE_FIELDS],
  layout: { maxColumns: 2, blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }, ...TABLE_BLOCKS] },
};
/** One layout of the card at a new width took about half a second with the room pulled up by a negative margin. */
const LAYOUT_BUDGET_MS = 60;

const apps: App[] = [];
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) {
    await releaseTemplateSessions(app);
    TemplateLibrary.release(app);
  }
  document.querySelectorAll('.atlas-test-pane').forEach((host) => host.remove());
});

async function pane(): Promise<HTMLElement> {
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'atlas-vtt-plugin atlas-test-pane' }));
  container.style.width = '900px';
  vi.spyOn(TemplateLibrary.prototype, 'get').mockReturnValue({
    template: TEMPLATE, name: 'Large tables', status: 'ok', builtIn: false, path: 'Templates/Large tables.atlastemplate',
  });
  const harness = await renderPane({ frontmatter: { statblock: true, 'atlas-template': TEMPLATE.id, name: 'Dragon hoard' }, container });
  apps.push(harness.app);
  await frames(3);
  return container;
}

async function resizeTo(container: HTMLElement, width: number): Promise<void> {
  await act(async () => {
    container.style.width = `${width}px`;
    await frames(2);
  });
}

/**
 * A statblock of several long Tables, opened and resized (#514): Obsidian
 * froze opening such a note beside its statblock, and resizing took seconds.
 */
describe('a statblock with large tables', () => {
  useEditorStyles();

  it('lays its card out at a new width without laying the tables out again and again', async () => {
    const container = await pane();
    const cell = container.querySelector('td')!;
    expect(container.querySelectorAll('.atlas-sb-sheet-table')).toHaveLength(TABLES);
    const times: number[] = [];
    for (const width of [880, 860, 840]) {
      const started = performance.now();
      container.style.width = `${width}px`;
      void cell.getBoundingClientRect();
      times.push(performance.now() - started);
    }
    expect(Math.min(...times)).toBeLessThan(LAYOUT_BUDGET_MS);
  });

  it('measures every table of the card in one reading as it resizes', async () => {
    const container = await pane();
    const measuringNow: number[] = [];
    const read = HTMLTableCellElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLTableCellElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLTableCellElement) {
      if (this.closest('[data-measuring]')) measuringNow.push(container.querySelectorAll('[data-measuring]').length);
      return read.call(this);
    });
    for (const width of [700, 520, 380]) await resizeTo(container, width);
    expect(measuringNow.length).toBeGreaterThan(0);
    expect(new Set(measuringNow)).toEqual(new Set([TABLES]));
  });

  it('still wraps every table into bands that fit its card', async () => {
    const container = await pane();
    await resizeTo(container, 380);
    for (const room of container.querySelectorAll<HTMLElement>('.atlas-sb-sheet-table')) {
      const right = room.getBoundingClientRect().right;
      const bands = [...room.querySelectorAll('table')];
      expect(bands.length).toBeGreaterThan(1);
      for (const band of bands) expect(band.getBoundingClientRect().right).toBeLessThanOrEqual(right + 0.5);
      expect([...room.querySelectorAll('thead th')].map((name) => name.textContent)).toEqual(COLUMNS);
    }
  });
});
