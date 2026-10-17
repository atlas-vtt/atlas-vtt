import { TFile, App as ObsidianApp } from 'obsidian';
import type { AnyAsset, Asset, EncounterTokenPreview } from '../types';
import type {
  Asset as ServiceAsset,
  AssetOfType,
  EncounterTokenRef,
  TokenAsset as ServiceTokenAsset,
} from '../../../../services/AssetService';
import type { ThumbnailAsset, ThumbnailState, ThumbnailUpdate } from '../../../../services/AssetThumbnailService';
import { assetJsonPath, primaryPath } from '../../../../services/vault-sync/assetFiles';
import { folderIdOf } from './assetFolders';
import { ENCOUNTER_PREVIEW_COUNT } from './encounterPreviewLayout';
import { mapThumbnailPath } from '../../../../utils/dataFileMigration';
import { isPlayerCharacter } from '../../../../characters/playerCharacters';

/** The stored asset types the asset manager shows, one per tab. */
export type TabServiceAsset = AssetOfType<'token' | 'map' | 'scene' | 'encounter'>;

const TAB_ASSET_TYPES: ReadonlySet<ServiceAsset['type']> = new Set<TabServiceAsset['type']>(['token', 'map', 'scene', 'encounter']);

export function isTabAsset(asset: ServiceAsset): asset is TabServiceAsset {
  return TAB_ASSET_TYPES.has(asset.type);
}

/** Stored assets grouped by the tab that shows them; tokens are split between the characters and the party. */
export interface AssetsByTab {
  tokens: AssetOfType<'token'>[];
  party: AssetOfType<'token'>[];
  maps: AssetOfType<'map'>[];
  scenes: AssetOfType<'scene'>[];
  encounters: AssetOfType<'encounter'>[];
}

/** What an encounter preview needs from the token asset that shares its image. */
interface TokenPreviewSource {
  thumbnailPath?: string | undefined;
  showRing?: boolean | undefined;
}

/** Token asset preview data keyed by image path. */
export type TokenPreviewSources = ReadonlyMap<string, TokenPreviewSource>;

const NO_PREVIEW_SOURCES: TokenPreviewSources = new Map();

export function resourceUrl(app: ObsidianApp, path: string | undefined): string {
  const file = path ? app.vault.getAbstractFileByPath(path) : null;
  return file instanceof TFile ? app.vault.getResourcePath(file) : '';
}

function sceneThumbnailUrl(app: ObsidianApp, mapPath: string | undefined): string {
  if (!mapPath) return '';
  const thumbnailUrl = resourceUrl(app, mapThumbnailPath(mapPath));
  if (thumbnailUrl) return thumbnailUrl;

  const mapFile = app.vault.getAbstractFileByPath(mapPath);
  const isImage = mapFile instanceof TFile
    && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(mapFile.extension.toLowerCase());
  return isImage ? app.vault.getResourcePath(mapFile) : '';
}

/**
 * The file whose folder places an asset in the asset manager: a map's record,
 * since its image stays in the shared assets folder, otherwise the file the
 * asset stands for (token art, scene file, encounter JSON).
 */
export function placingFilePath(asset: TabServiceAsset): string | null {
  return asset.type === 'map' ? assetJsonPath(asset) : primaryPath(asset);
}

/** The folder below the tab's base path an asset is shown in, or null at the top level. */
export function assetFolderId(asset: TabServiceAsset, tabBasePath: string): string | null {
  const assetPath = placingFilePath(asset);
  if (assetPath && assetPath.startsWith(tabBasePath + '/')) {
    const relativePath = assetPath.substring(tabBasePath.length + 1);
    const lastSlash = relativePath.lastIndexOf('/');
    if (lastSlash > 0) {
      return folderIdOf(`${tabBasePath}/${relativePath.substring(0, lastSlash)}`);
    }
  }
  return null;
}

/** Groups stored assets by the tab that shows them; other asset types are left out. */
export function partitionByTab(assets: readonly ServiceAsset[]): AssetsByTab {
  const byTab: AssetsByTab = { tokens: [], party: [], maps: [], scenes: [], encounters: [] };
  for (const asset of assets) {
    switch (asset.type) {
      case 'token': (isPlayerCharacter(asset) ? byTab.party : byTab.tokens).push(asset); break;
      case 'map': byTab.maps.push(asset); break;
      case 'scene': byTab.scenes.push(asset); break;
      case 'encounter': byTab.encounters.push(asset); break;
      default: break;
    }
  }
  return byTab;
}

export function tokenPreviewSources(tokens: readonly ServiceTokenAsset[]): TokenPreviewSources {
  return new Map(tokens.map((token) => [token.imagePath, { thumbnailPath: token.thumbnailPath, showRing: token.showRing }]));
}

/**
 * Preview of one encounter token, using the token's thumbnail where one exists.
 * Tokens saved from a map keep their own ring; tokens added from the asset
 * manager are framed like their token asset, as they are when spawned.
 */
