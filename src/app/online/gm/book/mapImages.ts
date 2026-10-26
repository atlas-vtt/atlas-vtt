import { IMAGE_MIME_TYPES, isSide, MAX_ASSET_BYTES, type AssetRef } from '../../protocol/index.ts';
import { imageDimensions } from '../../../imageProcessing/imageDimensions';
import { sha256Hex } from '../assetServe.ts';
import type { VaultImage } from '../TokenShare.ts';

/** A vault file as it is now: when it was last written and how large it is. */
export interface FileStat {
  readonly mtime: number;
  readonly size: number;
}

/** An image as players are sent it: by hash, with its size in pixels. */
export interface MapImage {
  readonly image: AssetRef;
  readonly width: number;
  readonly height: number;
}

/** Why a file is no image players can be sent: missing, larger than `MAX_ASSET_BYTES`, or not an image of a type players can open. */
export type MapImageProblem = 'missing' | 'too-large' | 'unreadable';

export interface MapImagePorts {
  /** The file at a vault path as it is now, or null when there is none. */
  stat(path: string): FileStat | null;
  /** The image at a vault path, or null when it is missing or of a type players cannot be sent. */
  readImage(path: string): Promise<VaultImage | null>;
  /** An image that was being read is known now. */
  read(): void;
}

/**
 * The images of the world map and the maps it leads into, each read from its bytes once and kept
 * while its file stays as it is (its path, time and size). A file that is missing, unreadable, too
 * large or of a type players cannot be sent is no image, and `problemOf` says which.
 */
export class MapImages {
  private readonly ports: MapImagePorts;
  /** Each path asked for, by its time and size, with what it is (or why it is none); `reading` until that is known. */
  private readonly known = new Map<string, { readonly key: string; readonly image: MapImage | MapImageProblem | 'reading' }>();
  /** Why the files last asked for that are no image are none. */
  private readonly problems = new Map<string, MapImageProblem>();

  constructor(ports: MapImagePorts) {
    this.ports = ports;
  }

  /** The image at a path: null for none, undefined while it is being read (`read` hears when it has been). */
  get(path: string): MapImage | null | undefined {
    const stat = this.ports.stat(path);
    if (stat === null || stat.size > MAX_ASSET_BYTES) return this.none(path, stat === null ? 'missing' : 'too-large');
    const key = `${stat.mtime}\n${stat.size}`;
    const last = this.known.get(path);
    if (last?.key === key) {
      if (last.image === 'reading') return undefined;
      return typeof last.image === 'string' ? this.none(path, last.image) : this.found(path, last.image);
    }
    this.known.set(path, { key, image: 'reading' });
    void this.load(path).then((image) => {
      if (this.known.get(path)?.key !== key) return;
      this.known.set(path, { key, image });
      this.ports.read();
    });
    return undefined;
  }

  /** Why the file at `path` was no image when it was last asked for, or null where it was one or is still being read. */
  problemOf(path: string): MapImageProblem | null {
    return this.problems.get(path) ?? null;
  }

  /** Forgets every image but those at `paths`: the maps players may be shown now. */
  keepOnly(paths: ReadonlySet<string>): void {
    for (const path of [...this.known.keys()]) if (!paths.has(path)) this.known.delete(path);
    for (const path of [...this.problems.keys()]) if (!paths.has(path)) this.problems.delete(path);
  }

  private none(path: string, problem: MapImageProblem): null {
    this.problems.set(path, problem);
    return null;
  }

  private found(path: string, image: MapImage): MapImage {
    this.problems.delete(path);
    return image;
  }

  private async load(path: string): Promise<MapImage | MapImageProblem> {
    try {
      const image = await this.ports.readImage(path);
      if (image === null) return this.ports.stat(path) === null ? 'missing' : 'unreadable';
      if (image.bytes.length > MAX_ASSET_BYTES) return 'too-large';
      if (!IMAGE_MIME_TYPES.includes(image.mime)) return 'unreadable';
      const size = await imageDimensions(new Blob([image.bytes], { type: image.mime }));
      if (size === null || !isSide(size.width) || !isSide(size.height)) return 'unreadable';
      return { image: { hash: await sha256Hex(image.bytes), size: image.bytes.length, mime: image.mime }, width: size.width, height: size.height };
    } catch {
      return 'unreadable';
    }
  }
}
