import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestUrl } from 'obsidian';
import { fetchInstallableList, parseInstallableList } from '../../../src/app/armarium/installableList';

vi.mock('obsidian', async (original) => ({ ...(await original<typeof import('obsidian')>()), requestUrl: vi.fn() }));

const listing = {
  uid: 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e',
  slug: '1-6-skeletons-in-a-stable',
  name: '1-6 Skeletons in a Stable',
  creator: 'Steve',
  version: 5,
  fileName: '1-6 Skeletons in a Stable v5.atlas-collection.zip',
  bytes: 1760415,
  sha256: '9148f3673d042cc92a655cff95ad77c3b7e89e849c6029f46c256aae0995139c',
  downloadUrl: 'https://atlasvttusercontent.com/bundles/da0b742f-d1fc-4f2a-9b0f-300d7e45538e/5/9148f3673d04.zip',
};

describe('the installable list', () => {
  afterEach(() => vi.mocked(requestUrl).mockReset());

  it('keeps what the plugin needs of each listing', () => {
    expect(parseInstallableList({ format: 1, builtAt: '2026-11-18T00:00:00Z', listings: [listing] })).toEqual([{
      uid: listing.uid, name: listing.name, version: 5, fileName: listing.fileName, bytes: 1760415, sha256: listing.sha256, downloadUrl: listing.downloadUrl,
    }]);
  });

  it('leaves out listings it cannot trust and a second listing of one uid', () => {
    const listings = [
      { ...listing, sha256: 'ABC' },
      { ...listing, uid: 'b', sha256: listing.sha256.toUpperCase() },
      { ...listing, uid: 'c', bytes: 0 },
      { ...listing, uid: 'd', bytes: 2 ** 40 },
      { ...listing, uid: 'e', version: 0 },
      { ...listing, uid: 'f', downloadUrl: undefined },
      { ...listing, uid: 'g/../h' },
      listing,
      { ...listing, version: 6 },
    ];
    expect(parseInstallableList({ format: 1, listings })?.map((entry) => [entry.uid, entry.version])).toEqual([[listing.uid, 5]]);
  });

  it('refuses another format', () => {
    expect(parseInstallableList({ format: 2, listings: [listing] })).toBeNull();
    expect(parseInstallableList({ format: 1 })).toBeNull();
    expect(parseInstallableList([listing])).toBeNull();
  });

  it('reads the list from the site and tells an unreachable site from a bad answer', async () => {
    vi.mocked(requestUrl).mockResolvedValueOnce({ status: 200, json: { format: 1, listings: [listing] } } as never);
    expect(await fetchInstallableList()).toHaveLength(1);
    expect(vi.mocked(requestUrl).mock.calls[0]![0]).toEqual({ url: 'https://atlas-vtt.dev/api/armarium/v1', throw: false });

    vi.mocked(requestUrl).mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'));
    await expect(fetchInstallableList()).rejects.toMatchObject({ offline: true });

    vi.mocked(requestUrl).mockResolvedValueOnce({ status: 404, json: null } as never);
    await expect(fetchInstallableList()).rejects.toMatchObject({ offline: false });

    vi.mocked(requestUrl).mockResolvedValueOnce({ status: 200, get json(): unknown { throw new SyntaxError('Unexpected token <'); } } as never);
    await expect(fetchInstallableList()).rejects.toMatchObject({ offline: false });
  });
});
