import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { AnyAsset } from '../types';
import type { AssetContextMenuDeps } from './assetContextMenu';
import type { TransferMode } from '../../../../services/assetTransfer/transferPlan';
import { playerCharacterEntry, setPlayerCharacters } from '../../../../react/components/context-menu/playerCharacterMenu';
import { hasAssetTag } from '../../../../services/tagGroups';
import { runInBackground } from '../../../../utils/backgroundTask';
import { TagSearchModal } from '../TagSearchModal';
import type { AssetTagChange } from '../utils/assetTags';
import { COLLECTION_ICON } from '../components/collectionGlyph';
import { t } from '../../../../i18n';

/** Player character or no longer: the selected tokens, the clicked one decides which way. */
function playerCharacterEntries(asset: AnyAsset, selectedAssets: AnyAsset[], deps: AssetContextMenuDeps): ContextMenuEntry[] {
  const { assetService } = deps;
  if (asset.type !== 'tokens' || !assetService) return [];
  const tokenIds = selectedAssets.filter((a) => a.type === 'tokens').map((a) => a.id);
  return [playerCharacterEntry(asset.playerCharacter === true, (on) => runInBackground(
    setPlayerCharacters(deps.app, assetService, tokenIds, on),
    'Marking player characters',
    t('token.playerCharacterFailed'),
  ))];
}

function moveEntries(asset: AnyAsset, selectedAssets: AnyAsset[], deps: AssetContextMenuDeps): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  if (deps.canMoveToFolder) {
    entries.push({ type: 'item', label: t('am.menu.moveToFolder'), icon: 'folder-input', onClick: () => deps.setIsMoveModalOpen(true) });
  }
  // The collection is chosen in a dialog with a search, as the folder is (decision #41): a submenu of every
  // collection was cut at narrow widths and could not be searched.
  if (deps.transferTargets.length > 0) {
    const pickRow = (label: string, icon: string, mode: TransferMode): ContextMenuEntry => ({
      type: 'item', label, icon, onClick: () => deps.pickCollection(selectedAssets, mode),
    });
    entries.push(
      pickRow(t('am.menu.moveToCollection'), COLLECTION_ICON, 'move'),
      pickRow(t('am.menu.copyToCollection'), 'copy', 'copy'),
    );
  }
  return entries;
}

function tagsEntry(asset: AnyAsset, deps: AssetContextMenuDeps): ContextMenuEntry {
  return {
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
        onSetTags: (changes: AssetTagChange[]) => { void deps.setTagsOfAssets(changes); },
        onCreateTag: (tagName: string, modalSelectedAssets: AnyAsset[]) => {
          const applyNewTag = async (): Promise<void> => {
            const tag = await deps.handleCreateTag(tagName);
            if (!tag) return;
            await deps.setTagsOfAssets(modalSelectedAssets
              .filter((sa) => !hasAssetTag(sa.tags, tag))
              .map((sa) => ({ asset: sa, tags: [...(sa.tags || []), tag.name] })));
          };
          runInBackground(applyNewTag(), `Creating tag ${tagName}`);
        },
      });
      modal.open();
    },
  };
}

/** The menu's group that files the asset: player character, folder, collection and tags. */
export function assetOrganiseEntries(asset: AnyAsset, selectedAssets: AnyAsset[], deps: AssetContextMenuDeps): ContextMenuEntry[] {
  return [
    ...playerCharacterEntries(asset, selectedAssets, deps),
    ...moveEntries(asset, selectedAssets, deps),
    tagsEntry(asset, deps),
  ];
}
