import { ASSET_CAPS, type AssetRef } from '../../protocol/index.ts';
import { TESSERA_SPEC } from '../../../pixi/mosaicCanvas/pyramid';
import { ASSET_RANKS, ASSET_USES, type AssetStoring, type AssetUse, type FloorMaps } from './assetUses.ts';
import type { FileHashes, FileStat } from './fileHashes.ts';
import { headerPyramid } from './pyramidPlan.ts';
import type { PyramidPublishing } from './pyramidPublishing.ts';
import type { AssetSource } from './uploadQueue.ts';

/** An asset as the publisher notes it: what its id is made of, what it is, where its bytes are read, and whether players were handed it. */
export interface Registration {
  /** What the id is worked out of: the content hash, and for a pyramid the hash with its tile spec. */
  readonly key: string;
  readonly hash: string;
  readonly size: number;
  readonly mime: string;
  readonly use: AssetUse;
  readonly source: AssetSource;
  readonly handed: boolean;
}

export interface AssetRefsDeps {
  readonly hashes: FileHashes;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer> | null>;
  stat(path: string): FileStat | null;
  /** The publisher's map pyramids; without them maps go as images. */
  readonly pyramids?: Pick<PyramidPublishing, 'drawable' | 'make'> | undefined;
  /** Notes an asset; its id, or undefined where the store will not keep it. */
  register(asset: Registration): Promise<string | undefined>;
  /** Players hold a reference no more. */
  release(ref: AssetRef): void;
  /** Whether the store takes no pyramids (a relay without them): maps then go as images. */
  tilesRefused(): boolean;
  /** Who looks at which floor's map now. */
  floorMaps?(maps: FloorMaps): void;
}

/** A pyramid's id is worked out of the image's hash with its tile spec, so it is never the id of the image itself. */
export const pyramidKey = (hash: string, spec: number): string => `${hash}/tiles/${spec}`;

/** The references players are handed (`AssetStoring`), and the assets of the scenes open beside the presented one. */
export class AssetRefs implements AssetStoring {
  constructor(private readonly deps: AssetRefsDeps) {}

  async refOf(bytes: Uint8Array<ArrayBuffer>, mime: string, use: AssetUse, path?: string): Promise<AssetRef | null> {
    const hash = await this.deps.hashes.of(bytes, path);
    const id = await this.deps.register({ key: hash, hash, size: bytes.length, mime, use, source: path === undefined ? { bytes } : { path }, handed: true });
    return id === undefined ? null : { hash, size: bytes.length, mime, id };
  }

  async fileRef(path: string, mime: string, use: AssetUse): Promise<AssetRef | null> {
    const stat = this.deps.stat(path);
    if (stat === null || stat.size > ASSET_CAPS[use.kind]) return null;
    let hash = this.deps.hashes.kept(path);
    if (hash === undefined) {
      const bytes = await this.deps.readFile(path).catch(() => null);
      if (bytes === null) return null;
      hash = await this.deps.hashes.of(bytes, path);
    }
    const { size } = stat;
    const id = await this.deps.register({ key: hash, hash, size, mime, use, source: { path }, handed: true });
    return id === undefined ? null : { hash, size, mime, id };
  }

  release(ref: AssetRef): void {
    this.deps.release(ref);
  }

  async mapRef(bytes: Uint8Array<ArrayBuffer>, mime: string, path: string): Promise<AssetRef | null> {
    const pyramid = await this.pyramid(await this.deps.hashes.of(bytes, path), bytes, mime, path, true);
    return pyramid ?? this.refOf(bytes, mime, { ...ASSET_USES.map, map: path }, path);
  }

  floorMaps(maps: FloorMaps): void {
    this.deps.floorMaps?.(maps);
  }

  /** Offers the images of a scene players may be shown next: maps as pyramids where they can be, uploaded last, never named to players. */
  async stage(assets: readonly { readonly path: string; readonly mime: string; readonly use: AssetUse; readonly map?: boolean }[]): Promise<void> {
    for (const asset of assets) {
      const stat = this.deps.stat(asset.path);
      if (stat === null) continue;
      const bytes = stat.size > ASSET_CAPS.image && asset.map !== true ? null : await this.deps.readFile(asset.path).catch(() => null);
      if (bytes === null) continue;
      const hash = await this.deps.hashes.of(bytes, asset.path);
      if (asset.map === true && (await this.pyramid(hash, bytes, asset.mime, asset.path, false)) !== undefined) continue;
      await this.deps.register({ key: hash, hash, size: bytes.length, mime: asset.mime, use: asset.map === true ? { ...asset.use, map: asset.path } : asset.use, source: { path: asset.path }, handed: false });
    }
  }

  /**
   * A map's pyramid noted for upload, as players are handed it, at once: its shape follows from the
   * image's header, and it goes up level by level as this device cuts it. Undefined where it goes as
   * an image (no header to read, no pyramid store, or a pyramid of this image failed before).
   */
  private async pyramid(hash: string, bytes: Uint8Array<ArrayBuffer>, mime: string, path: string, handed: boolean): Promise<AssetRef | undefined> {
    const { pyramids } = this.deps;
    if (pyramids === undefined || this.deps.tilesRefused() || !pyramids.drawable(hash)) return undefined;
    const shape = await headerPyramid(bytes);
    if (shape === null) return undefined;
    const pyramid = pyramids.make(hash, path, shape);
    const id = await this.deps.register({ key: pyramidKey(hash, TESSERA_SPEC), hash, size: pyramid.bytes, mime, use: { kind: 'tiles', rank: ASSET_RANKS.map }, source: { pyramid }, handed });
    return id === undefined ? undefined : { hash, size: pyramid.bytes, mime, id, tiles: true };
  }
}
