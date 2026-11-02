import { CURTAIN_DOWN_MS } from './playerCurtain';

/** How long the curtain's sheet takes to go down. */
export const SCENE_DIP_MS = CURTAIN_DOWN_MS;
/** Players are black for no longer than this: no frame of the new scene by then, and they see what the canvas holds. */
export const SCENE_FADE_LIMIT_MS = 4000;

/**
 * The dip to black while the presented scene changes, on the curtain's own sheet. The sheet goes
 * down over the frame players have (`withholds`: nothing new reaches the canvas until it is
 * black), stays until the first real frame of the new scene is on the canvas (`finish`) or the
 * limit has passed (`expire`, from the mirror's display frames, so a window nobody sees waits
 * unseen), and lifts. The GM's curtain wins: no dip starts under it, the sheet never lifts
 * off it, and the GM lowering it ends the dip (`cancel`). The GM lifting it ends like a dip
 * (`awaitFrame`), so the sheet fades off the picture rather than off a black canvas.
 */
export class PlayerSceneFade {
  /** When the sheet was sent down, or the GM's curtain lifted; null while it waits for no frame. */
  private startedAt: number | null = null;
  /** Until when the canvas keeps what it holds. */
  private withheldUntil = 0;

  constructor(
    private readonly showSheet: (down: boolean) => void,
    private readonly curtained: () => boolean,
  ) {}

  /** Another scene is presented at `now`. A dip under way starts over, keeping the frame players have. */
  begin(now: number): void {
    if (this.curtained()) return;
    this.startedAt = now;
    this.withheldUntil = now + SCENE_DIP_MS;
    this.showSheet(true);
  }

  /** The GM's curtain went up at `now`: the sheet stays for the first frame, which may come at once. */
  awaitFrame(now: number): void {
    this.startedAt = now;
    this.withheldUntil = now;
  }

  withholds(time: number): boolean {
    return this.startedAt !== null && time < this.withheldUntil;
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
