import { describe, expect, it } from 'vitest';
import { SpanMeter } from '../../../../src/app/online/marks/SpanMeter.ts';
import { MAX_LASER_SPAN_MS } from '../../../../src/app/online/protocol/index.ts';

describe('SpanMeter', () => {
  it('tells no span before there is a sample to measure from, then the time from the last told sample to the newest', () => {
    const meter = new SpanMeter();
    expect(meter.take()).toBeUndefined();
    meter.moved(100);
    expect(meter.take()).toBeUndefined();
    meter.moved(108);
    meter.moved(133);
    expect(meter.take()).toBe(33);
    expect(meter.take()).toBe(0);
  });

  it('tells whole milliseconds that add up to the time that passed', () => {
    const meter = new SpanMeter();
    meter.moved(0);
    meter.take();
    let told = 0;
    for (let index = 1; index <= 300; index += 1) {
      meter.moved((index * 100) / 3);
      const span = meter.take();
      expect(Number.isInteger(span)).toBe(true);
      told += span ?? 0;
    }
    expect(Math.abs(told - 10000)).toBeLessThanOrEqual(1);
  });

  it('tells no more than the longest span after a long pause, and starts anew once reset', () => {
    const meter = new SpanMeter();
    meter.moved(0);
    meter.take();
    meter.moved(9000);
    expect(meter.take()).toBe(MAX_LASER_SPAN_MS);
    meter.moved(9020);
    expect(meter.take()).toBe(20);
    meter.reset();
    meter.moved(9500);
    expect(meter.take()).toBeUndefined();
    meter.moved(9510);
    expect(meter.take()).toBe(10);
  });
});
