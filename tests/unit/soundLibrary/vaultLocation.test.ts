import { describe, expect, it } from 'vitest';
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

describe('reading a vault file in part', () => {
  it('gives the range and what the file measures', async () => {
    const { app } = createInMemoryApp({ files: { 'Audio/a.opus': '0123456789' } });
    const location = new VaultLocation(app, 'Audio');
    expect(new TextDecoder().decode(await location.readRange('a.opus', 2, 5))).toBe('234');
    expect(await location.stat('a.opus')).toMatchObject({ size: 10 });
    expect(await location.stat('gone.opus')).toBeNull();
  });
});
