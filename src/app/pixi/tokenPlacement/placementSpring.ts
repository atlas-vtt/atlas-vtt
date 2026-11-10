/** How a spring pulls: its angular frequency (higher is quicker) and damping ratio (1 never overshoots). */
export interface SpringFeel {
  frequency: number;
  damping: number;
}

/** Steps no longer than this keep the integration stable at any frame rate. */
const MAX_STEP_S = 1 / 240;
/** Closer than this to its target, and slower, a value has arrived. */
const REST = 0.001;

/**
 * A value pulled towards a target by a damped spring: a new target mid-way keeps its speed,
 * so motion bends instead of restarting, as a hand moving a token does.
 */
export class Spring {
  value: number;
  target: number;
  private velocity = 0;

  constructor(initial: number, public feel: SpringFeel) {
    this.value = initial;
    this.target = initial;
  }

  get atRest(): boolean {
    return this.velocity === 0 && this.value === this.target;
  }

  /** Puts the value at `value` and still. */
  jump(value: number): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  /** Gives the value a push, so it springs back past its target. */
  kick(velocity: number): void {
    this.velocity += velocity;
  }

  /** Moves the value `seconds` on; `scale` is what a difference of 1 means (a world pixel, a share), for when it has arrived. */
  step(seconds: number, scale = 1): void {
    if (this.atRest) return;
    const { frequency, damping } = this.feel;
    let left = Math.min(seconds, 0.1);
    while (left > 0) {
      const dt = Math.min(left, MAX_STEP_S);
      const acceleration = frequency * frequency * (this.target - this.value) - 2 * damping * frequency * this.velocity;
      this.velocity += acceleration * dt;
      this.value += this.velocity * dt;
      left -= dt;
    }
    if (Math.abs(this.target - this.value) < REST * scale && Math.abs(this.velocity) < REST * scale * frequency) {
      this.jump(this.target);
    }
  }
}
