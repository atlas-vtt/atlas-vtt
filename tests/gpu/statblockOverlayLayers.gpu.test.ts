import '../setup/obsidianDom';
import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import hoverPreviewCss from '../../src/app/react/components/statblock-hover-preview.scss?inline';
import previewWindowCss from '../../src/app/services/statblock-preview-window.scss?inline';
import { StatblockHoverPreview } from '../../src/app/react/components/StatblockHoverPreview';
import { holdPreviewShown } from '../../src/app/react/components/statblock/previewShown';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { releaseTemplateSessions } from '../../src/app/statblocks/library/sessionRegistry';
import type { TemplateBlock, TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { MARSH_CREATURE } from '../fixtures/statblockTemplateFixtures';
import { MARSH_ID, MARSH_PATH, marshText } from '../unit/statblocks/library/templateTexts';
import { blockOf, NOTE_PATH, renderPane } from '../unit/statblocks/editor/paneKit';
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

const HABITAT: TemplateField = { key: 'habitat', label: 'Habitat', type: 'choice', options: ['Marsh', 'Forest', 'Underdark', 'Coast', 'Mountain', 'Desert'] };
const SENSES: TemplateField = {
  key: 'senses', label: 'Senses', type: 'choice', meaning: 'senses',
  options: ['darkvision', 'blindsight', 'tremorsense', 'truesight'], several: true, numbered: true, unit: 'ft.',
};
const HABITAT_BLOCK = 'q5habita';
const SENSES_BLOCK = 'p2n5r9xy';
const FIELDS = [...MARSH_CREATURE.fields.map((field) => (field.key === 'senses' ? SENSES : field)), HABITAT];

/** The Marsh layout with `last` as its last block: what lies under the card's bottom edge is cut by the card. */
function layoutEndingWith(last: TemplateBlock): typeof MARSH_CREATURE.layout {
  const blocks = MARSH_CREATURE.layout.blocks.filter((block) => block.id !== last.id && block.type !== 'entries');
  return { ...MARSH_CREATURE.layout, blocks: [...blocks, last] };
}

const apps: App[] = [];
afterEach(async () => {
  cleanup();
  for (const app of apps.splice(0)) {
    await releaseTemplateSessions(app);
    TemplateLibrary.release(app);
  }
  document.querySelectorAll('.atlas-test-pane, .atlas-test-layer').forEach((node) => node.remove());
});

async function paneEndingWith(last: TemplateBlock): Promise<HTMLElement> {
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'atlas-vtt-plugin atlas-test-pane' }));
  container.style.width = '440px';
  const frontmatter = { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', senses: 'darkvision 60 ft.' };
  const files = { [NOTE_PATH]: '---\nstatblock: true\n---\n', [MARSH_PATH]: marshText({ fields: FIELDS, layout: layoutEndingWith(last) }) };
  const harness = await renderPane({ frontmatter, container, files });
  apps.push(harness.app);
  vi.mocked(harness.app.metadataCache.getFileCache).mockImplementation((file: TFile) => (
    file.path === NOTE_PATH ? { frontmatter: { statblock: true, 'atlas-template': MARSH_ID } } : null));
  await vi.waitFor(() => expect(container.querySelector(`[data-block-id="${last.id}"]`)).not.toBeNull());
  await frames(2);
  return container;
}

/** Every option of the open list is whole in the window and on top at its middle: nothing cuts or covers it. */
async function expectOptionsOnTop(): Promise<void> {
  await frames(2);
  const options = [...document.querySelectorAll<HTMLElement>('.atlas-sb-pane-option')];
  expect(options.length).toBeGreaterThan(0);
  for (const option of options) {
    const box = option.getBoundingClientRect();
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    expect(option.contains(hit), `"${option.textContent}" is covered by ${hit?.className}`).toBe(true);
  }
}

describe('a dropdown in the card\'s last block', () => {
  useEditorStyles();

  it('shows every option of a choice above the card\'s edge', async () => {
    const container = await paneEndingWith({ id: HABITAT_BLOCK, type: 'stat', field: 'habitat', look: 'run-in' });
    act(() => { blockOf(container, HABITAT_BLOCK).click(); });
    await frames(2);
    const input = container.querySelector<HTMLInputElement>('.atlas-sb-pane-choice input')!;
    act(() => { input.focus(); });
    await expectOptionsOnTop();
    // Hung from its field, in the same window.
    const list = document.querySelector<HTMLElement>('.atlas-sb-pane-options')!;
    expect(list.getBoundingClientRect().top).toBeGreaterThanOrEqual(input.getBoundingClientRect().bottom);
    expect(container.contains(list)).toBe(false);
  });

  it('shows every option of a choice with several picks above the card\'s edge', async () => {
    const container = await paneEndingWith({ id: SENSES_BLOCK, type: 'stat', field: 'senses', look: 'run-in' });
    act(() => { blockOf(container, SENSES_BLOCK).click(); });
    await frames(2);
    act(() => { container.querySelector<HTMLInputElement>('.atlas-sb-pane-pick__add input')!.focus(); });
    await expectOptionsOnTop();
  });
});

/** Obsidian's own rules for its popovers (app.css): `.popover` lies in `--layer-popover`, 30. */
const OBSIDIAN_POPOVER = `body { --layer-popover: 30; } .popover { display: flex; position: absolute; z-index: var(--layer-popover); }`;

/** A note's hover popover where Obsidian puts it: in the body, over the middle of the preview. */
function popoverOver(preview: HTMLElement): HTMLElement {
  const box = preview.getBoundingClientRect();
  const popover = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'popover hover-popover atlas-test-layer' }));
  Object.assign(popover.style, { left: `${box.left + 20}px`, top: `${box.top + 20}px`, width: '200px', height: '100px' });
  return popover;
}

const onTop = (popover: HTMLElement): boolean => {
  const box = popover.getBoundingClientRect();
  return popover.contains(document.elementFromPoint(box.left + 10, box.top + 10));
};

describe('a note previewed from a link in a statblock preview', () => {
  useEditorStyles();
  const style = document.createElement('style');
  style.textContent = OBSIDIAN_POPOVER + hoverPreviewCss + previewWindowCss;
  beforeEach(() => { document.head.append(style); });
  afterEach(() => style.remove());

  it('stands above the hover preview while it is shown, and keeps Obsidian\'s layer once it is gone', async () => {
    const { unmount } = render(createElement(StatblockHoverPreview, { notePath: 'Bestiary/Bog Hag.md', isVisible: true, isClosing: false, position: { x: 200, y: 200 } }));
    const preview = document.querySelector<HTMLElement>('.statblock-hover-preview')!;
    Object.assign(preview.style, { width: '400px', height: '300px' });
    const popover = popoverOver(preview);
    await frames(1);
    expect(onTop(popover)).toBe(true);
    unmount();
    await frames(1);
    expect(getComputedStyle(popover).zIndex).toBe('30');
  });

  it.each([
    ['the preview window', 'atlas-statblock-preview-window'],
    ['the preview window over a modal', 'atlas-statblock-preview-window atlas-statblock-preview-window--over-modal'],
  ])('stands above %s', async (_name, className) => {
    const preview = document.body.appendChild(Object.assign(document.createElement('div'), { className: `${className} atlas-test-layer` }));
    Object.assign(preview.style, { left: '100px', top: '100px', width: '400px', height: '300px' });
    const release = holdPreviewShown(document);
    const popover = popoverOver(preview);
    await frames(1);
    expect(onTop(popover)).toBe(true);
    release();
  });
});
