/** What a listener's sound is doing, for the chip that must never leave them silent without a word. */
export type SoundLifecycle = 'off' | 'joining' | 'playing' | 'needs-tap';

/** The part of an `AudioContext` that says whether it runs and can be told to. */
export interface WatchedContext {
  readonly currentTime: number;
  readonly state: string;
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

export interface WatchdogDeps {
  /** The context as it is now: a rebuild replaces it. */
  context(): WatchedContext;
  /** Builds a new context and graph. Cheap: positions come from the state. */
  rebuild(): void | Promise<void>;
  wait(ms: number): Promise<void>;
  onChange?(state: SoundLifecycle): void;
}

/** `resume()` can stay unsettled for good on iOS and in hidden web views. */
const RESUME_LIMIT_MS = 1000;
const SUSPEND_LIMIT_MS = 500;
const SUSPENDED_WAIT_MS = 225;
const SETTLE_MS = 250;

function settlesWithin(promise: Promise<void>, wait: Promise<void>): Promise<void> {
  return Promise.race([promise.catch(() => undefined), wait]);
}

/**
 * Watches that the context's clock really advances, since a context can read `running` with a frozen
 * clock. The owner calls `check` about once a second, and at once on `visibilitychange`. A clock that
 * stands goes through suspend, wait and resume, then a rebuilt context, and only then the tap chip.
 */
export class SoundWatchdog {
  private lifecycle: SoundLifecycle = 'off';
  private lastTime: number | null = null;
  private checking = false;
  /** Counts the stops: a recovery under way looks whether one came, since what it would build after that nobody closes. */
  private stops = 0;

  constructor(private readonly deps: WatchdogDeps) {}

  get state(): SoundLifecycle {
    return this.lifecycle;
  }

  /** Also what a tap does: the owner unlocks in the gesture, then starts over. */
  start(): void {
    this.lastTime = null;
    this.set('joining');
  }

  stop(): void {
    this.stops++;
    this.lastTime = null;
    this.set('off');
  }

  /** A check is one comparison; one that finds the clock standing runs the whole recovery. */
  async check(): Promise<void> {
    if (this.lifecycle === 'off' || this.checking) return;
    this.checking = true;
    try {
      const context = this.deps.context();
      const before = this.lastTime;
      const now = context.currentTime;
      this.lastTime = now;
      if (context.state === 'running' && before !== null && now > before) {
        this.set('playing');
        return;
      }
      if (context.state === 'running' && before === null) return;
      // The chip is up: a new context per second would help nothing until the listener taps.
      if (this.lifecycle !== 'needs-tap') await this.recover();
    } finally {
      this.checking = false;
    }
  }

  private async recover(): Promise<void> {
    const stops = this.stops;
    const recovered = (await this.restarted()) || (stops === this.stops && (await this.rebuilt()));
    if (stops !== this.stops) return;
    if (recovered) {
      this.set('playing');
      return;
    }
    this.lastTime = null;
    this.set('needs-tap');
  }

  private async restarted(): Promise<boolean> {
    const context = this.deps.context();
    if (context.state === 'running') {
      await settlesWithin(context.suspend(), this.deps.wait(SUSPEND_LIMIT_MS));
      await this.deps.wait(SUSPENDED_WAIT_MS);
    }
    await settlesWithin(context.resume(), this.deps.wait(RESUME_LIMIT_MS));
    return this.advances(context);
  }

  private async rebuilt(): Promise<boolean> {
    try {
      await this.deps.rebuild();
    } catch {
      return false;
    }
    const context = this.deps.context();
    await settlesWithin(context.resume(), this.deps.wait(RESUME_LIMIT_MS));
    return this.advances(context);
  }

  private async advances(context: WatchedContext): Promise<boolean> {
    const before = context.currentTime;
    await this.deps.wait(SETTLE_MS);
    const now = context.currentTime;
    this.lastTime = now;
    return context.state === 'running' && now > before;
  }

  private set(state: SoundLifecycle): void {
    if (state === this.lifecycle) return;
    this.lifecycle = state;
    this.deps.onChange?.(state);
  }
}
