import { maskBytes } from '../exploredMaskAlpha.ts';
import type { Removal } from '../exploredRemovals.ts';
import type { MemoryGrid, MemoryImages, MemoryPng } from './memoryPorts.ts';

/** What a removal takes from each player's memory of a floor: all of it, nothing, or the coverage the party's lost there. */
export type Loss = { readonly kind: 'all' } | { readonly kind: 'none' } | { readonly kind: 'part'; readonly lost: Uint8Array };

const NONE: Loss = { kind: 'none' };
const ALL: Loss = { kind: 'all' };

/** The coverage of a saved party memory (a data URL) at the grid's size; null for none or one that cannot be read. */
async function coverageOf(images: MemoryImages, mask: string | null, grid: Pick<MemoryGrid, 'columns' | 'rows'>): Promise<Uint8Array | null> {
  const bytes = maskBytes(mask);
  return bytes === null ? null : images.coverage(bytes, grid.columns, grid.rows);
}

/**
 * What players lose of a floor where the party's memory went from `before` to `after`: everything where
 * nothing is left of the party's (Forget explored areas, a memory gone), else the share of each texel the
 * party's lost, so what a player saw where the party still remembers, or never remembered, stays.
 */
export async function lossOf(removal: Removal, images: MemoryImages, grid: Pick<MemoryGrid, 'columns' | 'rows'>): Promise<Loss> {
  const after = await coverageOf(images, removal.after, grid);
  if (after === null || after.every((share) => share === 0)) return ALL;
  const before = await coverageOf(images, removal.before, grid);
  if (before === null) return NONE;
  const lost = new Uint8Array(before.length);
  let any = false;
  for (let index = 0; index < lost.length; index += 1) {
    const share = Math.max(0, before[index]! - (after[index] ?? 0));
    lost[index] = share;
    any ||= share > 0;
  }
  return any ? { kind: 'part', lost } : NONE;
}

/** A player's memory `png` after `loss`: each texel keeps its share outside what was lost; null where nothing is left. */
export async function afterLoss(png: MemoryPng | null, loss: Loss, images: MemoryImages, grid: Pick<MemoryGrid, 'columns' | 'rows'>): Promise<MemoryPng | null> {
  if (loss.kind === 'all' || png === null) return null;
  if (loss.kind === 'none') return png;
  const coverage = await images.coverage(png, grid.columns, grid.rows);
  if (coverage === null) return null;
  let left = false;
  for (let index = 0; index < coverage.length; index += 1) {
    const share = Math.round((coverage[index]! * (255 - (loss.lost[index] ?? 0))) / 255);
    coverage[index] = share;
    left ||= share > 0;
  }
  return left ? images.png(coverage, grid.columns, grid.rows) : null;
}

/** The width and height a PNG's header gives; null for bytes that are no PNG. */
function pngSize(png: MemoryPng): { readonly width: number; readonly height: number } | null {
  if (png.length < 24 || png[12] !== 0x49 || png[13] !== 0x48 || png[14] !== 0x44 || png[15] !== 0x52) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Two memories of one floor as one: each texel keeps the larger coverage of the two, at the size `a` has; `b` where `a` cannot be read. */
export async function mergedMemory(a: MemoryPng, b: MemoryPng, images: MemoryImages): Promise<MemoryPng> {
  const size = pngSize(a) ?? pngSize(b);
  const [first, second] = size === null ? [null, null] : await Promise.all([images.coverage(a, size.width, size.height), images.coverage(b, size.width, size.height)]);
  if (size === null || first === null) return b;
  if (second === null) return a;
  for (let index = 0; index < first.length; index += 1) first[index] = Math.max(first[index]!, second[index] ?? 0);
  return images.png(first, size.width, size.height);
}
