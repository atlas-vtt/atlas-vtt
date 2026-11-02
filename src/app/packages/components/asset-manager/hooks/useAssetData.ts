import type * as React from 'react';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { TFolder, App as ObsidianApp } from 'obsidian';
import type { AnyAsset, CollectionOption, Folder, Tag, Tab } from '../types';
import { tabs } from '../types';
import { AssetService } from '../../../../services/AssetService';
import { AssetThumbnailService, type ThumbnailAsset, type ThumbnailState } from '../../../../services/AssetThumbnailService';
import { tagGroupOfTab, type TagsByGroup } from '../utils/assetTags';
import { folderIdOf, tabFolderPath } from '../utils/assetFolders';
import type { TagGroup } from '../../../../services/tagGroups';
import { assetFolderId, formatServiceAsset, partitionByTab, tokenPreviewSources, withThumbnails, type TabServiceAsset } from '../utils/assetFormatters';
import { tabHasFolders } from '../utils/tabKinds';
import { nearestShownFolder, withoutPartyOnlyFolders } from '../utils/partyFolders';
import { reconcileAssets } from '../utils/assetReconcile';
import { useAtlasUI } from '../../../../react/root/AtlasUIContext';
import { useOptionalAtlasStore } from '../../../../react/ViewStoreContext';
import { runInBackground } from '../../../../utils/backgroundTask';
import type { AtlasView } from '../../../../atlas-view';

export interface AssetData {
  /** The tab's folders; on the Characters tab without those only player characters fill. */
  folders: Folder[];
  /** The folder to show for an open one: itself, or where it leads while it is hidden (`nearestShownFolder`). */
  shownFolderOf: (folderId: string | null) => string | null;
  assets: AnyAsset[];
  /**
   * Whether `assets` are not those of the selected tab and collection yet: on
   * opening, and while a change of tab or collection loads. `assets` then still
   * hold what was loaded before.
   */
  assetsLoading: boolean;
  /** Tags of the active tab's tag group. */
  availableTags: Tag[];
  tagsByGroup: TagsByGroup;
  /** The collection `tagsByGroup` was loaded for; null until the first load. */
  tagsCollection: string | null;
  /** Whether `tagsByGroup` are not those of the selected collection yet. */
  tagsLoading: boolean;
  collections: CollectionOption[];
  /** How many assets each tab of the selected collection holds; null until they are counted. */
  assetCounts: Record<Tab, number> | null;
  assetService: AssetService | null;
  // Setters (exposed so context menus can mutate state)
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  // Actions
  loadFoldersForActiveTab: () => Promise<void>;
  loadAssetsForActiveTab: () => Promise<void>;
  reloadGlobalTags: () => Promise<void>;
  reloadCollections: () => Promise<void>;
  // Store-provided
  app: ObsidianApp;
  view: AtlasView | null;
  mapPath: string | null;
}

/** The selection a load was made for. */
interface LoadedPlace {
  tab: Tab;
  collection: string;
}

function samePlace(a: LoadedPlace, b: LoadedPlace): boolean {
  return a.tab === b.tab && a.collection === b.collection;
}

