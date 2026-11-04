import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { penStroke, selectionHarness, tokenSprite, type ScreenPoint } from '../helpers/selectionManagerHarness';

/** A fog sprite as the fog renderer draws one: a `Graphics` left at the origin, its shape drawn in world coordinates. */
function fogSprite(x: number, y: number, width: number, height: number): Graphics {
  return new Graphics().rect(x, y, width, height).fill(0xffffff);
}

/**
 * A U-shaped lasso from (50, 50) to (350, 350) whose notch, x 150 to 250 and
 * y 50 to 250, lies inside its bounding box but outside the lasso.
 */
const U_FROM: ScreenPoint = [50, 50];
const U_VIA: ScreenPoint[] = [[150, 50], [150, 250], [250, 250], [250, 50], [350, 50], [350, 350]];
const U_TO: ScreenPoint = [50, 350];

describe('SelectionManager lasso', () => {
  it('selects what lies inside a concave lasso, by token place, drawing box centre and fog bounds centre', () => {
    const mist = fogSprite(280, 100, 40, 40);
    const haze = fogSprite(180, 60, 40, 40);
    expect(mist.position.x === 0 && mist.position.y === 0).toBe(true);
    const { store, drag } = selectionHarness({
      selectionMode: 'lasso',
      tokens: { goblin: tokenSprite(100, 300, true), sentry: tokenSprite(200, 150, true) },
      // The box of this stroke runs from (169, 229) in the notch to (291, 331); its centre (230, 280) lies inside.
      drawings: { scrawl: penStroke('scrawl', [{ x: 170, y: 230 }, { x: 290, y: 330 }]) },
      fog: { mist, haze },
    });

    drag(U_FROM, U_TO, U_VIA);

    expect(store.getState().selectedIds).toEqual(['goblin', 'scrawl', 'mist']);
  });
});
