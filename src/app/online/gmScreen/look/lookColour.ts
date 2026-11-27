const NUMBER = String.raw`(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)`;
/** What a browser computes for a colour of the legacy forms (hex, names, `rgb`, `hsl`): channels 0 to 255. */
const LEGACY = new RegExp(String.raw`^rgba?\(${NUMBER}, ${NUMBER}, ${NUMBER}(?:, ${NUMBER})?\)$`, 'i');
/** What a browser computes for a mix in sRGB: channels 0 to 1. */
const SRGB = new RegExp(String.raw`^color\(srgb ${NUMBER} ${NUMBER} ${NUMBER}(?: / ${NUMBER})?\)$`, 'i');

const byte = (unit: number): string => Math.round(Math.min(1, Math.max(0, unit)) * 255).toString(16).padStart(2, '0');

/**
 * A colour as the browser computed it, written as it travels to a device (`LOOK_COLOUR_VALUE`): `#rrggbb`, with
 * the alpha only where it is not opaque. Null for any other text, so that colour is left out.
 */
export function travellingColour(computed: string): string | null {
  const legacy = LEGACY.exec(computed);
  const srgb = legacy === null ? SRGB.exec(computed) : null;
  const match = legacy ?? srgb;
  if (match === null) return null;
  const scale = legacy === null ? 1 : 255;
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => Number(part) / scale) as [number, number, number];
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  const opaque = byte(alpha) === 'ff';
  return `#${byte(r)}${byte(g)}${byte(b)}${opaque ? '' : byte(alpha)}`;
}
