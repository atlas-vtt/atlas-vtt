// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import AssetManager from '../../../src/app/packages/components/asset-manager/AssetManager';
import { ArmariumHosts } from '../../../src/app/armarium/armariumHosts';
import { ArmariumInstaller, type StatusListener } from '../../../src/app/armarium/ArmariumInstaller';
import type { ExternalImport } from '../../../src/app/services/collectionBundle/externalImport';

const app = vi.hoisted(() => ({ workspace: { on: () => ({}), offref: () => {} }, keymap: { pushScope: () => {}, popScope: () => {} } }));
const reviews = vi.hoisted((): ExternalImport[] => []);
/** Another export or import runs: an outside bundle waits for it. */
const busy = vi.hoisted(() => ({ value: false }));

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ hide: vi.fn() })) }));
vi.mock('../../../src/app/packages/components/asset-manager/hooks/useAssetData', () => ({
  useAssetData: () => ({
    shownFolderOf: (folderId: string | null) => folderId,
    folders: [], collections: [], availableTags: [], assets: [], assetsLoading: false, assetCounts: null, app,
  }),
}));
// The transfer as far as the review: an outside bundle starts it, and the review stands until the GM answers.
vi.mock('../../../src/app/packages/components/asset-manager/hooks/useAssetCrud', async () => {
  const { useState } = await import('react');
  return {
    useAssetCrud: () => {
      const [transfer, setTransfer] = useState<{ step: string } | null>(null);
      return {
        transfer,
        startExternalImport: (pending: ExternalImport): boolean => {
          if (busy.value) return false;
          reviews.push(pending);
          setTransfer({ step: 'import-review' });
          return true;
        },
      };
    },
  };
});
vi.mock('../../../src/app/packages/components/asset-manager/hooks/useTagsAndCollections', () => ({ useTagsAndCollections: () => ({}) }));
vi.mock('../../../src/app/packages/components/asset-manager/hooks/useContextMenus', () => ({ useContextMenus: () => ({}) }));
vi.mock('../../../src/app/packages/components/asset-manager/hooks/useStatblockLink', () => ({ useStatblockLink: () => ({}) }));
vi.mock('../../../src/app/packages/components/asset-manager/hooks/useRememberedPlace', () => ({
  useRememberedPlace: () => ({ scrollTopOf: () => 0, setScrollTop: () => {} }),
}));
vi.mock('../../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects', () => ({ useAssetManagerEffects: () => {} }));
vi.mock('../../../src/app/packages/components/asset-manager/components/Content', () => ({ Content: () => <p>Library</p> }));
vi.mock('../../../src/app/packages/components/asset-manager/components/ModalLayer', () => ({
  ModalLayer: ({ crud }: { crud: { transfer: { step: string } | null } }) => (crud.transfer ? <div role="dialog" aria-label="Import review" /> : null),
}));
vi.mock('../../../src/app/packages/components/asset-manager/components/Sidebar', () => ({
  Sidebar: ({ onSelectTag }: { onSelectTag: (id: string) => void }) => (
    <button type="button" onClick={() => onSelectTag('forest')}>forest</button>
  ),
}));
vi.mock('../../../src/app/packages/components/asset-manager/components/Header', () => ({
  Header: ({ onTabChange, armarium, onShowArmarium }: { onTabChange: (tab: string) => void; armarium?: { onBack: () => void; onReload: () => void }; onShowArmarium: () => void }) => (
    <div>
      <button type="button" onClick={() => onTabChange('maps')}>Maps</button>
      <button type="button" aria-current={armarium ? 'page' : undefined} onClick={onShowArmarium}>Armarium</button>
      {armarium && <button type="button" onClick={armarium.onBack}>Back to the library</button>}
      {armarium && <button type="button" onClick={armarium.onReload}>Reload</button>}
    </div>
  ),
}));

const FRAME = 'The Armarium, Atlas\' library of collections';
const storeFrame = (): HTMLIFrameElement | null => screen.queryByLabelText(FRAME, { selector: 'iframe' }) as HTMLIFrameElement | null;
let statusListener: StatusListener | null = null;

function pendingImport(): ExternalImport {
  return { data: new Blob(['bundle']), onReview: vi.fn(), onSettled: vi.fn() };
}

beforeEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  const installer = ArmariumInstaller.open(app as unknown as App, { review: vi.fn(), fetchList: async () => [], installed: async () => [] });
  vi.spyOn(installer, 'installedItems').mockResolvedValue([]);
  const onStatus = installer.onStatus.bind(installer);
  vi.spyOn(installer, 'onStatus').mockImplementation((listener) => {
    statusListener = listener;
    return onStatus(listener);
  });
});

