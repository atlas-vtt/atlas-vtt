import type { Polygon } from '../../../vision/visibility';
import type { MemoryGrid, MemoryImages, MemoryPng } from './memoryPorts.ts';

/**
 * Memories as coverage through a canvas off the page: read as `decodeMaskAlpha` reads the party's, at the
 * memory's own size, and written as the GM's memory is saved (`ExploredTexture.toCanvas`): white, the
 * coverage as alpha. Shapes are drawn there too, each polygon by itself so their union is filled whatever
 * way each winds.
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

  drawn(polygons: readonly Polygon[], { columns, rows, scale }: MemoryGrid): Promise<Uint8Array> {
    const context = new OffscreenCanvas(columns, rows).getContext('2d', { willReadFrequently: true });
    if (context === null) return Promise.reject(new Error('No 2D canvas to draw an explored memory\'s shapes on'));
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.fillStyle = '#fff';
    for (const polygon of polygons) {
      const [first, ...rest] = polygon;
      if (first === undefined || rest.length < 2) continue;
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of rest) context.lineTo(point.x, point.y);
      context.closePath();
      context.fill();
    }
    const { data } = context.getImageData(0, 0, columns, rows);
    const coverage = new Uint8Array(columns * rows);
    for (let index = 0; index < coverage.length; index += 1) coverage[index] = data[index * 4 + 3]!;
    return Promise.resolve(coverage);
  },
};
