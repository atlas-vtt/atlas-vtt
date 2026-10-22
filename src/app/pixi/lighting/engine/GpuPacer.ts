import { TILE_BAND_TEXELS } from '../../../lighting/lightingConstants';

/** The WebGL2 calls the pacer needs. */
type FenceGl = Pick<WebGL2RenderingContext, 'fenceSync' | 'getSyncParameter' | 'isSync' | 'deleteSync' | 'flush' | 'SYNC_GPU_COMMANDS_COMPLETE' | 'SYNC_STATUS' | 'SIGNALED'>;

/** The first batch, in tile texels: eight bands, a few milliseconds on a fast device, still split into bands on a slow one. */
const FIRST_BATCH = 8 * TILE_BAND_TEXELS;
/** Largest batch, in tile texels: a fast device reaches it within a few frames. */
const MAX_BATCH = 1 << 24;
/**
 * Batches that may run on the device at once. More than one: a tile step and a flicker redraw go
 * out in the same frame, and Chrome may tell of a passed fence a frame late.
 */
const IN_FLIGHT = 3;

/**
 * Keeps the lighting's heavy work (light tiles, bounce, flicker) from piling up on a slow
 * graphics device. Each batch gets a fence, and while `IN_FLIGHT` batches are still running
 * nothing more goes out. A device that has run everything sent doubles the batch; one found with
 * every batch still running halves it, never below one band (`TILE_BAND_TEXELS`). A fast device
 * is held back by nothing; integrated graphics get as much as they run instead of seconds of
 * work at once, which made Windows reset the device. Without a WebGL2 context (tests that build
 * at once, PIXI's Canvas renderer) everything passes.
 */
export class GpuPacer {
  private readonly fences: WebGLSync[] = [];
  private batch = FIRST_BATCH;
  /** The batch was halved and the device has not caught up since. */
  private behind = false;

  constructor(private readonly gl: FenceGl | null) {}

  /** Tile texels heavy work may send now; 0 while the device still runs as much as it may. */
  allowance(): number {
    if (!this.gl) return Infinity;
    this.drain(this.gl);
    if (this.fences.length < IN_FLIGHT) return this.batch;
    if (!this.behind) {
      this.batch = Math.max(TILE_BAND_TEXELS, this.batch / 2);
      this.behind = true;
    }
    return 0;
  }

  /** Heavy work was sent: fence it, and send it to the device now. */
  submitted(): void {
    const { gl } = this;
    if (!gl) return;
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (fence) this.fences.push(fence);
    gl.flush();
  }

  /** Lets go of the fences (the world goes). */
  destroy(): void {
    const { gl } = this;
    // A fence of a context that was lost and restored is no fence of this one: deleting it is an error.
    for (const fence of this.fences) if (gl?.isSync(fence)) gl.deleteSync(fence);
    this.fences.length = 0;
  }

  /** Forgets the batches the device has run; once it has run all of them, the next batch doubles. */
  private drain(gl: FenceGl): void {
    let drained = false;
    while (this.fences.length > 0) {
      const fence = this.fences[0]!;
      // A fence of a lost context passed with it.
      const alive = gl.isSync(fence);
      if (alive && gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) break;
      if (alive) gl.deleteSync(fence);
      this.fences.shift();
      drained = true;
    }
    if (!drained || this.fences.length > 0) return;
    if (!this.behind) this.batch = Math.min(MAX_BATCH, this.batch * 2);
    this.behind = false;
  }
}
