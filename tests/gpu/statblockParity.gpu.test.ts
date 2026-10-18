import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App } from 'obsidian';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { allBuiltInTemplates } from '../../src/app/statblocks/library/builtInTemplates';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import type { BuiltInTemplate } from '../../src/app/statblocks/model/templateTypes';
import { NotePanelRoot } from '../../src/app/statblocks/editor/note-panel/NotePanelRoot';
import { defaultPanelWidth, savePanelPrefs } from '../../src/app/statblocks/editor/note-panel/panelPrefs';
import { StatblockEditorRoot } from '../../src/app/statblocks/editor/StatblockEditorRoot';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { FakeSession } from '../unit/statblocks/template-editor/editorKit';
import { FakeSource, FakeWriter } from '../unit/statblocks/editor/paneKit';
import { THEME, frames } from './sidePanesHarness';

// Dice links and the token socket reach the map view and the token link
// service, whose Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({}) } }));
vi.mock('../../src/app/statblocks/editor/create/createFlow', () => ({
  createStatblock: async () => null,
  startStatblockCreation: async () => null,
}));
vi.mock('../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
    loadedCollections: () => [],
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

/**
 * WYSIWYG (§2, §17 A1/M7): the template editor draws a template in the frame
 * the note view draws a new statblock of it in, empty and with every section
 * open (the editor folds nothing; the note view's sections are unfolded by
 * their chips). The same template and stored panel width in both, nothing
 * hovered, give the panel the same width, the card the same width and place in
 * it, and the same blocks in the same order. Block boxes are not compared: the
 * note view draws an empty value as the field it is typed into, the editor as
 * its prompt, and the two are not the same height (`statblockChromeNeutrality`
 * holds the editor's card to the runtime card, block by block).
 */
const VIEW_WIDTH = 1400;
const VIEW_HEIGHT = 820;
const TOLERANCE = 0.5;
const NOTE_PATH = 'Bestiary/Marsh Warden.md';
/** What a readable line takes without a theme's variables: 700 px and 32 px on either side (`noteRoom.ts`). */
const READABLE_LINE = 764;
const OBSIDIAN = `
  * { box-sizing: border-box; }
  .workspace-leaf-content { position: relative; display: flex; flex-direction: column; width: ${VIEW_WIDTH}px; height: ${VIEW_HEIGHT}px; }
  .view-header { height: 40px; flex: none; }
  .view-content { width: 100%; height: calc(100% - 40px); }
`;
const h = React.createElement;
const noop = (): void => undefined;

interface Box { x: number; y: number; width: number; height: number }

function boxIn(element: Element, origin: DOMRect): Box {
  const rect = element.getBoundingClientRect();
  return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
}

/** The card's place in its panel host, and every block's box in the card. */
function measure(leaf: Element): { host: Box; card: Box; blocks: Map<string, Box> } {
  const host = leaf.querySelector('.atlas-sb-note-panel')!;
  const card = host.querySelector('.atlas-sb-pane-card')!;
  const hostRect = host.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const blocks = new Map<string, Box>();
  for (const frame of card.querySelectorAll('[data-block-id]')) blocks.set(frame.getAttribute('data-block-id') ?? '', boxIn(frame, cardRect));
  return { host: boxIn(host, leaf.getBoundingClientRect()), card: boxIn(card, hostRect), blocks };
}

function expectClose(actual: Box, expected: Box, what: string): void {
  for (const side of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(actual[side] - expected[side]), `${what} ${side}: ${actual[side]} vs ${expected[side]}`).toBeLessThanOrEqual(TOLERANCE);
  }
}

/** One app for both views: the note names the template and holds no values yet, as the metadata cache reports. */
function appFor(builtIn: BuiltInTemplate): { app: App; frontmatter: Record<string, unknown> } {
  const { app } = createInMemoryApp({ files: { [NOTE_PATH]: '---\nstatblock: true\n---\nThe warden keeps the marsh.\n' } });
  const frontmatter = { statblock: true, 'atlas-template': builtIn.id };
  vi.mocked(app.metadataCache.getFileCache).mockReturnValue({ frontmatter });
  return { app, frontmatter };
}

