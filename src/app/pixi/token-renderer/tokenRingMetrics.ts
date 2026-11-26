/**
 * Shared token ring geometry.
 *
 * `tokenSize` is the token sprite diameter (content area). The ring should sit just
 * outside that by the grid stroke inset on both sides so 1x tokens hug one full cell;
 * unframed art reaches out to that edge itself (`unframedArtDiameter`).
 */

export function getTokenRingOuterDiameter(
  tokenSize: number,
  strokeWidth: number = 4,
  ringScale: number = 1,
): number {
  const safeTokenSize = Number.isFinite(tokenSize) && tokenSize > 0 ? tokenSize : 70;
  const safeStrokeWidth = Number.isFinite(strokeWidth) && strokeWidth > 0 ? strokeWidth : 4;
  const safeScale = Number.isFinite(ringScale) && ringScale > 0 ? ringScale : 1;

  return safeTokenSize + safeStrokeWidth * 2 * safeScale;
}

export function getTokenRingCenterRadius(
  tokenSize: number,
  strokeWidth: number = 4,
  ringScale: number = 1,
): number {
  const safeTokenSize = Number.isFinite(tokenSize) && tokenSize > 0 ? tokenSize : 70;
  const outerDiameter = getTokenRingOuterDiameter(safeTokenSize, strokeWidth, ringScale);
  // Center of the visible ring band.
  return (outerDiameter + safeTokenSize) / 4;
}

/**
 * Diameter that unframed art fits within: the ring's outer edge (at ring size 1), so a token without
 * a ring looks as large as one with it and fills its cell as Foundry and Owlbear Rodeo draw such art.
 */
export function unframedArtDiameter(tokenSize: number, strokeWidth: number): number {
  return getTokenRingOuterDiameter(tokenSize, strokeWidth);
}

/** The size art is drawn at for a token `size` wide. */
export interface TokenArtBox {
  width: number;
  height: number;
}

/**
 * Framed art fills the disc inside its ring; unframed art keeps its proportions and fits the
 * ring's outer diameter, so the two look alike in size.
 */
export function tokenArtBox(size: number, strokeWidth: number, framed: boolean, artWidth: number, artHeight: number): TokenArtBox {
  if (framed) return { width: size, height: size };
  const diameter = unframedArtDiameter(size, strokeWidth);
  const width = artWidth || 1;
  const height = artHeight || 1;
  const longest = Math.max(width, height);
  return { width: diameter * width / longest, height: diameter * height / longest };
}
