/** A badge colour (0xRRGGBB) as CSS reads it. */
export function badgeColour(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
