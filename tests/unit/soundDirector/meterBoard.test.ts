// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { faderPosition } from '@/app/react/components/dm-screen/sound/faderScale';
import { MeterBoard, meterShare } from '@/app/react/components/dm-screen/sound/meterBoard';

const levels = (values: Record<string, number>) => (into: Map<string, number>): void => {
  into.clear();
  for (const [strip, level] of Object.entries(values)) into.set(strip, level);
};

const scale = (element: HTMLElement): number => Number(/scaleY\(([\d.]+)\)/.exec(element.style.transform)?.[1] ?? NaN);

describe('drawing levels', () => {
  it('reads a level on the fader\'s own scale', () => {
    expect(meterShare(0)).toBe(0);
    // 0 dB stands where a fader's thumb at 0 dB does (`faderScale`).
    expect(meterShare(1)).toBeCloseTo(faderPosition(0), 5);
    expect(meterShare(1e-5)).toBe(0);
    expect(meterShare(10)).toBe(1);
  });

  it('rises at once and falls at its pace, and leaves alone what did not move', () => {
    const board = new MeterBoard();
    const fill = document.createElement('i');
    board.add(fill, 'music');
    board.draw(levels({ music: 1 }), 0.016);
    expect(scale(fill)).toBeCloseTo(faderPosition(0), 2);
    board.draw(levels({ music: 0 }), 0.2);
    expect(scale(fill)).toBeCloseTo(faderPosition(0) - 0.1, 2);
    fill.style.transform = 'marked';
    board.draw(levels({ music: 1e-9 }), 0);
    expect(fill.style.transform).toBe('marked');
  });

  it('keeps a tile\'s bars from going flat to nothing, each on its own line', () => {
    const board = new MeterBoard();
    const bars = [document.createElement('i'), document.createElement('i')];
    const remove = board.addBars(bars);
    board.draw(levels({}), 10);
    for (const bar of bars) expect(scale(bar)).toBeCloseTo(0.15, 3);
    board.draw(levels({ master: 0.05 }), 0.016);
    expect(scale(bars[0] as HTMLElement)).not.toBeCloseTo(scale(bars[1] as HTMLElement), 2);
    remove();
    (bars[0] as HTMLElement).style.transform = 'gone';
    board.draw(levels({ master: 0.5 }), 0.016);
    expect((bars[0] as HTMLElement).style.transform).toBe('gone');
  });
});
