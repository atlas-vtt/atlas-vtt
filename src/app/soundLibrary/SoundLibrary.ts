import type { App } from 'obsidian';
import type { SoundKind } from '../sound/soundTypes';
import { realLibraryDeps } from './soundLibraryDeps';
import { followMissingFiles } from './soundRelink';
import { FolderTree } from './FolderTree';
import { OpenPlace } from './libraryPlace';
import { SoundLengths } from './soundLengths';
import type { SoundFileEntry, SoundListing, SoundLocation } from './soundLocation';
import { externalAudioPath, joinRelative, parentOfRelative, readExternalAudioPath, relativeBelow } from './soundPaths';
import { isLinked, type LinkedSoundRoot, type SoundRootState, type SoundRoots } from './SoundRoots';

/** A file of the library, wherever it lies. */
export interface LibraryFile extends SoundFileEntry {
  kind: SoundKind;
}

/** How long changes on disk rest before they are read: a copy of a folder is thousands of events. */
const CHANGES_REST_MS = 300;
/** Beyond this many changed paths a whole walk is cheaper than reading each one's folder. */
const MANY_CHANGES = 64;
/** A rescan asked for sooner after the last is left out: returning to the window should cost nothing. */
const RESCAN_REST_MS = 5000;

export interface SoundLibraryDeps {
  roots: SoundRoots;
  /** The root's files; null where this device cannot reach them. */
  open(root: LinkedSoundRoot): SoundLocation | null;
  /** The user's home, to shorten what the rail shows. */
  home(): string | null;
  /** How long a file at a URL plays. */
  probeSeconds(url: string): Promise<number | null>;
  /** Lets go of what the deps listen to. */
  dispose?(): void;
}

interface OpenRoot {
  /** What the root was when it was opened, which tells when it has changed. */
  identity: string;
  location: SoundLocation;
  tree: FolderTree;
  stopWatching: () => void;
  changes: Set<string | null>;
  changesTimer: number;
  lastRescan: number;
}

const identityOf = (root: LinkedSoundRoot): string => `${root.status}:${root.path}`;

const KINDS: readonly SoundKind[] = ['music', 'ambience'];

/**
 * The GM's sound library: the two linked folders and what lies in them. Browsing
 * writes nothing. One per app, released when the plugin unloads.
 */
export class SoundLibrary {
  private static readonly instances = new WeakMap<App, SoundLibrary>();

  static forApp(app: App): SoundLibrary {
    let library = SoundLibrary.instances.get(app);
    if (!library) {
      library = new SoundLibrary(realLibraryDeps(app));
      SoundLibrary.instances.set(app, library);
      followMissingFiles(library, app);
    }
    return library;
  }

  /** A library on other files, for what cannot reach a disk. */
  static provide(app: App, library: SoundLibrary): void {
    SoundLibrary.instances.set(app, library);
  }

  static release(app: App): void {
    SoundLibrary.instances.get(app)?.destroy();
    SoundLibrary.instances.delete(app);
  }

  readonly place = new OpenPlace();
  private readonly open = new Map<SoundKind, OpenRoot>();
  private readonly viewListeners = new Set<() => void>();
  private readonly walkListeners = new Set<(kind: SoundKind) => void>();
  private revision = 0;
  private readonly dropRoots: () => void;
  private readonly lengths: SoundLengths;

  constructor(private readonly deps: SoundLibraryDeps) {
    this.dropRoots = deps.roots.onChange(() => this.changed());
    this.lengths = new SoundLengths((url) => deps.probeSeconds(url));
  }

  get roots(): SoundRoots {
    return this.deps.roots;
  }

  get home(): string | null {
    return this.deps.home();
  }

  /** Changes whenever anything shown may have: what `useSyncExternalStore` compares. */
  get version(): number {
    return this.revision;
  }

  rootOf(kind: SoundKind): SoundRootState {
    return this.deps.roots.stateOf(kind);
  }

  locationOf(kind: SoundKind): SoundLocation | null {
    return this.opened(kind)?.location ?? null;
  }

  /** What a folder holds; null while it is being read, which asks for it. */
  listing(kind: SoundKind, folder: string): SoundListing | null {
    const opened = this.opened(kind);
    if (!opened) return null;
    const listing = opened.tree.listing(folder);
    if (!listing) void opened.tree.load(folder);
    return listing;
  }

  countOf(kind: SoundKind, folder: string): number | null {
    return this.opened(kind)?.tree.countBelow(folder) ?? null;
  }

  isWalked(kind: SoundKind): boolean {
    return this.opened(kind)?.tree.isWalked ?? false;
  }

  filesOf(kind: SoundKind): readonly SoundFileEntry[] {
    return this.opened(kind)?.tree.allFiles().map(({ entry }) => entry) ?? [];
  }

  /** Files of both roots whose path holds every word, music first. */
  search(query: string): LibraryFile[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return KINDS.flatMap((kind) => (this.opened(kind)?.tree.allFiles() ?? [])
      .filter((file) => words.every((word) => file.words.includes(word)))
      .map(({ entry }) => ({ ...entry, kind })));
  }

  /** The view shows: read everything, in the background. A rescan just made is not made again. */
  rescan(now = Date.now()): void {
    for (const kind of KINDS) {
      const opened = this.opened(kind);
      if (!opened || now - opened.lastRescan < RESCAN_REST_MS) continue;
      opened.lastRescan = now;
      void opened.tree.walk();
    }
  }

