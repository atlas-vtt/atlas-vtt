import { describe, expect, it, vi } from 'vitest';
import { TrashNotTakenError } from '../../../src/app/soundLibrary/soundLocation';
import { VaultLocation } from '../../../src/app/soundLibrary/vaultLocation';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

function withTrashOption(option: unknown, configurable = true): VaultLocation {
  const { app } = createInMemoryApp({ folders: ['Audio'] });
  if (configurable) Object.assign(app.vault, { getConfig: (key: string) => (key === 'trashOption' ? option : undefined) });
  return new VaultLocation(app, 'Audio');
}

describe('a vault folder\'s trash', () => {
  it('is there only where the vault sends deleted files to a trash', () => {
    expect(withTrashOption('system').canTrash()).toBe(true);
    expect(withTrashOption('local').canTrash()).toBe(true);
  });

  it('is none where the vault deletes for good, or says nothing Atlas knows', () => {
    expect(withTrashOption('none').canTrash()).toBe(false);
    expect(withTrashOption(undefined).canTrash()).toBe(false);
    expect(withTrashOption('later').canTrash()).toBe(false);
    expect(withTrashOption('system', false).canTrash()).toBe(false);
  });
});

describe('trashing a vault file', () => {
  it('says so where Obsidian\'s trash resolved and left the file where it was', async () => {
    const { app, files } = createInMemoryApp({ files: { 'Audio/a.opus': 'x', 'Audio/b.opus': 'y' } });
    const location = new VaultLocation(app, 'Audio');
    await location.trash('a.opus');
    expect(files.has('Audio/a.opus')).toBe(false);
    vi.mocked(app.fileManager.trashFile).mockImplementation(async () => undefined);
    await expect(location.trash('b.opus')).rejects.toBeInstanceOf(TrashNotTakenError);
    expect(files.get('Audio/b.opus')).toBe('y');
  });
});

describe('reading a vault file in part', () => {
  it('gives the range and what the file measures', async () => {
    const { app } = createInMemoryApp({ files: { 'Audio/a.opus': '0123456789' } });
    const location = new VaultLocation(app, 'Audio');
    expect(new TextDecoder().decode(await location.readRange('a.opus', 2, 5))).toBe('234');
    expect(await location.stat('a.opus')).toMatchObject({ size: 10 });
    expect(await location.stat('gone.opus')).toBeNull();
  });
});

describe('removing what Atlas wrote', () => {
  it('deletes a part for good whatever the trash setting, never another file, and a folder only while it holds nothing', async () => {
    const { app, files, folders } = createInMemoryApp({ files: { 'Audio/A/01 Dawn.opus.atlas-part': 'half', 'Audio/A/01 Dawn.opus': 'whole' }, folders: ['Audio', 'Audio/A', 'Audio/Empty'] });
    const location = new VaultLocation(app, 'Audio');
    await location.removePart('A/01 Dawn.opus.atlas-part');
    expect(files.has('Audio/A/01 Dawn.opus.atlas-part')).toBe(false);
    await expect(location.removePart('A/01 Dawn.opus')).rejects.toThrow(/not Atlas' own/);
    await expect(location.removeEmptyFolder('A')).rejects.toThrow(/not Atlas' own/);
    await location.removeEmptyFolder('Empty');
    expect(folders.has('Audio/Empty')).toBe(false);
    expect(files.get('Audio/A/01 Dawn.opus')).toBe('whole');
    expect(app.fileManager.trashFile).not.toHaveBeenCalled();
  });
});
