import type { Renderer } from 'pixi.js';
import { awaitGpu } from './engine/gpu';
import type { LightingAttempt } from './lightingAttempts';

/**
 * From the build that begins an attempt, over the first lit frame and the tick that waits for
 * the graphics process to execute it, to the tick after that one.
 */
type AttemptState = 'none' | 'begun' | 'drawn' | 'executed' | 'done';

/**
 * Where one view's attempt to light its map stands (`LightingAttempt`, the crash-loop breaker):
 * lighting a map is an attempt until the engine has drawn a frame of it and the graphics process
 * has executed that frame.
 */
export class AttemptProgress {
  private state: AttemptState = 'none';

  constructor(private readonly renderer: Renderer, private readonly attempt: LightingAttempt | undefined) {}

  /** A build is about to begin: false when the last attempt on this map never finished (do not start). */
  begin(): boolean {
    if (this.state !== 'none') return true;
    if (this.attempt?.begin() === false) return false;
    this.state = 'begun';
    return true;
  }

  /** Lighting goes off or the map leaves: an attempt still open ends without a verdict. */
  end(): void {
    if (this.state !== 'none' && this.state !== 'done') this.attempt?.finish();
    this.state = 'none';
  }

  /** The graphics context was restored: whatever stood is gone, and the next build begins anew. */
  restart(): void {
    this.state = 'none';
  }

  /** A render of the lit layer, which drew a frame once the engine has a world. */
  rendered(hasWorld: boolean): void {
    if (this.state === 'begun' && hasWorld) this.state = 'drawn';
  }

  /**
   * A tick: the one after the first lit render waits until the graphics process has executed it
   * (`awaitGpu`); the one after that, which a lost context skips, ends the attempt.
   */
  settle(): void {
    if (this.state === 'drawn') {
      awaitGpu(this.renderer);
      this.state = 'executed';
    } else if (this.state === 'executed') {
      this.attempt?.finish();
      this.state = 'done';
    }
  }
}