afterEach(() => {
  cleanup();
  ArmariumInstaller.release(app as unknown as App);
  reviews.length = 0;
  busy.value = false;
  statusListener = null;
  Reflect.deleteProperty(window.navigator, 'onLine');
  vi.restoreAllMocks();
});

describe('the Armarium in the asset manager', () => {
  it('opens on the library, and on the store when the Armarium was asked for', () => {
    const { rerender } = render(<AssetManager isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Library')).toBeTruthy();
    expect(storeFrame()).toBeNull();

    rerender(<AssetManager isOpen={false} onClose={vi.fn()} />);
    rerender(<AssetManager isOpen onClose={vi.fn()} armariumRequest={1} />);
    expect(storeFrame()?.getAttribute('src')).toBe('https://atlas-vtt.dev/armarium');
    expect(screen.queryByText('Library')).toBeNull();
    expect(screen.getByRole('button', { name: 'Armarium' }).getAttribute('aria-current')).toBe('page');
  });

  it('is a place of the sidebar, left for the library by a tab, a tag or Back', () => {
    render(<AssetManager isOpen onClose={vi.fn()} />);
    for (const leave of ['Maps', 'forest', 'Back to the library']) {
      fireEvent.click(screen.getByRole('button', { name: 'Armarium' }));
      expect(storeFrame()).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: leave }));
      expect(storeFrame()).toBeNull();
      expect(screen.getByText('Library')).toBeTruthy();
    }
  });

  it('shows the store again when asked while open', () => {
    const { rerender } = render(<AssetManager isOpen onClose={vi.fn()} armariumRequest={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Maps' }));
    expect(storeFrame()).toBeNull();
    rerender(<AssetManager isOpen onClose={vi.fn()} armariumRequest={2} />);
    expect(storeFrame()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Maps' }));
    act(() => ArmariumHosts.forApp(app as unknown as App).current()!.show());
    expect(storeFrame()).not.toBeNull();
  });

  it('keeps the store\'s page while an install from it is reviewed, and tells it how the install stands', async () => {
    render(<AssetManager isOpen onClose={vi.fn()} armariumRequest={1} />);
    const frame = storeFrame()!;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);
    const pending = pendingImport();

    act(() => ArmariumHosts.forApp(app as unknown as App).current()!.review(pending));
    expect(reviews).toEqual([pending]);
    expect(screen.getByRole('dialog', { name: 'Import review' })).toBeTruthy();
    expect(storeFrame()).toBe(frame);

    act(() => statusListener!({ uid: 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e', version: 5 }, 'reviewing'));
    expect(post).toHaveBeenCalledWith(
      { type: 'atlas-armarium:status', format: 1, uid: 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e', version: 5, state: 'reviewing' },
      'https://atlas-vtt.dev',
    );
    expect(pending.onSettled).not.toHaveBeenCalled();
  });

  it('cancels an install whose review had not started when the window closed', () => {
    const { rerender } = render(<AssetManager isOpen onClose={vi.fn()} armariumRequest={1} />);
    busy.value = true;
    const waiting = pendingImport();
    act(() => ArmariumHosts.forApp(app as unknown as App).current()!.review(waiting));
    expect(reviews).toEqual([]);
    expect(waiting.onSettled).not.toHaveBeenCalled();

    rerender(<AssetManager isOpen={false} onClose={vi.fn()} />);
    expect(waiting.onSettled).toHaveBeenCalledWith({ kind: 'cancelled' });
    expect(ArmariumHosts.forApp(app as unknown as App).current()).toBeNull();

    busy.value = false;
    rerender(<AssetManager isOpen onClose={vi.fn()} />);
    expect(reviews).toEqual([]);
  });

  it('takes the store out as the window starts to close, while the window is still leaving', () => {
    const { rerender } = render(<AssetManager isOpen onClose={vi.fn()} armariumRequest={1} />);
    expect(storeFrame()).not.toBeNull();
    rerender(<AssetManager isOpen={false} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Back to the library' })).toBeTruthy();
    expect(storeFrame()).toBeNull();
  });

  it('loads the page anew from Reload', () => {
    render(<AssetManager isOpen onClose={vi.fn()} armariumRequest={1} />);
    const frame = storeFrame();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(storeFrame()).not.toBe(frame);
    expect(screen.getByText('Loading the Armarium')).toBeTruthy();
  });
});
