import { BandUnsupportedError } from '../bandTypes';
import { FAST_BITS, type HuffmanTable } from './jpegHuffman';
import { ZIGZAG } from './jpegZigzag';

const FAST_MASK = (1 << FAST_BITS) - 1;

/**
 * Reads a scan's entropy-coded data (JPEG spec F.2.2): Huffman symbols, the bits after them,
 * stuffed zero bytes and restart markers. `bits` holds the next `count` bits in its low end; past
 * a marker it is filled with zero bytes, which a valid stream never reaches, so reaching them
 * means the file is cut off (`checkNotPastEnd`).
 */
export class EntropyReader {
  private pos: number;
  private bits = 0;
  private count = 0;
  private padBytes = 0;
  private mcusDone = 0;
  private readonly predictors = new Int32Array(4);

  constructor(private readonly data: Uint8Array, start: number, private readonly restartInterval: number) {
    this.pos = start;
  }

  /** Call before each MCU: handles the restart marker due before it (spec E.2.4) and resets the DC predictions. */
  startMcu(): void {
    if (this.restartInterval > 0 && this.mcusDone > 0 && this.mcusDone % this.restartInterval === 0) this.restart();
    this.mcusDone++;
  }

  /** Decodes a block's DC difference and returns the DC coefficient of scan component `component`. */
  decodeDc(table: HuffmanTable, component: number): number {
    const size = this.decodeSymbol(table);
    const value = (this.predictors[component] ?? 0) + (size === 0 ? 0 : this.receiveExtend(size));
    this.predictors[component] = value;
    return value;
  }

  /** Decodes a block's AC coefficients into `block` (natural order, zeroed first) and returns the zigzag index of the last one, 0 if none. */
  decodeAc(table: HuffmanTable, block: Int32Array): number {
    block.fill(0);
    let last = 0;
    for (let k = 1; k < 64; k++) {
      const symbol = this.decodeSymbol(table);
      const size = symbol & 15;
      const run = symbol >> 4;
      if (size === 0) {
        if (run !== 15) break;
        k += 15;
        continue;
      }
      k += run;
      if (k > 63) throw new BandUnsupportedError('corrupt', 'A block runs past its 64th coefficient.');
      block[ZIGZAG[k] ?? 0] = this.receiveExtend(size);
      last = k;
    }
    return last;
  }

  /** Reads past a block's AC coefficients without keeping them. */
  skipAc(table: HuffmanTable): void {
    for (let k = 1; k < 64; k++) {
      const symbol = this.decodeSymbol(table);
      const size = symbol & 15;
      if (size === 0) {
        if (symbol >> 4 !== 15) return;
        k += 15;
        continue;
      }
      k += symbol >> 4;
      if (k > 63) throw new BandUnsupportedError('corrupt', 'A block runs past its 64th coefficient.');
      this.skipBits(size);
    }
  }

  /** Throws when the reader has used bits past the end of the data, which only a truncated file makes it do. */
  checkNotPastEnd(): void {
    if (this.count < this.padBytes * 8) throw new BandUnsupportedError('corrupt', 'The scan ends early: the file is cut off.');
  }

  private decodeSymbol(table: HuffmanTable): number {
    if (this.count < 16) this.fill();
    const entry = table.fast[(this.bits >>> (this.count - FAST_BITS)) & FAST_MASK] ?? 0;
    if (entry !== 0) {
      this.count -= entry >> 8;
      return entry & 255;
    }
    const code16 = (this.bits >>> (this.count - 16)) & 0xffff;
    for (let length = FAST_BITS + 1; length <= 16; length++) {
      const code = code16 >>> (16 - length);
      if (code <= (table.maxCode[length] ?? -1)) {
        this.count -= length;
        return table.values[code + (table.valueOffset[length] ?? 0)] ?? 0;
      }
    }
    throw new BandUnsupportedError('corrupt', 'A Huffman code that the table does not hold.');
  }

  /** Reads `size` bits and extends them to a signed value (spec F.2.2.1, EXTEND). */
  private receiveExtend(size: number): number {
    if (this.count < size) this.fill();
    this.count -= size;
    const value = (this.bits >>> this.count) & ((1 << size) - 1);
    return value < 1 << (size - 1) ? value - (1 << size) + 1 : value;
  }

  private skipBits(size: number): void {
    if (this.count < size) this.fill();
    this.count -= size;
  }

  /** Tops `bits` up to more than 24 bits, a byte at a time, unstuffing 0xFF 0x00 and stopping at a marker. */
  private fill(): void {
    const data = this.data;
    while (this.count <= 24) {
      let byte = 0;
      if (this.padBytes === 0 && this.pos < data.length) {
        byte = data[this.pos] ?? 0;
        if (byte !== 0xff) this.pos++;
        else if (data[this.pos + 1] === 0) this.pos += 2;
        else {
          byte = 0;
          this.padBytes++;
        }
      } else this.padBytes++;
      this.bits = (this.bits << 8) | byte;
      this.count += 8;
    }
  }

  /** Drops the bits left before a restart marker, reads the marker and resets the DC predictions. */
  private restart(): void {
    this.checkNotPastEnd();
    const data = this.data;
    let pos = this.pos;
    // Bytes the reader had not reached yet are the interval's padding; libjpeg discards them too.
    while (pos < data.length && !(data[pos] === 0xff && data[pos + 1] !== 0 && data[pos + 1] !== 0xff)) pos++;
    const marker = data[pos + 1];
    if (marker === undefined || marker < 0xd0 || marker > 0xd7) throw new BandUnsupportedError('corrupt', 'A restart marker is missing.');
    this.pos = pos + 2;
    this.bits = 0;
    this.count = 0;
    this.padBytes = 0;
    this.predictors.fill(0);
  }
}
