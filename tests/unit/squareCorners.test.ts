// @vitest-environment jsdom
import { Graphics } from 'pixi.js';
import { afterEach, expect, it, vi } from 'vitest';
import { SQUARE_CORNERS_CLASS, uiCorner, watchSquareCorners } from '../../src/app/pixi/utils/squareCorners';
import { resourceBarFill } from '../../src/app/pixi/resourceBarFill';

afterEach(() => document.body.classList.remove(SQUARE_CORNERS_CLASS));

it('rounds the map\'s UI until corners turn square, and tells the canvas when they do', async () => {
  const changed = vi.fn();
  const stop = watchSquareCorners(document.body, changed);
  expect(uiCorner(6)).toBe(6);
  document.body.classList.add(SQUARE_CORNERS_CLASS);
  await Promise.resolve();
  expect(uiCorner(6)).toBe(0);
  expect(changed).toHaveBeenCalledTimes(1);
  stop();
});

it('fills a resource bar as a plain rectangle while corners are square, even a sliver of one', () => {
  document.body.classList.add(SQUARE_CORNERS_CLASS);
  const graphics = new Graphics();
  const rect = vi.spyOn(graphics, 'rect');
  resourceBarFill(graphics, 0, 0, 3, 10);
  expect(rect).toHaveBeenCalledWith(0, 0, 3, 10);
});
