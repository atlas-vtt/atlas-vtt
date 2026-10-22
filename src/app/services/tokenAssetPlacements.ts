import { App, TFile } from 'obsidian';
import { ATLAS_VIEW_TYPE, isAtlasView } from '../atlasViewType';
import { isPersistedMapEnvelope } from './MapPersistence';
import { runHistoryTransaction } from '../stores/history';
import { normalizeImagePath } from '../utils/pathUtils';

/**
 * Map tokens reference a token asset by its image path. Deleting the asset
 * trashes that image, so these helpers find and remove the placements first.
 */

function placesImage(imagePaths: Set<string>, tokenImagePath: string | undefined): boolean {
  return !!tokenImagePath && imagePaths.has(normalizeImagePath(tokenImagePath));
}

/** Map files that place at least one token using any of the given images. */
export async function findTokenPlacements(app: App, imagePaths: readonly string[]): Promise<TFile[]> {
  const images = new Set(imagePaths.map(normalizeImagePath));
  const placements: TFile[] = [];
  for (const file of app.vault.getFiles().filter((f) => f.extension === 'atlasmap')) {
    try {
      const raw: unknown = JSON.parse(await app.vault.read(file));
      const tokens = isPersistedMapEnvelope(raw) ? raw.state?.objects?.tokens : undefined;
      if (tokens && Object.values(tokens).some((token) => placesImage(images, token.imagePath))) placements.push(file);
    } catch (error) {
      console.error(`[tokenAssetPlacements] Error reading map ${file.path}:`, error);
    }
  }
  return placements;
}

function stripTokensFromMapJson(content: string, images: Set<string>): string {
  const raw: unknown = JSON.parse(content);
  const tokens = isPersistedMapEnvelope(raw) ? raw.state?.objects?.tokens : undefined;
  if (!tokens) return content;
  for (const [id, token] of Object.entries(tokens)) {
    if (placesImage(images, token.imagePath)) delete tokens[id];
  }
  return JSON.stringify(raw, null, 2);
}

/** Removes every placement of the given images from open map views and from map files on disk. */
export async function removeTokenPlacements(app: App, mapFiles: readonly TFile[], imagePaths: readonly string[]): Promise<void> {
  const images = new Set(imagePaths.map(normalizeImagePath));
  const openViews = app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)
    .map((leaf) => leaf.view)
    .filter(isAtlasView);

  for (const mapFile of mapFiles) {
    const view = openViews.find((v) => v.file?.path === mapFile.path);
    try {
      if (view) {
        const store = view.getStore();
        const ids = Object.values(store.getState().objects.tokens)
          .filter((token) => placesImage(images, token.imagePath))
          .map((token) => token.id);
        runHistoryTransaction(store, () => store.getState().deleteTokens(ids));
        await view.saveMap();
      } else {
        await app.vault.process(mapFile, (content) => stripTokensFromMapJson(content, images));
      }
    } catch (error) {
      console.error(`[tokenAssetPlacements] Error updating map ${mapFile.path}:`, error);
    }
  }
}
