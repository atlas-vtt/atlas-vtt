import type * as React from 'react';
import type { AnyAsset } from '../types';

/** How long a notice that a move left something in place stays: it names the assets and the reason. */
export const MOVE_PROBLEM_TOAST_MS = 6000;

/** A move the grid already shows, before its files have moved. */
export interface ShownMove {
  /** Puts the assets of `ids` back as they were before the move: the move left them where they were. */
  restore(ids: Iterable<string>): void;
  /** The names of the assets of `ids` the move took out of their place. */
  names(ids: Iterable<string>): string[];
  /** The assets of `ids` the move took out of their place, as they were before it. */
  assets(ids: Iterable<string>): AnyAsset[];
}

/**
 * Shows a move at once (decision #30): each asset of `ids` takes the place `moved` gives it, or leaves the list where
 * that is null. A move is reversible and fails seldom, so the card leaves as the GM lets go and not when the vault has
 * moved its files a third of a second later; one the move leaves in place comes back through `restore`.
 */
export function showMove(
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>,
  ids: readonly string[],
  moved: (asset: AnyAsset) => AnyAsset | null,
): ShownMove {
  const moving = new Set(ids);
  const before = new Map<string, AnyAsset>();
  setAssets((previous) => previous.flatMap((asset) => {
    if (!moving.has(asset.id)) return [asset];
    before.set(asset.id, asset);
    const shown = moved(asset);
    return shown ? [shown] : [];
  }));
  return {
    restore: (restored) => setAssets((previous) => withRestored(previous, before, restored)),
    names: (of) => [...of].flatMap((id) => before.get(id)?.name ?? []),
    assets: (of) => [...of].flatMap((id) => before.get(id) ?? []),
  };
}

/** `assets` with those of `ids` put back to how `before` holds them: in their place where still listed, else added. */
export function withRestored(assets: readonly AnyAsset[], before: ReadonlyMap<string, AnyAsset>, ids: Iterable<string>): AnyAsset[] {
  const back = new Map<string, AnyAsset>();
  for (const id of ids) {
    const asset = before.get(id);
    if (asset) back.set(id, asset);
  }
  if (back.size === 0) return [...assets];
  const restored = assets.map((asset) => {
    const original = back.get(asset.id);
    if (!original) return asset;
    back.delete(asset.id);
    return original;
  });
  return [...restored, ...back.values()];
}
