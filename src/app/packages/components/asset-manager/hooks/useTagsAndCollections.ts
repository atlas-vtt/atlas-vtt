import type * as React from 'react';
import { useState, useCallback } from 'react';
import type { AnyAsset, Tag } from '../types';
import type { AssetService } from '../../../../services/AssetService';
import { hasAssetTag, type TagGroup } from '../../../../services/tagGroups';
import { showAtlasToast } from '../../../../react/components/AtlasToast';
import { tagGroupOfTab, type AssetTagChange, type TagsByGroup } from '../utils/assetTags';
import { t } from '../../../../i18n';

export interface TagsAndCollectionsState {
  // Tag manager modal
  isTagManagerOpen: boolean;
  setIsTagManagerOpen: (open: boolean) => void;
  // Tag CRUD within one tag group of the selected collection
  handleCreateTag: (group: TagGroup, tag: string) => Promise<Tag | null>;
  handleUpdateTag: (group: TagGroup, tagId: string, name: string) => Promise<void>;
  handleDeleteTag: (group: TagGroup, tagId: string) => Promise<void>;
  /** Replaces the tags of several assets in one save: shown at once, restored if saving fails. */
  setTagsOfAssets: (changes: AssetTagChange[]) => Promise<void>;
  /** Replaces an asset's tags, as `setTagsOfAssets` does. */
  setAssetTags: (asset: AnyAsset, tags: string[]) => Promise<void>;
  // Collection CRUD
  handleUpdateCollection: (collectionId: string, name: string) => Promise<void>;
  handleDeleteCollection: (collectionId: string) => Promise<void>;
}

export function useTagsAndCollections(
  assetService: AssetService | null,
  collection: string,
  tagsByGroup: TagsByGroup,
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>,
  reloadCollections: () => Promise<void>,
  reloadGlobalTags: () => Promise<void>
): TagsAndCollectionsState {
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);

  /** Rewrites the tags of the loaded assets that belong to `group`. */
  const retagAssets = useCallback((group: TagGroup, retag: (tags: string[]) => string[]): void => {
    setAssets(prev => prev.map(asset =>
      tagGroupOfTab(asset.type) === group ? { ...asset, tags: retag(asset.tags ?? []) } : asset));
  }, [setAssets]);

  const handleCreateTag = useCallback(async (group: TagGroup, tag: string): Promise<Tag | null> => {
    if (!assetService) return null;
    try {
      const { id, name } = await assetService.createTag(collection, group, tag);
      await reloadGlobalTags();
      return { id, name };
    } catch (error) {
      console.error('[AssetManager] Failed to create tag:', error);
      showAtlasToast(t('am.tag.createFailed'));
      return null;
    }
  }, [assetService, collection, reloadGlobalTags]);

  const handleUpdateTag = useCallback(async (group: TagGroup, tagId: string, name: string): Promise<void> => {
    if (!assetService) return;
    const previous = tagsByGroup[group].find(t => t.id === tagId);
    try {
      const renamed = await assetService.renameTag(collection, group, tagId, name);
      retagAssets(group, tags => tags.map(value =>
        value === tagId ? renamed.id : value === previous?.name ? renamed.name : value));
      await reloadGlobalTags();
    } catch (error) {
      console.error('[AssetManager] Failed to rename tag:', error);
      showAtlasToast(t('am.tag.renameFailed'));
    }
  }, [assetService, collection, tagsByGroup, retagAssets, reloadGlobalTags]);

  const handleDeleteTag = useCallback(async (group: TagGroup, tagId: string): Promise<void> => {
    if (!assetService) return;
    const tag = tagsByGroup[group].find(t => t.id === tagId) ?? { id: tagId, name: tagId };
    try {
      await assetService.deleteTag(collection, group, tagId);
      retagAssets(group, tags => tags.filter(value => !hasAssetTag([value], tag)));
      await reloadGlobalTags();
    } catch (error) {
      console.error('[AssetManager] Failed to delete tag:', error);
      showAtlasToast(t('am.tag.deleteFailed'));
    }
  }, [assetService, collection, tagsByGroup, retagAssets, reloadGlobalTags]);

  const setTagsOfAssets = useCallback(async (changes: AssetTagChange[]): Promise<void> => {
    if (!assetService || changes.length === 0) return;
    const changeOf = new Map(changes.map((change) => [change.asset.id, change]));
    setAssets(prev => prev.map(a => {
      const change = changeOf.get(a.id);
      return change ? { ...a, tags: change.tags } : a;
    }));
    try {
      await assetService.updateTagsOfAssets(changes.map(({ asset, tags }) => ({ id: asset.id, tags })));
    } catch (error) {
      console.error('[AssetManager] Failed to update asset tags:', error);
      // Restore the previous tags unless a later edit replaced these meanwhile.
      setAssets(prev => prev.map(a => {
        const change = changeOf.get(a.id);
        return change && a.tags === change.tags ? { ...a, tags: change.asset.tags ?? [] } : a;
      }));
      showAtlasToast(t('am.tag.saveFailed'));
    }
  }, [assetService, setAssets]);

  const setAssetTags = useCallback(
    (asset: AnyAsset, tags: string[]): Promise<void> => setTagsOfAssets([{ asset, tags }]),
    [setTagsOfAssets],
  );

  const handleUpdateCollection = useCallback(async (collectionId: string, name: string): Promise<void> => {
    if (!assetService) return;
    try {
      await assetService.renameCollection(collectionId, name);
      await reloadCollections();
    } catch (error) {
      console.error('[AssetManager] Failed to rename collection:', error);
      showAtlasToast(error instanceof Error ? error.message : t('am.collection.renameFailed'));
    }
  }, [assetService, reloadCollections]);

  const handleDeleteCollection = useCallback(async (collectionId: string): Promise<void> => {
    if (!assetService) return;
    try {
      if (collectionId === assetService.getDefaultCollectionId()) {
        showAtlasToast(t('am.collection.defaultUndeletable'));
        return;
      }
      await assetService.deleteCollection(collectionId);
      await reloadCollections();
    } catch (error) {
      console.error('[AssetManager] Failed to delete collection:', error);
      showAtlasToast(t('am.collection.deleteFailed'));
    }
  }, [assetService, reloadCollections]);

  return {
    isTagManagerOpen, setIsTagManagerOpen,
    handleCreateTag, handleUpdateTag, handleDeleteTag, setTagsOfAssets, setAssetTags,
    handleUpdateCollection, handleDeleteCollection,
  };
}
