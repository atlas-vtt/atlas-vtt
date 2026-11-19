import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestUrl, type App } from 'obsidian';
import { showNotice } from '../../../src/app/ui/notice';
import { sha256 } from '../../../src/app/utils/hashing';
import { ArmariumInstaller } from '../../../src/app/armarium/ArmariumInstaller';
import type { InstallState } from '../../../src/app/armarium/armariumMessages';
import type { ExternalImport } from '../../../src/app/services/collectionBundle/externalImport';

vi.mock('obsidian', async (original) => ({ ...(await original<typeof import('obsidian')>()), requestUrl: vi.fn() }));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ hide: vi.fn() })) }));

const UID = 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e';
const LIST_URL = 'https://atlas-vtt.dev/api/armarium/v1';
const ROUTE = `https://api.atlas-vtt.dev/v1/armarium/download/${UID}/5`;
const FILE_URL = `https://atlasvttusercontent.com/bundles/${UID}/5/9148f3673d04.zip`;
const BUNDLE = new TextEncoder().encode('PK\u0003\u0004 a collection bundle').buffer;

type Answer = { status: number; json?: unknown; arrayBuffer?: ArrayBuffer } | Error;

let answers: Map<string, Answer>;
let listing: Record<string, unknown>;
const app = {} as App;

function answer(url: string, response: Answer): void {
  answers.set(url, response);
}

async function serveList(overrides: Record<string, unknown> = {}): Promise<void> {
  listing = { uid: UID, name: 'Skeletons', version: 5, fileName: 'Skeletons v5.atlas-collection.zip', bytes: BUNDLE.byteLength, sha256: await sha256(BUNDLE), downloadUrl: FILE_URL, ...overrides };
  answer(LIST_URL, { status: 200, json: { format: 1, listings: [listing] } });
}

/** An installer whose review is held until the test settles it, with every status it reported. */
function installer(): { states: InstallState[]; reviews: ExternalImport[]; installer: ArmariumInstaller } {
  const states: InstallState[] = [];
  const reviews: ExternalImport[] = [];
  const instance = ArmariumInstaller.open(app, { review: (pending) => { reviews.push(pending); }, installed: async () => [] });
  instance.onStatus((_request, state) => states.push(state));
  return { states, reviews, installer: instance };
}

const requested = (): string[] => vi.mocked(requestUrl).mock.calls.map(([param]) => (typeof param === 'string' ? param : param.url));
const noticed = (): unknown[] => vi.mocked(showNotice).mock.calls.map(([message]) => message);
/** Waits until the install reaches the review: the SHA-256 is worked out off the main thread, so it takes its time. */
const reviewed = (reviews: readonly ExternalImport[]): Promise<void> => vi.waitFor(() => expect(reviews).toHaveLength(1));

beforeEach(async () => {
  answers = new Map();
  vi.mocked(requestUrl).mockImplementation((async (param: { url: string } | string) => {
    const url = typeof param === 'string' ? param : param.url;
    const response = answers.get(url) ?? { status: 404 };
    if (response instanceof Error) throw response;
    return response;
  }) as never);
  await serveList();
  answer(ROUTE, { status: 200, arrayBuffer: BUNDLE });
});

afterEach(() => {
  ArmariumInstaller.release(app);
  vi.mocked(requestUrl).mockReset();
  vi.mocked(showNotice).mockClear();
});

