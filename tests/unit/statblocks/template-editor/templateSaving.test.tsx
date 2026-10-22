// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import { TEMPLATE_EDITOR_VIEW_TYPE } from '../../../../src/app/statblocks/editor/templateEditorState';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import { GENERIC_CREATURE } from '../../../../src/app/statblocks/presets/generic';
import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { described } from '../library/sessionVault';
import { MARSH_ID, MARSH_PATH, TEMPLATE_FOLDER, marshText } from '../library/templateTexts';
import { editorViews, nameInput, saveButton, saveOffered, typeName } from './editorViewKit';

const updateCollectionSettings = vi.fn(async () => undefined);
vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    loadedCollections: () => [],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
    updateCollectionSettings: (...args: unknown[]) => updateCollectionSettings(...(args as [])),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, 40, 16);
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

const { setUp, tearDown, views } = editorViews();
beforeEach(async () => {
  await setUp();
  updateCollectionSettings.mockClear();
});
afterEach(async () => {
  await tearDown();
  vi.restoreAllMocks();
});

/** The note writer, answering every patch as applied. */
function noteWrites(): ReturnType<typeof vi.fn<(path: string, patches: readonly NotePatch[]) => Promise<unknown>>> {
  const write = vi.fn(async (_path: string, patches: readonly NotePatch[]) => ({ applied: patches, conflicts: [], backend: 'vault', problem: null }));
  vi.spyOn(NoteFieldWriter, 'forApp').mockReturnValue({ write } as unknown as NoteFieldWriter);
  return write;
}

