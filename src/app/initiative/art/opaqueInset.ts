/** How far in from each edge the art of an image lies, as shares (0 to 1) of its width and height. */
export interface ArtInset {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** An alpha at or above this counts as art. */
const OPAQUE = 200;
/** An edge of the box is solid once this share of it is art; soft or rounded corners are trimmed until then. */
const SOLID_EDGE = 0.98;
/** Insets smaller than this share of a side leave the image as it is. */
const NOTHING_TO_TRIM = 0.01;
/** The box never shrinks below this share of a side: art too sparse to hold a solid box stays as drawn. */
const SMALLEST_SHARE = 0.2;

/**
 * Where the art of an image lies inside transparent margins (a token cropped zoomed out, a frame-less shape): the box
 * around everything opaque, then pulled in edge by edge, the weakest first, until each of its edges is solid art, so
 * the box shows art alone, corners included. `rgba` holds the image's pixels, four bytes each. Null where nothing
 * needs trimming or the art holds no solid box.
 */
export function opaqueInset(rgba: Uint8ClampedArray, width: number, height: number): ArtInset | null {
  const opaque = (x: number, y: number): boolean => rgba[(y * width + x) * 4 + 3]! >= OPAQUE;
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;
  const rowShare = (y: number): number => share(left, right, (x) => opaque(x, y));
  const columnShare = (x: number): number => share(top, bottom, (y) => opaque(x, y));
  // The box around what is opaque at all
  while (top <= bottom && rowShare(top) === 0) top++;
  while (bottom > top && rowShare(bottom) === 0) bottom--;
  while (left <= right && columnShare(left) === 0) left++;
  while (right > left && columnShare(right) === 0) right--;
  if (top > bottom || left > right) return null;
  // Then in until every edge is solid
  for (;;) {
    const edges = [
      { side: 'top', solid: rowShare(top) },
      { side: 'bottom', solid: rowShare(bottom) },
      { side: 'left', solid: columnShare(left) },
      { side: 'right', solid: columnShare(right) },
    ] as const;
    const weakest = edges.reduce((worst, edge) => (edge.solid < worst.solid ? edge : worst));
    if (weakest.solid >= SOLID_EDGE) break;
    if (weakest.side === 'top') top++;
    else if (weakest.side === 'bottom') bottom--;
    else if (weakest.side === 'left') left++;
    else right--;
    if (bottom - top + 1 < height * SMALLEST_SHARE || right - left + 1 < width * SMALLEST_SHARE) return null;
  }
  const inset = { top: top / height, right: (width - 1 - right) / width, bottom: (height - 1 - bottom) / height, left: left / width };
  return Math.max(inset.top, inset.right, inset.bottom, inset.left) < NOTHING_TO_TRIM ? null : inset;
}

function share(from: number, to: number, isArt: (index: number) => boolean): number {
  let art = 0;
  for (let index = from; index <= to; index++) if (isArt(index)) art++;
  return art / (to - from + 1);
}

/** The CSS `object-view-box` that shows only the art: `object-fit: cover` then fills its frame with it. */
export function artViewBox(inset: ArtInset): string {
  const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;
  return `inset(${percent(inset.top)} ${percent(inset.right)} ${percent(inset.bottom)} ${percent(inset.left)})`;
}
