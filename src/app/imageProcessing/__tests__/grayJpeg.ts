/**
 * A baseline greyscale JPEG of any size, uniformly mid grey, built byte by byte
 * so tests can have images larger than any canvas can encode. Every block holds
 * only a zero DC difference and an end of block, each a one-bit code, so the
 * entropy data is two bits per 8 × 8 block.
 */
export function grayJpeg(width: number, height: number, exifOrientation?: number): Blob {
  const segment = (marker: number, body: number[]): number[] => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
  const singleCodeTable = (tableClass: number): number[] => [tableClass << 4, 1, ...new Array<number>(15).fill(0), 0];
  const header = [
    0xff, 0xd8,
    ...(exifOrientation === undefined ? [] : segment(0xe1, exif(exifOrientation))),
    ...segment(0xdb, [0, ...new Array<number>(64).fill(1)]),
    ...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xc4, singleCodeTable(0)),
    ...segment(0xc4, singleCodeTable(1)),
    ...segment(0xda, [1, 1, 0x00, 0, 63, 0]),
  ];
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  const data = new Uint8Array(Math.ceil(blocks / 4));
  const rest = blocks % 4;
  if (rest > 0) data[data.length - 1] = (1 << (8 - 2 * rest)) - 1;
  return new Blob([new Uint8Array(header), data, new Uint8Array([0xff, 0xd9])], { type: 'image/jpeg' });
}

/** An APP1 body holding a big-endian TIFF directory with the one Orientation entry. */
function exif(orientation: number): number[] {
  const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  return [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
}
