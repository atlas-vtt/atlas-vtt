import { maskBytes } from '../exploredMaskAlpha.ts';
import type { Removal } from '../exploredRemovals.ts';
import type { MemoryImages, MemoryPng } from './memoryPorts.ts';

/** A memory's size in texels (`exploredGrid`). */
export interface MemoryGrid {
  readonly columns: number;
  readonly rows: number;
}

/** What a removal takes from each player's memory of a floor: all of it, nothing, or the coverage the party's lost there. */
export type Loss = { readonly kind: 'all' } | { readonly kind: 'none' } | { readonly kind: 'part'; readonly lost: Uint8Array };

const NONE: Loss = { kind: 'none' };
const ALL: Loss = { kind: 'all' };

/** The coverage of a saved party memory (a data URL) at the grid's size; null for none or one that cannot be read. */
async function coverageOf(images: MemoryImages, mask: string | null, grid: MemoryGrid): Promise<Uint8Array | null> {
  const bytes = maskBytes(mask);
  return bytes === null ? null : images.coverage(bytes, grid.columns, grid.rows);
}

/**
 * What players lose of a floor where the party's memory went from `before` to `after`: everything where
 * nothing is left of the party's (Forget explored areas, a memory gone), else the share of each texel the
 * party's lost, so what a player saw where the party still remembers, or never remembered, stays.
 */
export async function lossOf(removal: Extract<Removal, { kind: 'lost' }>, images: MemoryImages, grid: MemoryGrid): Promise<Loss> {
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
export async function afterLoss(png: MemoryPng | null, loss: Loss, images: MemoryImages, grid: MemoryGrid): Promise<MemoryPng | null> {
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
