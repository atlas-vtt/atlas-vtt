import { describe, expect, it } from 'vitest';
import { BrushOutline } from '../brushOutline';
import { signedAreaTwice } from '../canonicalForm';
import { strokePolygons } from '../exploredEdits';
import { areaOf } from '../rooms';

const at = (x: number, y: number): { x: number; y: number } => ({ x, y });
/** The area rings enclose, outlines less holes, in eighth pixels squared. */
const areaOfRings = (rings: number[][]): number => Math.abs(Number(rings.reduce((sum, ring) => sum + signedAreaTwice(ring), 0n))) / 2;

describe('the rooms brush outline', () => {
  it('grows with the stroke to what the whole stroke covers, and begins anew for another stroke', () => {
    const outline = new BrushOutline();
    const points = [at(0, 0)];
    const stroke = { type: 'brush' as const, points, brushRadius: 20 };
    outline.of(stroke);
    for (let i = 1; i <= 40; i++) {
      points.push(at(i * 10, Math.sin(i / 4) * 60));
      outline.of(stroke);
    }
    const grown = areaOfRings(outline.of(stroke));
    const whole = areaOfRings(areaOf(strokePolygons(stroke)));
    // Each piece is simplified on its own, within a pixel of what was drawn: a preview's difference
    expect(Math.abs(grown - whole) / whole).toBeLessThan(0.03);
    // A stroke elsewhere is its own outline, not added to the last one's
    const elsewhere = { type: 'brush' as const, points: [at(1000, 1000)], brushRadius: 20 };
    expect(areaOfRings(outline.of(elsewhere))).toBeCloseTo(areaOfRings(areaOf(strokePolygons(elsewhere))), 0);
  });
});
