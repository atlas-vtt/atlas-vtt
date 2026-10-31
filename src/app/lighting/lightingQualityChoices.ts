import { t } from '../i18n';
import { LIGHTING_QUALITY_LEVELS, type LightingQualityLevel } from './lightingQuality';

/** One preset as the Graphics page offers it: its name and, on hover, what it draws and whom it is for. */
export interface LightingQualityChoice {
  readonly value: LightingQualityLevel;
  readonly label: string;
  readonly hint: string;
}

const LABELS: Record<LightingQualityLevel, () => string> = {
  high: () => t('graphics.high'),
  balanced: () => t('graphics.balanced'),
  saver: () => t('graphics.saver'),
};

const HINTS: Record<LightingQualityLevel, () => string> = {
  high: () => t('graphics.highHint'),
  balanced: () => t('graphics.balancedHint'),
  saver: () => t('graphics.saverHint'),
};

/** The three presets for the Graphics page's tabs, from the cheapest to the finest as a game's presets go, left to right. */
export function lightingQualityChoices(): LightingQualityChoice[] {
  return [...LIGHTING_QUALITY_LEVELS].reverse().map((value) => ({ value, label: LABELS[value](), hint: HINTS[value]() }));
}

/** A preset's name, for a sentence about it. */
export const presetLabel = (level: LightingQualityLevel): string => LABELS[level]();
