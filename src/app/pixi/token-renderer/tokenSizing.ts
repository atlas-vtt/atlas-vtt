import { t } from '../../i18n';
/**
 * Shared token sizing derived from the grid cell size.
 *
 * A size-1 token fills one cell minus a stroke inset on each side. On hex grids
 * the cell size is the flat-to-flat distance, so the same formula fits the
 * hex's inscribed circle. The stored multiplier n gives a diameter of (2n - 1)
 * cells; Small uses a smaller image in one cell, Tiny fits a quarter-cell.
 */


const REFERENCE_CELL_SIZE = 70;
const REFERENCE_STROKE_WIDTH = 4;

/** Stroke inset in pixels, proportional to the grid size (4px at a 70px cell). */
export function computeTokenStrokeWidth(gridSize: number): number {
  return Math.max(1, Math.round((gridSize * REFERENCE_STROKE_WIDTH) / REFERENCE_CELL_SIZE));
}

/** Diameter in cells covered by a token of the given size multiplier. */
export function tokenDiameterInCells(sizeInCells: number): number {
  return 2 * sizeInCells - 1;
}

/** Named footprints offered in menus, stored as the multiplier `tokenDiameterInCells` expects. */
export const TOKEN_SIZE_OPTIONS: ReadonlyArray<{ label: string; size: number }> = [
  { label: t('token.size.tiny'), size: 0.75 },
  { label: t('token.size.small'), size: 0.875 },
  { label: t('token.size.medium'), size: 1 },
  { label: t('token.size.large'), size: 1.5 },
  { label: t('token.size.huge'), size: 2 },
  { label: t('token.size.gargantuan'), size: 2.5 },
];

const CREATURE_SIZE_MULTIPLIERS: Record<string, number> = { tiny: 0.75, small: 0.875, medium: 1, large: 1.5, huge: 2, gargantuan: 2.5 };

/** Resize handles step through Tiny, Small, Medium, then whole-cell diameters up to 9×9. */
export function resizedTokenSize(initialSize: number, steps: number): number {
  if (steps === 0) return initialSize;
  const sizes = [0.75, 0.875, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  const index = sizes.reduce((nearest, size, i) =>
    Math.abs(size - initialSize) < Math.abs(sizes[nearest]! - initialSize) ? i : nearest, 0);
  return sizes[Math.max(0, Math.min(sizes.length - 1, index + steps))]!;
}

/** Size multiplier for a creature size word from statblock data ("Large", "Huge or larger"); undefined when unknown. */
export function tokenSizeFromCreatureSize(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const word = value.trim().toLowerCase().split(/\s+/)[0] ?? '';
  return CREATURE_SIZE_MULTIPLIERS[word];
}

/**
 * Size multiplier a statblock's size gives: the field its template means as the size first (`meanings.size`,
 * as the statblock's `FieldMeanings` name it), then `size`.
 */
export function tokenSizeFromStatblock(fields: Readonly<Record<string, unknown>>, meanings: Readonly<{ size?: string | undefined }>): number | undefined {
  const meant = meanings.size === undefined ? undefined : tokenSizeFromCreatureSize(fields[meanings.size]);
  return meant ?? tokenSizeFromCreatureSize(fields.size);
}

/** Token sprite diameter in pixels for a token covering `sizeInCells` cells. */
export function computeTokenPixelSize(gridSize: number, sizeInCells: number): number {
  const strokeWidth = computeTokenStrokeWidth(gridSize);
  return (gridSize - 2 * strokeWidth) * tokenDiameterInCells(sizeInCells);
}

/** Sprite diameter the token UI is designed for: a medium token on a 70px grid. */
const TOKEN_UI_REFERENCE_SIZE = computeTokenPixelSize(REFERENCE_CELL_SIZE, 1);

/**
 * Scale of a token's UI (resource bars, nameplate, condition markers, +/- buttons,
 * resize and rotation handles) for a sprite `spriteSize` pixels wide. The UI lives in
 * world space and keeps its proportions to the token, so it zooms with the map and
 * never hides a small token or shrinks to nothing on a large one.
 */
export function tokenUIScale(spriteSize: number): number {
  return spriteSize / TOKEN_UI_REFERENCE_SIZE;
}

/** Diameter of a resize or rotate handle before `tokenUIScale`; what sits beside the token must clear it. */
export const RESIZE_HANDLE_SIZE = 20;

/** Height of the nameplate, which lies on the token's bottom edge, in UI units. */
export const NAMEPLATE_HEIGHT = 14;

/**
 * Scale of a token's bars, nameplate and condition markers while it is not selected or
 * is being dragged: a medium token's on a `gridSize` grid, whatever the token's size,
 * so the bars of huge tokens do not cover the map around them.
 */
export function restingTokenUIScale(gridSize: number): number {
  return tokenUIScale(computeTokenPixelSize(gridSize, 1));
}

/** Screen pixels per UI unit of a selected token's bars, whatever the zoom or token size. */
const SELECTED_TOKEN_UI_SCREEN_SCALE = 2.25;

/**
 * World scale of a selected token's bars at viewport `zoom`: a constant size on screen,
 * like map pins, so they are easy to read and click at any zoom, but never smaller than
 * the resting size (when zoomed far in).
 */
export function selectedTokenUIScale(restingScale: number, zoom: number): number {
  return Math.max(restingScale, SELECTED_TOKEN_UI_SCREEN_SCALE / zoom);
}
