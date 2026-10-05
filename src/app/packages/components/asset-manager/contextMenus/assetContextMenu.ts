import type * as React from 'react';
import { App as ObsidianApp } from 'obsidian';
import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type {
  AnyAsset,
  CollectionOption,
  Folder,
  InputModalState,
  Tag as TagType,
} from '../types';
import {
  spawnEncounterTokens,
  spawnSelectedTokens,
  spawnTokenAsset,
  type SpawnContext,
} from '../utils/tokenSpawnService';
import { SPAWN_MULTIPLE_COUNTS } from '../utils/spawnCount';
import type { AssetService } from '../../../../services/AssetService';
import { renameScene } from '../../../../services/sceneRename';
import { TagSearchModal } from '../TagSearchModal';
import { runInBackground } from '../../../../utils/backgroundTask';
import { confirmAction } from '../../../../ui/confirmDialog';
import type { AtlasView } from '../../../../atlas-view';
import { applyTokenDeleteImpact, describeTokenDeleteImpact, findTokenDeleteImpact } from '../utils/tokenDeleteImpact';
import { tokenSizeSubmenu } from '../../../../react/components/context-menu/tokenSizeMenu';
import type { TransferMode } from '../../../../services/assetTransfer/transferPlan';
import type { CreateScenePrefill } from '../hooks/useAssetCrud';
import { scenePrefillFromMap } from '../utils/sceneCreation';
import { openScene } from '../hooks/useOpenAsset';

export interface AssetContextMenuDeps {
  app: ObsidianApp;
  view: AtlasView | null;
  assetService: AssetService | null;
  onClose: () => void;
  // State setters
  setEditingToken: (asset: AnyAsset | null) => void;
  setIsTokenCreatorOpen: (open: boolean) => void;
  setIsMoveModalOpen: (open: boolean) => void;
  openCreateScene: (prefill: CreateScenePrefill) => void;
  setInputModalState: (state: InputModalState) => void;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  setSelectedAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
  loadAssetsForActiveTab: () => Promise<void>;
  handleCreateTag: (tag: string) => Promise<TagType | null>;
  setAssetTags: (asset: AnyAsset, tags: string[]) => Promise<void>;
  handleSaveAsEncounter: (tokenAssets: AnyAsset[]) => Promise<void>;
  openStatblockLinkModal: (asset: AnyAsset) => void;
  unlinkStatblock: (asset: AnyAsset) => Promise<void>;
  deleteAssetFromVault: (asset: { id: string; name: string }) => Promise<boolean>;
  transferToCollection: (assets: AnyAsset[], target: CollectionOption, mode: TransferMode) => void;
  // Data
  selectedAssetIds: string[];
  assets: AnyAsset[];
  folders: Folder[];
  availableTags: TagType[];
  /** Collections the assets can be moved or copied to. */
  transferTargets: CollectionOption[];
}

