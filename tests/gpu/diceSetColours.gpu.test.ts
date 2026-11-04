import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { DiceGpu } from '../../src/app/dice3d/DiceGpu';
import { DiceRenderer, type StageDie } from '../../src/app/dice3d/DiceRenderer';
import { seededRandom } from '../../src/app/dice3d/atlasCell';
import { loadDiceArtwork } from '../../src/app/dice3d/dieArtwork';
import { colouredAtlasCount } from '../../src/app/dice3d/dieColours';
import type { DieSides } from '../../src/app/dice3d/dieGeometry';
import { dieGeometry, faceIndexForValue, lyingHeight, restingQuaternion } from '../../src/app/dice3d/dieGeometry';
import { dieAssets } from '../../src/app/dice3d/dieMesh';
import { makeDie, restImmediately } from '../../src/app/dice3d/dieMotion';
import { dieImage, drawDieImages } from '../../src/app/dice3d/dieImages';
import { layoutDice, restingFrame } from '../../src/app/dice3d/diceScene';
import { refreshDieArtwork } from '../../src/app/dice3d/dieMesh';
import { activeLook, resolveLook, setActiveLook } from '../../src/app/dice3d/dieSkin';
import { DICE_SET_COLOURS } from '../../src/app/gameSystems/diceSets';

const WIDTH = 240;
const HEIGHT = 200;

/** One die of `sides` lying still on a stage of its own, in `colour` or the dice look. */
function drawDie(gpu: DiceGpu, sides: DieSides, colour?: string): { pixels: Uint8ClampedArray; renderer: DiceRenderer } {
  const canvas = document.createElement('canvas');
  const renderer = new DiceRenderer(gpu, canvas);
  renderer.setSize(WIDTH, HEIGHT, 1);
  renderer.setPlan([{ sides, colour }]);
  const geometry = dieGeometry(sides);
  const anim = makeDie(seededRandom(7), [0, 0], 0.92, renderer.stage(), lyingHeight(geometry));
  restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, sides), 0.3));
  const dice: StageDie[] = [{ anim, sides }];
  renderer.render(dice, 1, null);
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT).data;
  // The stage lets go of its dice, as a pooled stage does after a throw.
  renderer.reset();
  return { pixels, renderer };
}

/** The mean colour of the brightest-saturated part of the frame: the die's faces, not the dark table. */
function dieColour(pixels: Uint8ClampedArray, least = 2000): [number, number, number] {
  const sum = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b] = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    if (r + g + b < 120) continue;
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
    count++;
  }
  expect(count, 'pixels of the die').toBeGreaterThan(least);
  return [sum[0]! / count, sum[1]! / count, sum[2]! / count];
}

const CLOSE = 220;

/** A d6 with its 6 up, framed as the dice lab frames a die, so a face is large enough to show its grain. */
function drawCloseD6(renderer: DiceRenderer, canvas: HTMLCanvasElement, colour?: string): Uint8ClampedArray {
  const { offsets, radius } = layoutDice(1);
  renderer.setSize(CLOSE, CLOSE, 1, 0.5, restingFrame(offsets, radius).halfWidth * 0.8);
  renderer.setPlan([{ sides: 6, colour }]);
  const geometry = dieGeometry(6);
  const anim = makeDie(seededRandom(7), offsets[0], radius, renderer.stage(), lyingHeight(geometry));
  restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, 6), 0.25));
  renderer.render([{ anim, sides: 6 }], 1);
  return canvas.getContext('2d')!.getImageData(0, 0, CLOSE, CLOSE).data;
}

/**
 * The grain of the top face beside its numeral: the mean lightness step
 * between pixels three apart, the largest twentieth (a stroke's edge) left
 * out. Neighbours cancel the light's gradient across the face, so a face
 * filled flat has next to none.
 */
function grainOf(pixels: Uint8ClampedArray): number {
  const lum = (x: number, y: number): number => {
    const i = (y * CLOSE + x) * 4;
    return 0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!;
  };
  const steps: number[] = [];
  for (let y = 70; y < 140; y++) {
    for (let x = 50; x < 75; x++) steps.push(Math.abs(lum(x, y) - lum(x + 3, y)), Math.abs(lum(x, y) - lum(x, y + 3)));
  }
  steps.sort((a, b) => a - b);
  const kept = steps.slice(0, Math.floor(steps.length * 0.95));
  return kept.reduce((sum, step) => sum + step, 0) / kept.length;
}

/** Graphics memory of a canvas texture with its mipmaps. */
function textureBytes(image: { width: number; height: number }): number {
  return Math.round(image.width * image.height * 4 * (4 / 3));
}

