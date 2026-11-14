import { ASSET_CAPS, IMAGE_MIME_TYPES, isSide, type AssetRef } from '../../protocol/index.ts';
import { imageDimensions } from '../../../imageProcessing/imageDimensions';
import { isVideoMapPath } from '../../../pixi/mosaicCanvas/video/videoMapFiles';
import { ASSET_USES, type AssetStoring } from '../assets/assetUses.ts';
import type { VaultImage } from '../TokenShare.ts';

/** A vault file as it is now: when it was last written and how large it is. */
export interface FileStat {
  readonly mtime: number;
  readonly size: number;
}

/** An image as players are sent it: by its stored id (its tile pyramid where `image.tiles` says so), with its size in pixels. */
export interface MapImage {
  readonly image: AssetRef;
  readonly width: number;
  readonly height: number;
}

/**
 * How a page is handed a map: as its tile pyramid where this device can make one (`tiles`), as the
 * table's map is, or as one image (`whole`), for a page that draws no pyramid of the book's maps.
 */
export type MapForm = 'tiles' | 'whole';

/** Why a file is no image players can be sent: missing, larger than the store keeps it, not an image of a type players can open, or not kept by the asset store. */
export type MapImageProblem = 'missing' | 'too-large' | 'unreadable' | 'unstored';

export interface MapImagePorts {
  /** The file at a vault path as it is now, or null when there is none. */
  stat(path: string): FileStat | null;
  /** The image at a vault path, or null when it is missing or of a type players cannot be sent. */
  readImage(path: string): Promise<VaultImage | null>;
  /** An image that was being read is known now. */
  read(): void;
  /** How players are handed images the store keeps for them. */
  readonly stored?: AssetStoring | undefined;
}

type Known = MapImage | MapImageProblem | 'reading';

/** A path as last asked for: its time and size, and what it is in each form asked for. */
interface KnownFile {
  readonly key: string;
  readonly forms: Map<MapForm, Known>;
}

/**
 * The images of the world map and the maps it leads into, each read from its bytes once per form and
 * kept while its file stays as it is (its path, time and size). A map goes as its tile pyramid where
 * one can be made, else as one image within the store's cap for images; the image itself is read
 * only for a page that asks for it. A file that is missing, unreadable, too large, of a type players
 * cannot be sent or not kept by the store is no image, and `problemOf` says which.
 */
export class MapImages {
  private readonly ports: MapImagePorts;
  private readonly known = new Map<string, KnownFile>();
  /** Why the files last asked for that are no image (as pyramids, or images where none is made) are none. */
  private readonly problems = new Map<string, MapImageProblem>();

  constructor(ports: MapImagePorts) {
    this.ports = ports;
  }

  /** The image at a path in `form`: null for none, undefined while it is being read (`read` hears when it has been). */
  get(path: string, form: MapForm = 'tiles'): MapImage | null | undefined {
    const stat = this.ports.stat(path);
    if (stat === null) return this.none(path, form, 'missing');
    // An image larger than the store keeps one goes only as a pyramid, which `load` tells once it read the file.
    if (stat.size > ASSET_CAPS.image && form === 'whole') return null;
    const key = `${stat.mtime}\n${stat.size}`;
    let file = this.known.get(path);
    if (file?.key !== key) {
      file = { key, forms: new Map() };
      this.known.set(path, file);
    }
    const last = file.forms.get(form);
    if (last === 'reading') return undefined;
    if (last !== undefined) return typeof last === 'string' ? this.none(path, form, last) : this.found(path, form, last);
    const asked = file;
    asked.forms.set(form, 'reading');
    void this.load(path, form, stat.size).then((image) => {
      if (this.known.get(path) !== asked) return;
      asked.forms.set(form, image);
      this.ports.read();
    });
    return undefined;
  }

  /** Why the file at `path` was no image when it was last asked for, or null where it was one or is still being read. */
  problemOf(path: string): MapImageProblem | null {
    return this.problems.get(path) ?? null;
  }

  /** Forgets every image: each is read again (its reference may go out another way now). */
  clear(): void {
    this.known.clear();
  }

  /** Forgets every image but those at `paths`: the maps players may be shown now. */
  keepOnly(paths: ReadonlySet<string>): void {
    for (const path of [...this.known.keys()]) if (!paths.has(path)) this.known.delete(path);
    for (const path of [...this.problems.keys()]) if (!paths.has(path)) this.problems.delete(path);
  }

  /**
   * No page holds the maps as images any more: the images made only for such pages are let go of, so
   * they need not go up, and are made again where a page asks for them.
   */
  releaseWhole(): void {
    for (const file of this.known.values()) {
      const whole = file.forms.get('whole');
      const tiles = file.forms.get('tiles');
      if (typeof whole !== 'object' || (typeof tiles === 'object' && tiles.image.id === whole.image.id)) continue;
      file.forms.delete('whole');
      this.ports.stored?.release(whole.image);
    }
  }

  private none(path: string, form: MapForm, problem: MapImageProblem): null {
    if (form === 'tiles') this.problems.set(path, problem);
    return null;
  }

  private found(path: string, form: MapForm, image: MapImage): MapImage {
    if (form === 'tiles') this.problems.delete(path);
    return image;
  }

  private async load(path: string, form: MapForm, fileSize: number): Promise<MapImage | MapImageProblem> {
    try {
      const image = await this.ports.readImage(path);
      if (image === null) return this.ports.stat(path) === null ? 'missing' : 'unreadable';
      if (!IMAGE_MIME_TYPES.includes(image.mime)) return 'unreadable';
      const size = await imageDimensions(new Blob([image.bytes], { type: image.mime }));
      if (size === null || !isSide(size.width) || !isSide(size.height)) return 'unreadable';
      const ref = await this.refOf(path, image, form, Math.max(fileSize, image.bytes.length) > ASSET_CAPS.image);
      return typeof ref === 'string' ? ref : { image: ref, width: size.width, height: size.height };
    } catch {
      return 'unreadable';
    }
  }

  /** How the store keeps the image read from `path` in `form` (`large`: past the cap for images): a poster of an animated map always as an image, which is drawn from its video. */
  private async refOf(path: string, image: VaultImage, form: MapForm, large: boolean): Promise<AssetRef | MapImageProblem> {
    const { stored } = this.ports;
    const video = isVideoMapPath(path);
    const ref = form === 'tiles' && !video
      ? ((await stored?.mapRef(image.bytes, image.mime, path, 'book')) ?? null)
      : large ? null : ((await stored?.refOf(image.bytes, image.mime, ASSET_USES.image, video ? undefined : path)) ?? null);
    if (ref?.tiles !== true && large) {
      if (ref !== null) stored?.release(ref);
      return 'too-large';
    }
    return ref ?? 'unstored';
  }
}
