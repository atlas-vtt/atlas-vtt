import { describe, expect, it, vi } from 'vitest';
import { PlacementHand, type PlacementControls } from '../../src/app/pixi/tokenPlacement/placementHand';

function controls(): PlacementControls & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    keepQueue: (kept) => calls.push(`queue ${kept}`),
    cycle: (steps) => calls.push(`cycle ${steps}`),
    cancel: () => calls.push('cancel'),
  };
}

describe('the hand as the placing strip knows it', () => {
  it('tells its listeners of the count and of one by one, and of nothing that did not change', () => {
    const hand = new PlacementHand();
    const heard = vi.fn();
    const stop = hand.subscribe(heard);
    hand.set(3);
    hand.set(3);
    hand.setOneByOne(true);
    hand.setOneByOne(true);
    expect(heard).toHaveBeenCalledTimes(2);
    expect([hand.size, hand.oneByOne]).toEqual([3, true]);
    stop();
    hand.set(0);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it('hands the strip\'s buttons to the placement under way', () => {
    const hand = new PlacementHand();
    const session = controls();
    hand.bind(session);
    hand.setOneByOne(true);
    hand.cycle(1);
    hand.cycle(-1);
    hand.done();
    expect(session.calls).toEqual(['queue false', 'queue true', 'cycle 1', 'cycle -1', 'cancel']);
  });

  it('keeps one by one for the next placement, and does nothing between placements', () => {
    const hand = new PlacementHand();
    hand.setOneByOne(true);
    hand.cycle(1);
    hand.done();
    const next = controls();
    hand.bind(next);
    expect(next.calls).toEqual(['queue true']);
    hand.bind(null);
    hand.done();
    expect(next.calls).toEqual(['queue true']);
  });
});
