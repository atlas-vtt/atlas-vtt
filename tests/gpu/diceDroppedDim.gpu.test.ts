import '../setup/obsidianDom';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { DiceGpu } from '../../src/app/dice3d/DiceGpu';
import { DiceRenderer, type StageDie } from '../../src/app/dice3d/DiceRenderer';
import { seededRandom } from '../../src/app/dice3d/atlasCell';
import { loadDiceArtwork } from '../../src/app/dice3d/dieArtwork';
import { throwStyle } from '../../src/app/dice3d/diceDisplay';
import { dieGeometry, faceIndexForValue, lyingHeight, restingQuaternion } from '../../src/app/dice3d/dieGeometry';
import { makeDie, restImmediately } from '../../src/app/dice3d/dieMotion';
import { layoutDice, sceneFromRolls } from '../../src/app/dice3d/diceScene';
import { DiceStage } from '../../src/app/react/components/dice3d/DiceStage';

const WIDTH = 320;
const HEIGHT = 200;

/** Two d20s lying side by side, the first of them `dropped`, drawn with the dropped dice faded by `dim`. */
function drawPair(renderer: DiceRenderer, canvas: HTMLCanvasElement, dropped: boolean, dim: number): Uint8ClampedArray {
  renderer.setPlan([{ sides: 20, dropped }, { sides: 20 }]);
  const geometry = dieGeometry(20);
  const { offsets, radius } = layoutDice(2);
  const dice: StageDie[] = offsets.map((offset, i) => {
    const anim = makeDie(seededRandom(3 + i), offset, radius, renderer.stage(), lyingHeight(geometry));
    restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, i === 0 ? 4 : 17), 0.2));
    return { anim, sides: 20 };
  });
  renderer.render(dice, 1, null, dim);
  return canvas.getContext('2d')!.getImageData(0, 0, WIDTH, HEIGHT).data;
}

/**
 * How much the canvas' left or right half shows, on average: the table is
 * transparent (the panel shows through), so a die shows by its colour as far
 * as it is opaque.
 */
function contrast(pixels: Uint8ClampedArray, half: 'left' | 'right'): number {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = half === 'left' ? 0 : WIDTH / 2; x < (half === 'left' ? WIDTH / 2 : WIDTH); x++) {
      const i = (y * WIDTH + x) * 4;
      sum += ((pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) * pixels[i + 3]!) / 255;
      count++;
    }
  }
  return sum / count;
}

/** What the stage needs of the panel's stylesheet: a holder of the panel's size, its canvas in the corner. */
const LAYOUT = `
  .atlas-test-stage { position: absolute; inset: 0; overflow: hidden; }
  .atlas-test-stage canvas { position: absolute; bottom: 0; left: 0; display: block; }
`;

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

describe('a dropped die', () => {
  it('fades into the table, the kept die unchanged, and is whole again on the next throw', async () => {
    await loadDiceArtwork();
    const gpu = new DiceGpu(document.createElement('canvas'));
    const canvas = document.createElement('canvas');
    const renderer = new DiceRenderer(gpu, canvas);
    renderer.setSize(WIDTH, HEIGHT, 1);

    const thrown = drawPair(renderer, canvas, true, 0);
    const faded = drawPair(renderer, canvas, true, 1);
    const plain = drawPair(renderer, canvas, false, 1);

    expect(contrast(faded, 'left')).toBeLessThan(contrast(thrown, 'left') * 0.75);
    expect(Math.abs(contrast(faded, 'right') - contrast(thrown, 'right'))).toBeLessThan(contrast(thrown, 'right') * 0.05);
    // As thrown, the dropped die looks like any other; the next plan gives it its own material back.
    expect(Math.abs(contrast(thrown, 'left') - contrast(plain, 'left'))).toBeLessThan(contrast(plain, 'left') * 0.02);
    renderer.reset();
    gpu.dispose();
  });

  it('fades on the stage once the dice lie, not before', async () => {
    await loadDiceArtwork();
    const scene = sceneFromRolls([{ die: 'd20', value: 4, max: 20, dropped: true }, { die: 'd20', value: 17, max: 20 }])!;
    const style = document.createElement('style');
    style.textContent = LAYOUT;
    document.head.append(style);
    const host = document.createElement('div');
    host.style.cssText = `position: relative; width: ${WIDTH}px; height: ${HEIGHT}px;`;
    document.body.append(host);
    let settled = 0;
    const root = createRoot(host);
    flushSync(() => root.render(React.createElement(DiceStage, {
      scene, crit: null, muted: true, style: throwStyle('fast'), frame: null, seed: 'dropped', label: 'Roll', className: 'atlas-test-stage',
      onSettled: () => { settled = performance.now(); },
    })));
    const stageCanvas = (): HTMLCanvasElement => host.querySelector('canvas')!;
    const read = (): Uint8ClampedArray => {
      const canvas = stageCanvas();
      const ctx = canvas.getContext('2d')!;
      // The stage draws in its canvas' bottom left corner.
      return ctx.getImageData(0, canvas.height - HEIGHT, WIDTH, HEIGHT).data;
    };
    while (settled === 0) await nextFrame();
    const landed = read();
    while (performance.now() - settled < 900) await nextFrame();
    const rested = read();
    expect(contrast(rested, 'left')).toBeLessThan(contrast(landed, 'left') * 0.8);
    expect(Math.abs(contrast(rested, 'right') - contrast(landed, 'right'))).toBeLessThan(contrast(landed, 'right') * 0.1);
    root.unmount();
    host.remove();
    style.remove();
  });
});
