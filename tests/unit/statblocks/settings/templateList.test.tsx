// @vitest-environment jsdom
import React, { useState } from 'react';
import { MotionGlobalConfig } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import { AssetService } from '../../../../src/app/services/AssetService';
import { openTemplateEditor } from '../../../../src/app/statblocks/editor/openTemplateEditor';
import { NoteFieldWriter } from '../../../../src/app/statblocks/notes/NoteFieldWriter';
import type { StatblockRole, StatblockRoleFolders } from '../../../../src/app/statblocks/model/roleTypes';
import { StatblocksTab } from '../../../../src/app/statblocks/settings/StatblocksTab';
import { closeSessionVault, sessionVault, type SessionVault } from '../library/sessionVault';
import { MARSH_ID, MARSH_PATH, TEMPLATE_FOLDER, marshText } from '../library/templateTexts';

vi.mock('../../../../src/app/statblocks/editor/openTemplateEditor', () => ({ openTemplateEditor: vi.fn(async () => null) }));

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
const FIVE_E = 'builtin:5e-2024-monster';
const GENERIC = 'builtin:generic-creature';
const SWAMP_ID = 'swamp-thing-a1b2c3';
const OWN: StatblockRole[] = [{ id: 'hag', name: 'Hag', templateId: MARSH_ID }, { id: 'monster', name: 'Monster', templateId: FIVE_E }];
const note = (template: string): string => `---\nstatblock: true\natlas-template: ${template}\nname: Bog\n---\nBody.\n`;

let vault: SessionVault;
let latest: readonly StatblockRole[] | undefined;
let edited: ReturnType<typeof vi.fn<(templateId: string) => void>>;

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });

function addNote(path: string, template: string): void {
  vault.files.set(path, note(template));
  vault.frontmatter[path] = { statblock: true, 'atlas-template': template, name: 'Bog' };
}

beforeEach(async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vault = sessionVault({ [MARSH_PATH]: marshText(), [`${TEMPLATE_FOLDER}/Swamp thing.atlastemplate`]: marshText({ id: SWAMP_ID }) });
  addNote('Bestiary/Bog.md', MARSH_ID);
  addNote('Bestiary/Fen.md', MARSH_ID);
  addNote('Bestiary/Goblin.md', FIVE_E);
  vi.spyOn(AssetService, 'getInstance').mockReturnValue({
    loadedCollections: () => [],
    updateCollectionSettings: vi.fn(async () => undefined),
  } as unknown as AssetService);
  edited = vi.fn();
  vi.mocked(openTemplateEditor).mockClear();
  await vault.settled();
});

afterEach(async () => {
  cleanup();
  NoteFieldWriter.release(vault.app);
  await closeSessionVault(vault);
  vi.restoreAllMocks();
});

function Harness({ own }: { own: readonly StatblockRole[] | undefined }): React.JSX.Element {
  const [roles, setRoles] = useState(own);
  const [folders, setFolders] = useState<StatblockRoleFolders>({});
  latest = roles;
  return (
    <StatblocksTab
      app={vault.app}
      ownRoles={roles}
      onOwnRolesChange={setRoles}
      folders={folders}
      onFoldersChange={setFolders}
      systemPresetId={dnd5e.id}
      presets={BUILT_IN_SYSTEM_PRESETS}
      canSave
      onEditTemplate={edited}
    />
  );
}

/** Opens the tab with the collection's own roles; null for its system's. */
function open(own: readonly StatblockRole[] | null = OWN): void {
  render(<Harness own={own ?? undefined} />);
}

const rows = (): string[][] => within(screen.getByRole('list', { name: 'Templates' })).getAllByRole('listitem')
  .map((row) => [...row.querySelectorAll('[class^="atlas-sb-templates__"]')].map((part) => part.textContent ?? ''));
const menu = async (name: string, item: string): Promise<void> => {
  fireEvent.keyDown(screen.getByRole('button', { name: `Actions for ${name}` }), { key: 'Enter' });
  await act(async () => { fireEvent.click(await screen.findByRole('menuitem', { name: item })); });
};

