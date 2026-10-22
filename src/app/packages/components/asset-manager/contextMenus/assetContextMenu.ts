import type * as React from 'react';
import { App as ObsidianApp } from 'obsidian';
import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type {
  AnyAsset,
  EncounterAsset,
  CollectionOption,
  Folder,
  InputModalState,
  Tag as TagType,
} from '../types';
import type { SpawnContext } from '../utils/tokenSpawnService';
import { spawnMenuEntries } from './spawnMenuEntries';
import type { AssetService } from '../../../../services/AssetService';
import { renameScene } from '../../../../services/sceneRename';
import { TagSearchModal } from '../TagSearchModal';
import { runInBackground } from '../../../../utils/backgroundTask';
import { confirmAction } from '../../../../ui/confirmDialog';
import type { AtlasView } from '../../../../atlas-view';
import { applyTokenDeleteImpact, describeTokenDeleteImpact, findTokenDeleteImpact } from '../utils/tokenDeleteImpact';
import { tokenSizeSubmenu } from '../../../../react/components/context-menu/tokenSizeMenu';
import { playerCharacterEntry, setPlayerCharacters } from '../../../../react/components/context-menu/playerCharacterMenu';
import type { TransferMode } from '../../../../services/assetTransfer/transferPlan';
import type { CreateScenePrefill } from '../hooks/useAssetCrud';
import { scenePrefillFromMap } from '../utils/sceneCreation';
import { createStatblockEntry } from '../../../../statblocks/editor/create/entryPoints';
import { copyAssetLink } from '../../../../links/atlasLinkText';
import { t } from '../../../../i18n';
import { diceRandom } from '../../../../services/offlineDiceInputs';

export interface AssetContextMenuDeps {
  app: ObsidianApp;
  view: AtlasView | null;
  assetService: AssetService | null;
  onClose: () => void;
  // State setters
  setEditingToken: (asset: AnyAsset | null) => void;
  setIsTokenCreatorOpen: (open: boolean) => void;
  /** Opens the encounter builder on a saved encounter. */
  editEncounter: (encounter: EncounterAsset) => void;
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
  /** The collection shown, whose roles a new statblock is made with. */
  collectionId: string;
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
    assetService: deps.assetService, random: diceRandom,
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

  // ── Spawn: on the map, or into the initiative tracker ─────────
  entries.push(...spawnMenuEntries(asset, selectedAssets, spawnCtx, deps.onClose));

  // ── Save as Encounter (multi-select tokens) ───────────────────
  if (asset.type === 'tokens' && selectedAssets.length > 1) {
    const tokenAssets = selectedAssets.filter((a) => a.type === 'tokens');
    entries.push({
      type: 'item',
      label: t('am.menu.saveAsEncounter', { count: tokenAssets.length }),
      icon: 'target',
      onClick: () => deps.handleSaveAsEncounter(tokenAssets),
    });
  }

  // ── Edit / Rename ─────────────────────────────────────────────
  if (asset.type === 'encounters' && selectedAssets.length <= 1) {
    entries.push({
      type: 'item',
      label: t('am.menu.editEncounter'),
      icon: 'swords',
      onClick: () => deps.editEncounter(asset),
    });
  }
  if (asset.type === 'tokens') {
    entries.push({
      type: 'item',
      label: t('am.menu.editToken'),
      icon: 'edit',
      onClick: () => {
        deps.setEditingToken(asset);
        deps.setIsTokenCreatorOpen(true);
      },
    });
  } else {
    const label =
      asset.type === 'encounters' ? t('am.menu.renameEncounter')
      : asset.type === 'maps' ? t('am.menu.renameMap')
      : asset.type === 'scenes' ? t('am.menu.renameScene')
      : t('common.rename');

    entries.push({
      type: 'item',
      label,
      icon: 'edit',
      onClick: () => {
        deps.setInputModalState({
          isOpen: true,
          title: t('am.menu.renameTitle', { name: asset.name }),
          placeholder: t('am.menu.newName'),
          defaultValue: asset.name,
          onConfirm: (newName: string) => {
            if (newName.trim() === asset.name) return;
            if (asset.type === 'scenes') {
              const { assetService } = deps;
              if (!assetService) return;
              runInBackground(
                renameScene(deps.app, assetService, asset.id, newName).then(() => deps.loadAssetsForActiveTab()),
                `Renaming scene ${asset.id}`,
                t('am.menu.renameSceneFailed')
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
      label: hasStatblock ? t('am.menu.changeStatblock') : t('am.menu.linkStatblock'),
      icon: 'file-text',
      onClick: () => deps.openStatblockLinkModal(asset),
    });
    if (hasStatblock) {
      entries.push({
        type: 'item',
        label: t('am.menu.unlinkStatblock'),
        icon: 'unlink',
        onClick: () => deps.unlinkStatblock(asset),
      });
    } else {
      const token = { imagePath: asset.imagePath ?? asset.imageUrl, name: asset.name };
      const create = createStatblockEntry(deps.app, { collectionId: deps.collectionId, from: 'asset-manager', token, onStart: deps.onClose });
      if (create) entries.push(create);
    }
  }


  // ── Copy link (a single scene or encounter) ───────────────────
  const { assetService } = deps;
  if ((asset.type === 'scenes' || asset.type === 'encounters') && selectedAssets.length <= 1 && assetService) {
    entries.push({
      type: 'item',
      label: t('atlasLinks.copyLink'),
      icon: 'link',
      onClick: () => runInBackground(copyAssetLink(deps.app, assetService, asset.id), `Copying a link to ${asset.id}`),
    });
  }

  // ── Player character (the selected tokens; the clicked one decides which way) ──
  if (asset.type === 'tokens' && assetService) {
    const tokenIds = selectedAssets.filter((a) => a.type === 'tokens').map((a) => a.id);
    entries.push(playerCharacterEntry(asset.playerCharacter === true, (on) => runInBackground(
      setPlayerCharacters(deps.app, assetService, tokenIds, on),
      'Marking player characters',
      t('token.playerCharacterFailed'),
    )));
  }

  // ── Move to Folder ────────────────────────────────────────────
  if (deps.folders.filter((f) => f.type === asset.type).length > 0) {
    entries.push({
      type: 'item',
      label: t('am.menu.moveToFolder'),
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
      collectionSubmenu(t('am.menu.moveToCollection'), 'folder-input', 'move'),
      collectionSubmenu(t('am.menu.copyToCollection'), 'copy', 'copy'),
    );
  }


  // ── Tags ──────────────────────────────────────────────────────
  entries.push({
    type: 'item',
    label: t('am.menu.tags'),
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
    label: deleteCount > 1 ? t('am.menu.deleteItems', { count: deleteCount }) : t('common.delete'),
    icon: 'trash',
    destructive: true,
    onClick: async () => {
      const msg = deleteCount > 1
        ? t('am.menu.confirmDeleteMany', { count: deleteCount })
        : t('am.menu.confirmDelete', { name: asset.name });
      const impact = deps.assetService
        ? await findTokenDeleteImpact(deps.app, deps.assetService, selectedAssets)
        : null;
      const confirmed = await confirmAction({
        title: deleteCount > 1 ? t('am.menu.deleteItemsTitle') : t('am.menu.deleteItemTitle'),
        message: [msg, ...(impact ? describeTokenDeleteImpact(impact) : [])],
        confirmLabel: t('common.delete'),
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
