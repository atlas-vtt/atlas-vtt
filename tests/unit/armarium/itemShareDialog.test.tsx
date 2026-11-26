// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AtlasAccount } from '../../../src/app/account/AtlasAccount';
import { ArmariumShareLayer } from '../../../src/app/armarium/share/ArmariumShareLayer';
import { ItemShareSession } from '../../../src/app/armarium/upload/ItemShareSession';
import { AtlasUIContext } from '../../../src/app/react/root/AtlasUIContext';
import { itemListingUid } from '../../../src/app/services/itemBundle/itemListingUid';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeArmarium, noSleep, settle } from './shareFakes';

vi.mock('../../../src/app/ui/confirmDialog', () => ({ confirmAction: vi.fn() }));

const app = {} as App;
const ITEM = { kind: 'dice-set', id: 'bone-dice', name: 'Bone dice' } as const;
let token: string | null;

beforeEach(() => {
  token = 'tok';
  AtlasAccount.open(app, {
    http: () => Promise.resolve({ status: 200, json: { user: { id: 'acct-1', name: 'Mara', handle: 'mara' } } }),
    timers: { now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
    tokens: { get: () => token, set: (next) => (token = next), clear: () => (token = null) },
    available: true,
    openUrl: () => undefined,
    notify: () => undefined,
  });
});
afterEach(() => {
  cleanup();
  AtlasAccount.release(app);
});

function share(api: FakeArmarium): ItemShareSession {
  const session = new ItemShareSession({
    account: AtlasAccount.forApp(app)!, api, item: ITEM, description: null,
    listingUid: (accountId) => itemListingUid(accountId, ITEM.kind, ITEM.id),
    pack: (_uid, version) => Promise.resolve({ fileName: `Bone dice v${version}.atlas-dice.zip`, bytes: new Uint8Array(10), name: 'Bone dice' }),
    fetchCover: () => Promise.resolve(null),
    sha256: (bytes) => sha256(bytes), sleep: noSleep,
  });
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ArmariumShareLayer session={session} onClose={vi.fn()} />
    </AtlasUIContext.Provider>,
  );
  return session;
}

describe('the share dialog of a single Atlas file', () => {
  it('shows what is shared and the next version with a field for what changed, then the listing with its kind fixed', async () => {
    const api = new FakeArmarium();
    const uid = await itemListingUid('acct-1', ITEM.kind, ITEM.id);
    api.own = { uid, slug: 'bone-dice', format: 'dice-set', fields: null, newestVersion: 2, coverUrl: null };
    api.manifest = { uid, version: 3, name: 'Bone dice', notes: null, listingFormat: 'dice-set' };
    const session = share(api);
    await act(async () => {
      session.start();
      await settle(100);
    });
    expect(screen.getByRole('dialog', { name: 'Share Bone dice in the Armarium' })).toBeTruthy();
    expect(await screen.findByText('What you share')).toBeTruthy();
    expect(screen.getByText('3, the next version of your listing')).toBeTruthy();
    expect(screen.getByLabelText('What changed')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'No cover' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Upload image' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Steps of sharing' }).textContent).toContain('Version');

    await act(async () => {
      screen.getByRole('button', { name: 'Continue' }).click();
      await settle(200);
    });
    expect(await screen.findByText('Describe the listing')).toBeTruthy();
    expect(screen.getByText('Dice sets')).toBeTruthy();
    expect(screen.queryByText('Choose a kind')).toBeNull();
  });

  it('starts a new listing at version 1 without asking what changed', async () => {
    const session = share(new FakeArmarium());
    await act(async () => {
      session.start();
      await settle(100);
    });
    expect(await screen.findByText('1, a new listing')).toBeTruthy();
    expect(screen.queryByLabelText('What changed')).toBeNull();
  });
});
