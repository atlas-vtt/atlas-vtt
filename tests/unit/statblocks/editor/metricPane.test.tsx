// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { editableSpots } from '../../../../src/app/statblocks/editor/statblock-pane/editableSpots';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { sheetState } from '../../../../src/app/statblocks/render/sheetState';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { blockOf, renderPane, type PaneHarness } from './paneKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'thresholds-k7m2qa',
  fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'major', label: 'Major', type: 'number' },
    { key: 'severe', label: 'Severe', type: 'number' },
  ],
  layout: {
    maxColumns: 1,
    blocks: [
      { id: 'title001', type: 'title', field: 'name', level: 1 },
      { id: 'metric01', type: 'metric', heading: 'Thresholds', fields: ['major', 'severe', ''] },
    ],
  },
};

const apps: App[] = [];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

async function pane(values: Record<string, unknown>): Promise<PaneHarness> {
  vi.spyOn(TemplateLibrary.prototype, 'get').mockReturnValue({
    template: TEMPLATE, name: 'Thresholds', status: 'ok', builtIn: false, path: 'Templates/Thresholds.atlastemplate',
  });
  const harness = await renderPane({ frontmatter: { statblock: true, 'atlas-template': TEMPLATE.id, name: 'Marsh Warden', ...values } });
  apps.push(harness.app);
  return harness;
}

const number = (metric: HTMLElement, index: number): HTMLElement => metric.querySelector<HTMLElement>(`[data-metric-index="${index}"]`)!;

describe('a Metric in the statblock pane', () => {
  it('offers each named number to fill in, in the template\'s field order', () => {
    const { byBlock, order } = editableSpots(TEMPLATE, sheetState({ template: TEMPLATE, record: {}, mode: 'editing' }));
    expect(byBlock.get('metric01')?.map((field) => field.key)).toEqual(['major', 'severe']);
    expect(order.map((spot) => [spot.field.key, spot.blockId])).toEqual([['name', 'header-name'], ['major', 'metric01'], ['severe', 'metric01']]);
  });

  it('types the number clicked in its own place, the other numbers drawn as they are', async () => {
    const { result, writer } = await pane({ major: 8 });
    const metric = blockOf(result.container, 'metric01');
    fireEvent.click(number(metric, 1));
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Severe' });
    expect(number(metric, 1).contains(input)).toBe(true);
    expect(input.placeholder).toBe('Add severe');
    expect(metric.querySelectorAll('input')).toHaveLength(1);
    expect(number(metric, 0).textContent).toContain('8');

    fireEvent.change(input, { target: { value: '15' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(writer.patches()).toEqual([{ op: 'set', path: ['severe'], next: 15 }]);
  });

  it('goes from one number to the next with Tab', async () => {
    const { result } = await pane({ major: 8, severe: 15 });
    const metric = blockOf(result.container, 'metric01');
    fireEvent.click(number(metric, 0));
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Major' }).value).toBe('8');
    await act(async () => { fireEvent.keyDown(document.activeElement!, { key: 'Tab' }); });
    const severe = screen.getByRole<HTMLInputElement>('textbox', { name: 'Severe' });
    expect(document.activeElement).toBe(severe);
    expect(number(metric, 1).contains(severe)).toBe(true);
  });
});
