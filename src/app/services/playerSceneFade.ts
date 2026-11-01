import { MOTION_NORMAL_MS } from '../utils/motion';

/** How long the curtain's sheet takes to go down: its fade in `player-window.scss`, `$transition-normal`. */
export const SCENE_DIP_MS = MOTION_NORMAL_MS;
/** Players are black for no longer than this: no frame of the new scene by then, and they see what the canvas holds. */
export const SCENE_FADE_LIMIT_MS = 4000;

/**
 * The dip to black while the presented scene changes, on the curtain's own sheet. The sheet goes
 * down over the frame players have (`withholds`: nothing new reaches the canvas until it is
 * black), stays until the first real frame of the new scene is on the canvas (`finish`) or the
 * limit has passed (`expire`, from the mirror's display frames, so a window nobody sees waits
 * unseen), and lifts. The GM's curtain wins: no dip starts under it, the sheet never lifts
 * off it, and the GM lowering it ends the dip (`cancel`).
 */
export class PlayerSceneFade {
  /** When the sheet was sent down; null while no dip is under way. */
  private startedAt: number | null = null;

  constructor(
    private readonly showSheet: (down: boolean) => void,
    private readonly curtained: () => boolean,
  ) {}

  /** Another scene is presented at `now`. A dip under way starts over, keeping the frame players have. */
  begin(now: number): void {
    if (this.curtained()) return;
    this.startedAt = now;
    this.showSheet(true);
  }

  withholds(time: number): boolean {
    return this.startedAt !== null && time - this.startedAt < SCENE_DIP_MS;
  }

  /** Lifts the sheet, off whatever the canvas holds, unless the GM's curtain is down. */
  finish(): void {
    if (this.startedAt === null) return;
    this.startedAt = null;
    this.showSheet(this.curtained());
  }

  expire(now: number): void {
    if (this.startedAt !== null && now - this.startedAt >= SCENE_FADE_LIMIT_MS) this.finish();
  }

  /** Ends the dip and leaves the sheet to whoever called: the curtain came down, or the window went. */
  cancel(): void {
    this.startedAt = null;
  }
}
