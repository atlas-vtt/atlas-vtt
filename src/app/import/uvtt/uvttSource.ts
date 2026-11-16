import { imageDimensions } from '../../imageProcessing/imageDimensions';
import type { Size } from '../../imageProcessing/imageLayout';
import { UVTT_TOO_LARGE, parseUvtt } from './parseUvtt';
import { uvttCellSize } from './uvttToScene';
import { UVTT_LIMITS, type UvttMap, type UvttRefusal } from './uvttTypes';

/** A file read and checked, ready to be placed and its image converted. */
export interface UvttSource {
  /** The name of the file it was read from. */
  fileName: string;
  /** The file's size in bytes. */
  bytes: number;
  map: UvttMap;
  /** The map image as the file holds it. */
  image: Blob;
  /** The image's size in pixels, read from its header. */
  size: Size;
  /** Pixels of the image a cell spans. */
  cellSize: number;
}

export const refused = (problem: string): UvttRefusal => ({ ok: false, problem });

export const UNREADABLE_IMAGE = 'The map image in the file could not be read.';
export const CROWDED_WALLS = 'The walls in the file end too close together in too many places for Atlas to join them.';

/**
 * World pixels a cell of the map spans on an image of `image` pixels, or why that image cannot
 * carry the map's grid: its cells would not be square, or too small to be a grid at all.
 */
export function cellSizeOn(map: UvttMap, image: Size): number | UvttRefusal {
  const pixels = `${image.width} × ${image.height} pixels`;
  const squares = `${map.size.x} × ${map.size.y} squares`;
  const cellSize = uvttCellSize(map, image);
  if (cellSize === null) return refused(`The map image is ${pixels}, which does not fit a map of ${squares}.`);
  if (cellSize < UVTT_LIMITS.cellPixels) return refused(`The map image is too small for its grid: ${pixels} for ${squares}.`);
  return cellSize;
}

/**
 * Reads a Universal VTT file and checks it against `UVTT_LIMITS`: its content (`parseUvtt`), its
 * image's size from the image's own header, and that the image carries the file's grid. Nothing
 * is converted or written. The file is untrusted: what is wrong comes back as a sentence.
 */
export async function readUvttSource(file: File): Promise<UvttSource | UvttRefusal> {
  if (file.size > UVTT_LIMITS.fileBytes) return refused(UVTT_TOO_LARGE);
  const parsed = parseUvtt(await file.text());
  if (!parsed.ok) return parsed;
  const { map } = parsed;

  const image = new Blob([map.image.bytes], { type: map.image.type });
  const size = await imageDimensions(image);
  if (!size) return refused(UNREADABLE_IMAGE);
  if (size.width * size.height > UVTT_LIMITS.imagePixels) {
    return refused(`The map image is too large to open: ${size.width} × ${size.height} pixels.`);
  }
  const cellSize = cellSizeOn(map, size);
  if (typeof cellSize !== 'number') return cellSize;
  return { fileName: file.name, bytes: file.size, map, image, size, cellSize };
}
