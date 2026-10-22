// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, WorkspaceLeaf } from 'obsidian';
import { TemplateEditorView } from '../../../../src/app/statblocks/editor/TemplateEditorView';
import { openTemplateEditor } from '../../../../src/app/statblocks/editor/openTemplateEditor';
import { TEMPLATE_EDITOR_VIEW_TYPE } from '../../../../src/app/statblocks/editor/templateEditorState';
import { SettingsService } from '../../../../src/app/services/SettingsService';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { withStatblockEditor } from '../../../mocks/experimentalFeatures';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';
import { FakeLeaf, fakeWorkspace } from '../editor/workspaceKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
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

const BUILT_IN = 'builtin:generic-creature';
/** The template's name in the capsule: plain text, no field to type in. */
const capsuleName = (): string | null | undefined => document.querySelector('.atlas-te-capsule .atlas-te-name')?.textContent;
const views: TemplateEditorView[] = [];
const apps: App[] = [];

afterEach(async () => {
  for (const view of views.splice(0)) await act(async () => { await view.onClose(); });
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

async function open(switchedOn = true): Promise<{ app: App; view: TemplateEditorView; files: Map<string, string> }> {
  const { app, files } = createInMemoryApp({ files: { [MARSH_PATH]: marshText() } });
  apps.push(app);
  // "Used by n statblocks" reads the notes from the metadata cache; this vault holds none.
  (app.vault as unknown as Record<string, unknown>).getMarkdownFiles = () => [];
  if (switchedOn) withStatblockEditor(app);
  const leaf = new FakeLeaf({ type: TEMPLATE_EDITOR_VIEW_TYPE }, app);
  const view = new TemplateEditorView(leaf as unknown as WorkspaceLeaf);
  views.push(view);
  document.body.appendChild(view.contentEl);
  await act(async () => { await view.onOpen(); });
  return { app, view, files };
}

describe('TemplateEditorView', () => {
  it('owns .atlastemplate files and nothing else', async () => {
    const { view } = await open();
    expect(view.getViewType()).toBe('atlas-statblock-template');
    expect(view.canAcceptExtension('atlastemplate')).toBe(true);
    expect(view.canAcceptExtension('md')).toBe(false);
    expect(view.canAcceptExtension('atlasmap')).toBe(false);
  });

  it('opens a built-in by id, editable, and saves the state it restores without writing', async () => {
    const { view, files } = await open();
    const before = new Map(files);
    const state = { templateId: BUILT_IN, collectionId: 'campaign', fromNote: 'Bestiary/Bog Hag.md' };
    await act(async () => { await view.setState(state, { history: false }); });
    expect(view.getState()).toEqual(state);
    expect(screen.getByText('Built in. Save keeps your changes as a new template.')).toBeTruthy();
    expect(files).toEqual(before);
  });

  it('opens a template file once the library has read it, and restores without writing', async () => {
    const { view, files } = await open();
    const before = files.get(MARSH_PATH);
    await act(async () => { await view.setState({ file: MARSH_PATH, collectionId: null }, { history: false }); });
    await waitFor(() => expect(capsuleName()).toBe('Marsh creature'));
    expect(view.getState()).toEqual({ file: MARSH_PATH, collectionId: null, fromNote: null });
    expect(view.getDisplayText()).toBe('Marsh creature');
    expect(files.get(MARSH_PATH)).toBe(before);
  });

  it('shows nothing to edit while the statblock editor is switched off', async () => {
    const { view } = await open(false);
    await act(async () => { await view.setState({ templateId: BUILT_IN }, { history: false }); });
    expect(screen.getByText('Turn on the statblock editor under Experimental features to edit templates.')).toBeTruthy();
  });

  it('follows the switch: a view restored before Atlas\' settings are read shows the editor once they say it is on', async () => {
    const { app, files } = createInMemoryApp({ files: { [MARSH_PATH]: marshText() } });
    apps.push(app);
    (app.vault as unknown as Record<string, unknown>).getMarkdownFiles = () => [];
    const settings = SettingsService.forApp(app) ?? new SettingsService(app);
    const listeners: Array<() => void> = [];
    vi.spyOn(settings, 'onChange').mockImplementation((listener) => {
      // The view reads the switch itself; what the listener is handed is not looked at.
      listeners.push(() => listener({} as Parameters<typeof listener>[0]));
      return () => undefined;
    });
    const view = new TemplateEditorView(new FakeLeaf({ type: TEMPLATE_EDITOR_VIEW_TYPE }, app) as unknown as WorkspaceLeaf);
    views.push(view);
    document.body.appendChild(view.contentEl);
    await act(async () => { await view.onOpen(); });
    await act(async () => { await view.setState({ file: MARSH_PATH, collectionId: null }, { history: false }); });
    expect(screen.getByText('Turn on the statblock editor under Experimental features to edit templates.')).toBeTruthy();

    withStatblockEditor(app);
    act(() => { for (const tell of listeners) tell(); });
    await waitFor(() => expect(capsuleName()).toBe('Marsh creature'));
    expect(screen.queryByText(/Turn on the statblock editor/)).toBeNull();
    expect(files.get(MARSH_PATH)).toBe(marshText());
  });

  it('asks the editor first for the keys Obsidian would take, and lets them through when it has none', async () => {
    const { view } = await open();
    const keys = (view.scope as unknown as { keys: Array<{ modifiers: string[]; key: string; func: (event: KeyboardEvent) => unknown }> }).keys;
    expect(keys.map(({ modifiers, key }) => `${modifiers.join('+')}+${key}`)).toEqual(expect.arrayContaining(['Mod+g', 'Mod+Shift+g', 'Mod+z', 'Mod+Alt+r', 'Mod+s']));
    expect(keys[0]?.func(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))).toBe(true);
  });
});

describe('openTemplateEditor', () => {
  it('opens a template in a tab of its own, behind the switch', async () => {
    const { app } = createInMemoryApp({ files: { [MARSH_PATH]: marshText() } });
    apps.push(app);
    const fake = fakeWorkspace([], null);
    app.workspace = fake.workspace;
    expect(await openTemplateEditor(app, { templateId: BUILT_IN })).toBeNull();

    withStatblockEditor(app);
    await openTemplateEditor(app, { templateId: BUILT_IN, collectionId: 'campaign', select: 'abc' });
    const [leaf] = fake.leaves;
    expect(leaf?.getViewState()).toEqual({
      type: TEMPLATE_EDITOR_VIEW_TYPE,
      state: { templateId: BUILT_IN, collectionId: 'campaign', fromNote: null },
      active: true,
    });
    expect(leaf?.eState).toEqual({ select: 'abc' });

    // A second open of the same template reuses its tab.
    await openTemplateEditor(app, { templateId: BUILT_IN });
    expect(fake.leaves).toHaveLength(1);
  });

  it('opens a vault template by its file', async () => {
    const { app } = createInMemoryApp({ files: { [MARSH_PATH]: marshText() } });
    apps.push(app);
    withStatblockEditor(app);
    const fake = fakeWorkspace([], null);
    app.workspace = fake.workspace;
    await waitFor(() => expect(TemplateLibrary.forApp(app).get(MARSH_ID)).not.toBeNull());
    await openTemplateEditor(app, { templateId: MARSH_ID });
    expect(fake.leaves[0]?.getViewState().state).toEqual({ file: MARSH_PATH, collectionId: null, fromNote: null });
  });

  it('opens in a note\'s own leaf from "Edit template", remembering the note', async () => {
    const { app } = createInMemoryApp({ files: { [MARSH_PATH]: marshText() } });
    apps.push(app);
    withStatblockEditor(app);
    const fake = fakeWorkspace([], null);
    app.workspace = fake.workspace;
    const noteLeaf = new FakeLeaf({ type: 'markdown', state: { file: 'Bestiary/Bog Hag.md' } }, app);
    await openTemplateEditor(app, { templateId: BUILT_IN, leaf: noteLeaf as unknown as WorkspaceLeaf, fromNote: 'Bestiary/Bog Hag.md' });
    expect(noteLeaf.getViewState()).toMatchObject({ type: TEMPLATE_EDITOR_VIEW_TYPE, state: { templateId: BUILT_IN, fromNote: 'Bestiary/Bog Hag.md' } });
    expect(fake.leaves).toHaveLength(0);
  });
});