export function useAssetData(
  activeTab: Tab,
  selectedCollection: string,
  isOpen: boolean
): AssetData {
  const { app, view } = useAtlasUI();
  const mapPath = useOptionalAtlasStore((s) => s.mapPath, null);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [assets, setAssets] = useState<AnyAsset[]>([]);
  // The selection `assets` and the counts were loaded for, and the one the tags were loaded for.
  const [loadedPlace, setLoadedPlace] = useState<LoadedPlace | null>(null);
  const [tagsSelection, setTagsSelection] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const latestLoad = useRef(0);
  const latestTagsLoad = useRef(0);
  const [tagsByGroup, setTagsByGroup] = useState<TagsByGroup>({ tokens: [], maps: [] });
  const [tagsCollection, setTagsCollection] = useState<string | null>(null);
  const availableTags = tagsByGroup[tagGroupOfTab(activeTab)];
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [assetService, setAssetService] = useState<AssetService | null>(null);
  const [counts, setCounts] = useState<Record<Tab, number> | null>(null);
  // The folders of the Characters tab that hold player characters, one per line: they are hidden where nothing else fills them.
  const [partyFolderKey, setPartyFolderKey] = useState('');
  const thumbnails = useMemo(
    () => (assetService ? AssetThumbnailService.getInstance(app, assetService) : null),
    [app, assetService],
  );

  // ── Load folders ──────────────────────────────────────────────
  const loadFoldersForActiveTab = useCallback(async (): Promise<void> => {
    if (!app) return;
    if (!tabHasFolders(activeTab)) {
      setFolders([]);
      return;
    }
    try {
      const basePath = tabFolderPath(selectedCollection, activeTab);
      const baseFolder = app.vault.getAbstractFileByPath(basePath);
      if (baseFolder instanceof TFolder) {
        const loaded: Folder[] = [];
        const recurse = (folder: TFolder, parentId: string | null = null): void => {
          folder.children.forEach((child) => {
            if (child instanceof TFolder) {
              const obj: Folder = {
                id: folderIdOf(child.path),
                name: child.name,
                type: activeTab,
                path: child.path.substring(basePath.length + 1),
                parentId,
              };
              loaded.push(obj);
              recurse(child, obj.id);
            }
          });
        };
        recurse(baseFolder);
        setFolders(loaded);
      } else {
        setFolders([]);
      }
    } catch (error) {
      console.error('[useAssetData] Error loading folders:', error);
      setFolders([]);
    }
  }, [app, activeTab, selectedCollection]);

  // ── Load assets ───────────────────────────────────────────────
  const loadAssetsForActiveTab = useCallback(async (): Promise<void> => {
    if (!assetService || !app) return;
    // A load overtaken by a later one must not put its assets over the later one's.
    const load = ++latestLoad.current;
    const place: LoadedPlace = { tab: activeTab, collection: selectedCollection };
    try {
      const byTab = partitionByTab(await assetService.getAssets(selectedCollection));
      if (load !== latestLoad.current) return;
      // Queued before the cards are built, so a card whose thumbnail is on its way shows a placeholder.
      const allTokens = [...byTab.tokens, ...byTab.party];
      thumbnails?.ensureThumbnails([...allTokens, ...byTab.maps]);
      const previewSources = tokenPreviewSources(allTokens);
      const tabBase = tabFolderPath(selectedCollection, activeTab);
      const tabAssets: TabServiceAsset[] = byTab[activeTab];
      const thumbnailOf = thumbnails ? (asset: ThumbnailAsset): ThumbnailState => thumbnails.stateOf(asset) : undefined;
      const folderBase = tabHasFolders(activeTab) ? tabBase : null;
      const formatted = tabAssets.map((a) => formatServiceAsset(a, folderBase, app, previewSources, thumbnailOf));
      setAssets((previous) => reconcileAssets(previous, formatted));
      const partyFolders = activeTab === 'tokens' ? byTab.party.flatMap((pc) => assetFolderId(pc, tabBase) ?? []) : [];
      setPartyFolderKey([...new Set(partyFolders)].sort().join('\n'));
      // Counts cover every tab so the tab bar never reflows when switching
      const loaded: Record<Tab, number> = {
        scenes: byTab.scenes.length,
        maps: byTab.maps.length,
        encounters: byTab.encounters.length,
        tokens: byTab.tokens.length,
        party: byTab.party.length,
      };
      setCounts((previous) => (previous && tabs.every((tab) => previous[tab] === loaded[tab]) ? previous : loaded));
    } catch (error) {
      console.error('[useAssetData] Error loading assets:', error);
      if (load !== latestLoad.current) return;
    }
    setLoadedPlace((previous) => (previous && samePlace(previous, place) ? previous : place));
  }, [assetService, app, activeTab, selectedCollection, thumbnails]);

  // ── Show thumbnails as they are generated ─────────────────────
  // Only the cards whose thumbnail arrived change; the list is not loaded again.
  useEffect(() => {
    if (!thumbnails || !app) return;
    return thumbnails.onUpdated((updates) => setAssets((previous) => withThumbnails(previous, updates, app)));
  }, [thumbnails, app]);

  // Scene thumbnails are rendered by open map views, e.g. right after a new scene opens
  useEffect(() => {
    if (!app || activeTab !== 'scenes') return;
    const ref = app.workspace.on('atlas-vtt:scene-thumbnail-updated', () => { void loadAssetsForActiveTab(); });
    return () => { app.workspace.offref(ref); };
  }, [app, activeTab, loadAssetsForActiveTab]);

  // ── Tags ──────────────────────────────────────────────────────
  const reloadGlobalTags = useCallback(async (): Promise<void> => {
    if (!assetService) return;
    const request = ++latestTagsLoad.current;
    try {
      const load = async (group: TagGroup): Promise<Tag[]> =>
        (await assetService.getCollectionTags(selectedCollection, group)).map((t) => ({ id: t.id, name: t.name }));
      const loaded = { tokens: await load('tokens'), maps: await load('maps') };
      if (request !== latestTagsLoad.current) return;
      setTagsByGroup(loaded);
      setTagsCollection(selectedCollection);
    } catch (error) {
      console.error('[useAssetData] Error reloading tags:', error);
      if (request !== latestTagsLoad.current) return;
    }
    setTagsSelection(selectedCollection);
  }, [assetService, selectedCollection]);

  // ── Collections ───────────────────────────────────────────────
  const reloadCollections = useCallback(async (): Promise<void> => {
    if (!assetService) return;
    const loaded = await assetService.getCollections();
    const defaultId = assetService.getDefaultCollectionId();
    setCollections(loaded.map(({ id, uid, name }) => ({ id, uid, name, ...(id === defaultId && { isDefault: true }) })));
  }, [assetService]);

  // ── Initialize service ────────────────────────────────────────
  useEffect(() => {
    if (!app) return;
    const svc = AssetService.getInstance(app);
    const initialize = async (): Promise<void> => {
      try {
        await svc.initialize();
      } catch (error) {
        // Nothing will ever load: show the empty library instead of its placeholders.
        setIsUnavailable(true);
        throw error;
      }
      setAssetService(svc);
    };
    runInBackground(initialize(), 'Initializing asset service');
  }, [app]);

  useEffect(() => {
    runInBackground(reloadCollections(), 'Loading collections');
  }, [reloadCollections]);

  // ── Reload tags on collection change ──────────────────────────
  useEffect(() => {
    if (assetService && isOpen) void reloadGlobalTags();
  }, [assetService, reloadGlobalTags, isOpen]);

  // ── Refresh from disk on open and on refresh events ───────────
  // Reading the index from disk takes a while, and the selection may change
  // meanwhile (an import selects its collection, then announces it). The
  // reload afterwards therefore always uses the current selection.
  const showLoaded = useCallback(async (): Promise<void> => {
    await reloadCollections();
    await loadAssetsForActiveTab();
  }, [reloadCollections, loadAssetsForActiveTab]);
  const latestShowLoaded = useRef(showLoaded);
  useEffect(() => { latestShowLoaded.current = showLoaded; }, [showLoaded]);

  const refreshFromDisk = useCallback(async (): Promise<void> => {
    if (!assetService) return;
    await assetService.refreshMetadata();
    await latestShowLoaded.current();
  }, [assetService]);

  useEffect(() => {
    if (isOpen) runInBackground(refreshFromDisk(), 'Refreshing asset metadata');
  }, [isOpen, refreshFromDisk]);

  useEffect(() => {
    if (!app) return;
    const refreshRef = app.workspace.on('atlas-vtt:refresh-assets', () => runInBackground(refreshFromDisk(), 'Refreshing asset metadata'));
    return () => { app.workspace.offref(refreshRef); };
  }, [app, refreshFromDisk]);

  // ── Load on tab / collection change ───────────────────────────
  useEffect(() => {
    if (!assetService || !app) return;
    void loadFoldersForActiveTab();
    void loadAssetsForActiveTab();
  }, [assetService, activeTab, app, selectedCollection, loadAssetsForActiveTab, loadFoldersForActiveTab]);

  const assetsLoading = !isUnavailable && !(loadedPlace && samePlace(loadedPlace, { tab: activeTab, collection: selectedCollection }));
  // Counts are loaded with the assets and cover every tab, so a tab switch keeps them.
  const assetCounts = loadedPlace?.collection === selectedCollection ? counts : null;
  const tagsLoading = !isUnavailable && tagsSelection !== selectedCollection;
  const shownFolders = useMemo(
    () => withoutPartyOnlyFolders(folders, assets, new Set(partyFolderKey ? partyFolderKey.split('\n') : [])),
    [folders, assets, partyFolderKey],
  );
  const shownFolderOf = useCallback(
    (folderId: string | null): string | null => nearestShownFolder(folderId, folders, shownFolders),
    [folders, shownFolders],
  );

  return {
    folders: shownFolders, shownFolderOf, assets, assetsLoading, availableTags, tagsByGroup, tagsCollection, tagsLoading, collections, assetCounts, assetService,
    setFolders, setAssets,
    loadFoldersForActiveTab, loadAssetsForActiveTab, reloadGlobalTags, reloadCollections,
    app, view, mapPath,
  };
}
