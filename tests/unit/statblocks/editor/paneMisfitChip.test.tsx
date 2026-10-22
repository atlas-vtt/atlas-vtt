// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
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

const apps: App[] = [];
afterEach(() => {
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

async function pane(hp: unknown): Promise<PaneHarness> {
  const harness = await renderPane({ frontmatter: { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden', hp } });
  apps.push(harness.app);
  return harness;
}

const chips = (block: HTMLElement): string[] => [...block.querySelectorAll('.atlas-sb-misfit')].map((chip) => chip.textContent ?? '');

describe('the statblock pane over a value that does not fit its field\'s type', () => {
  it('shows the value as written with one chip, and no warning dot beside it', async () => {
    const { result } = await pane('1/4');
    const hp = blockOf(result.container, 'header-hp');
    expect(hp.querySelector('.atlas-sb-value')?.textContent).toBe('1/4');
    expect(chips(hp)).toEqual(['Not a number']);
    expect(hp.querySelector('.atlas-sb-pane-warning')).toBeNull();
  });

  it('shows a list where a number should be with the chip, and edits it as text', async () => {
    const { result, writer } = await pane([14, 18]);
    const hp = blockOf(result.container, 'header-hp');
    expect(chips(hp)).toEqual(['Not a number']);

    fireEvent.click(hp);
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Hit Points' });
    expect(input.value).toBe('14, 18');
    fireEvent.change(input, { target: { value: '18' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(writer.patches()).toEqual([{ op: 'set', path: ['hp'], base: [14, 18], next: 18 }]);
  });

  it('shows no chip for a value that fits', async () => {
    const { result } = await pane(14);
    expect(result.container.querySelector('.atlas-sb-misfit')).toBeNull();
  });
});
