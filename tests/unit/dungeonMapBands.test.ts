import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BandLostError, drawInBands } from '../../src/app/dungeons/worker/mapBands';

/**
 * A map drawn in bands is never answered with pixels its canvases did not hold: a canvas whose GPU
 * context was lost reads back zeros without an error (Chromium's getImageData), which is how three
 * floors were once stored blank. Node has no canvas, so these canvases are stand-ins that keep
 * their pixels in memory, or lose them.
 */

/** Canvases made from here on that read back nothing, as after a restart of the GPU process. */
let blankCanvases = 0;

class StandInContext {
  private style = '';
  private dy = 0;
  constructor(private readonly canvas: StandInCanvas, private readonly blank: boolean) {}
  get fillStyle(): string {
    return this.style;
  }
  set fillStyle(style: string) {
    this.style = style;
  }
  setTransform(...m: number[]): void {
    this.dy = m[5] ?? 0;
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const [r, g, b] = (this.fillStyle.match(/\d+/g) ?? []).map(Number);
    for (let row = y + this.dy; row < y + this.dy + h; row++) {
      for (let col = x; col < x + w; col++) {
        if (row < 0 || row >= this.canvas.height) continue;
        this.canvas.pixels.set([r!, g!, b!, 255], (row * this.canvas.width + col) * 4);
      }
    }
  }
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } {
    const data = new Uint8ClampedArray(w * h * 4);
    if (!this.blank) for (let row = 0; row < h; row++) data.set(this.canvas.pixels.subarray(((y + row) * this.canvas.width + x) * 4, ((y + row) * this.canvas.width + x + w) * 4), row * w * 4);
    return { data };
  }
  isContextLost(): boolean {
    return false;
  }
}

class StandInCanvas {
  readonly pixels: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
  }
  getContext(): StandInContext {
    const blank = blankCanvases > 0;
    if (blank) blankCanvases--;
    return new StandInContext(this, blank);
  }
  addEventListener(): void {}
}

class StandInImageData {
  readonly data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

/** Each row in its own colour, a row at a time. */
const rows = (width: number, height: number) => (ctx: OffscreenCanvasRenderingContext2D): void => {
  for (let y = 0; y < height; y++) {
    ctx.fillStyle = `rgb(${y % 256},${(y * 7) % 256},9)`;
    ctx.fillRect(0, y, width, 1);
  }
};

beforeEach(() => {
  blankCanvases = 0;
  vi.useFakeTimers();
  vi.stubGlobal('OffscreenCanvas', StandInCanvas);
  vi.stubGlobal('OffscreenCanvasRenderingContext2D', StandInContext);
  vi.stubGlobal('ImageData', StandInImageData);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a map drawn in bands', () => {
  it('puts every band in its rows', async () => {
    const drawn = drawInBands(5, 50, rows(5, 50), 5 * 16);
    await vi.runAllTimersAsync();
    const { data } = await drawn;
    for (const y of [0, 15, 16, 17, 31, 32, 49]) expect([...data.subarray(y * 20, y * 20 + 4)]).toEqual([y, (y * 7) % 256, 9, 255]);
  });

  it('draws the bands again where a canvas read back nothing', async () => {
    blankCanvases = 1;
    const drawn = drawInBands(5, 50, rows(5, 50), 5 * 16);
    await vi.runAllTimersAsync();
    const { data } = await drawn;
    expect([...data.subarray(49 * 20, 49 * 20 + 4)]).toEqual([49, (49 * 7) % 256, 9, 255]);
  });

  it('fails instead of answering with a blank picture where every try reads back nothing', async () => {
    blankCanvases = Infinity;
    const drawn = drawInBands(5, 50, rows(5, 50), 5 * 16);
    const failed = expect(drawn).rejects.toBeInstanceOf(BandLostError);
    await vi.runAllTimersAsync();
    await failed;
  });
});
