import { followOutputDevice, forgetOutputFollower } from '../sound/engine/outputDevice';
import type { SoundContext } from '../sound/engine/audioNodes';
import type { LocalLevels } from '../sound/engine/mixerGraph';
import { SoundPlayer } from '../sound/engine/soundPlayer';
import type { ResolveBytes } from '../sound/engine/soundSources';
import { SoundWatchdog, type SoundLifecycle, type WatchedContext } from '../sound/engine/soundWatchdog';
import { unlockInGesture } from '../sound/engine/unlockInGesture';
import type { TableSound } from '../sound/soundTypes';

/** What the director needs of an `AudioContext`. */
export interface OutputContext extends SoundContext, WatchedContext {
  close(): Promise<void>;
}

export interface SoundOutputDeps {
  createContext(): OutputContext;
  tableNow(): number;
  resolve: ResolveBytes;
  levels(): LocalLevels;
  onSoundError(key: string, error: unknown): void;
  onLifecycle(state: SoundLifecycle): void;
  wait(ms: number): Promise<void>;
  spareDecodedBytes?: number;
}

/**
 * The one context of the app and the players on it: the table's, and the preview's, which reaches
 * the GM alone. Exists only from the first sound until the last has ended, so a GM who plays nothing
 * pays nothing. Nothing here knows of moods or scenes.
 */
export class SoundOutput {
  private context: OutputContext | null = null;
  private player: SoundPlayer | null = null;
  private preview: SoundPlayer | null = null;
  private watchdog: SoundWatchdog | null = null;

  constructor(private readonly deps: SoundOutputDeps) {}

  get isOpen(): boolean {
    return this.context !== null;
  }

  get lifecycle(): SoundLifecycle {
    return this.watchdog?.state ?? 'off';
  }

  /** Inside the GM's gesture: what lets sound start without being refused. */
  unlock(): void {
    const context = this.open();
    unlockInGesture(context);
    this.watchdog?.start();
  }

  /** Without a gesture, as a scene following: the watchdog says so if it stays silent. */
  ensureRunning(): void {
    const context = this.open();
    context.resume().catch(() => undefined);
  }

  setState(state: TableSound | null): void {
    this.player?.setState(state);
  }

  setPreview(state: TableSound | null): void {
    if (state === null) {
      this.preview?.dispose();
      this.preview = null;
      return;
    }
    const context = this.open();
    this.preview ??= this.playerOn(context, { musicDb: 0, ambienceDb: 0, masterDb: this.deps.levels().masterDb });
    this.preview.setState(state);
  }

  setLevels(levels: LocalLevels): void {
    this.player?.setLocalLevels(levels);
    this.preview?.setLocalLevels({ musicDb: 0, ambienceDb: 0, masterDb: levels.masterDb });
  }

  tick(): void {
    this.player?.tick();
    this.preview?.tick();
  }

  check(): Promise<void> {
    return this.watchdog?.check() ?? Promise.resolve();
  }

  /** A window coming back is when a context turns out to have stopped. */
  watchVisibility(): () => void {
    const changed = (): void => void this.check();
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }

  decodedBytes(): number {
    return this.player?.decodedBytes() ?? 0;
  }

  waitingKeys(): string[] {
    return this.player?.waitingKeys() ?? [];
  }

  close(): void {
    this.watchdog?.stop();
    this.watchdog = null;
    this.preview?.dispose();
    this.preview = null;
    this.player?.dispose();
    this.player = null;
    this.closeContext();
  }

  private open(): OutputContext {
    if (this.context) return this.context;
    const context = this.deps.createContext();
    followOutputDevice(context);
    this.context = context;
    this.player = this.playerOn(context, this.deps.levels());
    this.watchdog = new SoundWatchdog({
      context: () => this.context ?? context,
      rebuild: () => this.rebuild(),
      wait: (ms) => this.deps.wait(ms),
      onChange: (state) => this.deps.onLifecycle(state),
    });
    this.watchdog.start();
    return context;
  }

  private playerOn(context: OutputContext, levels: LocalLevels): SoundPlayer {
    return new SoundPlayer({
      context,
      tableNow: () => this.deps.tableNow(),
      resolve: (key) => this.deps.resolve(key),
      levels,
      onSoundError: (key, error) => this.deps.onSoundError(key, error),
      ...(this.deps.spareDecodedBytes !== undefined && { spareDecodedBytes: this.deps.spareDecodedBytes }),
    });
  }

  /** A new context: everything comes back from the state, in its place. */
  private rebuild(): void {
    this.closeContext();
    const context = this.deps.createContext();
    followOutputDevice(context);
    this.context = context;
    this.player?.useContext(context);
    this.preview?.useContext(context);
    context.resume().catch(() => undefined);
  }

  private closeContext(): void {
    if (!this.context) return;
    forgetOutputFollower(this.context);
    this.context.close().catch(() => undefined);
    this.context = null;
  }
}

