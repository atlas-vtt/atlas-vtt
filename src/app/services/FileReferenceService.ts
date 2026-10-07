import { App, TFile } from 'obsidian';
import { AssetService, Asset } from './AssetService';
import { isPersistedMapEnvelope } from './MapPersistence';
import { normalizeImagePath } from '../utils/pathUtils';
import { mapThumbnailPath } from '../utils/dataFileMigration';
import { movedPathOf, rewriteMapReferences, type MovedPath, type PathMove } from './renamedPaths';
import { SceneSnapshotService } from '../snapshots/SceneSnapshotService';
import { allSnapshotFiles, hiddenSnapshotFiles } from '../snapshots/sceneSnapshotFolders';
import { STATBLOCK_IMAGE_KEYS } from './statblockImageKeys';

/**
 * Propagates file path changes (renames/moves) across all storage layers:
 * - Asset metadata (assets-metadata.json), including scene records of a renamed map
 * - Map files (.atlasmap token instances and pin targets) and scene snapshots
 * - Statblock frontmatter (the image fields)
 * - Collection loot bases
 * - The thumbnail of a renamed map
 *
 * The open map is updated separately by its view, from the same vault event.
 */
export class FileReferenceService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** Called when a vault file is renamed/moved. */
  async handleFileRenamed(oldPath: string, newPath: string): Promise<void> {
    await this.handleFilesMoved([{ from: oldPath, to: newPath }]);
  }

  /**
   * Propagates moved files to every storage layer that may reference them,
   * reading each map file and note once however many files moved.
   */
  async handleFilesMoved(moves: readonly PathMove[]): Promise<void> {
    const fileMoves = moves.filter(({ from, to }) => normalizeImagePath(from) !== normalizeImagePath(to));
    if (fileMoves.length === 0) return;
    const moved = movedPathOf(fileMoves);

    await this.updateAssetMetadata(moved);
    await this.updateScenes(moved);
    for (const { from, to } of fileMoves) await this.renameMapThumbnail(from, to);
    await this.updateMapFiles(moved);
    await this.updateStatblockFrontmatter(moved);
    await this.updateLootBases(moved);
  }

  /**
   * Called when a vault folder is renamed/moved. Its files each get their own
   * rename event; a renamed collection folder also renames the collection.
   */
  async handleFolderRenamed(oldPath: string, newPath: string): Promise<void> {
    const assetService = AssetService.getInstance(this.app);
    await assetService.initialize();
    if (await assetService.followCollectionFolderRename(oldPath, newPath)) {
      this.app.workspace.trigger('atlas-vtt:refresh-assets');
    }
  }

  // ---------------------------------------------------------------------------
  // Asset metadata
  // ---------------------------------------------------------------------------

  private async updateAssetMetadata(moved: MovedPath): Promise<boolean> {
    const assetService = AssetService.getInstance(this.app);
    await assetService.initialize();

    /** Sets `record[key]` to the moved path; returns whether it moved. */
    const follow = <K extends string>(record: Partial<Record<K, string | null | undefined>>, key: K): boolean => {
      const target = moved(record[key]);
      if (target === null) return false;
      record[key] = target;
      return true;
    };

    return assetService.rewriteAssets((asset: Asset): boolean => {
      let changed = follow(asset, 'filePath');
      switch (asset.type) {
        case 'token':
          changed = follow(asset, 'imagePath') || changed;
          changed = follow(asset, 'statblockPath') || changed;
          break;
        case 'encounter':
        case 'player':
          for (const list of [asset.tokens, asset.data?.tokens]) {
            for (const token of list ?? []) {
              changed = follow(token, 'imagePath') || changed;
              changed = follow(token, 'statblockPath') || changed;
            }
          }
          break;
        case 'map':
          changed = follow(asset, 'mapFilePath') || changed;
          break;
        case 'note':
          changed = follow(asset, 'notePath') || changed;
          break;
      }
      return changed;
    });
  }

  // ---------------------------------------------------------------------------
  // Scenes and thumbnails of a renamed map
  // ---------------------------------------------------------------------------

  /**
   * Scene records follow their map; a scene named after its file takes the new file name. The images Atlas wrote for
   * an extension's scene (`createdImages`, index only) follow theirs, so `scenes.replaceMap` never removes a file that
   * has since taken a listed path.
   */
  private async updateScenes(moved: MovedPath): Promise<void> {
    const assetService = AssetService.getInstance(this.app);
    for (const scene of await assetService.getAssets(undefined, 'scene')) {
      const mapPath = scene.data?.mapPath;
      const target = moved(mapPath);
      if (mapPath && target?.endsWith('.atlasmap')) {
        await assetService.updateAsset(scene.id, {
          data: { ...scene.data, mapPath: target },
          ...(scene.name === basename(mapPath) ? { name: basename(target) } : {}),
        });
      }
      const created = scene.data?.createdImages;
      // Patched onto the record as the index holds it now, after the map's own update.
      if (created?.some((path) => moved(path) !== null)) {
        await assetService.updateSceneIndexData(scene.id, { createdImages: created.map((path) => moved(path) ?? path) });
      }
    }
  }

  private async renameMapThumbnail(oldPath: string, newPath: string): Promise<void> {
    if (!oldPath.endsWith('.atlasmap') || !newPath.endsWith('.atlasmap')) return;
    const thumbnail = this.app.vault.getAbstractFileByPath(mapThumbnailPath(oldPath));
    const target = mapThumbnailPath(newPath);
    if (!(thumbnail instanceof TFile)) return;
    try {
      // A thumbnail at the new path is a leftover of a deleted scene: no scene can be renamed onto a living one
      const leftover = this.app.vault.getAbstractFileByPath(target);
      if (leftover instanceof TFile) await this.app.fileManager.trashFile(leftover);
      await this.app.vault.rename(thumbnail, target);
    } catch (error) {
      console.error(`[FileReferenceService] Error renaming thumbnail ${thumbnail.path}:`, error);
    }
  }

  // ---------------------------------------------------------------------------
  // .atlasmap files
  // ---------------------------------------------------------------------------

  private async updateMapFiles(moved: MovedPath): Promise<boolean> {
    const mapFiles = this.app.vault.getFiles().filter(f => f.extension === 'atlasmap');
    const snapshots = new SceneSnapshotService(this.app);
    let anyChanged = false;

    /** Returns the rewritten map JSON, or null when the map references none of the moved files. */
    const rewriteMap = (content: string): string | null => {
      const mapData: unknown = JSON.parse(content);
      if (!isPersistedMapEnvelope(mapData)) return null;
      return rewriteMapReferences(mapData.state, moved) ? JSON.stringify(mapData, null, 2) : null;
    };

    for (const mapFile of mapFiles) {
      try {
        if (rewriteMap(await this.app.vault.read(mapFile)) !== null) {
          await this.app.vault.process(mapFile, (latest) => rewriteMap(latest) ?? latest);
          anyChanged = true;
        }
      } catch (error) {
        console.error(`[FileReferenceService] Error updating map ${mapFile.path}:`, error);
      }
    }
    // Scene snapshots hold the same map state, so they follow renamed files too.
    const snapshotFiles = [...allSnapshotFiles(this.app), ...await hiddenSnapshotFiles(this.app, mapFiles.map((file) => file.path))];
    if (await snapshots.rewriteFiles(snapshotFiles, rewriteMap)) anyChanged = true;

    return anyChanged;
  }

  // ---------------------------------------------------------------------------
  /** Collections keep rolling on a loot base after it is renamed or moved. */
  private async updateLootBases(moved: MovedPath): Promise<void> {
    const assetService = AssetService.getInstance(this.app);
    for (const collection of await assetService.getCollections()) {
      const lootBases = collection.settings.lootBases;
      if (!lootBases?.some((path) => moved(path) !== null)) continue;
      await assetService.updateCollectionSettings(collection.id, {
        lootBases: lootBases.map((path) => moved(path) ?? path),
      });
    }
  }

  // Statblock frontmatter (image fields)
  // ---------------------------------------------------------------------------

  /**
   * Statblock notes name their artwork by vault path in `image` (what Atlas
   * writes when it links a token), `token` or the older `token-image`. Obsidian keeps
   * wikilinks there up to date itself, but not plain paths.
   */
  private async updateStatblockFrontmatter(moved: MovedPath): Promise<void> {
    const mdFiles = this.app.vault.getFiles().filter(f => f.extension === 'md');

    for (const mdFile of mdFiles) {
      try {
        const frontmatter = this.app.metadataCache.getFileCache(mdFile)?.frontmatter;
        if (!frontmatter) continue;

        const targets = STATBLOCK_IMAGE_KEYS.flatMap((key) => {
          const value: unknown = frontmatter[key];
          const target = typeof value === 'string' ? moved(value) : null;
          return target === null ? [] : [[key, target] as const];
        });
        if (targets.length === 0) continue;

        await this.app.fileManager.processFrontMatter(mdFile, (latest: Record<string, unknown>) => {
          for (const [key, target] of targets) latest[key] = target;
        });
      } catch (error) {
        console.error(`[FileReferenceService] Error updating frontmatter in ${mdFile.path}:`, error);
      }
    }
  }
}

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
