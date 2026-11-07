// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { GENERIC_CREATURE } from '../../../../src/app/statblocks/presets/generic';
import { NOTE_PATH, renderPane, type PaneHarness, type PaneOptions } from './paneKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({
      conditions: [],
      statblockRoles: [{ id: 'monster', name: 'Monster', templateId: 'builtin:generic-creature' }],
    }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const apps: App[] = [];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

const NATIVE = { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden', hp: 14 };

async function pane(options: PaneOptions): Promise<PaneHarness> {
  const harness = await renderPane(options);
  apps.push(harness.app);
  await waitFor(() => expect(TemplateLibrary.forApp(harness.app).isLoading()).toBe(false));
  return harness;
}

const editableBlocks = (container: HTMLElement): number => container.querySelectorAll('.atlas-sb-pane-value').length;

describe('the statblock pane\'s edge states', () => {
  it('draws a note whose template is missing with the auto template, and offers to choose one', async () => {
    const { result, writer } = await pane({ frontmatter: { ...NATIVE, 'atlas-template': 'marsh-creature-k7m2qa' } });
    expect(screen.getByText('marsh-creature-k7m2qa').closest('.atlas-sb-pane-bar')?.textContent).toBe('Template marsh-creature-k7m2qa not foundChoose a template');
    expect(result.container.querySelector('[data-template="auto"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Choose a template' }));
    const dialog = screen.getByRole('dialog', { name: 'Change template' });
    expect(dialog).toBeTruthy();
    fireEvent.click(screen.getAllByRole('option', { name: /Creature/ })[0]!);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })); });
    expect(writer.patches()).toEqual([
      { op: 'set', path: ['atlas-template'], base: 'marsh-creature-k7m2qa', next: 'builtin:generic-creature' },
    ]);
  });

  it('keeps values editable with a template of a newer Atlas, and offers no Edit template', async () => {
    vi.spyOn(TemplateLibrary.prototype, 'get').mockReturnValue({
      template: GENERIC_CREATURE.template, name: 'Marsh creature', status: 'newer', builtIn: false, path: 'Templates/Marsh creature.atlastemplate',
    });
    const { result } = await pane({ frontmatter: { ...NATIVE, 'atlas-template': 'marsh-creature-k7m2qa' }, actions: { showProperties: vi.fn(), changeCollection: vi.fn(), editTemplate: vi.fn() } });
    expect(screen.getByText('Update Atlas to edit this template')).toBeTruthy();
    expect(editableBlocks(result.container)).toBeGreaterThan(0);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Statblock options' }), { key: 'Enter' });
    expect(await screen.findByRole('menuitem', { name: 'Change template…' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Edit template' })).toBeNull();
  });

  it('says so when the note no longer names an Atlas template, and offers nothing to edit', async () => {
    const { result } = await pane({ frontmatter: { statblock: true, name: 'Goblin' } });
    expect(screen.getByText('This note has no Atlas statblock.')).toBeTruthy();
    expect(editableBlocks(result.container)).toBe(0);
  });

  it('never writes into properties Obsidian cannot read', async () => {
    const { result } = await pane({ frontmatter: null, problem: { line: 3, message: 'Bad indentation' } });
    expect(screen.getByText('The note\'s properties can\'t be read (line 3)')).toBeTruthy();
    expect(editableBlocks(result.container)).toBe(0);
  });

  it('keeps what a deleted note held on screen, read-only', async () => {
    const harness = await pane({ frontmatter: NATIVE });
    const files = harness.app.vault as unknown as { getAbstractFileByPath: (path: string) => unknown };
    files.getAbstractFileByPath = () => null;
    act(() => harness.source.remove(NOTE_PATH));
    expect(screen.getByText(/Note deleted/)).toBeTruthy();
    expect(harness.result.container.querySelector('[data-block-id="header-name"]')?.textContent).toBe('Marsh Warden');
    expect(editableBlocks(harness.result.container)).toBe(0);
  });

  it('puts its options under the card, with no bar above it: Edit, Change and Duplicate template, Show Properties', async () => {
    const editTemplate = vi.fn();
    const { result, actions } = await pane({ frontmatter: NATIVE, actions: { showProperties: vi.fn(), changeCollection: vi.fn(), editTemplate } });
    expect(result.container.querySelector('.atlas-sb-pane-header')).toBeNull();
    const button = screen.getByRole('button', { name: 'Statblock options' });
    expect(button.closest('.atlas-sb-pane-card')).toBeNull();
    expect(button.closest('.atlas-sb-card-menu')?.previousElementSibling?.classList.contains('atlas-sb-pane-card')).toBe(true);
    fireEvent.keyDown(button, { key: 'Enter' });
    const rows = await screen.findAllByRole('menuitem');
    expect(rows.map((row) => row.textContent)).toEqual(['Edit template', 'Change template…', 'Duplicate template', 'Show Properties']);
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Edit template' })); });
    expect(editTemplate).toHaveBeenCalledWith('builtin:generic-creature', expect.anything(), NOTE_PATH);
    fireEvent.keyDown(button, { key: 'Enter' });
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: 'Show Properties' })); });
    expect(actions.showProperties).toHaveBeenCalled();
  });
});
