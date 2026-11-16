import { useEffect, useState } from 'react';
import type { AnyAsset } from '../types';
import type { SelectionState } from './useSelectionHandlers';

/** A card for the grid to bring into view and focus, once: a new request is a new object. */
export interface GridReveal {
  id: string;
}

/** Cards of the tab shown to find once the collection `collection` is loaded. */
interface PendingReveal {
  collection: string;
  ids: readonly string[];
}

export interface RevealMovedDeps {
  selectedCollection: string;
  changeCollection: (collectionId: string) => void;
  assets: readonly AnyAsset[];
  assetsLoading: boolean;
  sel: Pick<SelectionState, 'handleNavigateToFolder' | 'setSelectedAssetIds'>;
}

export interface RevealMoved {
  /** The card the grid is asked to bring into view and focus. */
  gridReveal: GridReveal | null;
  /** Opens the folder `folderId` of the tab shown (null: its top level), with the cards `ids` there selected. */
  inFolder: (folderId: string | null, ids: readonly string[]) => void;
  /** Opens the collection `collectionId` and shows the cards `ids` there, as `inFolder` does. */
  inCollection: (collectionId: string, ids: readonly string[]) => void;
}

/**
 * Where a move notice's button takes the GM (decision #37): the folder or collection the cards went to, with the
 * cards selected, scrolled into view and focused, so the button shows the result it names. The cards are found in the
 * tab's list once it holds the collection they went to, which a collection's own load comes first for.
 */
export function useRevealMoved({ selectedCollection, changeCollection, assets, assetsLoading, sel }: RevealMovedDeps): RevealMoved {
  const [pending, setPending] = useState<PendingReveal | null>(null);
  const [gridReveal, setGridReveal] = useState<GridReveal | null>(null);

  useEffect(() => {
    if (!pending || pending.collection !== selectedCollection || assetsLoading) return;
    setPending(null);
    const wanted = new Set(pending.ids);
    const found = assets.filter((asset) => wanted.has(asset.id));
    const [first] = found;
    if (!first) return;
    sel.handleNavigateToFolder(first.folderId ?? null);
    sel.setSelectedAssetIds(found.map((asset) => asset.id));
    setGridReveal({ id: first.id });
  }, [pending, selectedCollection, assets, assetsLoading]);

  return {
    gridReveal,
    inFolder: (folderId, ids) => {
      sel.handleNavigateToFolder(folderId);
      setPending({ collection: selectedCollection, ids });
    },
    inCollection: (collectionId, ids) => {
      changeCollection(collectionId);
      setPending({ collection: collectionId, ids });
    },
  };
}
