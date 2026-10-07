import type { AnyAsset } from '../types';
import { sameValue } from '../../../../utils/sameValue';

/**
 * `next`, with every asset that did not change taken from `previous`. A reload
 * builds every asset anew, and a card renders again whenever its asset is
 * another object; this way a reload renders only the cards whose asset differs.
 * Returns `previous` itself when the lists hold the same assets in the same
 * order, so the reload renders nothing at all.
 */
export function reconcileAssets(previous: AnyAsset[], next: AnyAsset[]): AnyAsset[] {
  const known = new Map(previous.map((asset) => [asset.id, asset]));
  let unchanged = previous.length === next.length;
  const reconciled = next.map((asset, index) => {
    const before = known.get(asset.id);
    const kept = before && sameValue(before, asset) ? before : asset;
    if (kept !== previous[index]) unchanged = false;
    return kept;
  });
  return unchanged ? previous : reconciled;
}
