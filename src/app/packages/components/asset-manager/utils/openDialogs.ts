import type { AssetCrudActions } from '../hooks/useAssetCrud';
import type { TagsAndCollectionsState } from '../hooks/useTagsAndCollections';
import type { StatblockLinkState } from '../hooks/useStatblockLink';

/**
 * Whether one of the asset manager's own dialogs is open over it (a creator, the encounter
 * builder, Move, New folder, rename, settings, the tag manager, the statblock link, a transfer):
 * the manager's keys then wait, and the dialog takes Escape and Tab for itself.
 */
export function hasOpenDialog(crud: AssetCrudActions, tags: TagsAndCollectionsState, statblock: StatblockLinkState): boolean {
  return Boolean(
    crud.isTokenCreatorOpen || crud.isEncounterBuilderOpen || crud.isMapCreatorOpen ||
    crud.isCreateSceneModalOpen || crud.inputModalState?.isOpen ||
    crud.isMoveModalOpen || (crud.collectionPick ?? null) !== null || crud.isCreateFolderModalOpen ||
    (crud.settingsModalCollectionId ?? null) !== null || crud.isCreateCollectionModalOpen ||
    tags.isTagManagerOpen ||
    (statblock.linkingStatblockAsset ?? null) !== null || (crud.transfer ?? null) !== null,
  );
}
