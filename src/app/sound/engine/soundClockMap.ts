/** One reading of both clocks: table time in ms and the context's seconds, taken together. */
export class SoundClockMap {
  constructor(
    readonly ctxSeconds: number,
    readonly tableMs: number,
    readonly rate: number,
  ) {}

  ctxSecondsOf(tableMs: number): number {
    return this.ctxSeconds + (tableMs - this.tableMs) / 1000;
  }

  /** On the context's sample grid: a start between two samples would be interpolated. */
  ctxFrameOf(tableMs: number): number {
    return Math.round(this.ctxSecondsOf(tableMs) * this.rate);
  }

  get nowFrame(): number {
    return Math.ceil(this.ctxSeconds * this.rate);
  }
}
