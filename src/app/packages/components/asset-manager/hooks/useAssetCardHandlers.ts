import type * as React from 'react';
import { useMemo } from 'react';
import type { App } from 'obsidian';
import type { AnyAsset, SelectionEvent, TokenAsset } from '../types';
import type { OpenAsset } from './useOpenAsset';
import type { MenuAnchor } from '../utils/menuAnchor';
import { useStableCallback } from '../../../../react/hooks/useStableCallback';
import { runInBackground } from '../../../../utils/backgroundTask';
import { openTokenStatblock } from '../utils/openTokenStatblock';

export interface DraggedItems {
  type: 'asset' | 'folder';
  ids: string[];
}

/** Everything an asset card can trigger; every function keeps one identity so memoized cards stay put. */
export interface AssetCardHandlers {
  onSelect: (assetId: string, event?: SelectionEvent, toggle?: boolean) => void;
  onContextMenu: (asset: AnyAsset, anchor: MenuAnchor) => void;
  onOpen: (asset: AnyAsset, spawnCount: number) => void;
  /** Asks to delete the selection, or the asset alone where it is not part of it (the Delete key). */
  onDelete: (asset: AnyAsset) => void;
  onDragStart: (assetId: string, event: React.DragEvent) => void;
  onDragEnd: () => void;
  onSpawnCountChange: (assetId: string, count: number) => void;
  /** Opens a token's statblock note; a note that is gone opens the dialog to link another. */
  onOpenStatblock: (asset: TokenAsset) => void;
  /** A card on screen still waits for its art (`useArtPriority`). */
  onArtNeeded: (assetId: string) => void;
}

interface AssetCardHandlerDeps {
  app: App;
  openAsset: OpenAsset;
  selectedAssetIds: string[];
  setDraggedItems: React.Dispatch<React.SetStateAction<DraggedItems | null>>;
  onAssetSelect: AssetCardHandlers['onSelect'];
  onAssetContextMenu: AssetCardHandlers['onContextMenu'];
  onAssetDelete: AssetCardHandlers['onDelete'];
  onSpawnCountChange: AssetCardHandlers['onSpawnCountChange'];
  onArtNeeded: AssetCardHandlers['onArtNeeded'];
  /** Opens the dialog that links a token to a statblock. */
  onLinkStatblock: (asset: TokenAsset) => void;
  /** Closes the asset manager, which would cover a statblock pair opening behind it. */
  onClose?: (() => void) | undefined;
}

export function useAssetCardHandlers(deps: AssetCardHandlerDeps): AssetCardHandlers {
  const onSelect = useStableCallback(deps.onAssetSelect);
  const onContextMenu = useStableCallback(deps.onAssetContextMenu);
  const onDelete = useStableCallback(deps.onAssetDelete);
  const onSpawnCountChange = useStableCallback(deps.onSpawnCountChange);
  const onOpen = useStableCallback((asset: AnyAsset, spawnCount: number): void => {
    runInBackground(deps.openAsset(asset, spawnCount), `Opening asset ${asset.name}`, 'Could not open the asset');
  });
  const onDragStart = useStableCallback((assetId: string, event: React.DragEvent): void => {
    const { selectedAssetIds } = deps;
    deps.setDraggedItems({ type: 'asset', ids: selectedAssetIds.includes(assetId) ? selectedAssetIds : [assetId] });
    event.dataTransfer.effectAllowed = 'move';
  });
  const onDragEnd = useStableCallback((): void => deps.setDraggedItems(null));
  const onOpenStatblock = useStableCallback((asset: TokenAsset): void => {
    openTokenStatblock(deps.app, asset, { onMissing: deps.onLinkStatblock, onEditorOpened: deps.onClose });
  });
  const onArtNeeded = useStableCallback(deps.onArtNeeded);

  return useMemo(
    () => ({ onSelect, onContextMenu, onOpen, onDelete, onDragStart, onDragEnd, onSpawnCountChange, onOpenStatblock, onArtNeeded }),
    [onSelect, onContextMenu, onOpen, onDelete, onDragStart, onDragEnd, onSpawnCountChange, onOpenStatblock, onArtNeeded],
  );
}
