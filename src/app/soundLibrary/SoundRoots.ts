import type { SoundKind } from '../sound/soundTypes';
import type { SharedSoundRoot, SharedSoundRoots } from './soundRootsStore';
import { isAtlasOwn } from './soundFiles';
import { isWithin, movedRelative, relativeBelow } from './soundPaths';

export type SoundRootState =
  | { kind: SoundKind; status: 'unlinked' }
  /** Linked outside the vault on another device, and not on this one: its records wait for their files. */
  | { kind: SoundKind; status: 'not-linked-here' }
  | { kind: SoundKind; status: 'vault'; path: string }
  | { kind: SoundKind; status: 'external'; path: string };

export type LinkedSoundRoot = Extract<SoundRootState, { status: 'vault' | 'external' }>;

export const isLinked = (root: SoundRootState): root is LinkedSoundRoot => root.status === 'vault' || root.status === 'external';

/** The default folders of what is imported while nothing is linked. */
export const DEFAULT_SOUND_FOLDERS: Readonly<Record<SoundKind, string>> = {
  music: 'atlas-vtt/sounds/music',
  ambience: 'atlas-vtt/sounds/ambience',
};

/** Where the two kinds of fact about a root are kept: the plugin's data, which sync carries, and this device's local storage. */
export interface SoundRootFacts {
  shared(): SharedSoundRoots;
  setShared(roots: SharedSoundRoots): void;
  onSharedChange(listener: () => void): () => void;
  local(kind: SoundKind): string | null;
  setLocal(kind: SoundKind, path: string | null): void;
  /** The vault's folder on this device; null where it has none on a disk. */
  vaultBase(): string | null;
  /** A folder's path with its symbolic links resolved, as far as that can be told. */
  realPath(path: string): Promise<string>;
}

export type LinkOutcome = 'linked' | 'overlap' | 'reserved';

const OTHER: Readonly<Record<SoundKind, SoundKind>> = { music: 'ambience', ambience: 'music' };

/**
 * The GM's two linked folders. A file's kind comes from the root it lies in, so one root never lies in
 * the other. Unlinking forgets the link and touches no file.
 */
export class SoundRoots {
  private readonly listeners = new Set<() => void>();
  private readonly dropShared: () => void;

  constructor(private readonly facts: SoundRootFacts) {
    this.dropShared = facts.onSharedChange(() => this.changed());
  }

  /** What this device's facts say of a root: its own link wins, as a device may keep a folder elsewhere. */
  stateOf(kind: SoundKind): SoundRootState {
    const local = this.facts.local(kind);
    if (local) return { kind, status: 'external', path: local };
    const shared: SharedSoundRoot | undefined = this.facts.shared()[kind];
    if (!shared) return { kind, status: 'unlinked' };
    return shared.type === 'vault' ? { kind, status: 'vault', path: shared.path } : { kind, status: 'not-linked-here' };
  }

  /** Links a folder the system's dialog gave. Inside the vault it is stored as a vault path, whichever way it was reached. */
  async linkChosen(kind: SoundKind, absolute: string): Promise<LinkOutcome> {
    const base = this.facts.vaultBase();
    const below = base === null ? null
      : relativeBelow(base, absolute) ?? relativeBelow(await this.facts.realPath(base), await this.facts.realPath(absolute));
    return below === null ? this.linkExternal(kind, absolute) : this.linkVault(kind, below);
  }

  linkVault(kind: SoundKind, path: string): LinkOutcome {
    if (isAtlasOwn(path)) return 'reserved';
    const other = this.stateOf(OTHER[kind]);
    if (other.status === 'vault' && (isWithin(other.path, path) || isWithin(path, other.path))) return 'overlap';
    this.facts.setLocal(kind, null);
    this.write(kind, { type: 'vault', path });
    return 'linked';
  }

  private linkExternal(kind: SoundKind, path: string): LinkOutcome {
    const other = this.stateOf(OTHER[kind]);
    if (other.status === 'external' && (relativeBelow(other.path, path) !== null || relativeBelow(path, other.path) !== null)) return 'overlap';
    this.facts.setLocal(kind, path);
    this.write(kind, { type: 'external' });
    return 'linked';
  }

  /** A linked vault folder renamed or moved in the vault stays linked. */
  followVaultMove(from: string, to: string): void {
    for (const kind of ['music', 'ambience'] as const) {
      const shared = this.facts.shared()[kind];
      const moved = shared?.type === 'vault' ? movedRelative(shared.path, from, to) : null;
      if (moved !== null) this.write(kind, { type: 'vault', path: moved });
    }
  }

  /** Forgets the link on this device and for the devices that share its settings. A device with a folder of its own keeps that. */
  unlink(kind: SoundKind): void {
    this.facts.setLocal(kind, null);
    this.write(kind, null);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.dropShared();
    this.listeners.clear();
  }

  private write(kind: SoundKind, root: SharedSoundRoot | null): void {
    const roots = { ...this.facts.shared() };
    if (root) roots[kind] = root;
    else delete roots[kind];
    this.facts.setShared(roots);
    this.changed();
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
