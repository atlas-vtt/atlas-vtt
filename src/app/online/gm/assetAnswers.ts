import type { GmMessage, PlayerAssetRequest } from '../protocol/index.ts';
import { assetChunks, ServedAssets, sha256Hex } from './assetServe.ts';
import { AssetVariants, type ScaleImage } from './assetVariants.ts';
import type { SharedVideo } from './floorVideo.ts';
import type { VaultImage } from './TokenShare.ts';

export interface AssetAnswerPorts {
  send(body: GmMessage, to: string): void;
  now(): number;
  readImage(path: string): Promise<VaultImage | null>;
  /** Scales an image for a player who asks for a longest side; without it players get originals only. */
  scaleImage?: ScaleImage | undefined;
  /** An animated map's video at a vault path; without it no video is served. */
  readVideo?: ((path: string) => Promise<VaultImage | null>) | undefined;
}

/** An image of the picture held in memory: the map. */
export interface PictureImage {
  readonly hash: string;
  readonly bytes: Uint8Array;
  readonly mime: string;
}

/**
 * What a player may be sent now: the assets of their current picture. Each question names the player
 * who asks, for a picture that is not the same for everyone (a player's own book).
 */
export interface PictureAssets {
  /** The shared map's image, while one is shared. */
  map(player: string): PictureImage | null;
  /** The shared map's video, while the map is an animated one players may play. */
  video?(player: string): SharedVideo | null;
  /** The explored memory by hash, while it is the one players were sent. */
  explored(hash: string, player: string): Uint8Array | undefined;
  /** The vault path of artwork the picture shows (a token's or an initiative portrait's, an image of a quest's text), by hash. */
  artPath(hash: string, player: string): string | undefined;
  /** A text the picture names by hash (a quest's whole text), as its bytes. */
  text?(hash: string, player: string): Uint8Array | undefined;
}

/**
 * Answers players' asset requests: only for the map, its video, the explored memory, artwork or a text of their
 * current picture, from the chunk they ask for on, and an image larger than a longest side they ask for as a
 * scaled copy (`AssetVariants`) announced by an `asset-variant` message. Anything else is refused.
 */
export class AssetAnswers {
  private readonly served = new ServedAssets();
  private readonly variants: AssetVariants | null;

  constructor(private readonly ports: AssetAnswerPorts, private readonly picture: PictureAssets) {
    this.variants = ports.scaleImage === undefined ? null : new AssetVariants(ports.scaleImage);
  }

  answer(from: string, request: PlayerAssetRequest): void {
    const { hash, maxSide } = request;
    const first = request.from ?? 0;
    const video = this.mapVideo(hash, from);
    // A video is never scaled: whatever side is asked for, it is the same asset
    if (video !== null) {
      if (this.served.take(from, hash, first, this.ports.now())) void this.serveVideo(hash, video.path, from, first);
      return;
    }
    const map = this.mapImage(hash, from);
    const isMap = map !== null;
    const explored = isMap ? undefined : this.picture.explored(hash, from);
    const art = isMap || explored !== undefined ? undefined : this.picture.artPath(hash, from);
    const bytes = explored ?? (isMap || art !== undefined ? undefined : this.picture.text?.(hash, from));
    if (!isMap && bytes === undefined && art === undefined) return this.refuse(hash, from);
    if (!this.served.take(from, maxSide === undefined ? hash : `${hash}@${maxSide}`, first, this.ports.now())) return;
    if (bytes !== undefined) return this.serve(hash, bytes, from, first);
    if (isMap) return void this.serveImage(hash, map.bytes, map.mime, from, first, maxSide);
    if (art !== undefined) void this.serveArt(hash, art, from, first, maxSide);
  }

  /** A player left, or the picture changed for all (`undefined`): requests may come again at once. */
  forget(player?: string): void {
    if (player === undefined) this.served.clear();
    else this.served.forget(player);
  }

  /** Reads artwork again and serves it while it still has the hash the player's picture names. */
  private async serveArt(hash: string, path: string, to: string, first: number, maxSide: number | undefined): Promise<void> {
    const image = await this.ports.readImage(path).catch(() => null);
    if (image === null || this.picture.artPath(hash, to) !== path || (await sha256Hex(image.bytes)) !== hash) return this.refuse(hash, to);
    await this.serveImage(hash, image.bytes, image.mime, to, first, maxSide);
  }

  /** Reads the map's video again and serves it while it still has the hash the player's picture names. */
  private async serveVideo(hash: string, path: string, to: string, first: number): Promise<void> {
    const video = (await this.ports.readVideo?.(path).catch(() => null)) ?? null;
    if (video === null || this.mapVideo(hash, to)?.path !== path || (await sha256Hex(video.bytes)) !== hash) return this.refuse(hash, to);
    this.serve(hash, video.bytes, to, first);
  }

  /** The image itself, or its scaled copy for `maxSide`, while it is still in the picture once the copy is made. */
  private async serveImage(hash: string, bytes: Uint8Array, mime: string, to: string, first: number, maxSide: number | undefined): Promise<void> {
    if (maxSide === undefined || this.variants === null) return this.serve(hash, bytes, to, first);
    const variant = await this.variants.get(hash, bytes, mime, maxSide);
    if (!this.inPicture(hash, to)) return this.refuse(hash, to);
    if (variant === null) return this.serve(hash, bytes, to, first);
    this.ports.send({ t: 'asset-variant', hash, maxSide, variant: variant.ref, width: variant.width, height: variant.height }, to);
    this.serve(variant.ref.hash, variant.bytes, to, first);
  }

  private inPicture(hash: string, player: string): boolean {
    return this.mapImage(hash, player) !== null || this.picture.artPath(hash, player) !== undefined;
  }

  /** The map by hash, while the player's picture shows it. */
  private mapImage(hash: string, player: string): PictureImage | null {
    const map = this.picture.map(player);
    return map?.hash === hash ? map : null;
  }

  /** The map's video by hash, while the player's picture shows it. */
  private mapVideo(hash: string, player: string): SharedVideo | null {
    const video = this.picture.video?.(player) ?? null;
    return video?.ref.hash === hash ? video : null;
  }

  private serve(hash: string, bytes: Uint8Array, to: string, first: number): void {
    for (const chunk of assetChunks(hash, bytes, first)) this.ports.send(chunk, to);
  }

  private refuse(hash: string, to: string): void {
    this.served.forget(to, hash);
    this.ports.send({ t: 'asset-refused', hash }, to);
  }
}
