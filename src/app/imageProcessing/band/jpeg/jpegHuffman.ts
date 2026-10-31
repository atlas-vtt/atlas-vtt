import { BandUnsupportedError } from '../bandTypes';

/** Bits looked up at once; longer codes take the slow path. */
export const FAST_BITS = 9;

/**
 * A Huffman table as the decoder reads it (JPEG spec Annex C and F.2.2.3): `fast` maps the next
 * `FAST_BITS` bits to `(length << 8) | symbol`, 0 where the code is longer; `maxCode[l]` is the
 * largest code of length `l` (-1 when there is none), and `values[code + valueOffset[l]]` its symbol.
 */
export interface HuffmanTable {
  readonly fast: Uint16Array;
  readonly maxCode: Int32Array;
  readonly valueOffset: Int32Array;
  readonly values: Uint8Array;
}

/** Builds a table from a DHT's 16 code counts and its symbols. */
export function buildHuffmanTable(counts: Uint8Array, values: Uint8Array): HuffmanTable {
  const fast = new Uint16Array(1 << FAST_BITS);
  const maxCode = new Int32Array(18).fill(-1);
  const valueOffset = new Int32Array(18);
  let code = 0;
  let symbol = 0;
  for (let length = 1; length <= 16; length++) {
    const count = counts[length - 1] ?? 0;
    valueOffset[length] = symbol - code;
    for (let i = 0; i < count; i++, code++, symbol++) {
      if (length > FAST_BITS) continue;
      const shift = FAST_BITS - length;
      const entry = (length << 8) | (values[symbol] ?? 0);
      fast.fill(entry, code << shift, (code + 1) << shift);
    }
    if (count > 0) maxCode[length] = code - 1;
    // libjpeg's jpeg_make_d_derived_tbl: a code must fit its length and none may be all ones.
    if (code >= 1 << length) throw new BandUnsupportedError('corrupt', 'A Huffman table has more codes than fit their lengths.');
    code <<= 1;
  }
  return { fast, maxCode, valueOffset, values };
}
