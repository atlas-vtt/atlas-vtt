import type { Size } from './imageLayout';

/** JPEG files may put large EXIF blocks before the frame header; beyond this the size stays unknown. */
const HEADER_BYTES = 256 * 1024;

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'bmp';

/** What an image's header says about it. */
export interface ImageHeader extends Size {
  format: ImageFormat;
}

type Reader = (bytes: DataView) => Size | null;

function ascii(bytes: DataView, offset: number, length: number): string {
  let text = '';
  for (let i = 0; i < length && offset + i < bytes.byteLength; i++) text += String.fromCharCode(bytes.getUint8(offset + i));
  return text;
}

const png: Reader = (bytes) => ascii(bytes, 1, 3) === 'PNG' && ascii(bytes, 12, 4) === 'IHDR' && bytes.byteLength >= 24
  ? { width: bytes.getUint32(16), height: bytes.getUint32(20) }
  : null;

const gif: Reader = (bytes) => ascii(bytes, 0, 4) === 'GIF8' && bytes.byteLength >= 10
  ? { width: bytes.getUint16(6, true), height: bytes.getUint16(8, true) }
  : null;

const bmp: Reader = (bytes) => {
  if (ascii(bytes, 0, 2) !== 'BM' || bytes.byteLength < 26) return null;
  if (bytes.getUint32(14, true) === 12) return { width: bytes.getUint16(18, true), height: bytes.getUint16(20, true) };
  return { width: Math.abs(bytes.getInt32(18, true)), height: Math.abs(bytes.getInt32(22, true)) };
};

const webp: Reader = (bytes) => {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP' || bytes.byteLength < 25) return null;
  const chunk = ascii(bytes, 12, 4);
  if (chunk !== 'VP8L' && bytes.byteLength < 30) return null;
  switch (chunk) {
    case 'VP8 ': return { width: bytes.getUint16(26, true) & 0x3fff, height: bytes.getUint16(28, true) & 0x3fff };
    case 'VP8L': {
      const bits = bytes.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    case 'VP8X': {
      const uint24 = (offset: number): number => bytes.getUint16(offset, true) | (bytes.getUint8(offset + 2) << 16);
      return { width: uint24(24) + 1, height: uint24(27) + 1 };
    }
    default: return null;
  }
};

/** Start-of-frame markers carry the size; C4, C8 and CC share the range but are other segments. */
function isFrameMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

const jpeg: Reader = (bytes) => {
  if (bytes.byteLength < 4 || bytes.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 9 <= bytes.byteLength) {
    if (bytes.getUint8(offset) !== 0xff) return null;
    const marker = bytes.getUint8(offset + 1);
    if (marker === 0xff) {
      offset += 1;
    } else if (isFrameMarker(marker)) {
      return { width: bytes.getUint16(offset + 7), height: bytes.getUint16(offset + 5) };
    } else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
    } else {
      offset += 2 + bytes.getUint16(offset + 2);
    }
  }
  return null;
};

const READERS: ReadonlyArray<readonly [ImageFormat, Reader]> = [['png', png], ['jpeg', jpeg], ['webp', webp], ['gif', gif], ['bmp', bmp]];

/**
 * Format and pixel size of an encoded image, read from its header without
 * decoding it, or null for formats it does not know (SVG, AVIF) or a truncated header.
 */
export async function imageHeader(blob: Blob): Promise<ImageHeader | null> {
  const bytes = new DataView(await blob.slice(0, HEADER_BYTES).arrayBuffer());
  for (const [format, read] of READERS) {
    const size = read(bytes);
    if (size) return size.width > 0 && size.height > 0 ? { format, width: size.width, height: size.height } : null;
  }
  return null;
}

/** Pixel size of an encoded image, read from its header; see `imageHeader`. */
export async function imageDimensions(blob: Blob): Promise<Size | null> {
  const header = await imageHeader(blob);
  return header && { width: header.width, height: header.height };
}
