import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/locales/en';
import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import { GENERIC_LIGHT_PRESETS } from '../../gameSystems/lightPresets/generic';
import { BUILT_IN_LIGHT_NAMES, lightPresetName } from '../lightPresetNames';

describe('light preset names', () => {
  it('translates every built-in light by a key whose English is its name', () => {
    const lights = [...GENERIC_LIGHT_PRESETS, ...BUILT_IN_SYSTEM_PRESETS.flatMap((preset) => preset.rules.lightPresets ?? [])];
    for (const light of lights) {
      const key = BUILT_IN_LIGHT_NAMES[light.name];
      expect(key, light.name).toBeDefined();
      expect(en[key!]).toBe(light.name);
    }
  });

  it('shows a light the GM named as it was named', () => {
    expect(lightPresetName({ name: 'Brazier' })).toBe('Brazier');
  });
});
