import type { AnyAsset } from '../types';
import { isRecord } from '../../../../utils/guards';

/** Whether two values of an asset are the same data: primitives, arrays and plain objects, compared in depth. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameValue(a[key], b[key]));
}

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
