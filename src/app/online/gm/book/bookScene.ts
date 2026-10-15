import { COLLECTION_FOLDER, type CollectionLookup } from '../../../gameSystems/mapRules';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import type { ShownRollToken } from '../../../services/playerRollSource';
import type { TokenEntity } from '../../../types';
import type { PlayerTokenSource, SceneState } from '../atlasView.ts';
import type { TokenRules } from '../tokenUI.ts';
import { NO_COLLECTION } from './bookStore.ts';

/** The shared scene as the players' books read it. */
export interface BookScene {
  readonly mapPath: string;
  /** The collection the scene belongs to; `NO_COLLECTION` for a scene outside every collection. */
  readonly collection: string;
  readonly tokens: Readonly<Record<string, TokenEntity>>;
  /** The collection's resource definitions; none while they cannot be read, and then no resource is on a sheet. */
  readonly resources: readonly ResourceDefinition[];
  /** The tokens among these the players' frame shows now: not hidden, seen, not under fog. */
  shown(tokenIds: readonly string[]): ReadonlyMap<string, ShownRollToken>;
  /** The GM id of a token by the id players know it by in the list of `scene` (the shared scene's id), while that list is the last they were sent. */
  listedToken(scene: string, alias: string): string | undefined;
}

/**
 * The collection of a map: the one Atlas's index names, `NO_COLLECTION` for a map outside every
 * collection's folder, and null for a map in a collection the index does not know (yet): its books
 * must not be looked for under another name meanwhile.
 */
function collectionOf(collections: CollectionLookup | null, mapPath: string): string | null {
  const known = collections?.getCollectionForMap(mapPath) ?? null;
  if (known !== null) return known;
  return COLLECTION_FOLDER.test(mapPath) ? null : NO_COLLECTION;
}

/**
 * The scene of a shared tab for the books: its store's state, its renderer as the players' token
 * source, the definitions its tokens are drawn by and where its collection is looked up. Null while
 * the scene loads, the tab has no renderer or its collection is not known yet: the books then stay
 * as they were.
 */
export function bookSceneOf(
  state: SceneState, source: PlayerTokenSource | null, rules: TokenRules | null, collections: CollectionLookup | null, listedToken: BookScene['listedToken'],
): BookScene | null {
  const { mapPath } = state;
  if (!state.mapLoaded || state.isMapLoading || mapPath === null || source === null) return null;
  const collection = collectionOf(collections, mapPath);
  if (collection === null) return null;
  return {
    mapPath,
    collection,
    tokens: state.objects.tokens,
    resources: rules?.resources ?? [],
    shown: (tokenIds) => (tokenIds.length === 0 ? new Map() : source.playerRollTokens(mapPath, tokenIds)),
    listedToken,
  };
}
