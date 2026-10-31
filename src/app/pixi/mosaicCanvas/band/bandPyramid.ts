import type { Band } from '../../../imageProcessing/band/bandTypes';
import { TESSERA_CONTENT, TESSERA_OVERLAP, type Pyramid, type PyramidLevel } from '../pyramid';
import { halveRows } from './halveRows';

/**
 * A map's pyramid cut from bands of rows, so no level ever exists whole: the rows of the base level
 * arrive in order, each level halves its rows into the next, and every level hands out one band per
 * row of tesserae as soon as the rows that row's tesserae are cut from are complete. A level holds at most
 * the rows of one tessera row plus the overlap the next shares, and one row waiting to be halved.
 */

/** The rows one row of tesserae of a level is cut from: its content and the overlap rows above and below. */
export interface LevelBand {
  readonly level: number;
  /** The tessera row these rows belong to. */
  readonly row: number;
  /** First level row held, the tessera row's source rect's `y`. */
  readonly y: number;
  readonly rows: number;
  readonly width: number;
  /** RGBA, straight alpha, reused once the handler's promise settles. */
  readonly data: Uint8ClampedArray;
}

export interface BandPyramidOptions {
  /** The level the pushed bands are rows of. */
  readonly baseLevel: number;
  /** The finest and coarsest levels to hand out; levels past `lastLevel` are neither halved into nor emitted. */
  readonly lastLevel: number;
  readonly onBand: (band: LevelBand) => void | Promise<void>;
}

/** Rows a level keeps at most: a tessera row's source rect, which is the content plus the overlap on both sides. */
const ROWS_HELD = TESSERA_CONTENT + 2 * TESSERA_OVERLAP;

/** The level rows the tesserae of tessera row `row` are cut from (`tesseraSourceRect` along y): `y` to `end`. */
export function tesseraRowSpan(level: Pick<PyramidLevel, 'height'>, row: number): { y: number; end: number } {
  return { y: Math.max(0, row * TESSERA_CONTENT - TESSERA_OVERLAP), end: Math.min(level.height, (row + 1) * TESSERA_CONTENT + TESSERA_OVERLAP) };
}

class LevelRows {
  readonly level: PyramidLevel;
  /** Rows `start` to `start + filled` of the level. */
  private readonly buffer: Uint8ClampedArray;
  private start = 0;
  private filled = 0;
  private tesseraRow = 0;
  /** A row waiting for its pair to be halved into the next level. */
  private pending: Uint8ClampedArray | null = null;
  private pendingRows = 0;
  private readonly halved: Uint8ClampedArray | null;

  constructor(level: PyramidLevel, readonly next: LevelRows | null) {
    this.level = level;
    this.buffer = new Uint8ClampedArray(level.width * ROWS_HELD * 4);
    this.halved = next ? new Uint8ClampedArray(next.level.width * 4) : null;
  }

  /** The level row the next pushed row must be. */
  get nextRow(): number {
    return this.start + this.filled;
  }

  get complete(): boolean {
    return this.tesseraRow >= this.level.rows;
  }

  /** Takes `rows` rows (`data` holds `rows * width * 4` bytes) that follow the ones held, handing out tessera rows as they complete. */
  async push(data: Uint8ClampedArray, rows: number, emit: (band: LevelBand) => void | Promise<void>): Promise<void> {
    const stride = this.level.width * 4;
    let offset = 0;
    while (offset < rows) {
      const room = ROWS_HELD - this.filled;
      const take = Math.min(room, rows - offset);
      this.buffer.set(data.subarray(offset * stride, (offset + take) * stride), this.filled * stride);
      this.filled += take;
      offset += take;
      await this.emitReady(emit);
    }
    if (this.next) await this.halveInto(data, rows, emit);
  }

  /** Hands out the last tessera row, which ends at the level's bottom edge without overlap. */
  async finish(emit: (band: LevelBand) => void | Promise<void>): Promise<void> {
    if (this.nextRow !== this.level.height) throw new Error(`Level ${this.level.index} ended at row ${this.nextRow} of ${this.level.height}.`);
    await this.emitReady(emit);
    if (this.next) {
      if (this.pending && this.pendingRows === 1) {
        // An odd last row: the next level's last row is it alone (level sizes round up).
        halveRows(this.pending, null, this.level.width, this.halved!);
        await this.next.push(this.halved!, 1, emit);
        this.pending = null;
        this.pendingRows = 0;
      }
      await this.next.finish(emit);
    }
  }

