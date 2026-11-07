import { describe, expect, it, vi } from 'vitest';
import { Container, Ticker } from 'pixi.js';
import { rippleDelays, TokenExit } from '../../src/app/pixi/token-renderer/TokenExit';

describe('TokenExit', () => {
  it('ripples outward from the middle, within the cap', () => {
    const delays = rippleDelays([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }]);
    expect(delays[2]).toBe(0);
    expect(Math.max(...delays)).toBeLessThanOrEqual(0.16);
    expect(rippleDelays([{ x: 5, y: 5 }])).toEqual([0]);
    const many = rippleDelays(Array.from({ length: 300 }, (_, i) => ({ x: i, y: 0 })));
    expect(Math.max(...many)).toBeLessThanOrEqual(0.16 + 1e-9);
  });

  it('frees at once without a ticker, and every leaving token on finishAll', () => {
    const done = vi.fn();
    new TokenExit({ getTicker: () => null, reducedMotion: () => false, requestRender: () => {} }).play([new Container()], done);
    expect(done).toHaveBeenCalledTimes(1);

    const exit = new TokenExit({ getTicker: () => new Ticker(), reducedMotion: () => false, requestRender: () => {} });
    const groups = [new Container(), new Container()];
    const freed = vi.fn();
    exit.play(groups, freed);
    expect(exit.playerViewLayers()).toEqual(groups.map((layer) => ({ layer, visible: false })));
    exit.finishAll();
    expect(freed).toHaveBeenCalledTimes(2);
    expect(exit.playerViewLayers()).toEqual([]);
  });
});
