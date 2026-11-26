import { t } from "../../../i18n"
import type { DropdownSwatch } from "../primitives/DropdownSwatchGrid"

/** Preset colours for what is put on the map: high-contrast neutrals plus map-legible accents. */
export const MAP_COLOR_SWATCHES = [
  { value: '#ffffff', label: t('color.white') },
  { value: '#000000', label: t('color.black') },
  { value: '#e93147', label: t('color.red') },
  { value: '#ec7500', label: t('color.orange') },
  { value: '#e0ac00', label: t('color.yellow') },
  { value: '#08b94e', label: t('color.green') },
  { value: '#086ddd', label: t('color.blue') },
  { value: '#7852ee', label: t('color.purple') },
] as const satisfies readonly DropdownSwatch[]
