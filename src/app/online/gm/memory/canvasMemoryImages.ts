import type { MemoryImages, MemoryPng } from './memoryPorts.ts';

/**
 * Memories as coverage through a canvas off the page: read as `decodeMaskAlpha` reads the party's, at the
 * memory's own size, and written as the GM's memory is saved (`ExploredTexture.toCanvas`): white, the
 * coverage as alpha.
 */
export const CANVAS_MEMORY_IMAGES: MemoryImages = {
  async coverage(png: MemoryPng, width: number, height: number): Promise<Uint8Array | null> {
    try {
      const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
      const context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
      if (context === null) {
        bitmap.close();
        return null;
      }
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const { data } = context.getImageData(0, 0, width, height);
      const coverage = new Uint8Array(width * height);
      for (let index = 0; index < coverage.length; index += 1) coverage[index] = data[index * 4 + 3]!;
      return coverage;
    } catch {
      return null;
    }
  },

  async png(coverage: Uint8Array, width: number, height: number): Promise<MemoryPng> {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('No 2D canvas to write an explored memory on');
    const image = context.createImageData(width, height);
    const { data } = image;
    for (let index = 0; index < coverage.length; index += 1) {
      const at = index * 4;
      data[at] = 255;
      data[at + 1] = 255;
      data[at + 2] = 255;
      data[at + 3] = coverage[index]!;
    }
    context.putImageData(image, 0, 0);
    return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  },
};
