import { describe, expect, it } from 'vitest';
import { FingerSettings } from '../../../src/app/input/fingerUse';
import { FINGER_USE_STORAGE_KEY, PEN_SEEN_STORAGE_KEY } from '../../../src/app/services/deviceSettings';
import { navigationSettingsSection } from '../../../src/app/settings/navigationSettingsSection';
import type { SettingsService } from '../../../src/app/services/SettingsService';

function device(stored: Record<string, unknown> = {}): { values: Record<string, unknown>; loadLocalStorage(key: string): unknown; saveLocalStorage(key: string, value: unknown): void } {
  const values = { ...stored };
  return { values, loadLocalStorage: (key) => values[key] ?? null, saveLocalStorage: (key, value) => { values[key] = value; } };
}

describe('what fingers do in the drawing tools', () => {
  it('is the tool on a device that never saw a pen', () => {
    const settings = new FingerSettings(device());
    expect(settings.penSeen).toBe(false);
    expect(settings.use).toBe('tool');
  });

  it('is to pan once a pen has touched a map, remembered on the device', () => {
    const storage = device();
    const settings = new FingerSettings(storage);
    settings.notePen();
    expect(settings.use).toBe('pan');
    expect(storage.values[PEN_SEEN_STORAGE_KEY]).toBe('seen');
    expect(new FingerSettings(storage).use).toBe('pan');
  });

  it('is what the GM chose, on this device', () => {
    const storage = device({ [PEN_SEEN_STORAGE_KEY]: 'seen' });
    const settings = new FingerSettings(storage);
    settings.setUse('tool');
    expect(settings.use).toBe('tool');
    expect(storage.values[FINGER_USE_STORAGE_KEY]).toBe('tool');
    expect(new FingerSettings(storage).use).toBe('tool');
  });

  it('reads a stored value it does not know as never chosen', () => {
    expect(new FingerSettings(device({ [PEN_SEEN_STORAGE_KEY]: 'seen', [FINGER_USE_STORAGE_KEY]: 'draw' })).use).toBe('pan');
  });
});

describe('the settings\' Fingers row', () => {
  const service = { getNavigationSettings: () => ({ inputMode: 'mouse' }) } as unknown as SettingsService;
  const names = (penSeen: boolean): string[] =>
    navigationSettingsSection(service, { penSeen, use: 'pan', setUse: () => undefined }).rows.map((row) => row.name);

  it('is offered only on a device that reported a pen', () => {
    expect(names(false)).toEqual(['Input device']);
    expect(names(true)).toEqual(['Fingers', 'Input device']);
  });
});
