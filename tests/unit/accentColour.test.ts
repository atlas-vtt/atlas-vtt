import { expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { customAccent, onAccentChange, setAccent } from '../../src/app/appearance/accentColour';
import { COLOUR_PRESETS } from '../../src/app/appearance/colourPresets';

/** An app whose vault keeps its settings as Obsidian's does and announces each change. */
function appWithAccent(accent?: string): App {
  const config = new Map<string, unknown>(accent === undefined ? [] : [['accentColor', accent]]);
  const listeners = new Set<(key: string) => void>();
  const vault = {
    getConfig: (key: string) => config.get(key) ?? null,
    setConfig: vi.fn((key: string, value: unknown) => { config.set(key, value); listeners.forEach((listener) => listener(key)); }),
    on: (_name: string, callback: (key: string) => void) => { listeners.add(callback); return callback; },
    offref: (ref: (key: string) => void) => { listeners.delete(ref); },
  };
  return { vault } as unknown as App;
}

it('reads Obsidian\'s accent setting', () => {
  expect(customAccent(appWithAccent('#2a9d8f'))).toBe('#2a9d8f');
  expect(customAccent(appWithAccent(''))).toBe('');
  expect(customAccent(appWithAccent())).toBe('');
});

it('writes it and restores the look\'s own with an empty value', () => {
  const app = appWithAccent();
  const heard = vi.fn();
  const stop = onAccentChange(app, heard);
  setAccent(app, '#c0392b');
  expect(app.vault.setConfig).toHaveBeenCalledWith('accentColor', '#c0392b');
  expect(customAccent(app)).toBe('#c0392b');
  setAccent(app, '');
  expect(customAccent(app)).toBe('');
  expect(heard).toHaveBeenCalledTimes(2);
  stop();
  setAccent(app, '#6b8f3a');
  expect(heard).toHaveBeenCalledTimes(2);
});

it('lists eight presets with valid hex colours', () => {
  expect(COLOUR_PRESETS.map((preset) => preset.id)).toEqual(['crimson', 'ember', 'gold', 'moss', 'teal', 'azure', 'violet', 'rose']);
  for (const preset of COLOUR_PRESETS) {
    expect(preset.hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(preset.labelKey).toBe(`appearance.accentPresets.${preset.id}`);
  }
});
