/** A player window without a display frame for this long is stepped by the main window's clock. */
export const FALLBACK_AFTER_MS = 500;
/** How often the main window's clock steps the mirror in the player window's place. */
export const FALLBACK_FPS = 30;

/** The timer functions of the window that owns the clock. */
type Clock = Pick<Window, 'setInterval' | 'clearInterval'>;

/**
 * Steps the player window's mirror from the main window while the player window gets no display
 * frames but is not hidden.
 *
 * The mirror runs on the player window's animation frames. A window on another virtual desktop
 * (Linux: the TV's) is not hidden to the page, since its throttling is off
 * (`keepPlayerWindowAwake`), yet it gets no animation frames at all, while the compositor still
 * shows it on its screen. Once it has had none for `FALLBACK_AFTER_MS`, `step` runs at most
 * `FALLBACK_FPS` times a second in their place, until its own frames come back. The mirror keeps
 * its own cap and only asks for a render when players are owed a frame, so this renders nothing
 * while frames flow or the map is idle. A window the page reports hidden (minimised) gets nothing.
 */
export class PlayerMirrorFallback {
  private lastDisplayFrameAt = -Infinity;
  private timer: number | null = null;

  constructor(
    /** The player window, or null once the loop it belongs to is over. */
    private readonly playerWindow: () => Window | null,
    /** One step of the mirror, as a display frame of the player window would run it. */
    private readonly step: () => void,
    private readonly clock: Clock = window,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Starts watching; the player window has `FALLBACK_AFTER_MS` from now to show a display frame. */
  start(): void {
    if (this.timer !== null) return;
    this.lastDisplayFrameAt = this.now();
    this.timer = this.clock.setInterval(this.tick, 1000 / FALLBACK_FPS);
  }

  /** Run on every display frame of the player window. */
  displayFrame(): void {
    this.lastDisplayFrameAt = this.now();
  }

  stop(): void {
    if (this.timer === null) return;
    this.clock.clearInterval(this.timer);
    this.timer = null;
  }

  private readonly tick = (): void => {
    if (this.now() - this.lastDisplayFrameAt < FALLBACK_AFTER_MS) return;
    const win = this.playerWindow();
    if (!win || win.closed || win.document.visibilityState === 'hidden') return;
    this.step();
  };
}
