const bits = new Float64Array(2);
const words = new Uint32Array(bits.buffer);

function hashOf(x: number, y: number): number {
  bits[0] = x;
  bits[1] = y;
  let h = Math.imul(words[0]! ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ words[1]! ^ (h >>> 13), 0xc2b2ae35);
  h = Math.imul(h ^ words[2]! ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ words[3]! ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * The distinct ends of walls given as x1, y1, x2, y2 each: for every end (2 × wall, + 1 for the
 * second) its place among them, ends with the same coordinates (to the bit) sharing one, so the
 * walls that meet at a junction ask about it once.
 */
export function distinctEnds(coords: Float64Array): { ends: Int32Array; count: number } {
  const total = coords.length / 2;
  let size = 16;
  while (size < total * 2) size *= 2;
  const slots = new Int32Array(size).fill(-1);
  const firstEnd = new Int32Array(total);
  const ends = new Int32Array(total);
  let count = 0;
  for (let e = 0; e < total; e++) {
    const x = coords[e * 2]!, y = coords[e * 2 + 1]!;
    let slot = hashOf(x, y) & (size - 1);
    for (;;) {
      const place = slots[slot]!;
      if (place < 0) {
        slots[slot] = count;
        firstEnd[count] = e;
        ends[e] = count++;
        break;
      }
      const other = firstEnd[place]!;
      if (Object.is(coords[other * 2], x) && Object.is(coords[other * 2 + 1], y)) {
        ends[e] = place;
        break;
      }
      slot = (slot + 1) & (size - 1);
    }
  }
  return { ends, count };
}
