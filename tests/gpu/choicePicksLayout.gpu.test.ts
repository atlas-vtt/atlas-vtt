import '../setup/obsidianDom';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../src/app/statblocks/library/sessionRegistry';
import type { TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { MARSH_CREATURE } from '../fixtures/statblockTemplateFixtures';
import { MARSH_ID, MARSH_PATH, marshText } from '../unit/statblocks/library/templateTexts';
import { blockOf, NOTE_PATH, renderPane, type PaneHarness } from '../unit/statblocks/editor/paneKit';
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

const SENSES_BLOCK = 'p2n5r9xy';
const SENSES: TemplateField = {
  key: 'senses', label: 'Senses', type: 'choice', meaning: 'senses',
  options: ['darkvision', 'blindsight', 'tremorsense', 'truesight'], several: true, numbered: true, unit: 'ft.',
};
const fields = MARSH_CREATURE.fields.map((field) => (field.key === 'senses' ? SENSES : field));
const apps: App[] = [];

afterEach(async () => {
  cleanup();
  for (const app of apps.splice(0)) {
    await releaseTemplateSessions(app);
    TemplateLibrary.release(app);
  }
});

async function pane(): Promise<PaneHarness> {
  const frontmatter = { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', senses: 'darkvision 60 ft., blindsight 10 ft.' };
  // Inside the plugin's root, as the note panel draws it: the pane's styles are scoped to it.
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'atlas-vtt-plugin' }));
  const harness = await renderPane({ frontmatter, container, files: { [NOTE_PATH]: '---\nstatblock: true\n---\n', [MARSH_PATH]: marshText({ fields }) } });
  apps.push(harness.app);
  vi.mocked(harness.app.metadataCache.getFileCache).mockImplementation((file: TFile) => (
    file.path === NOTE_PATH ? { frontmatter: { statblock: true, 'atlas-template': MARSH_ID } } : null));
  await vi.waitFor(() => expect(TemplateLibrary.forApp(harness.app).get(MARSH_ID)).not.toBeNull());
  await frames(2);
  return harness;
}

/**
 * The picks of a choice edited in place: each chip holds its option, its
 * number and the unit on one line, and the options not picked yet hang
 * under the input that adds them, inside the window.
 */
describe('editing several picks with a number each', () => {
  useEditorStyles();

  it('keeps every chip on one line with its number inside, and hangs the options under the input', async () => {
    const harness = await pane();
    act(() => { fireEvent.click(blockOf(harness.result.container, SENSES_BLOCK)); });
    await frames(2);
    const chips = [...document.querySelectorAll<HTMLElement>('.atlas-sb-pane-pick')];
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      const box = chip.getBoundingClientRect();
      const number = chip.querySelector<HTMLElement>('.atlas-sb-pane-pick__number')!.getBoundingClientRect();
      expect(number.left).toBeGreaterThanOrEqual(box.left);
      expect(number.right).toBeLessThanOrEqual(box.right);
      // One line: the chip is no taller than its own height token, so nothing inside wrapped.
      expect(box.height).toBeLessThanOrEqual(24);
    }
    const add = document.querySelector<HTMLInputElement>('.atlas-sb-pane-pick__add input')!;
    act(() => { add.focus(); });
    await frames(2);
    const list = document.querySelector<HTMLElement>('.atlas-sb-pane-options')!.getBoundingClientRect();
    expect(list.top).toBeGreaterThanOrEqual(add.getBoundingClientRect().bottom);
    expect(list.bottom).toBeLessThanOrEqual(window.innerHeight);
  });
});
