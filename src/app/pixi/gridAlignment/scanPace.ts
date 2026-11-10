/**
 * How well a device keeps up with the grid scan, learned from the frames it draws. The scan's
 * shader works on every pixel of the map on screen, which a graphics card of ten years ago or a
 * browser drawing in software cannot do sixty times a second: where frames come slowly the scan
 * is drawn at half the pixels, and where that is still slow it is not drawn at all, and a
 * detection shows its answer alone. What is learned holds for the session.
 */

export type ScanQuality = 'full' | 'half' | 'none';

/** Frames at the start of a scan that are not counted: the first ones carry what a scan sets up. */
const SETTLING_FRAMES = 8;
/** Frames whose mean decides. */
const WINDOW_FRAMES = 24;
/** A frame this long was no frame of the scan's: the window was hidden, or a scene was loading. */
const NOT_A_FRAME_MS = 250;
/** Mean frame times above which the scan steps down: under about 36 frames a second at full pixels, under about 22 at half. */
const TOO_SLOW_MS: Record<Exclude<ScanQuality, 'none'>, number> = { full: 28, half: 45 };

/** Names of renderers that draw on the processor: no scan there. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name: unknown = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  return typeof name === 'string' && SOFTWARE_RENDERER.test(name);
}

/** Watches the frames of scans and says at what quality the next frame is drawn. */
export class ScanPace {
  private level: ScanQuality = 'full';
  private frames = 0;
  private total = 0;

  get quality(): ScanQuality {
    return this.level;
  }

  /** A scan begins: its first frames are its own to settle in. */
  begin(): void {
    this.frames = 0;
    this.total = 0;
  }

  /** Counts a frame of `milliseconds`; true when that made the scan step down. */
  frame(milliseconds: number): boolean {
    if (this.level === 'none' || milliseconds > NOT_A_FRAME_MS) return false;
    this.frames++;
    if (this.frames <= SETTLING_FRAMES) return false;
    this.total += milliseconds;
    if (this.frames < SETTLING_FRAMES + WINDOW_FRAMES) return false;
    const mean = this.total / WINDOW_FRAMES;
    this.begin();
    if (mean <= TOO_SLOW_MS[this.level]) return false;
    this.level = this.level === 'full' ? 'half' : 'none';
    return true;
  }
}

/** The pace of this window's scans. */
export const scanPace = new ScanPace();
