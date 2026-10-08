import { describe, expect, it, vi } from 'vitest';

const sync = vi.hoisted(() => ({ made: 0, registered: [] as string[] }));
vi.mock('../../src/app/services/WidgetSyncService', () => ({
  WidgetSyncService: class {
    constructor() { sync.made++; }
    registerStore(viewId: string): void { sync.registered.push(viewId); }
    unregisterStore(): void {}
  },
}));

import { ServiceManager } from '../../src/app/services/ServiceManager';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

describe("the remote view's services", () => {
  it("never sync its widgets with this vault's collections, where a map view does", () => {
    const { app } = createInMemoryApp();
    const plugin = { settingsService: new SettingsService(app) } as { settingsService: SettingsService; widgetSyncService?: unknown };
    new ServiceManager(app, createViewAtlasStore(app, 'remote-1', undefined, false, { remote: true }), plugin as never, 'remote-1', { remote: true });
    expect(sync.made).toBe(0);
    expect(plugin.widgetSyncService).toBeUndefined();
    new ServiceManager(app, createViewAtlasStore(app, 'map-1'), plugin as never, 'map-1');
    expect(sync.registered).toEqual(['map-1']);
  });
});