  /** Emits every tessera row whose source rows are all held, keeping the overlap rows the next row shares. */
  private async emitReady(emit: (band: LevelBand) => void | Promise<void>): Promise<void> {
    while (!this.complete) {
      const { y, end } = tesseraRowSpan(this.level, this.tesseraRow);
      if (this.nextRow < end) return;
      const stride = this.level.width * 4;
      const from = (y - this.start) * stride;
      await emit({ level: this.level.index, row: this.tesseraRow, y, rows: end - y, width: this.level.width, data: this.buffer.subarray(from, from + (end - y) * stride) });
      this.tesseraRow += 1;
      // Drop everything before the next tessera row's first source row; what follows is shared with it.
      const keepFrom = this.complete ? end : Math.max(0, this.tesseraRow * TESSERA_CONTENT - TESSERA_OVERLAP);
      const dropped = keepFrom - this.start;
      if (dropped > 0) {
        this.buffer.copyWithin(0, dropped * stride, this.filled * stride);
        this.start = keepFrom;
        this.filled -= dropped;
      }
    }
  }

  /** Halves the pushed rows two at a time into the next level, carrying an odd row over to the next push. */
  private async halveInto(data: Uint8ClampedArray, rows: number, emit: (band: LevelBand) => void | Promise<void>): Promise<void> {
    const stride = this.level.width * 4;
    let offset = 0;
    if (this.pending && this.pendingRows === 1 && rows > 0) {
      halveRows(this.pending, data.subarray(0, stride), this.level.width, this.halved!);
      await this.next!.push(this.halved!, 1, emit);
      this.pending = null;
      this.pendingRows = 0;
      offset = 1;
    }
    for (; offset + 1 < rows; offset += 2) {
      halveRows(data.subarray(offset * stride, (offset + 1) * stride), data.subarray((offset + 1) * stride, (offset + 2) * stride), this.level.width, this.halved!);
      await this.next!.push(this.halved!, 1, emit);
    }
    if (offset < rows) {
      this.pending ??= new Uint8ClampedArray(stride);
      this.pending.set(data.subarray(offset * stride, (offset + 1) * stride));
      this.pendingRows = 1;
    }
  }
}

export class BandPyramid {
  private readonly base: LevelRows;
  private finished = false;

  constructor(readonly pyramid: Pyramid, private readonly options: BandPyramidOptions) {
    const { baseLevel, lastLevel } = options;
    if (baseLevel < 0 || lastLevel < baseLevel || lastLevel >= pyramid.levels.length) {
      throw new RangeError(`Levels ${baseLevel} to ${lastLevel} are not within a pyramid of ${pyramid.levels.length} levels.`);
    }
    let next: LevelRows | null = null;
    for (let index = lastLevel; index >= baseLevel; index--) next = new LevelRows(pyramid.levels[index]!, next);
    this.base = next!;
  }

  /** The base level row the next band must start at. */
  get nextRow(): number {
    return this.base.nextRow;
  }

  /** Rows of the base level, in order and without gaps; tessera rows of every level are handed out as they complete. */
  async push(band: Band): Promise<void> {
    if (this.finished) throw new Error('The pyramid is finished.');
    if (band.width !== this.base.level.width) throw new Error(`A band of ${band.width} px was pushed into a level ${this.base.level.width} px wide.`);
    if (band.y !== this.base.nextRow) throw new Error(`Band at row ${band.y} pushed where row ${this.base.nextRow} was due.`);
    if (band.y + band.rows > this.base.level.height) throw new Error(`Band to row ${band.y + band.rows} pushed into a level ${this.base.level.height} rows high.`);
    await this.base.push(band.data, band.rows, this.options.onBand);
  }

  /** Once every row was pushed: hands out the last tessera rows of every level. */
  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    await this.base.finish(this.options.onBand);
  }
}
