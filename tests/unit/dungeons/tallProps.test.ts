import { describe, expect, it } from 'vitest';
import type { DungeonProp } from '../../../src/app/dungeons/model';
import { propFootprint } from '../../../src/app/dungeons/scene/objectShadows';

describe('a tall piece\'s lighting outline', () => {
  it('lies where its drawing stands, off the piece\'s centre and turned with it', () => {
    // A wardrobe's case stands at the back of its cell, against the wall at +y.
    const wardrobe: DungeonProp = { kind: 'wardrobe', x: 5, y: 5, rotation: Math.PI / 2, scale: 1, room: 0 };
    const outline = propFootprint(wardrobe, { halfW: 0.4, halfH: 0.22, round: false, y: 0.25 })!;
    expect(outline.x).toBeCloseTo(4.75, 9);
    expect(outline.y).toBeCloseTo(5, 9);
    expect(outline).toMatchObject({ halfW: 0.4, halfH: 0.22, round: false, rotation: Math.PI / 2 });
  });
});