describe('dice in the colours of their set', () => {
  it('draw a die in its colour, and one without a colour in the dice look', async () => {
    await loadDiceArtwork();
    const gpu = new DiceGpu(document.createElement('canvas'));
    const [pr, , pb] = dieColour(drawDie(gpu, 12).pixels);
    const [br, bg, bb] = dieColour(drawDie(gpu, 12, '#1d4ed8').pixels);
    const [rr, rg, rb] = dieColour(drawDie(gpu, 12, '#b91c1c').pixels);
    // The card stock is warm: more red than blue.
    expect(pr).toBeGreaterThan(pb);
    expect(bb).toBeGreaterThan(br + 30);
    expect(bb).toBeGreaterThan(bg);
    expect(rr).toBeGreaterThan(rb + 30);
    expect(rr).toBeGreaterThan(rg);
    gpu.dispose();
  });

  it('share their body and relief with the plain die and keep only a few colours no stage shows', async () => {
    await loadDiceArtwork();
    const plain = dieAssets(20);
    const gold = dieAssets(20, '#ca8a04');
    expect(gold.geometry).toBe(plain.geometry);
    expect(gold.material.bumpMap).toBe(plain.material.bumpMap);
    expect(gold.material.map).not.toBe(plain.material.map);
    expect(dieAssets(20, '#CA8A04')).toBe(gold);

    const colours = ['#000001', '#000002', '#000003', '#000004', '#000005', '#000006', '#000007', '#000008', '#000009', '#00000a'];
    for (const colour of colours) dieAssets(6, colour);
    expect(colouredAtlasCount()).toBeLessThanOrEqual(8);
  });

  it('keep the card\'s grain in every colour, as much of it as the light die shows', async () => {
    await loadDiceArtwork();
    const gpu = new DiceGpu(document.createElement('canvas'));
    const canvas = document.createElement('canvas');
    const renderer = new DiceRenderer(gpu, canvas);
    const light = grainOf(drawCloseD6(renderer, canvas));
    const grains: Record<string, number> = {};
    for (const { value, label } of DICE_SET_COLOURS) grains[label] = grainOf(drawCloseD6(renderer, canvas, value));
    const previous = activeLook();
    for (const colour of ['dark', 'accent'] as const) {
      setActiveLook(resolveLook({ colour, font: 'medieval' }, [0x8a, 0x5c, 0xf5]));
      refreshDieArtwork(6);
      grains[`${colour} look`] = grainOf(drawCloseD6(renderer, canvas));
    }
    setActiveLook(previous);
    refreshDieArtwork(6);
    renderer.reset();
    gpu.dispose();
    console.log(`[dice set colours] grain against the light die (${light.toFixed(2)}): ${Object.entries(grains).map(([name, grain]) => `${name} ${(grain / light).toFixed(2)}`).join(', ')}`);
    // Filled flat under a soft-light grain, coloured faces kept a fifth to three quarters of it.
    for (const [name, grain] of Object.entries(grains)) {
      expect(grain / light, name).toBeGreaterThan(0.8);
      expect(grain / light, name).toBeLessThan(1.4);
    }
  });

  it('cost one albedo atlas per kind of die and colour, painted once', async () => {
    await loadDiceArtwork();
    const costs: string[] = [];
    for (const sides of [4, 6, 8, 10, 12, 20] as const) {
      const start = performance.now();
      const assets = dieAssets(sides, '#4338ca');
      const painted = performance.now() - start;
      const image = assets.material.map!.image as HTMLCanvasElement;
      costs.push(`d${sides}: ${(textureBytes(image) / 2 ** 20).toFixed(1)} MB, painted in ${painted.toFixed(1)} ms`);
    }
    // The first frame of a coloured die uploads its atlas.
    const gpu = new DiceGpu(document.createElement('canvas'));
    const gl = gpu.renderer.getContext();
    drawDie(gpu, 12);
    gl.finish();
    let start = performance.now();
    drawDie(gpu, 12);
    gl.finish();
    const warm = performance.now() - start;
    start = performance.now();
    drawDie(gpu, 12, '#0f766e');
    gl.finish();
    const coloured = performance.now() - start;
    console.log(`[dice set colours] ${costs.join('; ')}; d12 frame on a warm stage ${warm.toFixed(1)} ms, first frame of a new colour ${coloured.toFixed(1)} ms`);
    gpu.dispose();
    expect(costs).toHaveLength(6);
  });

  it('are drawn for the dice lab\'s tray, each in its colour, and once', async () => {
    const gold = { sides: 12, colour: '#ca8a04' };
    const purple = { sides: 12, colour: '#7e22ce' };
    await drawDieImages([gold, purple, { sides: 7 }]);
    const colourOf = async (url: string): Promise<[number, number, number]> => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return dieColour(ctx.getImageData(0, 0, image.width, image.height).data, 400);
    };
    const [gr, , gb] = await colourOf(dieImage(gold)!.url);
    const [pr, pg, pb] = await colourOf(dieImage(purple)!.url);
    expect(gr).toBeGreaterThan(gb + 30);
    expect(pb).toBeGreaterThan(pg + 20);
    expect(pr).toBeGreaterThan(pg);
    // A d7 has no body
    expect(dieImage({ sides: 7 })).toBeNull();
    // Drawn once: asking again draws nothing
    const before = dieImage(gold);
    await drawDieImages([gold]);
    expect(dieImage(gold)).toBe(before);
  });
});
