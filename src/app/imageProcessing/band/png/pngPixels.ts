import { ColourType, type PngStructure } from './pngChunks';

/** No colour key: tRNS keys are 16-bit sample values, so -1 never matches one. */
const NO_KEY = -1;

/**
 * How one unfiltered scanline becomes 8-bit RGBA with straight alpha. Greyscale up to 8 bits and
 * indexed colour both go through a 256-entry RGBA table, so every sub-byte depth shares one loop.
 */
type Layout =
  | { readonly kind: 'lookup'; readonly depth: number; readonly table: Uint8Array }
  | { readonly kind: 'grey16'; readonly key: number }
  | { readonly kind: 'greyAlpha'; readonly sampleBytes: number }
  | { readonly kind: 'rgb8'; readonly key: readonly [number, number, number] | null }
  | { readonly kind: 'rgb16'; readonly key: readonly [number, number, number] | null }
  | { readonly kind: 'rgba8' }
  | { readonly kind: 'rgba16' };

function readKey(transparency: Uint8Array | null, index: number): number {
  return transparency ? (transparency[index * 2]! << 8) | transparency[index * 2 + 1]! : NO_KEY;
}

function rgbKey(transparency: Uint8Array | null): readonly [number, number, number] | null {
  return transparency ? [readKey(transparency, 0), readKey(transparency, 1), readKey(transparency, 2)] : null;
}

/**
 * Greyscale samples below 8 bits are scaled to the full range (PNG spec, 13.12: v × 255 / (2^d − 1)),
 * and the tRNS key is compared with the sample as stored.
 */
function greyTable(depth: number, key: number): Uint8Array {
  const table = new Uint8Array(1024);
  const max = (1 << depth) - 1;
  for (let value = 0; value <= max; value++) {
    const grey = Math.round((value * 255) / max);
    table.set([grey, grey, grey, value === key ? 0 : 255], value * 4);
  }
  return table;
}

/** An index past the palette's end is an error in the spec; it is drawn opaque black rather than refused. */
function paletteTable(palette: Uint8Array, transparency: Uint8Array | null): Uint8Array {
  const table = new Uint8Array(1024);
  for (let index = 0; index < 256; index++) table[index * 4 + 3] = 255;
  for (let index = 0; index * 3 < palette.length; index++) {
    table.set([palette[index * 3]!, palette[index * 3 + 1]!, palette[index * 3 + 2]!, transparency?.[index] ?? 255], index * 4);
  }
  return table;
}

function layoutOf(png: PngStructure): Layout {
  const { bitDepth, colourType, transparency } = png;
  switch (colourType) {
    case ColourType.Greyscale:
      return bitDepth === 16 ? { kind: 'grey16', key: readKey(transparency, 0) } : { kind: 'lookup', depth: bitDepth, table: greyTable(bitDepth, readKey(transparency, 0)) };
    case ColourType.Indexed:
      return { kind: 'lookup', depth: bitDepth, table: paletteTable(png.palette ?? new Uint8Array(0), transparency) };
    case ColourType.GreyscaleAlpha:
      return { kind: 'greyAlpha', sampleBytes: bitDepth / 8 };
    case ColourType.Truecolour:
      return bitDepth === 16 ? { kind: 'rgb16', key: rgbKey(transparency) } : { kind: 'rgb8', key: rgbKey(transparency) };
    case ColourType.TruecolourAlpha:
      return bitDepth === 16 ? { kind: 'rgba16' } : { kind: 'rgba8' };
  }
}

function convertLookup(line: Uint8Array, out: Uint8Array, offset: number, width: number, depth: number, table: Uint8Array): void {
  if (depth === 8) {
    for (let x = 0, j = offset; x < width; x++, j += 4) {
      const t = line[1 + x]! << 2;
      out[j] = table[t]!;
      out[j + 1] = table[t + 1]!;
      out[j + 2] = table[t + 2]!;
      out[j + 3] = table[t + 3]!;
    }
    return;
  }
  // Sub-byte samples are packed from the most significant bit (PNG spec, 7.2).
  const mask = (1 << depth) - 1;
  for (let x = 0, bit = 0, j = offset; x < width; x++, bit += depth, j += 4) {
    const t = ((line[1 + (bit >> 3)]! >> (8 - depth - (bit & 7))) & mask) << 2;
    out[j] = table[t]!;
    out[j + 1] = table[t + 1]!;
    out[j + 2] = table[t + 2]!;
    out[j + 3] = table[t + 3]!;
  }
}

