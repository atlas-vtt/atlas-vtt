/** What the application segments before the first scan say about how to read the pixels. */
export interface JpegAppInfo {
  sawJfif: boolean;
  /** The transform flag of an Adobe APP14 segment: 0 none (RGB or CMYK), 1 YCbCr, 2 YCCK. */
  adobeTransform: number | undefined;
  /** The EXIF orientation of the first APP1 Exif segment that names one. */
  orientation: number | undefined;
}

const JFIF = [0x4a, 0x46, 0x49, 0x46, 0x00];
const EXIF = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
const ADOBE = [0x41, 0x64, 0x6f, 0x62, 0x65];
const ORIENTATION_TAG = 0x0112;
const TIFF_SHORT = 3;

/** Notes what an APPn segment (`marker` 0xE0 to 0xEF, body from `start` to `end`) says. */
export function readAppSegment(bytes: Uint8Array, marker: number, start: number, end: number, info: JpegAppInfo): void {
  if (marker === 0xe0 && startsWith(bytes, start, end, JFIF)) info.sawJfif = true;
  else if (marker === 0xe1 && info.orientation === undefined && startsWith(bytes, start, end, EXIF)) {
    info.orientation = exifOrientation(bytes, start + EXIF.length, end);
  } else if (marker === 0xee && end - start >= 12 && startsWith(bytes, start, end, ADOBE)) {
    info.adobeTransform = bytes[start + 11];
  }
}

function startsWith(bytes: Uint8Array, start: number, end: number, prefix: readonly number[]): boolean {
  if (end - start < prefix.length) return false;
  return prefix.every((byte, i) => bytes[start + i] === byte);
}

/**
 * The Orientation entry of a TIFF header's first directory, or undefined. Metadata the decoder
 * cannot follow is ignored, as browsers ignore it, rather than refusing the image over it.
 */
function exifOrientation(bytes: Uint8Array, tiff: number, end: number): number | undefined {
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  if (!little && !(bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d)) return undefined;
  const u16 = (at: number): number | undefined => {
    if (at < tiff || at + 2 > end) return undefined;
    const a = bytes[at] ?? 0;
    const b = bytes[at + 1] ?? 0;
    return little ? a | (b << 8) : (a << 8) | b;
  };
  const u32 = (at: number): number | undefined => {
    const first = u16(at);
    const second = u16(at + 2);
    if (first === undefined || second === undefined) return undefined;
    return little ? first + second * 0x10000 : first * 0x10000 + second;
  };
  if (u16(tiff + 2) !== 42) return undefined;
  const directoryOffset = u32(tiff + 4);
  if (directoryOffset === undefined) return undefined;
  const directory = tiff + directoryOffset;
  const entries = u16(directory) ?? 0;
  for (let i = 0; i < entries; i++) {
    const entry = directory + 2 + i * 12;
    const tag = u16(entry);
    if (tag === undefined) return undefined;
    if (tag === ORIENTATION_TAG) return u16(entry + 2) === TIFF_SHORT ? u16(entry + 8) : undefined;
  }
  return undefined;
}
