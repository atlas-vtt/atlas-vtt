import { describe, expect, it, vi } from 'vitest';
import type { AccountState, SignInResult, Who } from '../../../src/app/account/AtlasAccount';
import { ItemShareSession, type PackedItemBundle } from '../../../src/app/armarium/upload/ItemShareSession';
import { ITEM_NOTES_LIMITS } from '../../../src/app/armarium/upload/shareState';
import { itemListingUid } from '../../../src/app/services/itemBundle/itemListingUid';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeArmarium, noSleep, settle } from './shareFakes';

const TEMPLATE = { kind: 'statblock-template', id: 'goblin-k2f9a1', name: 'Goblin' } as const;
const STORED = { kind: 'templates', system: 'dnd5e', description: 'A goblin statblock with its sneaky abilities and a d6 bite.', tags: ['monsters'], licence: 'cc0', credits: '' } as const;

/** A signed-in account whose identity the service answers with `who` once refreshed. */
function account(who: Who = { id: 'acct-1', name: 'Mara', handle: 'mara' }): {
  state: () => AccountState; token: () => string | null; signIn: (again?: boolean) => Promise<SignInResult>; onChange: () => () => void; refresh: ReturnType<typeof vi.fn<() => Promise<void>>>;
} {
  let known: Who = 'checking';
  return {
    state: () => ({ kind: 'signed-in', who: known }),
    token: () => 'tok',
    signIn: () => Promise.resolve('signed-in'),
    onChange: () => () => undefined,
    refresh: vi.fn(() => {
      known = who;
      return Promise.resolve();
    }),
  };
}

type Pack = (uid: string, version: number, notes: string | undefined, cover: Blob | null) => Promise<PackedItemBundle>;

function setup(options: { who?: Who; description?: string | null; fetchCover?: (url: string) => Promise<Blob | null> } = {}): { session: ItemShareSession; api: FakeArmarium; pack: ReturnType<typeof vi.fn<Pack>> } {
  const api = new FakeArmarium();
  const pack = vi.fn<Pack>((_uid, version) => Promise.resolve<PackedItemBundle>({ fileName: `Goblin v${version}.atlas-template.zip`, bytes: new Uint8Array(10), name: 'Goblin' }));
  const session = new ItemShareSession({
    account: account(options.who),
    api,
    item: TEMPLATE,
    description: options.description === undefined ? 'Goblins of the Blue Mouth caves, as five-foot menaces.' : options.description,
    listingUid: (accountId) => itemListingUid(accountId, TEMPLATE.kind, TEMPLATE.id),
    pack,
    fetchCover: options.fetchCover ?? (() => Promise.resolve(null)),
    sha256: (bytes) => sha256(bytes),
    sleep: noSleep,
  });
  return { session, api, pack };
}

async function toItemStep(session: ItemShareSession): Promise<void> {
  session.start();
  await vi.waitFor(() => expect(session.snapshot().step).toBe('bundle'));
}

