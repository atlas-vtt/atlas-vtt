import { describe, expect, it } from 'vitest';
import { migrateInstallRecords, type InstallRecord } from '../../src/app/services/collectionBundle/installRecord';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const collection = { id: 'Cairn', uid: 'uid-cairn' };
const LEGACY = 'atlas-vtt/.atlas-data/installs/uid-cairn.json';
const MOVED = 'atlas-vtt/collections/Cairn/install.json';

function record(version: number, installedAt: number): InstallRecord {
  return {
    uid: 'uid-cairn', collectionId: 'Cairn', sourceCollectionId: 'Cairn', sourceName: 'Cairn',
    version, releasedAt: version, installedAt, files: {}, assets: {}, fields: {},
  };
}

describe('migrateInstallRecords', () => {
  it('moves this device\'s record into the collection folder', async () => {
    const vault = createInMemoryApp({ files: { [LEGACY]: JSON.stringify(record(1, 10)) } });
    await migrateInstallRecords(vault.app, [collection]);
    expect(JSON.parse(vault.files.get(MOVED)!)).toMatchObject({ version: 1 });
    expect(vault.files.has(LEGACY)).toBe(false);
  });

  it('keeps the later install where another device moved its record first', async () => {
    const vault = createInMemoryApp({ files: { [LEGACY]: JSON.stringify(record(2, 20)), [MOVED]: JSON.stringify(record(1, 10)) } });
    await migrateInstallRecords(vault.app, [collection]);
    expect(JSON.parse(vault.files.get(MOVED)!)).toMatchObject({ version: 2 });
  });

  it('keeps the moved record when it stands for the later install', async () => {
    const vault = createInMemoryApp({ files: { [LEGACY]: JSON.stringify(record(1, 10)), [MOVED]: JSON.stringify(record(2, 20)) } });
    await migrateInstallRecords(vault.app, [collection]);
    expect(JSON.parse(vault.files.get(MOVED)!)).toMatchObject({ version: 2 });
    expect(vault.files.has(LEGACY)).toBe(false);
  });
});
