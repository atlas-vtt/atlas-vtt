import { describe, expect, it } from 'vitest';
import { QUIET, qrDrawing, qrMatrix, type QrMatrix } from '../../../../src/app/online/gm/dock/qrDrawing.ts';
import { qrImageModule } from '../../../../src/app/online/gm/dock/qrImage.ts';

const LINK = 'https://tabletop-relay.example.workers.dev/#4f1c9a2e7b6d3c58a0e1f2b3c4d5e6f7';

/** A matrix of one colour, to read the drawing's geometry without a code's noise. */
const plain = (size: number, dark: boolean): QrMatrix => ({ size, dark: (x, y) => dark && x >= 0 && y >= 0 && x < size && y < size });

describe('the invite link as a QR code', () => {
  it('is encoded at error correction level H, which recovers what the icon covers', () => {
    // 76 bytes take version 8 (49 modules) only at level H: Q fits them into version 7, M into 5, L into 4.
    expect(LINK).toHaveLength(76);
    expect(qrMatrix(LINK).size).toBe(49);
    expect(qrMatrix('https://t.example/#4f1c9a2e7b6d3c58a0e1f2b3c4d5e6f7').size).toBe(41);
  });

  it('is the same matrix every time, false outside its side', () => {
    const a = qrMatrix(LINK);
    const b = qrMatrix(LINK);
    for (let y = 0; y < a.size; y++) for (let x = 0; x < a.size; x++) expect(a.dark(x, y)).toBe(b.dark(x, y));
    expect(a.dark(-1, 0)).toBe(false);
    expect(a.dark(0, a.size)).toBe(false);
    // A finder pattern's corner and the middle of its eye are dark, the ring between them light.
    expect([a.dark(0, 0), a.dark(1, 1), a.dark(3, 3)]).toEqual([true, false, true]);
  });

  it('stands in a quiet zone of four modules', () => {
    const drawing = qrDrawing(qrMatrix(LINK));
    expect(QUIET).toBe(4);
    expect(drawing.size).toBe(49);
    expect(drawing.side).toBe(49 + 8);
  });

  it('clears whole modules in the middle for the icon: centred, at most about a fifth of the side, the icon with an even margin', () => {
    for (let size = 21; size <= 77; size += 4) {
      const { plate, icon, side } = qrDrawing(plain(size, false));
      expect(Number.isInteger(plate.x) && Number.isInteger(plate.side), `size ${size}`).toBe(true);
      expect(plate.side % 2, `size ${size}`).toBe(1);
      expect(plate.side / size, `size ${size}`).toBeLessThanOrEqual(0.21);
      // Centred on the drawing, the icon centred in it one module inside.
      expect(plate.x + plate.side / 2, `size ${size}`).toBe(side / 2);
      expect(plate.y).toBe(plate.x);
      expect(icon).toEqual({ x: plate.x + 1, y: plate.y + 1, side: plate.side - 2 });
    }
    expect(qrDrawing(qrMatrix(LINK)).plate.side).toBe(9);
  });

  it('draws no module under the icon or in a finder pattern, and joins the rest in runs', () => {
    // All dark: every row is one run, cut by the finder patterns and the cleared middle.
    const { modules, plate } = qrDrawing(plain(49, true));
    const starts = [...modules.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]), width: Number(match[3]) }));
    const middle = starts.filter((run) => run.y === plate.y + 4);
    // The middle row: from the quiet zone to the cleared modules, and from them to the far side.
    expect(middle.map((run) => Math.round(run.x + run.width))).toEqual([plate.x, QUIET + 49]);
    expect(Math.round(middle[1]?.x ?? 0)).toBe(plate.x + plate.side);
    // The first row runs between the two finder patterns only.
    const first = starts.filter((run) => run.y === QUIET);
    expect(first).toHaveLength(1);
    expect(first[0]?.x).toBeGreaterThanOrEqual(QUIET + 7);
    expect((first[0]?.x ?? 0) + (first[0]?.width ?? 0)).toBeLessThanOrEqual(QUIET + 49 - 7);
  });

  it('draws the finder patterns as a ring and an eye on the grid, in the three corners', () => {
    const { finders } = qrDrawing(plain(49, false));
    // Each: the 7-module ring, its 5-module hole, the 3-module eye; all start on their top edge, a radius in.
    const tops = [...finders.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2]), Number(match[3])]);
    expect(tops).toHaveLength(9);
    const rings = tops.filter((_, index) => index % 3 === 0);
    expect(rings.map(([, y]) => y)).toEqual([QUIET, QUIET, QUIET + 42]);
    for (const [index, [x, , width]] of rings.entries()) {
      const left = [QUIET, QUIET + 42, QUIET][index] ?? 0;
      // The straight part of the top edge is the side less the two corners.
      expect((x ?? 0) - left).toBeCloseTo((7 - (width ?? 0)) / 2, 5);
      expect((7 - (width ?? 0)) / 2).toBeCloseTo(1.75, 5);
    }
  });

  it('is copied as a picture of about 1024 px a side, in whole pixels per module at every size', () => {
    for (let size = 21; size <= 177; size += 4) {
      const module = qrImageModule({ side: size + 2 * QUIET });
      expect(Number.isInteger(module), `size ${size}`).toBe(true);
      // Within half a module's worth of pixels of 1024, whatever the code's size.
      expect(Math.abs(module * (size + 2 * QUIET) - 1024), `size ${size}`).toBeLessThanOrEqual((size + 2 * QUIET) / 2);
    }
    expect(qrImageModule(qrDrawing(qrMatrix(LINK)))).toBe(18);
  });

  it('holds nothing of the link but the modules', () => {
    const drawing = qrDrawing(qrMatrix(LINK));
    expect(JSON.stringify(drawing)).not.toContain('workers.dev');
    expect(JSON.stringify(drawing)).not.toContain('4f1c9a2e');
    expect(drawing.modules).toMatch(/^[Mhvaz\d. -]+$/i);
  });
});
