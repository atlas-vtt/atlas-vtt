import { describe, expect, it } from 'vitest';
import { FONT_FAMILIES } from '../madeText';
import { bundledFamily, carriesHalo, cssFont, cssFontFamily, HALO, haloOf, luminance } from '../textLook';
import { draggedWidth, placeBesideSide } from '../textWidth';

describe('the face of a text', () => {
  it('names it as a canvas and a stylesheet take it', () => {
    expect(cssFont({ fontFamily: FONT_FAMILIES.scifi, fontSize: 31.5, bold: true, italic: false })).toBe('normal bold 31.5px "Atlas Oxanium"');
    expect(cssFont({ fontFamily: 'Georgia, serif', fontSize: 20, bold: false, italic: true })).toBe('italic normal 20px "Georgia", serif');
    // A name that came quoted is quoted once, and can close no quote.
    expect(cssFontFamily('\'Atlas Courier Prime\', "My "Font", monospace')).toBe('"Atlas Courier Prime", "My Font", monospace');
  });

  it('knows the faces Atlas brings from those a device has', () => {
    for (const family of Object.values(FONT_FAMILIES)) expect(bundledFamily(family)).toBe(family);
    expect(bundledFamily('"atlas oxanium", sans-serif')).toBe(FONT_FAMILIES.scifi);
    expect(bundledFamily('Arial')).toBeNull();
    // What a text is set in is the first family it names.
    expect(bundledFamily(`Arial, ${FONT_FAMILIES.mono}`)).toBeNull();
  });
});

describe('the halo of the Outline look', () => {
  it('is dark under light text and light under dark', () => {
    for (const light of ['#ffffff', '#ffcc00', '#00ff00', '#e93147', '#888888']) expect(haloOf(light, 30).color, light).toBe(HALO.dark);
    for (const dark of ['#000000', '#1b2a49', '#3a1010', '#004400']) expect(haloOf(dark, 30).color, dark).toBe(HALO.light);
    // A colour nobody can read draws white, so its halo is dark.
    expect(haloOf('red', 30).color).toBe(HALO.dark);
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#000000')).toBe(0);
  });

  it('stands out from the letters by a share of their height, half of its line under them', () => {
    expect(haloOf('#ffffff', 40).width).toBeCloseTo(2 * HALO.share * 40);
    expect(haloOf('#ffffff', 10).width).toBeCloseTo(haloOf('#ffffff', 40).width / 4);
  });

  it('is left out of a text too small on a picture to carry it', () => {
    expect(carriesHalo(HALO.minPixels)).toBe(true);
    expect(carriesHalo(HALO.minPixels - 0.1)).toBe(false);
  });
});

describe('a text\'s width under its side handles', () => {
  const level = { rotation: 0, scale: 1 };

  it('grows by what the handle is dragged outward, in the text\'s own units, and never under a letter\'s height', () => {
    expect(draggedWidth(level, 100, 1, { x: 30, y: 50 }, 20)).toBe(130);
    expect(draggedWidth(level, 100, -1, { x: 30, y: 0 }, 20)).toBe(70);
    expect(draggedWidth({ rotation: 0, scale: 2 }, 100, 1, { x: 30, y: 0 }, 20)).toBe(115);
    expect(draggedWidth(level, 100, 1, { x: -500, y: 0 }, 20)).toBe(20);
    // A text turned a quarter has its sides above and below: a drag along its own line counts.
    expect(draggedWidth({ rotation: 90, scale: 1 }, 100, 1, { x: 40, y: 30 }, 20)).toBeCloseTo(130);
  });

  it('keeps the other side and the top where they are', () => {
    // The right side moved 40 out and a line of 20 was lost: the middle goes 20 right and 10 up.
    expect(placeBesideSide({ x: 500, y: 300 }, level, { width: 100, height: 60 }, { width: 140, height: 40 }, 1)).toEqual({ x: 520, y: 290 });
    expect(placeBesideSide({ x: 500, y: 300 }, level, { width: 100, height: 60 }, { width: 140, height: 40 }, -1)).toEqual({ x: 480, y: 290 });
    const turned = placeBesideSide({ x: 500, y: 300 }, { rotation: 90, scale: 2 }, { width: 100, height: 60 }, { width: 140, height: 60 }, 1);
    expect(turned.x).toBeCloseTo(500);
    expect(turned.y).toBeCloseTo(340);
  });
});
