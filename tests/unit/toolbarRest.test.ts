import { expect, it } from 'vitest';
import { restingToolbarBox, toolbarMoveDelay, toolbarWillBeHidden } from '../../src/app/react/components/command-palette/toolbarRest';

/** A toolbar 300 × 48 at (100, 900) at rest, caught in its hide: shrunk to 0.97 about its bottom centre and 8 px lower. */
function hidingToolbar(): HTMLElement {
  const scale = 0.97;
  const rest = { left: 100, top: 900, width: 300, height: 48 };
  const left = rest.left + 150 * (1 - scale);
  const top = rest.top + 48 * (1 - scale) + 8;
  return {
    getBoundingClientRect: () => ({ left, top, width: 300 * scale, height: 48 * scale, right: left + 300 * scale, bottom: top + 48 * scale }),
    win: { getComputedStyle: () => ({ scale: String(scale), translate: '0px 8px', transformOrigin: '150px 48px', visibility: 'visible' }) },
  } as unknown as HTMLElement;
}

it('reads the box the toolbar rests in while it shrinks and sinks away', () => {
  const box = restingToolbarBox(hidingToolbar());
  expect(box.left).toBeCloseTo(100);
  expect(box.top).toBeCloseTo(900);
  expect(box.width).toBeCloseTo(300);
  expect(box.bottom).toBeCloseTo(948);
});

it('takes a toolbar without running transitions as it stands', () => {
  expect(toolbarWillBeHidden(hidingToolbar())).toBe(false);
  expect(toolbarMoveDelay(hidingToolbar())).toBe(0);
});