export function buildAssetContextMenuEntries(
  asset: AnyAsset,
  selectedAssets: AnyAsset[],
  deps: AssetContextMenuDeps
): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  const spawnCtx: SpawnContext = {
    app: deps.app,
    view: deps.view,
    assetService: deps.assetService,
  };

  // ── Create Scene from Map ─────────────────────────────────────
  if (asset.type === 'maps') {
    entries.push({
      type: 'item',
      label: 'Create Scene',
      icon: 'clapperboard',
      onClick: () => deps.openCreateScene(scenePrefillFromMap(asset)),
    });
  }

  // ── Open Scene (single scene) ─────────────────────────────────
  if (asset.type === 'scenes' && selectedAssets.length === 1) {
    entries.push({
      type: 'item',
      label: 'Open Scene',
      icon: 'play',
      onClick: () => runInBackground(openScene(deps, asset.id), `Opening scene ${asset.id}`, 'Could not open the scene'),
    });
  }

  // ── Spawn Encounter ───────────────────────────────────────────
  if (asset.type === 'encounters') {
    entries.push({
      type: 'item',
      label: 'Spawn Encounter',
      icon: 'target',
      onClick: async () => {
        const ids = await spawnEncounterTokens(spawnCtx, asset);
        if (ids.length > 0) deps.onClose();
      },
    });
  }

  // ── Spawn Token(s) on Map ─────────────────────────────────────
  if (asset.type === 'tokens') {
    const spawnCount = selectedAssets.filter((a) => a.type === 'tokens').length;
    entries.push({
      type: 'item',
      label: spawnCount > 1 ? `Spawn ${spawnCount} Tokens on Map` : 'Spawn on Map',
      icon: 'map-pin',
      onClick: async () => {
        const ids = await spawnSelectedTokens(spawnCtx, selectedAssets);
        if (ids.length > 0) deps.onClose();
      },
    });
    if (spawnCount <= 1) {
      entries.push({
        type: 'submenu',
        label: 'Spawn Multiple',
        icon: 'copy-plus',
        children: SPAWN_MULTIPLE_COUNTS.map((count) => ({
          type: 'item' as const,
          label: `${count} tokens`,
          onClick: async (): Promise<void> => {
            const ids = await spawnTokenAsset(spawnCtx, asset, count);
            if (ids.length > 0) deps.onClose();
          },
        })),
      });
    }
  }

  // ── Save as Encounter (multi-select tokens) ───────────────────
  if (asset.type === 'tokens' && selectedAssets.length > 1) {
    const tokenAssets = selectedAssets.filter((a) => a.type === 'tokens');
    entries.push({
      type: 'item',
      label: `Save ${tokenAssets.length} Tokens as Encounter`,
      icon: 'target',
      onClick: () => deps.handleSaveAsEncounter(tokenAssets),
    });
  }

  // ── Edit / Rename ─────────────────────────────────────────────
  if (asset.type === 'tokens') {
    entries.push({
      type: 'item',
      label: 'Edit Token',
      icon: 'edit',
      onClick: () => {
        deps.setEditingToken(asset);
        deps.setIsTokenCreatorOpen(true);
      },
    });
  } else {
    const label =
      asset.type === 'encounters' ? 'Rename Encounter'
      : asset.type === 'maps' ? 'Rename Map'
      : asset.type === 'scenes' ? 'Rename Scene'
      : 'Rename';

    entries.push({
      type: 'item',
      label,
      icon: 'edit',
      onClick: () => {
        deps.setInputModalState({
          isOpen: true,
          title: `Rename "${asset.name}"`,
          placeholder: 'Enter new name',
          defaultValue: asset.name,
          onConfirm: (newName: string) => {
            if (newName.trim() === asset.name) return;
            if (asset.type === 'scenes') {
              const { assetService } = deps;
              if (!assetService) return;
              runInBackground(
                renameScene(deps.app, assetService, asset.id, newName).then(() => deps.loadAssetsForActiveTab()),
                `Renaming scene ${asset.id}`,
                'Could not rename the scene'
              );
              return;
            }
            deps.setAssets((prev) =>
              prev.map((a) => (a.id === asset.id ? { ...a, name: newName.trim() } : a))
            );
            if (deps.assetService) {
              runInBackground(
                deps.assetService.updateAsset(asset.id, { name: newName.trim() }),
                `Renaming asset ${asset.id}`
              );
            }
          },
        });
      },
    });
  }

  // ── Default size (all selected tokens) ────────────────────────
  if (asset.type === 'tokens') {
    const tokenIds = selectedAssets.filter((a) => a.type === 'tokens').map((a) => a.id);
    entries.push(tokenSizeSubmenu(asset.size, (size) => {
      deps.setAssets((prev) => prev.map((a) => (tokenIds.includes(a.id) ? { ...a, size } : a)));
      const service = deps.assetService;
      if (!service) return;
      for (const id of tokenIds) {
        runInBackground(service.updateAsset(id, { size }), `Updating size of asset ${id}`);
      }
    }));
  }

  // ── Statblock link (single token) ─────────────────────────────
  if (asset.type === 'tokens' && selectedAssets.length === 1) {
    const hasStatblock = Boolean(asset.statblockPath);
    entries.push({
      type: 'item',
      label: hasStatblock ? 'Change Statblock' : 'Link Statblock',
      icon: 'file-text',
      onClick: () => deps.openStatblockLinkModal(asset),
    });
    if (hasStatblock) {
      entries.push({
        type: 'item',
        label: 'Unlink Statblock',
        icon: 'unlink',
        onClick: () => deps.unlinkStatblock(asset),
      });
    }
  }


  // ── Move to Folder ────────────────────────────────────────────
  if (deps.folders.filter((f) => f.type === asset.type).length > 0) {
    entries.push({
      type: 'item',
      label: 'Move to Folder',
      icon: 'folder',
      onClick: () => deps.setIsMoveModalOpen(true),
    });
  }

  // ── Move / Copy to another collection ─────────────────────────
  if (deps.transferTargets.length > 0) {
    const collectionSubmenu = (label: string, icon: string, mode: TransferMode): ContextMenuEntry => ({
      type: 'submenu',
      label,
      icon,
      children: deps.transferTargets.map((target) => ({
        type: 'item' as const,
        label: target.name,
        onClick: () => deps.transferToCollection(selectedAssets, target, mode),
      })),
    });
    entries.push(
      collectionSubmenu('Move to Collection', 'folder-input', 'move'),
      collectionSubmenu('Copy to Collection', 'copy', 'copy'),
    );
  }


  // ── Tags ──────────────────────────────────────────────────────
  entries.push({
    type: 'item',
    label: 'Tags',
    icon: 'tag',
    onClick: () => {
      const assetsToTag = deps.selectedAssetIds.includes(asset.id)
        ? deps.assets.filter((a) => deps.selectedAssetIds.includes(a.id))
        : [asset];

      const modal = new TagSearchModal(deps.app, {
        selectedAssets: assetsToTag,
        availableTags: deps.availableTags,
        allAssets: deps.assets,
        onToggleTag: (tagId: string, modalSelectedAssets: AnyAsset[]) => {
          for (const sa of modalSelectedAssets) {
            const currentTags = sa.tags || [];
            const newTags = currentTags.includes(tagId)
              ? currentTags.filter((t) => t !== tagId)
              : [...currentTags, tagId];
            void deps.setAssetTags(sa, newTags);
          }
        },
        onCreateTag: (tagName: string, modalSelectedAssets: AnyAsset[]) => {
          const applyNewTag = async (): Promise<void> => {
            const tag = await deps.handleCreateTag(tagName);
            if (!tag) return;
            await Promise.all(modalSelectedAssets
              .filter((sa) => !(sa.tags || []).includes(tag.id))
              .map((sa) => deps.setAssetTags(sa, [...(sa.tags || []), tag.id])));
          };
          runInBackground(applyNewTag(), `Creating tag ${tagName}`);
        },
      });
      modal.open();
    },
  });


  // ── Delete ────────────────────────────────────────────────────
  const deleteCount = selectedAssets.length;
  entries.push({
    type: 'item',
    label: deleteCount > 1 ? `Delete ${deleteCount} Items` : 'Delete',
    icon: 'trash',
    destructive: true,
    onClick: async () => {
      const msg = deleteCount > 1
        ? `Are you sure you want to delete ${deleteCount} selected items?`
        : `Are you sure you want to delete "${asset.name}"?`;
      const impact = deps.assetService
        ? await findTokenDeleteImpact(deps.app, deps.assetService, selectedAssets)
        : null;
      const confirmed = await confirmAction({
        title: deleteCount > 1 ? 'Delete items' : 'Delete item',
        message: [msg, ...(impact ? describeTokenDeleteImpact(impact) : [])],
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!confirmed) return;

      if (impact) await applyTokenDeleteImpact(deps.app, impact);
      for (const a of selectedAssets) {
        const ok = await deps.deleteAssetFromVault(a);
        if (ok) {
          deps.setAssets((prev) => prev.filter((x) => x.id !== a.id));
          deps.setSelectedAssetIds((prev) => prev.filter((id) => id !== a.id));
        }
      }
      await deps.loadAssetsForActiveTab();
    },
  });

  return entries;
}
