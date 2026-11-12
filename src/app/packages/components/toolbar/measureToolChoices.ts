import { Circle, Ruler, Triangle } from "lucide-react"
import { t } from "../../../i18n"
import type { MeasureMode } from "../../../measure/measureTypes"
import type { DropdownSwatch } from "../primitives/DropdownSwatchGrid"
import { MAP_COLOR_SWATCHES } from "./mapColorSwatches"
import type { ToolChoice } from "./ToolOptionsBar"

/** What a press of the measure tool measures: the modes that are built, in the bar's order. */
export const MEASURE_MODES: readonly ToolChoice<MeasureMode>[] = [
  { value: 'ruler', icon: Ruler, label: t('toolbar.ruler') },
  { value: 'circle', icon: Circle, label: t('toolbar.circle') },
  { value: 'cone', icon: Triangle, label: t('toolbar.cone') },
]

/** The bar's button for a mode; the ruler's for a mode the bar does not offer. */
export function measureModeChoice(mode: MeasureMode): ToolChoice<MeasureMode> {
  return MEASURE_MODES.find((choice) => choice.value === mode) ?? MEASURE_MODES[0]!
}

/** The mode after `mode` in the bar, the first after the last: what the tool's key steps to. */
export function nextMeasureMode(mode: MeasureMode): MeasureMode {
  const index = MEASURE_MODES.findIndex((choice) => choice.value === mode)
  return MEASURE_MODES[(index + 1) % MEASURE_MODES.length]!.value
}

/** How the swatch of the theme's accent is drawn. A measurement of that colour stores none. */
const ACCENT_SWATCH = 'var(--interactive-accent)'

/**
 * The colours a measurement can take: the theme's accent first, then the map's colours without
 * black, which a measurement's dark casing would swallow.
 */
export const MEASURE_COLOR_SWATCHES: readonly DropdownSwatch[] = [
  { value: ACCENT_SWATCH, label: t('color.default') },
  ...MAP_COLOR_SWATCHES.filter((swatch) => swatch.value !== '#000000'),
]

/** The swatch that stands for a measurement's colour (`MeasureToolOptions.color`, `KeptMeasure.color`). */
export function swatchOfMeasureColor(color: string | null | undefined): string {
  return color ?? ACCENT_SWATCH
}

/** The colour a chosen swatch stores: null for the accent's. */
export function measureColorOfSwatch(swatch: string): string | null {
  return swatch === ACCENT_SWATCH ? null : swatch
}
