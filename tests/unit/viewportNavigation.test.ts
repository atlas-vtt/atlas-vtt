import { afterEach, describe, expect, it } from 'vitest';
import { Viewport } from 'pixi-viewport';
import type { EventSystem } from 'pixi.js';
import { applyNavigationMode, bindViewportNavigation } from '../../src/app/pixi/viewportNavigation';
import { SmoothWheelZoom } from '../../src/app/pixi/SmoothWheelZoom';
import { App } from 'obsidian';
import { SettingsService } from '../../src/app/services/SettingsService';
import { INPUT_MODE_STORAGE_KEY } from '../../src/app/services/deviceSettings';

function createMockApp() {
  return {
    vault: {
      adapter: {
        exists: async () => false,
        read: async () => '{}',
        write: async () => undefined,
        mkdir: async () => undefined,
      },
    },
  } as any;
}

const viewports: Viewport[] = [];

function createViewport(): Viewport {
  const viewport = new Viewport({ noTicker: true, events: { domElement: createEl('canvas') } as EventSystem });
  viewports.push(viewport);
  return viewport;
}

function wheelOptions(viewport: Viewport): { wheelZoom: boolean; trackpadPinch: boolean } {
  const wheel = viewport.plugins.get<SmoothWheelZoom>('wheel');
  expect(wheel).toBeInstanceOf(SmoothWheelZoom);
  return { wheelZoom: wheel!.options.wheelZoom, trackpadPinch: wheel!.options.trackpadPinch };
}

afterEach(() => {
  viewports.splice(0).forEach(viewport => viewport.destroy());
});

describe('applyNavigationMode', () => {
  it('lets the wheel zoom in mouse mode', () => {
    const viewport = createViewport();
    applyNavigationMode(viewport, 'mouse');
    expect(wheelOptions(viewport)).toEqual({ wheelZoom: true, trackpadPinch: false });
  });

  it('leaves plain scroll to the drag plugin and zooms on pinch in trackpad mode', () => {
    const viewport = createViewport();
    applyNavigationMode(viewport, 'trackpad');
    expect(wheelOptions(viewport)).toEqual({ wheelZoom: false, trackpadPinch: true });
  });
});

describe('bindViewportNavigation', () => {
  it('applies the stored mode immediately and follows later changes', () => {
    const settings = new SettingsService(createMockApp());
    settings.setNavigationSettings({ inputMode: 'mouse' });
    const viewport = createViewport();

    const unbind = bindViewportNavigation(viewport, settings);
    expect(wheelOptions(viewport)).toEqual({ wheelZoom: true, trackpadPinch: false });

    settings.setNavigationSettings({ inputMode: 'trackpad' });
    expect(wheelOptions(viewport)).toEqual({ wheelZoom: false, trackpadPinch: true });

    unbind();
    settings.setNavigationSettings({ inputMode: 'mouse' });
    expect(wheelOptions(viewport)).toEqual({ wheelZoom: false, trackpadPinch: true });
  });

  it('takes the stored mode when the settings finish loading after the viewport was bound', async () => {
    let finishMigration!: () => void;
    const storageReady = new Promise<void>((resolve) => { finishMigration = resolve; });
    const app = new App();
    const settings = new SettingsService(app, storageReady);
    settings.setNavigationSettings({ inputMode: 'trackpad' });
    // The startup migration carries this device's mode over from the old settings file.
    app.saveLocalStorage(INPUT_MODE_STORAGE_KEY, 'mouse');
    const viewport = createViewport();

    // A map tab restored at startup binds while the service still holds the defaults.
    bindViewportNavigation(viewport, settings);
    expect(wheelOptions(viewport)).toEqual({ wheelZoom: false, trackpadPinch: true });

    finishMigration();
    await settings.initialize();
    expect(wheelOptions(viewport)).toEqual({ wheelZoom: true, trackpadPinch: false });
  });

  it('ignores settings changes that do not alter the navigation mode', () => {
    const settings = new SettingsService(createMockApp());
    const viewport = createViewport();

    bindViewportNavigation(viewport, settings);
    const installed = viewport.plugins.get('wheel');
    settings.setLocalPlayerViewSettings({ showWidgets: false });

    expect(viewport.plugins.get('wheel')).toBe(installed);
  });
});