describe('sharing a single Atlas file in the Armarium', () => {
  it('starts a new listing of the account at version 1 with the item\'s kind fixed and its description, and publishes it', async () => {
    const { session, api, pack } = setup();
    const uid = await itemListingUid('acct-1', 'statblock-template', TEMPLATE.id);
    api.manifest = { uid, version: 1, name: 'Goblin', notes: null, listingFormat: 'statblock-template' };
    await toItemStep(session);
    expect(session.snapshot()).toMatchObject({ subject: 'item', version: 1, listingKind: 'templates' });

    session.setNotes('Ignored for a first version');
    session.confirmItem();
    await vi.waitFor(() => expect(session.snapshot().step).toBe('listing'));
    expect(pack).toHaveBeenCalledWith(uid, 1, undefined, null);
    expect(session.snapshot().bundle).toMatchObject({ fileName: 'Goblin v1.atlas-template.zip', name: 'Goblin', version: 1 });
    expect(session.snapshot().draft).toMatchObject({ kind: 'templates', system: 'none', description: 'Goblins of the Blue Mouth caves, as five-foot menaces.' });

    session.continueToPublish();
    session.setDraft({ licence: 'cc-by-4.0' });
    session.setDeclared(true);
    api.own = { uid, slug: 'goblin', format: 'statblock-template', fields: null, newestVersion: 1, coverUrl: null };
    await session.publish();
    expect(api.sentListings).toEqual([{ kind: 'templates', system: null, description: 'Goblins of the Blue Mouth caves, as five-foot menaces.', tags: [], licence: 'cc-by-4.0', credits: '' }]);
    expect(session.snapshot()).toMatchObject({ step: 'done', published: { held: false, recordFailed: null } });
  });

  it('continues the account\'s listing one version above its newest, with what changed, and starts from what the listing holds', async () => {
    const { session, api, pack } = setup();
    const uid = await itemListingUid('acct-1', 'statblock-template', TEMPLATE.id);
    api.own = { uid, slug: 'goblin', format: 'statblock-template', fields: STORED, newestVersion: 2, coverUrl: null };
    api.manifest = { uid, version: 3, name: 'Goblin', notes: 'Adds the bite.', listingFormat: 'statblock-template' };
    await toItemStep(session);
    expect(api.calls).toContain('ownListing');
    expect(session.snapshot().version).toBe(3);

    session.setNotes('  Adds the bite.  ');
    session.confirmItem();
    await vi.waitFor(() => expect(session.snapshot().step).toBe('listing'));
    expect(pack).toHaveBeenCalledWith(uid, 3, 'Adds the bite.', null);
    expect(session.snapshot().draft).toMatchObject({ kind: 'templates', system: 'dnd5e', description: STORED.description, licence: 'cc0' });
  });

  it('keeps notes longer than a manifest carries on the item step', async () => {
    const { session, api, pack } = setup();
    api.own = { uid: await itemListingUid('acct-1', 'statblock-template', TEMPLATE.id), slug: 'goblin', format: 'statblock-template', fields: null, newestVersion: 1, coverUrl: null };
    await toItemStep(session);
    session.setNotes('x'.repeat(ITEM_NOTES_LIMITS.max + 1));
    session.confirmItem();
    expect(session.snapshot()).toMatchObject({ step: 'bundle', problems: { notes: 'too-long' } });
    expect(pack).not.toHaveBeenCalled();
    session.setNotes('Shorter');
    expect(session.snapshot().problems).toEqual({});
  });

  it('leaves the description empty where the item has none', async () => {
    const { session } = setup({ description: null });
    await toItemStep(session);
    expect(session.snapshot().draft.description).toBe('');
  });

  it('cannot go on while the account service does not say whose account it is', async () => {
    const { session, api } = setup({ who: 'unreachable' });
    session.start();
    await settle();
    expect(session.snapshot()).toMatchObject({ step: 'account', gate: { status: 'refused', refusal: { code: 'network' } } });
    expect(api.calls).not.toContain('ownListing');
  });

  it('packs again after packing failed', async () => {
    const { session, pack } = setup();
    pack.mockRejectedValueOnce(new Error('The template file is gone.'));
    await toItemStep(session);
    session.confirmItem();
    await vi.waitFor(() => expect(session.snapshot().refusal).toMatchObject({ code: 'export-failed', detail: 'The template file is gone.' }));
    session.retryUpload();
    await vi.waitFor(() => expect(session.snapshot().step).toBe('listing'));
    expect(pack).toHaveBeenCalledTimes(2);
  });

  it('packs the cover chosen on the item step: an uploaded image, or none', async () => {
    const { session, pack } = setup();
    await toItemStep(session);
    const image = new Blob(['art'], { type: 'image/png' });
    session.uploadCover(image);
    expect(session.snapshot()).toMatchObject({ cover: image, uploadedCover: image });
    session.setCover(null);
    expect(session.snapshot()).toMatchObject({ cover: null, uploadedCover: image });
    session.setCover(image);
    session.confirmItem();
    await vi.waitFor(() => expect(pack).toHaveBeenCalled());
    expect(pack.mock.calls[0]?.[3]).toBe(image);
  });

  it('keeps the published cover for the next version unless another is chosen', async () => {
    const listed = new Blob(['listed'], { type: 'image/webp' });
    const fetchCover = vi.fn(() => Promise.resolve(listed));
    const { session, api, pack } = setup({ fetchCover });
    const uid = await itemListingUid('acct-1', 'statblock-template', TEMPLATE.id);
    api.own = { uid, slug: 'goblin', format: 'statblock-template', fields: STORED, newestVersion: 2, coverUrl: 'https://atlasvttusercontent.com/covers/goblin.webp' };
    await toItemStep(session);
    await vi.waitFor(() => expect(session.snapshot().cover).toBe(listed));
    expect(fetchCover).toHaveBeenCalledWith('https://atlasvttusercontent.com/covers/goblin.webp');
    expect(session.snapshot().listedCover).toBe(listed);
    session.confirmItem();
    await vi.waitFor(() => expect(pack).toHaveBeenCalled());
    expect(pack.mock.calls[0]?.[3]).toBe(listed);
  });

  it('leaves a cover chosen before the published one arrived', async () => {
    const listed = new Blob(['listed']);
    let deliver: (blob: Blob) => void = () => undefined;
    const { session, api } = setup({ fetchCover: () => new Promise<Blob | null>((resolve) => { deliver = resolve; }) });
    const uid = await itemListingUid('acct-1', 'statblock-template', TEMPLATE.id);
    api.own = { uid, slug: 'goblin', format: 'statblock-template', fields: STORED, newestVersion: 2, coverUrl: 'https://atlasvttusercontent.com/covers/goblin.webp' };
    await toItemStep(session);
    session.setCover(null);
    deliver(listed);
    await vi.waitFor(() => expect(session.snapshot().listedCover).toBe(listed));
    expect(session.snapshot().cover).toBeNull();
  });
});
