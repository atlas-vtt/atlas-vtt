import { workSlices } from '../utils/workSlices';
import { isWithin, nameOfRelative, parentOfRelative } from './soundPaths';
import type { SoundFileEntry, SoundListing, SoundLocation } from './soundLocation';

/** While a walk runs, the view hears of it this often: counts settle without a render per folder. */
const WALK_REPORT_MS = 150;

export interface IndexedFile {
  entry: SoundFileEntry;
  /** The path as a search reads it. */
  words: string;
  order: string;
}

const EMPTY_LISTING: SoundListing = { folders: [], files: [] };

/** What a flat list sorts by, worked out once per file: a collator on thousands of names per report of a walk costs frames. `Track 2` before `Track 10`, `Émile` among the e. */
const sortKey = (name: string): string => name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\d+/g, (digits) => digits.padStart(8, '0'));

const sameListing = (a: SoundListing, b: SoundListing): boolean =>
  a.folders.length === b.folders.length && a.files.length === b.files.length
  && a.folders.every((folder, index) => folder.path === b.folders[index]?.path)
  && a.files.every((file, index) => {
    const other = b.files[index];
    return file.path === other?.path && file.size === other.size && file.mtime === other.mtime;
  });

/**
 * What one root holds, as far as it was read, by a walk in the background that never costs a frame.
 * An unchanged folder changes nothing, so rows memoised on `allFiles` stay put.
 */
export class FolderTree {
  private readonly listings = new Map<string, SoundListing>();
  private readonly files = new Map<string, SoundFileEntry>();
  private readonly loading = new Map<string, Promise<void>>();
  private readonly missing = new Set<string>();
  private counts: Map<string, number> | null = null;
  private indexed: IndexedFile[] | null = null;
  private byIdentity: Map<string, SoundFileEntry> | null = null;
  private walking = false;
  private walkedOnce = false;
  private wantsWalk = false;
  private released = false;
  private reportTimer = 0;

  constructor(
    private readonly location: SoundLocation,
    private readonly onChanged: () => void,
  ) {}

  listing(folder: string): SoundListing | null {
    return this.listings.get(folder) ?? null;
  }

  isMissing(folder: string): boolean {
    return this.missing.has(folder);
  }

  fileAt(path: string): SoundFileEntry | null {
    return this.files.get(path) ?? null;
  }

  /**
   * The file of a name and size, once every folder was read, so it is not the first of several that happens to have
   * been reached yet: the first in path order, so every device holding these files finds the same one.
   */
  fileNamed(name: string, size: number): SoundFileEntry | null {
    if (!this.walkedOnce) return null;
    this.byIdentity ??= this.identities();
    return this.byIdentity.get(`${size}|${name}`) ?? null;
  }

  /** Reads a folder now; a folder that is being read is not read twice. */
  load(folder: string): Promise<void> {
    const running = this.loading.get(folder);
    if (running) return running;
    const load = this.read(folder).then((changed) => {
      if (changed && !this.released) this.onChanged();
    }).finally(() => this.loading.delete(folder));
    this.loading.set(folder, load);
    return load;
  }

  /** Files below `folder`, counted through its subfolders; null until the walk has read them. */
  countBelow(folder: string): number | null {
    if (!this.listings.has(folder)) return null;
    this.counts ??= this.counted();
    return this.counts.get(folder) ?? 0;
  }

  /** Every file read so far by name, ready for a search; the same array until one changes, so rows memoised on it stay put. */
  allFiles(): readonly IndexedFile[] {
    this.indexed ??= [...this.files.values()]
      .map((entry) => ({ entry, words: entry.path.toLowerCase(), order: `${sortKey(entry.name)}\0${entry.path}` }))
      .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
    return this.indexed;
  }

  /** Whether every folder has been read once: what is not listed by then is not there. */
  get walked(): boolean {
    return this.walkedOnce;
  }

