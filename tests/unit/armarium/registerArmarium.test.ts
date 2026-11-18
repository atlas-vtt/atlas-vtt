import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App, Command, ObsidianProtocolData, Plugin } from 'obsidian';
import { showNotice } from '../../../src/app/ui/notice';
import { ArmariumInstaller } from '../../../src/app/armarium/ArmariumInstaller';
import { ArmariumHosts } from '../../../src/app/armarium/armariumHosts';
import { FORMER_ARMARIUM_TAB, INSTALL_LINK_ACTION, registerArmarium } from '../../../src/app/plugin/armarium';
import type { GlobalAssetManagerService } from '../../../src/app/services/GlobalAssetManagerService';
import type { ExternalImport } from '../../../src/app/services/collectionBundle/externalImport';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ hide: vi.fn() })) }));

const UID = 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e';

function globalManager() {
  return { openArmarium: vi.fn(), importBundle: vi.fn() };
}

function registered(manager?: ReturnType<typeof globalManager>) {
  const layoutReady: (() => void)[] = [];
  const workspace = { onLayoutReady: (callback: () => void) => layoutReady.push(callback), detachLeavesOfType: vi.fn() };
  const app = { workspace } as unknown as App;
  const handlers = new Map<string, (params: ObsidianProtocolData) => void>();
  const cleanups: (() => unknown)[] = [];
  const plugin = {
    app,
    register: (cleanup: () => unknown) => cleanups.push(cleanup),
    registerView: vi.fn(),
    addCommand: vi.fn(),
    registerObsidianProtocolHandler: (action: string, handler: (params: ObsidianProtocolData) => void) => handlers.set(action, handler),
  } as unknown as Plugin;
  registerArmarium(plugin, () => manager as unknown as GlobalAssetManagerService | undefined);
  const command = vi.mocked(plugin.addCommand).mock.calls[0]![0] as Command;
  return {
    app,
    plugin,
    workspace,
    command,
    layoutReady: () => layoutReady.forEach((callback) => callback()),
    link: handlers.get(INSTALL_LINK_ACTION)!,
    unload: () => cleanups.forEach((cleanup) => cleanup()),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('registering the Armarium', () => {
  it('registers its command and no view, and releases its installer on unload', () => {
    const { app, plugin, command, unload } = registered();
    expect(plugin.registerView).not.toHaveBeenCalled();
    expect(command).toMatchObject({ id: 'open-armarium', name: 'Open the Armarium' });
    expect(ArmariumInstaller.forApp(app)).not.toBeNull();
    unload();
    expect(ArmariumInstaller.forApp(app)).toBeNull();
  });

  it('closes the Armarium tabs a workspace saved by an earlier build', () => {
    const { workspace, layoutReady, unload } = registered();
    layoutReady();
    expect(FORMER_ARMARIUM_TAB).toBe('atlas-armarium');
    expect(workspace.detachLeavesOfType).toHaveBeenCalledWith('atlas-armarium');
    unload();
  });

  it('opens the global asset manager on the Armarium while no asset manager is open', () => {
    const manager = globalManager();
    const { command, unload } = registered(manager);
    command.callback!();
    expect(manager.openArmarium).toHaveBeenCalledTimes(1);
    unload();
  });

  it('shows the Armarium in the asset manager that is open, and reviews its installs there', () => {
    const manager = globalManager();
    const { app, command, unload } = registered(manager);
    const open = { show: vi.fn(), review: vi.fn() };
    const detach = ArmariumHosts.forApp(app).attach(open);

    command.callback!();
    expect(open.show).toHaveBeenCalledTimes(1);
    expect(manager.openArmarium).not.toHaveBeenCalled();

    detach();
    command.callback!();
    expect(manager.openArmarium).toHaveBeenCalledTimes(1);
    unload();
  });

  it('opens the Armarium for the obsidian:// link and starts the install, which the review still has to be confirmed in', () => {
    const manager = globalManager();
    const { app, link, unload } = registered(manager);
    const install = vi.spyOn(ArmariumInstaller.forApp(app)!, 'install').mockResolvedValue(undefined);

    link({ action: INSTALL_LINK_ACTION, uid: UID, version: '5' });
    expect(manager.openArmarium).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith({ uid: UID, version: 5 });

    link({ action: INSTALL_LINK_ACTION, uid: UID });
    expect(install).toHaveBeenCalledTimes(1);
    expect(manager.openArmarium).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenCalledWith('This install link is incomplete. Open the collection in the Armarium and try again.');
    unload();
  });

  it('hands a download to the newest open asset manager for its review, else to the global one', async () => {
    const opened = vi.spyOn(ArmariumInstaller, 'open');
    const manager = globalManager();
    const { app, unload } = registered(manager);
    const { review } = opened.mock.calls[0]![1];
    const pending: ExternalImport = { data: new Blob(), onReview: vi.fn(), onSettled: vi.fn() };

    const older = { show: vi.fn(), review: vi.fn() };
    const newer = { show: vi.fn(), review: vi.fn() };
    const detachOlder = ArmariumHosts.forApp(app).attach(older);
    const detachNewer = ArmariumHosts.forApp(app).attach(newer);
    review(pending);
    expect(newer.review).toHaveBeenCalledWith(pending);
    expect(older.review).not.toHaveBeenCalled();

    detachNewer();
    detachOlder();
    review(pending);
    expect(manager.importBundle).toHaveBeenCalledWith(pending);
    unload();
  });
});
