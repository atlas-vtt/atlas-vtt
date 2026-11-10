import { ENCOUNTER_PREVIEW_COUNT, encounterPreviewStyle } from '../utils/encounterPreviewLayout';
import type { AnyAsset } from '../types';

/** How far past the mounted rows placeholders are drawn: more than a scroll can cover before the next render. */
const REACH_PX = 2400;
/** A name's placeholder bar, as a share of the card's width and of the name's font size (`Skeleton`'s text shape). */
const NAME_BAR_WIDTH = 0.5;
const NAME_BAR_HEIGHT = 0.7;

/** Where a card's art and name lie inside its cell, in px from the cell's top left corner. */
export interface CardLayout {
  art: { x: number; y: number; size: number; radius: number };
  name: { y: number; height: number; fontSize: number };
}

/** A row of the grid that is not mounted, in px from the grid's top left corner. */
export interface RestRegion {
  /** The row's index, which keys its element: a row keeps its place and size while the grid scrolls. */
  row: number;
  top: number;
  height: number;
  /** Set for a last row that is not full; otherwise the region spans the grid. */
  width?: number;
}

/** Reads a mounted card's layout. Offsets, not client rects: a cell that is animating is scaled. */
export function measureCard(cell: HTMLElement): CardLayout | null {
  const art = cell.querySelector<HTMLElement>('.atlas-asset-card-thumb');
  const name = cell.querySelector<HTMLElement>('.atlas-asset-card-name');
  if (!art || !name || art.offsetWidth === 0) return null;
  const nameStyle = getComputedStyle(name);
  return {
    art: { x: art.offsetLeft, y: art.offsetTop, size: art.offsetWidth, radius: parseFloat(getComputedStyle(art).borderTopLeftRadius) || 0 },
    name: { y: name.offsetTop, height: name.offsetHeight, fontSize: parseFloat(nameStyle.fontSize) || 0 },
  };
}

export function sameCardLayout(a: CardLayout | null, b: CardLayout | null): boolean {
  if (!a || !b) return a === b;
  return a.art.x === b.art.x && a.art.y === b.art.y && a.art.size === b.art.size && a.art.radius === b.art.radius
    && a.name.y === b.name.y && a.name.height === b.name.height && a.name.fontSize === b.name.fontSize;
}

/** The art of one card as the tab draws it: a token's circle, an encounter's group of three, a map's picture. */
function artShapes(type: AnyAsset['type'], { x, y, size, radius }: CardLayout['art']): string {
  if (type === 'tokens') return `<circle cx='${x + size / 2}' cy='${y + size / 2}' r='${size / 2}'/>`;
  if (type !== 'encounters') return `<rect x='${x}' y='${y}' width='${size}' height='${size}' rx='${radius}'/>`;
  const share = (percent: string | number | undefined): number => (parseFloat(String(percent)) / 100) * size;
  return Array.from({ length: ENCOUNTER_PREVIEW_COUNT }, (_, index) => {
    const place = encounterPreviewStyle(index, ENCOUNTER_PREVIEW_COUNT);
    const diameter = share(place.width);
    const left = place.right === undefined ? share(place.left) : size - share(place.right) - diameter;
    return `<circle cx='${x + left + diameter / 2}' cy='${y + share(place.top) + diameter / 2}' r='${diameter / 2}'/>`;
  }).join('');
}

/**
 * One grid cell as a mask image: the placeholder of a card's art and name where
 * a mounted card has them, tiled over the rows that are not mounted.
 */
export function cardMask(type: AnyAsset['type'], layout: CardLayout, cardWidth: number, pitchX: number, pitchY: number): string {
  const barWidth = cardWidth * NAME_BAR_WIDTH;
  const barHeight = layout.name.fontSize * NAME_BAR_HEIGHT;
  const bar = `<rect x='${(cardWidth - barWidth) / 2}' y='${layout.name.y + (layout.name.height - barHeight) / 2}' width='${barWidth}' height='${barHeight}' rx='${barHeight / 2}'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${pitchX}' height='${pitchY}'>${artShapes(type, layout.art)}${bar}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

interface MountedRows {
  /** The first and last mounted row; null while none is mounted. */
  firstRow: number | null;
  lastRow: number | null;
  assetCount: number;
  columns: number;
  pitchX: number;
  pitchY: number;
  gap: number;
}

/**
 * The rows around the mounted ones that hold assets, up to `REACH_PX` away: what
 * a scroll shows before the grid has rendered again. One region per row, so a
 * scroll only adds and removes rows at the ends and never resizes one (a region
 * per stretch was given a new height on every row scrolled). A last row that is
 * not full is as wide as its cards.
 */
export function unmountedRegions({ firstRow, lastRow, assetCount, columns, pitchX, pitchY, gap }: MountedRows): RestRegion[] {
  if (firstRow === null || lastRow === null || pitchY <= 0) return [];
  const reach = Math.ceil(REACH_PX / pitchY);
  const fullRows = Math.floor(assetCount / columns);
  const inLastRow = assetCount % columns;
  const rows = (from: number, to: number): RestRegion[] => Array.from({ length: Math.max(0, to - from) }, (_, index) => {
    const row = from + index;
    return { row, top: row * pitchY, height: pitchY - gap };
  });
  const below = lastRow + 1;
  const lastRowRegion = inLastRow > 0 && fullRows >= below && fullRows < below + reach
    ? [{ row: fullRows, top: fullRows * pitchY, height: pitchY - gap, width: inLastRow * pitchX - gap }]
    : [];
  return [
    ...rows(Math.max(0, firstRow - reach), firstRow),
    ...rows(below, Math.min(fullRows, below + reach)),
    ...lastRowRegion,
  ];
}
