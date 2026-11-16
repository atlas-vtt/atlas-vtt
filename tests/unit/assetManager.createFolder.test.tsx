// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateFolderModal } from '../../src/app/packages/components/asset-manager/components/CreateFolderModal';
import { folderNameProblem } from '../../src/app/packages/components/asset-manager/utils/folderName';
import { t } from '../../src/app/i18n';

afterEach(cleanup);

const taken = (name: string): boolean => name.toLowerCase() === 'empty folder';

describe('folderNameProblem', () => {
  it('has nothing to say about an empty name or a free one', () => {
    expect(folderNameProblem('   ', taken)).toBeNull();
    expect(folderNameProblem('Villains', taken)).toBeNull();
  });

  it('names a taken name, a character a folder cannot hold and a leading dot', () => {
    expect(folderNameProblem(' Empty Folder ', taken)).toBe(t('am.folder.exists', { name: 'Empty Folder' }));
    expect(folderNameProblem('Goblins/Elite', taken)).toBe(t('names.invalidFolder'));
    expect(folderNameProblem('.hidden', taken)).toBe(t('names.folderDot'));
  });
});

function Dialog({ onConfirm }: { onConfirm: () => void }): React.JSX.Element {
  const [name, setName] = useState('');
  return (
    <CreateFolderModal
      selectedFolderId={null}
      activeTab="tokens"
      targetFolderName={name}
      setTargetFolderName={setName}
      onClose={() => {}}
      onConfirm={onConfirm}
      isNameTaken={taken}
    />
  );
}

describe('New folder dialog', () => {
  it('says beside the field that a name is taken, keeps the name and refuses to create', () => {
    const onConfirm = vi.fn();
    render(<Dialog onConfirm={onConfirm} />);
    // Named by its visible label, never by its placeholder or a title.
    const field = screen.getByLabelText(t('am.folder.name'));
    expect(field.hasAttribute('title')).toBe(false);

    fireEvent.change(field, { target: { value: 'Empty folder' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(screen.getByRole('alert').textContent).toBe(t('am.folder.exists', { name: 'Empty folder' }));
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    expect((screen.getByRole('button', { name: t('am.folder.create') }) as HTMLButtonElement).disabled).toBe(true);
    expect((field as HTMLInputElement).value).toBe('Empty folder');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('creates once the name is free', () => {
    const onConfirm = vi.fn();
    render(<Dialog onConfirm={onConfirm} />);
    const field = screen.getByPlaceholderText(t('am.folder.namePlaceholder'));

    fireEvent.change(field, { target: { value: 'Empty folder 2' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