  /** Reads every folder from `from` on, a slice at a time. A walk asked for during a walk runs after it. */
  async walk(from = ''): Promise<void> {
    if (this.walking) {
      this.wantsWalk = true;
      return;
    }
    this.walking = true;
    const slice = workSlices();
    const seen = new Set<string>();
    const stack = [from];
    for (let folder = stack.pop(); folder !== undefined && !this.released; folder = stack.pop()) {
      seen.add(folder);
      if (await this.read(folder)) this.reportSoon();
      for (const sub of this.listings.get(folder)?.folders ?? []) stack.push(sub.path);
      if (!this.released) await slice();
    }
    if (this.released) return;
    this.dropAllBut(seen, from);
    this.walking = false;
    if (from === '') this.walkedOnce = true;
    window.clearTimeout(this.reportTimer);
    this.reportTimer = 0;
    this.onChanged();
    if (this.wantsWalk) {
      this.wantsWalk = false;
      void this.walk();
    }
  }

  /** Reads everything unless that has been done or is under way. */
  walkOnce(): void {
    if (!this.walkedOnce && !this.walking) void this.walk();
  }

  /** Something changed at `path`, or anywhere with null: reads what can have changed. New folders are walked, gone ones forgotten. */
  async changedAt(path: string | null): Promise<void> {
    if (path === null) return this.walk();
    await Promise.all([this.load(parentOfRelative(path)), ...(this.listings.has(path) ? [this.load(path)] : [])]);
    const parent = this.listings.get(parentOfRelative(path));
    if (parent?.folders.some((folder) => folder.name === nameOfRelative(path)) && !this.listings.has(path)) void this.walk(path);
  }

  release(): void {
    this.released = true;
    window.clearTimeout(this.reportTimer);
  }

  private reportSoon(): void {
    if (this.reportTimer !== 0) return;
    this.reportTimer = window.setTimeout(() => {
      this.reportTimer = 0;
      if (!this.released) this.onChanged();
    }, WALK_REPORT_MS);
  }

  private async read(folder: string): Promise<boolean> {
    let listing: SoundListing | null;
    try {
      listing = await this.location.list(folder);
    } catch (error) {
      console.error(`[Atlas] Could not read the sound folder ${folder}`, error);
      listing = null;
    }
    if (this.released) return false;
    const before = this.listings.get(folder);
    if (!listing) {
      if (this.missing.has(folder)) return false;
      this.missing.add(folder);
      this.forget(folder);
      this.listings.set(folder, EMPTY_LISTING);
      return true;
    }
    this.missing.delete(folder);
    if (before && sameListing(before, listing)) return false;
    for (const file of before?.files ?? []) this.files.delete(file.path);
    for (const file of listing.files) this.files.set(file.path, file);
    this.listings.set(folder, listing);
    for (const sub of before?.folders ?? []) {
      if (!listing.folders.some((folderNow) => folderNow.path === sub.path)) this.forget(sub.path);
    }
    this.dirty();
    return true;
  }

  private forget(folder: string): void {
    for (const path of [...this.listings.keys()]) {
      if (!isWithin(folder, path)) continue;
      for (const file of this.listings.get(path)?.files ?? []) this.files.delete(file.path);
      this.listings.delete(path);
    }
    this.dirty();
  }

  /** What a whole walk did not reach is gone. */
  private dropAllBut(seen: ReadonlySet<string>, from: string): void {
    for (const folder of [...this.listings.keys()]) {
      if (isWithin(from, folder) && !seen.has(folder)) this.forget(folder);
    }
  }

  private dirty(): void {
    this.counts = null;
    this.indexed = null;
    this.byIdentity = null;
  }

  private identities(): Map<string, SoundFileEntry> {
    const identities = new Map<string, SoundFileEntry>();
    for (const file of this.files.values()) {
      const identity = `${file.size}|${file.name}`;
      const first = identities.get(identity);
      if (!first || file.path < first.path) identities.set(identity, file);
    }
    return identities;
  }

  private counted(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const [folder, listing] of this.listings) {
      const here = listing.files.length;
      for (let at = folder; ; at = parentOfRelative(at)) {
        counts.set(at, (counts.get(at) ?? 0) + here);
        if (at === '') break;
      }
    }
    return counts;
  }
}
