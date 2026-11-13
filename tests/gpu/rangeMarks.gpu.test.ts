import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { NO_MOVEMENT_RULES } from '../../src/app/measure/movementRules';
import { differingIn, differingPixels, playerViewScenes, samePixels, SIZE, type PlayerViewScene } from '../helpers/playerViewScene';

const { scene } = playerViewScenes();
/** Hero and goblin on cell centres of one row, three cells apart. */
const HERO = { id: 'hero', x: 180, y: 60 };
const GOBLIN = { id: 'goblin', x: 60, y: 60 };
const BANDED: MeasurementSettings = {
  mode: 'abstract', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', coneAngle: 90,
  rangeBands: [{ name: 'Melee', maxSquares: 1 }, { name: 'Close', maxSquares: 2 }, { name: 'Far', maxSquares: 3 }],
};
/** Where pictures go when `VITE_RANGE_MARKS_OUT` asks for them. */
const OUT = import.meta.env.VITE_RANGE_MARKS_OUT as string | undefined;

async function save(name: string, pixels: Uint8ClampedArray): Promise<void> {
  if (!OUT) return;
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), SIZE, SIZE), 0, 0);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  await commands.writeFile(`${OUT}/${name}.png`, btoa(binary), 'base64');
}

/** Two seen tokens on a map that measures in bands, the hero selected and the measure tool in hand. */
async function ranged(): Promise<PlayerViewScene> {
  const s = await scene();
  await s.add(HERO, GOBLIN);
  s.measure.measurementSettingsProvider = () => BANDED;
  s.measure.rangeSources = {
    tokenAt: (x, y) => s.tokens.hitTestTokens(x, y),
    movement: { rules: () => NO_MOVEMENT_RULES, speedOf: () => null, prepare: () => undefined },
  };
  s.store.getState().setSelection(['hero']);
  s.store.getState().setActiveTool('measure');
  await s.settle();
  return s;
}

/** A rectangle of the picture: x0, y0, x1, y1. */
type Region = readonly [number, number, number, number];
/** Between the two tokens, where the check's line and label stand, short of the selected hero's resize handle. */
const BETWEEN: Region = [84, 20, 134, 70];

/**
 * The canvas shows the players' view in turn (session view, then the peek) and must show nothing
 * of the marks: `region`, where they stand clear of the tokens and the selected token's own UI,
 * is as the players' `frame` has it. Afterwards the canvas is the GM's `gm` again.
 */
function expectHiddenFromPlayersOnCanvas(s: PlayerViewScene, frame: Uint8ClampedArray, gm: Uint8ClampedArray, region: Region): void {
  expect(differingIn(gm, frame, ...region)).toBeGreaterThan(100);
  s.store.getState().setGMView(false);
  expect(differingIn(s.canvas(), frame, ...region)).toBe(0);
  s.store.getState().setGMView(true);
  expect(samePixels(s.canvas(), gm)).toBe(true);
  s.peek(true);
  expect(differingIn(s.canvas(), frame, ...region)).toBe(0);
  s.peek(false);
  expect(samePixels(s.canvas(), gm)).toBe(true);
}

describe('the range check', () => {
  it('draws a dashed line and the distance between the two tokens on the GM\'s canvas, and nothing anywhere else', async () => {
    const s = await ranged();
    const before = s.canvas();
    const frame = s.frame();
    const picture = s.thumbnail();
    s.pointer('pointermove', GOBLIN.x + 3, GOBLIN.y - 2);
    const gm = s.canvas();
    await save('range-check', gm);
    // The line runs between the tokens' edges (x 80 to 160), its label stands above its middle.
    expect(differingIn(gm, before, 80, 20, 160, 70)).toBeGreaterThan(300);
    // Neither token is drawn over: the line ends at their edges.
    expect(differingIn(gm, before, 0, 0, 72, SIZE)).toBe(0);
    expect(differingIn(gm, before, 168, 0, SIZE, SIZE)).toBe(0);
    expect(samePixels(s.frame(), frame)).toBe(true);
    expect(samePixels(s.thumbnail(), picture)).toBe(true);
    // The captures leave the GM's canvas as it was.
    expect(samePixels(s.canvas(), gm)).toBe(true);
    // Off the token the check is gone.
    s.pointer('pointermove', 120, 200);
    expect(samePixels(s.canvas(), before)).toBe(true);
  });

  it('is not on the canvas while it shows the players\' view, where no token is hovered', async () => {
    const s = await ranged();
    const frame = s.frame();
    s.pointer('pointermove', GOBLIN.x, GOBLIN.y);
    const gm = s.canvas();
    expectHiddenFromPlayersOnCanvas(s, frame, gm, BETWEEN);
    s.store.getState().setGMView(false);
    s.pointer('pointermove', 120, 200);
    s.pointer('pointermove', GOBLIN.x, GOBLIN.y);
    expect(differingIn(s.canvas(), frame, ...BETWEEN)).toBe(0);
  });
});

describe('the rings of the Ranges mode', () => {
  it('stand around the pressed token on the GM\'s canvas alone: in no players\' frame, picture, session view or peek', async () => {
    const s = await ranged();
    s.store.getState().setMeasureTool({ mode: 'ranges' });
    const before = s.canvas();
    const frame = s.frame();
    const picture = s.thumbnail();
    s.pointer('pointerdown', GOBLIN.x, GOBLIN.y);
    s.pointer('pointerup', GOBLIN.x, GOBLIN.y);
    s.pointer('pointermove', 240, 240);
    const gm = s.canvas();
    await save('range-rings', gm);
    // Two bands end somewhere: squares one and two cells past the goblin's cell (to x 120 and 160).
    expect(differingPixels(gm, before)).toBeGreaterThan(1500);
    expect(differingIn(gm, before, 116, 100, 124, 110)).toBeGreaterThan(8);
    expect(differingIn(gm, before, 156, 100, 164, 110)).toBeGreaterThan(8);
    expect(samePixels(s.frame(), frame)).toBe(true);
    expect(samePixels(s.thumbnail(), picture)).toBe(true);
    expect(samePixels(s.canvas(), gm)).toBe(true);
    expectHiddenFromPlayersOnCanvas(s, frame, gm, [104, 110, 170, 150]);
    // Pressed again, the token loses its rings.
    s.pointer('pointerdown', GOBLIN.x, GOBLIN.y);
    s.pointer('pointerup', GOBLIN.x, GOBLIN.y);
    s.pointer('pointermove', 240, 240);
    expect(samePixels(s.canvas(), before)).toBe(true);
  });
});
