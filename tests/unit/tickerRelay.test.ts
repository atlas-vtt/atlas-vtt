import { Ticker } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TickerRelay, WINDOW_ASLEEP_AFTER_MS } from '../../src/app/pixi/tickerRelay';

/** A started ticker whose window never gives it an animation frame: it steps only when told (`own`) or by the relay. */
function sleepingTicker(): { ticker: Ticker; steps: number[]; own(time: number): void } {
  const ticker = new Ticker();
  ticker.autoStart = false;
  const steps: number[] = [];
  ticker.add(() => steps.push(ticker.lastTime + ticker.elapsedMS));
  ticker.start();
  return { ticker, steps, own: (time) => ticker.update(time) };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TickerRelay', () => {
  it('leaves a ticker alone while its own window steps it', () => {
    const { ticker, steps, own } = sleepingTicker();
    const relay = new TickerRelay([ticker]);
    for (let time = 16; time < 1000; time += 16) {
      own(time);
      relay.frame(time + 4);
    }
    expect(steps.every((time) => time % 16 === 0)).toBe(true);
  });

  it('steps a ticker on every frame once its window has slept, until the window steps it again', () => {
    const { ticker, steps, own } = sleepingTicker();
    const relay = new TickerRelay([ticker]);
    own(100);
    steps.length = 0;

    relay.frame(100 + WINDOW_ASLEEP_AFTER_MS - 10);
    expect(steps).toEqual([]);

    const awake = 100 + WINDOW_ASLEEP_AFTER_MS + 10;
    for (const time of [awake, awake + 16, awake + 32]) relay.frame(time);
    expect(steps).toEqual([awake, awake + 16, awake + 32]);

    // The window shows again: its own frame, which may come earlier on the clock than the relay's last
    own(awake + 30);
    steps.length = 0;
    relay.frame(awake + 48);
    own(awake + 50);
    expect(steps).toEqual([awake + 50]);
  });

  it('never steps a stopped ticker', () => {
    const { ticker, steps } = sleepingTicker();
    ticker.stop();
    new TickerRelay([ticker]).frame(10_000);
    expect(steps).toEqual([]);
  });
});
