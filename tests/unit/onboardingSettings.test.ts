// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { App, Setting } from 'obsidian';
import { SettingsService, TUTORIAL_IDS } from '../../src/app/services/SettingsService';
import { onboardingSettingsSection } from '../../src/app/settings/hotkeySettingsSection';
import { memoryPluginData } from '../mocks/pluginData';

const data = memoryPluginData();

function service(): SettingsService {
  data.set(null);
  return new SettingsService(new App(), undefined, data);
}

/** The Reset tutorials row, rendered like Atlas' settings tab does. */
function resetRow(settings: SettingsService): { setting: Setting; button: HTMLButtonElement; cleanup: () => void } {
  const row = onboardingSettingsSection(settings).rows.find((entry) => entry.name === 'Reset tutorials');
  if (!row) throw new Error('no Reset tutorials row');
  const setting = new Setting(document.createElement('div'));
  const cleanup = row.render(setting) ?? ((): void => undefined);
  const button = setting.controlEl.querySelector('button');
  if (!button) throw new Error('no button');
  return { setting, button, cleanup };
}

describe('resetting tutorials', () => {
  it('has nothing to reset before any tutorial was finished or skipped', () => {
    const { button, setting } = resetRow(service());
    expect(button.disabled).toBe(true);
    expect(setting.descEl.textContent).toContain('first time you open its feature');
  });

  it('counts finished and skipped tutorials, and follows them while open', () => {
    const settings = service();
    const { button, setting, cleanup } = resetRow(settings);
    settings.completeTutorial('assets');
    settings.completeTutorial('lootRoller');

    expect(button.disabled).toBe(false);
    expect(setting.descEl.textContent).toContain(`2 of ${TUTORIAL_IDS.length} tutorials`);
    cleanup();
  });

  it('shows every tutorial again, and turns tutorials back on', () => {
    const settings = service();
    settings.setSetting('onboarding', { ...settings.getSetting('onboarding'), enabled: false });
    settings.completeTutorial('lootSettings');
    const { button } = resetRow(settings);

    button.click();
    expect(TUTORIAL_IDS.every((id) => settings.shouldShowTutorial(id))).toBe(true);
    expect(button.disabled).toBe(true);
  });

  it('keeps a skipped tutorial hidden after Obsidian restarts', async () => {
    const settings = service();
    await settings.initialize();
    settings.completeTutorial('lootResults');
    await settings.saveSettingsNow();

    const restarted = new SettingsService(new App(), undefined, data);
    await restarted.initialize();
    expect(restarted.shouldShowTutorial('lootResults')).toBe(false);
    expect(restarted.shouldShowTutorial('lootRoller')).toBe(true);
  });
});