  /** How long a file plays: a row in view asks, and `onLengths` tells when the answer is in. */
  secondsOf(file: LibraryFile): number | null | undefined {
    const url = this.locationOf(file.kind)?.resourceUrl(file.path) ?? null;
    return this.lengths.secondsOf(`${file.kind}|${file.path}|${file.size}|${file.mtime}`, url);
  }

  onLengths(listener: () => void): () => void {
    return this.lengths.onChange(listener);
  }

  /** What a record stores for a file of a root. */
  audioPathOf(kind: SoundKind, path: string): string | null {
    const root = this.rootOf(kind);
    if (!isLinked(root)) return null;
    return root.status === 'vault' ? joinRelative(root.path, path) : externalAudioPath(kind, path);
  }

  /** The root and path of what a record stores; null for a file in neither root. */
  fileOfAudioPath(audioPath: string): { kind: SoundKind; path: string } | null {
    const external = readExternalAudioPath(audioPath);
    if (external) return { kind: external.root, path: external.path };
    for (const kind of KINDS) {
      const root = this.rootOf(kind);
      if (root.status !== 'vault') continue;
      const path = root.path === '' ? audioPath : relativeBelow(root.path, audioPath);
      if (path !== null && path !== '') return { kind, path };
    }
    return null;
  }

  /** What a file on disk measures, from the listing. Null while unknown or gone: a listing still to come is asked for, and `onChange` tells. */
  statOfExternal(audioPath: string): { size: number; mtime: number } | null {
    const file = readExternalAudioPath(audioPath);
    const opened = file && this.rootOf(file.root).status === 'external' ? this.opened(file.root) : null;
    if (!file || !opened) return null;
    const entry = opened.tree.fileAt(file.path);
    if (entry) return entry;
    const parent = parentOfRelative(file.path);
    if (opened.tree.listing(parent)) {
      if (!opened.tree.isWalked) void opened.tree.walk();
    } else {
      void opened.tree.load(parent);
    }
    return null;
  }

  async readExternal(audioPath: string): Promise<Blob> {
    const file = readExternalAudioPath(audioPath);
    const location = file ? this.locationOf(file.root) : null;
    if (!file || !location) throw new Error(`${audioPath} is not reachable on this device.`);
    return location.read(file.path);
  }

  /** Reads what `paths` changed, at once: an operation of the library's own does not wait for the watch. */
  async settle(kind: SoundKind, paths: readonly string[]): Promise<void> {
    const opened = this.opened(kind);
    if (opened) await Promise.all(paths.map((path) => opened.tree.changedAt(path)));
  }

  /** Reads a folder again now. */
  async reread(kind: SoundKind, folder: string): Promise<void> {
    await this.opened(kind)?.tree.load(folder);
  }

  /** Whether a folder was asked for and is not there: the root's disk unplugged, the folder gone. */
  isMissing(kind: SoundKind, folder: string): boolean {
    return this.opened(kind)?.tree.isMissing(folder) ?? false;
  }

  /** Settles once these folders were read, so what lies in them can be measured. */
  async ensureListed(kind: SoundKind, folders: readonly string[]): Promise<void> {
    const opened = this.opened(kind);
    if (!opened) return;
    await Promise.all([...new Set(folders)].filter((folder) => !opened.tree.listing(folder)).map((folder) => opened.tree.load(folder)));
  }

  onChange(listener: () => void): () => void {
    this.viewListeners.add(listener);
    return () => this.viewListeners.delete(listener);
  }

  /** A root's walk has ended, so a file not found is not there. */
  onWalked(listener: (kind: SoundKind) => void): () => void {
    this.walkListeners.add(listener);
    return () => this.walkListeners.delete(listener);
  }

  destroy(): void {
    this.dropRoots();
    this.deps.dispose?.();
    this.lengths.stop();
    for (const kind of KINDS) this.close(kind);
    this.viewListeners.clear();
    this.walkListeners.clear();
  }

  private opened(kind: SoundKind): OpenRoot | null {
    const root = this.rootOf(kind);
    const current = this.open.get(kind);
    if (!isLinked(root)) {
      if (current) this.close(kind);
      return null;
    }
    if (current?.identity === identityOf(root)) return current;
    if (current) this.close(kind);
    const location = this.deps.open(root);
    if (!location) return null;
    const tree = new FolderTree(location, () => this.changed(), () => this.walked(kind));
    const entry: OpenRoot = { identity: identityOf(root), location, tree, stopWatching: () => undefined, changes: new Set(), changesTimer: 0, lastRescan: 0 };
    entry.stopWatching = location.watch((path) => this.heard(entry, path));
    this.open.set(kind, entry);
    return entry;
  }

  private heard(entry: OpenRoot, path: string | null): void {
    entry.changes.add(path);
    if (entry.changesTimer !== 0) return;
    entry.changesTimer = window.setTimeout(() => {
      entry.changesTimer = 0;
      const paths = [...entry.changes];
      entry.changes.clear();
      if (paths.includes(null) || paths.length > MANY_CHANGES) void entry.tree.walk();
      else for (const path of paths) void entry.tree.changedAt(path);
    }, CHANGES_REST_MS);
  }

  private close(kind: SoundKind): void {
    const entry = this.open.get(kind);
    if (!entry) return;
    window.clearTimeout(entry.changesTimer);
    entry.stopWatching();
    entry.tree.release();
    this.open.delete(kind);
  }

  private walked(kind: SoundKind): void {
    for (const listener of [...this.walkListeners]) listener(kind);
  }

  private changed(): void {
    this.revision++;
    for (const listener of [...this.viewListeners]) listener();
  }
}

