import '../setup/obsidianDom';
import { commands } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { DiceGpu } from '../../src/app/dice3d/DiceGpu';
import { DiceRenderer } from '../../src/app/dice3d/DiceRenderer';
import { seededRandom } from '../../src/app/dice3d/atlasCell';
import { loadDiceArtwork } from '../../src/app/dice3d/dieArtwork';
import { dieGeometry, faceIndexForValue, lyingHeight, REST_YAW, restingQuaternion } from '../../src/app/dice3d/dieGeometry';
import { refreshDieArtwork } from '../../src/app/dice3d/dieMesh';
import { makeDie, restImmediately } from '../../src/app/dice3d/dieMotion';
import { layoutDice, restingFrame } from '../../src/app/dice3d/diceScene';
import { activeLook, resolveLook, setActiveLook, type ResolvedLook } from '../../src/app/dice3d/dieSkin';
import { DICE_COLOUR_OPTIONS, parseHex, type DiceFont, type Rgb } from '../../src/app/dice3d/diceLook';
import { DICE_SET_COLOURS } from '../../src/app/gameSystems/diceSets';

/**
 * A d20 with its 20 up, framed as a dice settings preview and a lone die on
 * the roll stage are: 192 px is a preview (shown at 96 CSS px), 480 px the
 * roll stage of 240 CSS px at a pixel ratio of 2, where the 20 stands some
 * 29 CSS px tall.
 */
const PREVIEW = 192;
const STAGE = 480;
/** WCAG AA for large text, which the numerals on the roll stage are. */
const AA_LARGE = 3;

function luminance([r, g, b]: Rgb): number {
  const linear = [r, g, b].map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function median(pixels: Rgb[]): Rgb {
  return [...pixels].sort((a, b) => luminance(a) - luminance(b))[Math.floor(pixels.length / 2)]!;
}

const hex = (rgb: Rgb): string => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

/** Draws the d20 in a look and reads the frame back. */
function stage(gpu: DiceGpu, px: number): (look: ResolvedLook) => Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  const renderer = new DiceRenderer(gpu, canvas);
  const { offsets, radius } = layoutDice(1);
  renderer.setSize(px, px, 1, 0.5, restingFrame(offsets, radius).halfWidth);
  renderer.setPlan([{ sides: 20 }]);
  const geometry = dieGeometry(20);
  const anim = makeDie(seededRandom(3), offsets[0], radius, renderer.stage(), lyingHeight(geometry));
  restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, 20), REST_YAW / 2));
  return (look) => {
    setActiveLook(look);
    refreshDieArtwork(20);
    renderer.render([{ anim, sides: 20 }], 1);
    return canvas.getContext('2d')!.getImageData(0, 0, px, px).data.slice();
  };
}

interface Reading { ink: Rgb; face: Rgb; ratio: number }

/**
 * The top face's 20 as shown. Where the die drawn with black and with white
 * numerals differs, a numeral covers the face; the fifth of those pixels it
 * covers most are its strokes, and the pixels it does not touch are the face.
 */
function read(draw: (look: ResolvedLook) => Uint8ClampedArray, look: ResolvedLook, px: number): Reading {
  const black = draw({ ...look, ink: '#000000' });
  const white = draw({ ...look, ink: '#ffffff' });
  const shown = draw(look);
  const at = (data: Uint8ClampedArray, i: number): Rgb => [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!];
  const [x0, x1, y0, y1] = [74, 118, 64, 100].map((v) => Math.round((v * px) / PREVIEW)) as [number, number, number, number];
  const pixels: { i: number; covered: number }[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * px + x;
      pixels.push({ i, covered: luminance(at(white, i)) - luminance(at(black, i)) });
    }
  }
  const most = Math.max(...pixels.map((p) => p.covered));
  const touched = pixels.filter((p) => p.covered > 0.25 * most).sort((a, b) => b.covered - a.covered);
  const ink = median(touched.slice(0, Math.ceil(touched.length / 5)).map((p) => at(shown, p.i)));
  const face = median(pixels.filter((p) => p.covered < 0.01 * most).map((p) => at(shown, p.i)));
  return { ink, face, ratio: contrast(ink, face) };
}

describe('dice numerals', () => {
  it('read on every built-in colour as the roll stage shows it', async () => {
    const gpu = new DiceGpu(document.createElement('canvas'));
    const previous = activeLook();
    const lines: string[] = [];
    const failing: string[] = [];
    for (const font of ['medieval', 'scifi'] as DiceFont[]) {
      await loadDiceArtwork(font);
      const looks: [string, ResolvedLook][] = [
        ...DICE_COLOUR_OPTIONS.map(({ value }): [string, ResolvedLook] => [value, resolveLook({ colour: value, font }, null)]),
        ...DICE_SET_COLOURS.map(({ value, label }): [string, ResolvedLook] => [`set ${label}`, resolveLook({ colour: 'accent', font }, parseHex(value))]),
      ];
      for (const px of [PREVIEW, STAGE]) {
        const draw = stage(gpu, px);
        for (const [name, look] of looks) {
          const { ink, face, ratio } = read(draw, look, px);
          const line = `${px} px ${font} ${name}: ${look.ink ?? 'pencil'} on ${look.body ?? 'card'} shows ${hex(ink)} on ${hex(face)}, ${ratio.toFixed(2)}:1`;
          lines.push(line);
          if (px === STAGE && ratio < AA_LARGE) failing.push(line);
        }
      }
    }
    setActiveLook(previous);
    refreshDieArtwork(20);
    gpu.dispose();
    await commands.writeFile('out/dice-numeral-contrast.txt', lines.join('\n'));
    expect(failing).toEqual([]);
  });
});