describe('installing from the Armarium', () => {
  it('downloads through the counting route, checks the file and hands its bytes to the import review', async () => {
    const { states, reviews, installer: instance } = installer();
    const done = instance.install({ uid: UID, version: 5 });
    await reviewed(reviews);

    expect(requested()).toEqual([LIST_URL, ROUTE]);
    expect(reviews).toHaveLength(1);
    expect(new Uint8Array(await reviews[0]!.data.arrayBuffer())).toEqual(new Uint8Array(BUNDLE));
    reviews[0]!.onReview();
    expect(instance.isBusy()).toBe(true);
    reviews[0]!.onSettled({ kind: 'installed', collectionId: 'Skeletons' });
    await done;

    expect(states).toEqual(['downloading', 'reviewing', 'installed']);
    expect(instance.isBusy()).toBe(false);
  });

  it('reports a review the GM cancelled, and only the first outcome', async () => {
    const { states, reviews, installer: instance } = installer();
    const done = instance.install({ uid: UID, version: 5 });
    await reviewed(reviews);
    reviews[0]!.onSettled({ kind: 'cancelled' });
    reviews[0]!.onSettled({ kind: 'installed', collectionId: 'Skeletons' });
    await done;
    expect(states).toEqual(['downloading', 'cancelled']);
  });

  it('refuses a release the list no longer offers, without downloading', async () => {
    await serveList({ version: 6 });
    const { states, reviews, installer: instance } = installer();
    await instance.install({ uid: UID, version: 5 });

    expect(requested()).toEqual([LIST_URL]);
    expect(reviews).toHaveLength(0);
    expect(states).toEqual(['downloading', 'failed']);
    expect(noticed()).toEqual(['Skeletons changed since the page was loaded: version 6 is offered now. Reload the Armarium and try again.']);
  });

  it('refuses a listing the list does not hold', async () => {
    const { states, installer: instance } = installer();
    await instance.install({ uid: 'some-other-uid', version: 5 });
    expect(states).toEqual(['downloading', 'failed']);
    expect(noticed()).toEqual(['This collection is no longer offered in the Armarium.']);
  });

  it('falls back to the listing\'s own file when the counting route fails', async () => {
    answer(ROUTE, new Error('net::ERR_NAME_NOT_RESOLVED'));
    answer(FILE_URL, { status: 200, arrayBuffer: BUNDLE });
    const { reviews, installer: instance } = installer();
    void instance.install({ uid: UID, version: 5 });
    await reviewed(reviews);

    expect(requested()).toEqual([LIST_URL, ROUTE, FILE_URL]);
    expect(reviews).toHaveLength(1);
    reviews[0]!.onSettled({ kind: 'cancelled' });
  });

  it('never falls back to a host that is not the Armarium\'s', async () => {
    await serveList({ downloadUrl: 'https://evil.example/bundle.zip' });
    answer(ROUTE, { status: 500 });
    const { states, reviews, installer: instance } = installer();
    await instance.install({ uid: UID, version: 5 });

    expect(requested()).toEqual([LIST_URL, ROUTE]);
    expect(reviews).toHaveLength(0);
    expect(states).toEqual(['downloading', 'failed']);
    expect(noticed()).toContain('Skeletons could not be downloaded. Check your connection and try again.');
  });

  it.each([
    ['plain http', `http://atlasvttusercontent.com/bundles/${UID}/5/x.zip`],
    ['a look-alike host', `https://atlasvttusercontent.com.evil.example/x.zip`],
    ['another port', `https://atlasvttusercontent.com:8443/x.zip`],
  ])('never falls back to %s', async (_case, downloadUrl) => {
    await serveList({ downloadUrl });
    answer(ROUTE, { status: 404 });
    const { installer: instance } = installer();
    await instance.install({ uid: UID, version: 5 });
    expect(requested()).toEqual([LIST_URL, ROUTE]);
  });

  it('keeps nothing whose size or SHA-256 is not the listed file\'s', async () => {
    answer(ROUTE, { status: 200, arrayBuffer: new TextEncoder().encode('tampered bundle of the same size!!!').buffer });
    answer(FILE_URL, { status: 200, arrayBuffer: new ArrayBuffer(BUNDLE.byteLength) });
    const { states, reviews, installer: instance } = installer();
    await instance.install({ uid: UID, version: 5 });

    expect(requested()).toEqual([LIST_URL, ROUTE, FILE_URL]);
    expect(reviews).toHaveLength(0);
    expect(states).toEqual(['downloading', 'failed']);
    expect(noticed()).toContain('The download of Skeletons is not the file the Armarium lists, so nothing was installed.');
  });

  it('says the Armarium cannot be reached when the list cannot be read', async () => {
    answer(LIST_URL, new Error('net::ERR_INTERNET_DISCONNECTED'));
    const { states, installer: instance } = installer();
    await expect(instance.install({ uid: UID, version: 5 })).resolves.toBeUndefined();
    expect(states).toEqual(['downloading', 'failed']);
    expect(noticed()).toEqual(['The Armarium could not be reached. Check your connection and try again.']);
  });

  it('reports a failed review handoff without an unhandled rejection', async () => {
    const states: InstallState[] = [];
    const instance = ArmariumInstaller.open(app, { review: () => { throw new Error('not ready'); } });
    instance.onStatus((_request, state) => states.push(state));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(instance.install({ uid: UID, version: 5 })).resolves.toBeUndefined();
    expect(states).toEqual(['downloading', 'failed']);
    expect(noticed()).toEqual(['Downloading Skeletons…', 'Installing from the Armarium failed.']);
    error.mockRestore();
  });

  it('installs one collection at a time', async () => {
    const { states, reviews, installer: instance } = installer();
    const first = instance.install({ uid: UID, version: 5 });
    await reviewed(reviews);
    reviews[0]!.onReview();

    await instance.install({ uid: 'another-listing', version: 1 });
    expect(noticed()).toContain('Another collection is being installed. Finish its review first.');
    await instance.install({ uid: UID, version: 5 });
    expect(reviews).toHaveLength(1);
    expect(requested().filter((url) => url === ROUTE)).toHaveLength(1);

    reviews[0]!.onSettled({ kind: 'installed', collectionId: 'Skeletons' });
    await first;
    // The refused one is told it was not started; the repeated one where the running install stands.
    expect(states).toEqual(['downloading', 'reviewing', 'cancelled', 'reviewing', 'installed']);
  });

  it('tells which of the Armarium\'s listings the vault holds, and nothing of other collections', async () => {
    const installed = vi.fn(async (listed: ReadonlySet<string>) => [...listed].map((uid) => ({ uid, version: 4 })));
    const instance = ArmariumInstaller.open(app, { review: vi.fn(), installed });
    expect(await instance.installedItems()).toEqual([{ uid: UID, version: 4 }]);
    expect([...installed.mock.calls[0]![0]]).toEqual([UID]);

    answer(LIST_URL, new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fresh = ArmariumInstaller.open(app, { review: vi.fn(), installed });
    expect(await fresh.installedItems()).toEqual([]);
    warn.mockRestore();
  });
});