describe('the Statblocks tab\'s templates', () => {
  it('lists the roles\' templates first, then the vault\'s, each with how many statblocks use it', () => {
    open();
    expect(rows()).toEqual([
      ['Marsh creature', 'Hag', '2 statblocks'],
      ['5E (2024 rules)', 'Built-in · Monster', '1 statblock'],
      ['Swamp thing', 'Not used'],
    ]);
    expect(screen.queryByText('No statblock templates yet')).toBeNull();
  });

  it('says when the vault holds no templates of its own', async () => {
    cleanup();
    await closeSessionVault(vault);
    vault = sessionVault({});
    await vault.settled();
    open(null);
    expect(rows()).toEqual([['5E (2024 rules)', 'Built-in · Monster, NPC', 'Not used']]);
    expect(screen.getByText('No statblock templates yet')).toBeTruthy();
  });

  it('opens a template through the dialog\'s Edit, and offers no Delete for a built-in', async () => {
    open();
    await menu('Swamp thing', 'Open');
    expect(edited).toHaveBeenCalledWith(SWAMP_ID);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for 5E (2024 rules)' }), { key: 'Enter' });
    expect((await screen.findByRole('menuitem', { name: 'Delete…' })).getAttribute('data-disabled')).not.toBeNull();
  });

  it('duplicates a template into the library', async () => {
    open();
    await menu('Swamp thing', 'Duplicate');
    await waitFor(() => expect(vault.files.has(`${TEMPLATE_FOLDER}/Swamp thing copy.atlastemplate`)).toBe(true));
    await waitFor(() => expect(rows().map(([name]) => name)).toContain('Swamp thing copy'));
  });

  it('gives the gallery\'s new template to a role in the dialog\'s draft, without opening the editor', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'New template' }));
    const gallery = screen.getByRole('dialog', { name: 'New template' });
    expect(within(gallery).getByRole('combobox', { name: 'Starts new statblocks for' }).textContent).toBe('Monster');
    await act(async () => { fireEvent.click(within(gallery).getByRole('button', { name: 'Use template' })); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New template' })).toBeNull());
    const monster = latest?.find((role) => role.id === 'monster');
    expect(monster?.templateId).not.toBe(FIVE_E);
    expect(vault.files.get(`${TEMPLATE_FOLDER}/5E (2024 rules).atlastemplate`)).toContain(monster?.templateId);
    expect(openTemplateEditor).not.toHaveBeenCalled();
  });

  it('deletes a template in use with a replacement: its statblocks switch in one batch, and so do the draft\'s roles', async () => {
    open();
    await menu('Marsh creature', 'Delete…');
    const dialog = screen.getByRole('dialog', { name: 'Delete Marsh creature?' });
    expect(dialog.textContent).toContain('2 statblocks use it.');
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Switch them to' }));
    fireEvent.click(within(dialog).getByRole('option', { name: /^Creature/ }));
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' })); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete Marsh creature?' })).toBeNull());
    expect(vault.files.get('Bestiary/Bog.md')).toBe(note(GENERIC));
    expect(vault.files.get('Bestiary/Fen.md')).toBe(note(GENERIC));
    expect(vault.files.has(MARSH_PATH)).toBe(false);
    expect(latest?.find((role) => role.id === 'hag')?.templateId).toBe(GENERIC);
  });

  it('deletes a template and leaves its statblocks and roles as they are', async () => {
    open();
    await menu('Marsh creature', 'Delete…');
    const dialog = screen.getByRole('dialog', { name: 'Delete Marsh creature?' });
    expect(within(dialog).getByRole('combobox', { name: 'Switch them to' }).textContent).toBe('Leave them as they are');
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' })); });
    await waitFor(() => expect(vault.files.has(MARSH_PATH)).toBe(false));
    expect(vault.files.get('Bestiary/Bog.md')).toBe(note(MARSH_ID));
    expect(latest?.find((role) => role.id === 'hag')?.templateId).toBe(MARSH_ID);
  });

  it('closes the delete dialog on Escape and marks the key as used', async () => {
    open();
    await menu('Swamp thing', 'Delete…');
    const dialog = screen.getByRole('dialog', { name: 'Delete Swamp thing?' });
    expect(document.activeElement).toBe(dialog);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => { dialog.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete Swamp thing?' })).toBeNull());
    expect(vault.files.has(`${TEMPLATE_FOLDER}/Swamp thing.atlastemplate`)).toBe(true);
  });
});
