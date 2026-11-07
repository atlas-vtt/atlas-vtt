/** One bar and its gap, in points. */
const BAR_STEP = 3;
const BAR_WIDTH = 2;
const MIN_BAR = 2;
/** Spreads music that is loud throughout, or every bar would stand at the top. */
const BAR_CURVE = 1.6;
const LINE_HEIGHT = 1;

function paint(canvas: HTMLCanvasElement, peaks: Uint8Array | null): void {
  const { width, height } = canvas.getBoundingClientRect();
  if (width === 0 || height === 0) return;
  const scale = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(scale, scale);
  context.fillStyle = getComputedStyle(canvas).color;
  if (!peaks || peaks.length === 0) {
    context.fillRect(0, Math.round((height - LINE_HEIGHT) / 2), width, LINE_HEIGHT);
    return;
  }
  const bars = Math.floor(width / BAR_STEP);
  for (let bar = 0; bar < bars; bar++) {
    const from = Math.floor((bar / bars) * peaks.length);
    const to = Math.max(from + 1, Math.floor(((bar + 1) / bars) * peaks.length));
    let peak = 0;
    for (let i = from; i < to; i++) peak = Math.max(peak, peaks[i] ?? 0);
    const barHeight = Math.max(MIN_BAR, (peak / 255) ** BAR_CURVE * height);
    context.fillRect(bar * BAR_STEP, (height - barHeight) / 2, BAR_WIDTH, barHeight);
  }
}

/**
 * A track's waveform: painted once on two canvases, and the part played is only where the upper one is
 * clipped. A track without peaks yet is a plain line, never something made up.
 */
export class MusicWave {
  private peaks: Uint8Array | null = null;
  private painted = false;
  private boundary = -1;

  constructor(private readonly unplayed: HTMLCanvasElement, private readonly played: HTMLCanvasElement) {}

  /** Asked a few times a second; costs nothing until the track, its peaks or a whole bar's worth of place changes. */
  show(peaks: Uint8Array | null, share: number): void {
    if (peaks !== this.peaks || !this.painted) {
      this.peaks = peaks;
      this.repaint();
    }
    const width = this.played.clientWidth;
    const boundary = Math.round((share * width) / BAR_STEP);
    if (boundary === this.boundary) return;
    this.boundary = boundary;
    this.played.style.clipPath = `inset(0 calc(100% - ${boundary * BAR_STEP}px) 0 0)`;
  }

  /** After a new size or theme. */
  repaint(): void {
    paint(this.unplayed, this.peaks);
    paint(this.played, this.peaks);
    this.painted = true;
    this.boundary = -1;
  }
}
