// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { StatblockRole, StatblockRoleFolders } from '../../../../src/app/statblocks/model/roleTypes';
import { StatblocksTab, withRoleFolder } from '../../../../src/app/statblocks/settings/StatblocksTab';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { MARSH_ID, MARSH_PATH, marshText } from '../library/templateTexts';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
const hag: StatblockRole = { id: 'hag', name: 'Hag', templateId: MARSH_ID };

let latest: { own: readonly StatblockRole[] | undefined; folders: StatblockRoleFolders } = { own: undefined, folders: {} };
const apps: App[] = [];

afterEach(() => {
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

interface HarnessProps {
  own?: readonly StatblockRole[];
  folders?: StatblockRoleFolders;
  presetId?: string;
  canSave?: boolean;
  onEdit?: (templateId: string) => void;
  /** Vault path → text; the Marsh creature template by default. */
  files?: Record<string, string>;
}

function Harness({ own: initialOwn, folders: initialFolders = {}, presetId, canSave = true, onEdit, app }: HarnessProps & { app: App }): React.JSX.Element {
  const [own, setOwn] = useState(initialOwn);
  const [folders, setFolders] = useState(initialFolders);
  latest = { own, folders };
  return (
    <StatblocksTab
      app={app}
      ownRoles={own}
      onOwnRolesChange={setOwn}
      folders={folders}
      onFoldersChange={setFolders}
      systemPresetId={presetId}
      presets={BUILT_IN_SYSTEM_PRESETS}
      canSave={canSave}
      onEditTemplate={onEdit}
    />
  );
}

/** Renders the tab once the vault's templates are read. */
async function open(props: HarnessProps = {}): Promise<void> {
  const { app } = createInMemoryApp({ files: props.files ?? { [MARSH_PATH]: marshText() }, folders: ['Bestiary', 'Bestiary/Hags', 'Notes'] });
  apps.push(app);
  render(<Harness {...props} app={app} />);
  await waitFor(() => expect(TemplateLibrary.forApp(app).isLoading()).toBe(false));
}

const nameFields = (): string[] => screen.getAllByRole('textbox', { name: 'Role name' }).map((input) => (input as HTMLInputElement).value);
const templateOf = (role: string): string => screen.getByRole('combobox', { name: `Template of ${role}` }).textContent ?? '';
const rename = (from: string, to: string): void => {
  const input = screen.getAllByRole('textbox', { name: 'Role name' }).find((field) => (field as HTMLInputElement).value === from)!;
  fireEvent.change(input, { target: { value: to } });
};

describe('the Statblocks tab', () => {
  it('shows the system\'s roles with where they come from, and nothing to revert', async () => {
    await open({ presetId: dnd5e.id });
    expect(nameFields()).toEqual(['Monster', 'NPC']);
    expect(screen.getByText('From the D&D 5e system')).toBeTruthy();
    expect(templateOf('Monster')).toBe('5E (2024 rules)');
    expect(screen.queryByRole('button', { name: /Use the/ })).toBeNull();
  });

  it('shows Atlas\' default pair for a collection without a game system', async () => {
    await open();
    expect(nameFields()).toEqual(['Creature', 'NPC']);
    expect(screen.getByText('Atlas\' default roles')).toBeTruthy();
    expect(templateOf('NPC')).toBe('NPC');
  });

  it('shows the collection\'s own roles without the system\'s label, and goes back to the system\'s', async () => {
    await open({ presetId: dnd5e.id, own: [...dnd5e.rules.statblockRoles!, hag] });
    expect(nameFields()).toEqual(['Monster', 'NPC', 'Hag']);
    expect(screen.queryByText('From the D&D 5e system')).toBeNull();
    expect(templateOf('Hag')).toBe('Marsh creature');
    fireEvent.click(screen.getByRole('button', { name: 'Use the system\'s roles' }));
    expect(latest.own).toBeUndefined();
    expect(nameFields()).toEqual(['Monster', 'NPC']);
  });

  it('offers the default roles back where the system names none', async () => {
    await open({ own: [hag] });
    fireEvent.click(screen.getByRole('button', { name: 'Use the default roles' }));
    expect(nameFields()).toEqual(['Creature', 'NPC']);
  });

  it('stores the roles as the collection\'s own once a name is edited, and none once it is the system\'s again', async () => {
    await open({ presetId: dnd5e.id });
    rename('Monster', 'Beast');
    expect(latest.own?.map((role) => [role.id, role.name])).toEqual([['monster', 'Beast'], ['npc', 'NPC']]);
    expect(screen.getByRole('button', { name: 'Use the system\'s roles' })).toBeTruthy();
    rename('Beast', 'Monster');
    expect(latest.own).toBeUndefined();
  });

  it('stores the roles as its own once a template is chosen', async () => {
    await open({ presetId: dnd5e.id });
    fireEvent.click(screen.getByRole('combobox', { name: 'Template of NPC' }));
    fireEvent.click(screen.getByRole('option', { name: /Marsh creature/ }));
    expect(latest.own?.map((role) => role.templateId)).toEqual(['builtin:5e-2024-monster', MARSH_ID]);
  });

  it('lists the vault\'s templates, then the built-ins, the system\'s first', async () => {
    await open({ presetId: dnd5e.id });
    fireEvent.click(screen.getByRole('combobox', { name: 'Template of Monster' }));
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent);
    expect(options.slice(0, 3)).toEqual(['Marsh creature', '5E (2024 rules)Built-in', 'CreatureBuilt-in']);
  });

  it('writes a folder for an inherited role and leaves the roles inherited', async () => {
    await open({ presetId: dnd5e.id });
    const field = screen.getByRole('combobox', { name: 'Folder for new statblocks of Monster' });
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'hags' } });
    fireEvent.click(screen.getByRole('option', { name: 'Bestiary/Hags' }));
    expect(latest).toEqual({ own: undefined, folders: { monster: 'Bestiary/Hags' } });
    fireEvent.change(field, { target: { value: '' } });
    expect(latest.folders).toEqual({});
  });

  it('warns where a role\'s template is missing and says what new statblocks start from', async () => {
    await open({ own: [{ ...hag, templateId: 'gone-abc123' }] });
    expect(templateOf('Hag')).toBe('Missing template');
    expect(screen.getByRole('note').textContent).toBe('Using Creature instead');
  });

  it('waits for the vault\'s templates before calling one missing', async () => {
    const { app } = createInMemoryApp({ files: { [MARSH_PATH]: marshText() } });
    apps.push(app);
    let ready: () => void = () => undefined;
    app.workspace.onLayoutReady = vi.fn((callback: () => void) => { ready = callback; });
    render(<Harness app={app} own={[hag]} />);
    expect(templateOf('Hag')).toBe('Reading templates…');
    expect(screen.queryByRole('note')).toBeNull();
    act(() => ready());
    await waitFor(() => expect(templateOf('Hag')).toBe('Marsh creature'));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('adds a role without a name, which the dialog cannot save until it has one', async () => {
    await open({ presetId: dnd5e.id });
    fireEvent.click(screen.getByRole('button', { name: 'Add role' }));
    expect(nameFields()).toEqual(['Monster', 'NPC', '']);
    expect(latest.own?.[2]).toMatchObject({ name: '', templateId: 'builtin:generic-creature' });
    expect(document.activeElement).toBe(screen.getAllByRole('textbox', { name: 'Role name' })[2]);
    expect(screen.getByText('Enter a name')).toBeTruthy();
    rename('', 'npc');
    expect(screen.getByText('Another role has this name')).toBeTruthy();
  });

  it('keeps the only role: its remove button does nothing and says why', async () => {
    await open({ own: [hag] });
    const remove = screen.getByRole('button', { name: 'A collection needs at least one role' });
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(remove);
    expect(latest.own).toEqual([hag]);
  });

  it('removes a role, and the list that is left is the system\'s again', async () => {
    await open({ presetId: dnd5e.id, own: [...dnd5e.rules.statblockRoles!, hag] });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove role' })[2]!);
    expect(latest.own).toBeUndefined();
  });

  it('has no Edit until the dialog can open the template editor', async () => {
    await open({ presetId: dnd5e.id });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('opens a role\'s template with Edit, the generic one where its own is missing', async () => {
    const edit = vi.fn();
    await open({ own: [hag, { id: 'lost', name: 'Lost', templateId: 'gone-abc123' }], onEdit: edit });
    const [first, second] = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(first!);
    fireEvent.click(second!);
    expect(edit.mock.calls).toEqual([[MARSH_ID], ['builtin:generic-creature']]);
  });

  it('shows Edit as unavailable, with the reason, while the settings cannot be saved', async () => {
    const edit = vi.fn();
    await open({ own: [hag, { ...hag, id: 'hag-2' }], canSave: false, onEdit: edit });
    const button = screen.getAllByRole('button', { name: 'Edit' })[0]!;
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toBe('Every role needs a name of its own first');
    fireEvent.click(button);
    expect(edit).not.toHaveBeenCalled();
  });
});

describe('withRoleFolder', () => {
  it('sets a role\'s folder and removes it once cleared, leaving the others', () => {
    expect(withRoleFolder({ npc: 'People' }, 'monster', 'Beasts')).toEqual({ npc: 'People', monster: 'Beasts' });
    expect(withRoleFolder({ npc: 'People', monster: 'Beasts' }, 'monster', '')).toEqual({ npc: 'People' });
  });
});
