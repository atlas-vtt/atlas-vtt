import type * as React from 'react';
import { useMemo } from 'react';
import type { App } from 'obsidian';
import type { AnyAsset, SelectionEvent } from '../types';
import type { OpenAsset } from './useOpenAsset';
import { useStableCallback } from '../../../../react/hooks/useStableCallback';
import { runInBackground } from '../../../../utils/backgroundTask';
import { editInStatblockPane } from '../../../../statblocks/editor/create/entryPoints';

export interface DraggedItems {
  type: 'asset' | 'folder';
  ids: string[];
}

/** Everything an asset card can trigger; every function keeps one identity so memoized cards stay put. */
export interface AssetCardHandlers {
  onSelect: (assetId: string, event?: SelectionEvent, toggle?: boolean) => void;
  onContextMenu: (asset: AnyAsset, event: React.MouseEvent) => void;
  onOpen: (asset: AnyAsset, spawnCount: number) => void;
  onDragStart: (assetId: string, event: React.DragEvent) => void;
  onDragEnd: () => void;
  onSpawnCountChange: (assetId: string, count: number) => void;
  onOpenStatblock: (statblockPath: string) => void;
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
  onSpawnCountChange: AssetCardHandlers['onSpawnCountChange'];
  onArtNeeded: AssetCardHandlers['onArtNeeded'];
  /** Closes the asset manager, which would cover a statblock pair opening behind it. */
  onClose?: (() => void) | undefined;
}

export function useAssetCardHandlers(deps: AssetCardHandlerDeps): AssetCardHandlers {
  const onSelect = useStableCallback(deps.onAssetSelect);
  const onContextMenu = useStableCallback(deps.onAssetContextMenu);
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
  const onOpenStatblock = useStableCallback((statblockPath: string): void => {
    // The pane takes the collection from the tokens that link the note (§7.1).
    if (editInStatblockPane(deps.app, statblockPath, { collectionId: null, from: 'asset-manager' })) {
      deps.onClose?.();
      return;
    }
    void deps.app.workspace.openLinkText('', statblockPath, true);
  });
  const onArtNeeded = useStableCallback(deps.onArtNeeded);

  return useMemo(
    () => ({ onSelect, onContextMenu, onOpen, onDragStart, onDragEnd, onSpawnCountChange, onOpenStatblock, onArtNeeded }),
    [onSelect, onContextMenu, onOpen, onDragStart, onDragEnd, onSpawnCountChange, onOpenStatblock, onArtNeeded],
  );
}
