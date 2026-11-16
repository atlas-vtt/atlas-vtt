/** Hand-written Universal VTT files for the import tests. */

const u32 = (value: number): number[] => [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
const ascii = (text: string): number[] => [...text].map((character) => character.charCodeAt(0));

/** The start of a PNG stating `width` × `height`: all that the import reads of an image before the workers decode it. */
export function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x89, ...ascii('PNG\r\n\x1a\n'), ...u32(13), ...ascii('IHDR'), ...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
}

export const JPEG_START = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...ascii('JFIF')]);
export const WEBP_START = new Uint8Array([...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WEBPVP8 ')]);
export const GIF_START = new Uint8Array(ascii('GIF89a\x01\x00\x01\x00'));

export function base64Of(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

type Json = Record<string, unknown>;

/**
 * A crypt of 10 × 8 cells at 100 pixels per cell: an outer wall drawn as one closed line, a
 * dividing wall with a door in its gap, a pillar, and one torch.
 */
export function cryptFile(): Json {
  return {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 8 }, pixels_per_grid: 100 },
    line_of_sight: [
      [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 7 }, { x: 1, y: 7 }, { x: 1, y: 1 }],
      [{ x: 4.5, y: 1 }, { x: 4.5, y: 3.25 }],
      [{ x: 4.5, y: 4.25 }, { x: 4.5, y: 7 }],
    ],
    objects_line_of_sight: [
      [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 5 }],
    ],
    portals: [
      { position: { x: 4.5, y: 3.75 }, bounds: [{ x: 4.5, y: 3.25 }, { x: 4.5, y: 4.25 }], rotation: 1.570796, closed: true, freestanding: false },
    ],
    environment: { baked_lighting: false, ambient_light: 'ff808080' },
    lights: [
      { position: { x: 2.5, y: 2.5 }, range: 6, intensity: 1, color: 'ffeccd8b', shadows: true },
    ],
    image: base64Of(pngHeader(1000, 800)),
  };
}

/** The crypt with `change` applied to a deep copy of it. */
export function cryptWith(change: (file: Json) => void): Json {
  const file = structuredClone(cryptFile());
  change(file);
  return file;
}

/** Sets `value` at a dotted `path` (`lights.0.range`) of the crypt; `undefined` removes the field. */
export function cryptSetting(path: string, value: unknown): Json {
  return cryptWith((file) => {
    const keys = path.split('.');
    const last = keys.pop()!;
    const holder = keys.reduce<unknown>((at, key) => (at as Json)[key], file) as Json;
    if (value === undefined) delete holder[last];
    else holder[last] = value;
  });
}

/** A stand-in for a bitmap the dungeon worker hands over, where tests run without a canvas: only its size. */
export function fakeBitmap(width: number, height: number): ImageBitmap {
  return { width, height, close: () => {} } as ImageBitmap;
}

/** What a stand-in converter makes of a bitmap: a PNG header of its size. */
export const pngOfBitmap = (bitmap: ImageBitmap): Blob => new Blob([pngHeader(bitmap.width, bitmap.height)], { type: 'image/png' });
