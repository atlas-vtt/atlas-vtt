/**
 * Hand-written Universal VTT floors, in the shapes real multi-floor exports have (the exports
 * themselves are other people's maps and stay out of the repository; `uvttRealExports.test.ts`
 * reads them from a local folder). Every real set found keeps one file per floor, named with the
 * floor's number or name, and its floors share origin, size and pixels per cell.
 */
import { base64Of } from './uvttFiles';

type Json = Record<string, unknown>;

const le16 = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff];
const ascii = (text: string): number[] => [...text].map((character) => character.charCodeAt(0));

/** The start of a baseline JPEG stating `width` × `height`, as Dungeon Alchemist's floors are. */
export function jpegHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0, 0, 0, 0, 0, 0]);
}

/** The start of a lossy WebP stating `width` × `height`, as Dungeondraft's floors are. */
export function webpHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([...ascii('RIFF'), 0x24, 0, 0, 0, ...ascii('WEBPVP8 '), 0x18, 0, 0, 0, 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, ...le16(width), ...le16(height)]);
}

/**
 * Floor `floor` of a tower as Dungeon Alchemist exports it (`tower_floor_N.dd2vtt`): format 0.2,
 * 11 × 11 cells at 72 pixels, an inline JPEG with the grid baked in, no `objects_line_of_sight`
 * key, no lights, baked lighting in white. Each floor's walls form a ring a cell further in than
 * the floor below's, and floor 1 has a door.
 */
export function daTowerFloor(floor: number): Json {
  const near = 1 + floor, far = 10 - floor;
  return {
    format: 0.2,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 11, y: 11 }, pixels_per_grid: 72 },
    line_of_sight: [[{ x: near, y: near }, { x: far, y: near }, { x: far, y: far }, { x: near, y: far }, { x: near, y: near }]],
    portals: floor === 1 ? [{ position: { x: 5.5, y: near }, bounds: [{ x: 5, y: near }, { x: 6, y: near }], rotation: 0, closed: true, freestanding: false }] : [],
    environment: { baked_lighting: true, ambient_light: 'ffffffff' },
    lights: [],
    image: base64Of(jpegHeader(792, 792)),
  };
}

/**
 * A floor of a Dungeondraft building (`Keep-20x16-<floor>-nogrid-lights.uvtt`): format 0.3, 20 ×
 * 16 cells at 100 pixels, an inline WebP, walls, an object outline, a door, a window and one
 * torch; lights not baked, a dark ambient light. `origin` and `size` move and shrink a floor, as
 * a tower smaller than its ground floor would be exported.
 */
export function keepFloor(torch: { x: number; y: number }, options: { origin?: { x: number; y: number }; size?: { x: number; y: number }; baked?: boolean; ambient?: string } = {}): Json {
  const origin = options.origin ?? { x: 0, y: 0 };
  const size = options.size ?? { x: 20, y: 16 };
  const at = (x: number, y: number): { x: number; y: number } => ({ x: origin.x + x, y: origin.y + y });
  return {
    format: 0.3,
    resolution: { map_origin: origin, map_size: size, pixels_per_grid: 100 },
    line_of_sight: [[at(1, 1), at(size.x - 1, 1), at(size.x - 1, size.y - 1), at(1, size.y - 1), at(1, 1)]],
    objects_line_of_sight: [[at(3, 3), at(4, 3), at(4, 4), at(3, 4), at(3, 3)]],
    portals: [
      { position: at(2, 1), bounds: [at(1.5, 1), at(2.5, 1)], rotation: 0, closed: true, freestanding: false },
      { position: at(5, 1), bounds: [at(4.5, 1), at(5.5, 1)], rotation: 0, closed: false, freestanding: false },
    ],
    environment: { baked_lighting: options.baked ?? false, ambient_light: options.ambient ?? 'ff202020' },
    lights: [{ position: at(torch.x, torch.y), range: 4, intensity: 1, color: 'ffeccd8b', shadows: true }],
    image: base64Of(webpHeader(size.x * 100, size.y * 100)),
  };
}

/** A file holding `content`, named `name`. */
export const floorFile = (content: unknown, name: string): File => new File([JSON.stringify(content)], name);
