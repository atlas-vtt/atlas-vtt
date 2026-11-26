import { describe, expect, it } from 'vitest';
import { penStroke, selectionHarness, tokenSprite, type ScreenPoint } from '../helpers/selectionManagerHarness';

/**
 * A U-shaped lasso from (50, 50) to (350, 350) whose notch, x 150 to 250 and
 * y 50 to 250, lies inside its bounding box but outside the lasso.
 */
const U_FROM: ScreenPoint = [50, 50];
const U_VIA: ScreenPoint[] = [[150, 50], [150, 250], [250, 250], [250, 50], [350, 50], [350, 350]];
const U_TO: ScreenPoint = [50, 350];

describe('SelectionManager lasso', () => {
  it('selects the tokens inside a concave lasso by their place, and no drawing, which a press selects', () => {
    const { store, drag } = selectionHarness({
      selectionMode: 'lasso',
      tokens: { goblin: tokenSprite(100, 300, true), sentry: tokenSprite(200, 150, true) },
      // This stroke begins in the notch, outside the lasso, and runs into it; the other lies in the notch whole.
      drawings: { scrawl: penStroke('scrawl', [{ x: 170, y: 230 }, { x: 290, y: 330 }]), outside: penStroke('outside', [{ x: 170, y: 100 }, { x: 230, y: 200 }]) },
    });

    drag(U_FROM, U_TO, U_VIA);

    expect(store.getState().selectedIds).toEqual(['goblin']);
  });
});