/** The note view as Obsidian builds it, decorated by `NoteStatblockPanel`: the note in Live Preview and the panel beside it. */
async function mountNoteView(app: App, frontmatter: Record<string, unknown>, panelWidth: number): Promise<HTMLElement> {
  const leaf = document.body.createDiv({ cls: ['workspace-leaf-content', 'atlas-sb-note', 'atlas-sb-note--hide-properties', 'note-view'] });
  leaf.createDiv({ cls: 'view-header' });
  const content = leaf.createDiv({ cls: 'view-content' });
  content.createDiv({ cls: ['markdown-source-view', 'mod-cm6', 'is-live-preview', 'is-readable-line-width'] });
  const host = content.createDiv({ cls: ['atlas-vtt-plugin', 'atlas-sb-note-panel'] });
  host.style.setProperty('--atlas-sb-panel-width', `${panelWidth}px`);
  const source = new FakeSource();
  source.set(NOTE_PATH, frontmatter);
  await act(async () => {
    render(h(TooltipProvider, null, h(NotePanelRoot, {
      pane: {
        app, services: { source, writer: new FakeWriter() }, notePath: NOTE_PATH, collectionId: 'campaign', propertiesShown: false,
        announcement: '', focusRequest: 0, pendingCommit: { current: null }, actions: { showProperties: noop, changeCollection: noop },
      },
      width: panelWidth, stacked: false, availableWidth: () => content.clientWidth, onResize: noop, onCancelResize: noop, onResetWidth: noop,
    })), { container: host });
  });
  return leaf;
}

/** Opens every section the note view folded, a chip at a time (a section unfolded may show a folded one inside). */
async function unfoldAll(leaf: HTMLElement): Promise<void> {
  for (let chip = leaf.querySelector<HTMLElement>('.atlas-sb-folded__chip[data-block-id-chip]'); chip; chip = leaf.querySelector('.atlas-sb-folded__chip[data-block-id-chip]')) {
    await act(async () => { chip?.click(); });
  }
}

/** The template editor's view of the same built-in. */
async function mountTemplateEditor(app: App, builtIn: BuiltInTemplate): Promise<HTMLElement> {
  const leaf = document.body.createDiv({ cls: ['workspace-leaf-content', 'template-view'] });
  leaf.createDiv({ cls: 'view-header' });
  const content = leaf.createDiv({ cls: ['view-content', 'atlas-vtt-plugin', 'atlas-template-editor-view'] });
  const session = new FakeSession(builtIn.template, { name: builtIn.name, path: null, builtIn: true });
  await act(async () => {
    render(h(StatblockEditorRoot, {
      surface: {
        kind: 'template-editor',
        props: { app, session, problem: null, host: { save: async () => null, close: noop }, collectionId: 'campaign' },
      },
    }), { container: content });
  });
  return leaf;
}

const apps: App[] = [];

describe('the template editor draws the statblock as the note view does', () => {
  const style = document.createElement('style');
  style.textContent = THEME + OBSIDIAN + css;

  beforeEach(async () => {
    await page.viewport(VIEW_WIDTH + 40, 2 * VIEW_HEIGHT + 40);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
    document.body.replaceChildren();
    for (const app of apps.splice(0)) TemplateLibrary.release(app);
  });

  async function compare(builtIn: BuiltInTemplate, chosenWidth: number | null): Promise<void> {
    const { app, frontmatter } = appFor(builtIn);
    apps.push(app);
    if (chosenWidth !== null) savePanelPrefs(app, { width: chosenWidth });
    const panelWidth = chosenWidth ?? defaultPanelWidth({ available: VIEW_WIDTH, readableLine: READABLE_LINE });
    const note = await mountNoteView(app, frontmatter, panelWidth);
    await unfoldAll(note);
    const editor = await mountTemplateEditor(app, builtIn);
    // The library, the collection and the editor's measured room settle over a few frames.
    await act(async () => { await frames(4); });

    const inNote = measure(note);
    const inEditor = measure(editor);
    expect(inNote.blocks.size, `${builtIn.id}: blocks drawn`).toBeGreaterThan(0);
    expectClose(inEditor.host, inNote.host, `${builtIn.id} panel`);
    expect([...inEditor.blocks.keys()]).toEqual([...inNote.blocks.keys()]);
    // The note's card stands at the top of its panel; the editor's under its capsule. Its sides match.
    expectClose({ ...inEditor.card, y: inNote.card.y, height: inNote.card.height }, inNote.card, `${builtIn.id} card`);
  }

  it.each(allBuiltInTemplates().map((builtIn) => [builtIn.id, builtIn] as const))(
    'draws %s in the note view\'s panel and card, with the same blocks, at the panel\'s default width',
    async (_id, builtIn) => { await compare(builtIn, null); },
  );

  it.each([[420], [680], [900]])('follows the width chosen beside the notes: %ipx', async (width) => {
    await compare(allBuiltInTemplates().find((builtIn) => builtIn.id === 'builtin:5e-2014-monster')!, width);
  });
});
