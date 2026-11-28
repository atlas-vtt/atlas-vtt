import { TFile, type App } from 'obsidian';
import { encodeImage } from '../../../imageProcessing/imageEncoder';
import { MosaicCanvasService } from '../../../pixi/mosaicCanvas/MosaicCanvasService';
import { toBase64 } from '../../../utils/base64';
import { BACKDROP_MIME_TYPES, MAX_BACKDROP_BYTES, type BackdropPicture } from '../../protocol/index.ts';

/** The longest side of the whole map read to cut a backdrop from: a map far wider than a screen is tall gives a little sharpness, never a canvas no device holds. */
const MAX_READ_SIDE = 8192;
/** The qualities tried in turn until the picture fits a message (`MAX_BACKDROP_BYTES`). */
const QUALITIES = [0.72, 0.6, 0.48, 0.36];

/**
 * Where a screen of `width` × `height` cuts a map of `mapWidth` × `mapHeight` as it covers the screen: the scale the whole
 * map is read at (capped at `MAX_READ_SIDE` on its longer side), and the part of it, in the middle, that the screen shows.
 */
export function backdropCut(mapWidth: number, mapHeight: number, width: number, height: number): { readSide: number; crop: (readWidth: number, readHeight: number) => { x: number; y: number; width: number; height: number } } {
  const scale = Math.max(width / mapWidth, height / mapHeight);
  const readSide = Math.max(1, Math.min(Math.round(Math.max(mapWidth, mapHeight) * scale), MAX_READ_SIDE));
  return {
    readSide,
    crop: (readWidth, readHeight) => {
      const cropWidth = Math.max(1, Math.min(readWidth, Math.round((readHeight * width) / height)));
      const cropHeight = Math.max(1, Math.min(readHeight, Math.round((cropWidth * height) / width)));
      return { x: Math.round((readWidth - cropWidth) / 2), y: Math.round((readHeight - cropHeight) / 2), width: cropWidth, height: cropHeight };
    },
  };
}

/**
 * The map image at `path` cut to a screen of `width` × `height` device pixels as it covers it, its middle at the
 * screen's pixels: read from the map's tessera pyramid (`MosaicCanvasService`, built once per device and kept), never
 * by decoding the whole image here, and encoded small enough for one message. Null where the image is not in the vault,
 * cannot be read, or does not fit a message at any quality.
 */
export async function cutBackdrop(app: App, path: string, width: number, height: number): Promise<BackdropPicture | null> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const service = MosaicCanvasService.forApp(app);
  const opened = await service.open(file);
  try {
    const cut = backdropCut(opened.pyramid.width, opened.pyramid.height, width, height);
    const bitmap = await service.overview(opened.handle, cut.readSide);
    try {
      const crop = cut.crop(bitmap.width, bitmap.height);
      const canvas = new OffscreenCanvas(crop.width, crop.height);
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
      for (const quality of QUALITIES) {
        const blob = await encodeImage(canvas, quality);
        const mime = BACKDROP_MIME_TYPES.find((each) => each === blob.type);
        if (mime !== undefined && blob.size <= MAX_BACKDROP_BYTES) return { mime, data: toBase64(new Uint8Array(await blob.arrayBuffer())) };
      }
      return null;
    } finally {
      bitmap.close();
    }
  } finally {
    service.close(opened.handle);
  }
}
