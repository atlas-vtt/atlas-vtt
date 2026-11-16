import { describe, expect, it } from 'vitest';
import { glyphEdges, glyphSolid, lightInGlyph } from '../../../src/app/dungeons/render/art/glyphLight';
import { shadeEdges, TO_LIGHT } from '../../../src/app/dungeons/render/art/light';
import { rotate, type Vec } from '../../../src/app/dungeons/render/geometry';
import type { GlyphPen } from '../../../src/app/dungeons/render/glyphPen';
import { recordingHand, turnTracker } from './glyphTestHand';

const TURNS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
const SQUARE: Vec[] = [{ x: -0.3, y: -0.2 }, { x: 0.3, y: -0.2 }, { x: 0.3, y: 0.2 }, { x: -0.3, y: 0.2 }];

function penAt(rotation: number) {
  const { ctx, rotation: turned } = turnTracker();
  // The glyph's own frame: drawGlyph has turned the context by the piece's rotation.
  ctx.rotate(rotation);
  const { hand, calls } = recordingHand(ctx, turned);
  const pen = { ctx, hand, rotation, scale: 1, fine: 0.007, palette: hand.scene.env.palette, paint: hand.paint } as unknown as GlyphPen;
  return { pen, calls };
}

/** The shaded runs of a polygon given in the map's frame, as sorted segment keys. */
function shadedSides(poly: readonly Vec[]): string[] {
  const key = (p: Vec): string => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  return shadeEdges(poly, true)
    .flatMap(run => run.slice(1).map((b, i) => [key(run[i]!), key(b)].sort().join(' ')))
    .sort();
}

describe('the light inside a turned glyph', () => {
  it("turns the light into the glyph's frame", () => {
    const sides = TURNS.map(rotation => {
      const { pen, calls } = penAt(rotation);
      glyphEdges(pen, SQUARE, true);
      const call = calls.find(c => c.kind === 'edges')!;
      // The hand draws in the map's frame, so its shade lines fall on the map's own sides.
      expect(call.rotation).toBeCloseTo(0, 9);
      return shadedSides(call.poly!);
    });
    // The square turned is the same rectangle only at half turns; its shaded sides face the same way at every turn.
    expect(sides[0]).toEqual(sides[2]);
    expect(sides[1]).toEqual(sides[3]);
    for (const s of sides) expect(s.length).toBe(2);
    const facing = (rotation: number): Vec => {
      const { pen, calls } = penAt(rotation);
      glyphEdges(pen, SQUARE, true);
      const poly = calls[0]!.poly!;
      const runs = shadeEdges(poly, true).flat();
      return runs.reduce((a, p) => ({ x: a.x + p.x / runs.length, y: a.y + p.y / runs.length }), { x: 0, y: 0 });
    };
    for (const rotation of TURNS) {
      const mid = facing(rotation);
      // The shaded corner lies away from the light, at the bottom right of the map.
      expect(mid.x).toBeGreaterThan(0);
      expect(mid.y).toBeGreaterThan(0);
    }
    const light = lightInGlyph(penAt(Math.PI / 2).pen);
    const expected = rotate(TO_LIGHT, -Math.PI / 2);
    expect(light.x).toBeCloseTo(expected.x, 9);
    expect(light.y).toBeCloseTo(expected.y, 9);
  });

  it('models a solid in the map\'s frame', () => {
    const { pen, calls } = penAt(Math.PI / 2);
    glyphSolid(pen, path => path.rect(-0.2, -0.2, 0.4, 0.4), { x: 0.1, y: 0 }, 0.2);
    const call = calls.find(c => c.kind === 'solid')!;
    expect(call.rotation).toBeCloseTo(0, 9);
    // (0.1, 0) of a glyph turned a quarter lies at (0, 0.1) on the map.
    expect(call.centre!.x).toBeCloseTo(0, 9);
    expect(call.centre!.y).toBeCloseTo(0.1, 9);
  });
});
