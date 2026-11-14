// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import { frontmatterProblem } from '../../../../src/app/statblocks/notes/frontmatterProblem';
import { frontmatterOfText } from '../../../../src/app/statblocks/notes/statblockSource';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';
import { renderObsidianBlocks } from '../render/obsidianBlocks';
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
beforeEach(() => {
  renderObsidianBlocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

const ACTIONS_BLOCK = 'e7y2b6gh';
/** The report's list: abilities with parts ("Range", "Rank", "Traits") before their text. */
const ACTIONS: TemplateField = {
  key: 'actions', label: 'Actions', type: 'entries',
  entry: { extras: [{ key: 'range', label: 'Range', type: 'text' }, { key: 'rank', label: 'Rank', type: 'number' }, { key: 'traits', label: 'Traits', type: 'list' }] },
};
const fields = MARSH_CREATURE.fields.map((field) => (field.key === 'actions' ? ACTIONS : field));

/** Report #703's text, as a rules page gives it: a paragraph, a blank line, two lines. */
const PASTED = [
  "Your patron blankets the target's eyes in darkness. If you cast this hex on a willing ally (for instance, one with light blindness), the ally can choose which result it gets without rolling.",
  '',
  'Success The target is unaffected.',
  'Failure The target is shrouded in murky darkness. It treats bright light as dim light, and unless it has greater darkvision, all creatures are concealed to it.',
].join('\n');

const BEFORE_LIST = `---
statblock: true
atlas-template: ${MARSH_ID}
name: Witch   # she hexes
hp: 30
actions:
  - name: Shroud of Night
    range: 30 feet
    rank: 1
    traits: [hex, darkness]
`;
const AFTER_LIST = `  - name: Cackle
    desc: Sustains a hex.
senses: "darkvision 60 ft."
---
The note's own text.
`;
const NOTE = BEFORE_LIST + AFTER_LIST;

async function pane(noteText: string): Promise<PaneHarness> {
  const harness = await renderPane({ frontmatter: frontmatterOfText(noteText), files: { [NOTE_PATH]: noteText, [MARSH_PATH]: marshText({ fields }) } });
  apps.push(harness.app);
  // The template file is read in the library's own tasks.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return harness;
}

const actions = (harness: PaneHarness): HTMLElement => blockOf(harness.result.container, ACTIONS_BLOCK);
const description = (): HTMLElement => screen.getByRole('textbox', { name: 'Action description' });

/** Puts `text` into the first ability's description, as a paste does, and commits the ability with Enter. */
async function pasteIntoFirst(harness: PaneHarness, text: string): Promise<void> {
  fireEvent.click(actions(harness).querySelectorAll('.atlas-sb-trait')[0]!);
  description().textContent = text;
  fireEvent.input(description());
  await act(async () => { fireEvent.keyDown(description(), { key: 'Enter' }); });
}

describe('a description of several paragraphs pasted into an ability (#703)', () => {
  it('is written as the text it is, and leaves every other line of the note as it was', async () => {
    const harness = await pane(NOTE);
    await pasteIntoFirst(harness, PASTED);
    const patches = harness.writer.patches();
    expect(patches).toEqual([{ op: 'set', path: ['actions', 0, 'desc'], base: undefined, next: PASTED }]);

    for (const note of [NOTE, NOTE.replace(/\n/g, '\r\n')]) {
      const eol = note.includes('\r\n') ? '\r\n' : '\n';
      const result = applyFrontmatterPatches(note, patches);
      expect(result.conflicts).toEqual([]);
      expect(frontmatterProblem(result.text)).toBeNull();
      expect(result.text.startsWith(BEFORE_LIST.replace(/\n/g, eol))).toBe(true);
      expect(result.text.endsWith(AFTER_LIST.replace(/\n/g, eol))).toBe(true);
      const read = frontmatterOfText(result.text) as { actions: Array<Record<string, unknown>> };
      expect(read.actions).toEqual([
        { name: 'Shroud of Night', range: '30 feet', rank: 1, traits: ['hex', 'darkness'], desc: PASTED },
        { name: 'Cackle', desc: 'Sustains a hex.' },
      ]);
    }
  });

  it('shows in the card with its paragraphs, the list and what follows it still there and editable', async () => {
    const harness = await pane(NOTE);
    await pasteIntoFirst(harness, PASTED);
    const written = applyFrontmatterPatches(NOTE, harness.writer.patches()).text;
    await act(async () => { harness.source.set(NOTE_PATH, frontmatterOfText(written)); });

    const list = actions(harness);
    expect(list.querySelector('.atlas-sb-section-heading')?.textContent).toContain('Actions');
    const [shroud, cackle] = [...list.querySelectorAll<HTMLElement>('.atlas-sb-trait:not(.atlas-sb-pane-entry-editor)')];
    expect(shroud!.querySelector('.atlas-sb-trait-name')!.textContent).toBe('Shroud of Night');
    const text = [...shroud!.querySelectorAll<HTMLElement>('.atlas-sb-markdown')].at(-1)!;
    // The first paragraph runs on after the name and the parts; the lines after the blank one are a paragraph under it.
    expect(text.firstChild?.textContent).toBe(PASTED.split('\n')[0]);
    expect([...text.querySelectorAll(':scope > p')].map((paragraph) => paragraph.textContent)).toEqual([PASTED.split('\n').slice(2).join('')]);
    expect(text.querySelector(':scope > p > br')).not.toBeNull();
    expect(cackle!.textContent).toContain('Sustains a hex.');

    // Still an ability of the list: it opens again with the text it holds.
    fireEvent.click(shroud!);
    expect(description().textContent).toBe(PASTED);
    expect((document.activeElement as HTMLInputElement).value).toBe('Shroud of Night');
  });
});
