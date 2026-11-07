import { describe, expect, it } from 'vitest';
import { pageCardWidth, PANEL_SETTLE_MS, SettledPanelWidth } from '../../../../src/app/online/gm/book/settledPanelWidth.ts';

/** A panel whose width the test sets, read on a clock the test moves. */
function panel(first: number | undefined): { width: number | undefined; at: number; readonly settled: SettledPanelWidth } {
  const state = { width: first, at: 0, settled: null as unknown as SettledPanelWidth };
  state.settled = new SettledPanelWidth(() => state.width, () => state.at);
  return state;
}

describe('the panel width the players\' statblocks are drawn at', () => {
  it('takes the first width at once and a width that changes nothing on the pages never', () => {
    const gm = panel(700);
    expect(gm.settled.get()).toBe(700);
    // 700 and 900 both give the pages the one-column card at its widest.
    expect(pageCardWidth(700)).toBe(pageCardWidth(900));
    gm.width = 900;
    for (gm.at = 0; gm.at <= 10_000; gm.at += 400) expect(gm.settled.get()).toBe(700);
  });

  it('takes a width that changes the pages\' card only once it has held', () => {
    const gm = panel(700);
    gm.settled.get();
    gm.width = 500;
    expect(pageCardWidth(500)).not.toBe(pageCardWidth(700));
    for (gm.at = 0; gm.at < PANEL_SETTLE_MS; gm.at += 400) expect(gm.settled.get()).toBe(700);
    gm.at = PANEL_SETTLE_MS;
    expect(gm.settled.get()).toBe(500);
  });

  it('draws nothing anew for a width that flips back and forth faster than it settles', () => {
    const gm = panel(700);
    gm.settled.get();
    for (gm.at = 0; gm.at < 20_000; gm.at += 400) {
      gm.width = Math.floor(gm.at / 1_500) % 2 === 0 ? 500 : 700;
      expect(gm.settled.get()).toBe(700);
    }
  });

  it('keeps what it has while no width can be read', () => {
    const gm = panel(undefined);
    expect(gm.settled.get()).toBeUndefined();
    gm.width = 600;
    expect(gm.settled.get()).toBe(600);
    gm.width = undefined;
    expect(gm.settled.get()).toBe(600);
  });
});
