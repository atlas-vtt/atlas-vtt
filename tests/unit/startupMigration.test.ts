import { describe, expect, it } from 'vitest';
import { runStartupMigration } from '../../src/app/plugin/startupMigration';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SETTINGS = 'atlas-vtt/settings.json';

describe('runStartupMigration', () => {
  it('moves the files of the earliest versions into the hidden data folder', async () => {
    const vault = createInMemoryApp({ files: { [SETTINGS]: '{}' } });

    await runStartupMigration(vault.app);

    expect(vault.files.has(SETTINGS)).toBe(false);
    expect(vault.files.has('atlas-vtt/.atlas-data/settings.json')).toBe(true);
  });

  it('moves nothing on a device joining a vault whose library is in its files, so sync deletes nothing elsewhere', async () => {
    const vault = createInMemoryApp({ files: { [SETTINGS]: '{}', 'atlas-vtt/library.json': '{"format":1}' } });

    await runStartupMigration(vault.app);

    expect(vault.files.has(SETTINGS)).toBe(true);
    expect([...vault.files.keys()].some((path) => path.includes('.atlas-data'))).toBe(false);
  });
});
