import { describe, expect, it, vi } from 'vitest';
import type { AccountState, SignInResult } from '../../../src/app/account/AtlasAccount';
import { ShareSession } from '../../../src/app/armarium/upload/ShareSession';
import type { ExportChoice, ExportedBundle, ExportPreview } from '../../../src/app/services/collectionBundle/collectionExport';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeArmarium, noSleep, settle } from './shareFakes';

const PREVIEW = {
  collection: { id: 'caves', uid: 'col-uid', name: 'Blue Mouth Caves', version: 2, settings: {} },
  publisher: 'self', minimumVersion: 2, suggestedVersion: 3, cover: undefined, coverCandidates: [], assets: [], files: [], missing: [], fileSizes: new Map(),
} as unknown as ExportPreview;
const RELEASE: ExportChoice = { kind: 'release', version: 3 };
const LISTING = { kind: 'adventure', description: 'Six caves under the Blue Mouth, for three to five players.' } as const;

/** An account that is signed in, or signs in when asked, and approves again when a publish asks for it. */
function account(signedIn = true): { state: () => AccountState; token: () => string | null; signIn: ReturnType<typeof vi.fn<(again?: boolean) => Promise<SignInResult>>>; onChange: (listener: () => void) => () => void; change: () => void } {
  let token: string | null = signedIn ? 'tok' : null;
  const listeners = new Set<() => void>();
  const change = (): void => listeners.forEach((listener) => listener());
  return {
    state: () => (token === null ? { kind: 'signed-out', notice: null } : { kind: 'signed-in', who: 'checking' }),
    token: () => token,
    signIn: vi.fn((_again?: boolean) => {
      token = 'fresh';
      change();
      return Promise.resolve<SignInResult>('signed-in');
    }),
    onChange: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    change,
  };
}

/** A sleep of one turn of the event loop, which stops on its signal. */
function tickSleep(_ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    setTimeout(resolve, 0);
  });
}

function setup(options: { signedIn?: boolean; sleep?: typeof noSleep; nameTaken?: boolean } = {}): { session: ShareSession; api: FakeArmarium; who: ReturnType<typeof account>; commit: ReturnType<typeof vi.fn>; committed: ReturnType<typeof vi.fn> } {
  const api = new FakeArmarium();
  const who = account(options.signedIn ?? true);
  const commit = vi.fn(() => Promise.resolve());
  const committed = vi.fn(() => Promise.resolve());
  const bundle: ExportedBundle = { blob: new Blob([new Uint8Array(10)]), commit, fileName: 'Caves v3.atlas-collection.zip', collectionName: 'Blue Mouth Caves', version: 3, assetCount: 1, fileCount: 2 };
  const session = new ShareSession({
    account: who,
    api,
    preview: PREVIEW,
    collectionSystem: 'cairn',
    pack: (_preview, _choice, onProgress) => {
      onProgress({ message: 'Compressing…', fraction: 0.5 });
      return Promise.resolve(bundle);
    },
    nameTaken: () => Promise.resolve(options.nameTaken ?? false),
    nameTakenText: (name) => `${name} is taken`,
    committed,
    sha256: (bytes) => sha256(bytes),
    sleep: options.sleep ?? noSleep,
  });
  return { session, api, who, commit, committed };
}

/** Takes a session from the start to its listing step. */
async function toListing(session: ShareSession): Promise<void> {
  session.start();
  await settle();
  expect(session.snapshot().step).toBe('bundle');
  expect(await session.confirmBundle(RELEASE)).toBeNull();
  await vi.waitFor(() => expect(session.snapshot().step).toBe('listing'));
}

