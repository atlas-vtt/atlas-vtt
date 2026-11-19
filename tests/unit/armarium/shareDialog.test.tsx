// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AtlasAccount } from '../../../src/app/account/AtlasAccount';
import { ArmariumShareLayer } from '../../../src/app/armarium/share/ArmariumShareLayer';
import { ArmariumHosts } from '../../../src/app/armarium/armariumHosts';
import { ShareSession } from '../../../src/app/armarium/upload/ShareSession';
import type { ContentMedia } from '../../../src/app/packages/components/asset-manager/collection-transfer/contentMedia';
import { TooltipProvider } from '../../../src/app/packages/components/primitives/tooltip';
import { AtlasUIContext } from '../../../src/app/react/root/AtlasUIContext';
import type { ExportedBundle, ExportPreview } from '../../../src/app/services/collectionBundle/collectionExport';
import { sha256 } from '../../../src/app/utils/hashing';
import { FakeArmarium, noSleep, settle } from './shareFakes';

const confirm = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
vi.mock('../../../src/app/ui/confirmDialog', () => ({ confirmAction: confirm }));

const PREVIEW = {
  collection: { id: 'caves', uid: 'col-uid', name: 'Blue Mouth Caves', version: 2, settings: { systemPresetId: 'builtin:cairn' } },
  publisher: 'self', minimumVersion: 2, suggestedVersion: 3, cover: undefined, coverCandidates: [], assets: [], files: [], missing: [], fileSizes: new Map(),
} as unknown as ExportPreview;
const MEDIA = { dispose: () => undefined } as unknown as ContentMedia;
const app = {} as App;

afterEach(() => {
  cleanup();
  AtlasAccount.release(app);
});

let token: string | null;
let account: AtlasAccount;
beforeEach(() => {
  token = 'tok';
  confirm.mockReset();
  account = AtlasAccount.open(app, {
    http: () => Promise.resolve({ status: 200, json: { user: { id: 'u', name: 'Mara', handle: 'mara' } } }),
    timers: { now: () => 0, setTimer: () => 0, clearTimer: () => undefined },
    tokens: { get: () => token, set: (next) => (token = next), clear: () => (token = null) },
    available: true,
    openUrl: () => undefined,
    notify: () => undefined,
  });
});

function share(api: FakeArmarium): { session: ShareSession; commit: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const commit = vi.fn(() => Promise.resolve());
  const bundle: ExportedBundle = { blob: new Blob([new Uint8Array(10)]), commit, fileName: 'Caves v3.atlas-collection.zip', collectionName: 'Blue Mouth Caves', version: 3, assetCount: 1, fileCount: 2 };
  const session = new ShareSession({
    account, api, preview: PREVIEW, collectionSystem: 'cairn',
    pack: () => Promise.resolve(bundle), nameTaken: () => Promise.resolve(false), nameTakenText: (name) => name,
    committed: () => Promise.resolve(), sha256: (bytes) => sha256(bytes), sleep: noSleep,
  });
  const onClose = vi.fn();
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <TooltipProvider>
        <ArmariumShareLayer session={session} media={MEDIA} onClose={onClose} />
      </TooltipProvider>
    </AtlasUIContext.Provider>,
  );
  return { session, commit, onClose };
}

const button = (name: string | RegExp): HTMLButtonElement => screen.getByRole('button', { name });

