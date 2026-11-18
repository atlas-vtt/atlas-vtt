import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ObsidianProtocolData, Plugin } from 'obsidian';
import { showNotice } from '../../../src/app/ui/notice';
import { ArmariumInstaller } from '../../../src/app/armarium/ArmariumInstaller';
import { INSTALL_LINK_ACTION, registerArmarium } from '../../../src/app/plugin/armarium';
import type { GlobalAssetManagerService } from '../../../src/app/services/GlobalAssetManagerService';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ hide: vi.fn() })) }));

const UID = 'da0b742f-d1fc-4f2a-9b0f-300d7e45538e';

function registered(manager?: GlobalAssetManagerService) {
  const app = {};
  const handlers = new Map<string, (params: ObsidianProtocolData) => void>();
  const cleanups: (() => unknown)[] = [];
  const plugin = {
    app,
    register: (cleanup: () => unknown) => cleanups.push(cleanup),
    registerView: vi.fn(),
    addCommand: vi.fn(),
    registerObsidianProtocolHandler: (action: string, handler: (params: ObsidianProtocolData) => void) => handlers.set(action, handler),
  } as unknown as Plugin;
  registerArmarium(plugin, () => manager);
  return { app, link: handlers.get(INSTALL_LINK_ACTION)!, unload: () => cleanups.forEach((cleanup) => cleanup()), plugin };
}

afterEach(() => vi.clearAllMocks());

describe('registering the Armarium', () => {
  it('registers its tab and command, and releases its installer on unload', () => {
    const { app, plugin, unload } = registered();
    expect(plugin.registerView).toHaveBeenCalledWith('atlas-armarium', expect.any(Function));
    expect(vi.mocked(plugin.addCommand).mock.calls[0]![0]).toMatchObject({ id: 'open-armarium', name: 'Open the Armarium' });
    expect(ArmariumInstaller.forApp(app as never)).not.toBeNull();
    unload();
    expect(ArmariumInstaller.forApp(app as never)).toBeNull();
  });

  it('starts an install from the obsidian:// link, which the review still has to be confirmed in', () => {
    const { app, link, unload } = registered();
    const install = vi.spyOn(ArmariumInstaller.forApp(app as never)!, 'install').mockResolvedValue(undefined);

    link({ action: INSTALL_LINK_ACTION, uid: UID, version: '5' });
    expect(install).toHaveBeenCalledWith({ uid: UID, version: 5 });

    link({ action: INSTALL_LINK_ACTION, uid: UID });
    expect(install).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenCalledWith('This install link is incomplete. Open the collection in the Armarium and try again.');
    unload();
  });
});
