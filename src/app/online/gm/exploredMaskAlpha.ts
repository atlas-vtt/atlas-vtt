import type { MapSize } from './moveCheck.ts';

/** How much of the map players remember, as a grid of shares over it (0 to 255), row by row. */
export interface MaskAlpha {
  readonly width: number;
  readonly height: number;
  readonly alpha: Uint8Array;
}

/** Reads a saved explored memory (a data URL) as shares; null for none that can be read. */
export type MaskDecoder = (mask: string) => Promise<MaskAlpha | null>;

const PNG_DATA_URL = 'data:image/png;base64,';
/** The longest side the memory is read at: a cell of it is a few map pixels, and only a cell remembered whole counts. */
const MAX_SIDE = 1_024;
/** The share from which a cell of the grid counts as remembered: all of it, less what an image's rounding takes. */
const REMEMBERED = 250;

/** The PNG bytes of a saved explored memory (a data URL), or null for none or anything else. */
export function maskBytes(mask: string | null): Uint8Array<ArrayBuffer> | null {
  if (mask === null || !mask.startsWith(PNG_DATA_URL)) return null;
  try {
    const text = atob(mask.slice(PNG_DATA_URL.length));
    return Uint8Array.from(text, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * The saved explored memory as shares over the map (it is saved white, its coverage as alpha),
 * read at no more than `MAX_SIDE` cells a side: a cell's share is then the mean over the texels
 * it stands for. Null for a memory that cannot be read.
 */
export async function decodeMaskAlpha(mask: string): Promise<MaskAlpha | null> {
  const bytes = maskBytes(mask);
  if (bytes === null) return null;
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const fit = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height, 1));
    const width = Math.max(1, Math.round(bitmap.width * fit));
    const height = Math.max(1, Math.round(bitmap.height * fit));
    const context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
    if (context === null) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    const alpha = new Uint8Array(width * height);
    for (let index = 0; index < alpha.length; index += 1) alpha[index] = data[index * 4 + 3]!;
    return { width, height, alpha };
  } catch {
    return null;
  }
}

/**
 * Whether players remember the map at a place: the cell of the memory it lies in is remembered
 * whole. A cell the memory's edge passes through is not, so a place just behind the wall of a
 * remembered room never counts for the room.
 */
export function rememberedAt(mask: MaskAlpha, map: MapSize, x: number, y: number): boolean {
  if (!(map.width > 0) || !(map.height > 0) || !(x >= 0) || !(y >= 0) || x >= map.width || y >= map.height) return false;
  const column = Math.min(mask.width - 1, Math.floor((x / map.width) * mask.width));
  const row = Math.min(mask.height - 1, Math.floor((y / map.height) * mask.height));
  return (mask.alpha[row * mask.width + column] ?? 0) >= REMEMBERED;
}
