// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { toggleMarkIn } from '../../../../src/app/statblocks/editor/markdown-typing/markIn';
import { watchMarkdownTyping } from '../../../../src/app/statblocks/editor/markdown-typing/markdownTyping';
import { selectText } from '../../../../src/app/statblocks/editor/statblock-pane/plainEditable';
import { blockOf, NOTE_PATH, renderPane, type PaneHarness } from './paneKit';

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
const stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

const WARDEN = {
  statblock: true,
  'atlas-template': 'builtin:generic-creature',
  name: 'Marsh Warden',
  speed: '30 ft.',
  actions: [{ name: 'Bite', desc: 'It bites.' }],
};

/** The pane over the warden, with the note panel's link suggestions on its card; the vault also holds a note to link to. */
async function pane(): Promise<PaneHarness> {
  const harness = await renderPane({ frontmatter: WARDEN, files: { [NOTE_PATH]: '---\nstatblock: true\n---\n', 'Rules/Grappled.md': '# Grappled\n' } });
  apps.push(harness.app);
  harness.app.metadataCache.fileToLinktext = (file: TFile): string => file.basename;
  stops.push(watchMarkdownTyping(harness.app, harness.result.container, () => NOTE_PATH));
  return harness;
}

function abilityText(harness: PaneHarness): HTMLElement {
  fireEvent.click(harness.result.container.querySelector('.atlas-sb-trait')!);
  const text = screen.getByRole('textbox', { name: 'Action description' });
  text.focus();
  return text;
}

/** Types into the ability's text as the browser does: the text, the caret at its end, the `input` event. */
function typeIn(text: HTMLElement, typed: string): void {
  text.textContent = typed;
  selectText(text, typed.length, typed.length);
  act(() => { text.dispatchEvent(new InputEvent('input', { bubbles: true })); });
}

describe('Markdown typed in the pane', () => {
  it("writes a value formatted with Mod+B as typed, the field's draft following", async () => {
    const harness = await pane();
    fireEvent.click(blockOf(harness.result.container, 'gcspeed0'));
    const input = screen.getByRole('textbox', { name: 'Speed' }) as HTMLInputElement;
    input.setSelectionRange(0, 2);
    act(() => { toggleMarkIn(input, '**'); });
    expect(input.value).toBe('**30** ft.');
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['speed'], base: '30 ft.', next: '**30** ft.' }]);
  });

  it("formats an ability's text with Mod+I and writes it with the ability", async () => {
    const harness = await pane();
    const text = abilityText(harness);
    selectText(text, 3, 8);
    act(() => { toggleMarkIn(text, '*'); });
    expect(text.textContent).toBe('It *bites*.');
    await act(async () => { fireEvent.keyDown(text, { key: 'Enter' }); });
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['actions', 0, 'desc'], base: 'It bites.', next: 'It *bites*.' }]);
  });

  it("links a note from an ability's text: [[ offers it, Enter writes the link, Escape closes only the list", async () => {
    const harness = await pane();
    const text = abilityText(harness);
    type Keyed = { keys: Array<{ key: string; modifiers: string[]; func: (event: KeyboardEvent) => unknown }> };
    const scopes = (): Keyed[] => harness.app.keymap.scopes as Keyed[];
    const press = (key: string): unknown => {
      const handler = scopes().at(-1)?.keys.find((each) => each.key === key && each.modifiers.length === 0);
      let result: unknown;
      act(() => { result = handler?.func(new KeyboardEvent('keydown', { key })); });
      return result;
    };

    typeIn(text, 'It bites. [[Grap');
    expect(scopes()).toHaveLength(1);
    expect(press('Escape')).toBe(false);
    expect(scopes()).toHaveLength(0);
    // The ability is still being typed, and nothing was written.
    expect(text.isConnected).toBe(true);
    expect(harness.writer.patches()).toEqual([]);

    typeIn(text, 'It bites. [[Grap');
    expect(press('Enter')).toBe(false);
    expect(text.textContent).toBe('It bites. [[Grappled]]');
    await act(async () => { fireEvent.keyDown(text, { key: 'Enter' }); });
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['actions', 0, 'desc'], base: 'It bites.', next: 'It bites. [[Grappled]]' }]);
  });
});
