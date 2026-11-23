// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { ArmariumInstaller, type StatusListener } from '../../../src/app/armarium/ArmariumInstaller';
import { ArmariumPane } from '../../../src/app/armarium/ArmariumPane';
import { StoreTagFilter } from '../../../src/app/armarium/storeTagFilter';
import { armariumAccountPort, type ArmariumAccountPort } from '../../../src/app/armarium/armariumAccountPort';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ hide: vi.fn() })) }));
vi.mock('../../../src/app/armarium/armariumAccountPort', () => ({ armariumAccountPort: vi.fn(() => null) }));

const UID = 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e';
const app = { workspace: {} } as unknown as App;
let installer: ArmariumInstaller;
let statusListener: StatusListener | null;

function renderPane(onShare?: () => void): { frame: HTMLIFrameElement; unmount: () => void } {
  const { unmount } = render(<ArmariumPane app={app} onShare={onShare} />);
  return { frame: screen.getByLabelText('The Armarium, Atlas\' library of collections', { selector: 'iframe' }) as HTMLIFrameElement, unmount };
}

/** A message as the frame's page would send it. */
function fromPage(data: unknown, source: MessageEventSource | null, origin = 'https://atlas-vtt.dev'): void {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data, origin, source })); });
}

beforeEach(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  statusListener = null;
  installer = ArmariumInstaller.open(app, { review: vi.fn(), fetchList: async () => [], installed: async () => [{ uid: UID, version: 4 }] });
  vi.spyOn(installer, 'install').mockResolvedValue(undefined);
  vi.spyOn(installer, 'installedItems').mockResolvedValue([{ uid: UID, version: 4 }]);
  const onStatus = installer.onStatus.bind(installer);
  vi.spyOn(installer, 'onStatus').mockImplementation((listener) => {
    statusListener = listener;
    return onStatus(listener);
  });
});

afterEach(() => {
  ArmariumInstaller.release(app);
  cleanup();
  Reflect.deleteProperty(window.navigator, 'onLine');
  vi.restoreAllMocks();
});

