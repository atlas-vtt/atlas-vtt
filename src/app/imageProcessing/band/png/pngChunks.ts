import { BandUnsupportedError } from '../bandTypes';

/** The PNG colour types (PNG spec, 11.2.2 IHDR). */
export const ColourType = {
  Greyscale: 0,
  Truecolour: 2,
  Indexed: 3,
  GreyscaleAlpha: 4,
  TruecolourAlpha: 6,
} as const;
export type ColourType = (typeof ColourType)[keyof typeof ColourType];

/** The bit depths each colour type allows (PNG spec, table 11.1). */
const ALLOWED_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  [ColourType.Greyscale]: [1, 2, 4, 8, 16],
  [ColourType.Truecolour]: [8, 16],
  [ColourType.Indexed]: [1, 2, 4, 8],
  [ColourType.GreyscaleAlpha]: [8, 16],
  [ColourType.TruecolourAlpha]: [8, 16],
};

const CHANNELS: Readonly<Record<number, number>> = {
  [ColourType.Greyscale]: 1,
  [ColourType.Truecolour]: 3,
  [ColourType.Indexed]: 1,
  [ColourType.GreyscaleAlpha]: 2,
  [ColourType.TruecolourAlpha]: 4,
};

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const MAX_DIMENSION = 0x7fffffff;

/** A byte range of the file. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

/** What the decoder needs of a PNG: its header, the chunks that colour its samples and where its image data lies. */
export interface PngStructure {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colourType: ColourType;
  /** Bits of one pixel in a scanline. */
  readonly bitsPerPixel: number;
  /** PLTE's RGB triples, a view of the file. */
  readonly palette: Uint8Array | null;
  /** tRNS's data where it is valid for the colour type, a view of the file. */
  readonly transparency: Uint8Array | null;
  /** The IDAT chunks' data, in file order. */
  readonly imageData: readonly ByteRange[];
}

function isColourType(value: number): value is ColourType {
  return value in CHANNELS;
}

function corrupt(message: string): BandUnsupportedError {
  return new BandUnsupportedError('corrupt', message);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!);
}

/**
 * tRNS is kept only where its length fits the colour type (PNG spec, 11.3.2.1): a grey key of two
 * bytes, an RGB key of six, at most one alpha per palette entry. Like libpng, an invalid one is
 * ignored rather than refused, and types that carry alpha ignore it entirely.
 */
function validTransparency(colourType: ColourType, data: Uint8Array, palette: Uint8Array | null): Uint8Array | null {
  if (colourType === ColourType.Greyscale) return data.length === 2 ? data : null;
  if (colourType === ColourType.Truecolour) return data.length === 6 ? data : null;
  if (colourType === ColourType.Indexed && palette) {
    return data.length > 0 ? data.subarray(0, Math.min(data.length, palette.length / 3)) : null;
  }
  return null;
}

/** Reads a PNG's signature, IHDR and chunk list, refusing what is not a well-formed PNG. CRCs are not checked. */
export function readPngStructure(bytes: Uint8Array): PngStructure {
  if (bytes.length < SIGNATURE.length + 25 || SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw corrupt('Not a PNG file.');
  }
  // The first chunk must be IHDR with 13 bytes of data (PNG spec, 5.6).
  if (readUint32(bytes, 8) !== 13 || chunkType(bytes, 12) !== 'IHDR') throw corrupt('The PNG has no valid IHDR chunk.');
  const width = readUint32(bytes, 16);
  const height = readUint32(bytes, 20);
  const bitDepth = bytes[24]!;
  const colourType = bytes[25]!;
  const [compression, filter, interlace] = [bytes[26]!, bytes[27]!, bytes[28]!];
  if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) throw corrupt('The PNG has an invalid size.');
  if (!isColourType(colourType) || !ALLOWED_DEPTHS[colourType]?.includes(bitDepth)) throw corrupt(`The PNG's colour type ${colourType} with bit depth ${bitDepth} is invalid.`);
  if (compression !== 0 || filter !== 0 || interlace > 1) throw corrupt('The PNG names an unknown compression, filter or interlace method.');
  if (interlace === 1) throw new BandUnsupportedError('interlaced', 'The PNG is interlaced (Adam7).');

  let palette: Uint8Array | null = null;
  let transparency: Uint8Array | null = null;
  const imageData: ByteRange[] = [];
  let offset = 33;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw corrupt('The PNG is truncated.');
    const length = readUint32(bytes, offset);
    const type = chunkType(bytes, offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) throw corrupt('The PNG is truncated.');
    if (type === 'IDAT') {
      // IDAT chunks are consecutive (PNG spec, 5.6); a later one is not part of the image.
      const previous = imageData[imageData.length - 1];
      if (!previous || previous.end + 4 === offset) imageData.push({ start, end });
    } else if (type === 'IEND') {
      break;
    } else if (imageData.length === 0) {
      if (type === 'PLTE') {
        if (length === 0 || length % 3 !== 0 || length > 768) throw corrupt('The PNG has an invalid palette.');
        palette = bytes.subarray(start, end);
      } else if (type === 'tRNS') {
        transparency = bytes.subarray(start, end);
      }
    }
    offset = end + 4;
  }
  if (imageData.length === 0) throw corrupt('The PNG has no image data.');
  if (colourType === ColourType.Indexed && !palette) throw corrupt('The indexed PNG has no palette.');

  return {
    width,
    height,
    bitDepth,
    colourType,
    bitsPerPixel: bitDepth * CHANNELS[colourType]!,
    palette: colourType === ColourType.Indexed ? palette : null,
    transparency: transparency ? validTransparency(colourType, transparency, palette) : null,
    imageData,
  };
}

/** Whether a pixel of the image can be transparent: an alpha channel, or a tRNS chunk. */
export function pngHasAlpha(png: PngStructure): boolean {
  return png.colourType === ColourType.GreyscaleAlpha || png.colourType === ColourType.TruecolourAlpha || png.transparency !== null;
}
