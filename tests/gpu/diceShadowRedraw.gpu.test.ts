import '../setup/obsidianDom';
import { describe, expect, it } from 'vitest';
import { DiceGpu } from '../../src/app/dice3d/DiceGpu';
import { DiceRenderer, type StageDie } from '../../src/app/dice3d/DiceRenderer';
import { loadDiceArtwork } from '../../src/app/dice3d/dieArtwork';
import { dieGeometry, faceIndexForValue, lyingHeight, restingQuaternion } from '../../src/app/dice3d/dieGeometry';
import { makeDie, restImmediately } from '../../src/app/dice3d/dieMotion';

const WIDTH = 336;
const HEIGHT = 300;

/** A drawn frame: its draw calls and its pixels. */
interface Frame {
  draws: number;
  pixels: Uint8Array;
}

interface Stage {
  renderer: DiceRenderer;
  dice: StageDie[];
  frame: () => Frame;
  resize: () => void;
}

function stageWithRestingDie(): Stage {
  const context = document.createElement('canvas');
  const canvas = document.createElement('canvas');
  const renderer = new DiceRenderer(new DiceGpu(context), canvas);
  const resize = (): void => renderer.setSize(WIDTH, HEIGHT, 1);
  resize();
  renderer.setPlan([{ sides: 20 }]);
  const geometry = dieGeometry(20);
  const anim = makeDie(Math.random, [0, 0], 0.92, renderer.stage(), lyingHeight(geometry));
  restImmediately(anim, restingQuaternion(geometry, faceIndexForValue(geometry, 20), 0.2));
  const dice: StageDie[] = [{ anim, sides: 20 }];

  const gl = context.getContext('webgl2')!;
  const shown = canvas.getContext('2d')!;
  let draws = 0;
  const drawElements = gl.drawElements.bind(gl);
  const drawArrays = gl.drawArrays.bind(gl);
  gl.drawElements = (...args): void => { draws++; drawElements(...args); };
  gl.drawArrays = (...args): void => { draws++; drawArrays(...args); };

  const frame = (): Frame => {
    draws = 0;
    renderer.render(dice, 1, null);
    return { draws, pixels: new Uint8Array(shown.getImageData(0, 0, WIDTH, HEIGHT).data) };
  };
  return { renderer, dice, frame, resize };
}

function shadowed(pixels: Uint8Array): number {
  let count = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) count++;
  return count;
}

describe('the dice shadow', () => {
  it('is not drawn again for dice that lie still, and the picture stays the same', async () => {
    await loadDiceArtwork();
    const { frame, resize } = stageWithRestingDie();
    frame();
    frame();
    const still = frame();
    resize();
    const redrawn = frame();

    expect(shadowed(still.pixels)).toBeGreaterThan(1000);
    expect(still.draws).toBeLessThan(redrawn.draws);
    expect(still.pixels).toEqual(redrawn.pixels);
  });

  it('follows a die that moves', async () => {
    await loadDiceArtwork();
    const { frame, dice } = stageWithRestingDie();
    frame();
    frame();
    const before = frame();

    const anim = dice[0]!.anim;
    anim.p = [anim.p[0] + 1.5, anim.p[1], anim.p[2]];
    const moved = frame();
    const after = frame();
    const settled = frame();

    expect(moved.draws).toBeGreaterThan(before.draws);
    expect(after.draws).toBe(moved.draws);
    expect(settled.draws).toBe(before.draws);
    expect(settled.pixels).toEqual(after.pixels);
    expect(settled.pixels).not.toEqual(before.pixels);
  });

  it('tells when the stage is still', async () => {
    await loadDiceArtwork();
    const { renderer, dice, frame } = stageWithRestingDie();
    frame();
    expect(renderer.isStill()).toBe(true);

    // A landing throws sparks, and the stage is still again once they are out.
    dice[0]!.anim.impact = { kind: 'settle', strength: 1, at: [0, 0, 0] };
    frame();
    dice[0]!.anim.impact = null;
    expect(renderer.isStill()).toBe(false);
    // The renderer's clock counts a frame as a twentieth of a second at most.
    for (let i = 0; i < 24; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      frame();
    }
    expect(renderer.isStill()).toBe(true);
  });
});