describe('Save in the template editor', () => {
  it('writes nothing while editing, offers Save only for changes, and Update writes the template once', async () => {
    await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(saveButton()).toBeTruthy());
    expect(saveOffered()).toBe(false);
    views.edit(MARSH_ID, described('Edited'));
    expect(views.writes()).toBe(0);
    expect(saveOffered()).toBe(true);

    fireEvent.click(saveButton());
    expect(screen.getByRole('dialog', { name: 'Save Marsh creature' })).toBeTruthy();
    expect(nameInput().value).toBe('Marsh creature');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(views.writes()).toBe(1);
    expect(views.read(MARSH_PATH)).toMatchObject({ id: MARSH_ID, description: 'Edited' });
    expect(saveOffered()).toBe(false);
  });

  it('opens Save with Mod+S while there is something to save', async () => {
    const { view } = await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(saveButton()).toBeTruthy());
    const scoped = (view.scope as unknown as { keys: Array<{ modifiers: string[]; key: string; func: (event: KeyboardEvent) => unknown }> }).keys
      .find(({ modifiers, key }) => modifiers.join('+') === 'Mod' && key === 's')!;
    const press = (): unknown => scoped.func(new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: !Platform.isMacOS, metaKey: Platform.isMacOS }));
    act(() => { press(); });
    expect(screen.queryByRole('dialog')).toBeNull();
    views.edit(MARSH_ID, described('Edited'));
    act(() => { press(); });
    expect(screen.getByRole('dialog', { name: 'Save Marsh creature' })).toBeTruthy();
  });

  it('saves another name as a new template, leaves the original as it was and edits the new one', async () => {
    const { leaf } = await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(saveButton()).toBeTruthy());
    views.edit(MARSH_ID, described('Variant'));
    fireEvent.click(saveButton());
    typeName('Fen creature');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save as new' })); });
    const path = `${TEMPLATE_FOLDER}/Fen creature.atlastemplate`;
    await waitFor(() => expect(views.vault.files.has(path)).toBe(true));
    const made = views.read(path);
    expect(made).toMatchObject({ description: 'Variant', derivedFrom: { templateId: MARSH_ID } });
    expect(made.id).not.toBe(MARSH_ID);
    expect(views.vault.files.get(MARSH_PATH)).toBe(marshText());
    expect(leaf.getViewState()).toMatchObject({ type: TEMPLATE_EDITOR_VIEW_TYPE, state: { file: path } });
    const original = TemplateSession.open(views.vault.app, MARSH_ID)!;
    expect(original.getSnapshot().template.description).toBe(MARSH_CREATURE.description);
    original.release();
  });

  it('refuses the name of another template with a sentence', async () => {
    views.vault.writeExternally(`${TEMPLATE_FOLDER}/Swamp.atlastemplate`, marshText({ id: 'swamp-abc123' }));
    await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(saveButton()).toBeTruthy());
    views.edit(MARSH_ID, described('Edited'));
    fireEvent.click(saveButton());
    typeName('swamp');
    expect(screen.getByText('There is already a template named “swamp”.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save as new' }) as HTMLButtonElement).disabled).toBe(true);
    typeName('Bog/creature');
    expect((screen.getByRole('button', { name: 'Save as new' }) as HTMLButtonElement).disabled).toBe(true);
    expect(views.writes()).toBe(0);
  });

  it('saves a built-in only as a new template under a name of its own', async () => {
    await views.open({ templateId: 'builtin:generic-creature' });
    await waitFor(() => expect(saveButton()).toBeTruthy());
    views.edit('builtin:generic-creature', described('Mine'));
    fireEvent.click(saveButton());
    expect(nameInput().value).toBe('Creature');
    expect(screen.getByText('Creature is built in and stays as it is. Your changes are saved as a new template.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Save as new' }) as HTMLButtonElement).disabled).toBe(true);
    typeName('My creature');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save as new' })); });
    const path = `${TEMPLATE_FOLDER}/My creature.atlastemplate`;
    await waitFor(() => expect(views.vault.files.has(path)).toBe(true));
    expect(views.read(path)).toMatchObject({ description: 'Mine', derivedFrom: { templateId: 'builtin:generic-creature', revision: GENERIC_CREATURE.revision } });
  });

  it('gives the new template to the note on the built-in it was opened from', async () => {
    const write = noteWrites();
    await views.open({ templateId: 'builtin:generic-creature', fromNote: 'Bestiary/Bog.md' });
    await waitFor(() => expect(saveButton()).toBeTruthy());
    views.edit('builtin:generic-creature', described('Mine'));
    fireEvent.click(saveButton());
    typeName('Bog creature');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save as new' })); });
    const path = `${TEMPLATE_FOLDER}/Bog creature.atlastemplate`;
    await waitFor(() => expect(views.vault.files.has(path)).toBe(true));
    expect(write).toHaveBeenCalledWith('Bestiary/Bog.md', [{ op: 'set', path: ['atlas-template'], base: 'builtin:generic-creature', next: views.read(path).id }]);
  });

  it('leaves the notes alone when a template of the vault is saved as new', async () => {
    const write = noteWrites();
    await views.open({ file: MARSH_PATH, fromNote: 'Bestiary/Fen.md' });
    await waitFor(() => expect(saveButton()).toBeTruthy());
    views.edit(MARSH_ID, described('Variant'));
    fireEvent.click(saveButton());
    typeName('Fen creature');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save as new' })); });
    await waitFor(() => expect(views.vault.files.has(`${TEMPLATE_FOLDER}/Fen creature.atlastemplate`)).toBe(true));
    expect(write).not.toHaveBeenCalled();
  });

  it('takes valid JSON into the draft as one undo step, and writes it only on Save', async () => {
    await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(saveButton()).toBeTruthy());
    fireEvent.keyDown(screen.getByRole('button', { name: 'More template actions' }), { key: 'Enter' });
    await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit as JSON' })); });
    const field = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Template as JSON' });
    const typed = JSON.stringify({ ...(JSON.parse(field.value) as Record<string, unknown>), description: 'From JSON' }, null, 2);
    act(() => { fireEvent.change(field, { target: { value: typed } }); });
    act(() => { fireEvent.blur(field); });
    expect(views.writes()).toBe(0);
    expect(saveOffered()).toBe(true);
    const handle = TemplateSession.open(views.vault.app, MARSH_ID)!;
    expect(handle.getSnapshot()).toMatchObject({ dirty: true, canUndo: true });
    expect(handle.getSnapshot().template.description).toBe('From JSON');
    act(() => handle.undo());
    expect(handle.getSnapshot()).toMatchObject({ dirty: false, canUndo: false });
    handle.release();
  });

  it('opens a template never saved, whose first Save names it and gives it its role', async () => {
    const draft = TemplateSession.openUnsaved(views.vault.app, { ...MARSH_CREATURE, layout: { maxColumns: 1, blocks: [] } }, 'New template', { collectionId: 'campaign', roleId: 'npc' });
    const { view, leaf } = await views.open({ draftId: draft.getSnapshot().id, collectionId: 'campaign' });
    draft.release();
    await waitFor(() => expect(saveOffered()).toBe(true));
    expect(view.getDisplayText()).toBe('New template');
    expect(views.writes()).toBe(0);
    fireEvent.click(saveButton());
    const dialog = screen.getByRole('dialog', { name: 'Save template' });
    typeName('Marsh hag');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); });
    const path = `${TEMPLATE_FOLDER}/Marsh hag.atlastemplate`;
    await waitFor(() => expect(leaf.getViewState()).toMatchObject({ state: { file: path } }));
    expect(updateCollectionSettings).toHaveBeenCalledWith('campaign', expect.objectContaining({
      statblockRoles: expect.arrayContaining([expect.objectContaining({ id: 'npc', templateId: views.read(path).id })]),
    }));
    // Saved, the template never saved leaves nothing behind to ask about.
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 10); }); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says a template never saved is gone once nothing holds it (Obsidian restarted)', async () => {
    await views.open({ draftId: 'lost-template-abc123' });
    expect(screen.getByText('This template was never saved, and it closed.')).toBeTruthy();
  });
});
