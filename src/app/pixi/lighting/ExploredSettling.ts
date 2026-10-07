/**
 * Whether an explored memory may hold less than the scene's saved mask, which then would show
 * more than the memory does: an edit took area out since the last save, a mask is still being
 * drawn in, or the store counts an undo or redo the memory has not followed yet (`unfollowed`).
 * Tells `onSettled` when that stops.
 */
export class ExploredSettling {
  private shrunk = false;
  private loading = false;

  constructor(private readonly unfollowed: () => boolean, private readonly onSettled?: () => void) {}

  get active(): boolean {
    return this.shrunk || this.loading || this.unfollowed();
  }

  /** An edit or a step took area out, or may have. */
  tookOut(): void { this.shrunk = true; }

  /** A mask is on its way into the texture. */
  loadStarted(): void { this.loading = true; }

  /** The memory is its saved mask's again (saved, loaded, cleared or superseded). */
  settle(): void {
    const was = this.active;
    this.shrunk = false;
    this.loading = false;
    if (was && !this.active) this.onSettled?.();
  }

  /** A count was followed without taking anything out: whoever saw it unfollowed is told. */
  followed(): void {
    if (!this.active) this.onSettled?.();
  }
}
