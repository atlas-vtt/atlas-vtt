import type { AssetKind, AssetRef } from '../../protocol/index.ts';

/**
 * The order uploads go in (lower first), a first picture for everyone before polish for anyone: the
 * presented floor's map (its pyramid's manifest and overview level), the art of tokens players see,
 * the overviews of the floors a player stands on, the presented map's finer levels, those floors'
 * finer levels, then the shared scene's other floors (overview, finer), then the video, handouts and
 * texts, then the scenes open beside it.
 */
export const ASSET_RANKS = { map: 0, art: 1, floorMap: 2, mapLevels: 3, floorLevels: 4, restMap: 5, restLevels: 6, video: 7, extra: 8, staged: 9 } as const;

/**
 * Who looks at a map: players on the presented floor, players standing on another floor, nobody (a
 * floor of the shared scene no player stands on), or nobody yet (a scene open beside the shared one).
 */
export type MapStanding = 'presented' | 'watched' | 'rest' | 'staged';

/** Each standing's rank before and after its pyramid's overview level went. */
const STANDING_RANKS: Record<MapStanding, readonly [number, number]> = {
  presented: [ASSET_RANKS.map, ASSET_RANKS.mapLevels],
  watched: [ASSET_RANKS.floorMap, ASSET_RANKS.floorLevels],
  rest: [ASSET_RANKS.restMap, ASSET_RANKS.restLevels],
  staged: [ASSET_RANKS.staged, ASSET_RANKS.staged],
};

/** A map pyramid's rank: by who looks at it, and whether its overview level went already. */
export const pyramidRank = (standing: MapStanding, pastOverview: boolean): number => STANDING_RANKS[standing][pastOverview ? 1 : 0];

/** The maps of the shared scene's floors (vault paths), by who looks at them. */
export interface FloorMaps {
  readonly presented: string | null;
  readonly watched: readonly string[];
  readonly rest: readonly string[];
}

/** What an asset is for: the kind the store keeps it as, and its place in the upload order. */
export interface AssetUse {
  readonly kind: AssetKind;
  readonly rank: number;
  /** The floor map (vault path) a map sent as one image is of: it then ranks by who looks at that floor. */
  readonly map?: string;
}

export const ASSET_USES = {
  /** A shared scene's map image (an animated map's poster). */
  map: { kind: 'image', rank: ASSET_RANKS.map },
  /** The art of a token players see: on the map, in the initiative list, as a speaker in the log, on a sheet. */
  art: { kind: 'image', rank: ASSET_RANKS.art },
  /** An explored memory too large to go inline: after the map, since a newer one may replace it every few seconds. */
  explored: { kind: 'image', rank: ASSET_RANKS.mapLevels },
  /** An animated map's video. */
  video: { kind: 'video', rank: ASSET_RANKS.video },
  /** An image shown over the map, the world map, an image of a quest or a found note. */
  image: { kind: 'image', rank: ASSET_RANKS.extra },
  /** A quest's, a sheet's or a found note's whole text. */
  text: { kind: 'text', rank: ASSET_RANKS.extra },
} as const satisfies Record<string, AssetUse>;

/** An asset named by its content before it is stored: its hash, size and type, without the id players fetch it by. */
export type HashedRef = Pick<AssetRef, 'hash' | 'size' | 'mime'>;

/**
 * How a share hands players an asset the store keeps for them: the reference with the id it is
 * stored under, after which the asset is offered and uploaded; null where the store cannot take it
 * (the GM is not signed in, it is past its kind's cap, the store refused it): players are then not
 * shown it.
 */
export interface AssetStoring {
  /**
   * The reference of bytes read or made here. `path`: the vault file these bytes are exactly, read
   * again for the upload instead of being kept in memory.
   */
  refOf(bytes: Uint8Array<ArrayBuffer>, mime: string, use: AssetUse, path?: string): Promise<AssetRef | null>;
  /** The reference of a vault file without keeping its bytes (an animated map's video); null where it cannot be read. */
  fileRef(path: string, mime: string, use: AssetUse): Promise<AssetRef | null>;
  /**
   * The reference of a scene's map image at `path` (these `bytes`): its tile pyramid (`tiles: true`)
   * where this device can build one pages can draw, else the image, as `refOf` hands it.
   */
  mapRef(bytes: Uint8Array<ArrayBuffer>, mime: string, path: string): Promise<AssetRef | null>;
  /** Players hold a reference no more (one a newer one replaced): it need not go up, and its share is named no more. */
  release(ref: AssetRef): void;
  /**
   * Who looks at which floor's map now (the floors players stand on changed, or the presented one):
   * the maps' pyramids are ranked by it, and the floors nobody stands on are offered after them.
   */
  floorMaps?(maps: FloorMaps): void;
}
