import { TFile, type App } from 'obsidian';
import { vaultBasePath } from '../../../platform/vaultBasePath';
import { toBase64 } from '../../../utils/base64';
import { resourceUrlToVaultPath } from '../../../utils/pathUtils';
import { imageMimeOfBytes, sha256Hex } from '../../gm/assetServe.ts';
import { MAX_PORTRAIT_BYTES, type GmScreenMessage } from '../../protocol/index.ts';

type PortraitMessage = Extract<GmScreenMessage, { t: 'portrait' }>;

/** A smaller copy of an image too large to send: WebP bytes (`renderThumbnail`). */
export type ShrinkImage = (image: Blob) => Promise<ArrayBuffer>;

/** A version of a file: its path, time and size. */
const stampOf = (file: TFile): string => `${file.path}\n${file.stat.mtime}\n${file.stat.size}`;

/**
 * The pictures a GM screen device is sent, each by the hash of the bytes it is sent as: a token's art or a
 * statblock's picture, read from the vault and, where larger than `MAX_PORTRAIT_BYTES`, shrunk. The device
 * asks for a picture by its hash (`portrait-ask`) and is sent only one this shelf holds; no vault path leaves it.
 */
export class PortraitShelf {
  private readonly byStamp = new Map<string, Promise<PortraitMessage | null>>();
  private readonly byHash = new Map<string, PortraitMessage>();
  /** What each read file gave, once it is read. */
  private readonly settled = new Map<string, PortraitMessage | null>();

  constructor(private readonly app: App, private readonly shrink: ShrinkImage) {}

  /** The vault image an `<img>` of a drawing shows: one whose address is that file's own, else none. */
  fileOfSource(source: string): TFile | null {
    const path = resourceUrlToVaultPath(source, vaultBasePath(this.app.vault.adapter));
    const file = path === null ? null : this.app.vault.getFileByPath(path);
    const plain = (address: string): string => address.split('?', 1)[0] ?? address;
    return file instanceof TFile && plain(this.app.vault.getResourcePath(file)) === plain(source) ? file : null;
  }

  /** The hash a vault image is sent by, once it is read; null for a file that is no image a device can be sent. */
  hashOf(file: TFile): Promise<string | null> {
    const stamp = stampOf(file);
    let read = this.byStamp.get(stamp);
    if (read === undefined) {
      read = this.read(file);
      this.byStamp.set(stamp, read);
    }
    return read.then((portrait) => portrait?.hash ?? null);
  }

  /** The hash of a vault image already read (`hashOf`); undefined while it is not. */
  knownHash(file: TFile): string | null | undefined {
    const read = this.settled.get(stampOf(file));
    return read === undefined ? undefined : read?.hash ?? null;
  }

  /** The message that sends the picture of `hash`; null for a hash this shelf never made. */
  portrait(hash: string): PortraitMessage | null {
    return this.byHash.get(hash) ?? null;
  }

  private async read(file: TFile): Promise<PortraitMessage | null> {
    let portrait: PortraitMessage | null = null;
    try {
      portrait = await this.portraitOf(new Uint8Array(await this.app.vault.readBinary(file)));
    } catch (error) {
      console.error(`[Atlas] Could not read the picture ${file.path} for a GM screen device:`, error);
    }
    this.settled.set(stampOf(file), portrait);
    if (portrait) this.byHash.set(portrait.hash, portrait);
    return portrait;
  }

  private async portraitOf(bytes: Uint8Array<ArrayBuffer>): Promise<PortraitMessage | null> {
    if (imageMimeOfBytes(bytes) === null) return null;
    const sent = bytes.length <= MAX_PORTRAIT_BYTES ? bytes : new Uint8Array(await this.shrink(new Blob([bytes])));
    const mime = imageMimeOfBytes(sent);
    if (mime === null || sent.length > MAX_PORTRAIT_BYTES) return null;
    return { t: 'portrait', hash: await sha256Hex(sent), mime, data: toBase64(sent) };
  }
}
