/**
 * A critically damped spring: it reaches its target without passing it, and a new target is taken
 * up from where the value is and how fast it moves, so a retargeted motion has no seam. Stepped
 * with the exact solution, so the step's length does not change the motion.
 */
export class CriticalSpring {
  private velocity = 0;

  /** `duration` is the time in seconds the spring takes to all but arrive (Apple's "duration" at bounce 0). */
  constructor(public value: number, public target: number = value, public duration = 0.5) {}

  get settled(): boolean {
    return Math.abs(this.value - this.target) < 1e-3 && Math.abs(this.velocity) < 1e-3;
  }

  /** Puts the spring at rest at `value`. */
  jumpTo(value: number): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  /** Moves the spring on by `seconds` and returns where it is. */
  step(seconds: number): number {
    const omega = (2 * Math.PI) / this.duration;
    const offset = this.value - this.target;
    const drift = this.velocity + omega * offset;
    const decay = Math.exp(-omega * seconds);
    this.value = this.target + (offset + drift * seconds) * decay;
    this.velocity = (drift - omega * (offset + drift * seconds)) * decay;
    if (this.settled) this.jumpTo(this.target);
    return this.value;
  }
}
