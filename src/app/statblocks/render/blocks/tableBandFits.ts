import { flushSync } from 'react-dom';
import { resizeObserverOf } from '../../../utils/observeResize';
import { fittingBands, type ColumnWidths } from './tableBands';
import { TABLE_COL_ATTRIBUTE } from './tableAttributes';

/**
 * Fitting every Table of a document in one reading. A table's bands are
 * worked out from its columns' least widths, which only a layout with the
 * tables at their least width tells (`measureColumns`). Fitting the tables
 * one by one laid the whole document out twice for each of them, at every
 * draw and every step of a resize; a card with a few long tables beside a
 * long note froze Obsidian (#514). A batch lays it out twice in all.
 */

/** One Table as the batch fits it: where it stands and what it is told. */
export interface BandFit {
  room: () => HTMLElement | null;
  columns: () => number;
  /** A cell is typed: the bands stay as they are. */
  held: () => boolean;
  apply: (count: number) => void;
}

/** Set on the room while its tables are laid out at their least width to be measured (`_sheet-table.scss`). */
const MEASURING = 'data-measuring';

/**
 * Each column's least width, read from the bands as they stand: every table
 * is laid out at its min-content width for the moment of the reading, where
 * each column takes its least width, and what is left of the table's width
 * beside its columns is what every band adds. The room must carry `MEASURING`.
 */
function measureColumns(room: HTMLElement, count: number): ColumnWidths | null {
  const tables = [...room.querySelectorAll('table')];
  if (tables.length === 0) return null;
  const columns = new Array<number>(count).fill(0);
  let extra = 0;
  for (const table of tables) {
    let sum = 0;
    for (const cell of table.querySelector('tr')?.children ?? []) {
      const col = Number(cell.getAttribute(TABLE_COL_ATTRIBUTE));
      if (!cell.hasAttribute(TABLE_COL_ATTRIBUTE) || !Number.isInteger(col) || col >= count) continue;
      const width = cell.getBoundingClientRect().width;
      columns[col] = width;
      sum += width;
    }
    extra = Math.max(extra, table.getBoundingClientRect().width - sum);
  }
  return { columns, extra };
}

interface Reading {
  fit: BandFit;
  room: HTMLElement;
  width: number;
}

/**
 * Fits `fits` together: every room's width is read, then every room is laid
 * out at its least width once and read, and only then is each table told its
 * count. A table whose room is gone, hidden or held keeps its bands.
 */
function fitBands(fits: Iterable<BandFit>): void {
  const readings: Reading[] = [];
  for (const fit of fits) {
    const room = fit.room();
    if (!room || fit.held()) continue;
    const width = room.clientWidth;
    if (width > 0) readings.push({ fit, room, width });
  }
  if (readings.length === 0) return;
  const counts: Array<{ fit: BandFit; count: number }> = [];
  for (const { room } of readings) room.setAttribute(MEASURING, '');
  try {
    for (const { fit, room, width } of readings) {
      const widths = measureColumns(room, fit.columns());
      if (widths) counts.push({ fit, count: fittingBands(widths, width) });
    }
  } finally {
    for (const { room } of readings) room.removeAttribute(MEASURING);
  }
  for (const { fit, count } of counts) fit.apply(count);
}

const queued = new Set<BandFit>();

function flushQueued(): void {
  const fits = [...queued];
  queued.clear();
  // Drawn before the frame is painted, as a layout effect's own update would be.
  flushSync(() => fitBands(fits));
}

/**
 * Fits `fit` with every other table asked for in the same task: the tables
 * drawn in one commit ask in their layout effects, and are fitted together
 * once the last has asked, before the frame is painted.
 */
export function requestBandFit(fit: BandFit): void {
  if (queued.size === 0) queueMicrotask(flushQueued);
  queued.add(fit);
}

/** Who asked to watch each element, per window: one observer per window delivers every table's change in one call. */
interface Watch {
  observer: ResizeObserver;
  owners: WeakMap<Element, BandFit>;
}

const watches = new WeakMap<Window, Watch>();

/** The watch of `win`, observing with the window's own ResizeObserver, so a popout's elements are observed by the popout's. */
function watchOf(win: Window, Observer: typeof ResizeObserver): Watch {
  const known = watches.get(win);
  if (known) return known;
  const owners = new WeakMap<Element, BandFit>();
  const observer = new Observer((entries) => {
    const fits = new Set<BandFit>();
    for (const entry of entries) {
      const fit = owners.get(entry.target);
      if (fit) fits.add(fit);
    }
    fitBands(fits);
  });
  const watch = { observer, owners };
  watches.set(win, watch);
  return watch;
}

/** Fits `fit` again whenever one of `elements` (its room and its tables) changes size. Returns the function that stops. */
export function watchBandFit(fit: BandFit, elements: readonly Element[]): () => void {
  const first = elements[0];
  const found = first ? resizeObserverOf(first) : null;
  if (!found) return () => undefined;
  const { observer, owners } = watchOf(found.win, found.Observer);
  for (const element of elements) {
    owners.set(element, fit);
    observer.observe(element);
  }
  return (): void => {
    for (const element of elements) {
      owners.delete(element);
      observer.unobserve(element);
    }
  };
}
