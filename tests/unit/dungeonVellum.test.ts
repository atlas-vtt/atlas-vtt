import { describe, expect, it } from 'vitest';
import { luminance, parseHex } from '../../src/app/dungeons/render/palette';
import { vellumColours } from '../../src/app/dungeons/render/vellum';
import { cloudTile } from '../../src/app/dungeons/render/vellumSkin';
import { DUNGEON_STYLES } from '../../src/app/dungeons/styleCatalog';

const brightness = (colour: string): number => luminance(parseHex(colour)) / 255;

describe('the vellum a dungeon is drawn on', () => {
  it('is lighter where the dungeon lies than at the edges, keeps a dark look dark and is never paper white', () => {
    for (const { id, style } of DUNGEON_STYLES) {
      const paper = brightness(style.colors.paper);
      const { inner, outer } = vellumColours(style.colors.paper);
      expect(brightness(inner), id).toBeGreaterThanOrEqual(brightness(outer));
      if (paper < 0.4) expect(brightness(inner), id).toBeLessThan(0.4);
      expect(Math.max(...parseHex(inner)), id).toBeLessThan(255);
    }
  });

  it('keeps the look’s own colour', () => {
    const { inner, outer } = vellumColours('#aab58a');
    for (const [r, g, b] of [parseHex(inner), parseHex(outer)]) expect(g).toBeGreaterThan(Math.max(r, b));
  });

  it('repeats without a seam: the grain at one edge runs on at the other', () => {
    const size = 64;
    const tile = cloudTile(size, 7);
    let across = 0;
    let within = 0;
    for (let y = 0; y < size; y++) {
      across += Math.abs(tile[y * size + size - 1]! - tile[y * size]!);
      within += Math.abs(tile[y * size + 1]! - tile[y * size]!);
    }
    expect(across).toBeLessThan(within * 2);
  });
});
