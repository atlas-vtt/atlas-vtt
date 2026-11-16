import { ASSET_CAPS, IMAGE_MIME_TYPES, isSide, type GmMessage, type ShownImage, type ShownImageRef } from '../../protocol/index.ts';
import { imageDimensions } from '../../../imageProcessing/imageDimensions';
import { ASSET_USES, type AssetStoring } from '../assets/assetUses.ts';
import type { VaultImage } from '../TokenShare.ts';

export interface ImageSharePorts {
  send(body: GmMessage, to?: string): void;
  now(): number;
  /** A new showing's id: 24 hex characters from the cryptographic source. */
  randomId(): string;
  /** An image is shown now, or none any more: the GM's control says so. */
  changed(): void;
  /** Takes a showing into the table's log, with its file's vault path (the GM's alone). */
  logShown?(shown: ShownImageRef, path: string | null): void;
  /** How players are handed images the store keeps for them; without it nothing is shown. */
  stored?: AssetStoring | undefined;
}

/** How a showing went: shown, replaced by what the GM asked for meanwhile, or why players cannot be sent the image. */
export type ShowResult = 'shown' | 'replaced' | 'too-large' | 'unreadable';

/**
 * The image the GM shows every player over the map ("Display on player view"). It is the table's,
 * not a scene's: it stays until the GM takes it away or shows another, and goes again to a player
 * who joins and to all after a reconnect. Players get the image only, by the id the asset store keeps
 * it under, with a new id for every showing and its own size, never its file's name or path.
 */
export class ImageShare {
  private readonly ports: ImageSharePorts;
  private current: { readonly shown: ShownImage; readonly bytes: Uint8Array<ArrayBuffer> } | null = null;
  /** Counts what the GM asked for: an image still being read or hashed when the next comes, or a dismissal, is not shown. */
  private turn = 0;

  constructor(ports: ImageSharePorts) {
    this.ports = ports;
  }

  /** Whether players are shown an image now. */
  get isShown(): boolean {
    return this.current !== null;
  }

  /**
   * Shows the image `read` gives to every player, in place of the one shown, and logs it with the
   * file's `path`. The last one asked for wins, however long each takes to read: the turn is taken
   * before the read begins. An image the store does not keep is not shown.
   */
  async show(read: () => Promise<VaultImage | null>, path: string | null = null): Promise<ShowResult> {
    const turn = (this.turn += 1);
    const image = await read().catch(() => null);
    if (image === null) return 'unreadable';
    if (image.bytes.length > ASSET_CAPS.image) return 'too-large';
    if (!IMAGE_MIME_TYPES.includes(image.mime)) return 'unreadable';
    const size = await imageDimensions(new Blob([image.bytes], { type: image.mime })).catch(() => null);
    if (size === null || !isSide(size.width) || !isSide(size.height)) return 'unreadable';
    // Kept, not read again for the upload: an SVG reaches players as a PNG drawn here.
    const ref = (await this.ports.stored?.refOf(image.bytes, image.mime, ASSET_USES.image)) ?? null;
    if (ref === null) return 'unreadable';
    if (turn !== this.turn) return 'replaced';
    this.current = { shown: { id: this.ports.randomId(), image: ref, width: size.width, height: size.height }, bytes: image.bytes };
    this.resend();
    this.ports.logShown?.({ image: ref, width: size.width, height: size.height }, path);
    this.ports.changed();
    return 'shown';
  }

  /** The shown image again, as the store keeps it now: one it no longer keeps is taken away. */
  async refreshAssets(): Promise<void> {
    const shown = this.current;
    if (shown === null) return;
    const ref = (await this.ports.stored?.refOf(shown.bytes, shown.shown.image.mime, ASSET_USES.image)) ?? null;
    if (this.current !== shown || ref?.id === shown.shown.image.id) return;
    if (ref === null) return void this.dismiss();
    this.current = { shown: { ...shown.shown, image: ref }, bytes: shown.bytes };
    this.resend();
  }

  /** Takes the image away from every player; false when none was shown. */
  dismiss(): boolean {
    this.turn += 1;
    if (this.current === null) return false;
    this.current = null;
    this.resend();
    this.ports.changed();
    return true;
  }

  /** What is shown, or that nothing is, to one player or to all. */
  resend(to?: string): void {
    this.ports.send({ t: 'shown-image', shown: this.current?.shown ?? null }, to);
  }
}
