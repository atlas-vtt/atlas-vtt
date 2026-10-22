// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPERIMENTAL_FEATURES, experimentalFeatureOn } from '../../src/app/experimental/experimentalFeatures';
import { ExperimentalFeaturesPanel } from '../../src/app/react/components/command-palette/ExperimentalFeaturesPanel';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { App } from 'obsidian';
import { memoryPluginData } from '../mocks/pluginData';

/** Settings whose plugin data holds `stored`, read. */
async function settingsFrom(stored: unknown): Promise<SettingsService> {
  const settings = new SettingsService(new App(), undefined, memoryPluginData(stored));
  await settings.initialize();
  return settings;
}

// A switched feature schedules a save; the tests end before it runs.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('experimental features in the settings', () => {
  it('are all off until the GM switches them on', async () => {
    const settings = await settingsFrom({});
    for (const { id } of EXPERIMENTAL_FEATURES) expect(settings.isExperimentalOn(id)).toBe(false);
  });

  it('are off in a vault whose settings cannot be reached', () => {
    expect(experimentalFeatureOn(undefined, 'statblockEditor')).toBe(false);
    expect(experimentalFeatureOn(createInMemoryApp({ files: {} }).app, 'statblockEditor')).toBe(false);
  });

  it('are on where the file says so, and off for anything else it holds', async () => {
    expect((await settingsFrom({ experimental: { statblockEditor: true } })).isExperimentalOn('statblockEditor')).toBe(true);
    for (const experimental of [null, 'all', [], { statblockEditor: 'yes' }, { statblockEditor: 1 }]) {
      expect((await settingsFrom({ experimental })).isExperimentalOn('statblockEditor')).toBe(false);
    }
  });

  it('read the switch of a feature that is no longer experimental as nothing, and keep it in the file', async () => {
    const settings = await settingsFrom({ experimental: { dynamicLighting: true, statblockEditor: true } });
    expect(EXPERIMENTAL_FEATURES.map(({ id }) => id)).not.toContain('dynamicLighting');
    expect(settings.isExperimentalOn('statblockEditor')).toBe(true);
    expect(settings.getAllSettings().experimental).toEqual({ dynamicLighting: true, statblockEditor: true });
  });

  it('tell their listeners when one is switched, and only then', async () => {
    const settings = await settingsFrom({});
    const heard = vi.fn();
    settings.onChange(heard);
    settings.setExperimental('statblockEditor', false);
    expect(heard).not.toHaveBeenCalled();
    settings.setExperimental('statblockEditor', true);
    expect(heard).toHaveBeenCalledOnce();
    expect(settings.isExperimentalOn('statblockEditor')).toBe(true);
    expect(settings.getAllSettings().experimental).toEqual({ statblockEditor: true });
  });
});

describe('the command palette\'s Experimental features page', () => {
  it('switches a feature on and off, and has no switch for dynamic lighting', async () => {
    const { app } = createInMemoryApp({ files: {} });
    const settings = new SettingsService(app);
    await settings.initialize();
    render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <ExperimentalFeaturesPanel />
      </AtlasUIContext.Provider>,
    );
    expect(screen.queryByRole('switch', { name: 'Dynamic lighting' })).toBeNull();
    const toggle = screen.getByRole('switch', { name: 'Statblock editor' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(settings.isExperimentalOn('statblockEditor')).toBe(true);
    expect(screen.getByRole('switch', { name: 'Statblock editor' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('switch', { name: 'Statblock editor' }));
    expect(settings.isExperimentalOn('statblockEditor')).toBe(false);
  });
});
