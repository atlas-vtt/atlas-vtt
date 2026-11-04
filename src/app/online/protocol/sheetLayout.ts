import { isRecord } from './shape.ts';

/**
 * How a block of the GM's card is laid out, so the page draws the sheet in the card's boxes: the
 * template block's type, its look (a Value's `run-in` or `stacked`, a Tags block's look, a Title's
 * level, a Table's orientation, a Track's look), its size in a Row and a Row's alignment.
 */
export interface SheetFrame {
  readonly block: string;
  readonly look?: string;
  readonly size?: 'fit' | 'fill';
  readonly align?: 'start' | 'center' | 'spread';
}

/**
 * The GM's card as it is laid out in the note panel: its width in CSS pixels, the template's column
 * width (em of the card's text) and most columns, and whether the sheet's first block is the
 * header's description, which the card draws in its header.
 */
export interface SheetCard {
  readonly width: number;
  readonly columnWidth: number;
  readonly maxColumns: number;
  readonly description: boolean;
}

export const MIN_CARD_WIDTH = 280;
export const MAX_CARD_WIDTH = 1600;
export const MIN_COLUMN_WIDTH = 10;
export const MAX_COLUMN_WIDTH = 60;
export const MAX_CARD_COLUMNS = 4;

const WORD = /^[a-z][a-z0-9-]{0,15}$/;
const SIZES: readonly unknown[] = ['fit', 'fill'];
const ALIGNS: readonly unknown[] = ['start', 'center', 'spread'];

const within = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** A node's frame: undefined for none, null when it is malformed. */
export function parseSheetFrame(value: unknown): SheetFrame | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.block !== 'string' || !WORD.test(value.block)) return null;
  if (value.look !== undefined && (typeof value.look !== 'string' || !WORD.test(value.look))) return null;
  if ((value.size !== undefined && !SIZES.includes(value.size)) || (value.align !== undefined && !ALIGNS.includes(value.align))) return null;
  return {
    block: value.block,
    ...(typeof value.look === 'string' && { look: value.look }),
    ...(value.size !== undefined && { size: value.size as 'fit' | 'fill' }),
    ...(value.align !== undefined && { align: value.align as 'start' | 'center' | 'spread' }),
  };
}

/** The card a statblock is laid out on: undefined for none, null when it is malformed. */
export function parseSheetCard(value: unknown): SheetCard | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.description !== 'boolean') return null;
  const { width, columnWidth, maxColumns } = value;
  if (!within(width, MIN_CARD_WIDTH, MAX_CARD_WIDTH) || !within(columnWidth, MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH)) return null;
  if (!within(maxColumns, 1, MAX_CARD_COLUMNS) || !Number.isInteger(maxColumns)) return null;
  return { width, columnWidth, maxColumns, description: value.description };
}
