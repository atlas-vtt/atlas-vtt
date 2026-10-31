import type { App } from 'obsidian';
import { isPersistedMapEnvelope, parseSceneFile } from '../../../services/MapPersistence';
import { getDataFilePath } from '../../../utils/dataFileMigration';
import { isVideoMapPath } from '../../../pixi/mosaicCanvas/video/videoMapFiles';
import { mapTokens } from '../../../tokens/offMap';
import { imageMimeType } from '../assetServe.ts';
import { ASSET_RANKS, type AssetUse } from './assetUses.ts';

/** A vault image a scene offers, for the use it has there. */
export interface GatheredAsset {
  readonly path: string;
  readonly mime: string;
  readonly use: AssetUse;
  /** A map image, offered as its tile pyramid where it can be. */
  readonly map?: true;
}

/** A scene as far as what it shows players goes: its maps by level, and its tokens. */
export interface GatherScene {
  readonly background?: string | null | undefined;
  readonly levels?: readonly { readonly background?: string | null | undefined }[] | null | undefined;
  readonly objects?: { readonly tokens?: Readonly<Record<string, { readonly imagePath?: string | undefined; readonly isHidden?: boolean | undefined; readonly offMap?: true | undefined }>> | undefined } | null | undefined;
}

const MAX_PATH = 1000;

/** Each path once, of a type players can be sent. */
function imagesOf(paths: readonly (string | null | undefined)[], use: AssetUse, map = false, seen = new Set<string>()): GatheredAsset[] {
  const gathered: GatheredAsset[] = [];
  for (const path of paths) {
    if (typeof path !== 'string' || path === '' || path.length > MAX_PATH || seen.has(path) || isVideoMapPath(path)) continue;
    const mime = imageMimeType(path);
    if (mime === null) continue;
    seen.add(path);
    gathered.push({ path, mime, use, ...(map && { map: true as const }) });
  }
  return gathered;
}

/**
 * What a scene that is open but not shown offers the store ahead of its turn (ASD-40): the map image of
 * every level (as its tile pyramid) and the art of every token on the map that is not hidden, all ranked after everything
 * players see now. An animated map is left out (a poster is drawn from its video and the video may be
 * hundreds of megabytes): it goes once the scene is presented. The explored memory never goes this way.
 */
export function stagedAssets(scene: GatherScene): GatheredAsset[] {
  const staged: AssetUse = { kind: 'image', rank: ASSET_RANKS.staged };
  const maps = [scene.background, ...(scene.levels ?? []).map((level) => level.background)];
  const tokens = scene.objects?.tokens === undefined ? [] : Object.values(mapTokens({ tokens: scene.objects.tokens }));
  const art = tokens.filter((token) => token.isHidden !== true).map((token) => token.imagePath);
  const seen = new Set<string>();
  return [...imagesOf(maps, staged, true, seen), ...imagesOf(art, staged, false, seen)];
}

/** What the scene file at `mapPath` offers ahead of its turn (`stagedAssets`); none for a file that cannot be read. */
export async function stagedSceneAssets(app: App, mapPath: string): Promise<GatheredAsset[]> {
  const file = app.vault.getFileByPath(getDataFilePath(mapPath));
  if (file === null) return [];
  try {
    const envelope = parseSceneFile(await app.vault.cachedRead(file));
    return isPersistedMapEnvelope(envelope) ? stagedAssets(envelope.state) : [];
  } catch {
    return [];
  }
}
