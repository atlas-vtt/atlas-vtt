import type { LiquidColors } from '../../../types/liquidTypes';
import { luminance, mixColours, parseHex } from '../palette';

/**
 * Monochrome lava's two pigments, shared by the static painter and the moving surface: heat always
 * rises from dark crust to light melt, even on light-ink maps.
 */
export function lavaDuotone(ink: string, floor: string): LiquidColors {
  const lightInk = luminance(parseHex(ink)) > luminance(parseHex(floor));
  const deep = lightInk ? floor : ink;
  const glint = lightInk ? ink : floor;
  return { surface: mixColours(deep, glint, 0.62), deep, glint };
}
