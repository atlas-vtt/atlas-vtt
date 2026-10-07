import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { CELL } from '../../src/app/dice3d/atlasCell';
import { DEFAULT_DICE_LOOK } from '../../src/app/dice3d/diceLook';
import type { DieBody } from '../../src/app/dice3d/dieBody';
import { loadNumerals } from '../../src/app/dice3d/dieNumerals';
import { resolveLook, type ResolvedLook } from '../../src/app/dice3d/dieSkin';
import { paintFaceMarks } from '../../src/app/dice3d/faceArt';
import { buildTextures, loadDiceArtwork } from '../../src/app/dice3d/dieArtwork';
import { atlasLayout } from '../../src/app/dice3d/atlasCell';
import { dieGeometry } from '../../src/app/dice3d/dieGeometry';

/** Art with an opaque magenta ring and a transparent middle: whatever is painted under it shows through the middle. */
function ringArt(): HTMLCanvasElement {
  const art = document.createElement('canvas');
  art.width = 64;
  art.height = 64;
  const ctx = art.getContext('2d')!;
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.clearRect(12, 12, 40, 40);
  return art;
}

/** One face cell painted white and then with the face's marks; how many of its pixels are dark (an Atlas numeral) and magenta (the art). */
function paintCell(body: DieBody, value: number, look: ResolvedLook): { dark: number; magenta: number } {
  const canvas = document.createElement('canvas');
  canvas.width = CELL;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CELL, CELL);
  paintFaceMarks(ctx, CELL / 2, CELL / 2, body, value, look);
  const pixels = ctx.getImageData(0, 0, CELL, CELL).data;
  let dark = 0;
  let magenta = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    if (r < 120 && g < 120 && b < 120) dark++;
    if (r > 200 && g < 80 && b > 200) magenta++;
  }
  return { dark, magenta };
}

function withArt(body: DieBody, keys: number[]): ResolvedLook {
  const art = ringArt();
  const base = resolveLook({ ...DEFAULT_DICE_LOOK, font: 'scifi' }, null);
  return { ...base, lookId: 'ext:ring', art: { faces: new Map([[body, new Map(keys.map((key) => [key, art]))]]), bump: new Map() } };
}

describe("a dice look's face art on real canvases", () => {
  it('a face with art shows the art and no numeral of Atlas, over or under it; a face without art keeps the numeral', async () => {
    await loadNumerals('scifi');
    const plain = resolveLook({ ...DEFAULT_DICE_LOOK, font: 'scifi' }, null);
    expect(paintCell(20, 20, plain).dark).toBeGreaterThan(50);
    const art = paintCell(20, 20, withArt(20, [20]));
    expect(art.magenta).toBeGreaterThan(200);
    expect(art.dark).toBe(0);
    // Another face of the same body without art still has Atlas's numeral.
    expect(paintCell(20, 7, withArt(20, [20])).dark).toBeGreaterThan(50);
  });

  it("the d10's 10 and the d100 tens die's 00 take the art keyed 10 and 0", async () => {
    await loadNumerals('scifi');
    expect(paintCell(10, 10, withArt(10, [10])).dark).toBe(0);
    expect(paintCell(100, 10, withArt(100, [0])).dark).toBe(0);
    expect(paintCell(100, 10, withArt(100, [100])).dark).toBeGreaterThan(50);
  });

  it("with fill: 'face' a face's art covers its whole cell: no card, wear or numeral of Atlas's; bare cells keep the body colour", async () => {
    await loadDiceArtwork('scifi');
    const art = document.createElement('canvas');
    art.width = 40;
    art.height = 64;
    const ctx = art.getContext('2d')!;
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, 40, 64);
    const base = resolveLook({ ...DEFAULT_DICE_LOOK, font: 'scifi' }, null);
    const look = (fill?: 'face'): ResolvedLook => ({
      ...base, lookId: 'ext:pack', body: '#2040a0', ink: '#ffffff', ...(fill ? { fill } : {}),
      art: { faces: new Map([[20, new Map([[20, art]])]]), bump: new Map() },
    });
    const cellPixels = (canvas: HTMLCanvasElement, index: number): Uint8ClampedArray => {
      const { cols } = atlasLayout(20);
      return canvas.getContext('2d')!.getImageData((index % cols) * CELL, Math.floor(index / cols) * CELL, CELL, CELL).data;
    };
    const share = (pixels: Uint8ClampedArray, test: (r: number, g: number, b: number) => boolean): number => {
      let hits = 0;
      for (let i = 0; i < pixels.length; i += 4) if (test(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!)) hits++;
      return hits / (pixels.length / 4);
    };
    const magenta = (r: number, g: number, b: number): boolean => r === 255 && g === 0 && b === 255;
    const face20 = dieGeometry(20).values.indexOf(20);
    const filled = buildTextures(20, () => look('face')).map.image as HTMLCanvasElement;
    // The whole cell is the art, exactly: nothing of Atlas's card, rim or numeral is left.
    expect(share(cellPixels(filled, face20), magenta)).toBe(1);
    // The bare cell (chamfers, corners) is the body colour alone.
    expect(share(cellPixels(filled, 20), (r, g, b) => r === 0x20 && g === 0x40 && b === 0xa0)).toBe(1);
    // A face without art keeps Atlas's numeral (white ink on the body).
    expect(share(cellPixels(filled, dieGeometry(20).values.indexOf(7)), (r, g, b) => r > 200 && g > 200 && b > 200)).toBeGreaterThan(0.005);
    // The default placement is unchanged: the art sits in the numeral's room on Atlas's card.
    const placed = buildTextures(20, () => look()).map.image as HTMLCanvasElement;
    const placedShare = share(cellPixels(placed, face20), magenta);
    expect(placedShare).toBeGreaterThan(0.02);
    expect(placedShare).toBeLessThan(0.6);
  });
});
