import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { hotkeyFromEvent, formatHotkey, matchesHotkey, canRunMapHotkeys, canShareHotkey, availableHotkeys, MAP_HOTKEYS } from '../../src/app/keyboard/mapHotkeys';
import { handledByAnotherControl, noteTooltipDismissal } from '../../src/app/keyboard/tooltipEscape';
import { App } from 'obsidian';
import { memoryPluginData } from '../mocks/pluginData';

function service() {
  const app = new App();
  const data = memoryPluginData();
  return { settings: new SettingsService(app, undefined, data), app, data };
}
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('map hotkeys', () => {
  it.each([
    ['widget1', '1'], ['widget2', '2'], ['widget3', '3'], ['widget4', '4'], ['widget5', '5'],
    ['increase', '+'], ['increaseAlt', '='], ['decrease', '-'],
    ['timerPlayPause', 'Space'], ['timerReset', 'r'],
  ] as const)('offers %s only to the GM, with its existing default key', (id, defaultKey) => {
    expect(availableHotkeys(false).find(action => action.id === id)).toMatchObject({ id, defaultKey });
    expect(availableHotkeys(true).some(action => action.id === id)).toBe(false);
  });

  it('formats letter bindings without changing named keys', () => {
    expect(formatHotkey('Enter')).toBe('Enter');
    expect(formatHotkey('Space')).toBe('Space');
    expect(formatHotkey('Mod+Shift+z')).toBe('Ctrl/Cmd + Shift + Z');
  });
  it('persists single-key bindings and tutorial progress across reloads', async () => {
    const { settings, app, data } = service();
    await settings.initialize();
    settings.setHotkey('assets', 'q');
    settings.completeTutorial('assets');
    settings.markTokenImported();
    await settings.saveSettingsNow();
    const reloaded = new SettingsService(app, undefined, data);
    await reloaded.initialize();
    expect(reloaded.getHotkeys().assets).toBe('q');
    expect(reloaded.shouldShowTutorial('assets')).toBe(false);
    expect(reloaded.shouldShowTutorial('tokenStatblocks')).toBe(true);
    expect(reloaded.getSetting('onboarding').tokenImported).toBe(true);
    expect(reloaded.getHotkeys().palette).toBe('Space');
  });
  it('allows bindings reserved only by disabled tools', () => {
    const { settings } = service();
    expect(() => settings.setHotkey('assets', 's')).not.toThrow();
  });
  it('rejects collisions, allows clearing, and resets bindings', () => {
    const { settings } = service();
    expect(() => settings.setHotkey('assets', 'v')).toThrow(/Move/);
    expect(settings.getHotkeys().assets).toBe('a');
    settings.setHotkey('move', '');
    settings.setHotkey('assets', 'v');
    settings.resetHotkeys();
    expect(settings.getHotkeys().assets).toBe('a');
    expect(settings.getHotkeys().move).toBe('v');
  });
  it('normalizes punctuation, modifier chords and shifted digits', () => {
    expect(hotkeyFromEvent(new KeyboardEvent('keydown', { key: '?', code: 'Slash', shiftKey: true }))).toBe('?');
    expect(hotkeyFromEvent(new KeyboardEvent('keydown', { key: '!', code: 'Digit1', shiftKey: true }))).toBe('Shift+1');
    expect(hotkeyFromEvent(new KeyboardEvent('keydown', { key: 'A', ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+a');
    // Another script's letter counts as the Latin letter on the same physical key
    expect(hotkeyFromEvent(new KeyboardEvent('keydown', { key: 'ф', code: 'KeyA' }))).toBe('a');
    expect(hotkeyFromEvent(new KeyboardEvent('keydown', { key: 'Я', code: 'KeyZ', ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+z');
    expect(matchesHotkey(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }), 'v')).toBe(false);
    expect(matchesHotkey(new KeyboardEvent('keydown', { key: ' ' }), 'Space')).toBe(true);
    expect(matchesHotkey(new KeyboardEvent('keydown', { key: 'v', repeat: true }), 'v')).toBe(false);
    expect(matchesHotkey(new KeyboardEvent('keydown', { key: 'v', isComposing: true }), 'v')).toBe(false);
  });
  it('scopes shortcuts to the active map and blocks editable content and overlays', () => {
    document.body.innerHTML = '<div class="workspace-leaf mod-active"><div data-view-id="map-one"></div></div>';
    const event = new KeyboardEvent('keydown', { key: 'v' });
    expect(canRunMapHotkeys(event, 'map-one')).toBe(true);
    expect(canRunMapHotkeys(event, 'map-two')).toBe(false);
    const input = document.createElement('input'); document.body.append(input);
    input.dispatchEvent(event);
    expect(canRunMapHotkeys(event, 'map-one')).toBe(false);
    const modal = document.createElement('div'); modal.className = 'atlas-asset-manager-modal'; document.body.append(modal);
    expect(canRunMapHotkeys(new KeyboardEvent('keydown'), 'map-one')).toBe(false);
  });
  it('runs for an Escape a tooltip took to close itself, and not for one a control used', () => {
    document.body.innerHTML = '<div class="workspace-leaf mod-active"><div data-view-id="map-one"></div></div>';
    const escape = (): KeyboardEvent => new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    // A tooltip closes on Escape and prevents the key's default, as a list that closes itself does.
    const byTooltip = escape();
    noteTooltipDismissal(byTooltip);
    byTooltip.preventDefault();
    expect(byTooltip.defaultPrevented).toBe(true);
    expect(handledByAnotherControl(byTooltip)).toBe(false);
    expect(canRunMapHotkeys(byTooltip, 'map-one')).toBe(true);
    const byControl = escape();
    byControl.preventDefault();
    expect(handledByAnotherControl(byControl)).toBe(true);
    expect(canRunMapHotkeys(byControl, 'map-one')).toBe(false);
    expect(handledByAnotherControl(escape())).toBe(false);
  });
  it('has no conflicting default bindings', () => {
    const clashes = MAP_HOTKEYS.flatMap((a, i) => MAP_HOTKEYS.slice(i + 1)
      .filter(b => a.defaultKey === b.defaultKey && !canShareHotkey(a.id, b.id))
      .map(b => `${a.id}/${b.id}`));
    expect(clashes).toEqual([]);
  });
  it('lets held-widget keys share a key with map shortcuts but not with each other or the number keys', () => {
    const { settings } = service();
    expect(settings.getHotkeys().timerPlayPause).toBe(settings.getHotkeys().palette);
    expect(settings.getHotkeys().timerReset).toBe(settings.getHotkeys().diceTray);
    expect(() => settings.setHotkey('timerReset', 'm')).not.toThrow();
    expect(() => settings.setHotkey('timerReset', '-')).toThrow(/Decrease/);
    expect(() => settings.setHotkey('timerReset', '3')).toThrow(/widget 3/);
  });
  it('replays tutorials without losing hotkeys and does not share progress across vaults', () => {
    const { settings } = service(); settings.completeTutorial('palette');
    expect(service().settings.shouldShowTutorial('palette')).toBe(true);
    settings.setHotkey('assets', 'q'); settings.resetTutorials();
    expect(settings.shouldShowTutorial('palette')).toBe(true);
    expect(settings.getHotkeys().assets).toBe('q');
  });
});
