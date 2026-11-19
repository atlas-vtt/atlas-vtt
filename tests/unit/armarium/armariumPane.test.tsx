// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { ArmariumInstaller, type StatusListener } from '../../../src/app/armarium/ArmariumInstaller';
import { ArmariumPane } from '../../../src/app/armarium/ArmariumPane';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ hide: vi.fn() })) }));

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
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'atlas-armarium:installed', format: 1, items: [{ uid: UID, version: 4 }], features: [] }, 'https://atlas-vtt.dev'));

    post.mockClear();
    act(() => statusListener!({ uid: UID, version: 5 }, 'installed'));
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls).toEqual([
      [{ type: 'atlas-armarium:status', format: 1, uid: UID, version: 5, state: 'installed' }, 'https://atlas-vtt.dev'],
      [{ type: 'atlas-armarium:installed', format: 1, items: [{ uid: UID, version: 4 }], features: [] }, 'https://atlas-vtt.dev'],
    ]);
  });

  it('says it shares from the vault and opens its own share when its page asks, and only then', async () => {
    const onShare = vi.fn();
    const { frame } = renderPane(onShare);
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);
    fromPage({ type: 'atlas-armarium:hello', format: 1 }, frame.contentWindow);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'atlas-armarium:installed', features: ['share'] }), 'https://atlas-vtt.dev'));

    fromPage({ type: 'atlas-armarium:share', format: 1 }, window);
    fromPage({ type: 'atlas-armarium:share', format: 1 }, frame.contentWindow, 'https://evil.example');
    expect(onShare).not.toHaveBeenCalled();
    fromPage({ type: 'atlas-armarium:share', format: 1 }, frame.contentWindow);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(installer.install).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    const { frame, unmount } = renderPane();
    const contentWindow = frame.contentWindow;
    unmount();

    fromPage({ type: 'atlas-armarium:install', format: 1, uid: UID, version: 5 }, contentWindow);
    expect(installer.install).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
  });
});
