// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { GraphicsPanel } from '../../src/app/react/components/command-palette/GraphicsPanel';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { memoryPluginData } from '../mocks/pluginData';

afterEach(cleanup);

/** The page over settings of their own, chosen `high` so no device pick is asked for. */
async function openPage(): Promise<SettingsService> {
  const app = new App();
  const settings = new SettingsService(app, undefined, memoryPluginData({}));
  await settings.initialize();
  settings.setLightingQuality('high');
  render(
    <AtlasUIContext.Provider value={{ app } as unknown as AtlasUIContextValue}>
      <GraphicsPanel />
    </AtlasUIContext.Provider>,
  );
  return settings;
}

describe('the Graphics page', () => {
  it('shows the presets as tabs and every knob as a row, and a preset tab sets every knob', async () => {
    const settings = await openPage();
    expect(screen.getAllByRole('radiogroup').length).toBeGreaterThanOrEqual(8);
    const presets = within(screen.getByRole('radiogroup', { name: 'Quality' }));
    expect(presets.getByRole('radio', { name: 'High' })?.getAttribute('aria-checked')).toBe('true');
    expect(presets.getByRole('radio', { name: 'Custom' })?.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(presets.getByRole('radio', { name: 'Saver' }));
    expect(settings.getGraphics()).toEqual({ preset: 'saver', overrides: {} });
    expect(settings.getGraphicsQuality()).toMatchObject({ picture: 'polygons', liquidFps: 10 });
  });

  it('lights Custom when one knob is set away from the preset, and greys the traced knobs under the polygon picture', async () => {
    const settings = await openPage();
    const presets = within(screen.getByRole('radiogroup', { name: 'Quality' }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Water and lava' })).getByRole('radio', { name: 'Medium' }));
    expect(settings.getGraphics()).toEqual({ preset: 'high', overrides: { liquids: 15 } });
    expect(presets.getByRole('radio', { name: 'Custom' })?.getAttribute('aria-checked')).toBe('true');
    expect(presets.getByRole('radio', { name: 'Custom' })?.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Ray tracing' })).getByRole('radio', { name: 'Off' }));
    expect(screen.getByRole('radiogroup', { name: 'Bounced light' })?.getAttribute('aria-disabled')).toBe('true');
    expect(settings.getGraphicsQuality()).toEqual({ picture: 'polygons', maxTexels: 4096, liquidFps: 15 });
  });
});