/** 16-bit samples keep their high byte, as Chromium shows them; tRNS keys compare the full sample. */
function convertGrey16(line: Uint8Array, out: Uint8Array, offset: number, width: number, key: number): void {
  for (let x = 0, i = 1, j = offset; x < width; x++, i += 2, j += 4) {
    const high = line[i]!;
    out[j] = high;
    out[j + 1] = high;
    out[j + 2] = high;
    out[j + 3] = ((high << 8) | line[i + 1]!) === key ? 0 : 255;
  }
}

function convertGreyAlpha(line: Uint8Array, out: Uint8Array, offset: number, width: number, sampleBytes: number): void {
  const step = sampleBytes * 2;
  for (let x = 0, i = 1, j = offset; x < width; x++, i += step, j += 4) {
    const grey = line[i]!;
    out[j] = grey;
    out[j + 1] = grey;
    out[j + 2] = grey;
    out[j + 3] = line[i + sampleBytes]!;
  }
}

function convertRgb8(line: Uint8Array, out: Uint8Array, offset: number, width: number): void {
  for (let x = 0, i = 1, j = offset; x < width; x++, i += 3, j += 4) {
    out[j] = line[i]!;
    out[j + 1] = line[i + 1]!;
    out[j + 2] = line[i + 2]!;
    out[j + 3] = 255;
  }
}

function convertRgb8Keyed(line: Uint8Array, out: Uint8Array, offset: number, width: number, key: readonly [number, number, number]): void {
  const [kr, kg, kb] = key;
  for (let x = 0, i = 1, j = offset; x < width; x++, i += 3, j += 4) {
    const r = line[i]!;
    const g = line[i + 1]!;
    const b = line[i + 2]!;
    out[j] = r;
    out[j + 1] = g;
    out[j + 2] = b;
    out[j + 3] = r === kr && g === kg && b === kb ? 0 : 255;
  }
}

function convertRgb16(line: Uint8Array, out: Uint8Array, offset: number, width: number, key: readonly [number, number, number] | null): void {
  const [kr, kg, kb] = key ?? [NO_KEY, NO_KEY, NO_KEY];
  for (let x = 0, i = 1, j = offset; x < width; x++, i += 6, j += 4) {
    const r = line[i]!;
    const g = line[i + 2]!;
    const b = line[i + 4]!;
    out[j] = r;
    out[j + 1] = g;
    out[j + 2] = b;
    const keyed = ((r << 8) | line[i + 1]!) === kr && ((g << 8) | line[i + 3]!) === kg && ((b << 8) | line[i + 5]!) === kb;
    out[j + 3] = keyed ? 0 : 255;
  }
}

function convertRgba16(line: Uint8Array, out: Uint8Array, offset: number, width: number): void {
  for (let x = 0, i = 1, j = offset; x < width; x++, i += 8, j += 4) {
    out[j] = line[i]!;
    out[j + 1] = line[i + 2]!;
    out[j + 2] = line[i + 4]!;
    out[j + 3] = line[i + 6]!;
  }
}

/** Converts unfiltered scanlines of one image to 8-bit RGBA with straight alpha. */
export class PixelConverter {
  private readonly layout: Layout;
  private readonly width: number;

  constructor(png: PngStructure) {
    this.layout = layoutOf(png);
    this.width = png.width;
  }

  /** Writes `line` (filter byte at index 0, then the scanline) as `width` RGBA pixels into `out` from `offset`. */
  convert(line: Uint8Array, out: Uint8Array, offset: number): void {
    const { layout, width } = this;
    switch (layout.kind) {
      case 'lookup':
        return convertLookup(line, out, offset, width, layout.depth, layout.table);
      case 'grey16':
        return convertGrey16(line, out, offset, width, layout.key);
      case 'greyAlpha':
        return convertGreyAlpha(line, out, offset, width, layout.sampleBytes);
      case 'rgb8':
        return layout.key ? convertRgb8Keyed(line, out, offset, width, layout.key) : convertRgb8(line, out, offset, width);
      case 'rgb16':
        return convertRgb16(line, out, offset, width, layout.key);
      case 'rgba8':
        out.set(line.subarray(1, 1 + width * 4), offset);
        return;
      case 'rgba16':
        return convertRgba16(line, out, offset, width);
    }
  }
}
