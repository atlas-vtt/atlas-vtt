import { normalizePath, TFile, type App } from 'obsidian';
import { imageMimeOfBytes, imageMimeType, sha256Hex } from '../online/gm/assetServe.ts';
import { ASSET_CAPS, MAX_QUEST_IMAGES, type QuestEmbed } from '../online/protocol/index.ts';
import type { HashedRef } from '../online/gm/assets/assetUses.ts';

/** An image embed of a quest's text and the vault image it names. */
export interface ResolvedEmbed extends QuestEmbed {
  readonly file: TFile;
}

/** A target with a scheme (`https:`, `data:`, `app:`) is never looked up: such images are never fetched or sent. */
const REMOTE = /^[a-z][a-z0-9+.-]*:/i;

/** Whether a vault path names an image players may be sent, by its extension (what Obsidian embeds as an image). */
export const isImagePath = (path: string): boolean => imageMimeType(path) !== null;

/** A path relative to a folder (`./`, `../`), as a vault path; null where it climbs out of the vault. */
function relativePath(folder: string, target: string): string | null {
  const parts = folder === '' ? [] : folder.split('/');
  for (const part of target.split('/')) {
    if (part === '..') {
      if (parts.pop() === undefined) return null;
    } else if (part !== '.' && part !== '') parts.push(part);
  }
  return normalizePath(parts.join('/'));
}

const decoded = (target: string): string => {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
};

/**
 * The images quest notes embed: an embed's target resolved as Obsidian resolves links from the note
 * (`getFirstLinkpathDest`, a `./` or `../` path from the note's folder) to a vault file Obsidian
 * shows as an image, and that image's reference read from its bytes, whose type decides. A
 * reference is worked out once per version of the file (path, time and size).
 */
export class QuestImages {
  private readonly refs = new Map<string, { readonly stamp: string; readonly ref: Promise<HashedRef | null> }>();

  constructor(private readonly app: App) {}

  /** The embeds that name a vault image players may be sent, each target and size once, no more than a quest shows. */
  resolve(notePath: string, embeds: readonly QuestEmbed[]): ResolvedEmbed[] {
    const seen = new Set<string>();
    const resolved: ResolvedEmbed[] = [];
    for (const embed of embeds) {
      const key = `${embed.target}\n${embed.width}\n${embed.height}`;
      if (seen.has(key) || resolved.length === MAX_QUEST_IMAGES) continue;
      seen.add(key);
      const file = this.fileOf(notePath, embed.target);
      if (file !== null) resolved.push({ ...embed, file });
    }
    return resolved;
  }

  /** The reference of an image read from its bytes; null for one whose bytes are no image players may be sent, or too large. */
  refOf(file: TFile): Promise<HashedRef | null> {
    const stamp = stampOf(file);
    const known = this.refs.get(file.path);
    if (known?.stamp === stamp) return known.ref;
    const ref = this.read(file);
    this.refs.set(file.path, { stamp, ref });
    return ref;
  }

  /** Forgets the references of every image but those at `paths`. */
  retain(paths: ReadonlySet<string>): void {
    for (const path of [...this.refs.keys()]) if (!paths.has(path)) this.refs.delete(path);
  }

  private async read(file: TFile): Promise<HashedRef | null> {
    try {
      const bytes = new Uint8Array(await this.app.vault.readBinary(file));
      const mime = bytes.length > ASSET_CAPS.image ? null : imageMimeOfBytes(bytes);
      return mime === null ? null : { hash: await sha256Hex(bytes), size: bytes.length, mime };
    } catch (error) {
      console.error(`[Atlas] Could not read the image ${file.path} of a quest:`, error);
      return null;
    }
  }

  private fileOf(notePath: string, target: string): TFile | null {
    if (REMOTE.test(target)) return null;
    const linkpath = (target.split('#', 1)[0] ?? '').trim();
    if (linkpath === '') return null;
    for (const written of new Set([linkpath, decoded(linkpath)])) {
      const file = this.lookUp(notePath, written);
      if (file !== null) return isImagePath(file.path) && file.stat.size <= ASSET_CAPS.image ? file : null;
    }
    return null;
  }

  private lookUp(notePath: string, linkpath: string): TFile | null {
    if (linkpath.startsWith('./') || linkpath.startsWith('../')) {
      const path = relativePath(notePath.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : '', linkpath);
      return path === null ? null : this.app.vault.getFileByPath(path);
    }
    const dest = this.app.metadataCache.getFirstLinkpathDest(linkpath.replace(/^\/+/, ''), notePath);
    return dest instanceof TFile ? dest : null;
  }
}

/** A version of a file: its path, time and size. */
export const stampOf = (file: TFile): string => `${file.path}\n${file.stat.mtime}\n${file.stat.size}`;
