import { isRecord } from '../utils/guards';
import { t } from '../i18n';

/** How a scene shows its fog: flat, or as clouds of a colour that part and gather over a change. */
export interface FogStyle {
  /** Cloud reveal: players see clouds, and a fog edit reaches them only once the GM leaves the fog tools. */
  clouds: boolean;
  /** `#rrggbb`; the clouds' colour. */
  color: string;
}

/** The cloud colours offered in the fog tool's menu. */
export const FOG_COLOR_SWATCHES = [
  { value: '#232a38', label: t('toolbar.fogColourNight') },
  { value: '#2b2b2e', label: t('toolbar.fogColourCharcoal') },
  { value: '#5c6069', label: t('toolbar.fogColourAsh') },
  { value: '#8a94a6', label: t('toolbar.fogColourMist') },
  { value: '#22332a', label: t('toolbar.fogColourForest') },
  { value: '#3f5a2a', label: t('toolbar.fogColourPoison') },
  { value: '#4a1f24', label: t('toolbar.fogColourBlood') },
  { value: '#33264d', label: t('toolbar.fogColourArcane') },
  { value: '#c9ced6', label: t('toolbar.fogColourFog') },
  { value: '#eef1f5', label: t('toolbar.fogColourSnow') },
  { value: '#cbbd9c', label: t('toolbar.fogColourSand') },
  { value: '#b8cbe0', label: t('toolbar.fogColourSky') },
] as const;

export const DEFAULT_FOG_STYLE: FogStyle = { clouds: false, color: FOG_COLOR_SWATCHES[0].value };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** A scene's fog style as its file holds it: flat fog where it holds none, the default colour where its colour is no `#rrggbb`. */
export function readFogStyle(value: unknown): FogStyle {
  if (!isRecord(value)) return DEFAULT_FOG_STYLE;
  const { clouds, color } = value;
  return {
    clouds: clouds === true,
    color: typeof color === 'string' && HEX_COLOR.test(color) ? color.toLowerCase() : DEFAULT_FOG_STYLE.color,
  };
}
