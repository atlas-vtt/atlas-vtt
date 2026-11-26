import { showAtlasToast, type AtlasToastHandle } from '../../../../react/components/AtlasToast';
import { t } from '../../../../i18n';
import type { AnyAsset } from '../types';

/** How long the notice of a move stays: time to read where the cards went and to reach its button. */
export const MOVED_TOAST_MS = 6000;

const KIND_COUNT = {
  tokens: 'count.tokens',
  scenes: 'count.scenes',
  maps: 'count.maps',
  encounters: 'count.encounters',
} as const satisfies Record<AnyAsset['type'], string>;

/** What a notice calls the moved assets: the one asset by name, else how many of their kind ("3 tokens"). */
export function movedWhat(assets: readonly Pick<AnyAsset, 'name' | 'type'>[]): string {
  const [first] = assets;
  if (assets.length === 1 && first) return t('common.quoted', { name: first.name });
  const kind = first && assets.every((asset) => asset.type === first.type) ? KIND_COUNT[first.type] : 'count.items';
  return t(kind, { count: assets.length });
}

/** What the Move dialog calls the selected assets ("Rogue", "3 tokens"); a selection the list does not hold whole is counted as items. */
export function selectionWhat(assets: readonly AnyAsset[], ids: readonly string[]): string {
  const wanted = new Set(ids);
  const selected = assets.filter((asset) => wanted.has(asset.id));
  return selected.length === ids.length ? movedWhat(selected) : t('count.items', { count: ids.length });
}

/** Where a move took the assets, as its notice names it and its button opens it. */
export interface MoveDestination {
  /** "Moved "Rogue" to Empty folder". */
  message: string;
  /** The button's label: "Open folder", "Open collection". */
  openLabel: string;
  open: () => void;
}

/**
 * Says where a move took the assets (decision #32): the notice names them and the destination, and its button goes
 * there. The card left its place without a word before, and a newcomer could not tell a move from a loss.
 */
export function showMovedNotice(destination: MoveDestination): AtlasToastHandle {
  return showAtlasToast(destination.message, MOVED_TOAST_MS, { label: destination.openLabel, run: destination.open });
}

/** The notice of assets moved into the folder `folderName`, or to the tab's top level where that is null. */
export function folderDestination(moved: readonly AnyAsset[], folderName: string | null, open: () => void): MoveDestination {
  const what = movedWhat(moved);
  return folderName === null
    ? { message: t('am.move.movedToRoot', { what }), openLabel: t('am.move.openRoot'), open }
    : { message: t('transfer.moved', { what, target: folderName }), openLabel: t('am.move.openFolder'), open };
}
