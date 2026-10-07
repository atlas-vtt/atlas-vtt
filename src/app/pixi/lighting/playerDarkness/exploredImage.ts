/**
 * The scene's explored memory as the GM's player window shows it, read from the mask the
 * scene saves (`ViewAtlasState.exploredMask`, a PNG data URL of white with the coverage as
 * alpha). The window's own memory lives on the graphics device; the saved mask follows it
 * within the save delay (`ExploredMemory`).
 */
import type { ExploredImage } from './darknessRaster';

export type ExploredDecoder = (dataUrl: string) => Promise<ExploredImage>;

/** The mask's alpha, texel for texel, decoded off the page (`createImageBitmap`, `OffscreenCanvas`). */
export async function decodeExploredMask(dataUrl: string): Promise<ExploredImage> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  try {
    const { width, height } = bitmap;
    const context = new OffscreenCanvas(width, height).getContext('2d');
    if (!context) throw new Error('no 2D context to read the explored memory');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, width, height);
    const coverage = new Uint8Array(width * height);
    for (let i = 0; i < coverage.length; i++) coverage[i] = data[i * 4 + 3]!;
    return { width, height, coverage };
  } finally {
    bitmap.close();
  }
}

/**
 * The decoded memory of the scene's current mask. A new mask is decoded once; until it is, the
 * last one decoded stands in (the memory mostly grows, so it shows no more than a moment ago),
 * except after the memory was cleared or the scene reloaded (`reset`). A mask that cannot be
 * decoded counts as no memory: players see less, never more.
 */
export class ExploredImages {
  private mask: string | null = null;
  private image: ExploredImage | null = null;
  /** The current mask was decoded, or failed to be: no decode of it is outstanding. */
  private settled = true;
  private disposed = false;

  constructor(private readonly onDecoded: () => void, private readonly decode: ExploredDecoder = decodeExploredMask) {}

  of(mask: string | null): ExploredImage | null {
    if (mask === this.mask) return this.image;
    this.mask = mask;
    if (mask === null) {
      this.image = null;
      this.settled = true;
      return null;
    }
    this.settled = false;
    this.decode(mask).then(
      (image) => this.settle(mask, image),
      () => this.settle(mask, null),
    );
    return this.image;
  }

  /** The current mask is still decoding and nothing stands in for it: the memory shown is not known yet. */
  pending(): boolean {
    return !this.settled && this.image === null;
  }

  /** Forgets the masks: the next one has no stand-in while it decodes. */
  reset(): void {
    this.mask = null;
    this.image = null;
    this.settled = true;
  }

  dispose(): void {
    this.disposed = true;
  }

  private settle(mask: string, image: ExploredImage | null): void {
    if (this.disposed || mask !== this.mask) return;
    this.image = image;
    this.settled = true;
    this.onDecoded();
  }
}
