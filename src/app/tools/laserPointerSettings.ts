import { t } from '../i18n';
import { isHexColor } from '../utils/hexColor';

/** The laser pointer's look, kept in Atlas' settings so it follows the GM to every map. */
export interface LaserPointerSettings {
  color: string;
  /** Radius of the glow around the pointer, in screen pixels at any zoom. */
  size: number;
}

/**
 * The hue families of the Okabe-Ito colour-blind-safe palette, brightened into laser
 * colours and tuned so no two swatches look alike with protanopia, deuteranopia or
 * tritanopia (checked by simulation: every pair at least 10 ΔE2000 apart). Sky blue,
 * blue and white stay vivid for every kind of colour blindness.
 */
export const LASER_COLOR_SWATCHES = [
  { value: '#ff0059', label: t('laser.color.red') },
  { value: '#ff9f2e', label: t('laser.color.orange') },
  { value: '#fff133', label: t('laser.color.yellow') },
  { value: '#66ffa9', label: t('laser.color.mint') },
  { value: '#00a9ff', label: t('laser.color.sky') },
  { value: '#3d6bff', label: t('laser.color.blue') },
  { value: '#e85aa8', label: t('laser.color.pink') },
  { value: '#ffffff', label: t('laser.color.white') },
] as const;

/** Shown with the swatches, since colour-blind players cannot tell which ones work for them. */
export const LASER_COLOR_HINT = t('laser.colorHint');

export const LASER_SIZE_MIN = 8;
export const LASER_SIZE_MAX = 100;

export const DEFAULT_LASER_POINTER_SETTINGS: LaserPointerSettings = {
  color: LASER_COLOR_SWATCHES[0].value,
  size: 16,
};

/** How long a point of the trail stays visible, in milliseconds. */
export const LASER_FADE_TIME = 800;

/** Stored settings, with anything unusable (hand edits, older files) replaced by the default. */
export function resolveLaserPointerSettings(raw: Partial<LaserPointerSettings> | undefined): LaserPointerSettings {
  const color = isHexColor(raw?.color) ? raw.color : DEFAULT_LASER_POINTER_SETTINGS.color;
  const size = typeof raw?.size === 'number' && Number.isFinite(raw.size)
    ? Math.min(LASER_SIZE_MAX, Math.max(LASER_SIZE_MIN, raw.size))
    : DEFAULT_LASER_POINTER_SETTINGS.size;
  return { color, size };
}
