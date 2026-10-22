// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATE_EDITOR_VIEW_TYPE } from '../../../../src/app/statblocks/editor/templateEditorState';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { TemplateSession } from '../../../../src/app/statblocks/library/TemplateSession';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { described } from '../library/sessionVault';
import { MARSH_ID, MARSH_PATH } from '../library/templateTexts';
import { editorViews, nameInput, saveButton, saveOffered } from './editorViewKit';

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

describe('closing with unsaved changes', () => {
  /** Closes the view, as a tab closing does, and waits for the question. */
  async function closeEdited(): Promise<void> {
    const { view } = await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(saveButton()).toBeTruthy());
    views.edit(MARSH_ID, described('Unsaved'));
    await views.close(view);
    await screen.findByRole('dialog', { name: 'Save changes to Marsh creature?' });
  }

  it('asks nothing when nothing changed', async () => {
    const { view } = await views.open({ file: MARSH_PATH });
    await views.close(view);
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 10); }); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('drops the changes on Don\'t save, writing nothing', async () => {
    await closeEdited();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Don\'t save' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(views.writes()).toBe(0);
    const again = TemplateSession.open(views.vault.app, MARSH_ID)!;
    expect(again.getSnapshot()).toMatchObject({ dirty: false });
    again.release();
  });

  it('saves on Save, asking for the name as the editor does', async () => {
    await closeEdited();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    expect(nameInput().value).toBe('Marsh creature');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(views.read(MARSH_PATH)).toMatchObject({ description: 'Unsaved' });
  });

  it('opens the editor again with the changes on Keep editing', async () => {
    await closeEdited();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep editing' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [reopened] = views.workspace.leaves;
    expect(reopened?.getViewState()).toMatchObject({ type: TEMPLATE_EDITOR_VIEW_TYPE, state: { file: MARSH_PATH } });
    expect(views.writes()).toBe(0);
  });
});

describe('another view of the template', () => {
  it('keeps the changes without asking when a second view of it closes', async () => {
    const first = await views.open({ file: MARSH_PATH });
    const second = await views.open({ file: MARSH_PATH });
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(2));
    views.edit(MARSH_ID, described('Shared'));
    await views.close(second.view);
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 10); }); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(saveOffered()).toBe(true);
    expect(first.view.getDisplayText()).toBe('Marsh creature');
    expect(TemplateLibrary.forApp(views.vault.app).get(MARSH_ID)?.template.description).toBe(MARSH_CREATURE.description);
  });
});
