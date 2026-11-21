import { derivedImageFormat } from '../../imageProcessing/imageEncoder';
import { optimizeImage } from '../../imageProcessing/imageProcessing';
import type { TabletProbes } from './collectTabletReport';
import { canvasAnswer, webglSection, type ImageFacts } from './graphicsProbes';

/** A small grey picture for the image workers to scale: what they do with it is the answer, not the picture. */
async function samplePicture(): Promise<Blob> {
  const canvas = new OffscreenCanvas(8, 8);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas');
  context.fillStyle = '#888888';
  context.fillRect(0, 0, 8, 8);
  return canvas.convertToBlob({ type: 'image/png' });
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown error');

async function imageFacts(): Promise<ImageFacts> {
  const mainThread = await derivedImageFormat((width, height) => new OffscreenCanvas(width, height)).catch(() => 'failed' as const);
  try {
    const source = await samplePicture();
    const scale = (): ReturnType<typeof optimizeImage> => optimizeImage(source, { maxWidth: 4, maxHeight: 4, quality: 0.8 }, { webpOnly: true });
    const started = performance.now();
    const first = await scale();
    const ms = performance.now() - started;
    const again = performance.now();
    await scale();
    return { mainThread, worker: { ms, type: first.image.type || 'no type' }, warmMs: performance.now() - again };
  } catch (error) {
    return { mainThread, worker: { failed: errorName(error) }, warmMs: null };
  }
}

/** This web view's probes. */
export function browserProbes(): TabletProbes {
  return {
    images: imageFacts,
    canvas: canvasAnswer,
    // Never attached: the context is asked and lost again.
    webgl: () => webglSection(createEl('canvas')),
  };
}