function encounterTokenPreview(
  app: ObsidianApp,
  ref: EncounterTokenRef,
  sources: TokenPreviewSources,
): EncounterTokenPreview | null {
  const source = sources.get(ref.imagePath);
  const url = resourceUrl(app, source?.thumbnailPath) || resourceUrl(app, ref.imagePath);
  if (!url) return null;
  const showRing = ref.state ? ref.state.showRing : source?.showRing;
  const ringColor = ref.state?.ringColor;
  return {
    url,
    ...(showRing !== undefined && { showRing }),
    ...(ringColor !== undefined && { ringColor }),
  };
}

/** The state of an asset's thumbnail, as `AssetThumbnailService.stateOf` reports it. */
export type ThumbnailLookup = (asset: ThumbnailAsset) => ThumbnailState;

/**
 * What a token or map card shows: its thumbnail, a placeholder while one is
 * being made (decoding a full map for a card costs hundreds of megabytes), and
 * the image itself only when it has no thumbnail and none is on its way.
 */
function cardArt(
  app: ObsidianApp,
  asset: ThumbnailAsset,
  imageUrl: string,
  thumbnailOf: ThumbnailLookup | undefined,
): Pick<Asset, 'thumbnailUrl' | 'thumbnailPending'> {
  const state = thumbnailOf?.(asset) ?? { path: asset.thumbnailPath, pending: false };
  const thumbnailUrl = resourceUrl(app, state.path);
  if (thumbnailUrl) return { thumbnailUrl };
  return state.pending ? { thumbnailUrl: '', thumbnailPending: true } : { thumbnailUrl: imageUrl };
}

/**
 * `assets` with the thumbnails that were made since they were formatted. Only
 * the assets named change, so every other card keeps its object and does not
 * render again; `assets` itself when none of them is listed.
 */
export function withThumbnails(assets: AnyAsset[], updates: readonly ThumbnailUpdate[], app: ObsidianApp): AnyAsset[] {
  const paths = new Map(updates.map((update) => [update.id, update.thumbnailPath]));
  let changed = false;
  const next = assets.map((asset) => {
    if ((asset.type !== 'tokens' && asset.type !== 'maps') || !paths.has(asset.id)) return asset;
    const thumbnailUrl = resourceUrl(app, paths.get(asset.id) ?? undefined) || asset.imageUrl;
    if (thumbnailUrl === asset.thumbnailUrl && !asset.thumbnailPending) return asset;
    changed = true;
    const shown = { ...asset, thumbnailUrl };
    delete shown.thumbnailPending;
    return shown;
  });
  return changed ? next : assets;
}

/**
 * Converts a single AssetService record into the UI-layer AnyAsset shape,
 * resolving vault resource paths for thumbnails / images. A tab without
 * folders passes no base path: its assets all lie at its top level.
 */
export function formatServiceAsset(
  asset: TabServiceAsset,
  tabBasePath: string | null,
  app: ObsidianApp,
  previewSources: TokenPreviewSources = NO_PREVIEW_SOURCES,
  thumbnailOf?: ThumbnailLookup,
): AnyAsset {
  const base: Omit<Asset, 'type' | 'thumbnailUrl'> = {
    id: asset.id,
    name: asset.name,
    tags: asset.tags,
    folderId: tabBasePath === null ? null : assetFolderId(asset, tabBasePath),
    modifiedAt: asset.modifiedAt,
    ...(asset.filePath !== undefined && { filePath: asset.filePath }),
  };

  switch (asset.type) {
    case 'token': {
      const imageUrl = resourceUrl(app, asset.imagePath);
      return {
        ...base,
        type: 'tokens',
        ...cardArt(app, asset, imageUrl, thumbnailOf),
        imageUrl,
        imagePath: asset.imagePath,
        ...(asset.imageSource && { imageSource: asset.imageSource, sourceImageUrl: resourceUrl(app, asset.imageSource.path) }),
        ...(asset.showRing !== undefined && { showRing: asset.showRing }),
        ...(asset.size !== undefined && { size: asset.size }),
        ...(asset.statblockPath !== undefined && { statblockPath: asset.statblockPath }),
        ...(isPlayerCharacter(asset) && { playerCharacter: true as const }),
      };
    }
    case 'map': {
      const imageUrl = resourceUrl(app, asset.mapFilePath);
      return {
        ...base,
        type: 'maps',
        ...cardArt(app, asset, imageUrl, thumbnailOf),
        imageUrl,
        mapFilePath: asset.mapFilePath,
      };
    }
    case 'scene':
      return { ...base, type: 'scenes', thumbnailUrl: sceneThumbnailUrl(app, asset.data?.mapPath) };
    case 'encounter': {
      // Older encounters keep these only inside their JSON payload.
      const description = asset.data?.description;
      const difficulty = asset.difficulty || asset.data?.difficulty;
      const formation = asset.formation || asset.data?.formation;
      const tokens = asset.tokens || asset.data?.tokens || [];
      const tokenPreviews = tokens
        .map((token) => encounterTokenPreview(app, token, previewSources))
        .filter((preview): preview is EncounterTokenPreview => preview !== null)
        .slice(0, ENCOUNTER_PREVIEW_COUNT);
      return {
        ...base,
        type: 'encounters',
        thumbnailUrl: asset.thumbnailUrl ?? '',
        tokens,
        tokenPreviews,
        ...(description !== undefined && { description }),
        ...(difficulty !== undefined && { difficulty }),
        ...(formation !== undefined && { formation }),
      };
    }
  }
}
