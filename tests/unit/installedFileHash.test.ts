import { describe, expect, it } from 'vitest';
import { installedFileHash } from '../../src/app/services/collectionBundle/importInputs';
import { sha256 } from '../../src/app/utils/hashing';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const MAP = 'atlas-vtt/collections/Cairn/maps/map-1.json';
const payload = { id: 'map-1', name: 'Blue Mouth Caves', tags: ['dungeon'], collection: 'Cairn', createdAt: 1, modifiedAt: 2 };
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value, null, 2));

describe('installedFileHash', () => {
  it('counts a map an earlier version installed, fingerprinted with its collection, as unchanged once its record is beside it', async () => {
    const { app } = createInMemoryApp({ files: { [MAP]: JSON.stringify({ ...payload, atlasRecord: { format: 1, id: 'map-1' } }, null, 2) } });
    const installed = await sha256(bytes(payload));

    expect(await installedFileHash(app, MAP, { source: installed, installed })).toBe(installed);
  });

  it('still sees a map the user changed', async () => {
    const { app } = createInMemoryApp({ files: { [MAP]: JSON.stringify({ ...payload, name: 'Renamed', atlasRecord: { format: 1, id: 'map-1' } }, null, 2) } });
    const installed = await sha256(bytes(payload));

    expect(await installedFileHash(app, MAP, { source: installed, installed })).not.toBe(installed);
  });
});
