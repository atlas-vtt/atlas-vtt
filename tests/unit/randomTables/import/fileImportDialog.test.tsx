// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { PasteTableDialog } from '../../../../src/app/react/components/randomTables/PasteTableDialog';
import type { ImportedTableNote, ImportSaveJournal } from '../../../../src/app/randomTables/import/saveImportedTables';

const markdown = '## Weather\n| d4 | Result |\n| --- | --- |\n| 1-4 | Rain |\n\n## Treasure\n| d6 | Result |\n| --- | --- |\n| 1-6 | Coin |';
const file = (text = markdown): Pick<File, 'name' | 'size' | 'arrayBuffer'> => ({
  name: 'Tables.md', size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer,
});
const choose = (input: Pick<File, 'name' | 'size' | 'arrayBuffer'>): void => {
  fireEvent.change(screen.getByLabelText('Choose a table file'), { target: { files: [input] } });
};

beforeEach(() => { MotionGlobalConfig.skipAnimations = true; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); MotionGlobalConfig.skipAnimations = false; });

describe('file import review', () => {
  it('keeps the dialog in its opening document when focus moves to another window', () => {
    const view = render(<PasteTableDialog folder="tables" onSave={() => undefined} onImport={async () => undefined} onClose={() => undefined} />);
    const other = document.implementation.createHTMLDocument('Other window');
    vi.stubGlobal('activeDocument', other);
    view.rerender(<PasteTableDialog folder="tables" onSave={() => undefined} onImport={async () => undefined} onClose={() => undefined} />);
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(other.querySelector('[role="dialog"]')).toBeNull();
  });

  it('lets the user keep the first spreadsheet record when it is data rather than a header', async () => {
    render(<PasteTableDialog folder="tables" onSave={() => undefined} onImport={async () => undefined} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Import file' }));
    choose({ ...file('Rope,1 gp\nTorch,1 cp'), name: 'Gear.csv' });
    const checkbox = await screen.findByRole('checkbox', { name: 'First row contains column headers' });
    fireEvent.click(checkbox);
    expect(screen.getByText('Rope')).toBeTruthy();
    expect(screen.getByText('Torch')).toBeTruthy();
    expect(screen.getByText('2 rows, each the same chance')).toBeTruthy();
  });

  it('imports only explicitly checked tables and previews the selected candidate', async () => {
    const save = vi.fn<(notes: readonly ImportedTableNote[], journal: ImportSaveJournal) => Promise<void>>(async () => undefined);
    const close = vi.fn();
    render(<PasteTableDialog folder="tables" onSave={() => undefined} onImport={save} onClose={close} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Import file' }));
    choose(file());
    const check = await screen.findByRole('checkbox', { name: 'Import Weather' });
    expect((check as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Preview Treasure' }));
    expect(screen.getByText('Coin')).toBeTruthy();
    fireEvent.click(check);
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 table' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0]?.[0]).toEqual([expect.objectContaining({ name: 'Weather', id: 0 })]);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });

  it('requires entering a missing title before checking an unnamed table', async () => {
    render(<PasteTableDialog folder="tables" onSave={() => undefined} onImport={async () => undefined} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Import file' }));
    choose(file('| d4 | Result |\n| --- | --- |\n| 1-4 | Rain |'));
    const check = await screen.findByRole('checkbox', { name: 'Import Table 1' }) as HTMLInputElement;
    expect(check.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Rainy weather' } });
    expect(screen.getByRole('checkbox', { name: 'Import Rainy weather' }).hasAttribute('disabled')).toBe(false);
  });

  it('keeps failed saves reviewable and prevents duplicate saves or dismissal while saving', async () => {
    let rejectSave: (error: Error) => void = () => undefined;
    const save = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    const close = vi.fn();
    render(<PasteTableDialog folder="tables" onSave={() => undefined} onImport={save} onClose={close} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Import file' }));
    choose(file());
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Import Weather' }));
    const button = screen.getByRole('button', { name: 'Import 1 table' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(save).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    await act(async () => rejectSave(new Error('Disk full')));
    expect(screen.getByRole('alert').textContent).toContain('Could not save');
    expect(screen.getByRole('checkbox', { name: 'Import Weather' })).toBeTruthy();
  });

  it('ignores an older file completing after a newer selection', async () => {
    let resolveOld: (value: ArrayBuffer) => void = () => undefined;
    const old = { name: 'Old.md', size: 100, arrayBuffer: () => new Promise<ArrayBuffer>((resolve) => { resolveOld = resolve; }) };
    render(<PasteTableDialog folder="tables" onSave={() => undefined} onImport={async () => undefined} onClose={() => undefined} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Import file' }));
    choose(old);
    choose(file());
    await screen.findByRole('checkbox', { name: 'Import Treasure' });
    await act(async () => resolveOld(new TextEncoder().encode('## Old\n| d4 | Result |\n| --- | --- |\n| 1-4 | Gone |').buffer));
    expect(screen.queryByRole('checkbox', { name: 'Import Old' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Import Weather' })).toBeTruthy();
  });
});
