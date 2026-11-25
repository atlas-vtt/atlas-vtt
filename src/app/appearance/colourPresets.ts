import type { MessageKey } from '../i18n';

/** A colour the Appearance page offers for the accent, the ivy and the dice, named in the GM's language. */
export interface ColourPreset {
  id: string;
  hex: string;
  labelKey: MessageKey;
}

export const COLOUR_PRESETS = [
  { id: 'crimson', hex: '#c0392b', labelKey: 'appearance.accentPresets.crimson' },
  { id: 'ember', hex: '#d9822b', labelKey: 'appearance.accentPresets.ember' },
  { id: 'gold', hex: '#c9a227', labelKey: 'appearance.accentPresets.gold' },
  { id: 'moss', hex: '#6b8f3a', labelKey: 'appearance.accentPresets.moss' },
  { id: 'teal', hex: '#2a9d8f', labelKey: 'appearance.accentPresets.teal' },
  { id: 'azure', hex: '#3b82c4', labelKey: 'appearance.accentPresets.azure' },
  { id: 'violet', hex: '#8b5cf6', labelKey: 'appearance.accentPresets.violet' },
  { id: 'rose', hex: '#d46a8a', labelKey: 'appearance.accentPresets.rose' },
] as const satisfies readonly ColourPreset[];

/** A preset's id; the dice colour setting stores it. */
export type ColourPresetId = (typeof COLOUR_PRESETS)[number]['id'];
