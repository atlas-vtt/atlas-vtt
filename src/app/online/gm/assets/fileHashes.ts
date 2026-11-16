import { sha256Hex } from '../assetServe.ts';

/** A vault file as it is now, by which a hash already worked out is known to still hold. */
export interface FileStat {
  readonly mtime: number;
  readonly size: number;
}

const keyOf = (stat: FileStat | null): string | null => (stat === null ? null : `${stat.mtime}\n${stat.size}`);

/**
 * Content hashes of vault files, each worked out again only once its file changed (its time or size),
 * as the map image cache knows an unchanged file: a scene names the same artwork again and again, and
 * an animated map's video may be hundreds of megabytes.
 */
export class FileHashes {
  private readonly known = new Map<string, { readonly key: string; readonly hash: string }>();

  constructor(private readonly stat: (path: string) => FileStat | null) {}

  /** The hash kept for a file as it is now, or undefined. */
  kept(path: string): string | undefined {
    const known = this.known.get(path);
    return known !== undefined && known.key === keyOf(this.stat(path)) ? known.hash : undefined;
  }

  /** The hash of bytes, read from the vault file at `path` where they are its content. */
  async of(bytes: Uint8Array<ArrayBuffer>, path?: string): Promise<string> {
    if (path === undefined) return sha256Hex(bytes);
    const kept = this.kept(path);
    if (kept !== undefined) return kept;
    const key = keyOf(this.stat(path));
    const hash = await sha256Hex(bytes);
    if (key !== null) this.known.set(path, { key, hash });
    return hash;
  }
}
