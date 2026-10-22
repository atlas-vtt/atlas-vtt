// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { App, Setting } from 'obsidian';
import { SettingsService } from '../../src/app/services/SettingsService';
import { hotkeySettingsSection } from '../../src/app/settings/hotkeySettingsSection';
import { memoryPluginData } from '../mocks/pluginData';

async function renderSection(stored?: object): Promise<{ settings: SettingsService; row: (name: string) => HTMLElement }> {
  const settings = new SettingsService(new App(), undefined, memoryPluginData(stored ?? null));
  await settings.initialize();
  const container = document.body.createDiv();
  for (const { name, desc, render } of hotkeySettingsSection(settings).rows) {
    const setting = new Setting(container).setName(name);
    if (desc) setting.setDesc(desc);
    render(setting);
  }
  const row = (name: string): HTMLElement =>
    [...container.querySelectorAll<HTMLElement>('.setting-item')].find(el => el.querySelector('.setting-item-name')?.textContent === name)!;
  return { settings, row };
}
const describedAs = (row: HTMLElement): string => row.querySelector('.setting-item-description')!.textContent ?? '';
const restoreButton = (row: HTMLElement): HTMLElement => row.querySelector<HTMLElement>('[aria-label="Restore default"]')!;
const recorded = (row: HTMLElement): string => row.querySelector('input')!.value;

afterEach(() => { document.body.empty(); });

describe('hotkey settings', () => {
  it('offers Restore default only for changed shortcuts and names their default', async () => {
    const { settings, row } = await renderSection();
    const assets = row('Asset manager');
    expect(describedAs(assets)).toBe('Map');
    expect(restoreButton(assets).style.display).toBe('none');

    settings.setHotkey('assets', 'q');
    expect(recorded(assets)).toBe('Q');
    expect(describedAs(assets)).toBe('Map · Default: A');
    expect(restoreButton(assets).style.display).toBe('');

    restoreButton(assets).click();
    expect(recorded(assets)).toBe('A');
    expect(describedAs(assets)).toBe('Map');
    expect(restoreButton(assets).style.display).toBe('none');
  });

  it('explains a default that lost its key to a shortcut the user assigned', async () => {
    const { row } = await renderSection({ hotkeys: { assets: 'v' } });
    const move = row('Move / selection tools');
    expect(recorded(move)).toBe('Unassigned');
    expect(move.querySelector('.atlas-hotkey-warning')?.textContent).toBe('Unassigned: its default, V, is assigned to Asset manager.');
    expect(restoreButton(move).style.display).toBe('');
  });

  it('refreshes every row when all hotkeys are reset', async () => {
    const { settings, row } = await renderSection();
    settings.setHotkey('assets', 'q');
    settings.resetHotkeys();
    expect(recorded(row('Asset manager'))).toBe('A');
    expect(describedAs(row('Asset manager'))).toBe('Map');
  });
});
