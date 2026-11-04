/**
 * The shown name of a light preset. Built-in presets keep their English names in the data
 * (collections store copies, and `sameLightPresets` compares names), so they are translated only
 * here, by their name: a light the GM renamed is shown as it was named.
 */

import { t, type MessageKey } from '../i18n';
import type { LightPresetDefinition } from '../types/lightPresetTypes';

/** The English name of every built-in light preset, and the key that translates it. */
export const BUILT_IN_LIGHT_NAMES: Readonly<Record<string, MessageKey>> = {
  Candle: 'light.preset.candle',
  Torch: 'light.preset.torch',
  Lantern: 'light.preset.lantern',
  'Magical light': 'light.preset.magical',
  Darkness: 'light.preset.darkness',
  'Hooded lantern': 'light.preset.hoodedLantern',
  Light: 'light.preset.light',
  Lamp: 'light.preset.lamp',
  'Continual Flame': 'light.preset.continualFlame',
  Daylight: 'light.preset.daylight',
  'Bullseye lantern': 'light.preset.bullseyeLantern',
  'Bull\'s-eye lantern': 'light.preset.bullsEyeLantern',
  'Everlight crystal': 'light.preset.everlightCrystal',
  'Glow rod': 'light.preset.glowRod',
  'Torch (near)': 'light.preset.torchNear',
  'Lantern (double near)': 'light.preset.lanternDoubleNear',
  'Light spell (near)': 'light.preset.lightSpellNear',
};

export function lightPresetName(preset: Pick<LightPresetDefinition, 'name'>): string {
  const key = BUILT_IN_LIGHT_NAMES[preset.name];
  return key ? t(key) : preset.name;
}
