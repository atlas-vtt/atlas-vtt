import { BufferImageSource, type TEXTURE_FORMATS } from 'pixi.js';
import { LEVEL_CODES, type AmbientRaster } from '../../../lighting/ambientRaster';
import type { RoofPieces } from '../../../levels/roofs';
import { perceivedLevel } from '../../../gameSystems/senseRules';
import type { RoofViewers } from '../../../vision/roofSight';

/** Bytes per texel of the formats the roof's data textures use. */
const TEXEL_BYTES: Partial<Record<TEXTURE_FORMATS, number>> = { r8unorm: 1, rg8unorm: 2, rgba32float: 16 };

/** `columns` padded so a row of texels is a whole number of 4-byte words, whatever the unpack alignment. */
function paddedColumns(columns: number, format: TEXTURE_FORMATS): number {
  const bytes = TEXEL_BYTES[format] ?? 4;
  const step = Math.max(1, 4 / bytes);
  return Math.ceil(Math.max(1, columns) / step) * step;
}

/**
 * Data the roof's shader reads texel by texel (`texelFetch`), never filtered: one source made once,
 * then filled and resized in place, so the filter binding it never holds a destroyed texture.
 */
export class DataTexture {
  readonly source: BufferImageSource;

  constructor(private readonly format: TEXTURE_FORMATS) {
    this.source = new BufferImageSource({ resource: this.empty(1, 1), width: paddedColumns(1, format), height: 1, format, scaleMode: 'nearest', alphaMode: 'no-premultiply-alpha', autoGenerateMipmaps: false });
  }

  /** How many texels a row has, padded: the length of a row of `fill`'s data. */
  columns(columns: number): number {
    return paddedColumns(columns, this.format);
  }

  /** Uploads `data` (rows of `columns(columns)` texels) as `rows` rows. */
  fill(data: Uint8Array | Float32Array, columns: number, rows: number): void {
    const width = paddedColumns(columns, this.format);
    this.source.resource = data;
    if (this.source.pixelWidth !== width || this.source.pixelHeight !== rows) this.source.resize(width, rows, 1);
    this.source.update();
  }

  destroy(): void {
    this.source.destroy();
  }

  private empty(columns: number, rows: number): Uint8Array | Float32Array {
    const length = paddedColumns(columns, this.format) * rows * ((TEXEL_BYTES[this.format] ?? 4) / (this.format === 'rgba32float' ? 4 : 1));
    return this.format === 'rgba32float' ? new Float32Array(length) : new Uint8Array(length);
  }
}

/** A roof's pieces as the shader reads them: two bytes of id per pixel, low byte first. */
export function piecesData(pieces: RoofPieces, texture: DataTexture): Uint8Array {
  const columns = texture.columns(pieces.width);
  const data = new Uint8Array(columns * pieces.height * 2);
  for (let row = 0; row < pieces.height; row++) {
    for (let column = 0; column < pieces.width; column++) {
      const id = pieces.ids[row * pieces.width + column]!;
      const at = (row * columns + column) * 2;
      data[at] = id & 0xff;
      data[at + 1] = id >> 8;
    }
  }
  return data;
}

/** The fade table's rows for a roof of `count` pieces: one byte per id, 256 to a row. */
export function fadeRows(count: number): number {
  return Math.floor(count / 256) + 1;
}

/** The ambient light by texel as the shader reads it: the level's code and the light, a byte each. */
export function ambientData(raster: AmbientRaster, texture: DataTexture): Uint8Array {
  const { columns, rows } = raster.grid;
  const padded = texture.columns(columns);
  const data = new Uint8Array(padded * rows * 2);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const from = row * columns + column;
      const at = (row * padded + column) * 2;
      data[at] = raster.levels[from]!;
      data[at + 1] = raster.light[from]!;
    }
  }
  return data;
}

/** The bits of the light levels a sense perceives roofs in (`LEVEL_CODES`), as the shader tests them. */
export function levelBits(perceives: (level: 'dark' | 'dim' | 'bright') => boolean): number {
  return (perceives('dark') ? 1 << LEVEL_CODES.dark : 0) | (perceives('dim') ? 1 << LEVEL_CODES.dim : 0) | (perceives('bright') ? 1 << LEVEL_CODES.bright : 0);
}

/** The viewers of roofs as the shader reads them: two texels each, origin, radius and level bits; facing, width, own space and cone. */
export function viewersData(viewers: Exclude<RoofViewers, 'all'>, texture: DataTexture): Float32Array {
  const columns = texture.columns(Math.max(1, viewers.length * 2));
  const data = new Float32Array(columns * 4);
  viewers.forEach((viewer, i) => {
    const bits = levelBits((level) => perceivedLevel(viewer.sense, level) !== null);
    data.set([viewer.origin.x, viewer.origin.y, viewer.radius, bits], i * 8);
    const cone = viewer.cone;
    data.set(cone ? [cone.facing, cone.angle, cone.apex ?? 0, 1] : [0, 0, 0, 0], i * 8 + 4);
  });
  return data;
}
