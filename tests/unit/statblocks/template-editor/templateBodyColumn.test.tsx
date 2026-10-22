// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownView, Platform, TFile, type OpenViewState, type WorkspaceLeaf } from 'obsidian';
import { BODY_PLACEHOLDER } from '../../../../src/app/statblocks/editor/template-editor/shell/TemplateBodyColumn';
import { BODY_LABEL, START_FROM_NOTE } from '../../../../src/app/statblocks/editor/template-editor/shell/bodyTexts';
import { DRAFT_SAVE_HINT, SAVE_HINT } from '../../../../src/app/statblocks/editor/template-editor/shell/TemplateCapsule';
import { followTemplateBodies } from '../../../../src/app/statblocks/library/templateBodyNotes';
import { templateBodyPath } from '../../../../src/app/statblocks/library/templatePaths';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { described } from '../library/sessionVault';
import { MARSH_ID, MARSH_PATH, TEMPLATE_FOLDER } from '../library/templateTexts';
import { editorViews, saveButton, saveOffered } from './editorViewKit';

/** Obsidian's note search, as far as the column opens it: what it leaves out, and the choice. */
const chooser = vi.hoisted(() => ({ skip: undefined as string | null | undefined, choose: null as ((file: import('obsidian').TFile) => void) | null }));
vi.mock('../../../../src/app/statblocks/editor/template-editor/shell/NoteTextModal', () => ({
  NoteTextModal: class {
    constructor(_app: unknown, skip: string | null, choose: (file: import('obsidian').TFile) => void) {
      chooser.skip = skip;
      chooser.choose = choose;
    }
    open(): void {}
  },
}));

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    loadedCollections: () => [],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
    updateCollectionSettings: async () => undefined,
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const MARSH_NOTE = templateBodyPath(MARSH_PATH);

/** Obsidian's Markdown view as far as the column drives it: its file, its text and its editor's focus. */
class NoteView extends MarkdownView {
  readonly editor = { focus: vi.fn() };
  constructor(leaf: WorkspaceLeaf, readonly shown: TFile) {
    super(leaf);
    this.file = shown;
    this.containerEl.createDiv({ cls: 'cm-content', attr: { contenteditable: 'true', tabindex: '-1' } });
  }
  getViewData(): string {
    return 'As typed.';
  }
}

/** A leaf `getLeaf(true)` makes: it opens a file in a view and is emptied and detached when done. */
class NoteLeaf {
  view: NoteView | null = null;
  readonly containerEl = document.createElement('div');
  readonly detach = vi.fn();
  readonly openFile = vi.fn(async (file: TFile, _state?: OpenViewState) => {
    this.view = new NoteView(this as unknown as WorkspaceLeaf, file);
  });
  readonly setViewState = vi.fn(async (state: { type: string }) => {
    if (state.type === 'empty') this.view = null;
  });
}

const { setUp, tearDown, views } = editorViews();
let leaves: NoteLeaf[];

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

beforeEach(async () => {
  await setUp();
  chooser.skip = undefined;
  chooser.choose = null;
  leaves = [];
  Object.assign(views.vault.app.workspace, {
    getLeaf: vi.fn(() => {
      const leaf = new NoteLeaf();
      leaves.push(leaf);
      return leaf;
    }),
    getActiveViewOfType: () => null,
  });
});
afterEach(async () => {
  await tearDown();
  vi.restoreAllMocks();
});

const column = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-te-note')!;
const hosted = (): HTMLElement | null => column().querySelector('.atlas-te-note__host .atlas-te-note__view');

