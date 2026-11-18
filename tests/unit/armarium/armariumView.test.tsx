// @vitest-environment jsdom
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { ArmariumInstaller, type StatusListener } from '../../../src/app/armarium/ArmariumInstaller';
import { ArmariumView } from '../../../src/app/armarium/ArmariumView';
import { ARMARIUM_VIEW_TYPE, showArmarium } from '../../../src/app/armarium/showArmarium';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ hide: vi.fn() })) }));

const UID = 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e';
const app = { workspace: {} } as unknown as App;
let installer: ArmariumInstaller;
let statusListener: StatusListener | null;
let view: ArmariumView | null;
const hosts: HTMLElement[] = [];

async function openView(): Promise<{ view: ArmariumView; frame: HTMLIFrameElement }> {
  const leafEl = document.body.createDiv({ cls: 'workspace-leaf' });
  hosts.push(leafEl);
  view = new ArmariumView({ app } as never);
  leafEl.append(view.containerEl);
  view.containerEl.append(view.contentEl);
  await act(async () => { await view!.onOpen(); });
  return { view, frame: screen.getByLabelText('The Armarium, Atlas\' library of collections', { selector: 'iframe' }) as HTMLIFrameElement };
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

afterEach(async () => {
  if (view) await act(async () => { await view!.onClose(); });
  view = null;
  ArmariumInstaller.release(app);
  cleanup();
  for (const host of hosts.splice(0)) host.remove();
  Reflect.deleteProperty(window.navigator, 'onLine');
  vi.restoreAllMocks();
});

describe('the Armarium tab', () => {
  it('frames the store in a sandbox, with a skeleton until the page has loaded', async () => {
    const { view: opened, frame } = await openView();

    expect(opened.getViewType()).toBe(ARMARIUM_VIEW_TYPE);
    expect(opened.getDisplayText()).toBe('Armarium');
    expect(frame.getAttribute('src')).toBe('https://atlas-vtt.dev/armarium');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(frame.hasAttribute('title')).toBe(false);
    expect(screen.getByText('Loading the Armarium')).toBeTruthy();

    act(() => { frame.dispatchEvent(new Event('load')); });
    expect(screen.queryByText('Loading the Armarium')).toBeNull();
  });

  it('installs what its own page asks for, and nothing another page or frame sends', async () => {
    const { frame } = await openView();
    const install = { type: 'atlas-armarium:install', format: 1, uid: UID, version: 5 };

    fromPage(install, window, 'https://atlas-vtt.dev');
    fromPage(install, frame.contentWindow, 'https://evil.example');
    fromPage({ ...install, version: '5' }, frame.contentWindow);
    expect(installer.install).not.toHaveBeenCalled();

    fromPage(install, frame.contentWindow);
    expect(installer.install).toHaveBeenCalledWith({ uid: UID, version: 5 });
  });

  it('answers hello with what the vault holds, and tells the page where installs stand', async () => {
    const { frame } = await openView();
    const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => undefined);

    fromPage({ type: 'atlas-armarium:hello', format: 1 }, frame.contentWindow);
    await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'atlas-armarium:installed', format: 1, items: [{ uid: UID, version: 4 }] }, 'https://atlas-vtt.dev'));

    post.mockClear();
    act(() => statusListener!({ uid: UID, version: 5 }, 'installed'));
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls).toEqual([
      [{ type: 'atlas-armarium:status', format: 1, uid: UID, version: 5, state: 'installed' }, 'https://atlas-vtt.dev'],
      [{ type: 'atlas-armarium:installed', format: 1, items: [{ uid: UID, version: 4 }] }, 'https://atlas-vtt.dev'],
    ]);
  });

  it('stops listening once closed', async () => {
    const { view: opened, frame } = await openView();
    const contentWindow = frame.contentWindow;
    await act(async () => { await opened.onClose(); });
    view = null;

    fromPage({ type: 'atlas-armarium:install', format: 1, uid: UID, version: 5 }, contentWindow);
    expect(installer.install).not.toHaveBeenCalled();
    expect(opened.contentEl.querySelector('iframe')).toBeNull();
  });

  it('loads the page anew from Reload', async () => {
    const { view: opened, frame } = await openView();
    act(() => { frame.dispatchEvent(new Event('load')); });
    const reload = opened.containerEl.querySelector<HTMLElement>('[aria-label="Reload"]')!;
    act(() => { reload.click(); });
    expect(screen.getByText('Loading the Armarium')).toBeTruthy();
  });
});

describe('opening the Armarium', () => {
  it('reveals the tab that is open instead of opening a second', async () => {
    const existing = { setViewState: vi.fn() };
    const workspace = { getLeavesOfType: vi.fn(() => [existing]), revealLeaf: vi.fn(async () => undefined), setActiveLeaf: vi.fn(), getLeaf: vi.fn() };
    await showArmarium({ workspace } as unknown as App);
    expect(workspace.getLeaf).not.toHaveBeenCalled();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
    expect(existing.setViewState).not.toHaveBeenCalled();

    const leaf = { setViewState: vi.fn(async () => undefined) };
    workspace.getLeavesOfType.mockReturnValue([]);
    workspace.getLeaf.mockReturnValue(leaf);
    await showArmarium({ workspace } as unknown as App);
    expect(workspace.getLeaf).toHaveBeenCalledWith('tab');
    expect(leaf.setViewState).toHaveBeenCalledWith({ type: ARMARIUM_VIEW_TYPE, active: true });
  });
});