describe('the Armarium pane', () => {
  it('frames the store in a sandbox, with a skeleton until the page has loaded', () => {
    const { frame } = renderPane();

    expect(frame.getAttribute('src')).toBe('https://atlas-vtt.dev/armarium');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(frame.hasAttribute('title')).toBe(false);
    expect(screen.getByText('Loading the Armarium')).toBeTruthy();

    act(() => { frame.dispatchEvent(new Event('load')); });
    expect(screen.queryByText('Loading the Armarium')).toBeNull();
  });

  it('shows the page once it says hello, before it has loaded, and only for its own frame', () => {
    const { frame } = renderPane();
    fromPage({ type: 'atlas-armarium:hello', format: 1 }, window);
    fromPage({ type: 'atlas-armarium:hello', format: 1 }, frame.contentWindow, 'https://evil.example');
    expect(screen.getByText('Loading the Armarium')).toBeTruthy();

    fromPage({ type: 'atlas-armarium:hello', format: 1 }, frame.contentWindow);
    expect(screen.queryByText('Loading the Armarium')).toBeNull();
    expect(frame.classList.contains('is-loaded')).toBe(true);
  });

  it('reads what the vault holds while the page loads, so the hello is answered with that read', async () => {
    const { frame } = renderPane();
    expect(installer.installedItems).toHaveBeenCalledTimes(1);
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);

    fromPage({ type: 'atlas-armarium:hello', format: 1 }, frame.contentWindow);
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(installer.installedItems).toHaveBeenCalledTimes(1);

    fromPage({ type: 'atlas-armarium:hello', format: 1 }, frame.contentWindow);
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(installer.installedItems).toHaveBeenCalledTimes(2);
  });

  it('hidden, keeps its page, takes no input and still tells the page where installs stand', () => {
    const { rerender } = render(<ArmariumPane app={app} />);
    const frame = screen.getByLabelText('The Armarium, Atlas\' library of collections', { selector: 'iframe' }) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);

    rerender(<ArmariumPane app={app} shown={false} />);
    const pane = frame.closest('.atlas-armarium-pane')!;
    expect(pane.classList.contains('is-hidden')).toBe(true);
    expect(pane.hasAttribute('inert')).toBe(true);
    expect(screen.getByLabelText('The Armarium, Atlas\' library of collections', { selector: 'iframe' })).toBe(frame);

    act(() => statusListener!({ uid: UID, version: 5 }, 'downloading'));
    expect(post).toHaveBeenCalledWith({ type: 'atlas-armarium:status', format: 1, uid: UID, version: 5, state: 'downloading' }, 'https://atlas-vtt.dev');
  });

  it('installs what its own page asks for, and nothing another page or frame sends', () => {
    const { frame } = renderPane();
    const install = { type: 'atlas-armarium:install', format: 1, uid: UID, version: 5 };

    fromPage(install, window, 'https://atlas-vtt.dev');
    fromPage(install, frame.contentWindow, 'https://evil.example');
    fromPage({ ...install, version: '5' }, frame.contentWindow);
    expect(installer.install).not.toHaveBeenCalled();

    fromPage(install, frame.contentWindow);
    expect(installer.install).toHaveBeenCalledWith({ uid: UID, version: 5 });
  });

  it('answers hello with what the vault holds, and tells the page where installs stand', async () => {
    const { frame } = renderPane();
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);

    fromPage({ type: 'atlas-armarium:hello', format: 1 }, frame.contentWindow);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'atlas-armarium:installed', format: 1, items: [{ uid: UID, version: 4 }], features: ['music'] }, 'https://atlas-vtt.dev'));

    post.mockClear();
    act(() => statusListener!({ uid: UID, version: 5 }, 'installed'));
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls).toEqual([
      [{ type: 'atlas-armarium:status', format: 1, uid: UID, version: 5, state: 'installed' }, 'https://atlas-vtt.dev'],
      [{ type: 'atlas-armarium:installed', format: 1, items: [{ uid: UID, version: 4 }], features: ['music'] }, 'https://atlas-vtt.dev'],
    ]);
  });

  it('says it shares from the vault and opens its own share when its page asks, and only then', async () => {
    const onShare = vi.fn();
    const { frame } = renderPane(onShare);
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);
    fromPage({ type: 'atlas-armarium:hello', format: 1 }, frame.contentWindow);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'atlas-armarium:installed', features: ['music', 'share', 'share-items', 'share-music'] }), 'https://atlas-vtt.dev'));

    fromPage({ type: 'atlas-armarium:share', format: 1 }, window);
    fromPage({ type: 'atlas-armarium:share', format: 1 }, frame.contentWindow, 'https://evil.example');
    expect(onShare).not.toHaveBeenCalled();
    fromPage({ type: 'atlas-armarium:share', format: 1 }, frame.contentWindow);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenLastCalledWith({ what: 'collection' });
    fromPage({ type: 'atlas-armarium:share', format: 1, what: 'dice-set' }, frame.contentWindow);
    expect(onShare).toHaveBeenLastCalledWith({ what: 'dice-set' });
    fromPage({ type: 'atlas-armarium:share', format: 1, what: 'music-album', listing: 'a'.repeat(32) }, frame.contentWindow);
    expect(onShare).toHaveBeenLastCalledWith({ what: 'music-album', listing: 'a'.repeat(32) });
    fromPage({ type: 'atlas-armarium:share', format: 1, what: 'adventure-module' }, frame.contentWindow);
    expect(onShare).toHaveBeenCalledTimes(3);
    expect(installer.install).not.toHaveBeenCalled();
  });

  it("with Atlas' account, sends My uploads' requests for its page alone, signs in when asked and says when the account changed", async () => {
    let changed: (() => void) | null = null;
    const port: ArmariumAccountPort = {
      forward: vi.fn(async () => ({ status: 200, body: { listings: [] } })),
      signIn: vi.fn(),
      onChange: (listener) => {
        changed = listener;
        return () => { changed = null; };
      },
    };
    vi.mocked(armariumAccountPort).mockReturnValue(port);
    const { frame } = renderPane();
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);
    fromPage({ type: 'atlas-armarium:hello', format: 1 }, frame.contentWindow);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'atlas-armarium:installed', features: ['music', 'account'] }), 'https://atlas-vtt.dev'));

    const ask = { type: 'atlas-armarium:api', format: 1, id: 'r7', method: 'GET', path: '/v1/armarium/mine' };
    fromPage(ask, frame.contentWindow, 'https://evil.example');
    fromPage(ask, window);
    fromPage({ ...ask, method: 'POST', path: '/v1/armarium/uploads' }, frame.contentWindow);
    expect(port.forward).not.toHaveBeenCalled();
    fromPage(ask, frame.contentWindow);
    expect(port.forward).toHaveBeenCalledWith({ method: 'GET', path: '/mine' });
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'atlas-armarium:api-result', format: 1, id: 'r7', status: 200, body: { listings: [] } }, 'https://atlas-vtt.dev'));

    fromPage({ type: 'atlas-armarium:sign-in', format: 1 }, frame.contentWindow);
    expect(port.signIn).toHaveBeenCalledTimes(1);
    act(() => changed?.());
    expect(post).toHaveBeenCalledWith({ type: 'atlas-armarium:account', format: 1 }, 'https://atlas-vtt.dev');
    vi.mocked(armariumAccountPort).mockReturnValue(null);
  });

  it('stops listening once unmounted', () => {
    const { frame, unmount } = renderPane();
    const contentWindow = frame.contentWindow;
    unmount();

    fromPage({ type: 'atlas-armarium:install', format: 1, uid: UID, version: 5 }, contentWindow);
    expect(installer.install).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('with a tag filter, says it shows tags, hands the page\'s tags to the sidebar and the sidebar\'s presses to the page', async () => {
    const filter = new StoreTagFilter();
    const { unmount } = render(<ArmariumPane app={app} tagFilter={filter} />);
    const frame = screen.getByLabelText('The Armarium, Atlas\' library of collections', { selector: 'iframe' }) as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);
    expect(filter.snapshot()).toEqual({ status: 'waiting' });

    fromPage({ type: 'atlas-armarium:hello', format: 1 }, frame.contentWindow);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'atlas-armarium:installed', features: ['music', 'tags'] }), 'https://atlas-vtt.dev'));

    const tags = { groups: [{ id: 'place', label: 'Place', tags: [{ id: 'forest', label: 'Forest', count: 2 }] }], picked: [] };
    fromPage({ type: 'atlas-armarium:tags', format: 1, ...tags }, window);
    expect(filter.snapshot()).toEqual({ status: 'waiting' });
    fromPage({ type: 'atlas-armarium:tags', format: 1, ...tags }, frame.contentWindow);
    expect(filter.snapshot()).toEqual({ status: 'ready', tags });

    post.mockClear();
    filter.toggle('forest');
    filter.clear();
    expect(post.mock.calls).toEqual([
      [{ type: 'atlas-armarium:toggle-tag', format: 1, tag: 'forest' }, 'https://atlas-vtt.dev'],
      [{ type: 'atlas-armarium:clear-tags', format: 1 }, 'https://atlas-vtt.dev'],
    ]);

    unmount();
    expect(filter.snapshot()).toEqual({ status: 'waiting' });
    filter.toggle('forest');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('with a tag filter, says there are no tags once the page has not named them in time', () => {
    vi.useFakeTimers();
    try {
      const filter = new StoreTagFilter();
      render(<ArmariumPane app={app} tagFilter={filter} />);
      act(() => { vi.advanceTimersByTime(14_000); });
      expect(filter.snapshot()).toEqual({ status: 'waiting' });
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(filter.snapshot()).toEqual({ status: 'none' });
    } finally {
      vi.useRealTimers();
    }
  });
});