describe('the share dialog', () => {
  it('asks a signed-out GM to sign in, and says why', async () => {
    token = null;
    const { session } = share(new FakeArmarium());
    await act(async () => {
      session.start();
      await settle();
    });
    expect(screen.getByText('Your Atlas account')).toBeTruthy();
    expect(screen.getByText(/shares collections under your Atlas account/)).toBeTruthy();
    expect(button('Sign in')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Steps of sharing' }).querySelector('[aria-current="step"]')?.textContent).toContain('Account');
  });

  it('says why the account may not share, with the way to the account page', async () => {
    const api = new FakeArmarium();
    api.gate = { may: false, reason: 'needs-linked-provider', until: null };
    const { session } = share(api);
    await act(async () => {
      session.start();
      await settle();
    });
    expect(screen.getByRole('alert').textContent).toContain('link a Discord or GitHub account');
    expect(button('Open account page')).toBeTruthy();
    expect(button('Check again')).toBeTruthy();
  });

  it('opens the export\'s own dialog in the Armarium\'s words, then walks the steps to the publish', async () => {
    const api = new FakeArmarium();
    api.findings = [{ code: 'image-type-converted', level: 'warning', path: 'Maps/Cave.webp', detail: 'png as webp' }];
    const { session, commit } = share(api);
    await act(async () => {
      session.start();
      await settle();
    });
    expect(screen.getByRole('dialog', { name: 'Share Blue Mouth Caves in the Armarium' })).toBeTruthy();
    expect(screen.getByText('Share in the Armarium')).toBeTruthy();
    expect(button('Upload v3')).toBeTruthy();
    await act(async () => {
      await session.confirmBundle({ kind: 'release', version: 3 });
      await settle(200);
    });
    expect(await screen.findByText('Describe the listing')).toBeTruthy();
    expect(screen.getByText(/The Armarium keeps it as WebP/)).toBeTruthy();
    // A description too short is named under its field.
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Too short' } });
    expect(screen.getByText('9 of 5,000, at least 20')).toBeTruthy();
    fireEvent.click(button('Continue'));
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    act(() => session.setDraft({ kind: 'adventure', description: 'Six caves under the Blue Mouth, for three to five players.' }));
    fireEvent.click(button('Cave or underground'));
    expect(button('Cave or underground').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button('Continue'));
    expect(screen.getByText('Licence and rights')).toBeTruthy();
    expect(screen.getByText('I made this, or I have the right to share all of it.')).toBeTruthy();

    act(() => session.setDraft({ licence: 'cc0' }));
    fireEvent.click(screen.getByRole('switch'));
    await act(async () => {
      fireEvent.click(button('Publish'));
      await settle(100);
    });
    expect(screen.getByText('Shared')).toBeTruthy();
    expect(screen.getByText('Blue Mouth Caves, version 3, is published.')).toBeTruthy();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(api.storedListing?.tags).toEqual(['underground']);
  });

  it('opens the published listing in the Armarium of the asset manager behind', async () => {
    const api = new FakeArmarium();
    api.own = { uid: 'col-uid', slug: 'blue-mouth-caves', fields: null, newestVersion: null };
    const show = vi.fn();
    const detach = ArmariumHosts.forApp(app).attach({ show, review: () => undefined });
    const { session, onClose } = share(api);
    await act(async () => {
      session.start();
      await settle();
      await session.confirmBundle({ kind: 'release', version: 3 });
      await vi.waitFor(() => expect(session.snapshot().step).toBe('listing'));
      session.setDraft({ kind: 'maps', description: 'Six caves under the Blue Mouth, for three to five players.', licence: 'cc0' });
      session.continueToPublish();
      session.setDeclared(true);
      await session.publish();
    });
    expect(session.snapshot().step).toBe('done');
    fireEvent.click(button('Open in the Armarium'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith('https://atlas-vtt.dev/armarium/blue-mouth-caves');
    detach();
  });

  it('asks before leaving an upload, and discards it when the GM leaves', async () => {
    const api = new FakeArmarium();
    const { session, onClose } = share(api);
    await act(async () => {
      session.start();
      await settle();
      await session.confirmBundle({ kind: 'release', version: 3 });
      await settle(200);
    });
    confirm.mockResolvedValueOnce(false);
    await act(async () => {
      fireEvent.click(button('Close'));
      await settle();
    });
    expect(onClose).not.toHaveBeenCalled();
    confirm.mockResolvedValueOnce(true);
    await act(async () => {
      fireEvent.click(button('Close'));
      await settle(100);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.discarded).toEqual(['sub-1']);
  });
});