describe('sharing a collection in the Armarium', () => {
  it('goes from the account to the published listing, and records the release only after the publish', async () => {
    const { session, api, commit, committed } = setup();
    await toListing(session);
    expect(api.calls.slice(0, 2).sort()).toEqual(['eligibility', 'ownListing']);
    expect(session.snapshot().draft.system).toBe('cairn');
    expect(commit).not.toHaveBeenCalled();

    session.continueToPublish();
    expect(session.snapshot().problems).toEqual({ kind: 'missing', description: 'missing' });
    session.setDraft(LISTING);
    session.continueToPublish();
    expect(session.snapshot().step).toBe('publish');

    await session.publish();
    expect(session.snapshot().problems).toEqual({ licence: 'missing' });
    session.setDraft({ licence: 'cc-by-sa-4.0' });
    await session.publish();
    expect(session.snapshot().refusal).toEqual({ code: 'declaration-missing', until: null });
    expect(commit).not.toHaveBeenCalled();

    api.own = { uid: 'col-uid', slug: 'blue-mouth-caves', fields: null, newestVersion: 3 };
    session.setDeclared(true);
    await session.publish();
    expect(api.storedListing).toMatchObject({ kind: 'adventure', system: 'cairn', licence: 'cc-by-sa-4.0' });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(committed).toHaveBeenCalledWith(RELEASE);
    expect(session.snapshot()).toMatchObject({ step: 'done', published: { slug: 'blue-mouth-caves', held: false, recordFailed: null } });
  });

  it('waits for a sign-in, then asks whether the account may share', async () => {
    const { session, api, who } = setup({ signedIn: false });
    session.start();
    await settle();
    expect(session.snapshot()).toMatchObject({ step: 'account', gate: null });
    expect(api.calls).toEqual([]);
    await who.signIn();
    await settle();
    expect(session.snapshot().step).toBe('bundle');
  });

  it('stays at the account with the refusal, and asks again when told to', async () => {
    const { session, api } = setup();
    api.gate = { may: false, reason: 'needs-linked-provider', until: null };
    session.start();
    await settle();
    expect(session.snapshot()).toMatchObject({ step: 'account', gate: { status: 'refused', refusal: { code: 'needs-linked-provider', until: null } } });
    api.gate = { may: true };
    session.recheck();
    await settle();
    expect(session.snapshot().step).toBe('bundle');
  });

  it('starts an update\'s form from the listing, and its version above the newest published one', async () => {
    const { session, api } = setup();
    api.own = { uid: 'col-uid', slug: 'blue-mouth-caves', newestVersion: 4, fields: { kind: 'adventure', system: 'cairn', description: LISTING.description, tags: ['underground'], licence: 'cc-by-4.0', credits: 'Art by Oozejar' } };
    await toListing(session);
    expect(session.snapshot().preview).toMatchObject({ minimumVersion: 5, suggestedVersion: 5 });
    expect(session.snapshot().draft).toMatchObject({ kind: 'adventure', tags: ['underground'], licence: 'cc-by-4.0', credits: 'Art by Oozejar' });
  });

  it('approves the device again when the Armarium asks for a recent approval, then publishes on its own', async () => {
    const { session, api, who, commit } = setup();
    await toListing(session);
    session.setDraft({ ...LISTING, licence: 'cc0' });
    session.continueToPublish();
    session.setDeclared(true);
    api.fail('publish', { status: 403, code: 'device-session-stale' });
    await session.publish();
    expect(who.signIn).toHaveBeenCalledWith(true);
    expect(api.calls.filter((call) => call === 'publish')).toHaveLength(2);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(session.snapshot().step).toBe('done');
  });

  it('keeps the export unrecorded when the publish is refused, and opens the listing again for a field it names', async () => {
    const { session, api, commit } = setup();
    await toListing(session);
    session.setDraft({ ...LISTING, licence: 'cc0' });
    session.continueToPublish();
    session.setDeclared(true);
    api.fail('putListing', { status: 400, code: 'bad-fields' });
    await session.publish();
    expect(session.snapshot().refusal?.code).toBe('bad-fields');
    api.fail('publish', { status: 403, code: 'publishing-paused' });
    await session.publish();
    expect(session.snapshot()).toMatchObject({ step: 'publish', refusal: { code: 'publishing-paused' }, busy: false });
    expect(commit).not.toHaveBeenCalled();
  });

  it('shows a refused check\'s findings and starts over, discarding the upload', async () => {
    const { session, api } = setup();
    api.checkedAs = 'rejected';
    api.findings = [{ code: 'note-code-language', level: 'error', path: 'Lore/Cave.md', detail: '3: dataviewjs' }];
    session.start();
    await settle();
    await session.confirmBundle(RELEASE);
    await vi.waitFor(() => expect(session.snapshot().submission?.state).toBe('rejected'));
    expect(session.snapshot().step).toBe('checks');
    session.startOver();
    await settle();
    expect(session.snapshot()).toMatchObject({ step: 'bundle', submission: null, bundle: null });
    expect(api.discarded).toEqual(['sub-1']);
  });

  it('retries a failed upload where it stopped', async () => {
    const { session, api } = setup();
    api.fail('part 2', { status: 0, code: 'network' }, { status: 0, code: 'network' }, { status: 0, code: 'network' });
    session.start();
    await settle();
    await session.confirmBundle(RELEASE);
    await vi.waitFor(() => expect(session.snapshot().refusal?.code).toBe('network'));
    expect(session.snapshot()).toMatchObject({ step: 'upload', busy: false });
    expect(session.snapshot().upload?.parts).toEqual(['sent', 'failed', 'sent']);
    session.retryUpload();
    await vi.waitFor(() => expect(session.snapshot().step).toBe('listing'));
  });

  it('discards the upload when the GM leaves before publishing', async () => {
    const { session, api, commit } = setup();
    await toListing(session);
    expect(await session.abandon()).toBe('discarded');
    expect(api.discarded).toEqual(['sub-1']);
    expect(commit).not.toHaveBeenCalled();
  });

  it('discards an upload left under its check once the check is done', async () => {
    const { session, api } = setup({ sleep: tickSleep });
    api.checkAsks = Number.POSITIVE_INFINITY;
    session.start();
    await settle();
    await session.confirmBundle(RELEASE);
    await vi.waitFor(() => expect(session.snapshot().step).toBe('checks'));
    expect(await session.abandon()).toBe('after-checks');
    expect(api.discarded).toEqual([]);
    api.checkAsks = 1;
    await vi.waitFor(() => expect(api.discarded).toEqual(['sub-1']));
  });

  it('stops an upload on its way and discards it', async () => {
    const { session, api } = setup();
    api.fail('part 1', { status: 0, code: 'network' }, { status: 0, code: 'network' }, { status: 0, code: 'network' });
    session.start();
    await settle();
    await session.confirmBundle(RELEASE);
    await vi.waitFor(() => expect(session.snapshot().refusal?.code).toBe('network'));
    expect(await session.abandon()).toBe('discarded');
    expect(api.discarded).toEqual(['sub-1']);
  });

  it('leaves nothing behind when nothing was uploaded yet', async () => {
    const { session, api } = setup();
    session.start();
    await settle();
    expect(await session.abandon()).toBe('nothing');
    expect(api.discarded).toEqual([]);
  });

  it('answers the export dialog when a fork\'s name is taken', async () => {
    const { session, api } = setup({ nameTaken: true });
    session.start();
    await settle();
    expect(await session.confirmBundle({ kind: 'fork', name: 'Caves' })).toBe('Caves is taken');
    expect(session.snapshot().step).toBe('bundle');
    expect(api.calls).not.toContain('ticket');
  });
});