describe('the template\'s note in the left column', () => {
  it('is the note beside the template file, in Obsidian\'s own editor, in a leaf out of the workspace', async () => {
    views.vault.writeExternally(MARSH_NOTE, '## Lair\n');
    await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(hosted()).toBeTruthy());
    const [leaf] = leaves;
    expect(leaf!.openFile).toHaveBeenCalledWith(expect.objectContaining({ path: MARSH_NOTE }), { active: false, state: { mode: 'source' } });
    expect(leaf!.detach).toHaveBeenCalledTimes(1);
    expect(leaf!.containerEl.getAttribute('data-atlas-preview')).toBe('true');
    expect(hosted()).toBe(leaf!.view!.containerEl);
    expect(hosted()!.classList.contains('atlas-embedded-leaf-view')).toBe(true);
  });

  it('closes its leaf with the editor, emptied first so no closed tab is left to reopen', async () => {
    views.vault.writeExternally(MARSH_NOTE, '## Lair\n');
    const { view } = await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(hosted()).toBeTruthy());
    const [leaf] = leaves;
    const shown = leaf!.view!.containerEl;
    await views.close(view);
    expect(shown.isConnected).toBe(false);
    await waitFor(() => expect(leaf!.detach).toHaveBeenCalledTimes(2));
    expect(leaf!.setViewState).toHaveBeenCalledWith({ type: 'empty' });
    expect(leaf!.setViewState.mock.invocationCallOrder[0]).toBeLessThan(leaf!.detach.mock.invocationCallOrder[1]!);
  });

  it('follows its template when the template is renamed', async () => {
    const stop = followTemplateBodies(views.vault.app);
    views.vault.writeExternally(MARSH_NOTE, '## Lair\n');
    await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(hosted()).toBeTruthy());
    await act(async () => { await views.vault.app.fileManager.renameFile(new TFile(MARSH_PATH), `${TEMPLATE_FOLDER}/Bog.atlastemplate`); });
    await views.vault.settled();
    await waitFor(() => expect(leaves.at(-1)!.view?.shown.path).toBe(`${TEMPLATE_FOLDER}/Bog.md`));
    expect(hosted()).toBe(leaves.at(-1)!.view!.containerEl);
    stop();
  });

  it('offers to start a note where the template has none: a click makes it and puts the cursor in it', async () => {
    await views.open({ file: MARSH_PATH });
    const start = await screen.findByRole('button', { name: BODY_PLACEHOLDER });
    expect(leaves).toHaveLength(0);
    await act(async () => { fireEvent.click(start); });
    await waitFor(() => expect(hosted()).toBeTruthy());
    expect(views.vault.files.get(MARSH_NOTE)).toBe('');
    expect(leaves[0]!.view!.editor.focus).toHaveBeenCalled();
  });

  it('lets a template never saved be typed in at once: the cursor is in its text, which its save writes into its note', async () => {
    const session = TemplateSession.openUnsaved(views.vault.app, MARSH_CREATURE, 'Bog Hag', null, 'Keep away.');
    await views.open({ draftId: session.getSnapshot().id });
    const text = screen.getByRole<HTMLTextAreaElement>('textbox', { name: BODY_LABEL });
    expect(text.value).toBe('Keep away.');
    expect(document.activeElement).toBe(text);
    expect(screen.queryByRole('button', { name: START_FROM_NOTE })).toBeNull();
    act(() => { fireEvent.change(text, { target: { value: 'Keep away from the bog.' } }); });
    expect(session.getSnapshot().draftBody).toBe('Keep away from the bog.');
    expect(text.value).toBe('Keep away from the bog.');
    const describedBy = saveButton().getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toBe(DRAFT_SAVE_HINT);
    expect(leaves).toHaveLength(0);
    session.release();
  });

  it('lets a built-in be typed in too: its text makes Save offered, and an empty text offers a note to start from', async () => {
    await views.open({ templateId: 'builtin:generic-creature' });
    const text = screen.getByRole<HTMLTextAreaElement>('textbox', { name: BODY_LABEL });
    expect(text.value).toBe('');
    expect(text.placeholder).toBe(BODY_PLACEHOLDER);
    expect(document.activeElement, 'only a template just made takes the cursor').not.toBe(text);
    expect(screen.getByRole('button', { name: START_FROM_NOTE })).toBeTruthy();
    expect(saveOffered()).toBe(false);
    act(() => { fireEvent.change(text, { target: { value: 'Notes.' } }); });
    expect(saveOffered()).toBe(true);
    expect(screen.queryByRole('button', { name: START_FROM_NOTE })).toBeNull();
    expect(leaves).toHaveLength(0);
  });

  it('starts the text from a note chosen in the vault\'s note search', async () => {
    views.vault.writeExternally('Bestiary/Goblin.md', '---\nname: Goblin\n---\nThey run.\n');
    const session = TemplateSession.openUnsaved(views.vault.app, MARSH_CREATURE, 'Bog Hag');
    await views.open({ draftId: session.getSnapshot().id });
    fireEvent.click(screen.getByRole('button', { name: START_FROM_NOTE }));
    expect(chooser.choose).toBeTypeOf('function');
    await act(async () => { chooser.choose!(new TFile('Bestiary/Goblin.md')); });
    await waitFor(() => expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: BODY_LABEL }).value).toBe('They run.\n'));
    session.release();
  });

  it('offers a note to start from beside the offer to start an empty note', async () => {
    await views.open({ file: MARSH_PATH });
    await screen.findByRole('button', { name: BODY_PLACEHOLDER });
    fireEvent.click(screen.getByRole('button', { name: START_FROM_NOTE }));
    expect(chooser.skip).toBe(MARSH_NOTE);
    expect(leaves).toHaveLength(0);
  });
});

describe('Save beside the note', () => {
  it('says it covers the statblock, and the note saves as it is typed', async () => {
    await views.open({ file: MARSH_PATH });
    const describedBy = saveButton().getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toBe(SAVE_HINT);
  });

  it('is not what Mod+S does in the note: every key typed there is the note\'s', async () => {
    views.vault.writeExternally(MARSH_NOTE, '## Lair\n');
    const { view } = await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(hosted()).toBeTruthy());
    views.edit(MARSH_ID, described('Edited'));
    const text = hosted()!.querySelector<HTMLElement>('.cm-content')!;
    text.focus();
    const keys = { key: 's', code: 'KeyS', ctrlKey: !Platform.isMacOS, metaKey: Platform.isMacOS };
    fireEvent.keyDown(text, keys);
    const scoped = (view.scope as unknown as { keys: Array<{ modifiers: string[]; key: string; func: (event: KeyboardEvent) => unknown }> }).keys
      .find(({ modifiers, key }) => modifiers.join('+') === 'Mod' && key === 's')!;
    act(() => { scoped.func(new KeyboardEvent('keydown', keys)); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
